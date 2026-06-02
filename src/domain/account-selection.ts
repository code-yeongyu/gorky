import type { AccountTokenRecord } from "./types"

export function selectAccountForModel(
  accounts: readonly AccountTokenRecord[],
  modelId: string,
): AccountTokenRecord | null {
  const eligible = accounts
    .filter((account) => account.status === "active" && account.modelIds.includes(modelId))
    .sort((left, right) => {
      const leftLastUsed = left.lastUsedAt ?? 0
      const rightLastUsed = right.lastUsedAt ?? 0
      return leftLastUsed - rightLastUsed
    })

  return eligible[0] ?? null
}
