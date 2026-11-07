# RegX

**Compliant secondary market for tokenized invoice bonds.**
ERC-3643 (T-REX) securities issued with **Hedera Asset Tokenization Studio**, traded through a public order book that lives on **Arkiv**.

> Hedera says who may hold the bond. Arkiv makes the market for it public and queryable, and stale orders expire on their own.

Built at **ETHGlobal Mumbai 2026** for:
- **Hedera: Tokenize Anything with Hedera Studios** (ATS)
- **Arkiv: Build on Arkiv (from scratch)**

<!-- DEPLOYMENT:START -->
## Live on Whitechain Sepolia (chain 1874)

| Contract | Address (all verified on the explorer) |
|---|---|
| **ACME01**: T-REX Token (ERC-3643), trading until maturity | [`0xf65c3dffc32caa641a586819e274dcc4cbcc92f5`](https://explorer.testnet.whitechain.io/address/0xf65c3dffc32caa641a586819e274dcc4cbcc92f5) |
| ACME01 RegXNote (lifecycle + compliance module) | [`0x691737499b55e8eb3cae20a8db97b5a985f081d4`](https://explorer.testnet.whitechain.io/address/0x691737499b55e8eb3cae20a8db97b5a985f081d4) |
| ACME01 ModularCompliance / InvestorCapModule | [`0x3890da9e8644f71320c8d38bb2a214a363f85a82`](https://explorer.testnet.whitechain.io/address/0x3890da9e8644f71320c8d38bb2a214a363f85a82) / [`0xe785a928fbbc6f1bea42e1e98e32da8e322263a7`](https://explorer.testnet.whitechain.io/address/0xe785a928fbbc6f1bea42e1e98e32da8e322263a7) |
| **ACME02**: short-dated note, full lifecycle completed | [`0x42696162ed99138508542746c0a66e214d5475d7`](https://explorer.testnet.whitechain.io/address/0x42696162ed99138508542746c0a66e214d5475d7) (RegXNote [`0x326fdd596bf7cd8fd5b1a7289373db5b1e99deae`](https://explorer.testnet.whitechain.io/address/0x326fdd596bf7cd8fd5b1a7289373db5b1e99deae)) |
| T-REX IdentityRegistry | [`0x2eea85f43c798d6c15ea201eb2a97fdd24bed7d2`](https://explorer.testnet.whitechain.io/address/0x2eea85f43c798d6c15ea201eb2a97fdd24bed7d2) |
| ONCHAINID ClaimIssuer (KYC topic 1) | [`0x659ea68a839c5b581c49b6f4f5005a2d8370dad8`](https://explorer.testnet.whitechain.io/address/0x659ea68a839c5b581c49b6f4f5005a2d8370dad8) |
| TrustedIssuers / ClaimTopics / IdentityRegistryStorage | [`0x1563e43d5475b1cf093b2eaa4912408db355aba1`](https://explorer.testnet.whitechain.io/address/0x1563e43d5475b1cf093b2eaa4912408db355aba1) / [`0xd422dbade01fba80b938e2772bb368e9518ff60c`](https://explorer.testnet.whitechain.io/address/0xd422dbade01fba80b938e2772bb368e9518ff60c) / [`0x2badbb968b29076708f4dc6e8cd6899044e955a2`](https://explorer.testnet.whitechain.io/address/0x2badbb968b29076708f4dc6e8cd6899044e955a2) |
| **RegXDvP** | [`0x3bfbc24509c82bb524049b3e342926246c7176a9`](https://explorer.testnet.whitechain.io/address/0x3bfbc24509c82bb524049b3e342926246c7176a9) |
| Settlement asset: Whitechain test USDT | [`0xcedfB56113143d55b2358b8CFbB0dEB5Ad2f55a7`](https://explorer.testnet.whitechain.io/address/0xcedfB56113143d55b2358b8CFbB0dEB5Ad2f55a7) |

### USDT payments in the main flow (explorer links)

| Step | Party | Tx |
|---|---|---|
| Subscription: 30 units for **29.1 USDT** paid to the issuer | Alice → Acme | [0x1cca6c8e…](https://explorer.testnet.whitechain.io/tx/0x1cca6c8e035a63f013a219250ce02b5a6e5e503eaf5ce5b8a3fea1ef7744c61c) |
| Subscription: 10 units for 9.7 USDT | Bob → Acme | [0xf3ab83d9…](https://explorer.testnet.whitechain.io/tx/0xf3ab83d94e3dc3e05cb43d12fc77f09d6ad22fc5d32182f405ac97cc018f7845) |
| **Unverified subscriber rejected on-chain** | Carol | [0x0343498c…](https://explorer.testnet.whitechain.io/tx/0x0343498c82d986a4cfc44007c4bbec2555f282d4eaf39904f554b29e5cad82d6) |
| **Atomic DvP:** 10 units ↔ **9.9 USDT** in one tx (order read from Arkiv) | Bob ↔ Alice | [0xd277ba24…](https://explorer.testnet.whitechain.io/tx/0xd277ba24ad13601bb5f333c03349ee7097416adf0afea4d44b785258f338c956) |
| **Unverified buyer rejected on-chain**, USDT untouched | Carol | [0x252deb8e…](https://explorer.testnet.whitechain.io/tx/0x252deb8ed666fc26bd7f0ada491b44dd16868a67b15aecc546f118de868afbab) |
| ACME02 subscriptions | Alice, Bob | [0x11167655…](https://explorer.testnet.whitechain.io/tx/0x11167655abc95390be01a29ad5ec4394ccd633ebc41aeb51b7f622e1140ebe66) · [0x4f08b55c…](https://explorer.testnet.whitechain.io/tx/0x4f08b55c510df1b1994fed6ca6390dff72cd9b09ab877d0e0666a87efb9662a6) |
| **Coupon in USDT, auto-settled on the due date** by the keeper | Acme → holders | [0xb330abfe…](https://explorer.testnet.whitechain.io/tx/0xb330abfe3276c5ca1b5a8ca7184daa1b1ccc165bd4633add7270fc82bd952a7e) |
| **Maturity: 15 USDT face value repaid, units burned**, auto-settled | Acme → holders | [0x183c9dd7…](https://explorer.testnet.whitechain.io/tx/0x183c9dd7d56091f4f86aaf0380b732d51e114e58936095bb9ff226476503eb21) |

**Arkiv writers:** keeper [`0xee02FaA3ec03213c4a837a3F9Dc9D6F210ab74C5`](https://rabdi.explorer.arkiv.network/address/0xee02FaA3ec03213c4a837a3F9Dc9D6F210ab74C5) (assets, fills, actions); makers Alice [`0xfF6b6742Cce5c940b4EfFbE6f31e19b3f97f2753`](https://rabdi.explorer.arkiv.network/address/0xfF6b6742Cce5c940b4EfFbE6f31e19b3f97f2753) and Bob (orders).
**Example query:** `select().from(OrderEntity).where(and(eq("security", addr("0xf65c3dffc32caa641a586819e274dcc4cbcc92f5")), eq("side","sell"), gt("expiry", u64(now)))).orderBy(asc("price"))`
<!-- DEPLOYMENT:END -->

## Proven on testnet (Nov 7 2026)

| What | Evidence |
|---|---|
| ATS bond issued via factory, wired to T-REX registry + compliance | [`deployBond` tx](https://hashscan.io/testnet/transaction/0xfeb637f1a9b6cb00c4116722dc97f2294de42238d5daa5dc8a6171c8af2f6269) |
| Primary issuance passes ERC-3643 identity + compliance hooks | [mint 120 → Alice](https://hashscan.io/testnet/transaction/0x0588dab737fb8b75c97086eb3cc73ab707d0e82e8d269169ad6aa6cb696cf0cc) |
| Atomic DvP fill of an Arkiv order (Bob buys 25 @ ₹985) | [fill tx](https://hashscan.io/testnet/transaction/0x4f6e20c651a6804f224107ccc8e5502e17cb2bfa22ac5bcff530a311c54695aa) |
| Second fill (25 @ ₹990) | [fill tx](https://hashscan.io/testnet/transaction/0x760b369219c98c54c72c1c943fd058560ac2b79408126b739117cf20e6dad110) |
| **Unverified buyer rejected on-chain** (`AddressNotVerified`), cash leg rolled back | [Carol's reverted fill](https://hashscan.io/testnet/transaction/0x9b2da8a33893c9bbf4304485eec93a19a4539aee62a909a299055c9619fa7fc2) |
| Coupon recorded with ATS `setCoupon` (record-date snapshot) | [setCoupon tx](https://hashscan.io/testnet/transaction/0x634194450e11dc7b12f091a28faa117fa5594fb6c2d1003c5d2b0706f7ba18a3) |
| **Coupon paid by Hedera Scheduled Transactions**, executed by the network (`CONTRACTCALL SUCCESS`, `scheduled: true`) | [schedule 0.0.11346136](https://hashscan.io/testnet/schedule/0.0.11346136) (₹690.41 → Alice) · [schedule 0.0.11346140](https://hashscan.io/testnet/schedule/0.0.11346140) (₹493.15 → Bob) |
| Issuer freeze blocks the maker's orders (`AccountIsBlocked`), then unfreeze | [freeze](https://hashscan.io/testnet/transaction/0xd27deb2d5983b9f7894d515a1c1ded950dbc36428574cb1cba1a7acb3b228cf4) · [unfreeze](https://hashscan.io/testnet/transaction/0x04b4a339df23e8f8ea8cdf465396b555ca81fb0a5fa88c5697862fe8efacc104) |
| A 3-minute order disappeared from Arkiv on its own: in the book at 21:56:29Z, gone (entity deleted by expiry) at 21:59:50Z | entity `0x8d1b6c0a…a2c` |
| All RegX + T-REX + ONCHAINID contracts verified | Sourcify `exact_match` for all 11 (shown on HashScan) |

`npm run e2e` reproduces the trade, rejection and mirroring checks with assertions.


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
5. **Lifecycle.** Coupons (ATS `setCoupon` with a record-date snapshot, paid pro-rata in tINR through **Hedera Scheduled
   Transactions** that the network executes on the payment date), freezes and pauses happen on Hedera.
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
| `scripts/lifecycle.ts` | coupon (set + pay, or pay via Hedera Scheduled Transactions), freeze/unfreeze, pause/unpause, KYC grant/revoke, onboard |
| `scripts/lib/hiero.ts` | Hiero SDK: long-term Scheduled Transactions (HIP-423) |
| `scripts/e2e.ts` | testnet end-to-end assertions (fill, rejection, Arkiv mirroring) |
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
npm run lifecycle -- coupon:schedule --wait  # ATS setCoupon → snapshot → one Hedera Scheduled Transaction per holder, executed by the network
npm run lifecycle -- coupon              # same, but pays immediately from the script
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
