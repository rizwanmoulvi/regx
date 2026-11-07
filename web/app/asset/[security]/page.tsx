"use client"

import { explainError, fetchAsset, wcAddress } from "@regx/shared"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { use, useEffect, useMemo, useState } from "react"
import { type Address, formatUnits } from "viem"
import { useAccount } from "wagmi"
import { Actions, Fills } from "@/components/feed"
import { OrderBook } from "@/components/orderbook"
import { useToast } from "@/components/toast"
import { TradePanel } from "@/components/trade"
import { ArkivTag, Badge, EntityLink, HederaTag, Stat, TxLink, inr, until, utc } from "@/components/ui"
import { arkivClient, noteBySecurity } from "@/lib/config"
import type { NoteDeployment } from "@regx/shared"
import { type LiveOrder, parseAsset, useAccountState, useActions, useBook, useFills, useNoteLive } from "@/lib/data"
import { approveUsdt, payCoupon, settleMaturity, subscribe } from "@/lib/tx"

const usdtOf = (raw: string | bigint) => Number(formatUnits(BigInt(raw), 6))

export default function AssetPage({ params }: { params: Promise<{ security: string }> }) {
  const { security } = use(params)
  const sec = security as Address
  const asset = useQuery({
    queryKey: ["asset", sec],
    queryFn: async () => {
      const row = await fetchAsset(arkivClient, sec)
      return row ? parseAsset(row) : null
    },
    refetchInterval: 20_000,
  })
  const book = useBook(sec)
  const fills = useFills(sec)
  const actions = useActions(sec)
  const note = noteBySecurity(sec)
  const live = useNoteLive(note)
  const { address } = useAccount()
  const me = useAccountState(address, note)
  const [selected, setSelected] = useState<LiveOrder>()

  const selectedLive = useMemo(() => {
    if (!selected || !book.data) return selected
    return [...book.data.asks, ...book.data.bids].find((o) => o.entityKey === selected.entityKey)
  }, [selected, book.data])
  // A fully filled, cancelled or expired order leaves the book: drop the selection with it.
  useEffect(() => {
    if (selected && book.data && !selectedLive) setSelected(undefined)
  }, [selected, selectedLive, book.data])

  const a = asset.data
  if (asset.isLoading) return <div className="panel h-48 animate-pulse" />
  if (!a || !note) return <div className="panel p-6 text-sm">No regx.asset entity on Arkiv for {sec}.</div>

  const days = (a.maturity - Date.now() / 1000) / 86400
  const lastPx = fills.data?.[0]?.price
  const paused = live.data?.paused
  const matured = live.data?.matured

  return (
    <div className="space-y-5">
      <section className="panel p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="num text-2xl font-bold">{a.symbol}</h1>
              <Badge tone={matured ? "muted" : paused ? "warn" : "bid"}>{matured ? "redeemed" : paused ? "paused" : a.status}</Badge>
              <Badge tone="accent">ERC-3643 T-REX</Badge>
              <Badge>Whitechain · USDT</Badge>
            </div>
            <p className="mt-1 text-sm text-muted">{a.name}</p>
            <p className="mt-1 text-xs text-muted">
              {a.meta.obligor} · {a.meta.underlying}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <HederaTag>
              <a className="link" href={wcAddress(a.security)} target="_blank" rel="noreferrer">
                token ↗
              </a>
            </HederaTag>
            <ArkivTag>
              <EntityLink entityKey={a.entityKey} label="asset entity" />
            </ArkivTag>
          </div>
        </div>
        <div className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
          <Stat label="Last price" value={lastPx ? inr(lastPx) : "—"} sub={`face ${inr(a.faceValue)}`} />
          <Stat label="Issue price" value={inr(Number(a.meta.issuePrice ?? 0))} sub="primary subscription" />
          <Stat label="Coupon" value={`${(a.couponBps / 100).toFixed(2)}% of face`} sub={`${note.terms.couponDates.length} payment(s)`} />
          <Stat label="Maturity" value={days > 1 ? `${Math.ceil(days)} days` : until(a.maturity)} sub={utc(a.maturity)} />
          <Stat label="Outstanding" value={`${(live.data?.totalSupply ?? a.totalSupply).toString()} units`} sub={`${live.data?.holders.length ?? Number(a.holders)} holders`} />
          <Stat label="Investor cap" value={`${a.meta.investorCapUnits ?? "—"} units`} sub="ERC-3643 compliance module" />
        </div>
      </section>

      {address && me.data && !me.data.verified && (
        <div className="rounded-xl border border-ask/30 bg-ask-soft px-4 py-3 text-sm">
          <b className="text-ask">You are not a verified investor.</b> You can browse, but you can't subscribe or settle. The T-REX
          token checks your ONCHAINID KYC claim in the ERC-3643 Identity Registry on every mint and transfer.
        </div>
      )}
      {paused && (
        <div className="rounded-xl border border-warn/30 bg-warn-soft px-4 py-3 text-sm text-warn">
          The issuer has paused this note. Transfers are disabled on-chain.
        </div>
      )}

      <Lifecycle n={note} />

      <div className="grid gap-5 lg:grid-cols-[1.35fr_1fr]">
        <OrderBook
          asks={book.data?.asks ?? []}
          bids={book.data?.bids ?? []}
          loading={book.isLoading}
          selected={selected?.entityKey}
          onSelect={setSelected}
        />
        <TradePanel selected={selectedLive} symbol={a.symbol} decimals={a.decimals} note={note} />
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Fills fills={fills.data} symbol={a.symbol} loading={fills.isLoading} />
        <Actions actions={actions.data} loading={actions.isLoading} />
      </div>
    </div>
  )
}

