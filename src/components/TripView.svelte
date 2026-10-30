<script lang="ts">
  import { onDestroy } from 'svelte'
  import { app, back, departuresFrom, go, refreshSelected, replanFromHere, useDeparture, type Annotated } from '../lib/state.svelte'
  import type { PlanOptions } from '../lib/api/transitous'
  import { checkLeg, isTransit } from '../lib/realtime'
  import { duration, hm, metres, minutesUntil } from '../lib/format'
  import { isRail, lineColors, lineName, platformLabel, plausibleTrack } from '../lib/lines'
  import TimeBadge from './TimeBadge.svelte'
  import LineBadge from './LineBadge.svelte'
  import LegStrip from './LegStrip.svelte'

  const a = $derived(app.selected!)
  const it = $derived(a.it)
  let openStops = $state<Record<number, boolean>>({})
  let now = $state(new Date())

  // Framing a leg lowers the sheet so the map is in view.
  function showOnMap(i: number) {
    app.tripFocus = i
    app.sheet = 'peek'
  }

  // Keep live data current while the trip is open and not yet over; refresh at once when
  // returning to the app. 60 s keeps us well inside Transitous' fair-use guidance.
  const active = () => document.visibilityState === 'visible' && Date.now() < new Date(it.endTime).getTime() + 5 * 60000
  const tick = setInterval(() => { now = new Date(); if (active()) refreshSelected() }, 60000)
  const clock = setInterval(() => (now = new Date()), 10000)
  const onVis = () => { if (active()) refreshSelected() }
  document.addEventListener('visibilitychange', onVis)
  onDestroy(() => { clearInterval(tick); clearInterval(clock); document.removeEventListener('visibilitychange', onVis) })

  // "Other departures from here", per leg.
  let others = $state<Record<number, { status: 'loading' | 'ready' | 'error'; ready?: Date; at?: string; keep?: number; options?: Annotated[]; query?: PlanOptions }>>({})
  async function toggleOthers(i: number) {
    if (others[i]) { delete others[i]; return }
    others[i] = { status: 'loading' }
    try {
      const r = await departuresFrom(i)
      others[i] = { status: 'ready', ...r }
    } catch {
      others[i] = { status: 'error' }
    }
  }
  function pick(keep: number, alt: Annotated, query: PlanOptions) {
    useDeparture(keep, alt, query)
    others = {}
  }
  const firstRide = (x: Annotated) => x.it.legs.find(isTransit)!
  const rides = (x: Annotated) => x.it.legs.filter(isTransit)
  const shortName = (name: string) => name.replace(/^Bonn\s+/, '')

  function walkTarget(i: number) {
    const next = it.legs[i + 1]
    return next && isTransit(next) ? next : null
  }

  /** Only connections that won't work are worth interrupting for. */
  const failing = $derived(new Map(a.transfers.filter(t => t.level === 'missed').map(t => [t.toIndex, t])))
  const startsIn = $derived(minutesUntil(checkLeg(it.legs[0]).dep.time, now))
  const cancelledLegs = $derived(it.legs.filter(l => isTransit(l) && (l.cancelled || l.from.cancelled || l.to.cancelled || (l.tripId && app.db[l.tripId]?.cancelled))))
</script>

<div class="view-head">
  <button class="icon-btn" onclick={back} aria-label="Back">
    <svg viewBox="0 0 24 24"><path d="m15 6-6 6 6 6" /></svg>
  </button>
  <div class="ttl">
    <h1 class="tabular">{hm(checkLeg(it.legs[0]).dep.time)} – {hm(checkLeg(it.legs.at(-1)!).arr.time)}</h1>
    <div class="sub">{duration(it.duration)} · {it.transfers === 0 ? 'direct' : `${it.transfers} change${it.transfers > 1 ? 's' : ''}`} · <b class:soon={startsIn <= 5 && startsIn >= 0}>{startsIn > 0 ? `leave in ${startsIn} min` : startsIn === 0 ? 'leave now' : 'on the way'}</b></div>
  </div>
  <button class="btn replan" onclick={replanFromHere}>Re-plan</button>
