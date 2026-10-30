<script lang="ts">
  import { onDestroy } from 'svelte'
  import { app, findBackup, openTrip, refreshSelected, replanFromHere } from '../lib/state.svelte'
  import { checkLeg, isTransit } from '../lib/realtime'
  import { compass, decodePolyline, headingAlong } from '../lib/geo'
  import { duration, hm, metres, minutesUntil } from '../lib/format'
  import { isRail, lineColors, lineName, MODE_LABEL, platformLabel, plausibleTrack, quayRef } from '../lib/lines'
  import type { Leg } from '../lib/api/types'
  import type { Transfer } from '../lib/transfer'
  import TimeBadge from './TimeBadge.svelte'
  import WalkSteps from './WalkSteps.svelte'
  import LegStrip from './LegStrip.svelte'

  const a = $derived(app.selected!)
  const it = $derived(a.it)
  let focus = $state<number | null>(null)
  // Showing a leg on the map scrolls the map back into view.
  $effect(() => { if (focus !== null) window.scrollTo({ top: 0, behavior: 'smooth' }) })
  let openSteps = $state<Record<number, boolean>>({})
  let openStops = $state<Record<number, boolean>>({})
  let now = $state(new Date())
  let refreshing = $state(false)

  const transferAt = $derived(new Map(a.transfers.map(t => [t.toIndex, t])))

  async function refresh() {
    refreshing = true
    await refreshSelected()
    refreshing = false
  }

  // Keep live data current while the trip is open; refresh at once when returning to the app.
  const tick = setInterval(() => { now = new Date(); if (document.visibilityState === 'visible') refresh() }, 30000)
  const clock = setInterval(() => (now = new Date()), 10000)
  const onVis = () => { if (document.visibilityState === 'visible') refresh() }
  document.addEventListener('visibilitychange', onVis)
  onDestroy(() => { clearInterval(tick); clearInterval(clock); document.removeEventListener('visibilitychange', onVis) })

  function direction(leg: Leg, i: number) {
    const h = headingAlong(decodePolyline(leg.legGeometry.points, leg.legGeometry.precision))
    const next = leg.intermediateStops?.[0]?.name ?? leg.to.name
    return { heading: h === undefined ? '' : compass(h), next }
  }

  function walkTarget(i: number) {
    const next = it.legs[i + 1]
    return next && isTransit(next) ? next : null
  }

  const riskClass = (t: Transfer) => (t.level === 'ok' ? 'ok' : t.level === 'tight' ? 'warn' : 'bad')
  const riskText = (t: Transfer) =>
    t.level === 'ok' ? 'Comfortable transfer' : t.level === 'tight' ? 'Tight transfer' : t.level === 'risky' ? 'Risky transfer' : 'Transfer likely fails'

  const startsIn = $derived(minutesUntil(checkLeg(it.legs[0]).dep.time, now))
  const cancelledLegs = $derived(it.legs.filter(l => isTransit(l) && (l.cancelled || l.from.cancelled || l.to.cancelled || (l.tripId && app.db[l.tripId]?.cancelled))))
</script>

