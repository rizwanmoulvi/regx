import { type Address, type Hex, defineChain } from "viem"
import raw from "../deployments/whitechain-sepolia.json"

/** Whitechain Sepolia testnet (OP Stack L2 on Ethereum Sepolia). docs.whitechain.io/learn/network/testnet */
export const whitechainSepolia = defineChain({
  id: 1874,
  name: "Whitechain Sepolia",
  nativeCurrency: { name: "WBT", symbol: "WBT", decimals: 18 },
  rpcUrls: {
    default: { http: ["https://rpc.testnet.whitechain.io"], webSocket: ["wss://rpc.testnet.whitechain.io/ws"] },
  },
  blockExplorers: { default: { name: "Whitechain Explorer", url: "https://explorer.testnet.whitechain.io" } },
  contracts: { multicall3: { address: "0xcA11bde05977b3631167028862bE2a173976CA11" } },
  testnet: true,
})

export const WC_CHAIN_ID = 1874
export const WC_EXPLORER = "https://explorer.testnet.whitechain.io"
/** Whitechain test USDT (6 decimals, EIP-2612 permit + EIP-3009). Payments must use this token. */
export const WC_USDT = "0xcedfB56113143d55b2358b8CFbB0dEB5Ad2f55a7" as Address
export const USDT_DECIMALS = 6

export const wcTx = (hash: string) => `${WC_EXPLORER}/tx/${hash}`
export const wcAddress = (addr: string) => `${WC_EXPLORER}/address/${addr}`
export const wcToken = (addr: string) => `${WC_EXPLORER}/token/${addr}`

export type NoteDeployment = {
  symbol: string
  name: string
  isin: string
  token: Address
  compliance: Address
  note: Address
  investorCap: Address
  terms: {
    faceValue: string // USDT base units per unit
    issuePrice: string
    couponPerUnit: string
    subscriptionEnd: string
    maturity: string
    couponDates: string[]
    investorCapUnits: string
  }
  deployedAt: string
  txs: Record<string, Hex>
}

export type WcDeployment = {
  network: "whitechain-sepolia"
  chainId: 1874
  deployer: Address
  keeper: Address
  usdt: Address
  dvp: Address
  trex: {
    claimTopicsRegistry: Address
    claimIssuer: Address
    trustedIssuersRegistry: Address
    identityRegistryStorage: Address
    identityRegistry: Address
  }
  identities: Record<string, Address>
  investors: Record<string, Address>
  notes: NoteDeployment[]
  active: number
  txs: Record<string, Hex>
}

export const wcDeployment = raw as unknown as Partial<WcDeployment>
export const activeNote = (d: Partial<WcDeployment> = wcDeployment): NoteDeployment | undefined =>
  d.notes?.[d.active ?? d.notes.length - 1]