/** Issuance → coupon → maturity timeline, with the action available at each stage. */
function Lifecycle({ n }: { n: NoteDeployment }) {
  const { address } = useAccount()
  const me = useAccountState(address, n)
  const live = useNoteLive(n)
  const toast = useToast()
  const qc = useQueryClient()
  const [units, setUnits] = useState("10")
  const [busy, setBusy] = useState<string>()
  const [, tick] = useState(0)
  useEffect(() => {
    const t = setInterval(() => tick((x) => x + 1), 1000)
    return () => clearInterval(t)
  }, [])

  const now = Date.now() / 1000
  const subEnd = Number(n.terms.subscriptionEnd)
  const maturity = Number(n.terms.maturity)
  const price = usdtOf(n.terms.issuePrice)
  const qty = /^\d+$/.test(units) ? BigInt(units) : 0n
  const cost = (BigInt(n.terms.issuePrice) * qty) as bigint

  async function run(label: string, fn: () => Promise<string>, failTitle = `${label} failed`) {
    setBusy(label)
    try {
      const h = await fn()
      toast({ kind: "ok", title: label, body: <TxLink hash={h} label="View on Whitechain explorer" /> })
      qc.invalidateQueries()
      setTimeout(() => qc.invalidateQueries(), 6000)
    } catch (e) {
      toast({ kind: "err", title: failTitle, body: explainError(e) })
    } finally {
      setBusy(undefined)
    }
  }

  const steps = [
    { label: "Subscription", at: subEnd, done: now >= subEnd, note: `at ${inr(price)} / unit` },
    ...n.terms.couponDates.map((c, i) => ({
      label: `Coupon #${i + 1}`,
      at: Number(c),
      done: Boolean(live.data?.couponPaid[i]),
      note: `${inr(usdtOf(n.terms.couponPerUnit))} / unit`,
    })),
    { label: "Maturity", at: maturity, done: Boolean(live.data?.matured), note: `${inr(usdtOf(n.terms.faceValue))} / unit repaid` },
  ]
  const nextCoupon = n.terms.couponDates.findIndex((c, i) => !live.data?.couponPaid[i])

  return (
    <section className="panel">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-3">
        <h2 className="text-sm font-semibold">Note lifecycle (USDT on Whitechain)</h2>
        {live.data && (
          <span className="text-xs text-muted">
            Issuer USDT {inr(usdtOf(live.data.issuerUsdt), 2)} · next obligation {inr(usdtOf(live.data.obligation.amount), 2)}
          </span>
        )}
      </header>
      <div className="grid gap-4 p-4 lg:grid-cols-[1.3fr_1fr]">
        <ol className="grid grid-cols-1 content-start gap-2 sm:grid-cols-3">
          {steps.map((s) => (
            <li key={s.label} className={`rounded-lg border px-3 py-2 text-sm ${s.done ? "border-bid/40 bg-bid-soft" : now >= s.at ? "border-accent/60" : "border-line"}`}>
              <div className="flex items-center justify-between">
                <span className="font-semibold">{s.label}</span>
                <span className="num text-xs text-muted">{s.done ? "✓ done" : now >= s.at ? "due now" : `in ${until(s.at)}`}</span>
              </div>
              <div className="text-xs text-muted">{s.note}</div>
            </li>
          ))}
        </ol>

        <div className="space-y-2">
          {now < subEnd ? (
            <>
              <div className="flex gap-2">
                <input className="input num" value={units} onChange={(e) => setUnits(e.target.value.replace(/\D/g, ""))} aria-label="Units to subscribe" />
                {me.data && me.data.usdtToNote < cost ? (
                  <button className="btn btn-ghost shrink-0" disabled={!address || !!busy} onClick={() => run("Approved USDT for subscription", () => approveUsdt(n.note), "USDT approval failed")}>
                    Approve USDT
                  </button>
                ) : (
                  <button className="btn btn-primary shrink-0" disabled={!address || !!busy || qty === 0n} onClick={() => run(`Subscribed ${qty} units`, () => subscribe(n, qty), "Subscription rejected")}>
                    {busy?.startsWith("Subscribed") ? "Subscribing…" : "Subscribe"}
                  </button>
                )}
              </div>
              <p className="text-xs text-muted">
                Pay {inr(usdtOf(cost), 4)} to the issuer and receive {qty.toString()} units. Minting checks your ONCHAINID claim and the holding cap.
              </p>
            </>
          ) : nextCoupon >= 0 && now >= Number(n.terms.couponDates[nextCoupon]) ? (
            <button className="btn btn-primary w-full" disabled={!address || !!busy} onClick={() => run(`Coupon #${nextCoupon + 1} paid`, () => payCoupon(n, nextCoupon), "Coupon payment failed")}>
              Pay coupon #{nextCoupon + 1} to all holders
            </button>
          ) : !live.data?.matured && now >= maturity ? (
            <button className="btn btn-primary w-full" disabled={!address || !!busy} onClick={() => run("Maturity settled", () => settleMaturity(n), "Maturity settlement failed")}>
              Settle maturity: repay face value in USDT
            </button>
          ) : (
            <p className="text-sm text-muted">
              {live.data?.matured ? "Fully repaid. All units were redeemed and burned." : "Secondary trading is open until maturity. Use the order book below."}
            </p>
          )}
          <p className="text-[11px] text-muted">
            Coupon and maturity settlement can be triggered by anyone once due. USDT is pulled from the issuer&apos;s on-chain allowance, so a
            missed payment shows up as a public revert, not a quiet bank delay.
          </p>
        </div>
      </div>
    </section>
  )
}
