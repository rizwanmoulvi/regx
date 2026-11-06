# Why Arkiv

RegX needs a place to put **orders**: public intent to trade a regulated security. Orders have four properties that make every
alternative a bad fit:

1. **Public.** Any verified investor, aggregator or wallet should see the book, not only users of our front-end.
2. **Queryable.** "Best asks for this bond, cheapest first, still valid" needs typed, indexed filters and sorting.
3. **Short-lived.** Most orders die unfilled. A stale order that keeps showing up is worse than no order.
4. **Authored.** Only the maker may withdraw their order.

| Option | Problem |
|---|---|
| Put orders on Hedera (on-chain order book) | Every post and cancel costs gas (we measured about 1.3 HBAR per 1M gas on testnet), state is not queryable without an indexer, and dead orders stay in storage forever. |
| Hedera Consensus Service topic | Ordered log, but not queryable: every client has to replay the whole topic and build its own index. |
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

**What we keep on Hedera:** everything that needs regulatory finality. Ownership, balances, identity/KYC (ERC-3643), compliance rules,
freezes, coupons and the atomic DvP. The split is deliberate: **Hedera says who may hold the bond, and Arkiv says who wants to trade it.**

The other three collections follow the same reasoning. `regx.fill` and `regx.action` make trade history and corporate actions
(coupons, freezes, KYC events) queryable public data. Today that data sits in a registrar's PDF or a private database.
