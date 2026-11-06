# RegX

**Compliant secondary market for tokenized invoice bonds.**
ERC-3643 (T-REX) securities issued with **Hedera Asset Tokenization Studio**, traded through a public order book that lives on **Arkiv**.

> Hedera says who may hold the bond. Arkiv makes the market for it public and queryable, and stale orders expire on their own.

Built at **ETHGlobal Mumbai 2026** for:
- **Hedera: Tokenize Anything with Hedera Studios** (ATS)
- **Arkiv: Build on Arkiv (from scratch)**

<!-- DEPLOYMENT:START -->
_Deployment details are filled in by `npm run readme` after `npm run deploy`._
<!-- DEPLOYMENT:END -->

---

## The problem

Indian MSMEs have well over ₹10 lakh crore stuck in unpaid receivables. Invoice-discounting platforms tokenize or fractionalize these
notes, but **an investor can't exit before maturity**: every platform is a silo with its own KYC and its own order book. A tokenized
security can't trade on an open DEX either, because every holder has to be an eligible, verified investor.

## What RegX does

1. **Issue.** An arranger issues an invoice-backed bond (`ACME01`: ₹1,000 face, 12% coupon, 90 days) through the **Hedera ATS factory**.
   The bond is wired to a **T-REX Identity Registry** and **Modular Compliance**, so ERC-3643 transfer rules are enforced by the token itself.
2. **Verify.** A compliance agent issues a signed **KYC claim** to each investor's **ONCHAINID**. The claim issuer is trusted for topic 1 (KYC).
   No personal data goes on-chain or to Arkiv.
3. **Trade.** Makers sign **EIP-712 orders** and publish them as **`regx.order` entities on Arkiv** from their own wallets. The entity expires
   exactly when the order does. Anyone can query the book.
4. **Settle.** Takers call `RegXDvP.fill()`. The cash (tINR) and the security move **atomically**. The ATS token checks both parties'
   identities, runs the compliance modules (per-investor holding cap), and checks freezes and pauses. An unverified buyer's fill reverts
   on-chain, and the cash leg rolls back with it.
5. **Lifecycle.** Coupons (ATS `setCoupon` with a record-date snapshot, paid pro-rata in tINR), freezes and pauses happen on Hedera.
   A keeper mirrors every trade and corporate action to Arkiv (`regx.fill`, `regx.action`), so the market's history is public data.

## Architecture

```
          ┌──────────────────────── Web app (Next.js · wagmi · viem) ─────────────────────────┐
          │ Markets │ Asset: order book + trade │ Portfolio │ Activity │ Issuer console       │
          └────┬───────────────────────────────────┬──────────────────────────────────────────┘
   createEntity│ select().from(schema).where()     │ fill() · checkFill() · approve()
               ▼                                   ▼
┌───────────────────────────────┐     ┌────────────────────────────────────────────────────────┐
│ Arkiv Rabdi (7794095)         │     │ Hedera testnet (296)                                   │
│  regx.order   ← maker wallets │     │  ATS bond (ERC-1400 diamond via ATS Factory)           │
│  regx.fill    ← keeper        │     │    ├─ identityRegistry → T-REX IdentityRegistry        │
│  regx.action  ← keeper        │◄────│    │     ├─ ClaimTopicsRegistry (topic 1 = KYC)        │
│  regx.asset   ← keeper (sync) │ keeper   │     ├─ TrustedIssuersRegistry → ClaimIssuer (ONCHAINID)
└───────────────────────────────┘     │    │     └─ IdentityRegistryStorage ← investor ONCHAINIDs │
                                      │    └─ compliance → T-REX ModularCompliance             │
                                      │          └─ InvestorCapModule (max units per wallet)   │
                                      │  RegXDvP (EIP-712 orders, atomic DvP) · tINR (ERC-20)  │
                                      └────────────────────────────────────────────────────────┘
```

**Source of truth:** ownership, balances, eligibility and filled amounts live on Hedera. Intent (open orders), terms, trade prints and
corporate actions live on Arkiv. The UI shows `order.amount − RegXDvP.filled(orderHash)` read from Hedera, so Arkiv order entities never
need patching.

### How ERC-3643 is enforced (verified in the ATS source)
ATS `ERC1594StorageWrapper` checks, on every transfer: control list (freeze), `IdentityRegistry.isVerified(from/to)`,
`Compliance.canTransfer(from, to, value)`, and `Compliance.canTransfer(operator, 0x0, 0)` for the operator (our DvP). It then calls
`Compliance.transferred/created/destroyed` hooks. We created the bond with `internalKycActivated = false`, so **eligibility comes entirely
from T-REX ONCHAINID claims**. Stock T-REX modules resolve the recipient's identity and revert on the operator check, so we wrote
`InvestorCapModule`, which allows that call.

