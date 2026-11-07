"use client"

/**
 * Dev-only persona wallet: `?as=alice` (or the switcher in the corner) installs an EIP-1193 provider whose
 * signing requests go to /api/dev-wallet, which signs with the persona's test key from the repo's .env.
 * Used for local testing and demo recordings; inert in production builds and when no persona is chosen.
 */
import { useEffect, useState } from "react"

const KEY = "regx.devWallet"
const DEV = process.env.NODE_ENV === "development"
const PERSONAS = ["issuer", "alice", "bob", "carol"] as const

function readPersona(): string | null {
  if (!DEV || typeof window === "undefined") return null
  try {
    const q = new URLSearchParams(window.location.search).get("as")
    if (q === "off") localStorage.removeItem(KEY)
    else if (q && (PERSONAS as readonly string[]).includes(q)) localStorage.setItem(KEY, q)
    return localStorage.getItem(KEY)
  } catch {
    return null
  }
}

function install(role: string) {
  let chainId = 1874
  let accounts: string[] = []
  const listeners: Record<string, Set<(x: unknown) => void>> = {}
  const emit = (ev: string, x: unknown) => listeners[ev]?.forEach((f) => f(x))
  const ready = fetch("/api/dev-wallet")
    .then((r) => r.json())
    .then((j) => (accounts = j.accounts?.[role] ? [j.accounts[role]] : []))

  const provider = {
    isRegXDevWallet: true,
    async request({ method, params }: { method: string; params?: any[] }) {
      await ready
      switch (method) {
        case "eth_requestAccounts":
        case "eth_accounts":
          return accounts
        case "eth_chainId":
          return `0x${chainId.toString(16)}`
        case "net_version":
          return String(chainId)
        case "wallet_switchEthereumChain": {
          const next = Number(params?.[0]?.chainId)
          if (next !== chainId) {
            chainId = next
            emit("chainChanged", `0x${chainId.toString(16)}`)
          }
          return null
        }
        case "wallet_addEthereumChain":
        case "wallet_requestPermissions":
          return null
        case "wallet_getPermissions":
          return [{ parentCapability: "eth_accounts" }]
      }
      const r = await fetch("/api/dev-wallet", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ role, chainId, method, params }),
      })
      const j = await r.json()
      if (j.error) throw Object.assign(new Error(j.error.message), j.error)
      return j.result
    },
    on(ev: string, f: (x: unknown) => void) {
      ;(listeners[ev] ??= new Set()).add(f)
      return provider
    },
    removeListener(ev: string, f: (x: unknown) => void) {
      listeners[ev]?.delete(f)
      return provider
    },
  }
  Object.defineProperty(window, "ethereum", { value: provider, configurable: true, writable: true })
}

// Install at module load, before wagmi's injected connector looks for window.ethereum.
const persona = readPersona()
if (persona) install(persona)

export function DevWalletSwitcher() {
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  if (!DEV || !mounted) return null
  const pick = (p: string) => {
    try {
      if (p === "off") localStorage.removeItem(KEY)
      else localStorage.setItem(KEY, p)
    } catch {}
    const u = new URL(window.location.href)
    u.searchParams.delete("as")
    window.location.replace(u.toString())
  }
  return (
    <div className="fixed bottom-3 right-3 z-50 flex items-center gap-1 rounded-lg border border-line bg-panel px-2 py-1.5 text-xs shadow-lg">
      <span className="mr-1 text-muted">Test wallet</span>
      {PERSONAS.map((p) => (
        <button
          key={p}
          onClick={() => pick(p)}
          className={`rounded px-2 py-0.5 capitalize ${persona === p ? "bg-accent font-semibold text-accent-ink" : "hover:bg-panel-2"}`}
        >
          {p}
        </button>
      ))}
      <button onClick={() => pick("off")} className={`rounded px-2 py-0.5 ${!persona ? "bg-panel-2 font-semibold" : "hover:bg-panel-2"}`}>
        off
      </button>
    </div>
  )
}
