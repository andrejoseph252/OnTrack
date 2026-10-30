<script lang="ts">
  import { hm } from '../lib/format'
  import type { CheckedTime } from '../lib/realtime'
  import type { DbCheck } from '../lib/api/db'

  let { t, db = null, big = false }: { t: CheckedTime; db?: DbCheck | null; big?: boolean } = $props()

  // DB data, when matched, is already folded into t by checkLeg (t.source === 'db').
  const fromDb = $derived(t.source === 'db' || !!db?.when)
  const shown = $derived(t.source !== 'db' && db?.when ? db.when : t.time)
  const delay = $derived(t.source !== 'db' && db?.when ? db.delayMin : t.status === 'live' ? t.delayMin : null)
  const cancelled = $derived(t.status === 'cancelled' || !!db?.cancelled)
  const changed = $derived(Math.abs(shown.getTime() - t.planned.getTime()) >= 60000)
  const title = $derived(
    cancelled ? 'Cancelled'
    : fromDb ? 'Confirmed with DB live data'
    : t.status === 'live' ? 'Live data'
    : t.status === 'unverified' ? t.reason
    : 'Timetable only, no live data',
  )
</script>

<span class="tb tabular" class:big title={title}>
  {#if cancelled}
    <s class="muted">{hm(t.planned)}</s> <span class="bad">Cancelled</span>
  {:else}
    {#if changed}<s class="muted planned">{hm(t.planned)}</s>{/if}
    <span class:late={delay !== null && delay >= 3} class:ontime={delay !== null && delay < 3} class:approx={!fromDb && t.status === 'unverified'}>
      {#if !fromDb && t.status === 'unverified'}~{/if}{hm(shown)}
    </span>
    {#if fromDb}<span class="src db" aria-label="DB confirmed">DB</span>
    {:else if t.status === 'live'}<span class="src live" aria-label="live"></span>
    {:else if t.status === 'unverified'}<span class="src unv" aria-label="unverified">?</span>{/if}
  {/if}
</span>

<style>
  .tb { display: inline-flex; align-items: center; gap: 4px; white-space: nowrap; }
  .big { font-size: 17px; font-weight: 650; }
  .planned { font-size: .85em; }
  .late { color: var(--bad); font-weight: 650; }
  .ontime { color: var(--ok); }
  .approx { color: var(--warn); }
  .bad { color: var(--bad); font-weight: 650; }
  .src { font-size: 10px; font-weight: 700; border-radius: 4px; }
  .src.live { width: 7px; height: 7px; border-radius: 50%; background: var(--ok); box-shadow: 0 0 0 3px var(--ok-soft); }
  .src.db { padding: 0 4px; color: #fff; background: #ec0016; }
  .src.unv { padding: 0 5px; color: var(--warn); background: var(--warn-soft); }
</style>
