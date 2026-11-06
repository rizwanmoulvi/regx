"use client"

import {
  type BookOrder,
  atsSecurityAbi,
  fetchActions,
  fetchAssets,
  fetchBook,
  fetchFills,
  fetchOrdersByMaker,
  fromJsonBytes,
  identityRegistryAbi,
  regXDvPAbi,
  tINRAbi,
  v,
} from "@regx/shared"
import { useQuery } from "@tanstack/react-query"
import type { Address, Hex } from "viem"
import { arkivClient, d, hederaClient } from "./config"

export type AssetView = {
  entityKey: Hex
  owner: Address
  expiresAt?: bigint
  security: Address
  hederaId: string
  issuer: Address
  status: string
  symbol: string
  name: string
  decimals: number
  currency: string
  faceValue: number
  couponBps: number
  maturity: number
  maxSupply: bigint
  totalSupply: bigint
  holders: bigint
  compliance: string
  identityRegistry: Address
  complianceContract: Address
  dvp: Address
  payToken: Address
  updatedAt: number
  meta: Record<string, any>
}

export function parseAsset(row: Record<string, unknown>): AssetView {
  return {
    entityKey: v<Hex>(row.$key),
    owner: v<Address>(row.$owner),
    expiresAt: row.$expiresAt !== undefined ? BigInt(v<bigint>(row.$expiresAt)) : undefined,
    security: v<Address>(row.security),
    hederaId: v<string>(row.hederaId),
    issuer: v<Address>(row.issuer),
    status: v<string>(row.status),
    symbol: v<string>(row.symbol),
    name: v<string>(row.name),
    decimals: Number(v<bigint>(row.decimals)),
    currency: v<string>(row.currency),
    faceValue: Number(v<string>(row.faceValue)),
    couponBps: Number(v<bigint>(row.couponBps)),
    maturity: Number(v<bigint>(row.maturity)),
    maxSupply: BigInt(v<bigint>(row.maxSupply)),
    totalSupply: BigInt(v<bigint>(row.totalSupply)),
    holders: BigInt(v<bigint>(row.holders)),
    compliance: v<string>(row.compliance),
    identityRegistry: v<Address>(row.identityRegistry),
    complianceContract: v<Address>(row.complianceContract),
    dvp: v<Address>(row.dvp),
    payToken: v<Address>(row.payToken),
    updatedAt: Number(v<bigint>(row.updatedAt)),
    meta: fromJsonBytes(v(row.meta) as any),
  }
}

export type FillView = {
  entityKey: Hex
  orderHash: Hex
  maker: Address
  taker: Address
  side: string
  price: number
  amount: bigint
  cost: number
  hederaTx: Hex
  timestamp: number
}
export const parseFill = (r: Record<string, unknown>): FillView => ({
  entityKey: v<Hex>(r.$key),
  orderHash: v<Hex>(r.orderHash),
  maker: v<Address>(r.maker),
  taker: v<Address>(r.taker),
  side: v<string>(r.side),
  price: Number(v<string>(r.price)),
  amount: BigInt(v<bigint>(r.amount)),
  cost: Number(v<string>(r.cost)),
  hederaTx: v<Hex>(r.hederaTx),
  timestamp: Number(v<bigint>(r.timestamp)),
})

export type ActionView = {
  entityKey: Hex
  kind: string
  subject?: Address
  hederaTx: Hex
  timestamp: number
  summary: string
  meta: Record<string, any>
}
export const parseAction = (r: Record<string, unknown>): ActionView => ({
  entityKey: v<Hex>(r.$key),
  kind: v<string>(r.kind),
  subject: r.subject ? v<Address>(r.subject) : undefined,
  hederaTx: v<Hex>(r.hederaTx),
  timestamp: Number(v<bigint>(r.timestamp)),
  summary: v<string>(r.summary),
  meta: fromJsonBytes(v(r.meta) as any),
})

// ---------------------------------------------------------------------- hooks

export const useAssets = () =>
  useQuery({
    queryKey: ["assets"],
    queryFn: async () => (await fetchAssets(arkivClient)).map(parseAsset),
    refetchInterval: 20_000,
  })

export type LiveOrder = BookOrder & { remaining: bigint; makerFrozen: boolean; makerVerified: boolean }

