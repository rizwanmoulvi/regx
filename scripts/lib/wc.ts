/** Whitechain Sepolia clients and tx helpers for scripts (deploy, lifecycle, keeper, e2e). */
import "dotenv/config"
import { readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { type Abi, type Address, type Hex, createPublicClient, createWalletClient, encodeDeployData, http } from "viem"
import { whitechainSepolia } from "../../shared/src/whitechain"
import type { WcDeployment } from "../../shared/src/whitechain"
import { ROOT, type Role, account, artifact, log, short, sleep } from "./env"

export const WC_RPC = process.env.WHITECHAIN_RPC_URL || "https://rpc.testnet.whitechain.io"
export const WC_FILE = join(ROOT, "shared", "deployments", "whitechain-sepolia.json")

export const wc = createPublicClient({
  chain: whitechainSepolia,
  transport: http(WC_RPC, { timeout: 30_000, retryCount: 4, retryDelay: 500 }),
  batch: { multicall: { wait: 20 } },
})
export const wcWallet = (role: Role) =>
  createWalletClient({ chain: whitechainSepolia, transport: http(WC_RPC, { timeout: 30_000 }), account: account(role) })

export function loadWc(): Partial<WcDeployment> {
  try {
    return JSON.parse(readFileSync(WC_FILE, "utf8"))
  } catch {
    return {}
  }
}
export const saveWc = (d: Partial<WcDeployment>) => writeFileSync(WC_FILE, JSON.stringify(d, null, 2) + "\n")
export function requireWc(): WcDeployment {
  const d = loadWc()
  if (!d.dvp || !d.notes?.length) throw new Error("Whitechain not deployed yet: run `npm run wc:deploy`")
  return d as WcDeployment
}

export async function wcWait(hash: Hex, label: string) {
  const r = await wc.waitForTransactionReceipt({ hash, timeout: 120_000, pollingInterval: 1_000 })
  if (r.status !== "success") throw new Error(`${label} reverted: ${hash}`)
  return r
}

export async function wcDeploy(role: Role, name: string, args: unknown[] = []) {
  const { abi, bytecode } = artifact(name)
  const est = await wc.estimateGas({ account: account(role), data: encodeDeployData({ abi, bytecode, args }) })
  const hash = await wcWallet(role).deployContract({ abi, bytecode, args, gas: (est * 12n) / 10n })
  const r = await wcWait(hash, `deploy ${name}`)
  log(`  ✓ ${name} → ${r.contractAddress}`)
  return r.contractAddress as Address
}

/** Simulates (surfacing the decoded revert), then sends with an estimated gas limit. */
export async function wcSend(role: Role, address: Address, abi: Abi | readonly unknown[], functionName: string, args: unknown[] = []) {
  const { request } = await wc.simulateContract({ address, abi: abi as Abi, functionName, args, account: account(role) } as any)
  const hash = await wcWallet(role).writeContract(request as any)
  await wcWait(hash, functionName)
  log(`  ✓ ${role}: ${functionName}(${args.map(short).join(", ")})  ${hash}`)
  return hash
}

export const wcRead = <T = unknown>(address: Address, abi: Abi | readonly unknown[], functionName: string, args: unknown[] = []) =>
  wc.readContract({ address, abi: abi as Abi, functionName, args } as any) as Promise<T>

export { sleep }
