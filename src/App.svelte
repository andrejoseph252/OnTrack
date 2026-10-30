<script lang="ts">
  import { app, loadLater, openTrip, persistFilters, search, type Filters, type TimeMode } from './lib/state.svelte'
  import { toLocalInput, hm } from './lib/format'
  import PlaceInput from './components/PlaceInput.svelte'
  import ResultCard from './components/ResultCard.svelte'
  import TripView from './components/TripView.svelte'
  import Departures from './components/Departures.svelte'
  import Places from './components/Places.svelte'

  const FILTERS: { key: keyof Filters; label: string; hint: string }[] = [
    { key: 'dticket', label: 'Deutschlandticket', hint: 'No ICE, IC, EC, FlixTrain or coaches' },
    { key: 'fewestChanges', label: 'Fewest changes', hint: 'Prefer routes with fewer transfers' },
    { key: 'stepFree', label: 'Step-free', hint: 'Walking paths without stairs' },
    { key: 'buffer', label: '+2 min buffer', hint: 'Extra time at every transfer' },
  ]

  let showHidden = $state(false)

  function toggle(k: keyof Filters) {
    app.filters[k] = !app.filters[k]
    persistFilters()
    if (app.to) search()
  }

  function setMode(m: TimeMode) {
    app.timeMode = m
    if (m !== 'now' && !app.time) app.time = toLocalInput(new Date())
    if (app.to) search()
  }

  function swap() {
    if (!app.to) return
    const f = app.from
    app.from = app.to
    app.to = f ?? null
    if (app.to) search()
  }

  // Back/forward buttons map to views, so the phone's back gesture behaves.
  $effect(() => {
    const v = app.view
    if (location.hash.slice(1) !== v) history.pushState(null, '', v === 'search' ? location.pathname : `#${v}`)
  })
  addEventListener('popstate', () => {
    const v = location.hash.slice(1)
    app.view = v === 'trip' && app.selected ? 'trip' : v === 'stop' && app.stop ? 'stop' : v === 'places' ? 'places' : 'search'
  })
</script>