<div class="trip">
  <div class="mapbox">
    {#await import('./TripMap.svelte') then M}<M.default {it} {focus} />{/await}
    <button class="back card" onclick={() => (app.view = 'search')} aria-label="Back">←</button>
  </div>

  <div class="sheet">
    <div class="summary">
      <div>
        <div class="big tabular">{hm(checkLeg(it.legs[0]).dep.time)} – {hm(checkLeg(it.legs.at(-1)!).arr.time)}</div>
        <div class="muted small">{duration(it.duration)} · {it.transfers} change{it.transfers === 1 ? '' : 's'} · {startsIn > 0 ? `leave in ${startsIn} min` : startsIn === 0 ? 'leave now' : 'in progress'}</div>
      </div>
      <button class="btn" onclick={replanFromHere}>Re-plan from here</button>
    </div>
    <LegStrip {it} />

    <div class="status small muted">
      <span>{refreshing ? 'Updating…' : app.updatedAt ? `Updated ${hm(app.updatedAt)}, refreshes every 30 s` : ''}</span>
      <button class="link" onclick={refresh}>Refresh</button>
    </div>

    {#if app.selectedStale}
      <div class="banner bad">This exact connection no longer appears in live results, so it may be cancelled or changed. <button class="link" onclick={replanFromHere}>See what you can still catch</button></div>
    {/if}
    {#each a.confidence.broken as b}
      <div class="banner bad"><b>Don't rely on this connection.</b> {b} <button class="link" onclick={replanFromHere}>Re-plan</button></div>
    {/each}
    {#each cancelledLegs as l (l.tripId)}
      <div class="banner bad"><b>{lineName(l)}</b> to {l.headsign} is cancelled. <button class="link" onclick={replanFromHere}>Re-plan</button></div>
    {/each}

    <ol class="timeline">
      {#each it.legs as leg, i (i)}
        {@const tr = transferAt.get(i)}
        {#if tr}
          <li class="transfer">
            <div class="banner {riskClass(tr)}">
              <b>{riskText(tr)}</b> at {tr.arriving.to.name}
              {#each tr.reasons as r}<div class="small">{r}</div>{/each}
              {#if tr.level !== 'ok'}
                {@const b = app.backups[tr.toIndex]}
                {#if b === 'loading'}<div class="small">Looking for a backup…</div>
                {:else if b === 'none'}<div class="small">No backup found from this stop.</div>
                {:else if b}
                  <div class="backups">
                    <div class="small"><b>If you miss it:</b></div>
                    {#each b as alt}
                      <button class="alt" onclick={() => openTrip(alt)}>
                        <span class="tabular">{hm(checkLeg(alt.it.legs[0]).dep.time)} → {hm(checkLeg(alt.it.legs.at(-1)!).arr.time)}</span>
                        <LegStrip it={alt.it} />
                      </button>
                    {/each}
                  </div>
                {:else}<button class="link small" onclick={() => findBackup(tr)}>Find a backup</button>{/if}
              {/if}
            </div>
          </li>
        {/if}

        {#if !isTransit(leg)}
          {@const target = walkTarget(i)}
          {#if leg.duration >= 30 || target}
            <li class="walk">
              <div class="rail"><span class="dots"></span></div>
              <div class="body">
                <button class="head" onclick={() => (focus = i)}>
                  <span>🚶 Walk {duration(leg.duration)}{#if leg.distance} · {metres(leg.distance)}{/if}</span>
                </button>
                {#if target}
                  <div class="goal">
                    to <b>{target.from.name}</b>
                    {#if platformLabel(target.from, target.mode)}<span class="plat">{platformLabel(target.from, target.mode)}</span>{/if}
                  </div>
                {:else if i === it.legs.length - 1}
                  <div class="goal">to <b>{app.to?.name ?? 'destination'}</b></div>
                {/if}
                {#if leg.steps?.length}
                  <button class="link small" onclick={() => (openSteps[i] = !openSteps[i])}>{openSteps[i] ? 'Hide' : 'Show'} directions</button>
                  {#if openSteps[i]}<WalkSteps {leg} />{/if}
                {/if}
              </div>
            </li>
          {/if}
        {:else}
          {@const c = lineColors(leg)}
          {@const t = checkLeg(leg)}
          {@const db = leg.tripId ? app.db[leg.tripId] : null}
          {@const d = direction(leg, i)}
          {@const plat = platformLabel(leg.from, leg.mode)}
          <li class="ride" style:--c={c.bg}>
            <div class="rail"><span class="bar"></span></div>
            <div class="body">
              <div class="stoprow">
                <TimeBadge t={t.dep} {db} big />
                <button class="stopname" onclick={() => { app.stop = { id: leg.from.stopId!, name: leg.from.name }; app.view = 'stop' }} disabled={!leg.from.stopId}>{leg.from.name}</button>
              </div>

              <button class="where" onclick={() => (focus = i)}>
                {#if db?.platform && db.platform !== leg.from.track && plausibleTrack(db.plannedPlatform ?? undefined)}
                  <span class="plat changed">Platform {db.platform} <small>(changed from {db.plannedPlatform ?? leg.from.track})</small></span>
                {:else if db?.platform}
                  <span class="plat">Platform {db.platform}</span>
                {:else if plat && leg.from.scheduledTrack && leg.from.track !== leg.from.scheduledTrack && plausibleTrack(leg.from.scheduledTrack)}
                  <span class="plat changed">{plat} <small>(changed from {leg.from.scheduledTrack})</small></span>
                {:else if plat}
                  <span class="plat">{plat}</span>
                {:else if isRail(leg.mode)}
                  <span class="plat unknown">Platform not reliably known: check the departure board</span>
                {/if}
                {#if quayRef(leg.from, leg.mode)}<span class="small muted">{quayRef(leg.from, leg.mode)}</span>{/if}
                <span class="small muted">Map ›</span>
              </button>

              <div class="line">
                <span class="line-badge" style:background={c.bg} style:color={c.fg}>{lineName(leg)}</span>
                <span><b>{leg.headsign}</b></span>
              </div>
              <div class="small muted">
                {MODE_LABEL[leg.mode] ?? 'Vehicle'}{d.heading ? ` heading ${d.heading}` : ''}, next stop <b class="txt">{d.next}</b>
              </div>

              {#if t.dep.reason}<div class="banner warn small">{t.dep.reason}</div>{/if}
              {#each [...(leg.alerts ?? []), ...(leg.from.alerts ?? [])] as al}
                <div class="banner warn small"><b>{al.headerText}</b>{#if al.descriptionText}<div>{al.descriptionText}</div>{/if}</div>
              {/each}
              {#each db?.remarks ?? [] as r}<div class="banner warn small">{r}</div>{/each}

              {#if leg.intermediateStops?.length}
                <button class="link small" onclick={() => (openStops[i] = !openStops[i])}>
                  {leg.intermediateStops.length} stop{leg.intermediateStops.length > 1 ? 's' : ''} · {duration(leg.duration)}
                </button>
                {#if openStops[i]}
                  <ul class="inter small">
                    {#each leg.intermediateStops as s}
                      <li><span class="tabular muted">{s.departure ? hm(s.departure) : ''}</span> {s.name}</li>
                    {/each}
                  </ul>
                {/if}
              {/if}

              <div class="stoprow">
                <TimeBadge t={t.arr} />
                <span>Get off at <b>{leg.to.name}</b>{#if platformLabel(leg.to, leg.mode)}<span class="muted small gap">{platformLabel(leg.to, leg.mode)}</span>{/if}</span>
              </div>
              {#if t.arr.reason}<div class="banner warn small">{t.arr.reason}</div>{/if}
            </div>
          </li>
        {/if}
      {/each}
      <li class="dest"><div class="rail"><span class="pin"></span></div><div class="body"><b>{app.to?.name ?? 'Destination'}</b></div></li>
    </ol>

    <p class="legend small muted">
      <span class="dot live"></span> live data · <span class="dbb">DB</span> confirmed by DB · <span class="q">?</span> live data looks wrong · plain = timetable only
    </p>
  </div>
</div>

<style>
  .trip { display: flex; flex-direction: column; min-height: 100dvh; }
  .mapbox { position: sticky; top: 0; height: 42dvh; z-index: 1; }
  .back { position: absolute; top: 12px; left: 12px; width: 40px; height: 40px; border: 0; font-size: 20px; z-index: 2; }
  .sheet {
    position: relative; z-index: 2; margin-top: -16px; background: var(--bg); border-radius: 18px 18px 0 0;
    padding: 16px; display: grid; gap: 12px; align-content: start; box-shadow: 0 -4px 16px rgb(0 0 0 / 8%);
  }
  .summary { display: flex; justify-content: space-between; align-items: center; gap: 12px; }
  .big { font-size: 22px; font-weight: 700; }
  .status { display: flex; justify-content: space-between; }
  .link { background: none; border: 0; padding: 0; color: var(--accent); font-weight: 600; text-align: left; }

  .timeline { list-style: none; margin: 0; padding: 0; }
  .timeline > li { display: grid; grid-template-columns: 22px 1fr; gap: 10px; }
  .timeline > li.transfer { display: block; margin: 4px 0 10px 32px; }
  .rail { display: flex; justify-content: center; }
  .bar { width: 6px; border-radius: 3px; background: var(--c); margin: 6px 0; }
  .dots { width: 0; border-left: 3px dotted var(--walk); margin: 4px 0; }
  .pin { width: 16px; height: 16px; border-radius: 50%; background: var(--accent); border: 3px solid var(--surface); box-shadow: 0 0 0 2px var(--accent); margin-top: 2px; }
  .body { display: grid; gap: 6px; padding: 6px 0 14px; min-width: 0; }
  .head { background: none; border: 0; padding: 0; text-align: left; font-weight: 600; }
  .goal b, .txt { color: var(--text); font-weight: 600; }
  .stoprow { display: flex; gap: 10px; align-items: baseline; }
  .stopname { background: none; border: 0; padding: 0; font-weight: 650; font-size: 16px; text-align: left; }
  .stopname:not(:disabled) { text-decoration: underline dotted var(--muted); text-underline-offset: 3px; }
  .where { display: flex; justify-content: space-between; align-items: center; gap: 8px; width: 100%; background: var(--surface); border: 1px solid var(--line); border-radius: 10px; padding: 8px 10px; text-align: left; }
  .plat { font-weight: 700; font-size: 15px; }
  .goal .plat { margin-left: 6px; font-size: 14px; }
  .gap { margin-left: 6px; }
  .plat.changed { color: var(--bad); }
  .plat.unknown { color: var(--warn); font-weight: 600; font-size: 14px; }
  .plat small { font-weight: 500; }
  .line { display: flex; gap: 8px; align-items: center; }
  .inter { list-style: none; margin: 0; padding: 0 0 0 4px; display: grid; gap: 3px; }
  .inter .tabular { display: inline-block; width: 42px; }
  .backups { display: grid; gap: 6px; margin-top: 8px; }
  .alt { display: grid; gap: 4px; background: var(--surface); border: 1px solid var(--line); border-radius: 10px; padding: 8px; text-align: left; color: var(--text); }
  .legend { text-align: center; }
  .dot.live { display: inline-block; width: 7px; height: 7px; border-radius: 50%; background: var(--ok); }
  .dbb { font-size: 10px; font-weight: 700; color: #fff; background: #ec0016; padding: 0 4px; border-radius: 4px; }
  .q { font-size: 10px; font-weight: 700; color: var(--warn); background: var(--warn-soft); padding: 0 5px; border-radius: 4px; }
  @media (min-width: 900px) { .mapbox { height: 50dvh; } }
</style>
