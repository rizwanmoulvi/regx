/** Same-origin JSON-RPC proxy to the Hedera testnet relay (Hashio). Read and send-raw only. */
const UPSTREAM = process.env.HEDERA_RPC_URL || "https://testnet.hashio.io/api"

export async function POST(req: Request) {
  const body = await req.text()
  const upstream = await fetch(UPSTREAM, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body,
    cache: "no-store",
  })
  return new Response(await upstream.text(), {
    status: upstream.status,
    headers: { "content-type": "application/json" },
  })
}
