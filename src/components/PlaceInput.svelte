<script lang="ts">
  import { noScrollFocus, tapSelect } from '../lib/focus'
  import { geocode } from '../lib/api/transitous'
  import type { GeocodeMatch } from '../lib/api/types'
  import { app, type Loc } from '../lib/state.svelte'

  let {
    value,
    placeholder,
    allowCurrent = false,
    onpick,
  }: { value: Loc | null; placeholder: string; allowCurrent?: boolean; onpick: (l: Loc | null) => void } = $props()

  let text = $state('')
  let open = $state(false)
  let results = $state<GeocodeMatch[]>([])
  let busy = $state(false)
  let timer: ReturnType<typeof setTimeout>
  let ctrl: AbortController | null = null

  const display = $derived(value ? value.name : allowCurrent ? 'Current location' : '')
  // Saved places only as matches for what's typed: unfiltered they'd repeat the chips below.
  const saved = $derived(text.trim() ? app.places.filter(p => p.name.toLowerCase().includes(text.trim().toLowerCase())) : [])
  // Only open once there's something to show: typing, or "Current location" for the start.
  const showMenu = $derived(open && (allowCurrent || text.trim().length > 0) && (allowCurrent || saved.length > 0 || results.length > 0 || busy))

  function onInput() {
    clearTimeout(timer)
    if (text.trim().length < 2) { results = []; return }
    timer = setTimeout(async () => {
      ctrl?.abort()
      ctrl = new AbortController()
      busy = true
      try {
        // The geocoder can return the same address twice (e.g. two OSM objects); show it once.
        const seen = new Set<string>()
        results = (await geocode(text.trim(), ctrl.signal))
          // Dedupe on what's shown: addresses come back with an empty id, so ids can't be used.
          .filter(m => { const k = `${m.type === 'STOP' ? 'S' : 'P'}|${m.name}|${area(m)}`; const dup = seen.has(k); seen.add(k); return !dup })
          .slice(0, 8)
      }
      catch { /* aborted or offline */ }
      finally { busy = false }
    }, 180)
  }

  function area(m: GeocodeMatch) {
    const def = m.areas.find(a => a.default)?.name
    const sub = m.areas.filter(a => a.adminLevel >= 9).at(-1)?.name
    return [m.type === 'ADDRESS' ? m.zip : undefined, sub && sub !== def ? sub : undefined, def].filter(Boolean).join(' ')
  }

  function pick(l: Loc | null) {
    onpick(l)
    text = ''
    results = []
    open = false
  }

  function fromMatch(m: GeocodeMatch): Loc {
    return { name: m.name, lat: m.lat, lon: m.lon, stopId: m.type === 'STOP' ? m.id : undefined, detail: area(m) }
  }

  const icon = (m: GeocodeMatch) => (m.type === 'STOP' ? '🚏' : m.type === 'ADDRESS' ? '🏠' : '📍')
</script>

<div class="wrap">
  <input
    type="search"
    use:noScrollFocus
    {placeholder}
    value={open ? text : display}
    onfocus={() => { open = true; text = '' }}
    onblur={() => setTimeout(() => (open = false), 250)}
    oninput={e => { text = e.currentTarget.value; onInput() }}
    autocomplete="off"
    enterkeyhint="search"
    class:current={!value && allowCurrent && !open}
  />
  {#if showMenu}
    <ul class="menu card" role="listbox">
      {#if allowCurrent}
        <li><button use:tapSelect={() => pick(null)}><span class="ic">◎</span><span>Current location</span></button></li>
      {/if}
      {#each saved as p (p.id)}
        <li><button use:tapSelect={() => pick(p)}><span class="ic">{p.icon}</span><span>{p.name}<small class="muted">Saved</small></span></button></li>
      {/each}
      {#each results as m, i (`${m.id}|${m.name}|${i}`)}
        <li>
          <button use:tapSelect={() => pick(fromMatch(m))}>
            <span class="ic">{icon(m)}</span>
            <span>{m.name}<small class="muted">{area(m)}</small></span>
          </button>
        </li>
      {/each}
      {#if busy && !results.length}<li class="muted pad">Searching…</li>{/if}
    </ul>
  {/if}
</div>

<style>
  .wrap { position: relative; flex: 1; min-width: 0; }
  input {
    width: 100%; border: 0; background: var(--surface-2); border-radius: 10px;
    padding: 11px 12px; font-size: 16px; outline: none;
  }
  input:focus { box-shadow: 0 0 0 2px var(--accent); }
  input.current { color: var(--accent); font-weight: 600; }
  .menu {
    position: absolute; z-index: 20; left: 0; right: 0; top: calc(100% + 6px);
    list-style: none; margin: 0; padding: 6px; max-height: 60vh; overflow: auto;
  }
  .menu button {
    display: flex; gap: 10px; align-items: flex-start; width: 100%; text-align: left;
    background: none; border: 0; padding: 9px 8px; border-radius: 8px;
  }
  .menu button:active { background: var(--surface-2); }
  @media (hover: hover) { .menu button:hover { background: var(--surface-2); } }
  .menu small { display: block; font-size: 12px; }
  .ic { width: 22px; text-align: center; flex: none; }
  .pad { padding: 10px; }
</style>
