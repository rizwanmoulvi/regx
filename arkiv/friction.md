# Arkiv friction log

Written while building RegX at ETHGlobal Mumbai (Nov 5–7 2026) with `@arkiv-network/sdk@1.0.1` on the Rabdi testnet (chain 7794095).
Ordered by how much time each one cost us. Each entry says what we expected, what happened, how to reproduce it, and what would fix it.

## Things that broke

### 1. A malformed access key fails with a generic error (≈15 min)
- **Expected:** a clear "invalid access key" error.
- **Happened:** every call failed with `HTTP request failed.`. The real cause (`"INVALID_KEY"`, HTTP 401) was only in `error.details` /
  `error.status`. Our `.env` line had an extra `=` from copy-paste.
- **Repro:** `createPublicClient({ chain: rabdi({ accessKey: "=ark_live_xxx" }), transport: http() }).select().from(anySchema).where(...).fetch()`
- **Fix:** validate the `ark_live_` prefix in `rabdi({ accessKey })`, or put `INVALID_KEY` in the top-level error message.

### 2. Docs and the installed SDK disagree on the API (≈20 min)
- **Expected:** the docs to match `npm i @arkiv-network/sdk`.
- **Happened:** search results, older guides and LLM answers show `expiresIn`, `contentType`/payload, `updateEntity` and SDK "0.4.x / 0.6.x".
  `npm i` gives **1.0.1**, which is schema-first (`defineSchema`, `createEntity(schema, values, { expiration })`, `patchEntity`,
  `select().from()`). We confirmed it by reading the `.d.ts` files.
- **Repro:** follow a pre-1.0 tutorial against `@arkiv-network/sdk@1.0.1`. `createEntity({ payload, expiresIn })` doesn't type-check.
- **Fix:** a version banner on every docs page and a short "migrating from 0.x" page.

### 3. The 100-row query limit only shows up at runtime (≈5 min, found on the last day)
- **Expected:** the limit in the types or the docs, or results capped at the maximum.
- **Happened:** `.limit(200).fetch()` throws `limit 200 exceeds the node maximum of 100. Page through the results with an offset instead.`
  The error text is good, but nothing warned us before we ran it.
- **Repro:** `arkiv.select().from(Fill).where(eq("security", addr(X))).limit(200).fetch()`
- **Fix:** export `MAX_QUERY_LIMIT`, document it next to `limit()`, and add a paging helper (`fetchAll()` or an async iterator).

### 4. `MAX_STRING_BYTES = 128` vs signatures (≈10 min)
- **Expected:** a 65-byte EIP-712 signature to fit in a `str()` column.
- **Happened:** as a hex string it's 132 chars, so `str()` rejects it. We moved it to a `bytes()` column, which is the right call, but we
  only found the limit by reading the exported constants.
- **Repro:** `defineSchema("t", { sig: str() })`, then `createEntity` with a 0x-prefixed 65-byte signature.
- **Fix:** list `MAX_STRING_BYTES`, `MAX_ATTRIBUTES` (32) and `MAX_ENTITY_BYTES` (128 KiB) on the schema page, next to the column types.

## Things we wish existed

### 5. A filled order can only be removed by its maker
Orders are maker-owned on purpose: only the maker can withdraw intent. But once an order is fully filled on Whitechain, its entity stays
in Arkiv until it expires, and nobody else (not even a keeper that can prove the fill on-chain) can remove it. We handle this by reading
`RegXDvP.remaining(order)` from chain and hiding empty orders, and by adding a "Remove from Arkiv" button in Portfolio.
**Wish:** an owner-granted delegate (e.g. "this address may delete my entities in collection X"), or entity-level permissions, so a keeper
can clean up filled orders without taking ownership away from the maker.

### 6. Users need tGLM to own their entities
Maker-owned orders are the best part of the design, but every maker needs Rabdi gas as well as Whitechain gas. For a user coming from
another chain, that's a second faucet and a second network in MetaMask (the app switches chains mid-flow when posting an order).
**Wish:** sponsored or meta-transaction writes, where the user signs, a sponsor pays, and the user is still recorded as `$owner`.

### 7. No event when an entity expires
`watchEntityEvents` has created/patched/deleted/extended/ownership events but nothing for expiry (the docs say so, to their credit). For an
order book, "this order just expired" is a UI event, so we poll the book every 8 s instead.

### 8. Plain values from query rows
`fetch()` returns rows of wrapped values (`{ type, value }`). Generic helpers (e.g. one idempotency check across two schemas) needed
`as unknown as Record<string, unknown>[]` casts plus our own `v()` unwrapper (`shared/src/arkiv.ts`). **Wish:** `row.plain()` / `toPlain(row)`
that returns bare JS values (bigint, string, Hex).

### 9. `ExpirationTime.atDate` with a floor
We guessed `atDate(date, { atLeast: true })`. It's `{ atLeast: Lifetime }`, e.g. `{ atLeast: ExpirationTime.fromMinutes(1) }`. The types
caught it, but "expire at the deadline, never sooner than N" is the natural pattern for every order or offer, so it deserves a docs example.

### 10. Explorer deep links
The entity URL format on the Rabdi explorer isn't documented. We confirmed `/entity/<key>` and `/address/<addr>` by reading the explorer's
JS bundle. A documented URL scheme would let every app put "view on Arkiv" next to each row, as RegX does.

## What worked really well
- `defineSchema` + `select().from(schema).where(...)` checks indexed columns and types at compile time, and `query.toString()` prints the
  wire query (`npm run arkiv:query` shows it). That's great for debugging.
- `orderBy(asc("price"))` on a `dec` column turns the order book into a single query.
- One ECDSA key gives the same address on Whitechain and Arkiv, so the order signer and the entity owner can be checked against each other.
- `ownedBy(addr)` made the keeper's idempotent upsert of `regx.asset` trivial.
