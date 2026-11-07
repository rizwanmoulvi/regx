/**
 * Whitechain end-to-end with assertions (real test USDT):
 *   1. Alice and Bob subscribe: USDT → issuer, units minted after ERC-3643 checks
 *   2. Carol (no KYC claim) tries to subscribe → rejected on-chain
 *   3. Alice publishes a sell order on Arkiv; Bob reads the book from Arkiv and fills it: atomic DvP in USDT
 *   4. Carol tries to buy → checkFill says NOT_VERIFIED; forced tx reverts on-chain, her USDT untouched
 *   5. The keeper mirrors the fill into Arkiv regx.fill
 * Evidence (tx hashes) is saved into the deployment file for the README.
 *   npm run wc:e2e
 */
import { type Hex, erc20Abi, formatUnits } from "viem"
import { regXDvPAbi, regXNoteAbi, tokenAbi } from "../../shared/src/abis/generated"
import { fetchBook, fetchFills, v } from "../../shared/src/arkiv"
import { explainReason } from "../../shared/src/reasons"
import { activeNote, wcTx } from "../../shared/src/whitechain"
import { type Role, account, arkiv, log, sleep } from "../lib/env"
import { loadWc, requireWc, saveWc, wc, wcRead, wcSend, wcWallet } from "../lib/wc"
import { publishWcOrder } from "./seed-orders"

const d = requireWc()
const n = activeNote(d)!
const ev: Record<string, string> = {}
const ok = (c: unknown, m: string) => {
  if (!c) throw new Error(`ASSERTION FAILED: ${m}`)
  log(`  ✓ ${m}`)
}
const usdt = (a: string) => wcRead<bigint>(d.usdt, erc20Abi, "balanceOf", [a])
const units = (a: string) => wcRead<bigint>(n.token, tokenAbi, "balanceOf", [a])
const A = (r: Role) => account(r).address

/** Sends without simulation (fixed gas) so a rejection is recorded on-chain; returns [hash, status]. */
async function forceSend(role: Role, address: `0x${string}`, abi: any, functionName: string, args: unknown[]) {
  const hash = await wcWallet(role).writeContract({ address, abi, functionName, args, gas: 600_000n } as any)
  const r = await wc.waitForTransactionReceipt({ hash })
  return [hash, r.status] as const
}

async function main() {
  log(`1. Subscriptions to ${n.symbol} (issue price ${formatUnits(BigInt(n.terms.issuePrice), 6)} USDT)`)
  for (const [role, qty] of [["alice", 30n], ["bob", 10n]] as const) {
    if ((await units(A(role))) > 0n) {
      log(`  · ${role} already subscribed`)
      continue
    }
    const issuer0 = await usdt(d.deployer)
    ev[`subscribe_${role}`] = await wcSend(role, n.note, regXNoteAbi, "subscribe", [qty])
    ok((await units(A(role))) === qty, `${role} holds ${qty} ${n.symbol}`)
    ok((await usdt(d.deployer)) - issuer0 === qty * BigInt(n.terms.issuePrice), `issuer received ${formatUnits(qty * BigInt(n.terms.issuePrice), 6)} USDT`)
  }

  log("2. Carol (no ONCHAINID claim) tries to subscribe")
  const [carolSub, carolSubStatus] = await forceSend("carol", n.note, regXNoteAbi, "subscribe", [5n])
  ev.carol_subscribe_reverted = carolSub
  ok(carolSubStatus === "reverted", `Carol's subscription reverted on-chain (${carolSub})`)

  log("3. Alice sells on the Arkiv order book; Bob fills through the DvP")
  const posted = await publishWcOrder("alice", "sell", 10n, "0.99", 6 * 3600)
  ev.order_entity = posted.entityKey
  await sleep(3000)
  const book = await fetchBook(arkiv, n.token, "sell")
  const o = book.find((x) => x.entityKey === posted.entityKey)
  ok(o, "Bob read Alice's order back from Arkiv")
  const [canBob, reasonBob] = await wcRead<[boolean, Hex]>(d.dvp, regXDvPAbi, "checkFill", [o!.order, A("bob"), 10n])
  ok(canBob, `checkFill(bob) OK (${explainReason(reasonBob).message})`)
  const [aliceUsdt0, bobUnits0] = [await usdt(A("alice")), await units(A("bob"))]
  ev.fill = await wcSend("bob", d.dvp, regXDvPAbi, "fill", [o!.order, o!.signature, 10n])
  ok((await units(A("bob"))) - bobUnits0 === 10n, "Bob received 10 units")
  ok((await usdt(A("alice"))) - aliceUsdt0 === 10n * o!.order.price, `Alice received ${formatUnits(10n * o!.order.price, 6)} USDT in the same tx`)

  log("4. Carol tries to buy from the book")
  const second = await publishWcOrder("alice", "sell", 5n, "0.995", 6 * 3600)
  const [canCarol, reasonCarol] = await wcRead<[boolean, Hex]>(d.dvp, regXDvPAbi, "checkFill", [second.order, A("carol"), 5n])
  ok(!canCarol && explainReason(reasonCarol).code === "NOT_VERIFIED", `checkFill(carol): ${explainReason(reasonCarol).message}`)
  const carolUsdt0 = await usdt(A("carol"))
  const [carolFill, carolFillStatus] = await forceSend("carol", d.dvp, regXDvPAbi, "fill", [second.order, second.signature, 5n])
  ev.carol_fill_reverted = carolFill
  ok(carolFillStatus === "reverted", `Carol's fill reverted on-chain (${carolFill})`)
  ok((await usdt(A("carol"))) === carolUsdt0, "Carol's USDT untouched (cash leg rolled back)")

  log("5. Keeper mirrors the fill to Arkiv (npm run wc:keeper)")
  let mirrored = false
  for (let i = 0; i < 30 && !mirrored; i++) {
    mirrored = (await fetchFills(arkiv, n.token, 20)).some((f) => String(v(f.hederaTx)).toLowerCase() === ev.fill.toLowerCase())
    if (!mirrored) await sleep(4000)
  }
  ok(mirrored, "regx.fill entity exists for the fill")

  const dep = loadWc() as any
  dep.evidence = { ...(dep.evidence ?? {}), ...ev }
  saveWc(dep)
  log("\nE2E passed")
  for (const [k, h] of Object.entries(ev)) log(`  ${k}: ${k === "order_entity" ? h : wcTx(h)}`)
}

main().catch((e) => {
  console.error("\n✗", e.shortMessage ?? e.message ?? e)
  process.exit(1)
})