## Repository

| Path | What |
|---|---|
| `contracts/src/RegXDvP.sol` | EIP-712 order settlement, partial fills, cancel by nonce, `checkFill` pre-trade view |
| `contracts/src/compliance/InvestorCapModule.sol` | ERC-3643 compliance module (holding cap), ATS-compatible |
| `contracts/src/TINR.sol` | test rupee (6 dp) with an open faucet |
| `contracts/test/RegXDvP.t.sol` | 13 Foundry tests against the **real T-REX + ONCHAINID** contracts |
| `shared/src/arkiv.ts` | Arkiv schemas + every query the app uses |
| `shared/src/abis/ats.ts` | ATS factory / bond ABI subset + role ids |
| `scripts/deploy.ts` | resumable end-to-end deployment (T-REX stack → ATS bond → onboarding → issuance) |
| `scripts/keeper.ts` | Hedera events → Arkiv `regx.fill` / `regx.action` (idempotent, re-runnable) |
| `scripts/arkiv-sync-assets.ts` | re-runnable Hedera → Arkiv `regx.asset` sync |
| `scripts/lifecycle.ts` | coupon (set + pay), freeze/unfreeze, pause/unpause, KYC grant/revoke, onboard |
| `scripts/seed-orders.ts` | demo orders signed and published by Alice/Bob |
| `web/` | Next.js app |
| `arkiv/` | Arkiv judging files: schema, why, how, reach, friction |

## Run it

Prereqs: Node 22.10+, Foundry.

```bash
npm install
cd contracts && npm install && forge build && forge test && cd ..
npm run abis

cp .env.example .env    # demo keys + ARKIV_ACCESS_KEY; fund DEPLOYER with ~100 testnet HBAR and some tGLM
npm run deploy          # resumable; writes shared/deployments/hedera-testnet.json
npm run verify          # HashScan (Sourcify) verification
npm run seed:orders     # Alice asks, Bob bids, all on Arkiv
npm run keeper          # leave running: mirrors fills & corporate actions to Arkiv

echo "NEXT_PUBLIC_ARKIV_ACCESS_KEY=..." > web/.env.local
npm run web             # http://localhost:3000
```

Lifecycle:

```bash
npm run lifecycle -- coupon              # ATS setCoupon (record date +60s) → snapshot → pay tINR pro-rata → regx.action
npm run lifecycle -- freeze alice        # ATS setAddressFrozen: Alice's orders become unfillable
npm run lifecycle -- unfreeze alice
npm run lifecycle -- pause | unpause
npm run lifecycle -- onboard 0xYourWallet   # ONCHAINID + KYC claim + Identity Registry
npm run seed:orders -- --flash           # 3-minute order: watch it expire off the book on its own
npm run status                           # balances, eligibility, book, fills, actions
```

## Demo script (≤ 4 min)

1. **Issuance:** `npm run deploy` output. ATS `deployBond` tx + bond contract on HashScan.
2. **Configuration:** Issuer console shows the Identity Registry, Modular Compliance and InvestorCapModule. Alice and Bob are verified, Carol is not.
3. **Trade:** Alice posts a sell order and the `regx.order` entity appears on the Arkiv explorer. Bob fills 25 in one atomic DvP tx on HashScan,
   and the fill appears in `regx.fill`.
4. **Compliance:** Carol tries to buy. The pre-trade check says she's not a verified investor. She sends anyway and it **reverts on-chain**.
5. **Lifecycle:** `npm run lifecycle -- coupon` pays the coupon to holders at the snapshot. `freeze alice` makes her orders unfillable.
   Both show up in the Arkiv actions feed.
6. **Expiry:** a 2-minute order disappears from the book with no transaction.

## AI disclosure

This project was built with substantial help from an AI coding assistant (Claude Code): research into the ATS, T-REX and Arkiv SDK sources,
contract and test code, scripts, the web app and documentation. All on-chain deployments, transactions and Arkiv entities listed above
were produced by running this code on testnet.

## License

MIT for RegX code. T-REX (GPL-3.0) and ONCHAINID (GPL-3.0) contracts are used as npm dependencies. Hedera ATS (Apache-2.0) is used through its
deployed testnet factory.
