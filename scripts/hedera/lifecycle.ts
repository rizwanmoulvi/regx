/**
 * Issuer lifecycle operations on the ATS bond (Hedera testnet), mirrored to Arkiv by the keeper.
 *
 *   npm run lifecycle -- coupon [--in 60]       set a coupon (record date in N s), wait, pay holders in tINR
 *   npm run lifecycle -- coupon:set [--in 60]
 *   npm run lifecycle -- coupon:pay <couponId>
 *   npm run lifecycle -- coupon:schedule [--in 60] [--exec 180] [--wait]   pay via Hedera Scheduled Transactions
 *   npm run lifecycle -- freeze <alice|bob|0x…>
 *   npm run lifecycle -- unfreeze <alice|bob|0x…>
 *   npm run lifecycle -- pause | unpause
 *   npm run lifecycle -- kyc:revoke <who>       remove from the ERC-3643 Identity Registry
 *   npm run lifecycle -- kyc:grant <who>        re-register an existing ONCHAINID
 *   npm run lifecycle -- onboard <0x…>          new ONCHAINID + signed KYC claim + registration
 */
import { addr, u64 } from "@arkiv-network/sdk/schema"
import { type Address, type Hex, encodeAbiParameters, encodeFunctionData, formatUnits, keccak256, toHex } from "viem"
import { atsSecurityAbi } from "../../shared/src/abis/ats"
import { identityAbi, identityRegistryAbi, tINRAbi } from "../../shared/src/abis/generated"
import { Action, LIFETIME, toJsonBytes } from "../../shared/src/arkiv"
import { HEDERA_GAS } from "../../shared/src/chains"
import { hashscanSchedule, scheduleContractCall, scheduleStatus } from "./hiero"
import { type Role, ROLES, account, arkivWalletFor, deploy, hedera, loadDeployment, log, read, requireDeployment, saveDeployment, send, simulateAndSend, sleep } from "../lib/env"

const d = requireDeployment()
const bond = d.bond.address
const [cmd, arg] = process.argv.slice(2)
const flag = (name: string, def: number) => {
  const i = process.argv.indexOf(`--${name}`)
  return i > 0 ? Number(process.argv[i + 1]) : def
}
const resolve = (x?: string): Address => {
  if (!x) throw new Error("missing target (alice | bob | carol | 0x…)")
  if (x.startsWith("0x")) return x as Address
  if ((ROLES as readonly string[]).includes(x)) return account(x as Role).address
  throw new Error(`unknown target ${x}`)
}
const now = () => BigInt(Math.floor(Date.now() / 1000))

async function couponSet(inSeconds: number, execAfter = 60) {
  const maturity = await read<bigint>(bond, atsSecurityAbi, "getMaturityDate")
  const start = d.bond.start ? BigInt(d.bond.start) : now() - 86400n
  const record = now() + BigInt(inSeconds)
  const coupon = {
    recordDate: record,
    executionDate: record + BigInt(execAfter),
    startDate: start,
    endDate: start + 30n * 86400n < maturity ? start + 30n * 86400n : maturity,
    fixingDate: record,
    rate: 12n, // 0.12 = 12% p.a.
    rateDecimals: 2,
    rateStatus: 1, // SET
  }
  await simulateAndSend("deployer", bond, atsSecurityAbi, "setCoupon", [coupon], HEDERA_GAS.high)
  // coupon ids are sequential; reading the count avoids a second (slow) receipt fetch from the relay
  const id = await read<bigint>(bond, atsSecurityAbi, "getCouponCount")
  log(`coupon #${id} set; record date ${new Date(Number(record) * 1000).toISOString()}`)
  return id
}

