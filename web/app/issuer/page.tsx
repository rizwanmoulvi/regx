"use client"

import { explainError, identityRegistryAbi, tokenAbi, wcAddress } from "@regx/shared"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { useState } from "react"
import { type Address, formatUnits } from "viem"
import { useAccount } from "wagmi"
import { useToast } from "@/components/toast"
import { Addr, Badge, HederaTag, Section, TxLink, inr, utc } from "@/components/ui"
import { chainClient, d, nameOf, note } from "@/lib/config"
import { useNoteLive } from "@/lib/data"
import { issuer } from "@/lib/tx"

export default function Issuer() {
  const { address } = useAccount()
  const live = useNoteLive()
  const toast = useToast()
  const qc = useQueryClient()
  const [busy, setBusy] = useState<string>()

  const isAgent = useQuery({
    queryKey: ["isAgent", address],
    enabled: Boolean(address && note),
    queryFn: () => chainClient.readContract({ address: note!.token, abi: tokenAbi, functionName: "isAgent", args: [address!] }),
  })

  const investors = useQuery({
    queryKey: ["investors", live.data?.holders?.length],
    enabled: Boolean(note && d.trex),
    queryFn: async () => {
      const list = Array.from(new Set([...(Object.values(d.investors ?? {}) as Address[]), ...((live.data?.holders ?? []) as Address[])]))
      return Promise.all(
        list.map(async (a) => {
          const [verified, frozen, units] = await Promise.all([
            chainClient.readContract({ address: d.trex!.identityRegistry, abi: identityRegistryAbi, functionName: "isVerified", args: [a] }),
            chainClient.readContract({ address: note!.token, abi: tokenAbi, functionName: "isFrozen", args: [a] }),
            chainClient.readContract({ address: note!.token, abi: tokenAbi, functionName: "balanceOf", args: [a] }),
          ])
          return { a, verified, frozen, units }
        }),
      )
    },
    refetchInterval: 10_000,
  })

  async function run(label: string, fn: () => Promise<string>) {
    setBusy(label)
    try {
      const h = await fn()
      toast({ kind: "ok", title: label, body: <TxLink hash={h} label="Explorer" /> })
      setTimeout(() => qc.invalidateQueries(), 1500)
      setTimeout(() => qc.invalidateQueries(), 8000)
    } catch (e) {
      toast({ kind: "err", title: `${label} failed`, body: explainError(e) })
    } finally {
      setBusy(undefined)
    }
  }

  if (!note || !d.trex) return <div className="panel p-6 text-sm">Not deployed yet.</div>
  const canAct = Boolean(isAgent.data)
  const t = note.terms

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold">Issuer & compliance console</h1>
        <p className="text-sm text-muted">
          Acme Textiles (issuer) and its compliance agent. Rules are enforced by the T-REX token on Whitechain, and the keeper publishes every
          event to the public <b>regx.action</b> feed on Arkiv.
        </p>
      </div>

      {!canAct && (
        <div className="rounded-xl border border-line bg-panel-2 px-4 py-3 text-sm text-muted">
          Read-only: connect the issuer wallet ({nameOf(d.deployer)}) to freeze, unfreeze or pause. Onboarding runs from the CLI:
          <code className="num ml-1 rounded bg-panel px-1">npm run wc:life -- onboard 0x…</code>
        </div>
      )}

      <Section title={`${note.symbol} terms`} right={<HederaTag />}>
        <dl className="grid gap-3 text-sm sm:grid-cols-3">
          <Kv k="Face value" v={inr(Number(formatUnits(BigInt(t.faceValue), 6)))} />
          <Kv k="Issue price" v={inr(Number(formatUnits(BigInt(t.issuePrice), 6)))} />
          <Kv k="Coupon per unit" v={inr(Number(formatUnits(BigInt(t.couponPerUnit), 6)))} />
          <Kv k="Subscription closes" v={utc(t.subscriptionEnd)} />
          <Kv k="Coupon date(s)" v={t.couponDates.map(utc).join(", ")} />
          <Kv k="Maturity" v={utc(t.maturity)} />
          <Kv k="Issuer USDT balance" v={live.data ? inr(Number(formatUnits(live.data.issuerUsdt, 6)), 2) : "…"} />
          <Kv k="Next obligation" v={live.data ? `${inr(Number(formatUnits(live.data.obligation.amount, 6)), 2)}${live.data.obligation.isMaturity ? " (maturity)" : " (coupon)"}` : "…"} />
          <Kv k="Issuer allowance to note" v={live.data ? (live.data.issuerAllowance > 10n ** 30n ? "unlimited" : inr(Number(formatUnits(live.data.issuerAllowance, 6)), 2)) : "…"} />
        </dl>
      </Section>

      <Section title="ERC-3643 configuration">
        <dl className="grid gap-3 text-sm sm:grid-cols-2">
          <Row k="T-REX Token (ERC-3643)" v={note.token} />
          <Row k="RegXNote (lifecycle + compliance module)" v={note.note} />
          <Row k="Modular Compliance (T-REX)" v={note.compliance} />
          <Row k="InvestorCapModule" v={note.investorCap} />
          <Row k="Identity Registry (T-REX)" v={d.trex.identityRegistry} />
          <Row k="Claim Issuer (ONCHAINID)" v={d.trex.claimIssuer} />
          <Row k="Trusted Issuers Registry" v={d.trex.trustedIssuersRegistry} />
          <Row k="RegX DvP settlement" v={d.dvp!} />
          <Row k="Settlement asset: Whitechain test USDT" v={d.usdt!} />
        </dl>
      </Section>

      <Section title="Trading status" right={live.data?.paused ? <Badge tone="warn">paused</Badge> : <Badge tone="bid">live</Badge>}>
        <div className="flex gap-2">
          <button className="btn btn-ghost" disabled={!canAct || !!busy || live.data?.paused} onClick={() => run("Paused trading", issuer.pause)}>
            Pause note
          </button>
          <button className="btn btn-ghost" disabled={!canAct || !!busy || !live.data?.paused} onClick={() => run("Unpaused trading", issuer.unpause)}>
            Unpause
          </button>
        </div>
      </Section>

      <Section title="Investors">
        {investors.isLoading && <div className="h-16 animate-pulse rounded-lg bg-panel-2" />}
        {investors.error && <div className="text-sm text-ask">Could not read investors: {String((investors.error as Error).message).slice(0, 200)}</div>}
        <div className="divide-y divide-line">
          {investors.data?.map((i) => (
            <div key={i.a} className="flex flex-wrap items-center gap-3 py-2 text-sm">
              <span className="w-20 font-semibold">{nameOf(i.a)}</span>
              <Addr a={i.a} />
              {i.verified ? <Badge tone="bid">verified</Badge> : <Badge tone="ask">unverified</Badge>}
              {i.frozen && <Badge tone="warn">frozen</Badge>}
              <span className="num text-xs text-muted">
                {i.units.toString()} {note?.symbol}
              </span>
              <button
                className="btn btn-ghost ml-auto px-2 py-1 text-xs"
                disabled={!canAct || !!busy}
                onClick={() => run(i.frozen ? `Unfroze ${nameOf(i.a)}` : `Froze ${nameOf(i.a)}`, () => issuer.freeze(i.a, !i.frozen))}
              >
                {i.frozen ? "Unfreeze" : "Freeze"}
              </button>
            </div>
          ))}
        </div>
      </Section>
    </div>
  )
}

function Kv({ k, v }: { k: string; v: string }) {
  return (
    <div>
      <dt className="label">{k}</dt>
      <dd className="num mt-0.5 text-sm">{v}</dd>
    </div>
  )
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div>
      <dt className="label">{k}</dt>
      <dd className="num mt-0.5 break-all text-xs">
        <a className="link" href={wcAddress(v)} target="_blank" rel="noreferrer">
          {v} ↗
        </a>
      </dd>
    </div>
  )
}
