/**
 * Seeds the Arkiv order book for the active Whitechain note. Makers sign EIP-712 orders for the Whitechain DvP
 * (chain 1874) and publish them from their own wallets as `regx.order` entities.
 *   npm run wc:seed            default book
 *   npm run wc:seed -- --flash one 3-minute order (shows Arkiv expiry)
 */
import { pathToFileURL } from "node:url"
import { type Hex, parseUnits } from "viem"
import { LIFETIME, OrderEntity, orderToEntity } from "../../shared/src/arkiv"
import { type Order, hashOrder, orderTypedData, randomNonce } from "../../shared/src/order"
import { WC_CHAIN_ID, activeNote } from "../../shared/src/whitechain"
import { type Role, account, arkivWalletFor, log } from "../lib/env"
import { requireWc } from "../lib/wc"

const d = requireWc()
const n = activeNote(d)!

export async function publishWcOrder(role: Role, side: "sell" | "buy", amount: bigint, priceUsdt: string, ttl: number) {
  const maker = account(role)
  const order: Order = {
    maker: maker.address,
    security: n.token,
    payToken: d.usdt,
    isSell: side === "sell",
    price: parseUnits(priceUsdt, 6),
    amount,
    nonce: randomNonce(),
    expiry: BigInt(Math.floor(Date.now() / 1000) + ttl),
  }
  const signature = (await maker.signTypedData(orderTypedData(d.dvp, order, WC_CHAIN_ID))) as Hex
  const orderHash = hashOrder(d.dvp, order, WC_CHAIN_ID)
  const entity = orderToEntity(order, orderHash, signature, d.dvp, WC_CHAIN_ID)
  const { entityKey } = await arkivWalletFor(role).createEntity(OrderEntity, entity, { expiration: LIFETIME.order(order.expiry) })
  log(`  ✓ ${role} ${side} ${amount} ${n.symbol} @ ${priceUsdt} USDT (ttl ${ttl}s) → ${entityKey}`)
  return { entityKey, order, signature, orderHash }
}

async function main() {
  if (process.argv.includes("--flash")) return void (await publishWcOrder("alice", "sell", 5n, "0.985", 180))
  const h = 3600
  await publishWcOrder("alice", "sell", 10n, "0.99", 6 * h)
  await publishWcOrder("alice", "sell", 10n, "0.995", 6 * h)
  await publishWcOrder("bob", "buy", 5n, "0.975", 6 * h)
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => {
    console.error(e)
    process.exit(1)
  })
}
