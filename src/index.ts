import readline from "node:readline"
import type { Plugin } from "@opencode-ai/plugin"
import { loadAccounts, saveAccounts, loadRotationState, saveRotationState } from "./storage.js"
import { selectAccount, hasAccounts } from "./rotate.js"
import { createRotatingFetch } from "./fetch.js"

function ask(q: readline.Interface, question: string): Promise<string> {
  return new Promise((resolve) => q.question(question, resolve))
}

function fmtAccounts(data: ReturnType<typeof loadAccounts>) {
  const lines: string[] = []
  for (let i = 0; i < data.accounts.length; i++) {
    const acct = data.accounts[i]
    const label = acct.label || `Account ${i + 1}`
    const status = acct.enabled ? "enabled" : "disabled"
    const active = i === data.rotationIndex ? " (active)" : ""
    lines.push(`  ${i + 1}. ${label} [${status}]${active}`)
  }
  return lines.join("\n")
}

const plugin: Plugin = async ({ client }) => {
  const authClient = client as any

  return {
    auth: {
      provider: "opencode",
      async loader(getAuth) {
        const data = loadAccounts()
        const state = loadRotationState()

        if (!hasAccounts(data.accounts)) return {}

        const { account, index } = selectAccount(data.accounts, state.lastUsedIndex)
        data.rotationIndex = index
        saveAccounts(data)
        saveRotationState({ lastUsedIndex: index })

        await authClient.auth.set({
          path: { id: "opencode" },
          body: { type: "api", key: account.apiKey },
        })

        const { fetch } = createRotatingFetch(data.accounts, state.lastUsedIndex)

        return {
          apiKey: "",
          async fetch(input: RequestInfo | URL, init?: RequestInit) {
            return fetch(input, init)
          },
        }
      },
      methods: [
        {
          type: "api",
          label: "Add Go Account",
          prompts: [
            { type: "text", key: "apiKey", message: "Go API key from opencode.ai/auth" },
            { type: "text", key: "label", message: "Label for this account (optional)" },
          ],
          async authorize(inputs) {
            const key = inputs?.apiKey?.trim()
            if (!key) return { type: "failed" }

            const data = loadAccounts()
            const label = inputs?.label?.trim() || undefined
            data.accounts.push({
              apiKey: key,
              label,
              addedAt: Date.now(),
              enabled: true,
            })

            if (data.accounts.length === 1) {
              data.rotationIndex = 0
            }

            saveAccounts(data)

            await authClient.auth.set({
              path: { id: "opencode" },
              body: { type: "api", key },
            })

            return { type: "success", key }
          },
        },
        {
          type: "oauth",
          label: "Manage Accounts",
          async authorize() {
            const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
            try {
              const data = loadAccounts()
              if (data.accounts.length === 0) {
                console.log("\nNo Go accounts configured.\n")
              } else {
                console.log("\nConfigured Go accounts:")
                console.log(fmtAccounts(data))
                const answer = await ask(rl, "\nEnter number to remove (or Enter to cancel): ")
                const num = Number.parseInt(answer, 10) - 1
                if (!Number.isNaN(num) && num >= 0 && num < data.accounts.length) {
                  data.accounts.splice(num, 1)
                  if (data.rotationIndex >= data.accounts.length) {
                    data.rotationIndex = Math.max(0, data.accounts.length - 1)
                  }
                  saveAccounts(data)
                  console.log(`Removed account ${num + 1}.\n`)
                }
              }
            } finally {
              rl.close()
            }
            return {
              url: "",
              instructions: "",
              method: "auto" as const,
              callback: () => Promise.resolve({ type: "failed" as const }),
            }
          },
        },
        {
          type: "oauth",
          label: "View Account Status",
          async authorize() {
            const data = loadAccounts()
            if (data.accounts.length === 0) {
              console.log("\nNo Go accounts configured.\n")
            } else {
              console.log("\nGo Account Status:")
              console.log(fmtAccounts(data))
              console.log(`\nRotation position: ${data.rotationIndex + 1} of ${data.accounts.length}`)
              console.log()
            }
            return {
              url: "",
              instructions: "",
              method: "auto" as const,
              callback: () => Promise.resolve({ type: "failed" as const }),
            }
          },
        },
      ],
    },
  }
}

export default plugin
