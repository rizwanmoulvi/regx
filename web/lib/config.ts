import { createPublicClient as createArkivPublicClient } from "@arkiv-network/sdk"
import { arkivChain, deployment, hederaTestnet, hederaTestnetMc } from "@regx/shared"
import { http, createPublicClient } from "viem"
import { createConfig } from "wagmi"
import { injected } from "@wagmi/core"

export const ARKIV_ACCESS_KEY = process.env.NEXT_PUBLIC_ARKIV_ACCESS_KEY ?? ""
export const HASHIO = "https://testnet.hashio.io/api"

export const arkiv = arkivChain(ARKIV_ACCESS_KEY)
export const d = deployment

/** Browser requests go through a same-origin proxy (Hashio rate limits and CORS vary). */
const hederaRpc = typeof window === "undefined" ? HASHIO : "/api/rpc/hedera"

export const hederaClient = createPublicClient({
  chain: hederaTestnetMc,
  batch: { multicall: { wait: 30 } },
  transport: http(hederaRpc, { retryCount: 2, timeout: 30_000 }),
})

export const arkivClient = createArkivPublicClient({ chain: arkiv, transport: http() })

export const wagmiConfig = createConfig({
  chains: [hederaTestnet, arkiv],
  connectors: [injected()],
  transports: {
    [hederaTestnet.id]: http(hederaRpc),
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
