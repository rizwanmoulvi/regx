"use client"

import { fetchAsset, hashscanAddress } from "@regx/shared"
import { useQuery } from "@tanstack/react-query"
import { use, useMemo, useState } from "react"
import type { Address } from "viem"
import { useAccount } from "wagmi"
import { Actions, Fills } from "@/components/feed"
import { OrderBook } from "@/components/orderbook"
import { TradePanel } from "@/components/trade"
import { ArkivTag, Badge, EntityLink, HederaTag, Stat, inr } from "@/components/ui"
import { arkivClient } from "@/lib/config"
import { type LiveOrder, parseAsset, useAccountState, useActions, useBondLive, useBook, useFills } from "@/lib/data"

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
  const live = useBondLive()
  const { address } = useAccount()
  const me = useAccountState(address)
  const [selected, setSelected] = useState<LiveOrder>()

  const selectedLive = useMemo(() => {
    if (!selected || !book.data) return selected
    return [...book.data.asks, ...book.data.bids].find((o) => o.entityKey === selected.entityKey) ?? selected
  }, [selected, book.data])

  const a = asset.data
  if (asset.isLoading) return <div className="panel h-48 animate-pulse" />
  if (!a) return <div className="panel p-6 text-sm">No regx.asset entity on Arkiv for {sec}.</div>

  const days = Math.max(0, Math.ceil((a.maturity - Date.now() / 1000) / 86400))
  const lastPx = fills.data?.[0]?.price
  const paused = live.data?.paused

  return (
    <div className="space-y-5">
      <section className="panel p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="num text-2xl font-bold">{a.symbol}</h1>
              <Badge tone={paused ? "warn" : "bid"}>{paused ? "paused" : a.status}</Badge>
              <Badge tone="accent">ERC-3643 T-REX</Badge>
              <Badge>ATS bond · Reg S</Badge>
            </div>
            <p className="mt-1 text-sm text-muted">{a.name}</p>
            <p className="mt-1 text-xs text-muted">
              {a.meta.obligor} · {a.meta.underlying}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <HederaTag>
              <a className="link" href={hashscanAddress(a.security)} target="_blank" rel="noreferrer">
                {a.hederaId || "Hedera"} ↗
              </a>
            </HederaTag>
            <ArkivTag>
              <EntityLink entityKey={a.entityKey} label="asset entity" />
            </ArkivTag>
          </div>
        </div>
        <div className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
          <Stat label="Last price" value={lastPx ? inr(lastPx) : "—"} sub={`face ${inr(a.faceValue, 0)}`} />
          <Stat label="Coupon" value={`${(a.couponBps / 100).toFixed(2)}%`} sub="p.a., fixed" />
          <Stat label="Maturity" value={`${days} days`} sub={new Date(a.maturity * 1000).toLocaleDateString("en-IN")} />
          <Stat label="Supply" value={`${(live.data?.totalSupply ?? a.totalSupply).toString()} / ${a.maxSupply}`} sub="units issued" />
          <Stat label="Holders" value={(live.data?.holders.length ?? Number(a.holders)).toString()} sub="ATS security holders" />
          <Stat label="Investor cap" value={`${a.meta.investorCapUnits ?? "—"} units`} sub="ERC-3643 compliance module" />
        </div>
      </section>

      {address && me.data && !me.data.verified && (
        <div className="rounded-xl border border-ask/30 bg-ask-soft px-4 py-3 text-sm">
          <b className="text-ask">You are not a verified investor.</b> You can browse the market, but you can't settle. Settlement
          checks your ONCHAINID KYC claim in the ERC-3643 Identity Registry, enforced by the token on-chain.
        </div>
      )}
      {paused && (
        <div className="rounded-xl border border-warn/30 bg-warn-soft px-4 py-3 text-sm text-warn">
          The issuer has paused this security. Settlement is disabled on-chain.
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-[1.35fr_1fr]">
        <OrderBook
          asks={book.data?.asks ?? []}
          bids={book.data?.bids ?? []}
          loading={book.isLoading}
          selected={selected?.entityKey}
          onSelect={setSelected}
        />
        <TradePanel selected={selectedLive} symbol={a.symbol} decimals={a.decimals} />
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Fills fills={fills.data} symbol={a.symbol} loading={fills.isLoading} />
        <Actions actions={actions.data} loading={actions.isLoading} />
      </div>
    </div>
  )
}
