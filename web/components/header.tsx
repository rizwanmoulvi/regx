"use client"

import { fmtMoney } from "@regx/shared"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { useEffect, useState } from "react"
import { useAccount, useConnect, useDisconnect } from "wagmi"
import { nameOf } from "@/lib/config"
import { useAccountState } from "@/lib/data"

const NAV = [
  { href: "/", label: "Markets" },
  { href: "/portfolio", label: "Portfolio" },
  { href: "/activity", label: "Activity" },
  { href: "/issuer", label: "Issuer" },
  { href: "/about", label: "How it works" },
]

export function Header() {
  const path = usePathname()
  return (
    <header className="sticky top-0 z-40 border-b border-line bg-bg/90 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center gap-6 px-4 py-3">
        <Link href="/" className="flex items-center gap-2" aria-label="RegX home">
          <Logo />
          <span className="text-lg font-bold tracking-tight">
            Reg<span className="text-accent">X</span>
          </span>
        </Link>
        <nav className="hidden gap-1 md:flex">
          {NAV.map((n) => {
            const active = n.href === "/" ? path === "/" || path.startsWith("/asset") : path.startsWith(n.href)
            return (
              <Link
                key={n.href}
                href={n.href}
                className={`rounded-md px-3 py-1.5 text-sm font-medium ${active ? "bg-panel-2 text-ink" : "text-muted hover:text-ink"}`}
              >
                {n.label}
              </Link>
            )
          })}
        </nav>
        <div className="ml-auto">
          <Connect />
        </div>
      </div>
      <nav className="flex gap-1 overflow-x-auto px-4 pb-2 md:hidden">
        {NAV.map((n) => (
          <Link key={n.href} href={n.href} className="shrink-0 rounded-md px-2.5 py-1 text-xs font-medium text-muted">
            {n.label}
          </Link>
        ))}
      </nav>
    </header>
  )
}

function Logo() {
  return (
    <svg width="26" height="26" viewBox="0 0 32 32" aria-hidden>
      <rect width="32" height="32" rx="8" fill="var(--accent)" />
      <path d="M9 22V10h6.5a4 4 0 0 1 0 8H9m6-0 7 4" stroke="var(--accent-ink)" strokeWidth="2.6" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function Connect() {
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  const { address, isConnected } = useAccount()
  const { connect, connectors, isPending } = useConnect()
  const { disconnect } = useDisconnect()
  const { data: st } = useAccountState(address)

  if (!mounted) return <div className="h-9 w-32" />
  if (!isConnected)
    return (
      <button className="btn btn-primary" disabled={isPending} onClick={() => connect({ connector: connectors[0] })}>
        {isPending ? "Connecting…" : "Connect wallet"}
      </button>
    )
  return (
    <div className="flex items-center gap-2">
      {st && (
        <div className="hidden items-center gap-2 text-xs sm:flex">
          {st.verified ? (
            <span className="rounded-md bg-bid-soft px-2 py-1 font-semibold text-bid">✓ Verified investor</span>
          ) : (
            <span className="rounded-md bg-ask-soft px-2 py-1 font-semibold text-ask">Not verified</span>
          )}
          <span className="num text-muted">{fmtMoney(st.usdt, 6, 2)} USDT</span>
        </div>
      )}
      <button className="btn btn-ghost num" onClick={() => disconnect()} title="Disconnect">
        {nameOf(address)}
      </button>
    </div>
  )
}
