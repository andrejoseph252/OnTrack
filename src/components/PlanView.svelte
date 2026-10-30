<script lang="ts">
  import { app, go, loadLater, openTrip, persistFilters, search, type Filters, type TimeMode } from '../lib/state.svelte'
  import { toLocalInput, hm } from '../lib/format'
  import PlaceInput from './PlaceInput.svelte'
  import ResultCard from './ResultCard.svelte'
  import TopNav from './TopNav.svelte'

  const FILTERS: { key: keyof Filters; label: string; hint: string }[] = [
    { key: 'dticket', label: 'Deutschlandticket', hint: 'No ICE, IC, EC, FlixTrain or coaches' },
    { key: 'fewestChanges', label: 'Fewest changes', hint: 'Prefer routes with fewer transfers' },
    { key: 'stepFree', label: 'Step-free', hint: 'Walking paths without stairs' },
    { key: 'buffer', label: '+2 min buffer', hint: 'Extra time at every transfer' },
  ]

  let showHidden = $state(false)
  /** With results showing, the planner folds into a one-line summary so results fit at half height. */
  let editing = $state(false)
  const compact = $derived(!!app.to && (app.results.length > 0 || app.loading) && !editing)

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

  function pick(to: typeof app.to) {
    app.to = to
    if (to) {
      editing = false
      search()
    }
  }

  const activeFilters = $derived(FILTERS.filter(f => app.filters[f.key]).length)
</script>

<TopNav />

