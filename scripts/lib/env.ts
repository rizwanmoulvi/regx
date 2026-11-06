import "dotenv/config"
import { readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { createPublicClient as arkivPublic, createWalletClient as arkivWallet } from "@arkiv-network/sdk"
import {
  type Abi,
  type Address,
  type Hex,
  createPublicClient,
  createWalletClient,
  encodeDeployData,
  http,
  type PublicClient,
} from "viem"
import { privateKeyToAccount } from "viem/accounts"
import { HEDERA_GAS, arkivChain, hederaTestnet } from "../../shared/src/chains"
import type { Deployment } from "../../shared/src/deployments"

export const ROOT = join(import.meta.dirname, "..", "..")
export const DEPLOYMENT_FILE = join(ROOT, "shared", "deployments", "hedera-testnet.json")

export const HEDERA_RPC = process.env.HEDERA_RPC_URL || "https://testnet.hashio.io/api"
export const ARKIV_ACCESS_KEY = process.env.ARKIV_ACCESS_KEY ?? ""

export const ROLES = ["deployer", "alice", "bob", "carol", "keeper"] as const
export type Role = (typeof ROLES)[number]

export function key(role: Role): Hex {
  const k = process.env[`${role.toUpperCase()}_PRIVATE_KEY`]
  if (!k) throw new Error(`Missing ${role.toUpperCase()}_PRIVATE_KEY in .env`)
  return k as Hex
}
export const account = (role: Role) => privateKeyToAccount(key(role))

export const hedera: PublicClient = createPublicClient({
  chain: hederaTestnet,
  transport: http(HEDERA_RPC, { timeout: 30_000, retryCount: 4, retryDelay: 800 }),
})

export const hederaWallet = (role: Role) =>
  createWalletClient({ chain: hederaTestnet, transport: http(HEDERA_RPC, { timeout: 60_000 }), account: account(role) })

export const arkiv = arkivPublic({ chain: arkivChain(ARKIV_ACCESS_KEY), transport: http() })
export const arkivWalletFor = (role: Role) =>
  arkivWallet({ chain: arkivChain(ARKIV_ACCESS_KEY), transport: http(), account: account(role) })

// ------------------------------------------------------------------ deployment state

export function loadDeployment(): Partial<Deployment> {
  try {
    return JSON.parse(readFileSync(DEPLOYMENT_FILE, "utf8"))
  } catch {
    return {}
  }
}
export function saveDeployment(d: Partial<Deployment>) {
  writeFileSync(DEPLOYMENT_FILE, JSON.stringify(d, null, 2) + "\n")
}
export function requireDeployment(): Deployment {
  const d = loadDeployment()
  if (!d.bond?.address || !d.dvp) throw new Error("Not deployed yet: run `npm run deploy` first")
  return d as Deployment
}

// ------------------------------------------------------------------ hedera tx helpers

export function artifact(name: string): { abi: Abi; bytecode: Hex } {
  const a = JSON.parse(readFileSync(join(ROOT, "contracts", "out", `${name}.sol`, `${name}.json`), "utf8"))
  return { abi: a.abi, bytecode: a.bytecode.object }
}

const gasOpts = (gas: bigint) => ({ gas, gasPrice: HEDERA_GAS.price, type: "legacy" as const })

/** Polls for the receipt directly (viem's block-watching wait stalls under Hashio rate limits). */
export async function waitOk(hash: Hex, label: string) {
  const deadline = Date.now() + 240_000
  for (;;) {
    try {
      const r = await hedera.getTransactionReceipt({ hash })
      if (r.status !== "success") throw new Error(`${label} reverted: ${hash}`)
      return r
    } catch (e: any) {
      if (e.message?.includes("reverted")) throw e
      if (Date.now() > deadline) throw new Error(`${label}: no receipt after 4 min (${hash})`)
      await sleep(2_500)
    }
  }
}

/**
 * Hedera charges at least 80% of the gas limit, so limits come from eth_estimateGas plus a 25%
 * buffer. If the relay can't estimate (some ATS calls), fall back to the given fixed limit.
 */
async function tightGas(estimate: () => Promise<bigint>, fallback: bigint) {
  try {
    const est = await estimate()
    const gas = (est * 125n) / 100n + 30_000n
    return gas > HEDERA_GAS.max ? HEDERA_GAS.max : gas
  } catch {
    return fallback
  }
}

export async function deploy(role: Role, name: string, args: unknown[] = [], fallbackGas: bigint = HEDERA_GAS.default) {
  const { abi, bytecode } = artifact(name)
  const data = encodeDeployData({ abi, bytecode, args })
  const gas = await tightGas(() => hedera.estimateGas({ account: account(role), data }), fallbackGas)
  const hash = await hederaWallet(role).deployContract({ abi, bytecode, args, ...gasOpts(gas) })
  const r = await waitOk(hash, `deploy ${name}`)
  if (!r.contractAddress) throw new Error(`no contract address for ${name}`)
  log(`  ✓ ${name} → ${r.contractAddress}`)
  return r.contractAddress as Address
}

export async function send(
  role: Role,
  address: Address,
  abi: Abi | readonly unknown[],
  functionName: string,
  args: unknown[] = [],
  fallbackGas: bigint = HEDERA_GAS.default,
) {
  const gas = await tightGas(
    () => hedera.estimateContractGas({ address, abi: abi as Abi, functionName, args, account: account(role) } as any),
    fallbackGas,
  )
  const hash = await hederaWallet(role).writeContract({
    address,
    abi: abi as Abi,
    functionName,
    args,
    ...gasOpts(gas),
  } as any)
  await waitOk(hash, functionName)
  log(`  ✓ ${role}: ${functionName}(${args.map(short).join(", ")})  ${hash}`)
  return hash
}

/** Simulates first (surfacing the decoded revert reason), then sends. */
export async function simulateAndSend(
  role: Role,
  address: Address,
  abi: Abi | readonly unknown[],
  functionName: string,
  args: unknown[] = [],
  gas: bigint = HEDERA_GAS.default,
) {
  await hedera.simulateContract({ address, abi: abi as Abi, functionName, args, account: account(role) } as any)
  return send(role, address, abi, functionName, args, gas)
}

export const read = <T = unknown>(address: Address, abi: Abi | readonly unknown[], functionName: string, args: unknown[] = []) =>
  hedera.readContract({ address, abi: abi as Abi, functionName, args } as any) as Promise<T>

export async function contractId(address: Address): Promise<string | undefined> {
  try {
    const r = await fetch(`https://testnet.mirrornode.hedera.com/api/v1/contracts/${address}`)
    if (!r.ok) return undefined
    return ((await r.json()) as { contract_id?: string }).contract_id
  } catch {
    return undefined
  }
}

export const short = (x: unknown) => {
  const s = typeof x === "bigint" ? x.toString() : typeof x === "object" ? JSON.stringify(x, bigintJson) : String(x)
  return s.length > 24 ? `${s.slice(0, 10)}…${s.slice(-6)}` : s
}
export const bigintJson = (_: string, v: unknown) => (typeof v === "bigint" ? v.toString() : v)
export const log = (...a: unknown[]) => console.log(...a)
export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
