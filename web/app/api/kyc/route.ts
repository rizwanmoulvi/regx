/**
 * Demo KYC desk (opt-in): lets judges try RegX with their own wallet.
 * The server acts as the compliance agent. It deploys an ONCHAINID for the wallet, signs a KYC claim
 * with the trusted claim issuer key, registers the identity in the T-REX Identity Registry, and drips
 * a little HBAR + tGLM for gas. Disabled unless DEMO_KYC_ENABLED=1; capped by DEMO_KYC_MAX.
 */
import { createWalletClient as createArkivWallet, createPublicClient as createArkivPublic } from "@arkiv-network/sdk"
import { arkivChain, deployment as d, hederaTestnet, identityAbi, identityRegistryAbi, HEDERA_GAS } from "@regx/shared"
import { identityBytecode } from "@regx/shared/bytecode"
import { NextResponse } from "next/server"
import {
  type Address,
  type Hex,
  createPublicClient,
  createWalletClient,
  encodeAbiParameters,
  http,
  isAddress,
  keccak256,
  parseEther,
  toHex,
} from "viem"
import { privateKeyToAccount } from "viem/accounts"

const RPC = process.env.HEDERA_RPC_URL || "https://testnet.hashio.io/api"
const served = new Set<string>()

export async function POST(req: Request) {
  if (process.env.DEMO_KYC_ENABLED !== "1") return NextResponse.json({ error: "Demo KYC desk is disabled" }, { status: 403 })
  const pk = process.env.DEMO_KYC_PRIVATE_KEY as Hex | undefined
  if (!pk || !d.trex) return NextResponse.json({ error: "Not configured" }, { status: 500 })
  const { address } = (await req.json()) as { address?: string }
  if (!address || !isAddress(address)) return NextResponse.json({ error: "Invalid address" }, { status: 400 })
  if (served.size >= Number(process.env.DEMO_KYC_MAX ?? 8)) return NextResponse.json({ error: "Demo KYC quota used up" }, { status: 429 })
  const wallet = address as Address
  if (served.has(wallet.toLowerCase())) return NextResponse.json({ error: "Already onboarded" }, { status: 409 })
  served.add(wallet.toLowerCase())

  const agent = privateKeyToAccount(pk)
  const pub = createPublicClient({ chain: hederaTestnet, transport: http(RPC) })
  const w = createWalletClient({ chain: hederaTestnet, transport: http(RPC), account: agent })
  const opts = { gasPrice: HEDERA_GAS.price, type: "legacy" as const }
  const wait = async (hash: Hex) => {
    for (let i = 0; i < 90; i++) {
      try {
        const r = await pub.getTransactionReceipt({ hash })
        if (r.status !== "success") throw new Error(`reverted ${hash}`)
        return r
      } catch (e: any) {
        if (String(e.message).includes("reverted")) throw e
        await new Promise((r) => setTimeout(r, 2500))
      }
    }
    throw new Error(`timeout ${hash}`)
  }

  try {
    const txs: Record<string, Hex> = {}
    if (await pub.readContract({ address: d.trex.identityRegistry, abi: identityRegistryAbi, functionName: "isVerified", args: [wallet] }))
      return NextResponse.json({ ok: true, already: true })

    txs.identity = await w.deployContract({ abi: identityAbi, bytecode: identityBytecode, args: [agent.address, false], gas: 2_600_000n, ...opts })
    const identity = (await wait(txs.identity)).contractAddress as Address

    const data = toHex(`KYC:IN:demo:${wallet.toLowerCase()}`)
    const digest = keccak256(encodeAbiParameters([{ type: "address" }, { type: "uint256" }, { type: "bytes" }], [identity, 1n, data]))
    const sig = await agent.signMessage({ message: { raw: digest } })
    txs.claim = await w.writeContract({ address: identity, abi: identityAbi, functionName: "addClaim", args: [1n, 1n, d.trex.claimIssuer, sig, data, "regx://kyc/demo"], gas: 600_000n, ...opts })
    await wait(txs.claim)
    txs.register = await w.writeContract({ address: d.trex.identityRegistry, abi: identityRegistryAbi, functionName: "registerIdentity", args: [wallet, identity, 356], gas: 900_000n, ...opts })
    await wait(txs.register)

    // gas drip so the wallet can approve, trade and publish orders
    if ((await pub.getBalance({ address: wallet })) < parseEther("1")) {
      txs.hbar = await w.sendTransaction({ to: wallet, value: parseEther("2"), gas: 1_500_000n, ...opts })
      await wait(txs.hbar)
    }
    const ark = arkivChain(process.env.NEXT_PUBLIC_ARKIV_ACCESS_KEY ?? "")
    const arkPub = createArkivPublic({ chain: ark, transport: http() })
    if ((await arkPub.getBalance({ address: wallet })) < parseEther("0.02")) {
      const arkW = createArkivWallet({ chain: ark, transport: http(), account: agent })
      txs.tglm = await arkW.sendTransaction({ to: wallet, value: parseEther("0.05") } as any)
    }
    return NextResponse.json({ ok: true, identity, txs })
  } catch (e: any) {
    served.delete(wallet.toLowerCase())
    return NextResponse.json({ error: e.shortMessage ?? e.message ?? String(e) }, { status: 500 })
  }
}
