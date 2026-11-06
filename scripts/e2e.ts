/**
 * End-to-end check on testnet (Hedera + Arkiv), asserting each step:
 *   1. Alice's ask is read back from Arkiv (seeded if missing)
 *   2. Bob fills 25 units through RegXDvP; balances move atomically
 *   3. Carol (no ONCHAINID claim) is rejected by checkFill and on-chain
 *   4. The keeper mirrors the fill into regx.fill on Arkiv
 *
 *   npm run e2e
 */
import { formatUnits, type Hex } from "viem"
import { atsSecurityAbi } from "../shared/src/abis/ats"
import { regXDvPAbi, tINRAbi } from "../shared/src/abis/generated"
import { fetchBook, fetchFills, v } from "../shared/src/arkiv"
import { explainReason } from "../shared/src/reasons"
import { HEDERA_GAS, hashscanTx } from "../shared/src/chains"
import { account, arkiv, hedera, hederaWallet, log, read, requireDeployment, send, sleep } from "./lib/env"
import { publishOrder } from "./seed-orders"

const d = requireDeployment()
const results: Record<string, string> = {}
const assert = (c: unknown, m: string) => {
  if (!c) throw new Error(`ASSERTION FAILED: ${m}`)
  log(`  ✓ ${m}`)
}

async function main() {
  const bob = account("bob").address
  const carol = account("carol").address
  const alice = account("alice").address

  log("1. Read the order book from Arkiv")
  let asks = await fetchBook(arkiv, d.bond.address, "sell")
  if (!asks.some((o) => o.order.maker.toLowerCase() === alice.toLowerCase())) {
    await publishOrder("alice", "sell", 40n, 985, 86400)
    await sleep(3000)
    asks = await fetchBook(arkiv, d.bond.address, "sell")
  }
  let best
  for (const o of asks) {
    const left = await read<bigint>(d.dvp, regXDvPAbi, "remaining", [o.order])
    if (left >= 25n && o.order.maker.toLowerCase() === alice.toLowerCase()) {
      best = o
      break
    }
  }
  assert(best, "found an Alice ask with ≥25 units left (regx.order on Arkiv)")
  log(`    entity ${best!.entityKey}  ₹${formatUnits(best!.order.price, 6)} × ${best!.order.amount}`)

  log("2. Bob fills 25 units atomically")
  const [bobUnits0, aliceCash0] = await Promise.all([
    read<bigint>(d.bond.address, atsSecurityAbi, "balanceOf", [bob]),
    read<bigint>(d.tinr, tINRAbi, "balanceOf", [alice]),
  ])
  const [ok, reason] = await read<[boolean, Hex]>(d.dvp, regXDvPAbi, "checkFill", [best!.order, bob, 25n])
  assert(ok, `checkFill(bob) = OK (${explainReason(reason).message})`)
  const fillTx = await send("bob", d.dvp, regXDvPAbi, "fill", [best!.order, best!.signature, 25n], 2_500_000n)
  results.fillTx = fillTx
  const [bobUnits1, aliceCash1] = await Promise.all([
    read<bigint>(d.bond.address, atsSecurityAbi, "balanceOf", [bob]),
    read<bigint>(d.tinr, tINRAbi, "balanceOf", [alice]),
  ])
  assert(bobUnits1 - bobUnits0 === 25n, "Bob received 25 ACME01")
  assert(aliceCash1 - aliceCash0 === 25n * best!.order.price, `Alice received ₹${formatUnits(25n * best!.order.price, 6)} tINR`)

  log("3. Carol (unverified) is rejected")
  const [cOk, cReason] = await read<[boolean, Hex]>(d.dvp, regXDvPAbi, "checkFill", [best!.order, carol, 5n])
  const why = explainReason(cReason)
  assert(!cOk && why.code === "0xac12c8b3", `checkFill(carol) blocked: ${why.message}`)
  const carolCash0 = await read<bigint>(d.tinr, tINRAbi, "balanceOf", [carol])
  const hash = await hederaWallet("carol").writeContract({
    address: d.dvp,
    abi: regXDvPAbi,
    functionName: "fill",
    args: [best!.order, best!.signature, 5n],
    gas: 1_500_000n,
    gasPrice: HEDERA_GAS.price,
    type: "legacy",
  })
  let status = "pending"
  for (let i = 0; i < 60 && status === "pending"; i++) {
    try {
      status = (await hedera.getTransactionReceipt({ hash })).status
    } catch {
      await sleep(2500)
    }
  }
  results.carolRevertTx = hash
  assert(status === "reverted", `Carol's forced fill reverted on-chain (${hash})`)
  assert((await read<bigint>(d.tinr, tINRAbi, "balanceOf", [carol])) === carolCash0, "Carol's cash leg rolled back")

  log("4. Keeper mirrors the fill to Arkiv (run `npm run keeper` in another terminal)")
  let mirrored = false
  for (let i = 0; i < 40 && !mirrored; i++) {
    const fills = await fetchFills(arkiv, d.bond.address, 20)
    mirrored = fills.some((f) => String(v(f.hederaTx)).toLowerCase() === fillTx.toLowerCase())
    if (!mirrored) await sleep(5000)
  }
  assert(mirrored, "regx.fill entity exists for the fill tx")

  log("\nE2E passed")
  for (const [k, h] of Object.entries(results)) log(`  ${k}: ${hashscanTx(h)}`)
}

main().catch((e) => {
  console.error("\n✗", e.shortMessage ?? e.message ?? e)
  process.exit(1)
})
