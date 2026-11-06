"use client"

import Link from "next/link"
import { d } from "@/lib/config"
import { type AssetView, useAssets, useBook, useFills } from "@/lib/data"
import { ArkivTag, Badge, EntityLink, Empty, HederaTag, inr } from "@/components/ui"

export default function Markets() {
  const assets = useAssets()
  return (
    <div className="space-y-8">
      <section className="grid gap-6 pt-2 md:grid-cols-[1.4fr_1fr] md:items-end">
        <div>
          <p className="label text-accent">Invoice-backed bonds · India</p>
          <h1 className="mt-2 text-3xl font-bold leading-tight tracking-tight md:text-4xl">
            Exit your invoice note before maturity, and trade only with verified investors.
          </h1>
          <p className="mt-3 max-w-xl text-muted">
            Bonds are issued with <b className="text-ink">Hedera Asset Tokenization Studio</b> and protected by{" "}
            <b className="text-ink">ERC-3643 (T-REX)</b> identity and compliance. Orders live on{" "}
            <b className="text-ink">Arkiv</b>: public, queryable by anyone, and they expire on their own.
          </p>
        </div>
        <div className="panel grid grid-cols-3 gap-3 p-4 text-center text-xs">
          <Step n="1" t="Sign" s="EIP-712 order" />
          <Step n="2" t="Publish" s="Arkiv entity" />
          <Step n="3" t="Settle" s="Atomic DvP on Hedera" />
        </div>
      </section>

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold">Listed securities</h2>
          <ArkivTag>regx.asset · Arkiv</ArkivTag>
        </div>
        {assets.isLoading && <div className="panel h-40 animate-pulse" />}
        {assets.error && <div className="panel p-4 text-sm text-ask">Could not read Arkiv: {String(assets.error)}</div>}
        {assets.data?.length === 0 && (
          <div className="panel">
            <Empty>No assets on Arkiv yet. Run `npm run deploy`, then `npm run sync:assets`.</Empty>
          </div>
        )}
        <div className="grid gap-4 md:grid-cols-2">
          {assets.data?.map((a) => (
            <AssetCard key={a.entityKey} a={a} />
          ))}
        </div>
      </section>
    </div>
  )
}

function Step({ n, t, s }: { n: string; t: string; s: string }) {
  return (
    <div>
      <div className="num mx-auto mb-1 flex h-7 w-7 items-center justify-center rounded-full bg-panel-2 font-semibold text-accent">{n}</div>
      <div className="font-semibold">{t}</div>
      <div className="text-muted">{s}</div>
    </div>
  )
}

function AssetCard({ a }: { a: AssetView }) {
  const book = useBook(a.security)
  const fills = useFills(a.security, 1)
  const bestAsk = book.data?.asks[0]
  const bestBid = book.data?.bids[0]
  const last = fills.data?.[0]
  const days = Math.max(0, Math.ceil((a.maturity - Date.now() / 1000) / 86400))
  return (
    <Link href={`/asset/${a.security}`} className="panel block p-5 transition hover:border-accent/60">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="num text-lg font-bold">{a.symbol}</span>
            <Badge tone={a.status === "active" ? "bid" : "warn"}>{a.status}</Badge>
            <Badge tone="accent">ERC-3643</Badge>
          </div>
          <div className="mt-1 text-sm text-muted">{a.name}</div>
        </div>
        <div className="text-right">
          <div className="label">Last</div>
          <div className="num text-xl font-semibold">{last ? inr(last.price) : "—"}</div>
        </div>
      </div>
      <div className="mt-4 grid grid-cols-4 gap-3 text-sm">
        <Kv k="Coupon" v={`${(a.couponBps / 100).toFixed(2)}%`} />
        <Kv k="Face" v={inr(a.faceValue, 0)} />
        <Kv k="Maturity" v={`${days}d`} />
        <Kv k="Holders" v={a.holders.toString()} />
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2 text-sm">
        <div className="rounded-lg bg-bid-soft px-3 py-2">
          <div className="label text-bid">Best bid</div>
          <div className="num font-semibold">{bestBid ? `${inr(Number(bestBid.order.price) / 1e6)} × ${bestBid.remaining}` : "—"}</div>
        </div>
        <div className="rounded-lg bg-ask-soft px-3 py-2">
          <div className="label text-ask">Best ask</div>
          <div className="num font-semibold">{bestAsk ? `${inr(Number(bestAsk.order.price) / 1e6)} × ${bestAsk.remaining}` : "—"}</div>
        </div>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-muted">
        <HederaTag>{a.hederaId || "Hedera"}</HederaTag>
        <span>asset entity</span>
        <EntityLink entityKey={a.entityKey} />
        {d.bond?.address?.toLowerCase() === a.security.toLowerCase() && <span className="ml-auto">Issued via ATS factory</span>}
      </div>
    </Link>
  )
}

function Kv({ k, v }: { k: string; v: string }) {
  return (
    <div>
      <div className="label">{k}</div>
      <div className="num font-semibold">{v}</div>
    </div>
  )
}