</div>
<div class="strip"><LegStrip {it} /></div>

{#if app.selectedStale}
  <div class="banner bad">This connection no longer shows in live data; it may be cancelled or changed. <button class="link" onclick={replanFromHere}>See what you can still catch</button></div>
{/if}
{#if a.fallback}
  <div class="banner warn"><b>Timetable times only</b> for line {a.fallback.join(', ')}: its live data is unreliable right now. Check the display at the stop.</div>
{/if}
{#each a.confidence.broken as b}
  <div class="banner bad"><b>Don't rely on this.</b> {b}</div>
{/each}
{#each cancelledLegs as l (l.tripId)}
  <div class="banner bad"><b>{lineName(l)}</b> to {l.headsign} is cancelled. <button class="link" onclick={replanFromHere}>Re-plan</button></div>
{/each}

<ol class="timeline">
  {#each it.legs as leg, i (i)}
    {#if !isTransit(leg)}
      {@const target = walkTarget(i)}
      {#if leg.duration >= 60 || target}
        <li class="walk">
          <div class="rail"><span class="dots"></span></div>
          <button class="body walkrow" onclick={() => showOnMap(i)}>
            <svg class="wki" viewBox="0 0 24 24" aria-hidden="true"><circle cx="13" cy="4" r="2" /><path d="m9 21 3-7 3 3v4M7 12l2-4 4-1 2 4 3 1M12 14l-1-4" /></svg>
            <span>Walk {duration(leg.duration)}{#if leg.distance}<span class="muted"> · {metres(leg.distance)}</span>{/if}{#if !target && i === it.legs.length - 1}<span class="muted"> to {app.to?.name ?? 'destination'}</span>{/if}</span>
          </button>
        </li>
      {/if}
    {:else}
      {@const c = lineColors(leg)}
      {@const t = checkLeg(leg)}
      {@const db = leg.tripId ? app.db[leg.tripId] : null}
      {@const dbArr = leg.tripId ? app.dbArr[leg.tripId] : null}
      {@const plat = platformLabel(leg.from, leg.mode)}
      {@const fail = failing.get(i)}
      {@const o = others[i]}
      {#if fail}
        <li class="note"><div></div><div class="banner bad small">Probably too late for this connection. <button class="link" onclick={() => toggleOthers(i)}>Other departures</button></div></li>
      {/if}
      <li class="ride" style:--c={c.bg}>
        <div class="rail"><span class="bar"></span></div>
        <div class="body">
          <div class="stoprow">
            <TimeBadge t={t.dep} {db} big />
            <button class="stopname" onclick={() => { app.stop = { name: leg.from.name, lat: leg.from.lat, lon: leg.from.lon }; go('stop') }}>{leg.from.name}</button>
          </div>

          <button class="where" onclick={() => showOnMap(i)}>
            <span class="line">
              <LineBadge name={lineName(leg)} mode={leg.mode} bg={c.bg} fg={c.fg} headsign={leg.headsign} />
              <span class="hs">{leg.headsign}</span>
            </span>
            {#if db?.platform && db.plannedPlatform && db.platform !== db.plannedPlatform}
              <span class="plat changed">Pl. {db.platform}</span>
            {:else if db?.platform}
              <span class="plat">Pl. {db.platform}</span>
            {:else if plat && leg.from.scheduledTrack && leg.from.track !== leg.from.scheduledTrack && plausibleTrack(leg.from.scheduledTrack)}
              <span class="plat changed">{plat}</span>
            {:else if plat}
              <span class="plat">{plat.replace(/^Platform /, 'Pl. ')}</span>
            {:else if isRail(leg.mode)}
              <span class="plat unknown">Check board</span>
            {/if}
          </button>
          {#if db?.platform && db.plannedPlatform && db.platform !== db.plannedPlatform}
            <div class="small chg">Platform changed from {db.plannedPlatform}</div>
          {/if}

          {#each [...(leg.alerts ?? []), ...(leg.from.alerts ?? [])] as al}
            <div class="banner warn small"><b>{al.headerText}</b>{#if al.descriptionText}<div>{al.descriptionText}</div>{/if}</div>
          {/each}

          <div class="meta small">
            {#if leg.intermediateStops?.length}
              <button class="link" onclick={() => (openStops[i] = !openStops[i])}>{leg.intermediateStops.length} stop{leg.intermediateStops.length > 1 ? 's' : ''} · {duration(leg.duration)}</button>
            {:else}<span class="muted">{duration(leg.duration)}</span>{/if}
            <button class="link others" aria-expanded={!!o} onclick={() => toggleOthers(i)}>{o ? 'Hide' : 'Other departures'}</button>
          </div>
          {#if openStops[i]}
            <ul class="inter small">
              {#each leg.intermediateStops ?? [] as s}
                <li><span class="tabular muted">{s.departure ? hm(s.departure) : ''}</span> {s.name}</li>
              {/each}
            </ul>
          {/if}

          {#if o}
            <div class="others-box">
              <div class="small muted">From {shortName(o.at ?? leg.from.name)} to {app.to?.name ?? 'destination'}{#if o.ready} · from {hm(o.ready)}{/if}</div>
              {#if o.status === 'loading'}<div class="small muted">Loading…</div>
              {:else if o.status === 'error'}<div class="small bad">Couldn't load departures.</div>
              {:else if o.options && !o.options.length}<div class="small muted">No other connections soon.</div>
              {:else}
                {#each o.options ?? [] as alt (alt.it.startTime + alt.it.legs.map(l => l.tripId).join())}
                  {@const r0 = firstRide(alt)}
                  {@const current = r0.tripId === leg.tripId}
                  {@const dep = checkLeg(r0).dep}
                  <button class="opt" class:current onclick={() => !current && pick(o.keep!, alt, o.query!)}>
                    <span class="od tabular">
                      <b class:late={dep.status === 'live' && dep.delayMin >= 3} class:approx={dep.status === 'unverified'}>{dep.status === 'unverified' ? '~' : ''}{hm(dep.time)}</b>
                      {#if dep.status === 'live' && dep.delayMin >= 1}<small class:late={dep.delayMin >= 3}>+{dep.delayMin}</small>{:else if dep.status === 'cancelled'}<small class="late">cancelled</small>{/if}
                    </span>
                    <span class="ol">
                      {#each rides(alt) as r (r.tripId)}
                        {@const rc = lineColors(r)}
                        <span class="line-badge" style:background={rc.bg} style:color={rc.fg}>{lineName(r)}</span>
                      {/each}
                    </span>
                    <span class="oa tabular">→ {hm(checkLeg(alt.it.legs.at(-1)!).arr.time)}</span>
                    {#if current}<span class="cur small">current</span>{/if}
                  </button>
                {/each}
              {/if}
            </div>
          {/if}

          <div class="stoprow off">
            <TimeBadge t={t.arr} db={dbArr} />
            <span>Get off at <b>{leg.to.name}</b>{#if dbArr?.platform}<span class="small gap" class:chg={dbArr.plannedPlatform && dbArr.platform !== dbArr.plannedPlatform}>Pl. {dbArr.platform}</span>{:else if platformLabel(leg.to, leg.mode)}<span class="muted small gap">{platformLabel(leg.to, leg.mode)}</span>{/if}</span>
          </div>
        </div>
      </li>
    {/if}
  {/each}
  <li class="dest"><div class="rail"><span class="pin"></span></div><div class="body"><b>{app.to?.name ?? 'Destination'}</b></div></li>
</ol>

<style>
  .icon-btn svg { width: 20px; height: 20px; fill: none; stroke: currentColor; stroke-width: 2.2; stroke-linecap: round; stroke-linejoin: round; }
  .ttl { flex: 1; min-width: 0; }
  .ttl b { font-weight: 650; color: var(--text-2); }
  .ttl b.soon { color: var(--warn); }
  .replan { padding: 9px 14px; font-size: 14px; }
  .strip { margin: 12px 0 10px; }
  .banner { margin-bottom: 8px; }

  .timeline { list-style: none; margin: 6px 0 0; padding: 0; }
  .timeline > li { display: grid; grid-template-columns: 22px minmax(0, 1fr); gap: 10px; }
  .rail { display: flex; justify-content: center; }
  .bar { width: 6px; border-radius: 3px; background: var(--c); margin: 8px 0; }
  .dots { width: 0; border-left: 3px dotted var(--walk); margin: 4px 0; }
  .pin { width: 16px; height: 16px; border-radius: 50%; background: var(--accent); border: 3px solid var(--surface); box-shadow: 0 0 0 2px var(--accent); margin-top: 2px; }
  .body { display: grid; grid-template-columns: minmax(0, 1fr); gap: 8px; padding: 6px 0 16px; min-width: 0; }
  .walkrow { display: flex; align-items: center; gap: 8px; background: none; border: 0; text-align: left; font-weight: 600; padding: 4px 0 14px; color: var(--text-2); }
  .wki { width: 18px; height: 18px; fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; flex: none; }
  .note { margin-bottom: 6px; }
  .stoprow { display: flex; gap: 10px; align-items: baseline; }
  .stoprow.off { color: var(--text-2); }
  .stopname { background: none; border: 0; padding: 0; font-weight: 700; font-size: 16px; text-align: left; }
  .where { display: flex; justify-content: space-between; align-items: center; gap: 10px; width: 100%; background: var(--surface); border: 0; box-shadow: var(--shadow-sm); border-radius: 13px; padding: 10px 12px; text-align: left; }
  .line { display: flex; gap: 9px; align-items: center; min-width: 0; flex: 1; overflow: hidden; }
  .hs { font-weight: 650; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .plat { font-weight: 750; font-size: 14px; white-space: nowrap; flex: none; }
  .plat.changed, .chg { color: var(--bad); font-weight: 650; }
  .plat.unknown { color: var(--warn); font-weight: 600; }
  .gap { margin-left: 6px; }
  .meta { display: flex; justify-content: space-between; align-items: center; }
  .others { color: var(--accent); }
  .inter { list-style: none; margin: 0; padding: 0 0 0 4px; display: grid; gap: 3px; }
  .inter .tabular { display: inline-block; width: 42px; }
  .others-box { display: grid; gap: 6px; background: var(--surface-2); border-radius: 13px; padding: 10px; }
  .opt { display: grid; grid-template-columns: 72px 1fr auto; align-items: center; gap: 8px; border: 0; background: var(--surface); border-radius: 10px; padding: 9px 10px; text-align: left; position: relative; }
  .opt:active { transform: scale(.99); }
  .opt.current { box-shadow: inset 0 0 0 2px var(--accent); }
  .ol { display: flex; gap: 4px; flex-wrap: wrap; }
  .ol .line-badge { height: 22px; min-width: 32px; font-size: 12px; }
  .oa { font-weight: 650; }
  .od { display: grid; line-height: 1.15; }
  .od b { font-weight: 700; font-size: 15px; }
  .od small { font-size: 11.5px; color: var(--muted); font-weight: 600; }
  .late { color: var(--bad) !important; }
  .approx { color: var(--warn); }
  .cur { position: absolute; top: -8px; right: 10px; background: var(--accent); color: var(--on-accent); border-radius: 6px; padding: 0 6px; font-weight: 650; font-size: 11px; }
  .bad { color: var(--bad); }
</style>
