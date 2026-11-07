"use client"

import {
  type BookOrder,
  fetchActions,
  fetchAssets,
  fetchBook,
  fetchFills,
  fetchOrdersByMaker,
  fromJsonBytes,
  identityRegistryAbi,
  regXDvPAbi,
  regXNoteAbi,
  tokenAbi,
  v,
} from "@regx/shared"
import { useQuery } from "@tanstack/react-query"
import { type Address, type Hex, erc20Abi } from "viem"
import type { NoteDeployment } from "@regx/shared"
import { arkivClient, chainClient, d, note } from "./config"

export type AssetView = {
  entityKey: Hex
  owner: Address
  security: Address
  issuer: Address
  status: string
  symbol: string
  name: string
  decimals: number
  currency: string
  faceValue: number
  couponBps: number
  maturity: number
  totalSupply: bigint
  holders: bigint
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
    security: v<Address>(row.security),
    issuer: v<Address>(row.issuer),
    status: v<string>(row.status),
    symbol: v<string>(row.symbol),
    name: v<string>(row.name),
    decimals: Number(v<bigint>(row.decimals)),
    currency: v<string>(row.currency),
    faceValue: Number(v<string>(row.faceValue)),
    couponBps: Number(v<bigint>(row.couponBps)),
    maturity: Number(v<bigint>(row.maturity)),
    totalSupply: BigInt(v<bigint>(row.totalSupply)),
    holders: BigInt(v<bigint>(row.holders)),
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
  tx: Hex
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
  tx: v<Hex>(r.hederaTx),
  timestamp: Number(v<bigint>(r.timestamp)),
})

export type ActionView = {
  entityKey: Hex
  kind: string
  subject?: Address
  tx: Hex
  timestamp: number
  summary: string
  meta: Record<string, any>
}
export const parseAction = (r: Record<string, unknown>): ActionView => ({
  entityKey: v<Hex>(r.$key),
  kind: v<string>(r.kind),
  subject: r.subject ? v<Address>(r.subject) : undefined,
  tx: v<Hex>(r.hederaTx),
  timestamp: Number(v<bigint>(r.timestamp)),
  summary: v<string>(r.summary),
  meta: fromJsonBytes(v(r.meta) as any),
})

// ---------------------------------------------------------------------- Arkiv reads

export const useAssets = () =>
  useQuery({
    queryKey: ["assets"],
    queryFn: async () => (await fetchAssets(arkivClient, "invoice-note")).map(parseAsset),
    refetchInterval: 20_000,
  })

export type LiveOrder = BookOrder & { remaining: bigint; makerFrozen: boolean; makerVerified: boolean }

async function enrich(orders: BookOrder[]): Promise<LiveOrder[]> {
  return Promise.all(
    orders.map(async (o) => {
      const [remaining, makerFrozen, makerVerified] = await Promise.all([
        chainClient.readContract({ address: o.dvp, abi: regXDvPAbi, functionName: "remaining", args: [o.order] }).catch(() => o.order.amount),
        chainClient.readContract({ address: o.order.security, abi: tokenAbi, functionName: "isFrozen", args: [o.order.maker] }).catch(() => false),
        d.trex
          ? chainClient.readContract({ address: d.trex.identityRegistry, abi: identityRegistryAbi, functionName: "isVerified", args: [o.order.maker] }).catch(() => true)
          : Promise.resolve(true),
      ])
      return { ...o, remaining: remaining as bigint, makerFrozen: makerFrozen as boolean, makerVerified: makerVerified as boolean }
    }),
  )
}

const onVenue = (o: BookOrder) => o.dvp.toLowerCase() === d.dvp?.toLowerCase()

export const useBook = (security?: Address) =>
  useQuery({
    queryKey: ["book", security],
    enabled: Boolean(security),
    queryFn: async () => {
      const [asks, bids] = await Promise.all([fetchBook(arkivClient, security!, "sell"), fetchBook(arkivClient, security!, "buy")])
      const [a, b] = await Promise.all([enrich(asks.filter(onVenue)), enrich(bids.filter(onVenue))])
      return { asks: a.filter((o) => o.remaining > 0n), bids: b.filter((o) => o.remaining > 0n) }
    },
    refetchInterval: 8_000,
  })

export const useMyOrders = (maker?: Address) =>
  useQuery({
    queryKey: ["myOrders", maker],
    enabled: Boolean(maker),
    queryFn: async () => enrich((await fetchOrdersByMaker(arkivClient, maker!)).filter(onVenue)),
    refetchInterval: 10_000,
  })

