<script lang="ts">
  import { onDestroy } from 'svelte'
  import { stopTimes } from '../lib/api/transitous'
  import type { StopTime } from '../lib/api/types'
  import { checkTime, dedupeStopTimes, GHOST_DELAY_LOCAL, isLocal } from '../lib/realtime'
  import { app, back } from '../lib/state.svelte'
  import { hm, minutesUntil } from '../lib/format'
  import { lineColors, lineName, platformLabel } from '../lib/lines'
  import TimeBadge from './TimeBadge.svelte'
  import LineBadge from './LineBadge.svelte'

  let list = $state<StopTime[]>([])
  let error = $state('')
  let loading = $state(true)
  let updated = $state<Date | null>(null)
  let now = $state(new Date())
  let onlyLine = $state(!!app.stop?.line)

  const shown = $derived(onlyLine && app.stop?.line ? list.filter(st => lineName(st) === app.stop!.line || st.routeShortName === app.stop!.line) : list)

  async function load() {
    const s = app.stop
    if (!s) return
    try {
      const r = await stopTimes(s, { n: 40 })
      list = dedupeStopTimes(r.stopTimes)
      updated = new Date()
      publishQuays()
      error = ''
    } catch (e) {
      error = (e as Error).message
    } finally {
      loading = false
      now = new Date()
    }
  }
  /** Each stopping point (often opposite sides of the street) and where its buses go. */
  function publishQuays() {
    const by = new Map<string, (typeof app.stopQuays)[number]>()
    for (const st of shown) {
      const p = st.place
      const key = p.stopId ?? `${p.lat},${p.lon}`
      const q = by.get(key) ?? { lat: p.lat, lon: p.lon, label: platformLabel(p, st.mode), to: [], color: lineColors(st).bg }
      const dest = `${lineName(st)} ${st.headsign.replace(/^Bonn\s+/, '')}`
      if (q.to.length < 2 && !q.to.includes(dest)) q.to.push(dest)
      by.set(key, q)
    }
    app.stopQuays = [...by.values()]
  }
  $effect(() => { void onlyLine; publishQuays() })
  onDestroy(() => (app.stopQuays = []))

  load()
  const timer = setInterval(() => { if (document.visibilityState === 'visible') load() }, 30000)
  onDestroy(() => clearInterval(timer))
</script>

<div class="view-head">
  <button class="icon-btn" onclick={back} aria-label="Back">
    <svg viewBox="0 0 24 24"><path d="m15 6-6 6 6 6" /></svg>
  </button>
  <div class="ttl">
    <h1>{app.stop?.name}</h1>
    <div class="sub">{updated ? `Departures · live ${hm(updated)}` : 'Departures'}</div>
  </div>
</div>

{#if app.stop?.line}
  <div class="seg" role="group">
    <button aria-pressed={onlyLine} onclick={() => (onlyLine = true)}>Line {app.stop.line}</button>
    <button aria-pressed={!onlyLine} onclick={() => (onlyLine = false)}>All lines</button>
  </div>
{/if}

{#if error}<div class="banner bad">{error}</div>{/if}
{#if loading}{#each [0, 1, 2, 3] as i (i)}<div class="skel"></div>{/each}{/if}

{#if !loading && !shown.length && !error}<p class="muted">No departures in the next while.</p>{/if}

<ul class="board">
  {#each shown as st (st.tripId + st.place.scheduledDeparture)}
    {@const t = checkTime(st.place.departure, st.place.scheduledDeparture, st.realTime, st.mode, st.cancelled)}
    {@const c = lineColors(st)}
    {@const mins = minutesUntil(t.time, now)}
    {@const ghost = isLocal(st.mode) && t.delayMin > GHOST_DELAY_LOCAL}
    {@const plat = platformLabel(st.place, st.mode)}
    <li class:cancelled={t.status === 'cancelled'} class:ghost>
      <LineBadge name={lineName(st)} mode={st.mode} bg={c.bg} fg={c.fg} headsign={st.headsign} />
      <span class="dest">
        <b>{st.headsign}</b>
        <span class="small muted">{plat}{#if ghost}{plat ? ' · ' : ''}<span class="warn">Probably not running as shown: live data matched to a trip from {hm(t.planned)}</span>{:else if t.reason}{plat ? ' · ' : ''}<span class="warn">{t.reason}</span>{/if}</span>
      </span>
      <span class="when">
        <span class="mins tabular" class:soon={mins <= 2 && t.status !== 'cancelled'}>{t.status === 'cancelled' ? '' : mins <= 0 ? 'now' : mins < 60 ? `${mins}′` : ''}</span>
        <TimeBadge {t} />
      </span>
    </li>
  {/each}
</ul>

<style>
  .icon-btn svg { width: 20px; height: 20px; fill: none; stroke: currentColor; stroke-width: 2.2; stroke-linecap: round; stroke-linejoin: round; }
  .ttl { flex: 1; min-width: 0; }
  .ttl h1 { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .seg { display: inline-flex; background: var(--surface-2); border-radius: 11px; padding: 3px; margin-top: 12px; }
  .seg button { border: 0; background: none; padding: 6px 13px; border-radius: 9px; font-size: 14px; font-weight: 600; color: var(--muted); }
  .seg button[aria-pressed='true'] { background: var(--surface); color: var(--text); box-shadow: var(--shadow-sm); }
  .board { list-style: none; margin: 12px 0 0; padding: 0; background: var(--surface); border-radius: var(--radius); box-shadow: var(--shadow-sm); overflow: hidden; }
  .board:empty { display: none; }
  li { display: grid; grid-template-columns: auto 1fr auto; gap: 12px; align-items: center; padding: 11px 14px; }
  li + li { border-top: 1px solid var(--line); }
  li.ghost { opacity: .55; }
  li.cancelled .dest b { text-decoration: line-through; color: var(--muted); }
  .dest { display: grid; min-width: 0; }
  .dest b { font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .when { display: grid; justify-items: end; gap: 1px; }
  .mins { font: 750 17px var(--display); letter-spacing: -.02em; }
  .mins.soon { color: var(--accent); }
  .warn { color: var(--warn); }
  .skel { height: 56px; margin-top: 10px; border-radius: 14px; background: linear-gradient(90deg, var(--surface) 0%, var(--surface-2) 50%, var(--surface) 100%); background-size: 200% 100%; animation: sh 1.2s infinite; }
  @keyframes sh { to { background-position: -200% 0; } }
</style>
