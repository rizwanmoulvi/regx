/**
 * Mirrors every RegX note on Whitechain into an Arkiv `regx.asset` entity (assetType "invoice-note", chainId 1874).
 * Re-runnable and idempotent: creates the entity if missing, otherwise patches it and extends its lifetime.
 *   npm run wc:sync
 */
import { ExpirationTime } from "@arkiv-network/sdk"
import { eq } from "@arkiv-network/sdk/query"
import { addr, dec, u64 } from "@arkiv-network/sdk/schema"
import { pathToFileURL } from "node:url"
import { type Address, type Hex, formatUnits } from "viem"
import { regXNoteAbi, tokenAbi } from "../../shared/src/abis/generated"
import { Asset, toJsonBytes, v } from "../../shared/src/arkiv"
import { type NoteDeployment, type WcDeployment, wcAddress } from "../../shared/src/whitechain"
import { account, arkiv, arkivWalletFor, log } from "../lib/env"
import { requireWc, wcRead } from "../lib/wc"

async function syncOne(d: WcDeployment, n: NoteDeployment): Promise<Hex> {
  const [paused, supply, matured, holders] = await Promise.all([
    wcRead<boolean>(n.token, tokenAbi, "paused"),
    wcRead<bigint>(n.token, tokenAbi, "totalSupply"),
    wcRead<boolean>(n.note, regXNoteAbi, "matured"),
    wcRead<Address[]>(n.note, regXNoteAbi, "holders"),
  ])
  const now = BigInt(Math.floor(Date.now() / 1000))
  const maturity = BigInt(n.terms.maturity)
  const status = matured ? "redeemed" : now >= maturity ? "matured" : paused ? "paused" : now < BigInt(n.terms.subscriptionEnd) ? "subscription" : "active"
  const face = BigInt(n.terms.faceValue)
  const values = {
    security: addr(n.token),
    hederaId: `whitechain:${n.token.slice(0, 10)}`,
    issuer: addr(d.deployer),
    assetType: "invoice-note",
    status,
    symbol: n.symbol,
    name: n.name,
    decimals: u64(0n),
    currency: "USDT",
    faceValue: dec(formatUnits(face, 6)),
    couponBps: u64((BigInt(n.terms.couponPerUnit) * 10_000n) / face),
    maturity: u64(maturity),
    maxSupply: u64(0n),
    totalSupply: u64(supply),
    holders: u64(BigInt(holders.length)),
    compliance: "erc3643",
    identityRegistry: addr(d.trex.identityRegistry),
    complianceContract: addr(n.compliance),
    dvp: addr(d.dvp),
    payToken: addr(d.usdt),
    meta: toJsonBytes({
      venue: "Whitechain Sepolia",
      chainId: 1874,
      lifecycle: n.note,
      isin: n.isin,
      issuePrice: formatUnits(BigInt(n.terms.issuePrice), 6),
      couponPerUnit: formatUnits(BigInt(n.terms.couponPerUnit), 6),
      couponDates: n.terms.couponDates,
      subscriptionEnd: n.terms.subscriptionEnd,
      investorCapUnits: Number(n.terms.investorCapUnits),
      obligor: "Acme Textiles Pvt Ltd (fictional)",
      underlying: "Receivable from Northwind Retail (fictional), due at maturity",
      explorer: wcAddress(n.token),
    }),
    updatedAt: u64(now),
    chainId: u64(1874n),
  }
  const wallet = arkivWalletFor("keeper")
  const existing = await arkiv.select({ $key: true }).from(Asset).where(eq("security", addr(n.token))).ownedBy(account("keeper").address).limit(1).fetch()
  const found = existing.entities[0] as { $key: unknown } | undefined
  if (found) {
    const key = v<Hex>(found.$key)
    const { security, ...rest } = values
    await wallet.patchEntity(Asset, key, { set: rest as any })
    await wallet.extendEntity({ entityKey: key, expiration: ExpirationTime.max() })
    log(`  ✓ patched regx.asset ${n.symbol} ${key.slice(0, 12)}… (${status})`)
    return key
  }
  const { entityKey } = await wallet.createEntity(Asset, values as any, { expiration: ExpirationTime.max() })
  log(`  ✓ created regx.asset ${n.symbol} ${entityKey}`)
  return entityKey
}

export async function syncWcAssets(only?: Address) {
  const d = requireWc()
  for (const n of d.notes) if (!only || n.token.toLowerCase() === only.toLowerCase()) await syncOne(d, n)
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  syncWcAssets().catch((e) => {
    console.error(e)
    process.exit(1)
  })
}
