/**
 * Seeds the RegX order book on Arkiv with demo orders. Each maker signs an EIP-712 order and
 * publishes it from their own wallet, so the maker owns the entity and only they can delete it.
 *
 *   npm run seed:orders              # default book
 *   npm run seed:orders -- --flash   # one 3-minute sell order (shows Arkiv expiry live)
 */
import { pathToFileURL } from "node:url"
import type { Hex } from "viem"
import { LIFETIME, OrderEntity, orderToEntity } from "../../shared/src/arkiv"
import { type Order, hashOrder, orderTypedData, randomNonce } from "../../shared/src/order"
import { type Role, account, arkivWalletFor, log, requireDeployment } from "../lib/env"

const d = requireDeployment()
const INR = 10n ** 6n

export async function publishOrder(role: Role, side: "sell" | "buy", amount: bigint, priceInr: number, ttlSeconds: number) {
  const maker = account(role)
  const order: Order = {
    maker: maker.address,
    security: d.bond.address,
    payToken: d.tinr,
    isSell: side === "sell",
    price: BigInt(Math.round(priceInr * 100)) * (INR / 100n),
    amount,
    nonce: randomNonce(),
    expiry: BigInt(Math.floor(Date.now() / 1000) + ttlSeconds),
  }
  const signature = (await maker.signTypedData(orderTypedData(d.dvp, order))) as Hex
  const orderHash = hashOrder(d.dvp, order)
  const { entityKey } = await arkivWalletFor(role).createEntity(
    OrderEntity,
    orderToEntity(order, orderHash, signature, d.dvp),
    { expiration: LIFETIME.order(order.expiry) },
  )
  log(`  ✓ ${role} ${side} ${amount} @ ₹${priceInr} (ttl ${ttlSeconds}s) → ${entityKey}`)
  return { entityKey, orderHash, order, signature }
}

async function main() {
  if (process.argv.includes("--flash")) {
    await publishOrder("alice", "sell", 10n, 979, 180)
    return
  }
  const day = 86400
  await publishOrder("alice", "sell", 40n, 985, day)
  await publishOrder("alice", "sell", 30n, 990, 2 * day)
  await publishOrder("alice", "sell", 20n, 1002, 3 * day)
  await publishOrder("bob", "buy", 15n, 970, day)
  await publishOrder("bob", "buy", 10n, 962.5, 2 * day)
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => {
    console.error(e)
    process.exit(1)
  })
}