{#if compact}
  <button class="summary card" onclick={() => { editing = true; app.sheet = 'full' }}>
    <span class="rail mini" aria-hidden="true"><span class="o"></span><span class="dash"></span><span class="d"></span></span>
    <span class="names">
      <b>{app.from?.name ?? 'Current location'}</b>
      <b>{app.to?.name}</b>
    </span>
    <span class="meta small">{app.timeMode === 'now' ? 'Now' : app.timeMode === 'depart' ? `Dep ${app.time.slice(11)}` : `Arr ${app.time.slice(11)}`}{activeFilters ? ` · ${activeFilters} filter${activeFilters > 1 ? 's' : ''}` : ''}<span class="edit">Edit</span></span>
  </button>
{:else}
<section class="planner card">
  <div class="rail" aria-hidden="true"><span class="o"></span><span class="dash"></span><span class="d"></span></div>
  <!-- Typing needs room for suggestions and the keyboard. -->
  <div class="fields" onfocusin={() => (app.sheet = 'full')}>
    <PlaceInput value={app.from} placeholder="Start" allowCurrent onpick={l => { app.from = l; if (app.to) search() }} />
    <div class="sep"></div>
    <PlaceInput value={app.to} placeholder="Where to?" onpick={pick} />
  </div>
  <button class="swap" onclick={swap} aria-label="Swap start and destination">
    <svg viewBox="0 0 24 24"><path d="M7 4v16m0 0-3-3m3 3 3-3M17 20V4m0 0-3 3m3-3 3 3" /></svg>
  </button>
</section>

{#if app.places.length}
  <div class="scroll places">
    {#each app.places as p (p.id)}
      <button class="place" onclick={() => pick(p)}>
        <span class="pic">{p.icon}</span><span>{p.name}</span>
      </button>
    {/each}
  </div>
{/if}

<div class="opts">
  <div class="seg" role="group" aria-label="Time">
    {#each [['now', 'Now'], ['depart', 'Depart'], ['arrive', 'Arrive']] as [m, l]}
      <button aria-pressed={app.timeMode === m} onclick={() => setMode(m as TimeMode)}>{l}</button>
    {/each}
  </div>
  {#if app.timeMode !== 'now'}
    <input class="dt" type="datetime-local" bind:value={app.time} onchange={() => app.to && search()} />
  {/if}
</div>

<div class="scroll filters">
  {#each FILTERS as f}
    <button class="chip" aria-pressed={app.filters[f.key]} title={f.hint} onclick={() => toggle(f.key)}>{f.label}</button>
  {/each}
</div>
{/if}

{#if app.error}<div class="banner bad">{app.error}</div>{/if}

<section class="results">
  {#if app.results.length || app.loading}
    <div class="rhead">
      <h2>{app.loading && !app.results.length ? 'Finding routes…' : `${app.results.length} routes`}</h2>
      <span class="small muted">{app.updatedAt && !app.loading ? `live · ${hm(app.updatedAt)}` : ''}{activeFilters ? ` · ${activeFilters} filter${activeFilters > 1 ? 's' : ''}` : ''}</span>
    </div>
  {/if}
  {#if app.loading && !app.results.length}
    {#each [0, 1, 2] as i (i)}<div class="card skel"></div>{/each}
  {/if}
  {#each app.results as a, i (a.it.startTime + a.it.legs.map(l => l.tripId).join())}
    <!-- Map preview on mouse hover only: on iOS a hover-triggered change eats the first tap. -->
    <div role="presentation" onpointerenter={e => { if (e.pointerType === 'mouse') app.preview = i }} onpointerleave={e => { if (e.pointerType === 'mouse') app.preview = null }}>
      <ResultCard {a} onopen={() => openTrip(a)} />
    </div>
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
  {#if app.results.length && app.nextCursor}
    <button class="btn ghost later" disabled={app.loading} onclick={loadLater}>Later connections</button>
  {/if}
  {#if !app.to && !app.results.length && !app.places.length}
    <button class="btn ghost addplaces" onclick={() => go('places')}>Save home, uni, gym…</button>
  {/if}
</section>


<style>
  .planner { position: relative; display: flex; gap: 6px; align-items: center; padding: 8px 8px 8px 4px; }
  .rail { display: flex; flex-direction: column; align-items: center; width: 22px; padding: 14px 0; align-self: stretch; }
  .rail .o { width: 11px; height: 11px; border-radius: 50%; border: 2.5px solid var(--text-2); }
  .rail .dash { flex: 1; width: 0; border-left: 2px dotted var(--surface-3); margin: 4px 0; }
  .rail .d { width: 12px; height: 12px; border-radius: 50% 50% 50% 0; transform: rotate(-45deg); background: var(--accent); }
  .summary { display: flex; align-items: center; gap: 8px; width: 100%; border: 0; text-align: left; padding: 10px 12px 10px 6px; }
  .rail.mini { padding: 6px 0; }
  .rail.mini .o { width: 9px; height: 9px; border-width: 2px; }
  .rail.mini .d { width: 10px; height: 10px; }
  .names { flex: 1; min-width: 0; display: grid; gap: 6px; }
  .names b { font-weight: 650; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .meta { display: grid; justify-items: end; gap: 6px; color: var(--muted); flex: none; }
  .edit { color: var(--accent); font-weight: 650; }
  .fields { flex: 1; min-width: 0; display: grid; }
  .fields :global(input) { background: transparent; padding: 10px 8px; font-weight: 550; }
  .fields :global(input:focus) { box-shadow: none; background: var(--surface-2); }
  .sep { height: 1px; background: var(--line); margin: 2px 0 2px 4px; }
  .swap { width: 38px; height: 38px; border: 0; border-radius: 50%; background: var(--surface-2); display: grid; place-items: center; flex: none; }
  .swap svg { width: 18px; height: 18px; fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }

  .scroll { display: flex; gap: 8px; overflow-x: auto; scrollbar-width: none; margin: 12px -16px 0; padding: 0 16px; }
  .scroll::-webkit-scrollbar { display: none; }
  .place { display: flex; align-items: center; gap: 8px; border: 0; background: var(--surface); box-shadow: var(--shadow-sm); border-radius: 14px; padding: 8px 14px 8px 8px; font-weight: 650; white-space: nowrap; }
  .pic { width: 30px; height: 30px; border-radius: 10px; display: grid; place-items: center; background: var(--surface-2); font-size: 16px; }

  .opts { display: flex; gap: 8px; align-items: center; margin-top: 12px; flex-wrap: wrap; }
  .seg { display: inline-flex; background: var(--surface-2); border-radius: 11px; padding: 3px; }
  .seg button { border: 0; background: none; padding: 6px 13px; border-radius: 9px; font-size: 14px; font-weight: 550; color: var(--muted); }
  .seg button[aria-pressed='true'] { background: var(--surface); color: var(--text); box-shadow: var(--shadow-sm); }
  .dt { border: 0; background: var(--surface-2); border-radius: 11px; padding: 7px 10px; }
  .filters { margin-top: 10px; }

  .results { display: grid; gap: 10px; margin-top: 14px; }
  .rhead { display: flex; align-items: baseline; justify-content: space-between; }
  h2 { font: 700 17px var(--display); margin: 0; letter-spacing: -.01em; }
  .skel { height: 120px; background: linear-gradient(90deg, var(--surface) 0%, var(--surface-2) 50%, var(--surface) 100%); background-size: 200% 100%; animation: sh 1.2s infinite; }
  @keyframes sh { to { background-position: -200% 0; } }
  .hiddenbtn { background: none; border: 1px dashed var(--surface-3); border-radius: 12px; padding: 11px; color: var(--muted); }
  .later { justify-self: center; }
  .addplaces { justify-self: start; }
</style>
