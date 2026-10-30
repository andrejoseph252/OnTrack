<script lang="ts">
  import { onDestroy } from 'svelte'
  import { stopTimes } from '../lib/api/transitous'
  import type { StopTime } from '../lib/api/types'
  import { checkTime, dedupeStopTimes, GHOST_DELAY_LOCAL, isLocal } from '../lib/realtime'
  import { app } from '../lib/state.svelte'
  import { hm, minutesUntil } from '../lib/format'
  import { lineColors, lineName, platformLabel } from '../lib/lines'
  import TimeBadge from './TimeBadge.svelte'

  let list = $state<StopTime[]>([])
  let error = $state('')
  let loading = $state(true)
  let updated = $state<Date | null>(null)
  let now = $state(new Date())

  async function load() {
    if (!app.stop) return
    try {
      const r = await stopTimes(app.stop.id, { n: 30 })
      list = dedupeStopTimes(r.stopTimes)
      updated = new Date()
      error = ''
    } catch (e) {
      error = (e as Error).message
    } finally {
      loading = false
      now = new Date()
    }
  }
  load()
  const timer = setInterval(load, 30000)
  onDestroy(() => clearInterval(timer))
</script>

<div class="page">
  <header>
    <button class="back" onclick={() => (app.view = app.selected ? 'trip' : 'search')} aria-label="Back">←</button>
    <div>
      <h1>{app.stop?.name}</h1>
      <div class="small muted">{updated ? `Updated ${hm(updated)}, refreshes every 30 s` : ''}</div>
    </div>
  </header>

  {#if error}<div class="banner bad">{error}</div>{/if}
  {#if loading}<p class="muted">Loading departures…</p>{/if}

  <ul class="card board">
    {#each list as st (st.tripId + st.place.scheduledDeparture)}
      {@const t = checkTime(st.place.departure, st.place.scheduledDeparture, st.realTime, st.mode, st.cancelled)}
      {@const c = lineColors(st)}
      {@const mins = minutesUntil(t.time, now)}
      {@const ghost = isLocal(st.mode) && t.delayMin > GHOST_DELAY_LOCAL}
      <li class:cancelled={t.status === 'cancelled'} class:ghost>
        <span class="line-badge" style:background={c.bg} style:color={c.fg}>{lineName(st)}</span>
        <span class="dest">
          <b>{st.headsign}</b>
          <span class="small muted">{platformLabel(st.place, st.mode)}{#if ghost}{platformLabel(st.place, st.mode) ? ' · ' : ''}<span class="warn">Probably not running as shown: live data matched to a trip from {hm(t.planned)}</span>{:else if t.reason} · <span class="warn">{t.reason}</span>{/if}</span>
        </span>
        <span class="when">
          <TimeBadge {t} />
          <span class="small muted tabular">{t.status === 'cancelled' ? '' : mins <= 0 ? 'now' : `${mins} min`}</span>
        </span>
      </li>
    {/each}
  </ul>
</div>

<style>
  .page { padding: 16px; display: grid; gap: 12px; }
  header { display: flex; gap: 12px; align-items: center; }
  h1 { font-size: 20px; margin: 0; }
  .back { width: 40px; height: 40px; border: 0; border-radius: 12px; background: var(--surface); box-shadow: var(--shadow); font-size: 20px; flex: none; }
  .board { list-style: none; margin: 0; padding: 4px 0; }
  li { display: grid; grid-template-columns: auto 1fr auto; gap: 10px; align-items: center; padding: 10px 14px; border-bottom: 1px solid var(--line); }
  li:last-child { border-bottom: 0; }
  li.ghost { opacity: .55; }
  li.cancelled .dest b { text-decoration: line-through; color: var(--muted); }
  .dest { display: grid; min-width: 0; }
  .dest b { font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .when { display: grid; justify-items: end; }
  .warn { color: var(--warn); }
</style>
