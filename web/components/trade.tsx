"use client"

import { explainError, explainReason, quoteCost } from "@regx/shared"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { useEffect, useState } from "react"
import { formatUnits } from "viem"
import { useAccount } from "wagmi"
import { type LiveOrder, useAccountState } from "@/lib/data"
import { RevertedOnChain, approveUnits, approveUsdt, checkFill, fillOrder, postOrder } from "@/lib/tx"
import { d } from "@/lib/config"
import { OrderDetail } from "./orderbook"
import { useToast } from "./toast"
import { EntityLink, TxLink, inr } from "./ui"

export function TradePanel({ selected, symbol, decimals }: { selected?: LiveOrder; symbol: string; decimals: number }) {
  const [tab, setTab] = useState<"take" | "make">("take")
  useEffect(() => {
    if (selected) setTab("take")
  }, [selected])
  return (
    <div className="panel">
      <div className="grid grid-cols-2 border-b border-line text-sm font-semibold">
        {(["take", "make"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`py-3 ${tab === t ? "border-b-2 border-accent text-ink" : "text-muted hover:text-ink"}`}
          >
            {t === "take" ? "Fill an order" : "Post an order"}
          </button>
        ))}
      </div>
      <div className="p-4">{tab === "take" ? <Take o={selected} symbol={symbol} decimals={decimals} /> : <Make symbol={symbol} />}</div>
    </div>
  )
}

function useRefreshSoon() {
  const qc = useQueryClient()
  return () => {
    qc.invalidateQueries()
    // the keeper mirrors the Whitechain event to Arkiv a few seconds later
    setTimeout(() => qc.invalidateQueries(), 6_000)
    setTimeout(() => qc.invalidateQueries(), 15_000)
  }
}

