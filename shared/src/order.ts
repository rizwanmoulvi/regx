import { type Address, type Hex, formatUnits, hashTypedData, recoverTypedDataAddress } from "viem"
import { HEDERA_CHAIN_ID } from "./chains"

/** Mirrors `RegXDvP.Order`. */
export type Order = {
  maker: Address
  security: Address
  payToken: Address
  isSell: boolean
  price: bigint // payToken base units per 1 whole security unit
  amount: bigint // security base units
  nonce: bigint
  expiry: bigint // unix seconds (uint64)
}

export const ORDER_TYPES = {
  Order: [
    { name: "maker", type: "address" },
    { name: "security", type: "address" },
    { name: "payToken", type: "address" },
    { name: "isSell", type: "bool" },
    { name: "price", type: "uint256" },
    { name: "amount", type: "uint256" },
    { name: "nonce", type: "uint256" },
    { name: "expiry", type: "uint64" },
  ],
} as const

export const orderDomain = (dvp: Address, chainId: number = HEDERA_CHAIN_ID) =>
  ({ name: "RegX", version: "1", chainId, verifyingContract: dvp }) as const

export const orderTypedData = (dvp: Address, order: Order, chainId: number = HEDERA_CHAIN_ID) =>
  ({ domain: orderDomain(dvp, chainId), types: ORDER_TYPES, primaryType: "Order", message: order }) as const

export const hashOrder = (dvp: Address, order: Order, chainId: number = HEDERA_CHAIN_ID): Hex =>
  hashTypedData(orderTypedData(dvp, order, chainId))

export async function verifyOrderSignature(dvp: Address, order: Order, signature: Hex, chainId: number = HEDERA_CHAIN_ID): Promise<boolean> {
  const signer = await recoverTypedDataAddress({ ...orderTypedData(dvp, order, chainId), signature })
  return signer.toLowerCase() === order.maker.toLowerCase()
}

/** Random 64-bit nonce, so a maker never needs to track nonces. */
export const randomNonce = (): bigint => {
  const b = new Uint8Array(8)
  crypto.getRandomValues(b)
  return b.reduce((acc, x) => (acc << 8n) | BigInt(x), 0n)
}

/** Cash cost of filling `amount` security units, rounded up (matches RegXDvP.quote). */
export const quoteCost = (price: bigint, amount: bigint, securityDecimals: number): bigint => {
  const scale = 10n ** BigInt(securityDecimals)
  return (price * amount + scale - 1n) / scale
}

export const fmtMoney = (v: bigint, decimals = 6, maxFrac = 2) =>
  Number(formatUnits(v, decimals)).toLocaleString("en-IN", { maximumFractionDigits: maxFrac })
