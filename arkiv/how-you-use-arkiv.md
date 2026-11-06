# How RegX uses Arkiv

Arkiv is RegX's **market data layer**. The order book, trade tape and corporate-actions feed you see in the app are read live from Arkiv.
We don't use it as a log that nothing reads.

## Writes

| What | Who signs | Code | Arkiv call |
|---|---|---|---|
| Post order | **maker's wallet** (MetaMask in the app; keys in scripts) | `web/lib/tx.ts → postOrder`, `scripts/wc/seed-orders.ts` | `createEntity(OrderEntity, …, { expiration: ExpirationTime.atDate(expiry) })` |
| Cancel order | maker | `web/lib/tx.ts → cancelOrder` | `deleteEntity({ entityKey })` (after `RegXDvP.cancel(nonce)` on Whitechain) |
| Mirror trade | keeper | `scripts/wc/keeper.ts` | `createEntity(Fill, …, { expiration: ExpirationTime.max() })` |
| Mirror corporate action | keeper | `scripts/wc/keeper.ts` | `createEntity(Action, …)` |
| Sync security terms | keeper | `scripts/wc/sync-assets.ts` (re-runnable) | `createEntity` or `patchEntity` + `extendEntity(max)` |

## Reads (all in `shared/src/arkiv.ts`, used by the web app and the scripts)

| Screen | Query |
|---|---|
| Markets | `select().from(Asset).where(eq("assetType","invoice-note"))` |
| Order book, asks | `select().from(OrderEntity).where(and(eq("security", X), eq("side","sell"), gt("expiry", now))).orderBy(asc("price"))` |
| Order book, bids | same with `eq("side","buy")` and `orderBy(desc("price"))` |
| My orders | `select().from(OrderEntity).where(eq("maker", me)).orderBy(desc("expiry"))` |
| Trade tape | `select().from(Fill).where(eq("security", X)).orderBy(desc("timestamp"))` |
| Corporate actions | `select().from(Action).where(eq("security", X)).orderBy(desc("timestamp"))` |
| Keeper idempotency | `select().from(Fill \| Action).where(eq("hederaTx", tx))` |
| Asset upsert | `select({ $key: true }).from(Asset).where(eq("security", X)).ownedBy(keeper)` |

The web app combines Arkiv data with live Whitechain state. Remaining size per order comes from `RegXDvP.remaining(order)`, and whether
the maker is frozen or verified comes from T-REX `isFrozen` and the T-REX `isVerified`. Arkiv answers "what orders exist", and Whitechain answers "can this one
settle right now".

## Why each column is indexed

- `security`, `side`, `expiry`: the order book filter. `price`: sort and range. `maker`: "my orders".
- `orderHash`, `hederaTx`: joins between orders, fills and Whitechain transactions (the column is named `hederaTx` for historical reasons: our first venue was Hedera), and the keeper's idempotency check.
- `timestamp`: newest-first tapes. `kind`: filter actions by type. `chainId`: lets the book carry orders for other venues.

## Expiration as a feature

| Entity | Expiration | Effect |
|---|---|---|
| order | `atDate(order.expiry, { atLeast: fromMinutes(1) })` | the book cleans itself up. The "2 min" TTL in the UI shows it live |
| asset | `max()`, re-extended by every sync | lives as long as the bond does |
| fill / action | `max()` | about 6 months of public history on testnet |

## Ownership model

- Orders are **maker-owned**. Only the maker can delete or extend them, and `$owner == maker` is a second check on the EIP-712 signature.
- Fills, actions and assets are **keeper-owned** and reproducible. Anyone can run `npm run wc:keeper -- --once` against Whitechain and produce
  the same entities, because the data derives from on-chain events.
