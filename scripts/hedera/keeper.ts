/**
 * RegX keeper: mirrors Hedera events into Arkiv so the market's history is public and queryable.
 *
 *   RegXDvP.Filled              → regx.fill
 *   RegXDvP.Cancelled           → regx.action (order_cancel)
 *   ATS AddressFrozen           → regx.action (freeze / unfreeze)
 *   ATS Paused / Unpaused       → regx.action (pause / unpause)
 *   ATS CouponSet               → regx.action (coupon_set)
 *   ATS Transfer from 0x0       → regx.action (mint)
 *   T-REX IdentityRegistered    → regx.action (kyc_grant)
 *   T-REX IdentityRemoved       → regx.action (kyc_revoke)
 *
 * Idempotent: an event is skipped if an entity with the same Hedera tx hash + log index exists,
 * so the keeper can be restarted or re-run from any block. Anyone can run it and get the same data.
 *
 *   npm run keeper            # follow the chain
 *   npm run keeper -- --once  # catch up and exit
 */
import { eq } from "@arkiv-network/sdk/query"
import { addr, dec, u64 } from "@arkiv-network/sdk/schema"
import { existsSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { type Address, type Hex, type Log, formatUnits, parseEventLogs, zeroAddress } from "viem"
import { atsSecurityAbi } from "../../shared/src/abis/ats"
import { identityRegistryAbi, regXDvPAbi } from "../../shared/src/abis/generated"
import { Action, Fill, LIFETIME, PAY_DECIMALS, toJsonBytes, v } from "../../shared/src/arkiv"
import { syncAssets } from "./arkiv-sync-assets"
import { ROOT, arkiv, arkivWalletFor, hedera, log, requireDeployment, sleep } from "../lib/env"

const STATE_FILE = join(ROOT, "scripts", ".keeper-state.json")
const CHUNK = 900n // Hashio caps eth_getLogs at 1000 blocks
const POLL_MS = 4000
const once = process.argv.includes("--once")

const d = requireDeployment()
const wallet = arkivWalletFor("keeper")
const abi = [...regXDvPAbi, ...atsSecurityAbi, ...identityRegistryAbi]
const names = Object.fromEntries(Object.entries(d.investors ?? {}).map(([k, a]) => [a.toLowerCase(), k]))
const who = (a: string) => names[a.toLowerCase()] ?? `${a.slice(0, 6)}…${a.slice(-4)}`

type State = { lastBlock: string }
const loadState = (): State | undefined =>
  existsSync(STATE_FILE) ? JSON.parse(readFileSync(STATE_FILE, "utf8")) : undefined
const saveState = (s: State) => writeFileSync(STATE_FILE, JSON.stringify(s))

const blockTs = new Map<bigint, bigint>()
async function timestampOf(block: bigint) {
  if (!blockTs.has(block)) blockTs.set(block, (await hedera.getBlock({ blockNumber: block })).timestamp)
  return blockTs.get(block)!
}

async function exists(schema: typeof Fill | typeof Action, tx: Hex, logIndex: number) {
  const r = await arkiv.select().from(schema).where(eq("hederaTx", tx)).limit(20).fetch()
  return (r.entities as unknown as Record<string, unknown>[]).some((e) => Number(v<bigint>(e.logIndex)) === logIndex)
}

async function writeAction(l: Log, kind: string, summary: string, subject?: Address, meta: unknown = {}) {
  const tx = l.transactionHash as Hex
  if (await exists(Action, tx, l.logIndex!)) return false
  const ts = await timestampOf(l.blockNumber!)
  const { entityKey } = await wallet.createEntity(
    Action,
    {
      security: addr(d.bond.address),
      kind,
      ...(subject ? { subject: addr(subject) } : {}),
      hederaTx: tx,
      logIndex: u64(BigInt(l.logIndex!)),
      timestamp: u64(ts),
      summary,
      meta: toJsonBytes(meta),
    } as any,
    { expiration: LIFETIME.action() },
  )
  log(`  → regx.action ${kind}: ${summary}  [${entityKey.slice(0, 10)}…]`)
  return true
}

async function handle(logs: Log[]) {
  let touched = false
  const parsed = parseEventLogs({ abi, logs, strict: false })
  for (const ev of parsed as any[]) {
    const src = (ev.address as string).toLowerCase()
    const a = ev.args ?? {}
    try {
      if (src === d.dvp.toLowerCase() && ev.eventName === "Filled") {
        if (await exists(Fill, ev.transactionHash, ev.logIndex)) continue
        const ts = await timestampOf(ev.blockNumber)
        const { entityKey } = await wallet.createEntity(
          Fill,
          {
            orderHash: a.orderHash,
            security: addr(a.security),
            maker: addr(a.maker),
            taker: addr(a.taker),
            side: a.isSell ? "sell" : "buy",
            price: dec(formatUnits(a.price, PAY_DECIMALS)),
            amount: u64(a.amount),
            cost: dec(formatUnits(a.cost, PAY_DECIMALS)),
            hederaTx: ev.transactionHash,
            logIndex: u64(BigInt(ev.logIndex)),
            block: u64(ev.blockNumber),
            timestamp: u64(ts),
          },
          { expiration: LIFETIME.fill() },
        )
        log(`  → regx.fill ${who(a.taker)} ${a.isSell ? "bought" : "sold"} ${a.amount} @ ₹${formatUnits(a.price, 6)} [${entityKey.slice(0, 10)}…]`)
        touched = true
      } else if (src === d.dvp.toLowerCase() && ev.eventName === "Cancelled") {
        await writeAction(ev, "order_cancel", `${who(a.maker)} cancelled order nonce ${a.nonce}`, a.maker, { nonce: String(a.nonce) })
      } else if (src === d.bond.address.toLowerCase()) {
        if (ev.eventName === "AddressFrozen") {
          touched ||= await writeAction(ev, a.isFrozen ? "freeze" : "unfreeze", `Issuer ${a.isFrozen ? "froze" : "unfroze"} ${who(a.userAddress)}`, a.userAddress)
        } else if (ev.eventName === "Paused" || ev.eventName === "Unpaused") {
          touched ||= await writeAction(ev, ev.eventName.toLowerCase(), `Issuer ${ev.eventName.toLowerCase()} trading`)
        } else if (ev.eventName === "CouponSet") {
          const c = a.coupon
          const rate = Number(c.rate) / 10 ** Number(c.rateDecimals)
          await writeAction(ev, "coupon_set", `Coupon #${a.couponId} set: ${(rate * 100).toFixed(2)}% (record ${new Date(Number(c.recordDate) * 1000).toISOString()})`, undefined, {
            couponId: String(a.couponId),
            rate,
            recordDate: String(c.recordDate),
            executionDate: String(c.executionDate),
            startDate: String(c.startDate),
            endDate: String(c.endDate),
          })
        } else if (ev.eventName === "Transfer" && a.from === zeroAddress) {
          touched ||= await writeAction(ev, "mint", `Issued ${a.value} units to ${who(a.to)}`, a.to, { amount: String(a.value) })
        }
      } else if (src === d.trex.identityRegistry.toLowerCase()) {
        if (ev.eventName === "IdentityRegistered") {
          await writeAction(ev, "kyc_grant", `${who(a.investorAddress)} verified (ONCHAINID ${String(a.identity).slice(0, 10)}…)`, a.investorAddress)
        } else if (ev.eventName === "IdentityRemoved") {
          await writeAction(ev, "kyc_revoke", `${who(a.investorAddress)} identity removed`, a.investorAddress)
        }
      }
    } catch (e: any) {
      log(`  ! failed to mirror ${ev.eventName} ${ev.transactionHash}: ${e.shortMessage ?? e.message}`)
      throw e
    }
  }
  if (touched) await syncAssets().catch((e) => log(`  ! asset sync failed: ${e.message}`))
}

async function startBlock(): Promise<bigint> {
  const s = loadState()
  if (s) return BigInt(s.lastBlock) + 1n
  const firstTx = d.txs?.deployBond ?? d.bond.deployTx
  const r = await hedera.getTransactionReceipt({ hash: firstTx })
  // registry events precede the bond; go back a little to include onboarding
  return r.blockNumber > 3000n ? r.blockNumber - 3000n : 0n
}

async function main() {
  let from = await startBlock()
  log(`RegX keeper: writer ${wallet.account.address}, from block ${from}`)
  const addresses = [d.dvp, d.bond.address, d.trex.identityRegistry] as Address[]
  for (;;) {
    const head = await hedera.getBlockNumber()
    while (from <= head) {
      const to = from + CHUNK - 1n > head ? head : from + CHUNK - 1n
      const logs = await hedera.getLogs({ address: addresses, fromBlock: from, toBlock: to })
      if (logs.length) log(`blocks ${from}–${to}: ${logs.length} logs`)
      await handle(logs as Log[])
      saveState({ lastBlock: to.toString() })
      from = to + 1n
    }
    if (once) break
    await sleep(POLL_MS)
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
