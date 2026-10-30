/** Signposted quay names from VRS ("Gleis U3a", "Bussteig E"), built by scripts/vrs-quays.mjs. */
const state = $state({ quays: {} as Record<string, [string, number, number]> })

export async function loadQuays() {
  try {
    const r = await fetch('./data/vrs-quays.json')
    if (r.ok) state.quays = (await r.json()).quays
  } catch {
    /* offline on first load: labels fall back to the feed's own */
  }
}

/** Transitous ids look like "de-DELFI_de:05314:61101:4:18"; VRS uses the bare DELFI id. */
export function vrsQuay(stopId: string | undefined): string | undefined {
  if (!stopId) return undefined
  return state.quays[stopId.replace(/^de-DELFI_/, '')]?.[0]
}
