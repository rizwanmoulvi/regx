/**
 * Lifecycle operations on the active RegX note (Whitechain Sepolia). Every payment is in Whitechain test USDT.
 *
 *   npm run wc:life -- subscribe alice 30      investor buys 30 units at the issue price (USDT → issuer, units minted)
 *   npm run wc:life -- coupon [index]          pay coupon to all holders (permissionless, after the coupon date)
 *   npm run wc:life -- mature                  repay face value to all holders and burn units (after maturity)
 *   npm run wc:life -- freeze bob | unfreeze bob | pause | unpause   (issuer agent)
 *   npm run wc:life -- kyc:revoke bob | onboard 0x…
 *   npm run wc:life -- status
 */
import { type Address, formatUnits } from "viem"
import { identityRegistryAbi, regXNoteAbi, tokenAbi } from "../../shared/src/abis/generated"
import { activeNote, wcTx } from "../../shared/src/whitechain"
import { ROLES, type Role, account, log } from "../lib/env"
import { requireWc, wcRead, wcSend } from "../lib/wc"

const d = requireWc()
const n = activeNote(d)!
const [cmd, a1, a2] = process.argv.slice(2)
const erc20 = [{ type: "function", name: "balanceOf", stateMutability: "view", inputs: [{ type: "address" }], outputs: [{ type: "uint256" }] }] as const
const who = (x?: string): Address => {
  if (!x) throw new Error("missing target")
  if (x.startsWith("0x")) return x as Address
  if ((ROLES as readonly string[]).includes(x)) return account(x as Role).address
  throw new Error(`unknown ${x}`)
}
const role = (x?: string): Role => {
  if (!x || !(ROLES as readonly string[]).includes(x)) throw new Error("expected alice | bob | carol | deployer")
  return x as Role
}
const fmt = (ts: string) => new Date(Number(ts) * 1000).toISOString()

async function status() {
  log(`${n.symbol} ${n.token} (lifecycle ${n.note})`)
  log(`subscription until ${fmt(n.terms.subscriptionEnd)} · coupon ${n.terms.couponDates.map(fmt).join(", ")} · maturity ${fmt(n.terms.maturity)}`)
  const [supply, paused, matured, obligation] = await Promise.all([
    wcRead<bigint>(n.token, tokenAbi, "totalSupply"),
    wcRead<boolean>(n.token, tokenAbi, "paused"),
    wcRead<boolean>(n.note, regXNoteAbi, "matured"),
    wcRead<[bigint, bigint, boolean]>(n.note, regXNoteAbi, "nextObligation"),
  ])
  log(`supply ${supply} · paused ${paused} · matured ${matured} · next obligation ${formatUnits(obligation[0], 6)} USDT due ${fmt(String(obligation[1]))}${obligation[2] ? " (maturity)" : " (coupon)"}`)
  for (const r of ["deployer", "alice", "bob", "carol"] as Role[]) {
    const a = account(r).address
    const [units, cash, ok, frozen] = await Promise.all([
      wcRead<bigint>(n.token, tokenAbi, "balanceOf", [a]),
      wcRead<bigint>(d.usdt, erc20, "balanceOf", [a]),
      wcRead<boolean>(d.trex.identityRegistry, identityRegistryAbi, "isVerified", [a]),
      wcRead<boolean>(n.token, tokenAbi, "isFrozen", [a]),
    ])
    log(`  ${r.padEnd(8)} ${String(units).padStart(4)} ${n.symbol}  ${formatUnits(cash, 6).padStart(10)} USDT  ${ok ? "verified" : "UNVERIFIED"}${frozen ? " FROZEN" : ""}`)
  }
}

async function main() {
  switch (cmd) {
    case "subscribe":
      return void log(wcTx(await wcSend(role(a1), n.note, regXNoteAbi, "subscribe", [BigInt(a2 ?? "10")])))
    case "coupon":
      return void log(wcTx(await wcSend("deployer", n.note, regXNoteAbi, "payCoupon", [BigInt(a1 ?? "0")])))
    case "mature":
      return void log(wcTx(await wcSend("deployer", n.note, regXNoteAbi, "settleMaturity")))
    case "freeze":
    case "unfreeze":
      return void log(wcTx(await wcSend("deployer", n.token, tokenAbi, "setAddressFrozen", [who(a1), cmd === "freeze"])))
    case "pause":
    case "unpause":
      return void log(wcTx(await wcSend("deployer", n.token, tokenAbi, cmd)))
    case "kyc:revoke":
      return void log(wcTx(await wcSend("deployer", d.trex.identityRegistry, identityRegistryAbi, "deleteIdentity", [who(a1)])))
    case "onboard": {
      const { onboard } = await import("./deploy")
      return onboard(who(a1))
    }
    case "status":
      return status()
    default:
      log("usage: npm run wc:life -- <subscribe ROLE N|coupon [i]|mature|freeze WHO|unfreeze WHO|pause|unpause|kyc:revoke WHO|onboard 0x…|status>")
  }
}

main().catch((e) => {
  console.error("✗", e.shortMessage ?? e.message ?? e)
  process.exit(1)
})
