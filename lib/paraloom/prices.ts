// USD prices for the Home portfolio, from Jupiter's price API. Keyed by base58
// mint. Best-effort: a failed fetch just yields no prices (the UI then shows
// amounts without a USD value).
//
// Privacy: the request ALWAYS carries the same fixed universe of well-known
// mints (PRICED_MINTS) and never the user's held set. The query string is
// therefore identical for every user on every popup open, so it discloses
// nothing about which shielded notes the user holds (fixes #1577). A held
// mint outside the universe simply has no USD price shown; add mints to the
// universe (after verifying Jupiter prices them) rather than querying held
// mints.

const JUP_PRICE_URL = "https://lite-api.jup.ag/price/v3"

// Wrapped-SOL mint — the price id for native SOL.
export const SOL_MINT = "So11111111111111111111111111111111111111112"

// Fixed universe of well-known mints whose prices are fetched. This list is
// the entire query, for every user, every time — do not merge held mints in.
export const PRICED_MINTS: readonly string[] = [
  SOL_MINT, // SOL
  "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", // USDC
  "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB", // USDT
  "JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN", // JUP
  "EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm", // WIF
  "orcaEKTdK7LKz57vaAYr9QeNsVEPfiu6QeMU1kektZE", // ORCA
  "7GCihgDB8fe6KNjn2MYtkzZcRjQy3t9GHdC8uHYmW2hr", // POPCAT
  "MEW1gQWJ3nEXg2qgERiKu7FAFj79PHvQVREQUzScPP5", // MEW
  "ukHH6c7mMyiWCf1b9pnWe25TSpkDDt3H5pQZgZ74J82" // BOME
]

export interface TokenPrice {
  usdPrice: number
  priceChange24h: number // percent, e.g. -0.19
}

export async function fetchPrices(): Promise<Record<string, TokenPrice>> {
  const ids = [...PRICED_MINTS]
  if (ids.length === 0) return {}
  try {
    const ctrl = new AbortController()
    const t = setTimeout(() => ctrl.abort(), 8000)
    const res = await fetch(`${JUP_PRICE_URL}?ids=${ids.join(",")}`, {
      signal: ctrl.signal
    })
    clearTimeout(t)
    if (!res.ok) return {}
    const data = (await res.json()) as Record<
      string,
      { usdPrice?: number; priceChange24h?: number } | null
    >
    const out: Record<string, TokenPrice> = {}
    for (const [mint, v] of Object.entries(data)) {
      if (v && typeof v.usdPrice === "number") {
        out[mint] = {
          usdPrice: v.usdPrice,
          priceChange24h: typeof v.priceChange24h === "number" ? v.priceChange24h : 0
        }
      }
    }
    return out
  } catch {
    return {}
  }
}
