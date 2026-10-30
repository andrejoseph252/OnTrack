<script lang="ts">
  import { app, back, go } from '../lib/state.svelte'
  import { lineColor, lineKey, lineText, net } from '../lib/network.svelte'

  const line = $derived(app.line ? net.lines.find(l => lineKey(l) === app.line!.key) : undefined)
  const pattern = $derived(line ? line.patterns.find(p => p.dir === app.line!.dir) ?? line.patterns[0] : undefined)
  const stops = $derived(pattern ? pattern.stops.map(i => net.stops[i]) : [])
  const color = $derived(line ? lineColor(line) : '#888')

  // "Bonn Hauptbahnhof" → city de-emphasised, so long lists scan by stop name.
  const split = (name: string) => {
    const m = name.match(/^(Bonn|Siegburg|Sankt Augustin|Königswinter|Bad Honnef|Troisdorf|Alfter|Bornheim|Köln|Wesseling|Meckenheim|Rheinbach|Niederkassel|Hennef)\s+(.+)$/)
    return m ? { city: m[1], name: m[2] } : { city: '', name }
  }

  function openStop(s: (typeof stops)[number]) {
    app.stop = { name: s[1], lat: s[2], lon: s[3], line: line?.name }
    go('stop')
  }
</script>

{#if line && pattern}
  <div class="view-head">
    <button class="icon-btn" onclick={back} aria-label="Back">
      <svg viewBox="0 0 24 24"><path d="m15 6-6 6 6 6" /></svg>
    </button>
    <span class="pill" class:tram={line.type === 'tram'} style:background={color} style:color={lineText(line)}>{line.name}</span>
    <div class="ttl">
      <h1>{line.type === 'tram' ? 'Stadtbahn' : line.type === 'rail' ? 'Train' : 'Bus'} {line.name}</h1>
      <div class="sub">{line.operator}</div>
    </div>
  </div>

  {#if line.patterns.length > 1}
    <div class="dirs" role="tablist" aria-label="Direction">
      {#each line.patterns as p (p.dir)}
        <button role="tab" aria-selected={p.dir === pattern.dir} onclick={() => (app.line = { key: app.line!.key, dir: p.dir })}>
          <span class="to">to</span> {p.headsign}
        </button>
      {/each}
    </div>
  {/if}

  <p class="meta small muted">{stops.length} stops{line.desc ? ` · ${line.desc}` : ''}</p>

  <ol class="stops" style:--c={color}>
    {#each stops as s, i (s[0] + i)}
      {@const n = split(s[1])}
      <li class:end={i === 0 || i === stops.length - 1}>
        <button onclick={() => openStop(s)}>
          <span class="dot"></span>
          <span class="nm"><b>{n.name}</b>{#if n.city}<small>{n.city}</small>{/if}</span>
          <span class="go small">Departures</span>
        </button>
      </li>
    {/each}
  </ol>
  <p class="small muted">Line map from the VRS timetable (main route; some trips run shorter or vary).</p>
{:else}
  <p class="muted">Loading line…</p>
{/if}

<style>
  .icon-btn svg { width: 20px; height: 20px; fill: none; stroke: currentColor; stroke-width: 2.2; stroke-linecap: round; stroke-linejoin: round; }
  .pill { display: inline-flex; align-items: center; justify-content: center; min-width: 48px; height: 36px; padding: 0 10px; border-radius: 10px; font-weight: 800; font-size: 17px; flex: none; }
  .pill.tram { border-radius: 18px; }
  .ttl { flex: 1; min-width: 0; }
  .ttl h1 { font-size: 19px; }
  .dirs { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; margin-top: 14px; background: var(--surface-2); padding: 3px; border-radius: 13px; }
  .dirs button { border: 0; background: none; border-radius: 10px; padding: 8px 8px; font-weight: 650; font-size: 14px; color: var(--muted); text-align: left; line-height: 1.25; }
  .dirs button[aria-selected='true'] { background: var(--surface); color: var(--text); box-shadow: var(--shadow-sm); }
  .to { font-weight: 500; font-size: 12px; display: block; color: var(--muted); }
  .meta { margin: 12px 2px 6px; }
  .stops { list-style: none; margin: 0; padding: 0; background: var(--surface); border-radius: var(--radius); box-shadow: var(--shadow-sm); overflow: hidden; }
  .stops li { position: relative; }
  /* The coloured line runs through the dots like a transit diagram. */
  .stops li::before { content: ''; position: absolute; left: 25px; top: 0; bottom: 0; width: 6px; background: var(--c); }
  .stops li:first-child::before { top: 50%; }
  .stops li:last-child::before { bottom: 50%; }
  .stops button { position: relative; display: flex; align-items: center; gap: 14px; width: 100%; border: 0; background: none; padding: 10px 14px 10px 18px; text-align: left; }
  .stops button:active { background: var(--surface-2); }
  .dot { width: 20px; height: 20px; border-radius: 50%; background: var(--surface); border: 4px solid var(--c); flex: none; z-index: 1; }
  .end .dot { width: 22px; height: 22px; margin-left: -1px; background: var(--c); box-shadow: inset 0 0 0 4px var(--surface); }
  .nm { flex: 1; min-width: 0; display: grid; }
  .nm b { font-weight: 600; }
  .end .nm b { font-weight: 750; }
  .nm small { color: var(--muted); font-size: 12px; }
  .go { color: var(--accent); font-weight: 600; opacity: 0; transition: opacity .15s; }
  @media (hover: hover) { .stops button:hover .go { opacity: 1; } }
  p.small:last-child { margin-top: 10px; }
</style>
