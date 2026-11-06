import { createPublicClient as createArkivPublicClient } from "@arkiv-network/sdk"
import { activeNote, arkivChain, wcDeployment, whitechainSepolia } from "@regx/shared"
import { http, createPublicClient } from "viem"
import { createConfig } from "wagmi"
import { injected } from "@wagmi/core"

export const ARKIV_ACCESS_KEY = process.env.NEXT_PUBLIC_ARKIV_ACCESS_KEY ?? ""
export const WC_RPC = "https://rpc.testnet.whitechain.io"

export const arkiv = arkivChain(ARKIV_ACCESS_KEY)
/** Venue: Whitechain Sepolia (chain 1874). Settlement in Whitechain test USDT. */
export const venue = whitechainSepolia
export const d = wcDeployment
export const note = activeNote(d)

/** Browser requests go through a same-origin proxy with retries. */
const rpc = typeof window === "undefined" ? WC_RPC : "/api/rpc/wc"

export const chainClient = createPublicClient({
  chain: whitechainSepolia,
  batch: { multicall: { wait: 20 } },
  transport: http(rpc, { retryCount: 2, timeout: 20_000 }),
})

export const arkivClient = createArkivPublicClient({ chain: arkiv, transport: http() })

export const wagmiConfig = createConfig({
  chains: [whitechainSepolia, arkiv],
  connectors: [injected()],
  transports: {
    [whitechainSepolia.id]: http(rpc),
    [arkiv.id]: http(),
  },
  ssr: true,
})

declare module "wagmi" {
  interface Register {
    config: typeof wagmiConfig
  }
}

export const NAMES: Record<string, string> = Object.fromEntries(
  Object.entries(d.investors ?? {}).map(([k, a]) => [a.toLowerCase(), k[0].toUpperCase() + k.slice(1)]),
)
if (d.deployer) NAMES[d.deployer.toLowerCase()] = "Issuer"
if (d.keeper) NAMES[d.keeper.toLowerCase()] = "Keeper"

export const nameOf = (a?: string) => (a ? NAMES[a.toLowerCase()] ?? `${a.slice(0, 6)}…${a.slice(-4)}` : "")
