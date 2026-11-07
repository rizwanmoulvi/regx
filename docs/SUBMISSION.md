# ETHGlobal Mumbai submission: RegX

## Short description (≤100 chars)
Invoice notes on Whitechain: ERC-3643 rules, USDT coupons and DvP, order book on Arkiv.

## Description
Indian MSMEs have well over ₹10 lakh crore stuck in unpaid invoices. Platforms let investors fund those invoices, but an investor
can't exit before maturity: every platform is a closed silo with its own KYC and its own order book, a tokenized security can't just
trade on a DEX because every holder has to be a verified investor, and the coupons and repayment still move over bank rails.

RegX issues invoice-backed notes on Whitechain whose whole cash life runs in USDT, and puts their secondary market in public on Arkiv.

- **Issuance and rules on Whitechain.** Each note (ACME01: 1 USDT face, issued at 0.97, 1% coupon) is a real ERC-3643 (T-REX) token
  wired to an Identity Registry and a Modular Compliance. Investors hold a KYC claim on their ONCHAINID, signed by a trusted claim
  issuer. Mints and transfers fail for anyone without one, a module caps any single holding, and the issuer can freeze wallets or pause.
- **USDT through the whole lifecycle.** `RegXNote.subscribe` sends the investor's USDT straight to the issuer and mints the units. After each
  coupon date anyone can trigger `payCoupon`, and after maturity `settleMaturity` repays face value to every holder and burns the units,
  all pulled from the issuer's USDT allowance. A keeper triggers both on the due date. On testnet a short-dated note went through the
  whole cycle on its own.
- **Orders on Arkiv.** Makers sign EIP-712 orders and publish them from their own wallets as `regx.order` entities. The book is one typed
  query, anyone can read it, only the maker can delete their order, and each entity expires exactly when its order does.
- **Atomic settlement.** A taker fills through `RegXDvP` on Whitechain: USDT and units move in one transaction, and the token's ERC-3643
  checks run inside it. An unverified buyer's fill reverts on-chain and the USDT never leaves their wallet.
- **Public history.** The keeper mirrors every subscription, trade, coupon, repayment, freeze and KYC change into Arkiv
  (`regx.fill`, `regx.action`), so the market's history is queryable by anyone.

## How it's made
- **Contracts (Foundry, Solidity 0.8.17):** `RegXNote` is both the lifecycle manager (a token agent holding the USDT terms) and a T-REX
  compliance module that enforces the windows: mint only during subscription, no transfers after maturity. `RegXDvP` handles EIP-712
  orders, partial fills, nonce cancels, and a `checkFill` view that runs the token's own checks so the UI can explain a rejection before
  any gas is spent. `InvestorCapModule` enforces the holding cap. 24 tests run against the real T-REX Token and ONCHAINID contracts.
- **Whitechain:** a resumable viem deployment script (T-REX stack, onboarding with real claim signatures, USDT distribution, one command
  per new note), with all 12 contracts verified on the Whitechain explorer through its Blockscout API. Every payment uses the official test USDT.
- **Arkiv:** `@arkiv-network/sdk` 1.0.1 with `defineSchema` (four collections), `createEntity` with `ExpirationTime.atDate(order.expiry)`,
  `select().from().where().orderBy()`, `ownedBy`, `patchEntity` and `extendEntity` for the re-runnable asset sync, and `deleteEntity`
  for cancels. One ECDSA key gives the same address on Whitechain and Arkiv.
- **Keeper:** polls Whitechain logs (DvP, notes, tokens, Identity Registry), writes idempotent Arkiv entities keyed by tx hash + log index,
  and calls the permissionless settlement functions when they come due.
- **Web:** Next.js 15, wagmi and viem. It reads the book from Arkiv and the live remaining size, eligibility and lifecycle state from
  Whitechain, then signs on Whitechain and publishes on Arkiv with a chain switch in between. A localhost-only test wallet lets you switch
  between issuer and investors while recording the demo.
- **History:** the first venue was Hedera's Asset Tokenization Studio (kept in `scripts/hedera/`). Moving to Whitechain meant swapping the
  ATS diamond for a plain T-REX token and adding `RegXNote`, so coupons and repayment are paid by our own contract in USDT.

## Prize tracks
- Whitechain: Tokenize · Real World Finance on Whitechain
- Arkiv: Build on Arkiv (from scratch)
