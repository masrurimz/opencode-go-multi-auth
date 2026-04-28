import type { GoAccount } from "./types.js"

export function nextIndex(last: number, total: number): number {
  return (last + 1) % total
}

export function hasAccounts(accounts: GoAccount[]): boolean {
  return accounts.some((a) => a.enabled)
}

export class NoEnabledAccounts extends Error {
  constructor() {
    super("no enabled Go accounts configured")
    this.name = "NoEnabledAccounts"
  }
}

export function selectAccount(accounts: GoAccount[], lastIndex: number): { account: GoAccount; index: number } {
  const total = accounts.length
  if (total === 0) throw new NoEnabledAccounts()

  for (let i = 1; i <= total; i++) {
    const idx = (lastIndex + i) % total
    if (accounts[idx].enabled) {
      return { account: accounts[idx], index: idx }
    }
  }

  throw new NoEnabledAccounts()
}
