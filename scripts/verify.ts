/**
 * Verifies every RegX-deployed contract on HashScan (Hedera's Sourcify instance).
 *   npm run verify
 */
import { execFileSync } from "node:child_process"
import { join } from "node:path"
import { type Address, encodeAbiParameters } from "viem"
import { ROOT, log, requireDeployment } from "./lib/env"

const d = requireDeployment()
const enc = (types: string[], values: unknown[]) =>
  encodeAbiParameters(types.map((type) => ({ type })), values as any)

const targets: [Address, string, string?][] = [
  [d.tinr, "src/TINR.sol:TINR"],
  [d.dvp, "src/RegXDvP.sol:RegXDvP"],
  [d.investorCapModule, "src/compliance/InvestorCapModule.sol:InvestorCapModule"],
  [d.trex.claimTopicsRegistry, "node_modules/@tokenysolutions/t-rex/contracts/registry/implementation/ClaimTopicsRegistry.sol:ClaimTopicsRegistry"],
  [d.trex.trustedIssuersRegistry, "node_modules/@tokenysolutions/t-rex/contracts/registry/implementation/TrustedIssuersRegistry.sol:TrustedIssuersRegistry"],
  [d.trex.identityRegistryStorage, "node_modules/@tokenysolutions/t-rex/contracts/registry/implementation/IdentityRegistryStorage.sol:IdentityRegistryStorage"],
  [d.trex.identityRegistry, "node_modules/@tokenysolutions/t-rex/contracts/registry/implementation/IdentityRegistry.sol:IdentityRegistry"],
  [d.trex.modularCompliance, "node_modules/@tokenysolutions/t-rex/contracts/compliance/modular/ModularCompliance.sol:ModularCompliance"],
  [d.trex.claimIssuer, "node_modules/@onchain-id/solidity/contracts/ClaimIssuer.sol:ClaimIssuer", enc(["address"], [d.deployer])],
  ...Object.values(d.identities).map(
    (a) => [a, "node_modules/@onchain-id/solidity/contracts/Identity.sol:Identity", enc(["address", "bool"], [d.deployer, false])] as [Address, string, string],
  ),
]

for (const [address, id, args] of targets) {
  if (!address) continue
  const argv = [
    "verify-contract",
    address,
    id,
    "--chain-id",
    "296",
    "--verifier",
    "sourcify",
    "--verifier-url",
    "https://sourcify.dev/server/",
    ...(args ? ["--constructor-args", args] : []),
  ]
  try {
    const out = execFileSync("forge", argv, { cwd: join(ROOT, "contracts"), encoding: "utf8", stdio: "pipe" })
    log(`✓ ${id.split(":")[1]} ${address}\n${out.trim().split("\n").slice(-2).join("\n")}`)
  } catch (e: any) {
    log(`✗ ${id.split(":")[1]} ${address}: ${((e.stdout || "") + (e.stderr || "") || e.message).toString().trim().split("\n").filter((l: string) => !l.startsWith("Submitting")).slice(-3).join(" | ")}`)
  }
}
log(`\nhttps://hashscan.io/testnet/contract/${d.dvp}`)