export const useFills = (security?: Address, limit = 50) =>
  useQuery({
    queryKey: ["fills", security, limit],
    enabled: Boolean(security),
    queryFn: async () => (await fetchFills(arkivClient, security, limit)).map(parseFill),
    refetchInterval: 8_000,
  })

export const useActions = (security?: Address, limit = 50) =>
  useQuery({
    queryKey: ["actions", security, limit],
    enabled: Boolean(security),
    queryFn: async () => (await fetchActions(arkivClient, security, limit)).map(parseAction),
    refetchInterval: 10_000,
  })

// ---------------------------------------------------------------------- Whitechain reads

export type AccountState = {
  verified: boolean
  frozen: boolean
  units: bigint
  usdt: bigint
  usdtToDvp: bigint
  usdtToNote: bigint
  unitsToDvp: bigint
  wbt: bigint
  glm: bigint
}

export const useAccountState = (address?: Address, n: NoteDeployment | undefined = note) =>
  useQuery({
    queryKey: ["account", address, n?.token],
    enabled: Boolean(address && n),
    queryFn: async (): Promise<AccountState> => {
      const a = address!
      const note = n
      const [verified, frozen, units, usdt, usdtToDvp, usdtToNote, unitsToDvp, wbt, glm] = await Promise.all([
        chainClient.readContract({ address: d.trex!.identityRegistry, abi: identityRegistryAbi, functionName: "isVerified", args: [a] }),
        chainClient.readContract({ address: note!.token, abi: tokenAbi, functionName: "isFrozen", args: [a] }),
        chainClient.readContract({ address: note!.token, abi: tokenAbi, functionName: "balanceOf", args: [a] }),
        chainClient.readContract({ address: d.usdt!, abi: erc20Abi, functionName: "balanceOf", args: [a] }),
        chainClient.readContract({ address: d.usdt!, abi: erc20Abi, functionName: "allowance", args: [a, d.dvp!] }),
        chainClient.readContract({ address: d.usdt!, abi: erc20Abi, functionName: "allowance", args: [a, note!.note] }),
        chainClient.readContract({ address: note!.token, abi: tokenAbi, functionName: "allowance", args: [a, d.dvp!] }),
        chainClient.getBalance({ address: a }),
        arkivClient.getBalance({ address: a }),
      ])
      return { verified, frozen, units, usdt, usdtToDvp, usdtToNote, unitsToDvp, wbt, glm } as AccountState
    },
    refetchInterval: 10_000,
  })

export type NoteLive = {
  paused: boolean
  totalSupply: bigint
  holders: Address[]
  matured: boolean
  couponPaid: boolean[]
  obligation: { amount: bigint; due: number; isMaturity: boolean }
  issuerUsdt: bigint
  issuerAllowance: bigint
}

export const useNoteLive = (nd: NoteDeployment | undefined = note) =>
  useQuery({
    queryKey: ["noteLive", nd?.token],
    enabled: Boolean(nd),
    queryFn: async (): Promise<NoteLive> => {
      const n = nd!
      const [paused, totalSupply, holders, matured, obligation, issuerUsdt, issuerAllowance, ...paid] = await Promise.all([
        chainClient.readContract({ address: n.token, abi: tokenAbi, functionName: "paused" }),
        chainClient.readContract({ address: n.token, abi: tokenAbi, functionName: "totalSupply" }),
        chainClient.readContract({ address: n.note, abi: regXNoteAbi, functionName: "holders" }),
        chainClient.readContract({ address: n.note, abi: regXNoteAbi, functionName: "matured" }),
        chainClient.readContract({ address: n.note, abi: regXNoteAbi, functionName: "nextObligation" }),
        chainClient.readContract({ address: d.usdt!, abi: erc20Abi, functionName: "balanceOf", args: [d.deployer!] }),
        chainClient.readContract({ address: d.usdt!, abi: erc20Abi, functionName: "allowance", args: [d.deployer!, n.note] }),
        ...n.terms.couponDates.map((_, i) =>
          chainClient.readContract({ address: n.note, abi: regXNoteAbi, functionName: "couponPaid", args: [BigInt(i)] }),
        ),
      ])
      const ob = obligation as readonly [bigint, bigint, boolean]
      return {
        paused: paused as boolean,
        totalSupply: totalSupply as bigint,
        holders: holders as Address[],
        matured: matured as boolean,
        couponPaid: paid as boolean[],
        obligation: { amount: ob[0], due: Number(ob[1]), isMaturity: ob[2] },
        issuerUsdt: issuerUsdt as bigint,
        issuerAllowance: issuerAllowance as bigint,
      }
    },
    refetchInterval: 8_000,
  })
