# Why Arkiv

RegX needs a place to put **orders**: public intent to trade a regulated security. Orders have four properties that make every
alternative a bad fit:

1. **Public.** Any verified investor, aggregator or wallet should see the book, not only users of our front-end.
2. **Queryable.** "Best asks for this note, cheapest first, still valid" needs typed, indexed filters and sorting.
3. **Short-lived.** Most orders die unfilled. A stale order that keeps showing up is worse than no order.
4. **Authored.** Only the maker may withdraw their order.

| Option | Problem |
|---|---|
| Put orders on Whitechain (on-chain order book) | Every post and cancel is a transaction, state is not queryable without an indexer, and dead orders stay in storage forever. |
| Event logs only (emit orders as events) | Ordered log, but not queryable: every client has to replay history and build its own index. |
| Our own database / relayer (0x-style) | One trusted operator who can censor, reorder or lose orders, and a single point of failure. Other venues can't read it without our API. |
| IPFS / Swarm | Storage, not a query engine. No "price < x AND side = sell". |

**Arkiv covers all four properties:**

- **Typed, indexed queries.** `select().from(OrderEntity).where(and(eq("security", …), eq("side","sell"), gt("expiry", now))).orderBy(asc("price"))`
  is the whole order book read. No indexer, no backend.
- **Native expiry = order TTL.** We create each order with `ExpirationTime.atDate(order.expiry)`. When the order dies, the entity is gone:
  no cancel transaction, no cleanup cron, and nothing stale in the book. (A cancel before expiry is `deleteEntity` plus an on-chain nonce cancel.)
- **Ownership.** The maker's wallet creates the entity, so only the maker can delete or extend it. Authorship is enforced by the
  database, not by us.
- **Public by default.** The same query works for any app, wallet or analytics site. The book is a public good, not a moat.
- **Cheap writes, free reads.** Posting an order costs a fraction of a tGLM, and reading costs nothing.

## If we swapped Arkiv for Postgres, users would lose

- **A book they can read without us.** Today any wallet or analytics app runs `npm run arkiv:query` (or the same query in its own code)
  with no RegX API, key or permission. With Postgres the book exists only behind our API. If RegX goes down or decides to hide an order,
  investors lose their exit.
- **Proof that an order is theirs.** The maker's wallet owns the entity, so only the maker can withdraw it. With Postgres, we could
  delete or reorder anyone's orders and nobody could tell.
- **Orders that die when they say they will.** Expiry is part of the entity, enforced by the network. With Postgres it's a cron job we run,
  and a missed job shows stale quotes.
- **A history anyone can verify.** Every `regx.fill` / `regx.action` carries the Whitechain tx hash, and anyone can re-run the keeper to
  rebuild the same entities. A Postgres table is only as trustworthy as whoever has write access to it.

What users would *gain* with Postgres: arbitrary SQL joins and full-text search. RegX doesn't need either. Every screen is one indexed
filter plus a sort.

## What we keep off Arkiv, and why

**What we keep on Whitechain:** everything that needs regulatory finality. Ownership, balances, identity/KYC (ERC-3643), compliance rules,
freezes, coupons and the atomic DvP. The split is deliberate: **Whitechain says who may hold the note and moves the USDT, and Arkiv says who wants to trade it.**
These have to be final, enforced on every transfer, and settled atomically with money. That is a chain's job, not a database's.

**What we keep off both:** personal data. KYC is a signed claim on the investor's ONCHAINID. Names, documents and the invoice itself
never go on Arkiv, because entities are public and we would have no way to erase them on request before they expire.

The other three collections follow the same reasoning. `regx.fill` and `regx.action` make trade history and corporate actions
(coupons, freezes, KYC events) queryable public data. Today that data sits in a registrar's PDF or a private database.
