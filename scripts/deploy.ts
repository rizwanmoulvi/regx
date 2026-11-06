/**
 * RegX end-to-end deployment on Hedera testnet. Resumable: every step records its result in
 * shared/deployments/hedera-testnet.json and is skipped on re-run.
 *
 *   1. Fund demo wallets (HBAR on Hedera, tGLM on Arkiv) from the deployer
 *   2. Deploy tINR (cash leg), RegXDvP (settlement) and InvestorCapModule (ERC-3643 module)
 *   3. Deploy the T-REX identity stack: ClaimTopicsRegistry, ClaimIssuer (ONCHAINID),
 *      TrustedIssuersRegistry, IdentityRegistryStorage, IdentityRegistry, ModularCompliance
 *   4. Issue the bond through the Hedera ATS factory, wired to the T-REX registry + compliance
 *   5. Bind compliance to the bond, onboard Alice & Bob (ONCHAINID + signed KYC claim)
 *   6. Primary issuance to Alice, tINR to investors, DvP approvals
 *   7. Mirror the asset to Arkiv (scripts/arkiv-sync-assets.ts)
 */
import { type Address, type Hex, encodeAbiParameters, encodeFunctionData, keccak256, maxUint256, parseEther, parseEventLogs, stringToHex, toHex } from "viem"
import { ATS_CONFIG_IDS, ATS_ROLES, atsFactoryAbi, atsResolverAbi, atsSecurityAbi } from "../shared/src/abis/ats"
import {
  claimIssuerAbi,
  claimTopicsRegistryAbi,
  identityAbi,
  identityRegistryAbi,
  identityRegistryStorageAbi,
  investorCapModuleAbi,
  modularComplianceAbi,
  tINRAbi,
  trustedIssuersRegistryAbi,
} from "../shared/src/abis/generated"
import { HEDERA_GAS } from "../shared/src/chains"
import type { Deployment } from "../shared/src/deployments"
import { syncAssets } from "./arkiv-sync-assets"
import {
  type Role,
  account,
  arkiv,
  arkivWalletFor,
  contractId,
  deploy,
  hedera,
  hederaWallet,
  loadDeployment,
  log,
  read,
  saveDeployment,
  send,
  simulateAndSend,
  waitOk,
} from "./lib/env"

/** Live ATS infrastructure on Hedera testnet (asset-tokenization-studio apps/ats/web/.env.example). */
export const ATS_TESTNET = {
  factory: "0xd1F118A40f3b02883D35909eF2517e7EDd78379d" as Address, // 0.0.9213391
  resolver: "0xBA2D5FC2083A0b8f164c50e65d782087fBA18E0a" as Address, // 0.0.9212226 (BusinessLogicResolver)
}

const KYC_TOPIC = 1n
const INDIA = 356
const BOND = {
  name: "Acme Textiles INV-2026-001",
  symbol: "ACME01",
  decimals: 0,
  maxSupply: 1000n,
  faceValueInr: 1000n, // ₹1,000 per unit
  couponBps: 1200n, // 12% p.a.
  tenorDays: 90,
  primaryToAlice: 120n,
  investorCap: 150n, // ERC-3643 InvestorCapModule: max units per wallet
}
const TINR = 10n ** 6n

const d = loadDeployment() as Partial<Deployment> & { done?: Record<string, string> }
d.done ??= {}
d.txs ??= {}
const save = () => saveDeployment(d)

/** Runs a single transaction at most once across re-runs. */
async function once(key: string, fn: () => Promise<string>) {
  if (d.done![`tx:${key}`]) return
  d.done![`tx:${key}`] = await fn()
  save()
}

async function step(name: string, fn: () => Promise<string | void>) {
  if (d.done![name]) return log(`• ${name} (done)`)
  log(`• ${name}`)
  const r = await fn()
  d.done![name] = r || new Date().toISOString()
  save()
}

