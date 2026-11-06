import { Section } from "@/components/ui"

const QUERY = `import { createPublicClient } from "@arkiv-network/sdk"
import { rabdi } from "@arkiv-network/sdk/chains"
import { and, asc, eq, gt } from "@arkiv-network/sdk/query"
import { addr, u64 } from "@arkiv-network/sdk/schema"
import { OrderEntity } from "@regx/shared"

const arkiv = createPublicClient({ chain: rabdi({ accessKey: "" }), transport: http() })

// Best asks for the note, read by anyone with no API key
const { entities } = await arkiv.select().from(OrderEntity)
  .where(and(eq("security", addr(NOTE)), eq("side", "sell"), gt("expiry", u64(now))))
  .orderBy(asc("price")).limit(20).fetch()`

export default function About() {
  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div>
        <h1 className="text-2xl font-bold">How RegX works</h1>
        <p className="mt-2 text-muted">
          Whitechain enforces who may hold the note and moves the USDT. Arkiv makes the market for it public and queryable, and stale
          orders expire on their own.
        </p>
      </div>

      <Section title="Parties">
        <ul className="grid gap-2 text-sm sm:grid-cols-2">
          <li><b>Acme Textiles (issuer):</b> tokenizes a receivable as an ERC-3643 note, receives USDT from investors, and owes coupons and face value.</li>
          <li><b>Compliance agent:</b> signs KYC claims onto investors&apos; ONCHAINIDs. It is the trusted claim issuer in the T-REX registry.</li>
          <li><b>Alice &amp; Bob (verified investors):</b> fund the invoice at a discount, trade it before maturity, and get repaid in USDT.</li>
          <li><b>Carol (not verified):</b> can browse and even sign transactions, but the token rejects every mint or transfer to her.</li>
        </ul>
      </Section>

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
            <text x="36" y="132" fontWeight="700" fill="var(--bid)">Whitechain Sepolia: rules + USDT</text>
            <text x="36" y="156">T-REX Token (ERC-3643) for the invoice note</text>
            <text x="36" y="176">Identity Registry + ONCHAINID KYC claims</text>
            <text x="36" y="196">Compliance: RegXNote + InvestorCapModule</text>
            <text x="36" y="216">RegXNote: subscribe · coupon · maturity</text>
            <text x="36" y="236">RegXDvP: atomic EIP-712 settlement in USDT</text>
            <text x="36" y="262" fill="var(--muted)" fontSize="11">every payment in Whitechain test USDT</text>

            <rect x="400" y="110" width="300" height="170" rx="12" fill="var(--panel)" stroke="var(--accent)" />
            <text x="416" y="132" fontWeight="700" fill="var(--accent)">Arkiv Rabdi: the public market</text>
            <text x="416" y="156">regx.order: signed orders, maker-owned</text>
            <text x="416" y="176">  expire exactly when the order does</text>
            <text x="416" y="196">regx.fill: trades + Whitechain tx hash</text>
            <text x="416" y="216">regx.action: subscriptions, coupons, KYC</text>
            <text x="416" y="236">regx.asset: note terms (re-runnable sync)</text>
            <text x="416" y="262" fill="var(--muted)" fontSize="11">typed, indexed, queryable by anyone</text>

            <line x1="300" y1="60" x2="200" y2="108" stroke="var(--muted)" markerEnd="url(#ar)" />
            <text x="160" y="84" fill="var(--muted)" fontSize="11">subscribe · fill · settle</text>
            <line x1="420" y1="60" x2="520" y2="108" stroke="var(--muted)" markerEnd="url(#ar)" />
            <text x="480" y="84" fill="var(--muted)" fontSize="11">createEntity · query</text>
            <line x1="322" y1="200" x2="396" y2="200" stroke="var(--muted)" strokeDasharray="4 3" markerEnd="url(#ar)" />
            <text x="359" y="190" textAnchor="middle" fill="var(--muted)" fontSize="10">keeper</text>
          </g>
        </svg>
      </Section>

      <Section title="The lifecycle, end to end">
        <ol className="list-decimal space-y-2 pl-5 text-sm">
          <li><b>Issuance.</b> Alice calls <code>RegXNote.subscribe(30)</code>. 29.1 USDT goes to Acme and 30 units are minted, but only after the token checks her ONCHAINID claim and the holding cap.</li>
          <li><b>Trading.</b> Alice signs an EIP-712 sell order and publishes it as a <b>regx.order</b> entity on Arkiv. Bob fills it through <code>RegXDvP</code>: USDT and the note move in one transaction.</li>
          <li><b>Compliance.</b> Carol has no KYC claim, so the T-REX token reverts her fill and her USDT never leaves her wallet. Frozen wallets, pauses, the holding cap and maturity are all enforced in the same transfer path.</li>
          <li><b>Coupon.</b> After the coupon date anyone can call <code>payCoupon</code>. USDT goes pro-rata from Acme&apos;s allowance to every holder.</li>
          <li><b>Maturity.</b> Trading stops on-chain. <code>settleMaturity</code> pays face value in USDT to every holder and burns their units. If Acme hasn&apos;t funded it, the call reverts in public, which is an on-chain default.</li>
        </ol>
      </Section>

      <Section title="Read the market yourself">
        <pre className="num overflow-x-auto rounded-lg bg-panel-2 p-3 text-xs leading-relaxed">{QUERY}</pre>
      </Section>
    </div>
  )
}
