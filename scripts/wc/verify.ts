/** Verifies every RegX contract on the Whitechain Sepolia explorer (Blockscout).  npm run wc:verify */
import { execFileSync } from "node:child_process"
import { join } from "node:path"
import { type Address, encodeAbiParameters } from "viem"
import { ROOT, log } from "../lib/env"
import { requireWc } from "../lib/wc"

const d = requireWc()
const enc = (types: string[], values: unknown[]) => encodeAbiParameters(types.map((type) => ({ type })), values as any)
const TREX = "node_modules/@tokenysolutions/t-rex/contracts"
const OID = "node_modules/@onchain-id/solidity/contracts"

const targets: [Address, string, string?][] = [
  [d.dvp, "src/RegXDvP.sol:RegXDvP"],
  [d.trex.claimTopicsRegistry, `${TREX}/registry/implementation/ClaimTopicsRegistry.sol:ClaimTopicsRegistry`],
  [d.trex.trustedIssuersRegistry, `${TREX}/registry/implementation/TrustedIssuersRegistry.sol:TrustedIssuersRegistry`],
  [d.trex.identityRegistryStorage, `${TREX}/registry/implementation/IdentityRegistryStorage.sol:IdentityRegistryStorage`],
  [d.trex.identityRegistry, `${TREX}/registry/implementation/IdentityRegistry.sol:IdentityRegistry`],
  [d.trex.claimIssuer, `${OID}/ClaimIssuer.sol:ClaimIssuer`, enc(["address"], [d.deployer])],
  ...Object.values(d.identities).map((a) => [a, `${OID}/Identity.sol:Identity`, enc(["address", "bool"], [d.deployer, false])] as [Address, string, string]),
  ...d.notes.flatMap(
    (n) =>
      [
        [n.token, `${TREX}/token/Token.sol:Token`],
        [n.note, "src/RegXNote.sol:RegXNote"],
        [n.compliance, `${TREX}/compliance/modular/ModularCompliance.sol:ModularCompliance`],
        [n.investorCap, "src/compliance/InvestorCapModule.sol:InvestorCapModule"],
      ] as [Address, string][],
  ),
]

for (const [address, id, args] of targets) {
  const argv = [
    "verify-contract", address, id,
    "--rpc-url", "https://rpc.testnet.whitechain.io/",
    "--verifier", "blockscout",
    "--verifier-url", "https://explorer.testnet.whitechain.io/api/",
    "--watch",
    ...(args ? ["--constructor-args", args] : []),
  ]
  try {
    const out = execFileSync("forge", argv, { cwd: join(ROOT, "contracts"), encoding: "utf8", stdio: "pipe" })
    const status = out.split("\n").filter((l) => /Pass|verified|Verified|Already/i.test(l)).pop() ?? "submitted"
    log(`✓ ${id.split(":")[1].padEnd(24)} ${address}  ${status.trim()}`)
  } catch (e: any) {
    const msg = ((e.stdout || "") + (e.stderr || "")).toString().split("\n").filter((l: string) => l.trim() && !l.startsWith("Submitting")).slice(-2).join(" | ")
    log(`✗ ${id.split(":")[1].padEnd(24)} ${address}  ${msg}`)
  }
}