{#if app.view === 'trip' && app.selected}
  <TripView />
{:else if app.view === 'stop' && app.stop}
  <Departures />
{:else if app.view === 'places'}
  <Places />
{:else}
  <main>
    <header>
      <h1><span class="logo">●</span> OnTrack</h1>
      <button class="chip" onclick={() => (app.view = 'places')}>★ My places</button>
    </header>

    <section class="card planner">
      <div class="fields">
        <div class="field"><span class="lbl">From</span><PlaceInput value={app.from} placeholder="Start" allowCurrent onpick={l => { app.from = l; if (app.to) search() }} /></div>
        <div class="field"><span class="lbl">To</span><PlaceInput value={app.to} placeholder="Where to? Address, place or stop" onpick={l => { app.to = l; if (l) search() }} /></div>
      </div>
      <button class="swap" onclick={swap} aria-label="Swap start and destination">⇅</button>
    </section>

    {#if app.places.length}
      <div class="row scroll">
        {#each app.places as p (p.id)}
          <button class="chip place" onclick={() => { app.to = p; search() }}>{p.icon} {p.name}</button>
        {/each}
      </div>
    {/if}

    <div class="row">
      <div class="seg" role="group" aria-label="Time">
        {#each [['now', 'Now'], ['depart', 'Depart'], ['arrive', 'Arrive by']] as [m, l]}
          <button aria-pressed={app.timeMode === m} onclick={() => setMode(m as TimeMode)}>{l}</button>
        {/each}
      </div>
      {#if app.timeMode !== 'now'}
        <input class="dt" type="datetime-local" bind:value={app.time} onchange={() => app.to && search()} />
      {/if}
    </div>

    <div class="row scroll">
      {#each FILTERS as f}
        <button class="chip" aria-pressed={app.filters[f.key]} title={f.hint} onclick={() => toggle(f.key)}>{f.label}</button>
      {/each}
    </div>

    {#if app.error}<div class="banner bad">{app.error}</div>{/if}

    <section class="results">
      {#if app.loading && !app.results.length}
        {#each [0, 1, 2] as i (i)}<div class="card skel"></div>{/each}
      {/if}
      {#each app.results as a (a.it.startTime + a.it.legs.map(l => l.tripId).join())}
        <ResultCard {a} onopen={() => openTrip(a)} />
      {/each}
      {#if app.hidden.length}
        <button class="hiddenbtn small" onclick={() => (showHidden = !showHidden)}>
          {showHidden ? 'Hide' : 'Show'} {app.hidden.length} connection{app.hidden.length > 1 ? 's' : ''} left out because the live data contradicts itself
        </button>
        {#if showHidden}
          {#each app.hidden as a (a.it.startTime + a.it.legs.map(l => l.tripId).join())}
            <ResultCard {a} onopen={() => openTrip(a)} />
          {/each}
        {/if}
      {/if}
      {#if app.results.length}
        <div class="foot">
          <span class="small muted">{app.updatedAt ? `Live data as of ${hm(app.updatedAt)}` : ''}</span>
          {#if app.nextCursor}<button class="btn ghost" disabled={app.loading} onclick={loadLater}>Later connections</button>{/if}
        </div>
      {/if}
      {#if !app.to && !app.results.length}
        <div class="empty muted">
          <p>Type an address, a building or a stop. Routes are door to door, including walking.</p>
          {#if !app.places.length}<p><button class="btn ghost" onclick={() => (app.view = 'places')}>Add home, uni, gym…</button></p>{/if}
        </div>
      {/if}
    </section>

    <footer class="small muted">
      Routing &amp; live data: <a href="https://transitous.org" target="_blank" rel="noreferrer">Transitous</a> (DELFI, OpenStreetMap). Stop and platform names: Datenquelle VRS, ohne Gewähr. DB cross-check when available. Map © OpenFreeMap, OpenStreetMap.
    </footer>
  </main>
{/if}

<style>
  main { padding: 16px 16px 32px; display: grid; gap: 12px; }
  header { display: flex; justify-content: space-between; align-items: center; }
  h1 { font-size: 22px; margin: 0; letter-spacing: -.02em; }
  .logo { color: var(--accent); }
  .planner { display: flex; gap: 8px; padding: 12px; align-items: center; }
  .fields { display: grid; gap: 8px; flex: 1; min-width: 0; }
  .field { display: flex; align-items: center; gap: 8px; }
  .lbl { width: 38px; font-size: 13px; color: var(--muted); flex: none; }
  .swap { border: 0; background: var(--surface-2); border-radius: 10px; width: 40px; height: 40px; font-size: 18px; flex: none; }
  .row { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
  .row.scroll { flex-wrap: nowrap; overflow-x: auto; scrollbar-width: none; margin: 0 -16px; padding: 0 16px; }
  .place { font-weight: 600; }
  .seg { display: inline-flex; background: var(--surface-2); border-radius: 10px; padding: 3px; }
  .seg button { border: 0; background: none; padding: 6px 12px; border-radius: 8px; font-size: 14px; }
  .seg button[aria-pressed='true'] { background: var(--surface); box-shadow: var(--shadow); font-weight: 600; }
  .dt { border: 1px solid var(--line); background: var(--surface); border-radius: 10px; padding: 6px 8px; }
  .results { display: grid; gap: 10px; }
  .skel { height: 118px; background: linear-gradient(90deg, var(--surface) 0%, var(--surface-2) 50%, var(--surface) 100%); background-size: 200% 100%; animation: sh 1.2s infinite; }
  @keyframes sh { to { background-position: -200% 0; } }
  .foot { display: flex; justify-content: space-between; align-items: center; gap: 8px; }
  .hiddenbtn { background: none; border: 1px dashed var(--line); border-radius: 10px; padding: 10px; color: var(--muted); }
  .empty { text-align: center; padding: 24px 8px; }
  footer a { color: inherit; }
</style>