async function couponPay(id: bigint) {
  for (;;) {
    const holders = await read<Address[]>(bond, atsSecurityAbi, "getSecurityHolders", [0n, 100n])
    const probe = holders[0] && (await read<any>(bond, atsSecurityAbi, "getCouponAmountFor", [id, holders[0]]))
    if (!holders.length || probe?.recordDateReached) break
    log("  waiting for record date (ATS snapshot)…")
    await sleep(10_000)
  }
  const holders = await read<Address[]>(bond, atsSecurityAbi, "getSecurityHolders", [0n, 100n])
  const payments: { holder: Address; units: string; tinr: string; tx: Hex }[] = []
  for (const h of holders) {
    const forH = await read<any>(bond, atsSecurityAbi, "getCouponFor", [id, h])
    const amt = await read<any>(bond, atsSecurityAbi, "getCouponAmountFor", [id, h])
    if (!amt.recordDateReached || amt.numerator === 0n) continue
    const tinr = (amt.numerator * 10n ** 6n) / amt.denominator
    const tx = await send("deployer", d.tinr, tINRAbi, "mint", [h, tinr])
    payments.push({ holder: h, units: String(forH.tokenBalance), tinr: formatUnits(tinr, 6), tx })
    log(`  paid ${formatUnits(tinr, 6)} tINR to ${h} (${forH.tokenBalance} units at record date)`)
  }
  const total = payments.reduce((s, p) => s + Number(p.tinr), 0)
  const { entityKey } = await arkivWalletFor("keeper").createEntity(
    Action,
    {
      security: addr(bond),
      kind: "coupon_paid",
      hederaTx: payments[0]?.tx ?? ("0x" as Hex),
      logIndex: u64(0n),
      timestamp: u64(now()),
      summary: `Coupon #${id} paid: ₹${total.toLocaleString("en-IN", { maximumFractionDigits: 2 })} to ${payments.length} holder(s)`,
      meta: toJsonBytes({ couponId: String(id), payments }),
    },
    { expiration: LIFETIME.action() },
  )
  log(`✓ coupon #${id} paid, regx.action ${entityKey}`)
}

/** Pays a coupon through Hedera Scheduled Transactions: one schedule per holder, executed by the network at the execution date. */
async function couponSchedule(inSeconds: number, execAfter: number, wait: boolean, existing?: bigint) {
  const id = existing ?? BigInt(await couponSet(inSeconds, execAfter))
  const [reg] = await read<any>(bond, atsSecurityAbi, "getCoupon", [id])
  // long-term schedules need a future expiry: the coupon's execution date, or 90 s from now if that has passed
  const executeAt = new Date(Math.max(Number(reg.coupon.executionDate) * 1000, Date.now() + 90_000))
  for (;;) {
    const holders = await read<Address[]>(bond, atsSecurityAbi, "getSecurityHolders", [0n, 100n])
    const probe = holders[0] && (await read<any>(bond, atsSecurityAbi, "getCouponAmountFor", [id, holders[0]]))
    if (!holders.length || probe?.recordDateReached) break
    log("  waiting for record date (ATS snapshot)…")
    await sleep(10_000)
  }
  const holders = await read<Address[]>(bond, atsSecurityAbi, "getSecurityHolders", [0n, 100n])
  const schedules: { holder: Address; units: string; tinr: string; scheduleId: string; txId: string }[] = []
  for (const h of holders) {
    const forH = await read<any>(bond, atsSecurityAbi, "getCouponFor", [id, h])
    const amt = await read<any>(bond, atsSecurityAbi, "getCouponAmountFor", [id, h])
    if (!amt.recordDateReached || amt.numerator === 0n) continue
    const tinr = (amt.numerator * 10n ** 6n) / amt.denominator
    const calldata = encodeFunctionData({ abi: tINRAbi, functionName: "mint", args: [h, tinr] })
    const s = await scheduleContractCall({ contract: d.tinr, calldata, gas: 150_000, executeAt, memo: `RegX ${d.bond.symbol} coupon #${id}` })
    schedules.push({ holder: h, units: String(forH.tokenBalance), tinr: formatUnits(tinr, 6), scheduleId: s.scheduleId, txId: s.txId })
    log(`  ⏱ schedule ${s.scheduleId}: ${formatUnits(tinr, 6)} tINR → ${h} at ${s.executeAt.toISOString()}  ${hashscanSchedule(s.scheduleId)}`)
  }
  const total = schedules.reduce((a, p) => a + Number(p.tinr), 0)
  const keeper = arkivWalletFor("keeper")
  const { entityKey } = await keeper.createEntity(
    Action,
    {
      security: addr(bond),
      kind: "coupon_scheduled",
      hederaTx: (schedules[0]?.txId ?? "") as Hex,
      logIndex: u64(0n),
      timestamp: u64(now()),
      summary: `Coupon #${id}: ₹${total.toLocaleString("en-IN", { maximumFractionDigits: 2 })} to ${schedules.length} holder(s) via Hedera Scheduled Transactions at ${executeAt.toISOString()}`,
      meta: toJsonBytes({ couponId: String(id), executeAt: executeAt.toISOString(), schedules }),
    },
    { expiration: LIFETIME.action() },
  )
  log(`✓ regx.action coupon_scheduled ${entityKey}`)
  if (!wait) return
  log("waiting for the network to execute the schedules…")
  for (;;) {
    const st = await Promise.all(schedules.map((s) => scheduleStatus(s.scheduleId)))
    if (st.every((x) => x.executed)) break
    await sleep(10_000)
  }
  const { entityKey: paidKey } = await keeper.createEntity(
    Action,
    {
      security: addr(bond),
      kind: "coupon_paid",
      hederaTx: (schedules[0]?.txId ?? "") as Hex,
      logIndex: u64(1n),
      timestamp: u64(now()),
      summary: `Coupon #${id} paid by Hedera scheduled transactions: ₹${total.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`,
      meta: toJsonBytes({ couponId: String(id), schedules }),
    },
    { expiration: LIFETIME.action() },
  )
  log(`✓ all schedules executed; regx.action coupon_paid ${paidKey}`)
}

