/**
 * RegX on Whitechain Sepolia. Resumable: progress is recorded in shared/deployments/whitechain-sepolia.json.
 *
 *   npm run wc:deploy                       shared infra + first note (if none)
 *   npm run wc:note -- --sub 15m --coupon 20m --maturity 30m   issue a fresh note (e.g. for a demo run)
 *
 * Shared infra: T-REX ClaimTopicsRegistry, ONCHAINID ClaimIssuer, TrustedIssuersRegistry, IdentityRegistryStorage,
 * IdentityRegistry, RegXDvP; investors Alice & Bob onboarded with signed KYC claims (Carol is not).
 * Per note: ModularCompliance + RegXNote (lifecycle module) + InvestorCapModule + T-REX Token (ERC-3643).
 */
import { pathToFileURL } from "node:url"
import { type Address, encodeAbiParameters, encodeFunctionData, keccak256, maxUint256, parseEther, toHex } from "viem"
import {
  claimIssuerAbi,
  claimTopicsRegistryAbi,
  identityAbi,
  identityRegistryAbi,
  identityRegistryStorageAbi,
  investorCapModuleAbi,
  modularComplianceAbi,
  regXNoteAbi,
  tokenAbi,
  trustedIssuersRegistryAbi,
} from "../../shared/src/abis/generated"
import { type NoteDeployment, WC_USDT, type WcDeployment, wcTx } from "../../shared/src/whitechain"
import { type Role, account, log } from "../lib/env"
import { loadWc, saveWc, wc, wcDeploy, wcRead, wcSend, wcWait, wcWallet } from "../lib/wc"

