type AccountRow = {
  id: unknown
  email: unknown
  principal_type: unknown
  access_token_ciphertext: unknown
  refresh_token_ciphertext: unknown
  expires_at: unknown
  model_ids: unknown
  status: unknown
  last_used_at: unknown
}

type ApiKeyRow = {
  id: unknown
  key_hash: unknown
  key_prefix: unknown
  name: unknown
  allowed_models: unknown
  created_at: unknown
  last_used_at: unknown
  revoked_at: unknown
  deactivated_at: unknown
}

export class FakeD1Database {
  readonly accounts = new Map<string, AccountRow>()
  readonly apiKeys = new Map<string, ApiKeyRow>()
  batchCallCount = 0

  prepare(sql: string): FakeD1Statement {
    return new FakeD1Statement(this, sql)
  }

  async batch(statements: readonly FakeD1Statement[]): Promise<readonly unknown[]> {
    this.batchCallCount += 1
    const accountSnapshot = cloneAccountRows(this.accounts)
    const apiKeySnapshot = cloneApiKeyRows(this.apiKeys)
    try {
      const results: unknown[] = []
      for (const statement of statements) {
        results.push(await statement.run())
      }
      return results
    } catch (error) {
      this.accounts.clear()
      for (const [key, value] of accountSnapshot) {
        this.accounts.set(key, value)
      }
      this.apiKeys.clear()
      for (const [key, value] of apiKeySnapshot) {
        this.apiKeys.set(key, value)
      }
      throw error
    }
  }
}

function cloneAccountRows(input: ReadonlyMap<string, AccountRow>): Map<string, AccountRow> {
  return new Map([...input.entries()].map(([key, value]) => [key, { ...value }]))
}

function cloneApiKeyRows(input: ReadonlyMap<string, ApiKeyRow>): Map<string, ApiKeyRow> {
  return new Map([...input.entries()].map(([key, value]) => [key, { ...value }]))
}

class FakeD1Statement {
  private bindings: readonly unknown[] = []

  constructor(
    private readonly db: FakeD1Database,
    private readonly sql: string,
  ) {}

  bind(...values: readonly unknown[]): FakeD1Statement {
    this.bindings = values
    return this
  }

  async run() {
    if (this.sql.includes("INSERT INTO accounts")) {
      this.db.accounts.set(String(this.bindings[0]), {
        id: this.bindings[0],
        email: this.bindings[1],
        principal_type: this.bindings[2],
        access_token_ciphertext: this.bindings[3],
        refresh_token_ciphertext: this.bindings[4],
        expires_at: this.bindings[5],
        model_ids: this.bindings[6],
        status: this.bindings[7],
        last_used_at: this.bindings[8],
      })
    }

    if (this.sql.includes("UPDATE accounts") && this.sql.includes("last_used_at")) {
      const account = this.db.accounts.get(String(this.bindings[1]))
      if (account) {
        account.last_used_at = this.bindings[0]
      }
    }

    if (this.sql.includes("UPDATE accounts") && this.sql.includes("access_token_ciphertext")) {
      const account = this.db.accounts.get(String(this.bindings[4]))
      if (account) {
        account.access_token_ciphertext = this.bindings[0]
        account.refresh_token_ciphertext = this.bindings[1]
        account.expires_at = this.bindings[2]
        account.status = this.bindings[3]
      }
    }

    if (this.sql.includes("UPDATE accounts") && this.sql.includes("status = ?")) {
      const account = this.db.accounts.get(String(this.bindings[1]))
      if (account) {
        account.status = this.bindings[0]
      }
    }

    if (this.sql.includes("INSERT INTO api_keys")) {
      this.db.apiKeys.set(String(this.bindings[1]), {
        id: this.bindings[0],
        key_hash: this.bindings[1],
        key_prefix: this.bindings[2],
        name: this.bindings[3],
        allowed_models: this.bindings[4],
        created_at: this.bindings[5],
        last_used_at: this.bindings[6],
        revoked_at: this.bindings[7],
        deactivated_at: this.bindings[8],
      })
    }

    if (this.sql.includes("UPDATE api_keys") && this.sql.includes("last_used_at")) {
      const apiKey = this.db.apiKeys.get(String(this.bindings[1]))
      if (apiKey) {
        apiKey.last_used_at = this.bindings[0]
      }
    }

    if (this.sql.includes("UPDATE api_keys") && this.sql.includes("revoked_at")) {
      const apiKey = [...this.db.apiKeys.values()].find(
        (candidate) => candidate.id === this.bindings[1],
      )
      if (apiKey) {
        apiKey.revoked_at = apiKey.revoked_at ?? this.bindings[0]
      }
    }

    return { success: true, meta: {}, results: [] }
  }

  async all() {
    if (this.sql.includes("FROM api_keys")) {
      return { success: true, meta: {}, results: [...this.db.apiKeys.values()] }
    }
    return { success: true, meta: {}, results: [...this.db.accounts.values()] }
  }

  async first(): Promise<AccountRow | ApiKeyRow | null> {
    if (this.sql.includes("FROM accounts") && this.sql.includes("WHERE id")) {
      return this.db.accounts.get(String(this.bindings[0])) ?? null
    }
    if (this.sql.includes("FROM api_keys") && this.sql.includes("WHERE id")) {
      return (
        [...this.db.apiKeys.values()].find((candidate) => candidate.id === this.bindings[0]) ?? null
      )
    }
    return this.db.apiKeys.get(String(this.bindings[0])) ?? null
  }
}
