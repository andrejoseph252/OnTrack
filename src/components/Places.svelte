<script lang="ts">
  import { app, persistPlaces, type Loc } from '../lib/state.svelte'
  import PlaceInput from './PlaceInput.svelte'
  import TopNav from './TopNav.svelte'

  const ICONS = ['🏠', '🎓', '💼', '🏋️', '🛒', '❤️', '☕', '⭐']
  let name = $state('')
  let icon = $state('🏠')
  let loc = $state<Loc | null>(null)

  function add() {
    if (!loc || !name.trim()) return
    app.places = [...app.places, { ...loc, id: crypto.randomUUID(), name: name.trim(), icon, detail: loc.name }]
    persistPlaces()
    name = ''
    loc = null
  }

  function remove(id: string) {
    app.places = app.places.filter(p => p.id !== id)
    persistPlaces()
  }

  function move(i: number, d: -1 | 1) {
    const p = [...app.places]
    const j = i + d
    if (j < 0 || j >= p.length) return
    ;[p[i], p[j]] = [p[j], p[i]]
    app.places = p
    persistPlaces()
  }
</script>

<TopNav />
<div class="page">
  <div class="view-head"><h1>Saved places</h1></div>

  <div class="card form">
    <div class="icons">
      {#each ICONS as ic}<button class="chip" aria-pressed={icon === ic} onclick={() => (icon = ic)}>{ic}</button>{/each}
    </div>
    <input class="name" placeholder="Name, e.g. Uni" bind:value={name} />
    <PlaceInput value={loc} placeholder="Search address or place" onpick={l => { loc = l; if (!name && l) name = l.name }} />
    <button class="btn" disabled={!loc || !name.trim()} onclick={add}>Save place</button>
  </div>

  <ul class="list">
    {#each app.places as p, i (p.id)}
      <li class="card">
        <span class="ic">{p.icon}</span>
        <span class="txt"><b>{p.name}</b><span class="small muted">{p.detail}</span></span>
        <button class="mini" onclick={() => move(i, -1)} aria-label="Move up">↑</button>
        <button class="mini" onclick={() => remove(p.id)} aria-label="Delete">✕</button>
      </li>
    {:else}
      <li class="muted small">No saved places yet. Add home, uni or the gym for one-tap trips.</li>
    {/each}
  </ul>
  <p class="small muted">Saved places are stored only on this device.</p>
</div>

<style>
  .page { display: grid; gap: 12px; }
  .form { padding: 14px; display: grid; gap: 10px; }
  .icons { display: flex; gap: 6px; flex-wrap: wrap; }
  .name { border: 0; background: var(--surface-2); border-radius: 10px; padding: 11px 12px; font-size: 16px; outline: none; }
  .list { list-style: none; padding: 0; margin: 0; display: grid; gap: 8px; }
  .list li.card { display: flex; gap: 10px; align-items: center; padding: 10px 12px; }
  .ic { font-size: 20px; }
  .txt { display: grid; flex: 1; min-width: 0; }
  .txt .small { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .mini { border: 0; background: var(--surface-2); border-radius: 8px; width: 32px; height: 32px; }
</style>
