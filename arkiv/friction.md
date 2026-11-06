# Arkiv friction log

A running log, written while building RegX at ETHGlobal Mumbai (Nov 2026) with `@arkiv-network/sdk@1.0.1` on Rabdi.
Ordered roughly by how much time each one cost.

## 1. A malformed access key fails with a generic error (≈15 min)
Our `.env` line ended up as `ARKIV_ACCESS_KEY==ark_live_…` (an extra `=` from copy-paste). Every call then failed with
`HTTP request failed.` at the top level. The useful part (`"INVALID_KEY"`, status 401) was only visible in `error.details`/`error.status`.
**Wish:** `rabdi({ accessKey })` could validate the `ark_live_` prefix and throw `MissingAccessKeyError`-style, or surface `INVALID_KEY` in
the error message.

## 2. Docs and the installed SDK disagree on the API surface (≈20 min)
Search results and older guides show `expiresIn`, `contentType`/payload, `updateEntity`, and an SDK "v0.4.4 / v0.6.0". `npm i` gives
**1.0.1**, where the API is schema-first: `defineSchema`, `createEntity(schema, values, { expiration })`, `patchEntity`, `select().from()`.
The new API is much nicer, but we had to read `.d.ts` files to confirm it. **Wish:** a version banner on every docs page, and a
"migrating from 0.x" note for people arriving from old tutorials and LLM answers.

## 3. `MAX_STRING_BYTES = 128` vs signatures (≈10 min)
A 65-byte EIP-712 signature as a hex string is 132 chars, so `str()` rejects it. We moved it to a `bytes()` column, which is the right
call, but the limit wasn't obvious until we checked the exported constants. **Wish:** list the size limits (`MAX_STRING_BYTES`,
`MAX_ATTRIBUTES` = 32, `MAX_ENTITY_BYTES` = 128 KiB) on the schema page next to the column types.

## 4. `ExpirationTime.atDate` option shape
We guessed `atDate(date, { atLeast: true })`. It's `{ atLeast: Lifetime }`, e.g. `{ atLeast: ExpirationTime.fromMinutes(1) }`. The TS types
caught it, so it was quick, but a docs example for "expire at the order's deadline but never sooner than N" would help. It's the natural
pattern for any order or offer.

## 5. Typing of query rows
`fetch()` returns `readonly Row<…>[]` with wrapped values (`{ type, value }`). Writing generic helpers (e.g. idempotency checks across two
schemas) meant `as unknown as Record<string, unknown>[]` casts plus a small `v()` unwrapper. **Wish:** a `row.plain()` / `toPlain(row)`
helper that returns bare JS values (bigint, string, Hex).

## 6. Users need tGLM to own their entities
Maker-owned orders are the best part of the design, but every maker needs Rabdi gas *in addition to* Whitechain gas. For a user coming from
another chain that's a second faucet and a second network in MetaMask. **Wish:** sponsored or meta-transaction writes, where the user
signs and a sponsor pays but the user is still recorded as `$owner`. We kept a keeper-relayed path in mind as the fallback.

## 7. No event when an entity expires
`watchEntityEvents` has created/patched/deleted/extended/ownership events but nothing for expiry (the docs say so, to their credit).
For an order book, "this order just expired" is a UI event. We poll the book instead.

## 8. Explorer deep links
We could not find the entity URL format on the Rabdi explorer in the docs and confirmed `/entity/<key>` and `/address/<addr>` by reading the explorer JS bundle. A documented URL scheme would make
it easy for apps to link "view on Arkiv" next to every row, which we think every app should do.

## What worked really well
- `defineSchema` + `select().from(schema).where(...)` gives typed columns, checks indexes at compile time, and `query.toString()` shows the
  wire query. That's great for debugging.
- `orderBy(asc("price"))` on a `dec` column made the order book a single query.
- Same viem account and key on Whitechain and Arkiv: one ECDSA key gives the same address on both chains.
- `ownedBy(addr)` made the keeper's idempotent upsert trivial.
