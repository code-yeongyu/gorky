import { z } from "zod"
import type { AccountTokenRecord, ApiKeyRecord } from "../domain/types"
import { decryptToken, encryptToken } from "../lib/token-crypto"
import type { GorkyStore } from "../store"

const AccountRowSchema = z.object({
  id: z.string(),
  email: z.string(),
  access_token_ciphertext: z.string(),
  refresh_token_ciphertext: z.string(),
  expires_at: z.number(),
  model_ids: z.string(),
  status: z.enum(["active", "refresh_failed", "disabled"]),
  last_used_at: z.number().nullable(),
})

const ApiKeyRowSchema = z.object({
  id: z.string(),
  key_hash: z.string(),
  key_prefix: z.string(),
  name: z.string(),
  allowed_models: z.string(),
  created_at: z.number(),
  last_used_at: z.number().nullable(),
  revoked_at: z.number().nullable(),
  deactivated_at: z.number().nullable(),
})

const ModelIdsSchema = z.array(z.string())

export function createD1Store(db: D1Database, tokenSecret: string): GorkyStore {
  return {
    listAccounts: async () => {
      const result = await db.prepare("SELECT * FROM accounts").all()
      const rows = result.results.map((row) => AccountRowSchema.parse(row))
      return Promise.all(rows.map((row) => accountFromRow(row, tokenSecret)))
    },
    saveAccount: async (account) => {
      const encryptedAccessToken = await encryptToken(tokenSecret, account.accessToken)
      const encryptedRefreshToken = await encryptToken(tokenSecret, account.refreshToken)
      await db
        .prepare(
          `INSERT INTO accounts (
            id, email, principal_type, access_token_ciphertext, refresh_token_ciphertext,
            expires_at, model_ids, status, last_used_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          account.id,
          account.email,
          "User",
          encryptedAccessToken,
          encryptedRefreshToken,
          account.expiresAt,
          JSON.stringify(account.modelIds),
          account.status,
          account.lastUsedAt,
        )
        .run()
    },
    saveRefreshedAccount: async (account) => {
      const encryptedAccessToken = await encryptToken(tokenSecret, account.accessToken)
      const encryptedRefreshToken = await encryptToken(tokenSecret, account.refreshToken)
      await db
        .prepare(
          `UPDATE accounts
           SET access_token_ciphertext = ?, refresh_token_ciphertext = ?, expires_at = ?, status = ?
           WHERE id = ?`,
        )
        .bind(
          encryptedAccessToken,
          encryptedRefreshToken,
          account.expiresAt,
          account.status,
          account.id,
        )
        .run()
    },
    saveApiKey: async (record) => {
      await db
        .prepare(
          `INSERT INTO api_keys (
            id, key_hash, key_prefix, name, allowed_models, created_at,
            last_used_at, revoked_at, deactivated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
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
        .run()
    },
    findApiKeyByHash: async (keyHash) => {
      const row = await db
        .prepare("SELECT * FROM api_keys WHERE key_hash = ?")
        .bind(keyHash)
        .first()
      if (!row) {
        return null
      }
      return apiKeyFromRow(ApiKeyRowSchema.parse(row))
    },
    touchAccount: async (accountId, usedAt) => {
      await db
        .prepare("UPDATE accounts SET last_used_at = ? WHERE id = ?")
        .bind(usedAt, accountId)
        .run()
    },
    touchApiKey: async (keyHash, usedAt) => {
      await db
        .prepare("UPDATE api_keys SET last_used_at = ? WHERE key_hash = ?")
        .bind(usedAt, keyHash)
        .run()
    },
  }
}

async function accountFromRow(
  row: z.infer<typeof AccountRowSchema>,
  tokenSecret: string,
): Promise<AccountTokenRecord> {
  return {
    id: row.id,
    email: row.email,
    accessToken: await decryptToken(tokenSecret, row.access_token_ciphertext),
    refreshToken: await decryptToken(tokenSecret, row.refresh_token_ciphertext),
    expiresAt: row.expires_at,
    modelIds: ModelIdsSchema.parse(JSON.parse(row.model_ids)),
    status: row.status,
    lastUsedAt: row.last_used_at,
  }
}

function apiKeyFromRow(row: z.infer<typeof ApiKeyRowSchema>): ApiKeyRecord {
  return {
    id: row.id,
    keyHash: row.key_hash,
    keyPrefix: row.key_prefix,
    name: row.name,
    allowedModels: ModelIdsSchema.parse(JSON.parse(row.allowed_models)),
    createdAt: row.created_at,
    lastUsedAt: row.last_used_at,
    revokedAt: row.revoked_at,
    deactivatedAt: row.deactivated_at,
  }
}
