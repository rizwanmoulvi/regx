"use client"

import { explainError, fmtMoney } from "@regx/shared"
import { useQueryClient } from "@tanstack/react-query"
import Link from "next/link"
import { useState } from "react"
import { formatUnits } from "viem"
import { useAccount } from "wagmi"
import { useToast } from "@/components/toast"
import { ArkivTag, Badge, EntityLink, Empty, HederaTag, Section, Stat, TxLink, inr, until } from "@/components/ui"
import { d } from "@/lib/config"
import { useAccountState, useMyOrders } from "@/lib/data"
import { approveTinr, cancelOrder, tinrFaucet } from "@/lib/tx"

export default function Portfolio() {
  const { address } = useAccount()
  const st = useAccountState(address)
  const orders = useMyOrders(address)
  const toast = useToast()
  const qc = useQueryClient()
  const [busy, setBusy] = useState<string>()

  if (!address) return <div className="panel p-8 text-center text-sm text-muted">Connect a wallet to see your portfolio.</div>

  async function run(label: string, fn: () => Promise<string>) {
    setBusy(label)
    try {
      const h = await fn()
      toast({ kind: "ok", title: `${label} done`, body: <TxLink hash={h} label="HashScan" /> })
      qc.invalidateQueries()
    } catch (e) {
      toast({ kind: "err", title: `${label} failed`, body: explainError(e) })
    } finally {
      setBusy(undefined)
    }
  }

  async function requestKyc() {
    const r = await fetch("/api/kyc", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ address }) })
    const j = await r.json()
    if (!r.ok) throw new Error(j.error ?? "KYC desk failed")
    return (j.txs?.register ?? "0x") as string
  }

  const s = st.data
  return (
    <div className="space-y-5">
      <Section title="Account" right={<HederaTag>Hedera testnet</HederaTag>}>
        {!s ? (
          <div className="h-16 animate-pulse rounded-lg bg-panel-2" />
        ) : (
          <div className="grid grid-cols-2 gap-5 sm:grid-cols-3 lg:grid-cols-6">
            <Stat
              label="Eligibility"
              value={s.verified ? <span className="text-bid">Verified</span> : <span className="text-ask">Not verified</span>}
              sub="ERC-3643 Identity Registry"
            />
            <Stat label={d.bond?.symbol ?? "Bond"} value={s.units.toString()} sub={s.frozen ? "frozen by issuer" : "units held"} />
            <Stat label="tINR" value={`₹${fmtMoney(s.tinr)}`} sub="test rupee" />
            <Stat label="Mark value" value={inr(Number(s.units) * 1000, 0)} sub="at face" />
            <Stat label="HBAR" value={(Number(s.hbar) / 1e18).toFixed(2)} sub="Hedera gas" />
            <Stat label="tGLM" value={(Number(s.glm) / 1e18).toFixed(3)} sub="Arkiv gas" />
          </div>
        )}
        <div className="mt-5 flex flex-wrap gap-2">
          <button className="btn btn-ghost" disabled={!!busy} onClick={() => run("tINR faucet", tinrFaucet)}>
            Get ₹10 lakh tINR
          </button>
          {s && s.tinrAllowance === 0n && (
            <button className="btn btn-ghost" disabled={!!busy} onClick={() => run("Approve tINR", approveTinr)}>
              Approve tINR for DvP
            </button>
          )}
          <a className="btn btn-ghost" href="https://hub.arkiv.network/faucet" target="_blank" rel="noreferrer">
            Arkiv faucet ↗
          </a>
          <a className="btn btn-ghost" href="https://portal.hedera.com/faucet" target="_blank" rel="noreferrer">
            Hedera faucet ↗
          </a>
        </div>
        {s && !s.verified && process.env.NEXT_PUBLIC_DEMO_KYC === "1" && (
          <div className="mt-4 flex flex-wrap items-center gap-3 rounded-lg bg-warn-soft px-3 py-2 text-sm">
            <span>Judging RegX? The demo KYC desk issues your wallet an ONCHAINID KYC claim and some test gas.</span>
            <button className="btn btn-primary" disabled={!!busy} onClick={() => run("Demo KYC", requestKyc)}>
              {busy === "Demo KYC" ? "Verifying… (~1 min)" : "Get verified"}
            </button>
          </div>
        )}
        {s && !s.verified && (
          <p className="mt-4 text-xs text-muted">
            To become a verified investor, the compliance agent issues a KYC claim to a new ONCHAINID and registers it in the Identity Registry:{" "}
            <code className="num rounded bg-panel-2 px-1">npm run lifecycle -- onboard {address}</code>
          </p>
        )}
      </Section>

      <Section title="My orders" right={<ArkivTag>regx.order · ownedBy(you)</ArkivTag>}>
        {orders.isLoading && <div className="h-16 animate-pulse rounded-lg bg-panel-2" />}
        {orders.data?.length === 0 && (
          <Empty>
            No live orders. <Link className="link" href={d.bond ? `/asset/${d.bond.address}` : "/"}>Post one</Link>
          </Empty>
        )}
        <div className="divide-y divide-line">
          {orders.data?.map((o) => (
            <div key={o.entityKey} className="flex flex-wrap items-center gap-3 py-2 text-sm">
              <Badge tone={o.side === "sell" ? "ask" : "bid"}>{o.side.toUpperCase()}</Badge>
              <span className="num">
                {o.remaining.toString()}/{o.order.amount.toString()} @ {inr(Number(formatUnits(o.order.price, 6)))}
              </span>
              <span className="text-xs text-muted">expires {until(Number(o.order.expiry))}</span>
              {o.remaining === 0n && <Badge>filled / cancelled</Badge>}
              <EntityLink entityKey={o.entityKey} />
              <button
                className="btn btn-ghost ml-auto px-2 py-1 text-xs"
                disabled={!!busy}
                onClick={() => run("Cancel", () => cancelOrder(o))}
                title="Cancels the nonce on the DvP contract, then deletes your Arkiv entity"
              >
                Cancel
              </button>
            </div>
          ))}
        </div>
      </Section>
    </div>
  )
}