async function enrich(orders: BookOrder[]): Promise<LiveOrder[]> {
  return Promise.all(
    orders.map(async (o) => {
      const [remaining, makerFrozen, makerVerified] = await Promise.all([
        hederaClient.readContract({ address: o.dvp, abi: regXDvPAbi, functionName: "remaining", args: [o.order] }).catch(() => o.order.amount),
        hederaClient.readContract({ address: o.order.security, abi: atsSecurityAbi, functionName: "isFrozen", args: [o.order.maker] }).catch(() => false),
        d.trex
          ? hederaClient.readContract({ address: d.trex.identityRegistry, abi: identityRegistryAbi, functionName: "isVerified", args: [o.order.maker] }).catch(() => true)
          : Promise.resolve(true),
      ])
      return { ...o, remaining: remaining as bigint, makerFrozen: makerFrozen as boolean, makerVerified: makerVerified as boolean }
    }),
  )
}

export const useBook = (security?: Address) =>
  useQuery({
    queryKey: ["book", security],
    enabled: Boolean(security),
    queryFn: async () => {
      const [asks, bids] = await Promise.all([fetchBook(arkivClient, security!, "sell"), fetchBook(arkivClient, security!, "buy")])
      const [a, b] = await Promise.all([enrich(asks), enrich(bids)])
      return { asks: a.filter((o) => o.remaining > 0n), bids: b.filter((o) => o.remaining > 0n), raw: asks.length + bids.length }
    },
    refetchInterval: 8_000,
  })

export const useMyOrders = (maker?: Address) =>
  useQuery({
    queryKey: ["myOrders", maker],
    enabled: Boolean(maker),
    queryFn: async () => enrich(await fetchOrdersByMaker(arkivClient, maker!)),
    refetchInterval: 10_000,
  })

export const useFills = (security?: Address, limit = 50) =>
  useQuery({
    queryKey: ["fills", security, limit],
    queryFn: async () => (await fetchFills(arkivClient, security, limit)).map(parseFill),
    refetchInterval: 8_000,
  })

export const useActions = (security?: Address, limit = 50) =>
  useQuery({
    queryKey: ["actions", security, limit],
    queryFn: async () => (await fetchActions(arkivClient, security, limit)).map(parseAction),
    refetchInterval: 10_000,
  })

export type AccountState = {
  verified: boolean
  frozen: boolean
  units: bigint
  tinr: bigint
  tinrAllowance: bigint
  bondAllowance: bigint
  hbar: bigint
  glm: bigint
}

export const useAccountState = (address?: Address) =>
  useQuery({
    queryKey: ["account", address],
    enabled: Boolean(address && d.bond?.address),
    queryFn: async (): Promise<AccountState> => {
      const a = address!
      const bond = d.bond!.address
      const [verified, frozen, units, tinr, tinrAllowance, bondAllowance, hbar, glm] = await Promise.all([
        hederaClient.readContract({ address: d.trex!.identityRegistry, abi: identityRegistryAbi, functionName: "isVerified", args: [a] }),
        hederaClient.readContract({ address: bond, abi: atsSecurityAbi, functionName: "isFrozen", args: [a] }),
        hederaClient.readContract({ address: bond, abi: atsSecurityAbi, functionName: "balanceOf", args: [a] }),
        hederaClient.readContract({ address: d.tinr!, abi: tINRAbi, functionName: "balanceOf", args: [a] }),
        hederaClient.readContract({ address: d.tinr!, abi: tINRAbi, functionName: "allowance", args: [a, d.dvp!] }),
        hederaClient.readContract({ address: bond, abi: atsSecurityAbi, functionName: "allowance", args: [a, d.dvp!] }),
        hederaClient.getBalance({ address: a }),
        arkivClient.getBalance({ address: a }),
      ])
      return { verified, frozen, units, tinr, tinrAllowance, bondAllowance, hbar, glm } as AccountState
    },
    refetchInterval: 10_000,
  })

export const useBondLive = () =>
  useQuery({
    queryKey: ["bondLive"],
    enabled: Boolean(d.bond?.address),
    queryFn: async () => {
      const bond = d.bond!.address
      const [paused, totalSupply, holders] = await Promise.all([
        hederaClient.readContract({ address: bond, abi: atsSecurityAbi, functionName: "paused" }),
        hederaClient.readContract({ address: bond, abi: atsSecurityAbi, functionName: "totalSupply" }),
        hederaClient.readContract({ address: bond, abi: atsSecurityAbi, functionName: "getSecurityHolders", args: [0n, 50n] }),
      ])
      return { paused, totalSupply, holders: holders as Address[] }
    },
    refetchInterval: 10_000,
  })