const USDT = 10n ** 6n
const KYC = 1n
const erc20 = [
  { type: "function", name: "balanceOf", stateMutability: "view", inputs: [{ type: "address" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "allowance", stateMutability: "view", inputs: [{ type: "address" }, { type: "address" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "approve", stateMutability: "nonpayable", inputs: [{ type: "address" }, { type: "uint256" }], outputs: [{ type: "bool" }] },
  { type: "function", name: "transfer", stateMutability: "nonpayable", inputs: [{ type: "address" }, { type: "uint256" }], outputs: [{ type: "bool" }] },
] as const

const d = loadWc() as Partial<WcDeployment> & { done?: Record<string, string> }
d.done ??= {}
d.txs ??= {}
const save = () => saveWc(d)
async function once(key: string, fn: () => Promise<string | void>) {
  if (d.done![key]) return
  d.done![key] = (await fn()) || new Date().toISOString()
  save()
}

const dur = (s: string | undefined, def: number) => {
  if (!s) return def
  const m = /^(\d+)([smhd]?)$/.exec(s)
  if (!m) throw new Error(`bad duration ${s}`)
  return Number(m[1]) * { s: 1, m: 60, h: 3600, d: 86400, "": 1 }[m[2] as "s"]
}
const arg = (n: string) => {
  const i = process.argv.indexOf(`--${n}`)
  return i > 0 ? process.argv[i + 1] : undefined
}

// ------------------------------------------------------------------ shared infrastructure

async function infra() {
  const deployer = account("deployer").address
  d.network = "whitechain-sepolia"
  d.chainId = 1874
  d.deployer = deployer
  d.keeper = account("keeper").address
  d.usdt = WC_USDT
  d.investors = { alice: account("alice").address, bob: account("bob").address, carol: account("carol").address }
  d.identities ??= {}
  d.notes ??= []
  ;(d as any).startBlock ??= String(await wc.getBlockNumber())
  d.trex ??= {} as WcDeployment["trex"]
  const t = d.trex!
  save()

  const wbt = await wc.getBalance({ address: deployer })
  const usdt = await wcRead<bigint>(WC_USDT, erc20, "balanceOf", [deployer])
  log(`deployer ${deployer}: ${Number(wbt) / 1e18} WBT, ${Number(usdt) / 1e6} USDT`)
  if (wbt < parseEther("0.05")) throw new Error("Fund the deployer with WBT (faucet.testnet.whitechain.io)")

  for (const role of ["alice", "bob", "carol"] as Role[]) {
    const a = account(role).address
    if ((await wc.getBalance({ address: a })) < parseEther("0.01")) {
      const hash = await wcWallet("deployer").sendTransaction({ to: a, value: parseEther("0.025") })
      await wcWait(hash, `fund ${role}`)
      log(`  ✓ funded ${role} with 0.025 WBT`)
    }
  }

  if (!t.claimTopicsRegistry) (t.claimTopicsRegistry = await wcDeploy("deployer", "ClaimTopicsRegistry")), save()
  await once("ctr.init", () => wcSend("deployer", t.claimTopicsRegistry, claimTopicsRegistryAbi, "init"))
  await once("ctr.topic", () => wcSend("deployer", t.claimTopicsRegistry, claimTopicsRegistryAbi, "addClaimTopic", [KYC]))

  if (!t.claimIssuer) (t.claimIssuer = await wcDeploy("deployer", "ClaimIssuer", [deployer])), save()
  await once("ci.key", () =>
    wcSend("deployer", t.claimIssuer, claimIssuerAbi, "addKey", [keccak256(encodeAbiParameters([{ type: "address" }], [deployer])), 3n, 1n]),
  )

  if (!t.trustedIssuersRegistry) (t.trustedIssuersRegistry = await wcDeploy("deployer", "TrustedIssuersRegistry")), save()
  await once("tir.init", () => wcSend("deployer", t.trustedIssuersRegistry, trustedIssuersRegistryAbi, "init"))
  await once("tir.add", () => wcSend("deployer", t.trustedIssuersRegistry, trustedIssuersRegistryAbi, "addTrustedIssuer", [t.claimIssuer, [KYC]]))

  if (!t.identityRegistryStorage) (t.identityRegistryStorage = await wcDeploy("deployer", "IdentityRegistryStorage")), save()
  await once("irs.init", () => wcSend("deployer", t.identityRegistryStorage, identityRegistryStorageAbi, "init"))

  if (!t.identityRegistry) (t.identityRegistry = await wcDeploy("deployer", "IdentityRegistry")), save()
  await once("ir.init", () =>
    wcSend("deployer", t.identityRegistry, identityRegistryAbi, "init", [t.trustedIssuersRegistry, t.claimTopicsRegistry, t.identityRegistryStorage]),
  )
  await once("irs.bind", () => wcSend("deployer", t.identityRegistryStorage, identityRegistryStorageAbi, "bindIdentityRegistry", [t.identityRegistry]))
  await once("ir.agent", () => wcSend("deployer", t.identityRegistry, identityRegistryAbi, "addAgent", [deployer]))

  if (!d.dvp) (d.dvp = await wcDeploy("deployer", "RegXDvP")), save()

  for (const role of ["alice", "bob"] as Role[]) await onboard(role)
}

export async function onboard(roleOrAddr: Role | Address) {
  const t = d.trex!
  const wallet = (roleOrAddr.startsWith("0x") ? roleOrAddr : account(roleOrAddr as Role).address) as Address
  const key = roleOrAddr.startsWith("0x") ? wallet.toLowerCase() : roleOrAddr
  if (!d.identities![key]) (d.identities![key] = await wcDeploy("deployer", "Identity", [d.deployer, false])), save()
  const identity = d.identities![key]
  const data = toHex(`KYC:IN:accredited:${wallet.toLowerCase()}`)
  const digest = keccak256(encodeAbiParameters([{ type: "address" }, { type: "uint256" }, { type: "bytes" }], [identity, KYC, data]))
  const sig = await account("deployer").signMessage({ message: { raw: digest } })
  await once(`claim.${key}`, () => wcSend("deployer", identity, identityAbi, "addClaim", [KYC, 1n, t.claimIssuer, sig, data, "regx://kyc"]))
  await once(`register.${key}`, () => wcSend("deployer", t.identityRegistry, identityRegistryAbi, "registerIdentity", [wallet, identity, 356]))
  const ok = await wcRead<boolean>(t.identityRegistry, identityRegistryAbi, "isVerified", [wallet])
  if (!ok) throw new Error(`${key} not verified after onboarding`)
  log(`  ✓ ${key} verified (ONCHAINID ${identity})`)
}

// ------------------------------------------------------------------ a note (one T-REX token + its compliance)

export async function newNote(opts: { sub: number; coupon: number; maturity: number; tag?: string }) {
  const deployer = account("deployer").address
  const now = Math.floor(Date.now() / 1000)
  const idx = d.notes!.length
  const symbol = `ACME${String(idx + 1).padStart(2, "0")}`
  const k = (s: string) => `note${idx}.${s}`
  const partial: Partial<NoteDeployment> = (d as any)[`pending_${idx}`] ?? {}
  const keep = () => (((d as any)[`pending_${idx}`] = partial), save())

  const terms = {
    usdt: WC_USDT,
    issuer: deployer,
    faceValue: 1n * USDT, // 1 USDT face per unit (invoice face / units)
    issuePrice: (97n * USDT) / 100n, // investors fund at 97%: 3% financing discount
    couponPerUnit: USDT / 100n, // plus a 1% coupon before maturity
    subscriptionEnd: BigInt(now + opts.sub),
    maturity: BigInt(now + opts.maturity),
  }
  const couponDates = [BigInt(now + opts.coupon)]
  const cap = 150n

  log(`• note ${symbol}: subscription until +${opts.sub}s, coupon at +${opts.coupon}s, maturity at +${opts.maturity}s`)
  if (!partial.compliance) (partial.compliance = await wcDeploy("deployer", "ModularCompliance")), keep()
  await once(k("mc.init"), () => wcSend("deployer", partial.compliance!, modularComplianceAbi, "init"))
  if (!partial.note) (partial.note = await wcDeploy("deployer", "RegXNote")), keep()
  if (!partial.investorCap) (partial.investorCap = await wcDeploy("deployer", "InvestorCapModule")), keep()
  await once(k("mc.addNote"), () => wcSend("deployer", partial.compliance!, modularComplianceAbi, "addModule", [partial.note]))
  await once(k("mc.addCap"), () => wcSend("deployer", partial.compliance!, modularComplianceAbi, "addModule", [partial.investorCap]))
  const setCap = encodeFunctionData({ abi: investorCapModuleAbi, functionName: "setMaxHolding", args: [cap] })
  await once(k("mc.cap"), () => wcSend("deployer", partial.compliance!, modularComplianceAbi, "callModuleFunction", [setCap, partial.investorCap]))

  if (!partial.token) (partial.token = await wcDeploy("deployer", "Token")), keep()
  const name = `Acme Textiles INV-2026-${String(idx + 1).padStart(3, "0")}`
  await once(k("token.init"), () =>
    wcSend("deployer", partial.token!, tokenAbi, "init", [d.trex!.identityRegistry, partial.compliance, name, symbol, 0, "0x0000000000000000000000000000000000000000"]),
  )
  await once(k("token.agentNote"), () => wcSend("deployer", partial.token!, tokenAbi, "addAgent", [partial.note]))
  await once(k("token.agentIssuer"), () => wcSend("deployer", partial.token!, tokenAbi, "addAgent", [deployer]))
  await once(k("token.unpause"), () => wcSend("deployer", partial.token!, tokenAbi, "unpause"))
  await once(k("note.configure"), () =>
    wcSend("deployer", partial.note!, regXNoteAbi, "configure", [partial.token, partial.compliance, terms, couponDates]),
  )
  // issuer pre-authorises coupon + redemption pulls; a revoked allowance shows up on-chain as a default
  await once(k("issuer.approve"), () => wcSend("deployer", WC_USDT, erc20, "approve", [partial.note, maxUint256]))

  // investors authorise subscription and DvP settlement
  for (const role of ["alice", "bob", "carol"] as Role[]) {
    await once(k(`usdt.approve.note.${role}`), () => wcSend(role, WC_USDT, erc20, "approve", [partial.note, maxUint256]))
    await once(`usdt.approve.dvp.${role}`, () => wcSend(role, WC_USDT, erc20, "approve", [d.dvp, maxUint256]))
    if (role !== "carol") await once(k(`token.approve.dvp.${role}`), () => wcSend(role, partial.token!, tokenAbi, "approve", [d.dvp, 1_000_000n]))
  }

  const nd: NoteDeployment = {
    symbol,
    name,
    isin: "INE0RGX26010",
    token: partial.token!,
    compliance: partial.compliance!,
    note: partial.note!,
    investorCap: partial.investorCap!,
    terms: {
      faceValue: terms.faceValue.toString(),
      issuePrice: terms.issuePrice.toString(),
      couponPerUnit: terms.couponPerUnit.toString(),
      subscriptionEnd: terms.subscriptionEnd.toString(),
      maturity: terms.maturity.toString(),
      couponDates: couponDates.map(String),
      investorCapUnits: cap.toString(),
    },
    deployedAt: new Date().toISOString(),
    txs: {},
  }
  d.notes!.push(nd)
  d.active = d.notes!.length - 1
  delete (d as any)[`pending_${idx}`]
  save()
  log(`  ✓ ${symbol} token ${nd.token}  ${wcTx(nd.token)}`)
  return nd
}

async function distributeUsdt() {
  const plan: [Role, bigint][] = [
    ["alice", 40n * USDT],
    ["bob", 30n * USDT],
    ["carol", 5n * USDT],
  ]
  for (const [role, amt] of plan) {
    await once(`usdt.fund.${role}`, async () => {
      const have = await wcRead<bigint>(WC_USDT, erc20, "balanceOf", [account(role).address])
      if (have >= amt) return "already funded"
      return wcSend("deployer", WC_USDT, erc20, "transfer", [account(role).address, amt - have])
    })
  }
}

async function main() {
  await infra()
  const deployerUsdt = await wcRead<bigint>(WC_USDT, erc20, "balanceOf", [d.deployer])
  if (deployerUsdt > 0n) await distributeUsdt()
  else log("  ! deployer has no Whitechain test USDT yet: skipping investor funding")
  const makeNote = process.argv.includes("--note") || !d.notes!.length
  if (makeNote)
    await newNote({ sub: dur(arg("sub"), 6 * 3600), coupon: dur(arg("coupon"), 6 * 3600 + 600), maturity: dur(arg("maturity"), 8 * 3600) })
  const { syncWcAssets } = await import("./sync-assets")
  await syncWcAssets()
  log(`\nWBT left: ${Number(await wc.getBalance({ address: d.deployer! })) / 1e18}`)
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => {
    console.error("\n✗", e.shortMessage ?? e.message ?? e)
    process.exit(1)
  })
}
