/**
 * RegX data on Arkiv: four public, typed, queryable collections.
 *
 *   regx.asset   security metadata mirrored from Hedera ATS   (written by the keeper; re-runnable sync)
 *   regx.order   EIP-712 signed orders                        (written by makers from their own wallets)
 *   regx.fill    settled trades with Hedera tx hashes         (written by the keeper from DvP events)
 *   regx.action  corporate actions: coupon, freeze, pause...  (written by the keeper from ATS events)
 *
 * Every entity has an expiry: orders live exactly as long as the order is valid, so the book
 * cleans itself up with no cancel or cleanup transactions.
 */
import { ExpirationTime } from "@arkiv-network/sdk"
import { and, asc, desc, eq, gt } from "@arkiv-network/sdk/query"
import { addr, bytes, dec, defineSchema, str, u256, u64 } from "@arkiv-network/sdk/schema"
import { type Address, type Hex, bytesToHex, formatUnits, hexToBytes, stringToBytes, bytesToString } from "viem"
import type { Order } from "./order"

export const Asset = defineSchema("regx.asset", {
  security: addr().indexed(), // T-REX note token (Whitechain)
  hederaId: str().indexed(), // venue-specific id ("whitechain:0x…"); historical column name
  issuer: addr().indexed(),
  assetType: str().indexed(), // "invoice-note"
  status: str().indexed(), // subscription | active | paused | matured | redeemed
  symbol: str().indexed(),
  name: str(),
  decimals: u64(),
  currency: str(),
  faceValue: dec(),
  couponBps: u64(),
  maturity: u64().indexed(),
  maxSupply: u64(),
  totalSupply: u64(),
  holders: u64(),
  compliance: str(), // "erc3643"
  identityRegistry: addr(),
  complianceContract: addr(),
  dvp: addr(),
  payToken: addr(),
  docs: str().optional(), // Swarm reference (never an encrypted one)
  meta: bytes(), // JSON: obligor, invoice summary (no PII)
  updatedAt: u64().indexed(),
  chainId: u64().indexed().optional(), // 1874 Whitechain Sepolia, 296 Hedera testnet
})

export const OrderEntity = defineSchema("regx.order", {
  orderHash: str().indexed(),
  security: addr().indexed(),
  payToken: addr(),
  dvp: addr(),
  maker: addr().indexed(),
  side: str().indexed(), // "sell" | "buy"
  price: dec().indexed(), // human price in USDT, for sorting & range queries
  priceRaw: u256(), // exact base units signed in the order
  amount: u64(),
  nonce: u256(),
  expiry: u64().indexed(),
  chainId: u64().indexed(), // 1874 Whitechain Sepolia; the book is venue-agnostic
  sig: bytes(), // 65-byte EIP-712 signature
})

export const Fill = defineSchema("regx.fill", {
  orderHash: str().indexed(),
  security: addr().indexed(),
  maker: addr().indexed(),
  taker: addr().indexed(),
  side: str(), // side of the maker order
  price: dec().indexed(),
  amount: u64(),
  cost: dec(),
  hederaTx: str().indexed(),
  logIndex: u64(),
  block: u64(),
  timestamp: u64().indexed(),
})

export const Action = defineSchema("regx.action", {
  security: addr().indexed(),
  kind: str().indexed(), // subscribe | coupon_paid | coupon_holder | redeemed | redeem_holder | freeze | unfreeze | paused | unpaused | kyc_grant | kyc_revoke | order_cancel
  subject: addr().optional(),
  hederaTx: str().indexed(),
  logIndex: u64(),
  timestamp: u64().indexed(),
  summary: str(),
  meta: bytes(),
})

export const PAY_DECIMALS = 6

/** Lifetimes (Arkiv max is ~182 days; long-lived entities are extended by the sync script). */
export const LIFETIME = {
  order: (expiry: bigint) => ExpirationTime.atDate(new Date(Number(expiry) * 1000), { atLeast: ExpirationTime.fromMinutes(1) }),
  asset: () => ExpirationTime.max(),
  fill: () => ExpirationTime.max(),
  action: () => ExpirationTime.max(),
}

// ------------------------------------------------------------------ converters

export const toJsonBytes = (v: unknown) => stringToBytes(JSON.stringify(v))
export const fromJsonBytes = <T = Record<string, unknown>>(v: Uint8Array | Hex | undefined): T => {
  if (!v) return {} as T
  try {
    return JSON.parse(bytesToString(typeof v === "string" ? hexToBytes(v) : v)) as T
  } catch {
    return {} as T
  }
}

