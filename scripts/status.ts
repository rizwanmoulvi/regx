/** Prints the live state of RegX on Hedera and Arkiv: balances, eligibility, order book, fills. */
import { formatUnits } from "viem"
import { atsSecurityAbi } from "../shared/src/abis/ats"
import { identityRegistryAbi, regXDvPAbi, tINRAbi } from "../shared/src/abis/generated"
import { fetchActions, fetchBook, fetchFills, v } from "../shared/src/arkiv"
import { ROLES, account, arkiv, hedera, log, read, requireDeployment } from "./lib/env"

const d = requireDeployment()

async function main() {
  log(`Bond ${d.bond.symbol} ${d.bond.address} (${d.bond.hederaId ?? "?"})`)
  log(`paused=${await read(d.bond.address, atsSecurityAbi, "paused")} supply=${await read(d.bond.address, atsSecurityAbi, "totalSupply")}\n`)
  for (const r of ROLES) {
    const a = account(r).address
    const [hbar, units, tinr, verified, frozen] = await Promise.all([
      hedera.getBalance({ address: a }),
      read<bigint>(d.bond.address, atsSecurityAbi, "balanceOf", [a]),
      read<bigint>(d.tinr, tINRAbi, "balanceOf", [a]),
      read<boolean>(d.trex.identityRegistry, identityRegistryAbi, "isVerified", [a]),
      read<boolean>(d.bond.address, atsSecurityAbi, "isFrozen", [a]),
    ])
    const glm = await arkiv.getBalance({ address: a })
    log(
      `${r.padEnd(9)} ${a}  ${units.toString().padStart(4)} ${d.bond.symbol}  ₹${Number(formatUnits(tinr, 6)).toLocaleString("en-IN").padStart(12)}  ` +
        `${verified ? "✅ verified" : "⛔ unverified"}${frozen ? " 🧊 frozen" : ""}  ${(Number(hbar) / 1e18).toFixed(1)} HBAR  ${(Number(glm) / 1e18).toFixed(3)} tGLM`,
    )
  }
  for (const side of ["sell", "buy"] as const) {
    const book = await fetchBook(arkiv, d.bond.address, side)
    log(`\n${side === "sell" ? "ASKS" : "BIDS"} (from Arkiv regx.order)`)
    for (const o of book) {
      const left = await read<bigint>(d.dvp, regXDvPAbi, "remaining", [o.order])
      log(`  ₹${formatUnits(o.order.price, 6).padStart(8)} × ${left}/${o.order.amount}  maker ${o.order.maker.slice(0, 8)}  expires ${new Date(Number(o.order.expiry) * 1000).toISOString()}  ${o.entityKey.slice(0, 12)}…`)
    }
  }
  log("\nFILLS (regx.fill)")
  for (const f of await fetchFills(arkiv, d.bond.address, 10))
    log(`  ${v(f.amount)} @ ₹${v(f.price)}  taker ${String(v(f.taker)).slice(0, 8)}  tx ${String(v(f.hederaTx)).slice(0, 12)}…`)
  log("\nACTIONS (regx.action)")
  for (const a of await fetchActions(arkiv, d.bond.address, 15)) log(`  [${v(a.kind)}] ${v(a.summary)}`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
