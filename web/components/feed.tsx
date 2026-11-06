"use client"

import type { ActionView, FillView } from "@/lib/data"
import { Addr, ArkivTag, Badge, EntityLink, Empty, TxLink, ago, inr } from "./ui"

const KIND: Record<string, { label: string; tone: "bid" | "ask" | "accent" | "warn" | "muted" }> = {
  coupon_set: { label: "Coupon set", tone: "accent" },
  coupon_paid: { label: "Coupon paid", tone: "bid" },
  freeze: { label: "Freeze", tone: "ask" },
  unfreeze: { label: "Unfreeze", tone: "bid" },
  pause: { label: "Pause", tone: "warn" },
  unpause: { label: "Unpause", tone: "bid" },
  mint: { label: "Issuance", tone: "accent" },
  kyc_grant: { label: "KYC granted", tone: "bid" },
  kyc_revoke: { label: "KYC revoked", tone: "ask" },
  order_cancel: { label: "Cancel", tone: "muted" },
}

export function Fills({ fills, symbol, loading }: { fills?: FillView[]; symbol?: string; loading?: boolean }) {
  return (
    <div className="panel">
      <header className="flex items-center justify-between border-b border-line px-4 py-3">
        <h2 className="text-sm font-semibold">Trades</h2>
        <ArkivTag>regx.fill</ArkivTag>
      </header>
      {loading && <div className="m-4 h-24 animate-pulse rounded-lg bg-panel-2" />}
      {fills?.length === 0 && <Empty>No trades yet</Empty>}
      <ul className="divide-y divide-line">
        {fills?.map((f) => (
          <li key={f.entityKey} className="grid grid-cols-[auto_1fr_auto] items-center gap-3 px-4 py-2 text-sm">
            <span className={`num font-semibold ${f.side === "sell" ? "text-bid" : "text-ask"}`}>{inr(f.price)}</span>
            <span className="text-xs text-muted">
              <span className="num text-ink">{f.amount.toString()}</span> {symbol ?? "units"} · <Addr a={f.taker} />{" "}
              {f.side === "sell" ? "bought from" : "sold to"} <Addr a={f.maker} /> · {ago(f.timestamp)}
            </span>
            <span className="flex flex-col items-end gap-0.5">
              <TxLink hash={f.hederaTx} label="HashScan" />
              <EntityLink entityKey={f.entityKey} label="Arkiv" />
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}

export function Actions({ actions, loading }: { actions?: ActionView[]; loading?: boolean }) {
  return (
    <div className="panel">
      <header className="flex items-center justify-between border-b border-line px-4 py-3">
        <h2 className="text-sm font-semibold">Corporate actions & compliance events</h2>
        <ArkivTag>regx.action</ArkivTag>
      </header>
      {loading && <div className="m-4 h-24 animate-pulse rounded-lg bg-panel-2" />}
      {actions?.length === 0 && <Empty>No events yet</Empty>}
      <ul className="divide-y divide-line">
        {actions?.map((a) => {
          const k = KIND[a.kind] ?? { label: a.kind, tone: "muted" as const }
          return (
            <li key={a.entityKey} className="grid grid-cols-[auto_1fr_auto] items-center gap-3 px-4 py-2 text-sm">
              <Badge tone={k.tone}>{k.label}</Badge>
              <span className="text-xs">
                {a.summary} <span className="text-muted">· {ago(a.timestamp)}</span>
              </span>
              <span className="flex flex-col items-end gap-0.5">
                <TxLink hash={a.hederaTx} label="HashScan" />
                <EntityLink entityKey={a.entityKey} label="Arkiv" />
              </span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
