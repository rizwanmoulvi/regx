/**
 * Mirrors RegX securities from Hedera (ATS bond state) into Arkiv `regx.asset` entities.
 * Re-runnable and idempotent: creates the entity if missing, otherwise patches changed columns
 * and extends its lifetime.
 *
 *   npm run sync:assets
 */
import { ExpirationTime } from "@arkiv-network/sdk"
import { eq } from "@arkiv-network/sdk/query"
import { addr, dec, u64 } from "@arkiv-network/sdk/schema"
import { pathToFileURL } from "node:url"
import { type Address, type Hex } from "viem"
import { atsSecurityAbi } from "../shared/src/abis/ats"
import { Asset, toJsonBytes, v } from "../shared/src/arkiv"
import { account, arkiv, arkivWalletFor, log, read, requireDeployment } from "./lib/env"

export async function readBondState(bond: Address) {
  const [name, symbol, decimals, totalSupply, maxSupply, maturity, nominal, nominalDec, paused, holders] =
    await Promise.all([
      read<string>(bond, atsSecurityAbi, "name"),
      read<string>(bond, atsSecurityAbi, "symbol"),
      read<number>(bond, atsSecurityAbi, "decimals"),
      read<bigint>(bond, atsSecurityAbi, "totalSupply"),
      read<bigint>(bond, atsSecurityAbi, "getMaxSupply"),
      read<bigint>(bond, atsSecurityAbi, "getMaturityDate"),
      read<bigint>(bond, atsSecurityAbi, "getNominalValue"),
      read<bigint>(bond, atsSecurityAbi, "getNominalValueDecimals"),
      read<boolean>(bond, atsSecurityAbi, "paused"),
      read<bigint>(bond, atsSecurityAbi, "getTotalSecurityHolders").catch(() => 0n),
    ])
  const now = BigInt(Math.floor(Date.now() / 1000))
  return {
    name,
    symbol,
    decimals: Number(decimals),
    totalSupply,
    maxSupply,
    maturity,
    faceValue: Number(nominal) / 10 ** Number(nominalDec),
    status: paused ? "paused" : maturity <= now ? "matured" : "active",
    holders,
  }
}

export async function syncAssets(): Promise<Hex> {
  const d = requireDeployment()
  const keeper = account("keeper").address
  const s = await readBondState(d.bond.address)
  const now = BigInt(Math.floor(Date.now() / 1000))

  const values = {
    security: addr(d.bond.address),
    hederaId: d.bond.hederaId ?? "",
    issuer: addr(d.deployer),
    assetType: "invoice-bond",
    status: s.status,
    symbol: s.symbol,
    name: s.name,
    decimals: u64(BigInt(s.decimals)),
    currency: "INR",
    faceValue: dec(String(s.faceValue)),
    couponBps: u64(1200n),
    maturity: u64(s.maturity),
    maxSupply: u64(s.maxSupply),
    totalSupply: u64(s.totalSupply),
    holders: u64(s.holders),
    compliance: "erc3643",
    identityRegistry: addr(d.trex.identityRegistry),
    complianceContract: addr(d.trex.modularCompliance),
    dvp: addr(d.dvp),
    payToken: addr(d.tinr),
    meta: toJsonBytes({
      obligor: "Acme Textiles Pvt Ltd (fictional)",
      underlying: "Pool of 14 GST invoices, buyer: Northwind Retail (fictional)",
      invoiceFaceInr: 150000000,
      advanceRate: 0.8,
      tenorDays: 90,
      regulation: "Reg S (demo)",
      investorCapUnits: 150,
      hashscan: `https://hashscan.io/testnet/contract/${d.bond.address}`,
      ats: { factory: d.ats.factory, resolver: d.ats.resolver, bondConfigVersion: d.ats.bondConfigVersion },
    }),
    updatedAt: u64(now),
  }

  const wallet = arkivWalletFor("keeper")
  const existing = await arkiv
    .select({ $key: true })
    .from(Asset)
    .where(eq("security", addr(d.bond.address)))
    .ownedBy(keeper)
    .limit(1)
    .fetch()

  const found = existing.entities[0] as { $key: unknown } | undefined
  if (found) {
    const key = v<Hex>(found.$key)
    const { security, ...rest } = values
    await wallet.patchEntity(Asset, key, { set: rest as any })
    await wallet.extendEntity({ entityKey: key, expiration: ExpirationTime.max() })
    log(`  ✓ patched + extended regx.asset ${key}`)
    return key
  }
  const { entityKey, txHash } = await wallet.createEntity(Asset, values as any, { expiration: ExpirationTime.max() })
  log(`  ✓ created regx.asset ${entityKey}  (arkiv tx ${txHash})`)
  return entityKey
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  syncAssets().catch((e) => {
    console.error(e)
    process.exit(1)
  })
}
