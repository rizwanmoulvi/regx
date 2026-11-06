# ETHGlobal Mumbai submission: RegX

## Short description (≤100 chars)
Compliant order book for tokenized invoice bonds: Hedera ATS + ERC-3643, with orders living on Arkiv.

## Description
Indian MSMEs have well over ₹10 lakh crore stuck in unpaid invoices. Platforms let investors fund those invoices, but an investor
can't exit before maturity: every platform is a closed silo with its own KYC and its own order book, and a tokenized security can't
just trade on a DEX because every holder has to be a verified investor.

RegX is a secondary market for invoice-backed bonds that keeps compliance inside the token and puts the market in public.

- **Issuance on Hedera.** The bond (ACME01: ₹1,000 face, 12% coupon, 90 days) is issued through the Hedera Asset Tokenization Studio
  factory and wired to a real ERC-3643 (T-REX) Identity Registry and Modular Compliance. Investors get a signed KYC claim on their
  ONCHAINID. Transfers fail for anyone without one, and a compliance module caps any single investor's holding.
- **Orders on Arkiv.** Makers sign EIP-712 orders and publish them from their own wallets as `regx.order` entities on Arkiv. The book
  is one typed query (`security = X AND side = sell AND expiry > now ORDER BY price`), anyone can read it, only the maker can delete
  their order, and each entity expires exactly when its order does, so stale orders disappear with no cleanup.
- **Atomic settlement.** A taker fills through the RegXDvP contract on Hedera. Cash (tINR) and the bond move in one transaction, and the
  bond's own ERC-3643 checks run inside it, so an unverified buyer's fill reverts and the payment rolls back.
- **Lifecycle.** Coupons are recorded with ATS `setCoupon` (record-date snapshot) and paid pro-rata, optionally through Hedera
  Scheduled Transactions that the network executes on the payment date. Freezes and pauses are enforced on-chain. A keeper mirrors
  every trade and corporate action into Arkiv (`regx.fill`, `regx.action`), so the market's history is public, queryable data.

## How it's made
- **Contracts (Foundry, Solidity 0.8.17):** `RegXDvP` (EIP-712 orders, partial fills, nonce cancel, a `checkFill` pre-trade view that
  calls the ATS token's own `canTransferFrom`), `InvestorCapModule` (a T-REX compliance module), and `tINR`. 13 tests run against the real
  T-REX + ONCHAINID contracts.
- **Hedera ATS:** we read the ATS source to wire it properly. The transfer path calls `IdentityRegistry.isVerified` and
  `Compliance.canTransfer`, *and* checks the operator with `canTransfer(operator, 0x0, 0)`. Stock T-REX modules revert on that zero-address
  call, which is why we wrote our own module. We set `internalKycActivated = false` so KYC comes entirely from ONCHAINID claims. The bond is
  deployed by calling the live ATS factory's `deployBond` from our script, with the T-REX registry and compliance passed in.
- **Arkiv:** `@arkiv-network/sdk` 1.0.1 with `defineSchema` (four collections), `createEntity` with
  `ExpirationTime.atDate(order.expiry)`, `select().from().where().orderBy()`, `ownedBy`, `patchEntity` and `extendEntity` for the
  re-runnable asset sync, and `deleteEntity` for cancels. One ECDSA key gives the same address on Hedera and Arkiv.
- **Keeper:** polls Hedera logs (DvP, ATS bond, Identity Registry) and writes idempotent Arkiv entities keyed by Hedera tx hash + log
  index. Anyone can re-run it and get the same data.
- **Web:** Next.js 15, wagmi, viem, and a Hedera JSON-RPC proxy. The UI reads the book from Arkiv and the live remaining size and
  eligibility from Hedera, then signs on Hedera and publishes on Arkiv with a chain switch in between.
- **Hacky bits:** Hashio stalls viem's block-watching receipt wait, so we poll receipts ourselves. Hedera bills 80% of the gas limit,
  so every tx uses `eth_estimateGas` + 25%. The Arkiv explorer's URL scheme came from reading its JS bundle.

## Prize tracks
- Hedera: Tokenize Anything with Hedera Studios
- Arkiv: Build on Arkiv (from scratch)
