import { Section } from "@/components/ui"

const QUERY = `import { createPublicClient } from "@arkiv-network/sdk"
import { rabdi } from "@arkiv-network/sdk/chains"
import { and, asc, eq, gt } from "@arkiv-network/sdk/query"
import { addr, u64 } from "@arkiv-network/sdk/schema"
import { OrderEntity } from "@regx/shared"

const arkiv = createPublicClient({ chain: rabdi({ accessKey: "" }), transport: http() })

// Best asks for ACME01, read by anyone with no API key
const { entities } = await arkiv.select().from(OrderEntity)
  .where(and(eq("security", addr(BOND)), eq("side", "sell"), gt("expiry", u64(now))))
  .orderBy(asc("price")).limit(20).fetch()`

export default function About() {
  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div>
        <h1 className="text-2xl font-bold">How RegX works</h1>
        <p className="mt-2 text-muted">
          Hedera decides who is allowed to hold the bond. Arkiv makes the market for it public and queryable, and stale orders expire on
          their own.
        </p>
      </div>

      <Section title="Architecture">
        <svg viewBox="0 0 720 300" className="w-full" role="img" aria-label="RegX architecture diagram">
          <defs>
            <marker id="ar" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto">
              <path d="M0,0 L10,5 L0,10 z" fill="var(--muted)" />
            </marker>
          </defs>
          <g fontFamily="var(--font-plex-sans)" fontSize="12" fill="var(--text)">
            <rect x="250" y="10" width="220" height="50" rx="10" fill="var(--panel-2)" stroke="var(--border)" />
            <text x="360" y="32" textAnchor="middle" fontWeight="700">RegX web app</text>
            <text x="360" y="48" textAnchor="middle" fill="var(--muted)" fontSize="11">wallet signs · reads both chains</text>

            <rect x="20" y="110" width="300" height="170" rx="12" fill="var(--panel)" stroke="var(--bid)" />
            <text x="36" y="132" fontWeight="700" fill="var(--bid)">Hedera testnet: who may hold</text>
            <text x="36" y="156">ATS bond (ERC-1400 diamond, ERC-3643)</text>
            <text x="36" y="176">T-REX Identity Registry + ONCHAINID KYC claims</text>
            <text x="36" y="196">Modular Compliance + InvestorCapModule</text>
            <text x="36" y="216">RegXDvP: atomic EIP-712 order settlement</text>
            <text x="36" y="236">tINR cash leg</text>
            <text x="36" y="262" fill="var(--muted)" fontSize="11">freeze · pause · coupon · mint (ATS lifecycle)</text>

            <rect x="400" y="110" width="300" height="170" rx="12" fill="var(--panel)" stroke="var(--accent)" />
            <text x="416" y="132" fontWeight="700" fill="var(--accent)">Arkiv Rabdi: the public market</text>
            <text x="416" y="156">regx.order: signed orders, maker-owned</text>
            <text x="416" y="176">  expire exactly when the order does</text>
            <text x="416" y="196">regx.fill: trades + Hedera tx hash</text>
            <text x="416" y="216">regx.action: coupons, freezes, KYC</text>
            <text x="416" y="236">regx.asset: bond terms (re-runnable sync)</text>
            <text x="416" y="262" fill="var(--muted)" fontSize="11">typed, indexed, queryable by anyone</text>

            <line x1="300" y1="60" x2="200" y2="108" stroke="var(--muted)" markerEnd="url(#ar)" />
            <text x="190" y="84" fill="var(--muted)" fontSize="11">fill() · checkFill()</text>
            <line x1="420" y1="60" x2="520" y2="108" stroke="var(--muted)" markerEnd="url(#ar)" />
            <text x="480" y="84" fill="var(--muted)" fontSize="11">createEntity · query</text>
            <line x1="322" y1="200" x2="396" y2="200" stroke="var(--muted)" strokeDasharray="4 3" markerEnd="url(#ar)" />
            <text x="359" y="190" textAnchor="middle" fill="var(--muted)" fontSize="10">keeper</text>
          </g>
        </svg>
      </Section>

      <Section title="A trade, end to end">
        <ol className="list-decimal space-y-2 pl-5 text-sm">
          <li>
            Alice signs an EIP-712 <code>Order</code> for the RegXDvP contract (Hedera chain 296) and publishes it as a{" "}
            <b>regx.order</b> entity on Arkiv from her own wallet. The entity's expiry equals the order's expiry.
          </li>
          <li>Bob's browser queries Arkiv for the best asks and reads the remaining size from the DvP contract.</li>
          <li>
            Bob calls <code>fill()</code>. tINR moves Bob → Alice and ACME01 moves Alice → Bob in one transaction. The ATS token checks both
            ONCHAINIDs in the T-REX Identity Registry, runs the Modular Compliance (holding cap), and checks freezes and pauses.
          </li>
          <li>Carol has no KYC claim, so her fill reverts inside the token, and the cash leg rolls back with it.</li>
          <li>The keeper mirrors the <code>Filled</code> event into <b>regx.fill</b>. History stays public and queryable.</li>
        </ol>
      </Section>

      <Section title="Read the market yourself">
        <pre className="num overflow-x-auto rounded-lg bg-panel-2 p-3 text-xs leading-relaxed">{QUERY}</pre>
      </Section>
    </div>
  )
}
