<script lang="ts">
  import { noScrollFocus } from '../lib/focus'
  import { app, go } from '../lib/state.svelte'
  import { isReplacement, isTramReplacement, lineColor, lineKey, lineText, loadNetwork, net, replacedToday, type Line } from '../lib/network.svelte'
  import TopNav from './TopNav.svelte'

  loadNetwork()

  let q = $state('')
  const FILTERS = [['tram', 'Tram'], ['bus', 'Bus'], ['rail', 'Train'], ['all', 'All']] as const

  const OPS: [RegExp, string][] = [
    [/Stadtwerke Bonn/, 'SWB Bonn'], [/Rhein-Sieg-Verkehrs/, 'RSVG Rhein-Sieg'], [/Regionalverkehr Köln/, 'RVK'],
    [/Kölner Verkehrs/, 'KVB Köln'], [/SEV/, 'Rail replacement buses'],
  ]
  const opName = (l: Line) => OPS.find(([re]) => re.test(l.operator))?.[1] ?? 'Other operators'

  const groups = $derived.by(() => {
    const needle = q.trim().toLowerCase()
    const matches = (l: Line) => !needle || l.name.toLowerCase().startsWith(needle) || l.desc.toLowerCase().includes(needle) || l.patterns.some(p => p.headsign.toLowerCase().includes(needle))
    // Tram replacement buses are listed with the trams (that's where you'd look for them).
    const inFilter = (l: Line) => app.lineFilter === 'all' || l.type === app.lineFilter || (app.lineFilter === 'tram' && isTramReplacement(l))
    const list = net.lines.filter(l => (needle || inFilter(l)) && matches(l))
    const out = new Map<string, Line[]>()
    const label = (l: Line) => (l.type === 'tram' ? 'Stadtbahn & tram' : l.type === 'rail' ? 'Trains' : l.type === 'ferry' ? 'Ferries'
      : isTramReplacement(l) ? 'Tram replacement buses' : isReplacement(l) ? 'Rail replacement buses' : `Bus · ${opName(l)}`)
    for (const l of list) out.set(label(l), [...(out.get(label(l)) ?? []), l])
    const rank = (t: string) => ['Stadtbahn & tram', 'Tram replacement buses', 'Bus · SWB Bonn', 'Bus · RSVG Rhein-Sieg', 'Bus · RVK', 'Bus · KVB Köln', 'Bus · Other operators', 'Trains', 'Ferries', 'Rail replacement buses'].indexOf(t)
    return [...out].sort((a, b) => rank(a[0]) - rank(b[0]))
  })

  function open(l: Line) {
    app.line = { key: lineKey(l), dir: l.patterns[0].dir }
    go('line')
  }

  const ends = (l: Line) => {
    const p = l.patterns
    return p.length > 1 ? `${p[1].headsign} ↔ ${p[0].headsign}` : p[0]?.headsign ?? ''
  }
</script>

<TopNav />

<div class="search">
  <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
  <input type="search" use:noScrollFocus placeholder="Find a line, e.g. 606 or Venusberg" bind:value={q} />
</div>

<div class="filters" role="group" aria-label="Type">
  {#each FILTERS as [f, label]}
    <button class="chip" aria-pressed={app.lineFilter === f} onclick={() => (app.lineFilter = f)}>{label}</button>
  {/each}
</div>

{#if net.status === 'loading'}<p class="muted small">Loading line maps…</p>{/if}
{#if net.status === 'error'}<div class="banner bad">Couldn't load the line maps. <button class="link" onclick={loadNetwork}>Retry</button></div>{/if}

{#each groups as [title, lines] (title)}
  <h2>{title} <span>{lines.length}</span></h2>
  {#if lines.length > 12 && !q}
    <div class="grid">
      {#each lines as l (lineKey(l) + l.operator)}
        <button class="pill" class:tram={l.type === 'tram'} style:background={lineColor(l)} style:color={lineText(l)} onclick={() => open(l)} title={ends(l)}>{l.name}</button>
      {/each}
    </div>
  {:else}
    <ul class="list">
      {#each lines as l (lineKey(l) + l.operator)}
        <li>
          <button onclick={() => open(l)}>
            <span class="pill" class:tram={l.type === 'tram'} style:background={lineColor(l)} style:color={lineText(l)}>{l.name}</span>
            <span class="txt"><b>{ends(l)}</b>{#if l.type === 'tram' && replacedToday(l.name)}<small class="repl">Partly replacement buses today</small>{:else}<small>{l.desc || l.operator}</small>{/if}</span>
            <svg class="chev" viewBox="0 0 24 24"><path d="m9 6 6 6-6 6" /></svg>
          </button>
        </li>
      {/each}
    </ul>
  {/if}
{/each}

<style>
  .search { display: flex; align-items: center; gap: 8px; background: var(--surface); box-shadow: var(--shadow-sm); border-radius: 13px; padding: 0 12px; }
  .search svg { width: 18px; height: 18px; fill: none; stroke: var(--muted); stroke-width: 2; stroke-linecap: round; flex: none; }
  .search input { flex: 1; border: 0; background: none; padding: 12px 0; font-size: 16px; outline: none; min-width: 0; }
  .filters { display: flex; gap: 8px; margin: 12px 0 4px; }
  h2 { font: 700 13px var(--font); text-transform: uppercase; letter-spacing: .06em; color: var(--muted); margin: 18px 0 8px; }
  h2 span { font-weight: 600; opacity: .7; margin-left: 4px; }
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(58px, 1fr)); gap: 8px; }
  .pill {
    display: inline-flex; align-items: center; justify-content: center; border: 0;
    min-width: 46px; height: 34px; padding: 0 9px; border-radius: 9px;
    font-weight: 800; font-size: 15px; letter-spacing: -.01em; box-shadow: inset 0 -2px 0 rgb(0 0 0 / 12%);
  }
  .pill.tram { border-radius: 17px; }
  .grid .pill:active { transform: scale(.94); }
  .list { list-style: none; margin: 0; padding: 0; background: var(--surface); border-radius: var(--radius); box-shadow: var(--shadow-sm); overflow: hidden; }
  .list li + li { border-top: 1px solid var(--line); }
  .list button { display: flex; align-items: center; gap: 12px; width: 100%; border: 0; background: none; padding: 11px 12px; text-align: left; }
  .list button:active { background: var(--surface-2); }
  .txt { flex: 1; min-width: 0; display: grid; }
  .txt b { font-weight: 650; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .txt small { color: var(--muted); font-size: 12.5px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .txt small.repl { color: var(--warn); font-weight: 600; }
  .chev { width: 18px; height: 18px; fill: none; stroke: var(--muted); stroke-width: 2; flex: none; }
</style>
