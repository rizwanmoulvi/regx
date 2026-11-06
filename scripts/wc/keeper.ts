/**
 * RegX keeper for Whitechain: mirrors on-chain events into Arkiv so the market's history is public, queryable data.
 *
 *   RegXDvP.Filled                          → regx.fill
 *   RegXDvP.Cancelled                       → regx.action order_cancel
 *   RegXNote.Subscribed                     → regx.action subscribe   (primary issuance paid in USDT)
 *   RegXNote.CouponSettled / CouponPaid     → regx.action coupon_paid (USDT to holders)
 *   RegXNote.MaturitySettled / Redeemed     → regx.action redeemed    (face value in USDT, units burned)
 *   T-REX Token AddressFrozen / Paused      → regx.action freeze | unfreeze | pause | unpause
 *   T-REX IdentityRegistry IdentityRegistered/Removed → regx.action kyc_grant | kyc_revoke
 *
 * Idempotent (keyed by tx hash + log index), restartable, and anyone can re-run it to reproduce the data.
 *   npm run wc:keeper            follow the chain
 *   npm run wc:keeper -- --once  catch up and exit
 */
import { eq } from "@arkiv-network/sdk/query"
import { addr, dec, u64 } from "@arkiv-network/sdk/schema"
import { existsSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { type Address, type Hex, type Log, formatUnits, parseEventLogs, zeroAddress } from "viem"
import { identityRegistryAbi, regXDvPAbi, regXNoteAbi, tokenAbi } from "../../shared/src/abis/generated"
import { Action, Fill, LIFETIME, toJsonBytes, v } from "../../shared/src/arkiv"
import { ROOT, arkiv, arkivWalletFor, log, sleep } from "../lib/env"
import { requireWc, wc } from "../lib/wc"
import { syncWcAssets } from "./sync-assets"

const STATE = join(ROOT, "scripts", ".wc-keeper-state.json")
const CHUNK = 2000n
const once = process.argv.includes("--once")
const d = requireWc()
const wallet = arkivWalletFor("keeper")
const abi = [...regXDvPAbi, ...regXNoteAbi, ...tokenAbi, ...identityRegistryAbi]
const names: Record<string, string> = Object.fromEntries(Object.entries(d.investors).map(([k, a]) => [a.toLowerCase(), k]))
names[d.deployer.toLowerCase()] = "issuer"
const who = (a: string) => names[a?.toLowerCase()] ?? `${a.slice(0, 6)}…${a.slice(-4)}`
const usdt = (x: bigint) => `${formatUnits(x, 6)} USDT`

const tokenOf = new Map<string, Address>() // note contract or token → token address
for (const n of d.notes) {
  tokenOf.set(n.token.toLowerCase(), n.token)
  tokenOf.set(n.note.toLowerCase(), n.token)
}
const symbolOf = (token: string) => d.notes.find((n) => n.token.toLowerCase() === token.toLowerCase())?.symbol ?? "note"

const ts = new Map<bigint, bigint>()
const timeOf = async (b: bigint) => {
  if (!ts.has(b)) ts.set(b, (await wc.getBlock({ blockNumber: b })).timestamp)
  return ts.get(b)!
}

async function exists(schema: typeof Fill | typeof Action, tx: Hex, logIndex: number) {
  const r = await arkiv.select().from(schema).where(eq("hederaTx", tx)).limit(50).fetch()
  return (r.entities as unknown as Record<string, unknown>[]).some((e) => Number(v<bigint>(e.logIndex)) === logIndex)
}

async function action(l: any, security: Address, kind: string, summary: string, subject?: Address, meta: unknown = {}) {
  if (await exists(Action, l.transactionHash, l.logIndex)) return false
  const { entityKey } = await wallet.createEntity(
    Action,
    {
      security: addr(security),
      kind,
      ...(subject ? { subject: addr(subject) } : {}),
      hederaTx: l.transactionHash, // column name is historical: the venue tx hash (Whitechain here)
      logIndex: u64(BigInt(l.logIndex)),
      timestamp: u64(await timeOf(l.blockNumber)),
      summary,
      meta: toJsonBytes({ chainId: 1874, ...((meta as object) ?? {}) }),
    } as any,
    { expiration: LIFETIME.action() },
  )
  log(`  → regx.action ${kind}: ${summary} [${entityKey.slice(0, 10)}…]`)
  return true
}

async function handle(logs: Log[]) {
  const touched = new Set<Address>()
  for (const ev of parseEventLogs({ abi, logs, strict: false }) as any[]) {
    const src = (ev.address as string).toLowerCase()
    const a = ev.args ?? {}
    if (src === d.dvp.toLowerCase()) {
      if (ev.eventName === "Filled") {
        if (await exists(Fill, ev.transactionHash, ev.logIndex)) continue
        const { entityKey } = await wallet.createEntity(
          Fill,
          {
            orderHash: a.orderHash,
            security: addr(a.security),
            maker: addr(a.maker),
            taker: addr(a.taker),
            side: a.isSell ? "sell" : "buy",
            price: dec(formatUnits(a.price, 6)),
            amount: u64(a.amount),
            cost: dec(formatUnits(a.cost, 6)),
            hederaTx: ev.transactionHash,
            logIndex: u64(BigInt(ev.logIndex)),
            block: u64(ev.blockNumber),
            timestamp: u64(await timeOf(ev.blockNumber)),
          },
          { expiration: LIFETIME.fill() },
        )
        log(`  → regx.fill ${who(a.taker)} ${a.isSell ? "bought" : "sold"} ${a.amount} ${symbolOf(a.security)} for ${usdt(a.cost)} [${entityKey.slice(0, 10)}…]`)
        touched.add(a.security)
      } else if (ev.eventName === "Cancelled") {
        await action(ev, d.notes[d.active].token, "order_cancel", `${who(a.maker)} cancelled order nonce ${a.nonce}`, a.maker)
      }
      continue
    }
    const token = tokenOf.get(src)
    if (token && src !== token.toLowerCase()) {
      // RegXNote lifecycle events
      const sym = symbolOf(token)
      if (ev.eventName === "Subscribed")
        (await action(ev, token, "subscribe", `${who(a.investor)} subscribed ${a.units} ${sym} for ${usdt(a.paid)} (paid to issuer)`, a.investor, { units: String(a.units), paid: String(a.paid) })) && touched.add(token)
      else if (ev.eventName === "CouponSettled")
        (await action(ev, token, "coupon_paid", `Coupon #${Number(a.index) + 1} paid: ${usdt(a.total)} to ${a.holders} holder(s)`, undefined, { index: String(a.index), total: String(a.total) })) && touched.add(token)
      else if (ev.eventName === "MaturitySettled")
        (await action(ev, token, "redeemed", `Matured: ${usdt(a.total)} face value repaid to ${a.holders} holder(s), units burned`, undefined, { total: String(a.total) })) && touched.add(token)
      else if (ev.eventName === "Redeemed")
        await action(ev, token, "redeem_holder", `${who(a.holder)} redeemed ${a.units} ${sym} for ${usdt(a.amount)}`, a.holder)
      else if (ev.eventName === "CouponPaid")
        await action(ev, token, "coupon_holder", `${who(a.holder)} received ${usdt(a.amount)} coupon on ${a.units} ${sym}`, a.holder)
      continue
    }
    if (token) {
      // T-REX token events
      if (ev.eventName === "AddressFrozen")
        (await action(ev, token, a._isFrozen ? "freeze" : "unfreeze", `Issuer ${a._isFrozen ? "froze" : "unfroze"} ${who(a._userAddress)}`, a._userAddress)) && touched.add(token)
      else if (ev.eventName === "Paused" || ev.eventName === "Unpaused")
        (await action(ev, token, ev.eventName.toLowerCase(), `Issuer ${ev.eventName.toLowerCase()} ${symbolOf(token)}`)) && touched.add(token)
      else if (ev.eventName === "Transfer" && a.from === zeroAddress) touched.add(token)
      continue
    }
    if (src === d.trex.identityRegistry.toLowerCase()) {
      const sec = d.notes[d.active].token
      if (ev.eventName === "IdentityRegistered")
        await action(ev, sec, "kyc_grant", `${who(a.investorAddress)} verified: ONCHAINID ${String(a.identity).slice(0, 10)}… with KYC claim`, a.investorAddress)
      else if (ev.eventName === "IdentityRemoved") await action(ev, sec, "kyc_revoke", `${who(a.investorAddress)} identity removed`, a.investorAddress)
    }
  }
  for (const t of touched) await syncWcAssets(t).catch((e) => log(`  ! sync failed: ${e.message}`))
}

async function main() {
  const s = existsSync(STATE) ? JSON.parse(readFileSync(STATE, "utf8")) : undefined
  let from = s ? BigInt(s.lastBlock) + 1n : BigInt((d as any).startBlock ?? 0)
  const addresses = [d.dvp, d.trex.identityRegistry, ...d.notes.flatMap((n) => [n.token, n.note])] as Address[]
  log(`RegX Whitechain keeper: writer ${wallet.account.address}, from block ${from}`)
  for (;;) {
    const head = await wc.getBlockNumber()
    while (from <= head) {
      const to = from + CHUNK - 1n > head ? head : from + CHUNK - 1n
      const logs = await wc.getLogs({ address: addresses, fromBlock: from, toBlock: to })
      if (logs.length) log(`blocks ${from}–${to}: ${logs.length} logs`)
      await handle(logs as Log[])
      writeFileSync(STATE, JSON.stringify({ lastBlock: to.toString() }))
      from = to + 1n
    }
    if (once) break
    await sleep(3000)
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
