import type { AccountTokenRecord, RoutingConfig } from "./types"

export function selectAccountForModel(
  accounts: readonly AccountTokenRecord[],
  modelId: string,
  routing: RoutingConfig = { mode: "round_robin" },
): AccountTokenRecord | null {
  const eligible = accounts
    .filter((account) => account.status === "active" && account.modelIds.includes(modelId))
    .sort((left, right) => {
      if (routing.mode === "priority") {
        const priorityDelta = accountPriority(left) - accountPriority(right)
        if (priorityDelta !== 0) return priorityDelta
      }
      const leftLastUsed = left.lastUsedAt ?? 0
      const rightLastUsed = right.lastUsedAt ?? 0
      const lastUsedDelta = leftLastUsed - rightLastUsed
      if (lastUsedDelta !== 0) return lastUsedDelta
      return left.id.localeCompare(right.id)
    })

  return eligible[0] ?? null
}

function accountPriority(account: AccountTokenRecord): number {
  return account.priority ?? 100
}
