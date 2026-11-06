/** Fills the README deployment block (between DEPLOYMENT markers) from shared/deployments/hedera-testnet.json + live Arkiv counts. */
import { readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { Action, Asset, Fill, OrderEntity } from "../shared/src/arkiv"
import { ARKIV_EXPLORER, HASHSCAN } from "../shared/src/chains"
import { ROOT, arkiv, loadDeployment } from "./lib/env"

const d = loadDeployment() as any
const c = (a?: string) => (a ? `[\`${a}\`](${HASHSCAN}/contract/${a})` : "—")
const tx = (h?: string) => (h ? `[${h.slice(0, 10)}…](${HASHSCAN}/transaction/${h})` : "—")
const w = (a?: string) => (a ? `[\`${a}\`](${ARKIV_EXPLORER}/address/${a})` : "—")

async function count(schema: any) {
  try {
    return String(await (arkiv as any).count().from(schema).fetch())
  } catch {
    return "?"
  }
}

async function main() {
  const [assets, orders, fills, actions] = await Promise.all([count(Asset), count(OrderEntity), count(Fill), count(Action)])
  const block = `## Live deployment (Hedera testnet + Arkiv Rabdi)

| Component | Address |
|---|---|
| **ATS bond \`${d.bond?.symbol}\`** (ERC-1400 diamond, ERC-3643) | ${c(d.bond?.address)} ${d.bond?.hederaId ? `(\`${d.bond.hederaId}\`)` : ""} |
| ATS \`deployBond\` tx (via ATS Factory \`0.0.9213391\`) | ${tx(d.bond?.deployTx)} |
| T-REX IdentityRegistry | ${c(d.trex?.identityRegistry)} |
| T-REX ModularCompliance | ${c(d.trex?.modularCompliance)} |
| InvestorCapModule (RegX, ERC-3643 module) | ${c(d.investorCapModule)} |
| ONCHAINID ClaimIssuer (KYC topic 1) | ${c(d.trex?.claimIssuer)} |
| TrustedIssuersRegistry / ClaimTopicsRegistry / IdentityRegistryStorage | ${c(d.trex?.trustedIssuersRegistry)} / ${c(d.trex?.claimTopicsRegistry)} / ${c(d.trex?.identityRegistryStorage)} |
| **RegXDvP** settlement | ${c(d.dvp)} |
| tINR (test rupee) | ${c(d.tinr)} |

**Arkiv writer wallets** (Rabdi, chain 7794095):
- Keeper (\`regx.asset\`, \`regx.fill\`, \`regx.action\`): ${w(d.keeper)}
- Makers (\`regx.order\`, self-published): Alice ${w(d.investors?.alice)}, Bob ${w(d.investors?.bob)}

**Entities right now:** ${assets} assets · ${orders} orders · ${fills} fills · ${actions} actions

**Example query** (best asks for ${d.bond?.symbol}, read by anyone):
\`\`\`ts
await arkiv.select().from(OrderEntity)
  .where(and(eq("security", addr("${d.bond?.address}")), eq("side", "sell"), gt("expiry", u64(now))))
  .orderBy(asc("price")).limit(20).fetch()
// wire query: arkiv.schema = str('regx.order') AND security = addr(${d.bond?.address?.toLowerCase()}) AND side = str('sell') AND expiry > u64(<now>) ORDER BY price:dec ASC
\`\`\`
`
  const p = join(ROOT, "README.md")
  const readme = readFileSync(p, "utf8")
  const out = readme.replace(/<!-- DEPLOYMENT:START -->[\s\S]*<!-- DEPLOYMENT:END -->/, `<!-- DEPLOYMENT:START -->\n${block}<!-- DEPLOYMENT:END -->`)
  writeFileSync(p, out)
  console.log("README deployment block updated")
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
