# RegX: PRD

**Compliant secondary market for tokenized MSME invoice bonds.**
ERC-3643 (T-REX) securities issued with Hedera Asset Tokenization Studio, traded through a public order book that lives on Arkiv.

| | |
|---|---|
| Event | ETHGlobal Mumbai, Nov 5–7 2026 (check the submission deadline on the ETHGlobal dashboard) |
| Target prizes | **Hedera: Tokenize Anything with Hedera Studios** ($5k) and **Arkiv: Build on Arkiv, from scratch** ($4k) |
| Stretch | Arkiv + Swarm bonus (+$500, stacks on the Arkiv track and doesn't use a pick) |
| Status | v1, hackathon scope |

---

## 1. Problem

Indian MSMEs have about ₹10L+ crore in receivables locked up in unpaid invoices. Invoice discounting platforms exist, but they are closed silos:

- An investor who buys an invoice note **can't exit before maturity**, because there is no secondary market.
- Each platform keeps its own KYC and its own order book, so liquidity is fragmented and access is restricted.
- Tokenizing the note solves custody, but a **security token can't trade on an open DEX**, because every holder has to be an eligible, verified investor.

## 2. Solution

1. **Issue.** An arranger tokenizes an invoice-backed bond with **Hedera ATS**. The bond has a face value, a coupon and a maturity, and is ERC-3643-compliant: transfers succeed only between investors that pass identity and KYC checks.
2. **Trade.** Investors post **EIP-712-signed orders** as **Arkiv entities**. The order book is public data that anyone can query, and an order's entity expires when the order does.
3. **Settle.** A buyer fills an order through a **DvP contract on Hedera EVM**. Payment and security move atomically, and the security leg runs through T-REX compliance, so an ineligible buyer *can't* receive the token, whatever the UI does.
4. **Lifecycle.** Coupon payments, freezes and pauses happen through ATS, and each is mirrored to Arkiv as a public corporate-actions feed.

**One-liner:** *"Hedera enforces who may hold the bond. Arkiv makes the market for it public and queryable, and expires stale orders on its own."*

## 3. Prize qualification checklist

### Hedera: Tokenize Anything ($5k: $2.5k / $1.5k / $1k)
- [ ] Use ATS (SDK, contracts, web app, or a combination) to issue or manage a tokenized asset → **bond issued with ATS**
- [ ] Deploy and demo on **Hedera testnet**
- [ ] Public GitHub repo, **contracts verified on HashScan** (DvP, mock stablecoin, T-REX contracts)
- [ ] Demo video **≤ 5 min** covering **issuance, configuration, ≥1 lifecycle operation** (coupon payment and freeze)
- Extra points we target: compliance controls (KYC, freeze, transfer restrictions, pause) ✅, distributions (coupon) ✅, Scheduled Transactions for coupons (stretch), oracle/NAV feed (stretch, published on Arkiv)

### Arkiv: Build on Arkiv, from scratch ($4k: $3k / $1k)
- [ ] Built from scratch at Mumbai; public open-source repo; **AI use disclosed**
- [ ] Writes to **Arkiv testnet (Rabdi)** with `@arkiv-network/sdk`, **and the product reads from it** (the order book UI, the activity feed and the market list all come from Arkiv queries)
- [ ] Re-runnable seed/sync script in the repo (`scripts/arkiv-sync-assets.ts`)
- [ ] README lists **writer wallet address(es)** and **one example query**
- [ ] `/arkiv/schema.md`
- [ ] One file per judging criterion (25% each): `/arkiv/friction.md`, `/arkiv/reach.md`, `/arkiv/why-arkiv.md`, `/arkiv/how-you-use-arkiv.md`
- Disqualifier to avoid: "SDK installed but never used to read, or Arkiv used only as a log nothing reads"

### General ETHGlobal
- [ ] **Commit steadily.** The rules treat single large commits as unqualified by default.
- [ ] Demo video: aim for **≤ 4 min** so it fits both Hedera's ≤5 min and ETHGlobal's usual showcase length (check the showcase form)

## 4. Users

| Persona | Demo account | Can do |
|---|---|---|
| **Arranger / Issuer** | `issuer` | Creates the bond in ATS, sets the coupon, mints to the primary investor, freezes or pauses |
| **Compliance agent** (claim issuer) | `agent` (can be the same key as issuer) | Registers investor identities and grants or revokes KYC |
| **Investor A: Alice** | `alice` | KYC'd. Holds the bond and posts sell orders |
| **Investor B: Bob** | `bob` | KYC'd. Buys from the book |
| **Unverified: Carol** | `carol` | Not KYC'd. **Her fill must revert on-chain** (the negative demo) |

All accounts are **Hedera ECDSA accounts**, so each one's EVM address is the same on Hedera (chain 296) and Arkiv Rabdi (chain 7794095). One MetaMask key works on both.

## 5. Scope

### In scope (MVP)
1. Bond issuance with ATS on Hedera testnet, with ERC-3643 compliance (fallback: ATS native KYC and control list, see §11)
2. Investor onboarding: identity and KYC grant by the agent
3. Mock stablecoin `tINR` (ERC-20 on Hedera EVM) for payment
4. DvP settlement contract (EIP-712 orders, partial fills, cancel through a nonce)
5. Arkiv schemas: `asset`, `order`, `fill`, `action`
6. Web app: markets list, asset page with order book and trade box, issuer console (thin), activity feed
7. Lifecycle: **coupon payment** and **freeze of a holder**, each mirrored to Arkiv
8. Re-runnable Arkiv sync script and the `/arkiv/*.md` deliverables

### Stretch (only after the MVP demo works end to end)
- Prospectus and invoice PDFs on Swarm, referenced from `regx.asset` (Swarm bonus, needs `/arkiv/swarm.md`)
- Coupon via Hedera **Scheduled Transaction**
- NAV/price snapshots as `regx.nav` entities (last trade and mid), giving a public price feed other apps can read
- Live order book through `watchEntityEvents`, instead of polling

### Out of scope
- Real KYC or PII (**no PII ever goes to Arkiv**, which only ever stores addresses)
- Mainnet, real money, real invoices
- Matching engine or AMM (takers pick orders by hand)
- Multiple partitions or multiple currencies

## 6. Core flows (also the demo script)

| # | Flow | Actor | Systems | Done when |
|---|---|---|---|---|
| F1 | **Issue bond** "INV-2026-001: Acme Textiles receivables, ₹1,000 face, 12% coupon, 90-day maturity" | Issuer | ATS web app or SDK → Hedera | Bond token on HashScan; `regx.asset` entity on Arkiv |
| F2 | **Configure compliance**: register Alice and Bob in the identity registry, grant KYC; Carol not registered | Agent | ATS / T-REX contracts | `isVerified(alice)=true`, `isVerified(carol)=false` |
| F3 | **Primary mint**: mint 100 units to Alice | Issuer | ATS | Alice's balance is 100 |
| F4 | **Post sell order**: 40 @ ₹985, expires in 24h | Alice | MetaMask signs EIP-712 → Arkiv `createEntity` (Alice owns it) | Order appears in the book, **read from Arkiv** |
| F5 | **Fill**: Bob buys 25 | Bob | DvP `fill()` on Hedera | tINR to Alice, bond to Bob, in one tx; `regx.fill` entity with the Hedera tx id; remaining shows 15 |
| F6 | **Blocked fill**: Carol tries to buy | Carol | DvP `fill()` | UI warns "not eligible" (pre-check); if forced, the **tx reverts with a compliance error** (HashScan link) |
| F7 | **Cancel**: Alice cancels the rest | Alice | DvP `cancel(nonce)` + Arkiv `deleteEntity` | Order is gone from the book |
| F8 | **Lifecycle: coupon**: issuer pays the coupon to holders | Issuer | ATS coupon / mass-payout, or a script | Holders receive tINR; `regx.action{type:coupon}` entity |
| F9 | **Lifecycle: freeze**: issuer freezes Alice | Issuer | ATS freeze / control list | Alice's open orders become unfillable (UI greys them out; a forced fill reverts) |
| F10 | **Expiry**: a short-lived order (2-min expiry) disappears from Arkiv by itself | n/a | Arkiv expiration | Gone from query results with no cleanup tx |

## 7. Architecture

```
                 ┌──────────────────────────── Web app (Next.js + wagmi/viem) ───────────────────────────┐
                 │  Markets │ Asset / Order book │ Trade box │ Portfolio │ Activity │ Issuer console     │
                 └─────┬─────────────────────────────┬──────────────────────────────┬───────────────────┘
          read/write   │ @arkiv-network/sdk           │ viem (chain 296)            │ ATS SDK / web app
          entities     ▼                              ▼                              ▼
   ┌──────────────────────────┐        ┌──────────────────────────────┐    ┌──────────────────────────┐
   │ Arkiv Rabdi (7794095)    │        │ Hedera testnet EVM (296)     │    │ ATS factory / resolver   │
   │  regx.asset             │        │  RegXDvP (EIP-712 orders)   │◄───│  Bond (ERC-1400 diamond) │
   │  regx.order  ← maker    │        │  tINR (mock ERC-20)          │    │  + ERC-3643 IdentityReg  │
   │  regx.fill   ← keeper   │        │  T-REX IdentityRegistry,     │    │    + ModularCompliance   │
   │  regx.action ← keeper   │        │  Compliance, ClaimIssuer     │    └──────────────────────────┘
   └───────────▲──────────────┘        └──────────────┬───────────────┘
               │ writes fills/actions                 │ Fill / Cancel / ATS events
               │                                      ▼
               └──────────── Keeper (Node script): Hedera Mirror Node → Arkiv ────────────
```

**Source of truth**
- **Ownership, balances, eligibility, filled amounts** live on **Hedera**. The chain is the final authority.
- **Discovering intent** (open orders, asset metadata, trade prints, corporate actions) happens on **Arkiv**. It is public, queryable and expires on its own.
- The UI shows the remaining quantity as `order.amount − DvP.filled(orderHash)`, read from Hedera. Arkiv order entities never need to change after they're created.

**Who writes to Arkiv**
- `regx.order`: written by **the maker**, from their own wallet. Only the maker owns the entity, so only the maker can delete or extend it, which proves authorship without a relayer.
- `regx.asset`, `regx.fill`, `regx.action`: written by the **keeper wallet** (a published writer address). The keeper watches the Hedera Mirror Node and mirrors events to Arkiv. Anyone can re-run it (`scripts/arkiv-sync-*.ts`) and get the same data.
- Makers need a little tGLM, from the faucet at hub.arkiv.network. In the demo, pre-fund Alice. Fallback: the keeper posts orders for makers, and the maker's EIP-712 signature still proves who wrote it.

## 8. Hedera / ATS specification

### 8.1 Bond (ATS)
| Field | Value |
|---|---|
| Name / symbol | `Acme Textiles INV-2026-001` / `ACME01` |
| Type | Bond (ATS factory `deployBond`) |
| Face value / currency | 1,000 tINR per unit |
| Coupon | 12% p.a., one coupon in the demo window (ATS coupon or mass-payout) |
| Maturity | Event date + 90 days |
| Supply cap | 1,000 units |
| Compliance | ERC-3643: Identity Registry ID + Compliance ID passed at creation |
| Regulation fields | Reg S (non-US) for the demo |
| Roles | Issuer/admin, Minter, Controller, KYC agent, Pauser |

ATS testnet config (taken from the SDK sample code; **check it against the ATS "Deployed Addresses" page**):
`resolver 0.0.7707874`, `factory 0.0.7708432`, RPC `https://testnet.hashio.io/api`, mirror `https://testnet.mirrornode.hedera.com/api/v1/`.

**How we use ATS:** issue with the **ATS web app** (fastest, and counts as "use ATS"). Then script KYC grants, mints, coupons and freezes with the **ATS SDK** (`@hashgraph/asset-tokenization-sdk`) or with direct contract calls. Commit the scripts so judges can see SDK usage.

### 8.2 ERC-3643 / T-REX integration
Deploy the minimal T-REX identity stack on Hedera EVM (Tokeny `T-REX` and `onchain-id` contracts):
`ClaimTopicsRegistry` (topic `1 = KYC`) → `TrustedIssuersRegistry` (our ClaimIssuer) → `IdentityRegistryStorage` → `IdentityRegistry` → `ModularCompliance` (optionally plus a country-allow module for IN).
Onboarding an investor: deploy an ONCHAINID → the ClaimIssuer signs a KYC claim → `identityRegistry.registerIdentity(wallet, identity, 356 /*IN*/)`.
Pass the IdentityRegistry and ModularCompliance addresses to ATS at bond creation.

> ⚠️ **Spike first (1 hour max):** grep the ATS contracts for how the Identity Registry and Compliance IDs are used in the transfer path (`isVerified` / `canTransfer`). ATS docs say ERC-3643 support is **partial**. If it isn't wired into transfers, use the **fallback** in §11.

### 8.3 `tINR` (mock stablecoin)
A plain OpenZeppelin ERC-20 (6 decimals) with an owner faucet `mint(to, amt)`, deployed and verified on HashScan.
(An HTS token would be more "native" but adds association steps; skip it for the MVP.)

### 8.4 `RegXDvP` contract

```solidity
struct Order {
  address maker;
  address security;     // ATS bond EVM address
  address payToken;     // tINR
  bool    isSell;       // true = maker sells security
  uint256 price;        // payToken units per 1 security unit
  uint256 amount;       // security units
  uint256 nonce;
  uint64  expiry;       // unix seconds
}
// EIP-712 domain: name "RegX", version "1", chainId 296, verifyingContract = DvP

function fill(Order calldata o, bytes calldata sig, uint256 fillAmount) external;
function cancel(uint256 nonce) external;            // marks maker's nonce as cancelled
function filled(bytes32 orderHash) external view returns (uint256);
function hashOrder(Order calldata o) external view returns (bytes32);

event Filled(bytes32 indexed orderHash, address indexed maker, address indexed taker,
             address security, uint256 amount, uint256 price);
event Cancelled(address indexed maker, uint256 nonce);
```

- Checks: signature valid, `block.timestamp < expiry`, nonce not cancelled, `filled + fillAmount ≤ amount`.
- Settlement (sell order): `payToken.transferFrom(taker → maker, price*fillAmount)`, then `security.transferFrom(maker → taker, fillAmount)`. The **security leg runs through ATS/ERC-3643 compliance**, so if the taker isn't verified the whole tx reverts.
- Maker approval: an `approve(DvP)` on the security for sell orders. ⚠️ Check that the ATS bond exposes ERC-20 `approve/transferFrom`. If it doesn't, use **ERC-1410 `authorizeOperator(DvP)` + `operatorTransferByPartition`** (default partition).
- Pre-check view for the UI: `canSettle(order, taker)` calls the security's `canTransfer` (ERC-1594) or `identityRegistry.isVerified(taker)`, so the UI can show "not eligible" before a tx is sent.

## 9. Arkiv specification

Network **Rabdi**: chain `7794095`, RPC `https://rpc.rabdi.db-chain.testnet.arkiv.network`, WS `wss://…`, gas tGLM.
Get an **access key** (hub.arkiv.network/access-keys); the public RPC is heavily rate-limited.
SDK: `npm i @arkiv-network/sdk viem` (Node 22.10+). Use `defineSchema`, `createEntity(schema, data, { expiration })`, `patchEntity`, `extendEntity`, `deleteEntity`, and `select().from().where()`.

### 9.1 Schemas (`packages/arkiv/schemas.ts`)

```ts
import { addr, bytes, dec, defineSchema, str } from "@arkiv-network/sdk/schema"

export const Asset = defineSchema("regx.asset", {
  security:     addr().indexed(),   // bond EVM address on Hedera
  hederaId:     str().indexed(),    // 0.0.x
  issuer:       addr().indexed(),
  assetType:    str().indexed(),    // "invoice-bond"
  status:       str().indexed(),    // active | paused | matured
  symbol:       str(),
  name:         str(),
  faceValue:    dec(),
  couponBps:    dec(),
  maturity:     dec().indexed(),    // unix seconds
  compliance:   str(),              // "erc3643" | "ats-kyc"
  docs:         str().optional(),   // Swarm ref (stretch), NEVER an encrypted ref
  meta:         bytes(),            // JSON blob: obligor, invoice summary (no PII)
})

export const Order = defineSchema("regx.order", {
  orderHash:    str().indexed(),
  security:     addr().indexed(),
  maker:        addr().indexed(),
  side:         str().indexed(),    // "buy" | "sell"
  price:        dec().indexed(),
  amount:       dec(),
  expiry:       dec().indexed(),
  nonce:        str(),
  chainId:      dec(),              // 296; keeps the book chain-agnostic later
  sig:          str(),              // EIP-712 signature
})

export const Fill = defineSchema("regx.fill", {
  orderHash:    str().indexed(),
  security:     addr().indexed(),
  maker:        addr().indexed(),
  taker:        addr().indexed(),
  price:        dec(),
  amount:       dec(),
  hederaTx:     str(),              // tx hash / HashScan link
  timestamp:    dec().indexed(),
})

export const Action = defineSchema("regx.action", {
  security:     addr().indexed(),
  kind:         str().indexed(),    // coupon | freeze | unfreeze | pause | kyc_grant | kyc_revoke | mint
  subject:      addr().optional(),  // affected holder, if any
  hederaTx:     str(),
  timestamp:    dec().indexed(),
  meta:         bytes(),            // JSON: amount, rate, record date…
})
```

> Check the column builders against the SDK version you install (`addr`, `bytes`, `dec`, `str` are confirmed; integer types weren't). If they differ, change only this file.

### 9.2 Expiration policy (a central part of "Why Arkiv")
| Entity | Expiration | Why |
|---|---|---|
| `order` | `ExpirationTime.atDate(order.expiry)` | Stale orders disappear with **no cancel tx and no cleanup job** |
| `asset` | `ExpirationTime.max()` (≈182 days); sync script `extendEntity` until maturity + 30d | Metadata lives as long as the instrument does |
| `fill`, `action` | `ExpirationTime.max()`, extended by the keeper | Trade history and corporate actions |
| `nav` (stretch) | `ExpirationTime.fromHours(1)` | Price snapshots expire naturally, so old prices aren't served as current |

### 9.3 Reads the product depends on
| Screen | Query |
|---|---|
| Markets | `select().from(Asset).where(eq("status","active"))` |
| Order book (asks) | `select().from(Order).where(and(eq("security", X), eq("side","sell"), gt("expiry", dec(now))))`, then sorted by price (SDK sort if available, otherwise client-side) |
| My orders | `select().from(Order).ownedBy(me)` |
| Trade history | `select().from(Fill).where(eq("security", X))` |
| Corporate actions | `select().from(Action).where(eq("security", X))` |
| Live updates (stretch) | `watchEntityEvents({ onEntityCreated, onEntityDeleted })`, then re-query |

**README example query:** best asks for ACME01.

### 9.4 Write paths
- **Post order (maker):** sign EIP-712 on chain 296 → switch to Arkiv → `createEntity(Order, …)`. The UI handles the network switch. If switching chains proves flaky, keep one viem wallet client per chain.
- **Cancel (maker):** `DvP.cancel(nonce)` on Hedera **and** `deleteEntity(orderKey)` on Arkiv.
- **Keeper:** polls the Hedera Mirror Node for `Filled`, `Cancelled` and ATS events → writes `fill` and `action` entities. Idempotent: skips if a `fill` with that `hederaTx` already exists, so it's safe to re-run.
- **Sync script:** `scripts/arkiv-sync-assets.ts` reads bond state from Hedera and creates or patches `regx.asset` entities. Re-runnable, and documented in the README.

## 10. Web app

Stack: **Next.js (App Router) + TypeScript + wagmi/viem + Tailwind**, deployed on Vercel.

| Route | Content |
|---|---|
| `/` | Markets: asset cards from Arkiv (coupon, maturity, last price, open interest) |
| `/asset/[security]` | Header (bond terms, compliance badge, HashScan link) · **order book** (bids and asks from Arkiv, remaining amounts from Hedera) · trade box · trade history · corporate actions |
| `/portfolio` | Holdings (Hedera), my open orders (Arkiv `ownedBy`), eligibility status |
| `/issuer` | Thin console: mint, grant/revoke KYC, freeze, pay coupon. Each calls ATS and writes a `regx.action` |
| `/activity` | Global feed of fills and actions from Arkiv |

UX requirements:
- **Eligibility banner** on connect: "✅ Verified investor" or "⛔ Not eligible: you can browse but not trade"
- Every Hedera tx links to HashScan, and every Arkiv entity links to the Rabdi explorer
- A badge on each order says **"Data from Arkiv"**, so judges can see where it comes from

## 11. Risks and fallbacks

| Risk | Likelihood | Fallback |
|---|---|---|
| ATS ERC-3643 is "partial" and the identity registry isn't enforced on transfer | Med-High | Use **ATS native KYC (`grantKyc`) + control list**, which still gives on-chain transfer restrictions. Call it "ERC-3643-style compliance via ATS KYC module" and state it plainly in the README |
| ATS bond lacks ERC-20 `approve/transferFrom` | Med | ERC-1410 `authorizeOperator` + `operatorTransferByPartition` |
| ATS SDK is heavy or breaks in the browser | Med | Browser uses viem + ABIs; ATS SDK only in Node scripts; issuance through the ATS web app |
| Arkiv RPC rate limits | Med | Access key; cache queries in the UI; keeper polls every 5s |
| Network switching friction between Hedera and Arkiv | Med | Separate viem clients per chain; Arkiv writes can go through the keeper, with the maker's signature still on the order |
| Hedera EVM quirks (gas, `msg.value` decimals, account aliasing) | Low-Med | Use ECDSA alias accounts; no HBAR value transfers in contracts |
| Running out of time | High | Hard cut line: **F1–F5 + F6 + F8 + Arkiv reads = shippable.** Everything else is optional |

## 12. Repository layout

```
regx/
├── PRD.md
├── README.md                    # setup, architecture, writer wallets, example query, AI disclosure, HashScan links
├── arkiv/
│   ├── schema.md
│   ├── friction.md              # log SDK/docs pain points AS THEY HAPPEN
│   ├── reach.md
│   ├── why-arkiv.md
│   └── how-you-use-arkiv.md
├── contracts/                   # Hardhat or Foundry, Hedera testnet
│   ├── src/RegXDvP.sol
│   ├── src/TINR.sol
│   ├── script/deploy-trex.ts    # identity stack
│   └── test/RegXDvP.t.sol
├── packages/arkiv/              # schemas.ts + typed client helpers (shared by web and scripts)
├── scripts/
│   ├── ats-setup.ts             # KYC, mint, coupon, freeze via ATS SDK
│   ├── arkiv-sync-assets.ts     # re-runnable
│   └── keeper.ts                # Hedera Mirror Node → Arkiv fills and actions
└── web/                         # Next.js app
```

## 13. Build plan (time-boxed, hackathon day)

| Block | Owner | Output | Exit check |
|---|---|---|---|
| H0–H1 | All | Repo, env, wallets (ECDSA Hedera accounts, Arkiv faucet and access key), ATS web app running | Every key funded on both chains |
| H1–H2 | Chain | **ATS bond issued on testnet** + ERC-3643 spike (§8.2) | Bond on HashScan; decide 3643 vs fallback |
| H1–H3 | Arkiv | Schemas, client helpers, seed script, first entities on Rabdi | Query returns seeded asset and orders |
| H2–H4 | Chain | `tINR`, `RegXDvP` + tests, deploy and verify | `fill` works between two KYC'd wallets from a script |
| H3–H6 | Web | Markets + asset page + order book from Arkiv + post order | Alice posts, Bob sees it |
| H5–H7 | Web + Chain | Fill flow, eligibility pre-check, Carol's revert | F5 and F6 live |
| H6–H8 | Chain | Keeper, coupon, freeze scripts → `regx.action` | F8 and F9 live |
| H8–H9 | All | README, `/arkiv/*.md`, HashScan verification, deploy web | Checklist in §3 all ticked |
| H9–H10 | All | Record video (≤4 min) and submit | Submitted |
| Spare | n/a | Swarm docs → bonus; Scheduled Tx coupon; NAV entities | n/a |

**Rule:** commit at least once per hour per person, and write `arkiv/friction.md` while you hit problems, not at the end.

## 14. Demo video outline (≤4 min)

1. **0:00–0:20** Problem: locked MSME receivables, no exit for investors.
2. **0:20–1:00** *Issuance:* create the ACME01 bond in ATS; HashScan.
3. **1:00–1:30** *Configuration:* identity and KYC for Alice and Bob; Carol unverified.
4. **1:30–2:20** Alice posts an order → show the **Arkiv entity in the explorer** and the query that renders the book. Bob fills → one atomic DvP tx on HashScan; the fill shows up on Arkiv.
5. **2:20–2:45** Carol tries → compliance revert.
6. **2:45–3:20** *Lifecycle:* coupon paid to holders; freeze Alice → her orders can't be filled. Both appear in the Arkiv actions feed.
7. **3:20–3:45** A 2-minute order expires off the book by itself. "Why Arkiv" in one sentence.
8. **3:45–4:00** Architecture slide + repo.

## 15. Notes for the `/arkiv` deliverables

- **why-arkiv.md:** orders are public, short-lived and need querying by asset, side and price. On Hedera, every order and cancel costs gas and can't be queried. A central relayer is a trusted party and a single point of failure. Arkiv gives typed indexed queries, owner-only delete, and **native expiry** that matches an order's time-to-live exactly.
- **how-you-use-arkiv.md:** the four schemas, the indexed columns and why each is indexed, the expiration table (§9.2), the maker-owned vs keeper-owned split, and every read path (§9.3).
- **reach.md:** `regx.*` is an open schema. Any wallet, aggregator or analytics site can read the order book, trade prints and corporate actions with no API key and no permission from us. Other venues can post orders into the same book (the `chainId` column is there for this).
- **schema.md:** copy of §9.1 with field descriptions and example entity keys.
- **friction.md:** a running log (SDK version, what broke, how long it took, the docs you wished existed).

## 16. Open questions
1. Is the ETHGlobal submission deadline, and the video length the form allows, confirmed? → check the dashboard
2. Does ATS enforce the ERC-3643 Identity Registry on transfer? → H1 spike
3. Does the ATS bond expose ERC-20 `approve/transferFrom`, or only ERC-1410 operators? → H1 spike
4. Which coupon path should we use: native ATS coupon plus mass-payout, or a scripted tINR distribution to snapshot holders? → decide at H6
5. Keep the name "RegX"?
