# Reach

## Who can use RegX data on Arkiv today

The `regx.*` collections are an **open schema**. Anything that can make a JSON-RPC call can read the order book, trade tape and corporate
actions of a tokenized security, with no API key from us and no permission.

- **Wallets** (HashPack, MetaMask snaps) can show a holder their bond's live bid, coupon history and freeze status.
- **Aggregators and other venues** can route to, or post into, the same book. Orders carry `chainId` and `dvp`, so a second venue
  (another Hedera DvP, or an EVM chain running the same T-REX token) can share the liquidity instead of fragmenting it.
- **Analytics and regulators** get trade prints with Hedera transaction hashes, plus a corporate-actions feed (coupon set/paid, freezes,
  KYC grants/revocations) that is both queryable and verifiable against the chain. That's a lot better than a registrar's PDF.
- **Issuers and arrangers** can list a new ATS bond by writing one `regx.asset` entity, and it shows up in every RegX-compatible UI.

## Who it is for

India's MSMEs have well over ₹10 lakh crore stuck in unpaid receivables. Invoice-discounting platforms exist, but investors who buy a note
can't exit before maturity, because every platform is a silo with its own KYC and its own order book. RegX's split addresses that:

- **Compliance travels with the token.** ERC-3643 on Hedera ATS, so any venue that settles through the token inherits KYC and
  transfer rules.
- **The market is a public good.** Arkiv, so a holder's exit liquidity isn't tied to one platform's front-end.

## Adoption path

1. Arrangers already using Hedera ATS add `regx.asset` + the DvP contract. No change to their token.
2. Any front-end (ours is open source) reads the shared book.
3. A second Hedera DvP or a market maker posts quotes into the same `regx.order` collection.

## Numbers from this build

See the README for the writer wallets and a live query. Every entity in the demo was created on Rabdi by the makers' own wallets
(orders) or the published keeper wallet (fills, actions, assets).
