import type { GoAccount } from "./types.js"
import { selectAccount, NoEnabledAccounts } from "./rotate.js"

export interface RotatingFetchState {
  activeIndex: number | null
  exhausted: Set<number>
}

type FetchFn = typeof globalThis.fetch

export function createRotatingFetch(
  accounts: GoAccount[],
  lastIndex: number,
  baseFetch?: FetchFn,
): { fetch: FetchFn; state: RotatingFetchState } {
  const state: RotatingFetchState = {
    activeIndex: null,
    exhausted: new Set(),
  }

  const fetch: FetchFn = async (input, init) => {
    const useFetch = baseFetch ?? globalThis.fetch

    const pickActive = (): { account: GoAccount; index: number } => {
      if (state.activeIndex !== null && !state.exhausted.has(state.activeIndex)) {
        const acct = accounts[state.activeIndex]
        if (acct && acct.enabled) return { account: acct, index: state.activeIndex }
      }

      const result = selectAccount(accounts, lastIndex)
      state.activeIndex = result.index
      state.exhausted.delete(result.index)
      return result
    }

    // First attempt
    let current = pickActive()

    while (true) {
      const headers = new Headers(init?.headers)
      headers.delete("authorization")
      headers.delete("Authorization")
      headers.set("Authorization", `Bearer ${current.account.apiKey}`)

      const response = await useFetch(input, { ...init, headers })

      if (response.status !== 429) return response

      // Rate limited — mark exhausted, try next
      state.exhausted.add(current.index)

      try {
        current = selectAccount(accounts, current.index)
      } catch (err) {
        if (err instanceof NoEnabledAccounts) {
          return new Response("all Go accounts exhausted", {
            status: 429,
            statusText: "All accounts rate-limited",
          })
        }
        throw err
      }
    }
  }

  return { fetch, state }
}
