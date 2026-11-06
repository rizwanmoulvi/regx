import { rabdi } from "@arkiv-network/sdk/chains"
import { hederaTestnet } from "viem/chains"

/** Hedera testnet with Multicall3 (deployed at the canonical address) so viem can batch reads. */
export const hederaTestnetMc = {
  ...hederaTestnet,
  contracts: { ...(hederaTestnet as any).contracts, multicall3: { address: "0xcA11bde05977b3631167028862bE2a173976CA11" as const } },
}

export { hederaTestnet }

export const HEDERA_CHAIN_ID = 296
export const ARKIV_CHAIN_ID = 7794095

export const HASHSCAN = "https://hashscan.io/testnet"
export const HEDERA_MIRROR = "https://testnet.mirrornode.hedera.com/api/v1"
export const ARKIV_EXPLORER = "https://rabdi.explorer.arkiv.network"

/** Arkiv Rabdi testnet. The access key is not a secret (it ships with any client), but is origin-restricted. */
export const arkivChain = (accessKey: string) => rabdi({ accessKey })

/** Hedera's JSON-RPC relay rejects gas estimation for some ATS calls; send explicit gas like ATS does. */
export const HEDERA_GAS = {
  price: 2_000_000_000_000n, // 2000 gwei (weibars), ATS default; relay refunds the unused part of the fee
  default: 3_000_000n,
  high: 10_000_000n,
  max: 15_000_000n,
} as const

export const hashscanTx = (hash: string) => `${HASHSCAN}/transaction/${hash}`
export const hashscanAddress = (addr: string) => `${HASHSCAN}/contract/${addr}`
export const hashscanAccount = (addr: string) => `${HASHSCAN}/account/${addr}`
export const arkivEntityUrl = (key: string) => `${ARKIV_EXPLORER}/entity/${key}`
export const arkivAddressUrl = (addr: string) => `${ARKIV_EXPLORER}/address/${addr}`
