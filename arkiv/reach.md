# Reach

## Who can use RegX data on Arkiv today

The `regx.*` collections are an **open schema**. Anything that can make a JSON-RPC call can read the order book, trade tape and corporate
actions of a tokenized security, with no API key from us and no permission.

- **Wallets** (MetaMask, Whitechain wallets) can show a holder their note's live bid, coupon history and freeze status.
- **Aggregators and other venues** can route to, or post into, the same book. Orders carry `chainId` and `dvp`, so a second venue
  (another Whitechain DvP, or any EVM chain running the same T-REX token) can share the liquidity instead of fragmenting it.
- **Analytics and regulators** get trade prints with Whitechain transaction hashes, plus a corporate-actions feed (subscriptions, coupons, redemptions, freezes,
  KYC grants/revocations) that is both queryable and verifiable against the chain. That's a lot better than a registrar's PDF.
- **Issuers and arrangers** can list a new ERC-3643 note by writing one `regx.asset` entity, and it shows up in every RegX-compatible UI.

## Who it is for

India's MSMEs have well over ₹10 lakh crore stuck in unpaid receivables. Invoice-discounting platforms exist, but investors who buy a note
can't exit before maturity, because every platform is a silo with its own KYC and its own order book. RegX's split addresses that:

- **Compliance travels with the token.** ERC-3643 on Whitechain, so any venue that settles through the token inherits KYC and
  transfer rules.
- **The market is a public good.** Arkiv, so a holder's exit liquidity isn't tied to one platform's front-end.

## Adoption path

1. Arrangers already issuing ERC-3643 tokens add `regx.asset` + the DvP contract. No change to their token.
2. Any front-end (ours is open source) reads the shared book.
3. A second DvP venue or a market maker posts quotes into the same `regx.order` collection.

## Would they use it?

- **Investors** get the thing they lack today: an exit before maturity, with the price discovered in public. The trade itself settles
  atomically in USDT, so the counterparty risk is the issuer's credit, not the platform's back office.
- **Issuers / arrangers** get a wider investor base without building a venue: listing is one `regx.asset` entity, and the book, tape and
  corporate-actions feed come for free.
- **The hard part is regulatory, not technical.** A real deployment needs a licensed arranger and a real KYC provider signing the
  ONCHAINID claims. RegX is built so that swapping the claim issuer is a registry change, not a code change.

## Can they try it today?

Yes, on testnet:

- **Read the market without our app:** `npm install && npm run arkiv:query` (needs only an Arkiv RPC access key) prints the live order book,
  trades and corporate actions of ACME01 straight from Arkiv. Any wallet or analytics app can run the same query.
- **Open the live app:** https://regx-ecru.vercel.app reads the book, trades and corporate actions from Arkiv with no RegX backend
  in between. Connect any wallet: an unverified wallet can browse and watch its own trade get refused by the compliance checks.
- **Use the app:** `npm run web` (README → Run it). Connect MetaMask, or on localhost use the built-in test wallet to switch between
  Issuer, Alice, Bob and Carol. Every flow (subscribe, post, fill, cancel, the compliance rejections, freeze, pause, coupon, maturity) was
  exercised in a browser against testnet on Nov 7.
- **Bring your own wallet:** `npm run wc:life -- onboard 0xYourWallet` issues an ONCHAINID + KYC claim, so you can trade as a verified
  investor. The app has an opt-in demo KYC desk (`DEMO_KYC_ENABLED=1`) that does the same from the UI.

## After Mumbai

1. **Hosted testnet demo** with the demo KYC desk enabled, so anyone can try it with their own wallet.
2. **Sponsored Arkiv writes** (see friction #6), so an investor needs only Whitechain gas to post an order.
3. **Pull-based coupons** instead of looping over holders, plus issuer default and grace-period handling.
4. **A second venue** (another DvP, or a market maker posting quotes) reading and writing the same `regx.order` collection, to prove the
   shared-book idea.
5. Talking to Indian invoice-discounting platforms about listing a real note with a licensed arranger.

## Numbers from this build (Arkiv Rabdi, Nov 7 2026)

| | ACME01 (live) | ACME02 (full lifecycle) |
|---|---|---|
| `regx.asset` | 1 (status `subscription`) | 1 (status `redeemed`) |
| `regx.fill` trade prints | 2 (14 units, 13.84 USDT) | 0 |
| `regx.action` corporate actions | 11: subscribe 3, kyc_grant 2, freeze 1, unfreeze 1, paused 1, unpaused 2, order_cancel 1 | 8: subscribe 2, coupon_paid 1, coupon_holder 2, redeemed 1, redeem_holder 2 |
| `regx.order` | asks from Alice's own wallet, bids posted and cancelled from the UI | none open after maturity |

Writers: keeper `0xee02FaA3ec03213c4a837a3F9Dc9D6F210ab74C5` (assets, fills, actions); makers Alice
`0xfF6b6742Cce5c940b4EfFbE6f31e19b3f97f2753` and Bob `0xf3fE188e80ed94EFbDCB1B51e343200381d83DE3` (orders, owned by their wallets).
Reproduce the counts with `npm run arkiv:query` (ACME01) and `npm run arkiv:query -- 0x42696162ed99138508542746c0a66e214d5475d7` (ACME02).
