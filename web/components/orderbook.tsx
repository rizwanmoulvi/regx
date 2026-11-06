"use client"

import { formatUnits } from "viem"
import type { LiveOrder } from "@/lib/data"
import { Addr, ArkivTag, EntityLink, Empty, inr, until } from "./ui"

export function OrderBook({
  asks,
  bids,
  selected,
  onSelect,
  loading,
}: {
  asks: LiveOrder[]
  bids: LiveOrder[]
  selected?: string
  onSelect: (o: LiveOrder) => void
  loading?: boolean
}) {
  const bestAsk = asks[0] ? Number(formatUnits(asks[0].order.price, 6)) : undefined
  const bestBid = bids[0] ? Number(formatUnits(bids[0].order.price, 6)) : undefined
  const maxQty = Math.max(1, ...[...asks, ...bids].map((o) => Number(o.remaining)))
  return (
    <div className="panel overflow-hidden">
      <header className="flex items-center justify-between border-b border-line px-4 py-3">
        <h2 className="text-sm font-semibold">Order book</h2>
        <ArkivTag>regx.order · live from Arkiv</ArkivTag>
      </header>
      <div className="grid grid-cols-[1fr_auto_auto_auto] gap-x-4 px-4 pt-2 text-[11px] font-semibold uppercase tracking-wider text-muted">
        <span>Price</span>
        <span className="text-right">Qty left</span>
        <span className="text-right">Maker</span>
        <span className="text-right">Expires</span>
      </div>
      {loading && <div className="m-4 h-40 animate-pulse rounded-lg bg-panel-2" />}
      {!loading && (
        <>
          <div className="flex flex-col-reverse">
            {asks.length === 0 && <Empty>No asks</Empty>}
            {asks.map((o) => (
              <Row key={o.entityKey} o={o} side="ask" max={maxQty} selected={selected === o.entityKey} onSelect={onSelect} />
            ))}
          </div>
          <div className="num flex items-center justify-between border-y border-line bg-panel-2 px-4 py-2 text-xs">
            <span className="text-muted">Spread</span>
            <span className="font-semibold">{bestAsk && bestBid ? inr(bestAsk - bestBid) : "—"}</span>
          </div>
          <div>
            {bids.length === 0 && <Empty>No bids</Empty>}
            {bids.map((o) => (
              <Row key={o.entityKey} o={o} side="bid" max={maxQty} selected={selected === o.entityKey} onSelect={onSelect} />
            ))}
          </div>
        </>
      )}
      <p className="border-t border-line px-4 py-2 text-[11px] text-muted">
        Signed orders are Arkiv entities owned by their makers. Remaining size is read from the DvP contract on Hedera. Expired orders
        drop out of Arkiv on their own.
      </p>
    </div>
  )
}

function Row({ o, side, max, selected, onSelect }: { o: LiveOrder; side: "ask" | "bid"; max: number; selected: boolean; onSelect: (o: LiveOrder) => void }) {
  const blocked = o.makerFrozen || !o.makerVerified
  const pct = (Number(o.remaining) / max) * 100
  return (
    <button
      onClick={() => onSelect(o)}
      className={`relative grid w-full grid-cols-[1fr_auto_auto_auto] items-center gap-x-4 px-4 py-1.5 text-left text-sm hover:bg-panel-2 ${selected ? "bg-panel-2 ring-1 ring-inset ring-accent" : ""} ${blocked ? "opacity-50" : ""}`}
      title={blocked ? (o.makerFrozen ? "Maker is frozen by the issuer: unfillable" : "Maker not verified: unfillable") : "Select to trade"}
    >
      <span
        className="absolute inset-y-0 right-0"
        style={{ width: `${pct}%`, background: side === "ask" ? "var(--ask-soft)" : "var(--bid-soft)" }}
        aria-hidden
      />
      <span className={`num relative font-semibold ${side === "ask" ? "text-ask" : "text-bid"}`}>
        {inr(Number(formatUnits(o.order.price, 6)))}
        {o.makerFrozen && <span className="ml-2 text-[10px] font-bold text-warn">FROZEN</span>}
      </span>
      <span className="num relative text-right">
        {o.remaining.toString()}
        <span className="text-muted">/{o.order.amount.toString()}</span>
      </span>
      <span className="relative text-right text-xs">
        <Addr a={o.order.maker} />
      </span>
      <span className="num relative text-right text-xs text-muted">{until(Number(o.order.expiry))}</span>
    </button>
  )
}

export function OrderDetail({ o }: { o: LiveOrder }) {
  return (
    <div className="space-y-1 rounded-lg bg-panel-2 p-3 text-xs">
      <div className="flex justify-between">
        <span className="text-muted">Arkiv entity</span>
        <EntityLink entityKey={o.entityKey} />
      </div>
      <div className="flex justify-between">
        <span className="text-muted">Order hash (EIP-712)</span>
        <span className="num">{o.orderHash.slice(0, 10)}…{o.orderHash.slice(-6)}</span>
      </div>
      <div className="flex justify-between">
        <span className="text-muted">Entity owner</span>
        <Addr a={o.owner} chain="arkiv" />
      </div>
      <div className="flex justify-between">
        <span className="text-muted">Arkiv expiry (block)</span>
        <span className="num">{o.expiresAt?.toString() ?? "—"}</span>
      </div>
    </div>
  )
}
