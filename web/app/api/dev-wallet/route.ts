/**
 * Local-only test wallet for the demo personas (issuer, alice, bob, carol).
 * The browser gets an EIP-1193 provider (components/dev-wallet.tsx) that forwards signing requests here;
 * keys stay on the server and are read from the repo's gitignored .env. Only active under `next dev`
 * on localhost, so it never ships in a build.
 */
import { arkivChain, whitechainSepolia } from "@regx/shared"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { NextResponse } from "next/server"
import { type Chain, type Hex, createWalletClient, http } from "viem"
import { privateKeyToAccount } from "viem/accounts"

const ROLES = { issuer: "DEPLOYER", alice: "ALICE", bob: "BOB", carol: "CAROL" } as const
type Role = keyof typeof ROLES

function env(): Record<string, string> {
  const text = readFileSync(join(process.cwd(), "..", ".env"), "utf8")
  return Object.fromEntries(
    text
      .split("\n")
      .map((l) => l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/))
      .filter(Boolean)
      .map((m) => [m![1], m![2].replace(/^["']|["']$/g, "")]),
  )
}

function chains(): Record<number, { chain: Chain; rpc: string }> {
  const arkiv = arkivChain(process.env.NEXT_PUBLIC_ARKIV_ACCESS_KEY ?? "") as Chain
  return {
    [whitechainSepolia.id]: { chain: whitechainSepolia, rpc: "https://rpc.testnet.whitechain.io" },
    [arkiv.id]: { chain: arkiv, rpc: arkiv.rpcUrls.default.http[0] },
  }
}

const allowed = (req: Request) => {
  const host = new URL(req.url).hostname
  return process.env.NODE_ENV === "development" && ["localhost", "127.0.0.1", "[::1]"].includes(host)
}

/** eth_signTypedData_v4 sends numbers as strings; viem wants bigints for (u)int fields. */
function reviveTypedData(json: string) {
  const td = JSON.parse(json)
  const types: Record<string, { name: string; type: string }[]> = td.types
  const revive = (type: string, value: any): any => {
    if (/^u?int\d*$/.test(type)) return BigInt(value)
    if (type.endsWith("[]")) return (value as any[]).map((x) => revive(type.slice(0, -2), x))
    if (types[type]) return Object.fromEntries(types[type].map((f) => [f.name, revive(f.type, value[f.name])]))
    return value
  }
  const { EIP712Domain, ...rest } = types
  return {
    domain: { ...td.domain, ...(td.domain.chainId !== undefined ? { chainId: Number(td.domain.chainId) } : {}) },
    types: rest,
    primaryType: td.primaryType,
    message: revive(td.primaryType, td.message),
  }
}

export async function GET(req: Request) {
  if (!allowed(req)) return NextResponse.json({ error: "dev wallet disabled" }, { status: 404 })
  const e = env()
  const accounts = Object.fromEntries(
    Object.entries(ROLES).flatMap(([r, k]) => (e[`${k}_PRIVATE_KEY`] ? [[r, privateKeyToAccount(e[`${k}_PRIVATE_KEY`] as Hex).address]] : [])),
  )
  return NextResponse.json({ accounts })
}

export async function POST(req: Request) {
  if (!allowed(req)) return NextResponse.json({ error: "dev wallet disabled" }, { status: 404 })
  const { role, chainId, method, params = [] } = (await req.json()) as { role: Role; chainId: number; method: string; params?: any[] }
  const k = ROLES[role] && env()[`${ROLES[role]}_PRIVATE_KEY`]
  const net = chains()[chainId]
  if (!k || !net) return NextResponse.json({ error: { code: 4100, message: `unknown role or chain ${role}/${chainId}` } })
  const account = privateKeyToAccount(k as Hex)
  try {
    let result: unknown
    if (method === "eth_sendTransaction") {
      const tx = params[0]
      const wallet = createWalletClient({ chain: net.chain, transport: http(net.rpc), account })
      result = await wallet.sendTransaction({
        to: tx.to,
        data: tx.data ?? tx.input,
        value: tx.value ? BigInt(tx.value) : undefined,
        gas: tx.gas ? BigInt(tx.gas) : undefined,
      } as any)
    } else if (method === "eth_signTypedData_v4") {
      result = await account.signTypedData(reviveTypedData(typeof params[1] === "string" ? params[1] : JSON.stringify(params[1])) as any)
    } else if (method === "personal_sign") {
      result = await account.signMessage({ message: { raw: params[0] } })
    } else {
      const r = await fetch(net.rpc, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
      })
      const j = await r.json()
      if (j.error) return NextResponse.json({ error: j.error })
      result = j.result
    }
    return NextResponse.json({ result })
  } catch (e: any) {
    console.error(`[dev-wallet] ${role} ${method} failed:`, e.shortMessage ?? e.message, JSON.stringify(params).slice(0, 300))
    return NextResponse.json({ error: { code: -32000, message: e.shortMessage ?? e.message, data: e.data } })
  }
}
