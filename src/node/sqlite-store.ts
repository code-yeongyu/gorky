import Database from "better-sqlite3"
import type { AccountTokenRecord, ApiKeyRecord } from "../domain/types"
import { decryptToken, encryptToken } from "../lib/token-crypto"
import type { GorkyStore } from "../store"

type SqliteAccountRow = {
  readonly id: unknown
  readonly email: unknown
  readonly access_token_ciphertext: unknown
  readonly refresh_token_ciphertext: unknown
  readonly expires_at: unknown
  readonly model_ids: unknown
  readonly status: unknown
  readonly last_used_at: unknown
  readonly priority: unknown
}

type SqliteApiKeyRow = {
  readonly id: unknown
  readonly key_hash: unknown
  readonly key_prefix: unknown
  readonly name: unknown
  readonly allowed_models: unknown
  readonly created_at: unknown
  readonly last_used_at: unknown
  readonly revoked_at: unknown
  readonly deactivated_at: unknown
}

export function createSqliteStore(dbPath: string, encryptionSecret: string): GorkyStore {
  const db = new Database(dbPath)
  db.pragma("journal_mode = WAL")
  db.exec(`
    CREATE TABLE IF NOT EXISTS accounts (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL,
      principal_type TEXT NOT NULL,
      access_token_ciphertext TEXT NOT NULL,
      refresh_token_ciphertext TEXT NOT NULL,
      expires_at INTEGER NOT NULL,
      model_ids TEXT NOT NULL,
      status TEXT NOT NULL,
      last_used_at INTEGER,
      priority INTEGER NOT NULL DEFAULT 100
    );
    CREATE TABLE IF NOT EXISTS routing_config (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS api_keys (
      id TEXT PRIMARY KEY,
      key_hash TEXT NOT NULL UNIQUE,
      key_prefix TEXT NOT NULL,
      name TEXT NOT NULL,
      allowed_models TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      last_used_at INTEGER,
      revoked_at INTEGER,
      deactivated_at INTEGER
    );
  `)
  ensureColumn(db, "accounts", "priority", "INTEGER NOT NULL DEFAULT 100")

  async function decryptAccount(row: SqliteAccountRow): Promise<AccountTokenRecord> {
    return {
      id: row.id as string,
      email: row.email as string,
      accessToken: await decryptToken(encryptionSecret, row.access_token_ciphertext as string),
      refreshToken: await decryptToken(encryptionSecret, row.refresh_token_ciphertext as string),
      expiresAt: row.expires_at as number,
      modelIds: JSON.parse(row.model_ids as string) as string[],
      status: row.status as AccountTokenRecord["status"],
      lastUsedAt: row.last_used_at as number | null,
      priority: (row.priority as number | null) ?? 100,
    }
  }

  async function insertAccount(account: AccountTokenRecord): Promise<void> {
    const accessCipher = await encryptToken(encryptionSecret, account.accessToken)
    const refreshCipher = await encryptToken(encryptionSecret, account.refreshToken)
    db.prepare(`
      INSERT OR REPLACE INTO accounts (id, email, principal_type, access_token_ciphertext, refresh_token_ciphertext, expires_at, model_ids, status, last_used_at, priority)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      account.id,
      account.email,
      "User",
      accessCipher,
      refreshCipher,
      account.expiresAt,
      JSON.stringify(account.modelIds),
      account.status,
      account.lastUsedAt,
      account.priority ?? 100,
    )
  }

  return {
    listAccounts: async () => {
      const rows = db.prepare("SELECT * FROM accounts").all() as SqliteAccountRow[]
      return Promise.all(rows.map(decryptAccount))
    },
    findAccountById: async (accountId) => {
      const row = db.prepare("SELECT * FROM accounts WHERE id = ?").get(accountId) as
        | SqliteAccountRow
        | undefined
      return row ? decryptAccount(row) : null
    },
    saveAccount: async (account) => insertAccount(account),
    saveAccounts: async (accounts) => {
      for (const account of accounts) {
        await insertAccount(account)
      }
    },
    saveRefreshedAccount: async (account) => insertAccount(account),
    getRoutingConfig: async () => {
      const row = db.prepare("SELECT value FROM routing_config WHERE key = ?").get("mode") as
        | { readonly value: string }
        | undefined
      if (row?.value === "priority") return { mode: "priority" }
      return { mode: "round_robin" }
    },
    saveRoutingConfig: async (config) => {
      db.prepare("INSERT OR REPLACE INTO routing_config (key, value) VALUES (?, ?)").run(
        "mode",
        config.mode,
      )
    },
    updateAccountPriority: async (accountId, priority) => {
      db.prepare("UPDATE accounts SET priority = ? WHERE id = ?").run(priority, accountId)
      const row = db.prepare("SELECT * FROM accounts WHERE id = ?").get(accountId) as
        | SqliteAccountRow
        | undefined
      return row ? decryptAccount(row) : null
    },
    disableAccount: async (accountId) => {
      db.prepare("UPDATE accounts SET status = ? WHERE id = ?").run("disabled", accountId)
      const row = db.prepare("SELECT * FROM accounts WHERE id = ?").get(accountId) as
        | SqliteAccountRow
        | undefined
      return row ? decryptAccount(row) : null
    },
    enableAccount: async (accountId) => {
      db.prepare("UPDATE accounts SET status = ? WHERE id = ?").run("active", accountId)
      const row = db.prepare("SELECT * FROM accounts WHERE id = ?").get(accountId) as
        | SqliteAccountRow
        | undefined
      return row ? decryptAccount(row) : null
    },
    saveApiKey: async (record) => {
      db.prepare(`
        INSERT INTO api_keys (id, key_hash, key_prefix, name, allowed_models, created_at, last_used_at, revoked_at, deactivated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        record.id,
        record.keyHash,
        record.keyPrefix,
        record.name,
        JSON.stringify(record.allowedModels),
        record.createdAt,
        record.lastUsedAt,
        record.revokedAt,
        record.deactivatedAt,
      )
    },
    listApiKeys: async () => {
      const rows = db.prepare("SELECT * FROM api_keys").all() as SqliteApiKeyRow[]
      return rows.map(apiKeyFromRow)
    },
    findApiKeyByHash: async (keyHash) => {
      const row = db.prepare("SELECT * FROM api_keys WHERE key_hash = ?").get(keyHash) as
        | SqliteApiKeyRow
        | undefined
      return row ? apiKeyFromRow(row) : null
    },
    revokeApiKey: async (keyId, revokedAt) => {
      db.prepare("UPDATE api_keys SET revoked_at = COALESCE(revoked_at, ?) WHERE id = ?").run(
        revokedAt,
        keyId,
      )
      const row = db.prepare("SELECT * FROM api_keys WHERE id = ?").get(keyId) as
        | SqliteApiKeyRow
        | undefined
      return row ? apiKeyFromRow(row) : null
    },
    touchAccount: async (accountId, usedAt) => {
      db.prepare("UPDATE accounts SET last_used_at = ? WHERE id = ?").run(usedAt, accountId)
    },
    touchApiKey: async (keyHash, usedAt) => {
      db.prepare("UPDATE api_keys SET last_used_at = ? WHERE key_hash = ?").run(usedAt, keyHash)
    },
  }
}

function ensureColumn(
  db: Database.Database,
  tableName: string,
  columnName: string,
  ddl: string,
): void {
  const columns = db.prepare(`PRAGMA table_info(${tableName})`).all() as readonly {
    readonly name: string
  }[]
  if (columns.some((column) => column.name === columnName)) return
  db.prepare(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${ddl}`).run()
}

function apiKeyFromRow(row: SqliteApiKeyRow): ApiKeyRecord {
  return {
    id: row.id as string,
    keyHash: row.key_hash as string,
    keyPrefix: row.key_prefix as string,
    name: row.name as string,
    allowedModels: JSON.parse(row.allowed_models as string) as string[],
    createdAt: row.created_at as number,
    lastUsedAt: row.last_used_at as number | null,
    revokedAt: row.revoked_at as number | null,
    deactivatedAt: row.deactivated_at as number | null,
  }
}
