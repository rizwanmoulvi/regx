/** Same-origin JSON-RPC proxy to the Hedera testnet relay (Hashio), retrying the relay's transient 5xx errors. */
const UPSTREAMS = (process.env.HEDERA_RPC_URLS || process.env.HEDERA_RPC_URL || "https://testnet.hashio.io/api").split(",")

export async function POST(req: Request) {
  const body = await req.text()
  let last: Response | undefined
  for (let attempt = 0; attempt < 4; attempt++) {
    const url = UPSTREAMS[attempt % UPSTREAMS.length]
    try {
      const r = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body, cache: "no-store" })
      if (r.status < 500) {
        return new Response(await r.text(), { status: r.status, headers: { "content-type": "application/json" } })
      }
      last = r
    } catch {
      // network error: retry
    }
    await new Promise((res) => setTimeout(res, 400 * (attempt + 1)))
  }
  return new Response(last ? await last.text() : '{"jsonrpc":"2.0","error":{"code":-32603,"message":"upstream unavailable"}}', {
    status: 502,
    headers: { "content-type": "application/json" },
  })
}