async function main() {
  const deployer = account("deployer").address
  d.network = "hedera-testnet"
  d.chainId = 296
  d.deployer = deployer
  d.keeper = account("keeper").address
  d.investors = { alice: account("alice").address, bob: account("bob").address, carol: account("carol").address }
  d.ats = { ...ATS_TESTNET, bondConfigVersion: d.ats?.bondConfigVersion ?? "" }
  save()

  // ---------------------------------------------------------------- 1. funding
  const hbar = await hedera.getBalance({ address: deployer })
  log(`deployer ${deployer}: ${Number(hbar) / 1e18} HBAR`)
  if (hbar < parseEther("40")) throw new Error("Fund the deployer with ≥40 testnet HBAR (portal.hedera.com/faucet)")

  for (const role of ["alice", "bob", "carol"] as Role[]) {
    const a = account(role).address
    const bal = await hedera.getBalance({ address: a })
    if (bal < parseEther("3")) {
      const hash = await hederaWallet("deployer").sendTransaction({
        to: a,
        value: parseEther("6"),
        gas: 1_500_000n,
        gasPrice: HEDERA_GAS.price,
        type: "legacy",
      })
      await waitOk(hash, `fund ${role}`)
      log(`  ✓ funded ${role} with 6 HBAR`)
    }
  }

  const glm = await arkiv.getBalance({ address: deployer })
  log(`deployer on Arkiv: ${Number(glm) / 1e18} tGLM`)
  if (glm > 0n) {
    const share = glm / 8n
    for (const role of ["alice", "bob", "carol", "keeper"] as Role[]) {
      const a = account(role).address
      if ((await arkiv.getBalance({ address: a })) < share / 4n) {
        const hash = await arkivWalletFor("deployer").sendTransaction({ to: a, value: share } as any)
        await arkiv.waitForTransactionReceipt({ hash })
        log(`  ✓ funded ${role} with ${Number(share) / 1e18} tGLM`)
      }
    }
  } else log("  ! deployer has no tGLM: Arkiv writes will fail until funded (hub.arkiv.network/faucet)")

  // ---------------------------------------------------------------- 2. RegX contracts
  await step("tinr", async () => void (d.tinr = await deploy("deployer", "TINR")))
  await step("dvp", async () => void (d.dvp = await deploy("deployer", "RegXDvP")))
  await step("investorCapModule", async () => void (d.investorCapModule = await deploy("deployer", "InvestorCapModule")))

  // ---------------------------------------------------------------- 3. T-REX identity stack
  d.trex ??= {} as Deployment["trex"]
  const t = d.trex!
  await step("trex.claimTopicsRegistry", async () => {
    t.claimTopicsRegistry = await deploy("deployer", "ClaimTopicsRegistry")
    save()
    await send("deployer", t.claimTopicsRegistry, claimTopicsRegistryAbi, "init")
    await send("deployer", t.claimTopicsRegistry, claimTopicsRegistryAbi, "addClaimTopic", [KYC_TOPIC])
  })
  await step("trex.claimIssuer", async () => {
    t.claimIssuer = await deploy("deployer", "ClaimIssuer", [deployer], 5_000_000n)
    save()
    // CLAIM purpose (3) key for the deployer, who signs KYC claims as the compliance agent
    const keyHash = keccak256(encodeAbiParameters([{ type: "address" }], [deployer]))
    await send("deployer", t.claimIssuer, claimIssuerAbi, "addKey", [keyHash, 3n, 1n])
  })
  await step("trex.trustedIssuersRegistry", async () => {
    t.trustedIssuersRegistry = await deploy("deployer", "TrustedIssuersRegistry")
    save()
    await send("deployer", t.trustedIssuersRegistry, trustedIssuersRegistryAbi, "init")
    await send("deployer", t.trustedIssuersRegistry, trustedIssuersRegistryAbi, "addTrustedIssuer", [t.claimIssuer, [KYC_TOPIC]])
  })
  await step("trex.identityRegistryStorage", async () => {
    if (!t.identityRegistryStorage) {
      t.identityRegistryStorage = await deploy("deployer", "IdentityRegistryStorage")
      save()
    }
    await once("irs.init", () => send("deployer", t.identityRegistryStorage, identityRegistryStorageAbi, "init"))
  })
  await step("trex.identityRegistry", async () => {
    if (!t.identityRegistry) {
      t.identityRegistry = await deploy("deployer", "IdentityRegistry")
      save()
    }
    await once("ir.init", () =>
      send("deployer", t.identityRegistry, identityRegistryAbi, "init", [
        t.trustedIssuersRegistry,
        t.claimTopicsRegistry,
        t.identityRegistryStorage,
      ]),
    )
    await once("irs.bind", () =>
      send("deployer", t.identityRegistryStorage, identityRegistryStorageAbi, "bindIdentityRegistry", [t.identityRegistry]),
    )
    await once("ir.addAgent", () => send("deployer", t.identityRegistry, identityRegistryAbi, "addAgent", [deployer]))
  })
  await step("trex.modularCompliance", async () => {
    if (!t.modularCompliance) {
      t.modularCompliance = await deploy("deployer", "ModularCompliance")
      save()
    }
    await once("mc.init", () => send("deployer", t.modularCompliance, modularComplianceAbi, "init"))
    await once("mc.addModule", () => send("deployer", t.modularCompliance, modularComplianceAbi, "addModule", [d.investorCapModule]))
    const call = encodeFunctionData({ abi: investorCapModuleAbi, functionName: "setMaxHolding", args: [BOND.investorCap] })
    await once("mc.setMaxHolding", () =>
      send("deployer", t.modularCompliance, modularComplianceAbi, "callModuleFunction", [call, d.investorCapModule]),
    )
  })

  // ---------------------------------------------------------------- 4. ATS bond issuance
  await step("ats.bond", async () => {
    const latest = await read<bigint>(ATS_TESTNET.resolver, atsResolverAbi, "getLatestVersionByConfiguration", [
      ATS_CONFIG_IDS.bond,
    ]).catch(() => 1n)
    d.ats!.bondConfigVersion = latest.toString()
    log(`  ATS bond configuration version ${latest}`)

    const now = BigInt(Math.floor(Date.now() / 1000))
    const maturity = now + BigInt(BOND.tenorDays * 86400)
    const roles = [
      ATS_ROLES.DEFAULT_ADMIN,
      ATS_ROLES.ISSUER,
      ATS_ROLES.AGENT,
      ATS_ROLES.CONTROLLER,
      ATS_ROLES.CORPORATE_ACTION,
      ATS_ROLES.FREEZE_MANAGER,
      ATS_ROLES.PAUSER,
      ATS_ROLES.SNAPSHOT,
      ATS_ROLES.TREX_OWNER,
      ATS_ROLES.MATURITY_REDEEMER,
      ATS_ROLES.DOCUMENTER,
      ATS_ROLES.CONTROL_LIST,
    ]
    const bondData = {
      security: {
        resolver: ATS_TESTNET.resolver,
        maxSupply: BOND.maxSupply,
        resolverProxyConfigurationV2: {
          configurationId: ATS_CONFIG_IDS.bond,
          configurationVersion: latest,
          replacementEnabled: true,
        },
        erc20Metadata: { name: BOND.name, symbol: BOND.symbol, decimals: BOND.decimals },
        rbacs: roles.map((role) => ({ role, members: [deployer] })),
        externalPauses: [],
        externalControlLists: [],
        externalKycLists: [],
        compliance: t.modularCompliance,
        identityRegistry: t.identityRegistry,
        arePartitionsProtected: false,
        isMultiPartition: false,
        isControllable: true,
        isWhiteList: false, // control list = blocklist; ERC-3643 freeze adds to it
        clearingActive: false,
        internalKycActivated: false, // KYC comes from the T-REX Identity Registry (ONCHAINID claims)
        erc20VotesActivated: false,
      },
      bondDetails: {
        currency: stringToHex("INR", { size: 3 }),
        nominalValue: BOND.faceValueInr * 100n,
        nominalValueDecimals: 2n,
        startingDate: now,
        maturityDate: maturity,
        effectiveDatetime: now,
        isUnitNominalValue: true,
      },
      proceedRecipients: [],
      proceedRecipientsData: [],
    } as const
    const regulation = {
      regulationType: 1, // REG_S
      regulationSubType: 0,
      additionalSecurityData: {
        countriesControlListType: true,
        listOfCountries: "",
        info: "RegX demo: invoice-backed note on Acme Textiles receivables (testnet, no value)",
      },
    } as const

    await hedera.simulateContract({
      address: ATS_TESTNET.factory,
      abi: atsFactoryAbi,
      functionName: "deployBond",
      args: [bondData as any, regulation],
      account: account("deployer"),
      gas: HEDERA_GAS.max,
    }).catch((e) => log(`  (simulation warning: ${e.shortMessage ?? e.message})`))

    const est = await hedera
      .estimateContractGas({
        address: ATS_TESTNET.factory,
        abi: atsFactoryAbi,
        functionName: "deployBond",
        args: [bondData as any, regulation],
        account: account("deployer"),
      })
      .catch(() => undefined)
    const bondGas = est ? ((est * 125n) / 100n > HEDERA_GAS.max ? HEDERA_GAS.max : (est * 125n) / 100n) : HEDERA_GAS.max
    log(`  deployBond gas limit ${bondGas}${est ? ` (estimate ${est})` : " (estimate failed, using max)"}`)
    const hash = await hederaWallet("deployer").writeContract({
      address: ATS_TESTNET.factory,
      abi: atsFactoryAbi,
      functionName: "deployBond",
      args: [bondData as any, regulation],
      gas: bondGas,
      gasPrice: HEDERA_GAS.price,
      type: "legacy",
    })
    const receipt = await waitOk(hash, "deployBond")
    const [ev] = parseEventLogs({ abi: atsFactoryAbi, eventName: "BondDeployed", logs: receipt.logs })
    if (!ev) throw new Error(`BondDeployed event not found in ${hash}`)
    const bond = ev.args.bondAddress as Address
    d.bond = {
      address: bond,
      hederaId: await contractId(bond),
      name: BOND.name,
      symbol: BOND.symbol,
      deployTx: hash,
      maturity: maturity.toString(),
      start: now.toString(),
    }
    d.txs!.deployBond = hash
    log(`  ✓ ATS bond ${BOND.symbol} → ${bond} (${d.bond.hederaId ?? "id pending"})  ${hash}`)
  })
  const bond = d.bond!.address

  // ---------------------------------------------------------------- 5. compliance binding + onboarding
  await step("trex.bindToken", async () => {
    await send("deployer", t.modularCompliance, modularComplianceAbi, "bindToken", [bond])
  })

  d.identities ??= {}
  for (const role of ["alice", "bob"] as Role[]) {
    await step(`onboard.${role}`, async () => {
      const wallet = account(role).address
      let identity = d.identities![role]
      if (!identity) {
        identity = await deploy("deployer", "Identity", [deployer, false], 5_000_000n)
        d.identities![role] = identity
        save()
      }
      const data = toHex(`KYC:IN:accredited:${wallet.toLowerCase()}`)
      const digest = keccak256(
        encodeAbiParameters([{ type: "address" }, { type: "uint256" }, { type: "bytes" }], [identity, KYC_TOPIC, data]),
      )
      const signature = await account("deployer").signMessage({ message: { raw: digest } })
      await once(`claim.${role}`, () =>
        send("deployer", identity, identityAbi, "addClaim", [KYC_TOPIC, 1n, t.claimIssuer, signature, data, "regx://kyc"], 2_000_000n),
      )
      await once(`register.${role}`, () =>
        send("deployer", t.identityRegistry, identityRegistryAbi, "registerIdentity", [wallet, identity, INDIA], 2_000_000n),
      )
      const ok = await read<boolean>(t.identityRegistry, identityRegistryAbi, "isVerified", [wallet])
      if (!ok) throw new Error(`${role} not verified after onboarding`)
      log(`  ✓ ${role} verified in ERC-3643 Identity Registry`)
    })
  }

  // ---------------------------------------------------------------- 6. issuance, cash, approvals
  await step("ats.mint.alice", async () =>
    simulateAndSend("deployer", bond, atsSecurityAbi, "mint", [account("alice").address, BOND.primaryToAlice], HEDERA_GAS.high),
  )
  for (const [role, amt] of [["alice", 200_000n], ["bob", 1_000_000n], ["carol", 1_000_000n]] as const) {
    await step(`tinr.mint.${role}`, async () => send("deployer", d.tinr!, tINRAbi, "mint", [account(role).address, amt * TINR]))
  }
  for (const role of ["alice", "bob", "carol"] as Role[]) {
    await step(`approve.tinr.${role}`, async () => send(role, d.tinr!, tINRAbi, "approve", [d.dvp, maxUint256]))
  }
  for (const role of ["alice", "bob"] as Role[]) {
    await step(`approve.bond.${role}`, async () =>
      send(role, bond, atsSecurityAbi, "approve", [d.dvp, 1_000_000n], HEDERA_GAS.high),
    )
  }

  // ---------------------------------------------------------------- 7. Arkiv
  await step("arkiv.asset", async () => {
    const key = await syncAssets()
    d.arkiv = { assetEntityKey: key }
  })

  log(`\ndeployer HBAR left: ${Number(await hedera.getBalance({ address: deployer })) / 1e18}`)
  log("\nDeployment complete:")
  log(JSON.stringify({ bond, dvp: d.dvp, tinr: d.tinr, identityRegistry: t.identityRegistry, compliance: t.modularCompliance }, null, 2))
}

main().catch((e) => {
  console.error("\n✗", e.shortMessage ?? e.message ?? e)
  if (e.cause?.data) console.error("  revert data:", e.cause.data)
  process.exit(1)
})
