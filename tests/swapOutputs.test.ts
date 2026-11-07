import { beforeEach, describe, expect, it } from "vitest"

import {
  dismissSwapOutput,
  listSwapOutputs,
  saveSwapOutput,
  type SwapOutput
} from "../lib/paraloom/swapOutputs"
import { installFakeChrome, type FakeChrome } from "./support/chromeStorage"

const KEY = "paraloom_swap_outputs"

function output(overrides: Partial<SwapOutput> = {}): SwapOutput {
  return {
    freshAddress: "FreshAddr11111111111111111111111111111111",
    freshSecretKeyHex: "aa".repeat(64),
    outputMint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
    outAmount: 1000,
    swapSignature: "",
    reshield: true,
    createdAt: 1000,
    ...overrides
  }
}

describe("saveSwapOutput / listSwapOutputs", () => {
  let fake: FakeChrome

  beforeEach(() => {
    fake = installFakeChrome()
  })

  it("persists a first-stage row and lists it back", async () => {
    await saveSwapOutput(output())
    const rows = await listSwapOutputs()
    expect(rows).toHaveLength(1)
    expect(rows[0].freshAddress).toBe("FreshAddr11111111111111111111111111111111")
    expect(rows[0].createdAt).toBe(1000)
  })

  it("upsert preserves the original createdAt when the second-stage write passes a fresh timestamp", async () => {
    await saveSwapOutput(output({ createdAt: 1000 }))
    await saveSwapOutput(
      output({ outAmount: 5000, swapSignature: "sig", createdAt: 9999 })
    )
    const rows = await listSwapOutputs()
    expect(rows).toHaveLength(1)
    expect(rows[0].createdAt).toBe(1000)
    expect(rows[0].outAmount).toBe(5000)
    expect(rows[0].swapSignature).toBe("sig")
  })

  it("upsert preserves reshield / reshieldRecovered when the second-stage write omits them", async () => {
    await saveSwapOutput(output({ reshield: true, reshieldRecovered: true }))
    const second = output({
      outAmount: 5000,
      swapSignature: "sig",
      createdAt: 9999
    })
    delete second.reshield
    delete second.reshieldRecovered
    await saveSwapOutput(second)
    const rows = await listSwapOutputs()
    expect(rows[0].reshield).toBe(true)
    expect(rows[0].reshieldRecovered).toBe(true)
  })

  it("upsert still honors an explicit reshield change", async () => {
    await saveSwapOutput(output({ reshield: true }))
    await saveSwapOutput(output({ reshield: false, outAmount: 5000 }))
    const rows = await listSwapOutputs()
    expect(rows[0].reshield).toBe(false)
  })

  it("rejects an empty freshAddress (rows would collide on one key)", async () => {
    await expect(saveSwapOutput(output({ freshAddress: "" }))).rejects.toThrow(
      /freshAddress/
    )
    await expect(saveSwapOutput(output({ freshAddress: "   " }))).rejects.toThrow(
      /freshAddress/
    )
    expect(await listSwapOutputs()).toHaveLength(0)
  })

  it("rejects an invalid freshSecretKeyHex", async () => {
    await expect(saveSwapOutput(output({ freshSecretKeyHex: "" }))).rejects.toThrow(
      /freshSecretKeyHex/
    )
    await expect(saveSwapOutput(output({ freshSecretKeyHex: "zz" }))).rejects.toThrow(
      /freshSecretKeyHex/
    )
    await expect(saveSwapOutput(output({ freshSecretKeyHex: "abc" }))).rejects.toThrow(
      /freshSecretKeyHex/
    )
    expect(await listSwapOutputs()).toHaveLength(0)
  })

  it("rejects NaN, infinite, and negative outAmount", async () => {
    await expect(saveSwapOutput(output({ outAmount: NaN }))).rejects.toThrow(
      /outAmount/
    )
    await expect(saveSwapOutput(output({ outAmount: Infinity }))).rejects.toThrow(
      /outAmount/
    )
    await expect(saveSwapOutput(output({ outAmount: -1 }))).rejects.toThrow(
      /outAmount/
    )
    expect(await listSwapOutputs()).toHaveLength(0)
  })

  it("treats a non-array stored value as empty instead of crashing", async () => {
    fake.storage.local.raw[KEY] = "corrupted"
    expect(await listSwapOutputs()).toEqual([])
    // A fresh save overwrites the corrupted value with a real array.
    await saveSwapOutput(output())
    expect(await listSwapOutputs()).toHaveLength(1)
    // Dismiss also tolerates corrupted storage.
    fake.storage.local.raw[KEY] = { not: "an array" }
    await dismissSwapOutput("FreshAddr11111111111111111111111111111111")
    expect(await listSwapOutputs()).toEqual([])
  })

  it("dismiss removes only the named row", async () => {
    await saveSwapOutput(output())
    await saveSwapOutput(output({ freshAddress: "OtherAddr22222222222222222222222222222222" }))
    await dismissSwapOutput("FreshAddr11111111111111111111111111111111")
    const rows = await listSwapOutputs()
    expect(rows).toHaveLength(1)
    expect(rows[0].freshAddress).toBe("OtherAddr22222222222222222222222222222222")
  })
})
