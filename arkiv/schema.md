# RegX Arkiv schema

Four collections on **Arkiv Rabdi testnet** (chain `7794095`), defined with `defineSchema` from `@arkiv-network/sdk@1.0.1`.
Source of truth: [`shared/src/arkiv.ts`](../shared/src/arkiv.ts). Every query in the app and the scripts goes through these schemas, so the
SDK checks indexed columns and their types at compile time.

| Collection | Written by | Owner | Lifetime | Count driver |
|---|---|---|---|---|
| `regx.asset` | keeper (`scripts/arkiv-sync-assets.ts`) | keeper wallet | `max()` (~182 d), extended on every sync | one per security |
| `regx.order` | **maker's own wallet** (web app / `scripts/seed-orders.ts`) | maker | `atDate(order.expiry)`: **the order's TTL** | one per order |
| `regx.fill` | keeper (`scripts/keeper.ts`) from `RegXDvP.Filled` | keeper wallet | `max()` | one per settled trade |
| `regx.action` | keeper from ATS / T-REX events, and `scripts/lifecycle.ts` for coupon payments | keeper wallet | `max()` | one per corporate action |

## `regx.order`: signed orders

| Column | Type | Indexed | Notes |
|---|---|:-:|---|
| `orderHash` | `str` | ✓ | EIP-712 digest (domain `RegX/1`, chain 296, verifyingContract = DvP) |
| `security` | `addr` | ✓ | ATS bond on Hedera |
| `payToken` | `addr` | | tINR |
| `dvp` | `addr` | | settlement contract |
| `maker` | `addr` | ✓ | signer. Equals the entity `$owner` when self-published |
| `side` | `str` | ✓ | `sell` \| `buy` |
| `price` | `dec` | ✓ | human price in INR, used for `orderBy(asc("price"))` and range queries |
| `priceRaw` | `u256` | | exact signed value (tINR base units, 6 dp) |
| `amount` | `u64` | | security units |
| `nonce` | `u256` | | random 64-bit; cancel = `RegXDvP.cancel(nonce)` |
| `expiry` | `u64` | ✓ | unix seconds; also drives the entity's Arkiv expiration |
| `chainId` | `u64` | ✓ | `296`, so the book can carry orders for other venues |
| `sig` | `bytes` | | 65-byte signature (a 132-char hex string exceeds `MAX_STRING_BYTES` = 128) |

## `regx.fill`: settled trades

`orderHash str✓`, `security addr✓`, `maker addr✓`, `taker addr✓`, `side str`, `price dec✓`, `amount u64`, `cost dec`, `hederaTx str✓`,
`logIndex u64`, `block u64`, `timestamp u64✓`

The keeper makes writes idempotent by looking up `hederaTx` + `logIndex` before it writes.

## `regx.action`: corporate actions & compliance events

`security addr✓`, `kind str✓` (`mint`, `kyc_grant`, `kyc_revoke`, `freeze`, `unfreeze`, `pause`, `unpause`, `coupon_set`, `coupon_paid`,
`order_cancel`), `subject addr?`, `hederaTx str✓`, `logIndex u64`, `timestamp u64✓`, `summary str`, `meta bytes` (JSON)

## `regx.asset`: security metadata

`security addr✓`, `hederaId str✓`, `issuer addr✓`, `assetType str✓`, `status str✓`, `symbol str✓`, `name str`, `decimals u64`,
`currency str`, `faceValue dec`, `couponBps u64`, `maturity u64✓`, `maxSupply u64`, `totalSupply u64`, `holders u64`, `compliance str`,
`identityRegistry addr`, `complianceContract addr`, `dvp addr`, `payToken addr`, `docs str?`, `meta bytes` (JSON, no PII), `updatedAt u64✓`

## Privacy rule

No personal data ever goes to Arkiv. KYC lives as a signed claim on the investor's ONCHAINID on Hedera. Arkiv only sees wallet
addresses, which are already public on both chains.
