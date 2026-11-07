// Private swap-out outputs. A private swap leaves the bought token at a FRESH,
// unlinkable address whose key the wallet generated. That key never leaves the
// wallet, so it must be persisted here or the token would be unrecoverable.
// Stored in extension-local storage (not synced).

export interface SwapOutput {
  /** The fresh, unlinkable address holding the swapped token. */
  freshAddress: string
  /** Secret key (hex) of the fresh address — needed to move the token later. */
  freshSecretKeyHex: string
  /** Output mint (base58) or "SOL". */
  outputMint: string
  /** Output amount the route reported, in the out mint's base units. */
  outAmount: number
  /** The swap transaction signature. Empty until the swap leg completes; a
   *  non-empty value marks the swap done (used to find resumable strands). */
  swapSignature: string
  /** Whether the user asked to re-shield the bought token (a round trip). Saved
   *  so a resumed/recovered swap honors the original intent. */
  reshield?: boolean
  /** Set once the re-shield note has been persisted (either normally or via the
   *  recovery scan), so recovery does not re-scan a settled reshield each connect. */
  reshieldRecovered?: boolean
  createdAt: number
}

const KEY = "paraloom_swap_outputs"

/** Read the stored rows, tolerating corrupted storage: a non-array value (or
 *  non-object rows) must not throw — the swap flows treat "no rows" as empty. */
async function readRows(): Promise<SwapOutput[]> {
  const stored = await chrome.storage.local.get(KEY)
  const raw = stored[KEY]
  if (!Array.isArray(raw)) return []
  return raw.filter((o): o is SwapOutput => !!o && typeof o === "object")
}

function isHexString(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length % 2 === 0 &&
    /^[0-9a-fA-F]+$/.test(value)
  )
}

/** Reject rows that would corrupt the store: an empty freshAddress collides
 *  every row onto one key, an empty/invalid secret key strands the funds, and
 *  a NaN / infinite / negative amount is not a real output amount. */
function validateOutput(output: SwapOutput): void {
  if (typeof output.freshAddress !== "string" || output.freshAddress.trim() === "") {
    throw new Error("saveSwapOutput: freshAddress must be a non-empty string")
  }
  if (!isHexString(output.freshSecretKeyHex)) {
    throw new Error("saveSwapOutput: freshSecretKeyHex must be a non-empty hex string")
  }
  if (
    typeof output.outAmount !== "number" ||
    !Number.isFinite(output.outAmount) ||
    output.outAmount < 0
  ) {
    throw new Error("saveSwapOutput: outAmount must be a finite number >= 0")
  }
}

// Upsert by freshAddress: the key is saved early (before the withdraw) so it can
// never be lost, then the same entry is updated with the realized amount +
// signature once the swap lands. Keyed on the address so the two writes collapse
// to one row.
//
// On upsert the ORIGINAL row wins for the fields the second-stage write must
// never move: `createdAt` (the swap's real start time — the second-stage write
// passes a fresh Date.now()), `freshSecretKeyHex` (losing it strands the
// funds), and `reshield` / `reshieldRecovered` (omitted or `undefined` in the
// second-stage write must not clobber the recorded intent/state).
export async function saveSwapOutput(output: SwapOutput): Promise<void> {
  validateOutput(output)
  const current = await readRows()
  const i = current.findIndex((o) => o.freshAddress === output.freshAddress)
  if (i >= 0) {
    const existing = current[i]
    current[i] = {
      ...existing,
      ...output,
      createdAt: existing.createdAt,
      freshSecretKeyHex: output.freshSecretKeyHex || existing.freshSecretKeyHex,
      reshield: output.reshield ?? existing.reshield,
      reshieldRecovered: output.reshieldRecovered ?? existing.reshieldRecovered
    }
  } else {
    current.push(output)
  }
  await chrome.storage.local.set({ [KEY]: current })
}

export async function listSwapOutputs(): Promise<SwapOutput[]> {
  return readRows()
}

// Drop a swap row by its fresh address. Used to clear a stale "pending" row the
// reconciler could not positively account for — the funds are already safe (the
// swap either re-shielded into the pool or its input note was never spent), so
// this only removes the misleading Activity entry, never any money.
export async function dismissSwapOutput(freshAddress: string): Promise<void> {
  const current = await readRows()
  const next = current.filter((o) => o.freshAddress !== freshAddress)
  await chrome.storage.local.set({ [KEY]: next })
}
