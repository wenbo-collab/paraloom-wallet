import { fetchPrices, PRICED_MINTS, SOL_MINT } from "~lib/paraloom/prices"
import { afterEach, describe, expect, it, vi } from "vitest"

const USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"
// A rare/low-float mint a user might hold in shielded notes. It must never
// appear in an outbound request.
const RARE_MINT = "4k3Dyjzvzp8eMZWUXbBCjEvwSkfaJJyWSRzWH9xjqV"

afterEach(() => {
  vi.unstubAllGlobals()
})

function installFetch(
  impl: (url: string) => Promise<{ ok: boolean; json: () => Promise<unknown> }>
) {
  const spy = vi.fn(impl)
  vi.stubGlobal("fetch", spy)
  return spy
}

describe("fetchPrices privacy (fixes #1577)", () => {
  it("always queries exactly the fixed universe, never held mints", async () => {
    const fetchSpy = installFetch(async () => ({
      ok: true,
      json: async () => ({})
    }))
    await fetchPrices()
    expect(fetchSpy).toHaveBeenCalledTimes(1)
    const [url] = fetchSpy.mock.calls[0] as [string]
    expect(url).toBe(
      `https://lite-api.jup.ag/price/v3?ids=${PRICED_MINTS.join(",")}`
    )
    expect(url).not.toContain(RARE_MINT)
  })

  it("sends the identical query on every call (no holdings dependence)", async () => {
    const fetchSpy = installFetch(async () => ({
      ok: true,
      json: async () => ({})
    }))
    await fetchPrices()
    await fetchPrices()
    const [first] = fetchSpy.mock.calls[0] as [string]
    const [second] = fetchSpy.mock.calls[1] as [string]
    expect(first).toBe(second)
  })

  it("returns parsed prices and drops entries without a numeric usdPrice", async () => {
    installFetch(async () => ({
      ok: true,
      json: async () => ({
        [SOL_MINT]: { usdPrice: 83.18, priceChange24h: -0.06 },
        [USDC_MINT]: { usdPrice: 0.999, priceChange24h: undefined },
        [RARE_MINT]: { usdPrice: "not-a-number" },
        deadbeef: null
      })
    }))
    const prices = await fetchPrices()
    expect(prices[SOL_MINT]).toEqual({ usdPrice: 83.18, priceChange24h: -0.06 })
    expect(prices[USDC_MINT]).toEqual({ usdPrice: 0.999, priceChange24h: 0 })
    expect(prices[RARE_MINT]).toBeUndefined()
    expect(prices["deadbeef"]).toBeUndefined()
  })

  it("returns {} on a non-OK response", async () => {
    installFetch(async () => ({ ok: false, json: async () => ({}) }))
    await expect(fetchPrices()).resolves.toEqual({})
  })

  it("returns {} when fetch throws", async () => {
    installFetch(async () => {
      throw new Error("network down")
    })
    await expect(fetchPrices()).resolves.toEqual({})
  })
})

describe("PRICED_MINTS universe", () => {
  it("is non-empty, unique, and always includes SOL", () => {
    expect(PRICED_MINTS.length).toBeGreaterThanOrEqual(2)
    expect(new Set(PRICED_MINTS).size).toBe(PRICED_MINTS.length)
    expect(PRICED_MINTS).toContain(SOL_MINT)
    expect(PRICED_MINTS).toContain(USDC_MINT)
  })
})