async function onboard(wallet: Address) {
  const dep = loadDeployment() as any
  const identity = await deploy("deployer", "Identity", [account("deployer").address, false], 5_000_000n)
  const data = toHex(`KYC:IN:accredited:${wallet.toLowerCase()}`)
  const digest = keccak256(encodeAbiParameters([{ type: "address" }, { type: "uint256" }, { type: "bytes" }], [identity, 1n, data]))
  const sig = await account("deployer").signMessage({ message: { raw: digest } })
  await send("deployer", identity, identityAbi, "addClaim", [1n, 1n, d.trex.claimIssuer, sig, data, "regx://kyc"], 2_000_000n)
  await send("deployer", d.trex.identityRegistry, identityRegistryAbi, "registerIdentity", [wallet, identity, 356], 2_000_000n)
  dep.identities[wallet.toLowerCase()] = identity
  saveDeployment(dep)
  log(`✓ ${wallet} verified: ONCHAINID ${identity}`)
}

async function main() {
  switch (cmd) {
    case "coupon": {
      const id = await couponSet(flag("in", 60))
      return couponPay(BigInt(id))
    }
    case "coupon:schedule":
      return couponSchedule(flag("in", 60), flag("exec", 180), process.argv.includes("--wait"), process.argv.includes("--id") ? BigInt(flag("id", 0)) : undefined)
    case "coupon:set":
      return void (await couponSet(flag("in", 60)))
    case "coupon:pay":
      return couponPay(BigInt(arg))
    case "freeze":
    case "unfreeze":
      return void (await simulateAndSend("deployer", bond, atsSecurityAbi, "setAddressFrozen", [resolve(arg), cmd === "freeze"], HEDERA_GAS.high))
    case "pause":
    case "unpause":
      return void (await simulateAndSend("deployer", bond, atsSecurityAbi, cmd, [], HEDERA_GAS.high))
    case "kyc:revoke":
      return void (await send("deployer", d.trex.identityRegistry, identityRegistryAbi, "deleteIdentity", [resolve(arg)], 2_000_000n))
    case "kyc:grant": {
      const who = resolve(arg)
      const role = Object.entries(d.investors).find(([, a]) => a.toLowerCase() === who.toLowerCase())?.[0]
      const identity = (role && d.identities[role]) || d.identities[who.toLowerCase()]
      if (!identity) return onboard(who)
      return void (await send("deployer", d.trex.identityRegistry, identityRegistryAbi, "registerIdentity", [who, identity, 356], 2_000_000n))
    }
    case "onboard":
      return onboard(resolve(arg))
    default:
      console.log(readHelp())
  }
}

function readHelp() {
  return `usage: npm run lifecycle -- <coupon|coupon:set|coupon:pay ID|freeze WHO|unfreeze WHO|pause|unpause|kyc:revoke WHO|kyc:grant WHO|onboard 0x…>`
}

main().catch((e) => {
  console.error("✗", e.shortMessage ?? e.message ?? e)
  process.exit(1)
})
