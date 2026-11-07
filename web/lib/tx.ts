"use client"

import { createWalletClient as createArkivWalletClient } from "@arkiv-network/sdk"
import {
  LIFETIME,
  type Order,
  OrderEntity,
  WC_CHAIN_ID,
  explainError,
  hashOrder,
  orderToEntity,
  orderTypedData,
  randomNonce,
  regXDvPAbi,
  regXNoteAbi,
  tokenAbi,
  type NoteDeployment,
} from "@regx/shared"
import { getAccount, signTypedData, switchChain, waitForTransactionReceipt, writeContract } from "wagmi/actions"
import { type Address, type Hex, custom, erc20Abi, maxUint256, parseUnits } from "viem"
import { arkiv, chainClient, d, note, wagmiConfig } from "./config"

export async function ensureChain(chainId: number) {
  const acc = getAccount(wagmiConfig)
  if (acc.chainId !== chainId) await switchChain(wagmiConfig, { chainId: chainId as any })
}

const me = () => {
  const a = getAccount(wagmiConfig).address
  if (!a) throw new Error("Connect a wallet first")
  return a
}

function arkivWallet() {
  const eth = (globalThis as any).ethereum
  if (!eth) throw new Error("No injected wallet found")
  return createArkivWalletClient({ chain: arkiv, transport: custom(eth), account: me() })
}

export class RevertedOnChain extends Error {
  constructor(public hash: Hex) {
    super(`Reverted on-chain: ${hash}`)
  }
}

/**
 * Sends a Whitechain tx after a dry run, so the user sees the decoded reason instead of a failed tx.
 * `force` skips the dry run and uses a fixed gas limit, so a compliance rejection lands on-chain (for demos).
 */
async function write(params: { address: Address; abi: any; functionName: string; args: unknown[] }, force = false) {
  await ensureChain(WC_CHAIN_ID)
  if (!force) {
    try {
      await chainClient.simulateContract({ ...params, account: me() } as any)
    } catch (e) {
      throw new Error(explainError(e))
    }
  }
  const hash = await writeContract(wagmiConfig, { ...params, chainId: WC_CHAIN_ID, ...(force ? { gas: 600_000n } : {}) } as any)
  const r = await waitForTransactionReceipt(wagmiConfig, { hash, chainId: WC_CHAIN_ID, timeout: 90_000 })
  if (r.status !== "success") throw new RevertedOnChain(hash)
  return hash
}

export const approveUsdt = (spender: Address) =>
  write({ address: d.usdt!, abi: erc20Abi, functionName: "approve", args: [spender, maxUint256] })

export const approveUnits = (n: NoteDeployment = note!, amount = 1_000_000n) =>
  write({ address: n.token, abi: tokenAbi, functionName: "approve", args: [d.dvp, amount] })

/** Primary issuance: pay the issue price in USDT, units are minted after ERC-3643 checks. */
export const subscribe = (n: NoteDeployment, units: bigint) => write({ address: n.note, abi: regXNoteAbi, functionName: "subscribe", args: [units] })

/** Permissionless settlement once due: anyone can trigger, funds come from the issuer's USDT allowance. */
export const payCoupon = (n: NoteDeployment, index: number) => write({ address: n.note, abi: regXNoteAbi, functionName: "payCoupon", args: [BigInt(index)] })
export const settleMaturity = (n: NoteDeployment) => write({ address: n.note, abi: regXNoteAbi, functionName: "settleMaturity", args: [] })

export type PostedOrder = { entityKey: Hex; orderHash: Hex; txHash: Hex }

/** Maker flow: sign the EIP-712 order for the Whitechain DvP, then publish it to Arkiv from the maker's wallet. */
export async function postOrder(p: { side: "buy" | "sell"; amount: bigint; price: string; ttlSeconds: number; note?: NoteDeployment }): Promise<PostedOrder> {
  const maker = me()
  const order: Order = {
    maker,
    security: (p.note ?? note!).token,
    payToken: d.usdt!,
    isSell: p.side === "sell",
    price: parseUnits(p.price, 6),
    amount: p.amount,
    nonce: randomNonce(),
    expiry: BigInt(Math.floor(Date.now() / 1000) + p.ttlSeconds),
  }
  await ensureChain(WC_CHAIN_ID)
  const signature = await signTypedData(wagmiConfig, orderTypedData(d.dvp!, order, WC_CHAIN_ID) as any)
  const orderHash = hashOrder(d.dvp!, order, WC_CHAIN_ID)
  await ensureChain(arkiv.id)
  const { entityKey, txHash } = await arkivWallet().createEntity(
    OrderEntity,
    orderToEntity(order, orderHash, signature, d.dvp!, WC_CHAIN_ID),
    { expiration: LIFETIME.order(order.expiry) },
  )
  return { entityKey, orderHash, txHash }
}

/** Taker flow: atomic DvP in USDT on Whitechain; the T-REX token enforces ERC-3643 inside the tx. */
export const fillOrder = (o: { order: Order; signature: Hex; amount: bigint }, force = false) =>
  write({ address: d.dvp!, abi: regXDvPAbi, functionName: "fill", args: [o.order, o.signature, o.amount] }, force)

export async function cancelOrder(o: { order: Order; entityKey: Hex; owner: Address }) {
  const hash = await write({ address: d.dvp!, abi: regXDvPAbi, functionName: "cancel", args: [o.order.nonce] })
  if (o.owner.toLowerCase() === me().toLowerCase()) {
    await ensureChain(arkiv.id)
    await arkivWallet().deleteEntity({ entityKey: o.entityKey })
  }
  return hash
}

export async function checkFill(order: Order, taker: Address, amount: bigint) {
  const [ok, reason] = (await chainClient.readContract({
    address: d.dvp!,
    abi: regXDvPAbi,
    functionName: "checkFill",
    args: [order, taker, amount],
  })) as [boolean, Hex]
  return { ok, reason }
}

// ---------------------------------------------------------------------- issuer agent (T-REX token agent role)

export const issuer = {
  freeze: (who: Address, frozen: boolean, n: NoteDeployment = note!) => write({ address: n.token, abi: tokenAbi, functionName: "setAddressFrozen", args: [who, frozen] }),
  pause: (n: NoteDeployment = note!) => write({ address: n.token, abi: tokenAbi, functionName: "pause", args: [] }),
  unpause: (n: NoteDeployment = note!) => write({ address: n.token, abi: tokenAbi, functionName: "unpause", args: [] }),
}
