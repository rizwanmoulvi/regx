/**
 * Read RegX's market straight from Arkiv: no RegX backend, no API key from us (only an Arkiv RPC access key).
 *
 *   npm run arkiv:query                 live order book + latest trades + counts for the active note
 *   npm run arkiv:query -- 0xToken      same for another security
 */
import { and, asc, desc, eq, gt } from "@arkiv-network/sdk/query"
import { addr, u64 } from "@arkiv-network/sdk/schema"
import { Action, Asset, Fill, OrderEntity, v } from "../shared/src/arkiv"
import wc from "../shared/deployments/whitechain-sepolia.json"
import { arkiv } from "./lib/env"

const security = (process.argv[2] ?? wc.notes[wc.active].token) as `0x${string}`
const now = BigInt(Math.floor(Date.now() / 1000))
const rows = (r: { entities: unknown }) => r.entities as Record<string, unknown>[]

// The order book is one typed query per side.
const asks = arkiv
  .select()
  .from(OrderEntity)
  .where(and(eq("security", addr(security)), eq("side", "sell"), gt("expiry", u64(now))))
  .orderBy(asc("price"))
  .limit(50)
const bids = arkiv
  .select()
  .from(OrderEntity)
  .where(and(eq("security", addr(security)), eq("side", "buy"), gt("expiry", u64(now))))
  .orderBy(desc("price"))
  .limit(50)

console.log(`Arkiv Rabdi · security ${security}\n`)
console.log(`asks query: ${asks.toString?.() ?? "(see source)"}\n`)
for (const [label, q] of [["ASKS", asks], ["BIDS", bids]] as const) {
  const r = rows(await q.fetch())
  console.log(`${label} (${r.length})`)
  for (const o of r)
    console.log(`  ${String(v(o.price)).padStart(7)} USDT × ${String(v(o.amount)).padStart(3)}  maker ${v(o.maker)}  owner ${v(o.$owner)}  expires ${new Date(Number(v<bigint>(o.expiry)) * 1000).toISOString()}  entity ${v(o.$key)}`)
}

const fills = rows(await arkiv.select().from(Fill).where(eq("security", addr(security))).orderBy(desc("timestamp")).limit(100).fetch())
console.log(`\nTRADES (${fills.length})`)
for (const f of fills.slice(0, 5))
  console.log(`  ${v(f.amount)} @ ${v(f.price)} USDT  ${v(f.taker)} ← ${v(f.maker)}  tx ${v(f.hederaTx)}`)

const actions = rows(await arkiv.select().from(Action).where(eq("security", addr(security))).orderBy(desc("timestamp")).limit(100).fetch())
const kinds: Record<string, number> = {}
for (const a of actions) kinds[v<string>(a.kind)] = (kinds[v<string>(a.kind)] ?? 0) + 1
console.log(`\nCORPORATE ACTIONS (${actions.length}): ${Object.entries(kinds).map(([k, n]) => `${k} ${n}`).join(", ")}`)

const assets = rows(await arkiv.select().from(Asset).where(eq("assetType", "invoice-note")).limit(50).fetch())
console.log(`\nLISTED NOTES (${assets.length}): ${assets.map((a) => `${v(a.symbol)} [${v(a.status)}]`).join(", ")}`)
