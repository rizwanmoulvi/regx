"use client"

import { createWalletClient as createArkivWalletClient } from "@arkiv-network/sdk"
import {
  LIFETIME,
  type Order,
  OrderEntity,
  atsSecurityAbi,
  explainError,
  hashOrder,
  orderToEntity,
  orderTypedData,
  randomNonce,
  regXDvPAbi,
  tINRAbi,
  hederaTestnet,
} from "@regx/shared"
import { getAccount, signTypedData, switchChain, waitForTransactionReceipt, writeContract } from "wagmi/actions"
import { type Address, type Hex, custom, maxUint256, parseUnits } from "viem"
import { arkiv, d, hederaClient, wagmiConfig } from "./config"

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

/** Sends a Hedera tx after a dry run, so the user sees the decoded revert reason instead of a failed tx. */
export class RevertedOnChain extends Error {
  constructor(public hash: Hex) {
    super(`Reverted on-chain: ${hash}`)
  }
}

/**
 * Sends a Hedera tx after a dry run, so the user sees the decoded revert reason instead of a failed tx.
 * `force` skips the dry run and sends with a fixed gas limit, which puts a compliance rejection on-chain
 * (visible on HashScan) for demos.
 */
async function hederaWrite(params: { address: Address; abi: any; functionName: string; args: unknown[] }, force = false) {
  await ensureChain(hederaTestnet.id)
  if (!force) {
    try {
      await hederaClient.simulateContract({ ...params, account: me() } as any)
    } catch (e) {
      throw new Error(explainError(e))
    }
  }
  const hash = await writeContract(wagmiConfig, {
    ...params,
    chainId: hederaTestnet.id,
    ...(force ? { gas: 1_500_000n } : {}),
  } as any)
  const r = await waitForTransactionReceipt(wagmiConfig, { hash, chainId: hederaTestnet.id, timeout: 120_000 })
  if (r.status !== "success") throw new RevertedOnChain(hash)
  return hash
}

export const approveTinr = () =>
  hederaWrite({ address: d.tinr!, abi: tINRAbi, functionName: "approve", args: [d.dvp, maxUint256] })

export const approveBond = (amount = 1_000_000n) =>
  hederaWrite({ address: d.bond!.address, abi: atsSecurityAbi, functionName: "approve", args: [d.dvp, amount] })

export const tinrFaucet = () => hederaWrite({ address: d.tinr!, abi: tINRAbi, functionName: "faucet", args: [] })

export type PostedOrder = { entityKey: Hex; orderHash: Hex; txHash: Hex }

/** Maker flow: sign the EIP-712 order on Hedera's domain, then publish it to Arkiv from the maker's wallet. */
export async function postOrder(p: { side: "buy" | "sell"; amount: bigint; priceInr: string; ttlSeconds: number }): Promise<PostedOrder> {
  const maker = me()
  const order: Order = {
    maker,
    security: d.bond!.address,
    payToken: d.tinr!,
    isSell: p.side === "sell",
    price: parseUnits(p.priceInr, 6),
    amount: p.amount,
    nonce: randomNonce(),
    expiry: BigInt(Math.floor(Date.now() / 1000) + p.ttlSeconds),
  }
  await ensureChain(hederaTestnet.id)
  const signature = await signTypedData(wagmiConfig, orderTypedData(d.dvp!, order) as any)
  const orderHash = hashOrder(d.dvp!, order)

  await ensureChain(arkiv.id)
  const { entityKey, txHash } = await arkivWallet().createEntity(
    OrderEntity,
    orderToEntity(order, orderHash, signature, d.dvp!),
    { expiration: LIFETIME.order(order.expiry) },
  )
  return { entityKey, orderHash, txHash }
}

/** Taker flow: atomic DvP on Hedera. Compliance (ERC-3643) is enforced by the ATS token inside the tx. */
export async function fillOrder(o: { order: Order; signature: Hex; amount: bigint }, force = false) {
  return hederaWrite({ address: d.dvp!, abi: regXDvPAbi, functionName: "fill", args: [o.order, o.signature, o.amount] }, force)
}

export async function cancelOrder(o: { order: Order; entityKey: Hex; owner: Address }) {
  const hash = await hederaWrite({ address: d.dvp!, abi: regXDvPAbi, functionName: "cancel", args: [o.order.nonce] })
  if (o.owner.toLowerCase() === me().toLowerCase()) {
    await ensureChain(arkiv.id)
    await arkivWallet().deleteEntity({ entityKey: o.entityKey })
  }
  return hash
}

export async function checkFill(order: Order, taker: Address, amount: bigint) {
  const [ok, reason] = (await hederaClient.readContract({
    address: d.dvp!,
    abi: regXDvPAbi,
    functionName: "checkFill",
    args: [order, taker, amount],
  })) as [boolean, Hex]
  return { ok, reason }
}

// ---------------------------------------------------------------------- issuer (requires issuer roles)

export const issuer = {
  freeze: (who: Address, frozen: boolean) =>
    hederaWrite({ address: d.bond!.address, abi: atsSecurityAbi, functionName: "setAddressFrozen", args: [who, frozen] }),
  pause: () => hederaWrite({ address: d.bond!.address, abi: atsSecurityAbi, functionName: "pause", args: [] }),
  unpause: () => hederaWrite({ address: d.bond!.address, abi: atsSecurityAbi, functionName: "unpause", args: [] }),
}