export function orderToEntity(order: Order, orderHash: Hex, signature: Hex, dvp: Address, chainId = 296) {
  return {
    orderHash,
    security: addr(order.security),
    payToken: addr(order.payToken),
    dvp: addr(dvp),
    maker: addr(order.maker),
    side: order.isSell ? "sell" : "buy",
    price: dec(formatUnits(order.price, PAY_DECIMALS)),
    priceRaw: u256(order.price),
    amount: u64(order.amount),
    nonce: u256(order.nonce),
    expiry: u64(order.expiry),
    chainId: u64(BigInt(chainId)),
    sig: hexToBytes(signature),
  }
}

/** Reads a typed column value regardless of whether the SDK returns a wrapped value or a bare one. */
export const v = <T = unknown>(x: unknown): T =>
  (x !== null && typeof x === "object" && "value" in (x as object) ? (x as { value: T }).value : (x as T))

export type BookOrder = {
  entityKey: Hex
  owner: Address
  expiresAt?: bigint
  order: Order
  orderHash: Hex
  signature: Hex
  dvp: Address
  side: "buy" | "sell"
}

export function entityToOrder(row: Record<string, unknown>): BookOrder {
  const sig = v<Uint8Array | Hex>(row.sig)
  return {
    entityKey: v<Hex>(row.$key),
    owner: v<Address>(row.$owner),
    expiresAt: row.$expiresAt !== undefined ? BigInt(v<bigint>(row.$expiresAt)) : undefined,
    orderHash: v<Hex>(row.orderHash),
    signature: typeof sig === "string" ? sig : bytesToHex(sig),
    dvp: v<Address>(row.dvp),
    side: v<"buy" | "sell">(row.side),
    order: {
      maker: v<Address>(row.maker),
      security: v<Address>(row.security),
      payToken: v<Address>(row.payToken),
      isSell: v<string>(row.side) === "sell",
      price: BigInt(v<bigint>(row.priceRaw)),
      amount: BigInt(v<bigint>(row.amount)),
      nonce: BigInt(v<bigint>(row.nonce)),
      expiry: BigInt(v<bigint>(row.expiry)),
    },
  }
}

// ------------------------------------------------------------------ queries
// `client` is any Arkiv public or wallet client (createPublicClient / createWalletClient).

type ArkivReader = { select: (...a: any[]) => any }

const nowSec = () => BigInt(Math.floor(Date.now() / 1000))

/** Open orders for a security on one side, best price first. */
export async function fetchBook(client: ArkivReader, security: Address, side: "buy" | "sell") {
  const res = await client
    .select()
    .from(OrderEntity)
    .where(and(eq("security", addr(security)), eq("side", side), gt("expiry", u64(nowSec()))))
    .orderBy(side === "sell" ? asc("price") : desc("price"))
    .limit(100)
    .fetch()
  // Price-time priority: Arkiv sorts by price; this also breaks ties by expiry so equal-priced rows never swap between reads.
  const dir = side === "sell" ? 1 : -1
  return (res.entities as Record<string, unknown>[])
    .map(entityToOrder)
    .sort((a, b) =>
      a.order.price !== b.order.price
        ? dir * (a.order.price < b.order.price ? -1 : 1)
        : a.order.expiry !== b.order.expiry
          ? a.order.expiry < b.order.expiry ? -1 : 1
          : a.entityKey.localeCompare(b.entityKey),
    )
}

export async function fetchOrdersByMaker(client: ArkivReader, maker: Address) {
  const res = await client
    .select()
    .from(OrderEntity)
    .where(eq("maker", addr(maker)))
    .orderBy(desc("expiry"))
    .limit(100)
    .fetch()
  return (res.entities as Record<string, unknown>[]).map(entityToOrder)
}

export async function fetchAssets(client: ArkivReader, assetType = "invoice-note") {
  const res = await client.select().from(Asset).where(eq("assetType", assetType)).limit(50).fetch()
  return res.entities as Record<string, unknown>[]
}

export async function fetchAsset(client: ArkivReader, security: Address) {
  const res = await client.select().from(Asset).where(eq("security", addr(security))).limit(1).fetch()
  return (res.entities as Record<string, unknown>[])[0]
}

export async function fetchFills(client: ArkivReader, security?: Address, limit = 50) {
  const q = client.select().from(Fill)
  const res = await (security ? q.where(eq("security", addr(security))) : q.where(gt("timestamp", u64(0n))))
    .orderBy(desc("timestamp"))
    .limit(limit)
    .fetch()
  return res.entities as Record<string, unknown>[]
}

export async function fetchActions(client: ArkivReader, security?: Address, limit = 50) {
  const q = client.select().from(Action)
  const res = await (security ? q.where(eq("security", addr(security))) : q.where(gt("timestamp", u64(0n))))
    .orderBy(desc("timestamp"))
    .limit(limit)
    .fetch()
  return res.entities as Record<string, unknown>[]
}

export async function findByTx(client: ArkivReader, schema: typeof Fill | typeof Action, hederaTx: string) {
  const res = await client.select().from(schema).where(eq("hederaTx", hederaTx)).limit(50).fetch()
  return res.entities as Record<string, unknown>[]
}