function Take({ o, symbol, decimals }: { o?: LiveOrder; symbol: string; decimals: number }) {
  const { address } = useAccount()
  const toast = useToast()
  const refresh = useRefreshSoon()
  const { data: me } = useAccountState(address)
  const [qty, setQty] = useState("10")
  const [busy, setBusy] = useState<string>()

  useEffect(() => {
    if (o) setQty(String(o.remaining < 10n ? o.remaining : 10n))
  }, [o?.entityKey])

  const amount = /^\d+$/.test(qty) ? BigInt(qty) : 0n
  const check = useQuery({
    queryKey: ["checkFill", o?.entityKey, address, qty],
    enabled: Boolean(o && address && amount > 0n),
    queryFn: () => checkFill(o!.order, address!, amount),
    refetchInterval: 8_000,
  })

  if (!o) return <p className="py-8 text-center text-sm text-muted">Select an order in the book to trade against it.</p>
  const takerBuys = o.order.isSell
  const cost = quoteCost(o.order.price, amount, decimals)
  const reason = check.data && !check.data.ok ? explainReason(check.data.reason) : undefined
  const needsTinrApproval = takerBuys && me && me.usdtToDvp < cost
  const needsBondApproval = !takerBuys && me && me.unitsToDvp < amount

  async function run(label: string, fn: () => Promise<string>, ok: (h: string) => string) {
    setBusy(label)
    try {
      const hash = await fn()
      toast({ kind: "ok", title: ok(hash), body: <TxLink hash={hash} label="View on Whitechain explorer" /> })
      refresh()
    } catch (e: any) {
      if (e instanceof RevertedOnChain)
        toast({ kind: "err", title: "Rejected on-chain by ERC-3643 compliance", body: <TxLink hash={e.hash} label="See the reverted tx on the explorer" /> })
      else toast({ kind: "err", title: `${label} failed`, body: explainError(e) })
      refresh()
    } finally {
      setBusy(undefined)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-baseline justify-between">
        <div>
          <div className="label">{takerBuys ? "You buy" : "You sell"}</div>
          <div className="text-lg font-semibold">
            {symbol} @ <span className="num">{inr(Number(formatUnits(o.order.price, 6)))}</span>
          </div>
        </div>
        <span className={`rounded-md px-2 py-1 text-xs font-bold ${takerBuys ? "bg-bid-soft text-bid" : "bg-ask-soft text-ask"}`}>
          {takerBuys ? "BUY" : "SELL"}
        </span>
      </div>

      <label className="block">
        <span className="label">Quantity (max {o.remaining.toString()})</span>
        <div className="mt-1 flex gap-2">
          <input className="input num" inputMode="numeric" value={qty} onChange={(e) => setQty(e.target.value.replace(/\D/g, ""))} />
          <button className="btn btn-ghost" onClick={() => setQty(o.remaining.toString())}>
            Max
          </button>
        </div>
      </label>

      <div className="flex justify-between rounded-lg bg-panel-2 px-3 py-2 text-sm">
        <span className="text-muted">{takerBuys ? "You pay" : "You receive"}</span>
        <span className="num font-semibold">{inr(Number(formatUnits(cost, 6)))}</span>
      </div>

      {!address ? (
        <p className="text-sm text-muted">Connect a wallet to trade.</p>
      ) : (
        <>
          <PreTrade loading={check.isFetching && !check.data} ok={check.data?.ok} reason={reason?.message} verified={me?.verified} />
          {needsTinrApproval && (
            <button className="btn btn-ghost w-full" disabled={!!busy} onClick={() => run("Approve USDT", () => approveUsdt(d.dvp!), () => "USDT approved for DvP")}>
              {busy === "Approve USDT" ? "Approving…" : "1 · Approve USDT"}
            </button>
          )}
          {needsBondApproval && (
            <button className="btn btn-ghost w-full" disabled={!!busy} onClick={() => run(`Approve ${symbol}`, () => approveUnits(), () => `${symbol} approved for DvP`)}>
              {busy?.startsWith("Approve") ? "Approving…" : `1 · Approve ${symbol}`}
            </button>
          )}
          <button
            className="btn btn-primary w-full"
            disabled={!!busy || amount === 0n || !check.data?.ok}
            onClick={() => run("Fill", () => fillOrder({ order: o.order, signature: o.signature, amount }), () => `Settled ${amount} ${symbol} atomically`)}
          >
            {busy === "Fill" ? "Settling on Whitechain…" : `${takerBuys ? "Buy" : "Sell"} ${amount} ${symbol}`}
          </button>
          {check.data && !check.data.ok && (
            <button
              className="w-full text-center text-xs text-muted underline decoration-dotted hover:text-ink"
              disabled={!!busy}
              onClick={() => run("Forced fill", () => fillOrder({ order: o.order, signature: o.signature, amount }, true), () => "Unexpectedly settled")}
            >
              Send anyway and let the chain reject it
            </button>
          )}
        </>
      )}
      <OrderDetail o={o} />
    </div>
  )
}

function PreTrade({ loading, ok, reason, verified }: { loading?: boolean; ok?: boolean; reason?: string; verified?: boolean }) {
  if (loading) return <div className="h-10 animate-pulse rounded-lg bg-panel-2" />
  if (ok === undefined) return null
  return ok ? (
    <div className="rounded-lg bg-bid-soft px-3 py-2 text-sm text-bid">
      ✓ Pre-trade check passed: identity, compliance and balances are OK
    </div>
  ) : (
    <div className="rounded-lg bg-ask-soft px-3 py-2 text-sm text-ask">
      ⛔ {reason}
      {verified === false && <div className="mt-1 text-xs text-muted">Only wallets with a KYC claim in the ERC-3643 Identity Registry can hold this bond.</div>}
    </div>
  )
}

const TTLS = [
  { label: "2 min", s: 120 },
  { label: "1 hour", s: 3600 },
  { label: "1 day", s: 86400 },
  { label: "7 days", s: 7 * 86400 },
]

function Make({ symbol }: { symbol: string }) {
  const { address } = useAccount()
  const toast = useToast()
  const refresh = useRefreshSoon()
  const { data: me } = useAccountState(address)
  const [side, setSide] = useState<"sell" | "buy">("sell")
  const [qty, setQty] = useState("10")
  const [price, setPrice] = useState("0.99")
  const [ttl, setTtl] = useState(86400)
  const [busy, setBusy] = useState<string>()
  const [last, setLast] = useState<{ entityKey: string; txHash: string }>()

  const amount = /^\d+$/.test(qty) ? BigInt(qty) : 0n
  const validPrice = /^\d+(\.\d{1,6})?$/.test(price) && Number(price) > 0
  const warnings: string[] = []
  if (me && !me.verified) warnings.push("Your wallet is not a verified investor. Counterparties won't be able to settle with you.")
  if (me && me.frozen) warnings.push("Your wallet is frozen by the issuer.")
  if (me && side === "sell" && me.units < amount) warnings.push(`You hold ${me.units} ${symbol}.`)
  if (me && me.glm === 0n) warnings.push("You need a little tGLM on Arkiv to publish (hub.arkiv.network/faucet).")
  const needsBond = me && side === "sell" && me.unitsToDvp < amount
  const needsTinr = me && side === "buy" && me.usdtToDvp === 0n

  async function submit() {
    setBusy("Signing order…")
    try {
      const r = await postOrder({ side, amount, price, ttlSeconds: ttl })
      setLast(r)
      toast({ kind: "ok", title: "Order published on Arkiv", body: <EntityLink entityKey={r.entityKey} label="View entity" /> })
      refresh()
    } catch (e) {
      toast({ kind: "err", title: "Could not post order", body: explainError(e) })
    } finally {
      setBusy(undefined)
    }
  }

  async function approve() {
    setBusy("Approving…")
    try {
      const h = side === "sell" ? await approveUnits() : await approveUsdt(d.dvp!)
      toast({ kind: "ok", title: "Approved for DvP", body: <TxLink hash={h} /> })
      refresh()
    } catch (e) {
      toast({ kind: "err", title: "Approval failed", body: explainError(e) })
    } finally {
      setBusy(undefined)
    }
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2">
        {(["sell", "buy"] as const).map((s) => (
          <button
            key={s}
            onClick={() => setSide(s)}
            className={`btn ${side === s ? (s === "sell" ? "bg-ask text-white" : "bg-bid text-white") : "btn-ghost"}`}
          >
            {s === "sell" ? "Sell" : "Buy"}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <label>
          <span className="label">Quantity</span>
          <input className="input num mt-1" value={qty} onChange={(e) => setQty(e.target.value.replace(/\D/g, ""))} />
        </label>
        <label>
          <span className="label">Price (USDT per unit)</span>
          <input className="input num mt-1" value={price} onChange={(e) => setPrice(e.target.value)} />
        </label>
      </div>
      <div>
        <span className="label">Expires in (Arkiv entity lifetime)</span>
        <div className="mt-1 grid grid-cols-4 gap-1">
          {TTLS.map((t) => (
            <button key={t.s} onClick={() => setTtl(t.s)} className={`btn px-1 text-xs ${ttl === t.s ? "btn-primary" : "btn-ghost"}`}>
              {t.label}
            </button>
          ))}
        </div>
      </div>
      <div className="flex justify-between rounded-lg bg-panel-2 px-3 py-2 text-sm">
        <span className="text-muted">Notional</span>
        <span className="num font-semibold">{validPrice ? inr(Number(price) * Number(amount)) : "—"}</span>
      </div>
      {warnings.map((w) => (
        <div key={w} className="rounded-lg bg-warn-soft px-3 py-2 text-xs text-warn">
          {w}
        </div>
      ))}
      {!address ? (
        <p className="text-sm text-muted">Connect a wallet to post orders.</p>
      ) : (
        <>
          {(needsBond || needsTinr) && (
            <button className="btn btn-ghost w-full" disabled={!!busy} onClick={approve}>
              Approve {side === "sell" ? symbol : "USDT"} for settlement
            </button>
          )}
          <button className="btn btn-primary w-full" disabled={!!busy || amount === 0n || !validPrice} onClick={submit}>
            {busy ?? `Sign & publish ${side} order`}
          </button>
          <p className="text-xs text-muted">
            Your wallet signs an EIP-712 order for the Whitechain DvP contract, then publishes it as a <b>regx.order</b> entity on Arkiv. You own
            the entity, it expires with the order, and anyone can read it.
          </p>
        </>
      )}
      {last && (
        <div className="rounded-lg bg-bid-soft px-3 py-2 text-xs">
          Published: <EntityLink entityKey={last.entityKey} />
        </div>
      )}
    </div>
  )
}
