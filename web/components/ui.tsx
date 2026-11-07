"use client"

import { arkivAddressUrl, arkivEntityUrl, wcAddress, wcTx } from "@regx/shared"
import type { ReactNode } from "react"
import { nameOf } from "@/lib/config"

export const usd = (n: number | bigint, frac = 4) =>
  `${Number(n).toLocaleString("en-US", { maximumFractionDigits: frac, minimumFractionDigits: 0 })} USDT`
/** kept for existing call sites */
export const inr = usd

export const ago = (ts: number) => {
  const s = Math.max(0, Math.floor(Date.now() / 1000 - ts))
  if (s < 60) return `${s}s ago`
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  return `${Math.floor(s / 86400)}d ago`
}

export const until = (ts: number) => {
  const s = Math.floor(ts - Date.now() / 1000)
  if (s <= 0) return "expired"
  if (s < 60) return `${s}s`
  if (s < 3600) return `${Math.floor(s / 60)}m`
  if (s < 86400) return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`
  return `${Math.floor(s / 86400)}d ${Math.floor((s % 86400) / 3600)}h`
}

export function Badge({ tone = "muted", children }: { tone?: "bid" | "ask" | "accent" | "warn" | "muted"; children: ReactNode }) {
  const map = {
    bid: "bg-bid-soft text-bid",
    ask: "bg-ask-soft text-ask",
    accent: "text-accent border border-accent/40",
    warn: "bg-warn-soft text-warn",
    muted: "bg-panel-2 text-muted",
  }
  return <span className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-semibold ${map[tone]}`}>{children}</span>
}

export function TxLink({ hash, label }: { hash?: string; label?: string }) {
  if (!hash || hash === "0x") return null
  return (
    <a className="link num text-xs" href={wcTx(hash)} target="_blank" rel="noreferrer">
      {label ?? `${hash.slice(0, 8)}…${hash.slice(-4)}`} ↗
    </a>
  )
}

export function EntityLink({ entityKey, label }: { entityKey?: string; label?: string }) {
  if (!entityKey) return null
  return (
    <a className="link num text-xs" href={arkivEntityUrl(entityKey)} target="_blank" rel="noreferrer" title="View entity on the Arkiv explorer">
      {label ?? `${entityKey.slice(0, 8)}…${entityKey.slice(-4)}`} ↗
    </a>
  )
}

export function Addr({ a, chain = "hedera" }: { a?: string; chain?: "hedera" | "arkiv" }) {
  if (!a) return null
  const href = chain === "hedera" ? wcAddress(a) : arkivAddressUrl(a)
  return (
    <a className="link num text-xs" href={href} target="_blank" rel="noreferrer" title={a}>
      {nameOf(a)}
    </a>
  )
}

export function ArkivTag({ children = "from Arkiv" }: { children?: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-line px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted">
      <span className="h-1.5 w-1.5 rounded-full bg-accent" /> {children}
    </span>
  )
}

export function HederaTag({ children = "Whitechain" }: { children?: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-line px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted">
      <span className="h-1.5 w-1.5 rounded-full bg-bid" /> {children}
    </span>
  )
}

export function Section({ title, right, children, className = "" }: { title: ReactNode; right?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`panel ${className}`}>
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-3">
        <h2 className="text-sm font-semibold">{title}</h2>
        {right}
      </header>
      <div className="p-4">{children}</div>
    </section>
  )
}

export function Stat({ label, value, sub }: { label: string; value: ReactNode; sub?: ReactNode }) {
  return (
    <div>
      <div className="label">{label}</div>
      <div className="num mt-1 text-lg font-semibold">{value}</div>
      {sub && <div className="text-xs text-muted">{sub}</div>}
    </div>
  )
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="py-6 text-center text-sm text-muted">{children}</div>
}

/** Same output on server and client (no locale/timezone drift → no hydration mismatch). */
export const utc = (sec: number | bigint | string) => new Date(Number(sec) * 1000).toISOString().slice(0, 16).replace("T", " ") + " UTC"
