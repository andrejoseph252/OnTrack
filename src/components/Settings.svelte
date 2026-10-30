<script lang="ts">
  import { dbCreds, setDbCreds, testDbCreds } from '../lib/api/db'
  import { back } from '../lib/state.svelte'
  import { setTheme, theme, type ThemeChoice } from '../lib/theme.svelte'
  import { prefs, setClock } from '../lib/prefs.svelte'

  const THEMES: [ThemeChoice, string][] = [['system', 'System'], ['light', 'Light'], ['dark', 'Dark']]

  let clientId = $state(dbCreds()?.clientId ?? '')
  let apiKey = $state(dbCreds()?.apiKey ?? '')
  let result = $state<{ ok: boolean; text: string } | null>(null)
  let busy = $state(false)

  async function saveAndTest() {
    setDbCreds({ clientId, apiKey })
    if (!dbCreds()) { result = { ok: false, text: 'DB cross-check turned off.' }; return }
    busy = true
    try {
      const name = await testDbCreds()
      result = { ok: true, text: `Connected: DB answered for ${name}. Train times and platforms will now be checked with DB.` }
    } catch (e) {
      const msg = (e as Error).message
      result = {
        ok: false,
        text: /not registered to plan/i.test(msg)
          ? 'Keys are valid, but your app is not subscribed to the Timetables API yet. In the DB API Marketplace, open your application and subscribe it to "Timetables".'
          : msg,
      }
    } finally {
      busy = false
    }
  }

  function clear() {
    clientId = ''
    apiKey = ''
    setDbCreds(null)
    result = { ok: true, text: 'DB keys removed from this device.' }
  }
</script>

<div class="page">
  <div class="view-head">
    <button class="icon-btn" onclick={back} aria-label="Back"><svg viewBox="0 0 24 24"><path d="m15 6-6 6 6 6" /></svg></button>
    <h1>Settings</h1>
  </div>

  <section class="card box">
    <h2>Appearance</h2>
    <div class="seg" role="radiogroup" aria-label="Theme">
      {#each THEMES as [value, label]}
        <button role="radio" aria-checked={theme.choice === value} onclick={() => setTheme(value)}>{label}</button>
      {/each}
    </div>
    <div class="seg two" role="radiogroup" aria-label="Clock">
      <button role="radio" aria-checked={prefs.clock === '12'} onclick={() => setClock('12')}>12-hour · 3:45 PM</button>
      <button role="radio" aria-checked={prefs.clock === '24'} onclick={() => setClock('24')}>24-hour · 15:45</button>
    </div>
  </section>

  <section class="card box">
    <h2>DB train data</h2>
    <p class="small muted">
      Official DB Timetables API: train delays, platforms, platform changes and cancellations. Keys come from your app in the
      <a href="https://developers.deutschebahn.com" target="_blank" rel="noreferrer">DB API Marketplace</a> (subscribe it to "Timetables").
      They are stored only in this browser and sent only to DB.
    </p>
    <label>Client ID<input bind:value={clientId} autocomplete="off" spellcheck="false" /></label>
    <label>API key (client secret)<input bind:value={apiKey} type="password" autocomplete="off" spellcheck="false" /></label>
    <div class="row">
      <button class="btn" disabled={busy} onclick={saveAndTest}>{busy ? 'Testing…' : 'Save & test'}</button>
      {#if dbCreds()}<button class="btn ghost" onclick={clear}>Remove</button>{/if}
    </div>
    {#if result}<div class="banner {result.ok ? 'ok' : 'warn'}">{result.text}</div>{/if}
  </section>

  <section class="card box">
    <h2>About &amp; data sources</h2>
    <p class="small muted">
      Routing and live data: <a href="https://transitous.org/sources/" target="_blank" rel="noreferrer">Transitous and its data sources</a>
      (DELFI, © OpenStreetMap contributors). Stop names and line maps: Datenquelle VRS, ohne Gewähr. Train data: Deutsche Bahn
      Timetables API. Map tiles © OpenFreeMap, OpenMapTiles, OpenStreetMap.
    </p>
    <p class="small muted"><a href="https://github.com/andrejoseph252/OnTrack" target="_blank" rel="noreferrer">Source code &amp; contact</a> · MIT licence</p>
  </section>
</div>

<style>
  .page { display: grid; gap: 12px; }
  .icon-btn svg { width: 20px; height: 20px; fill: none; stroke: currentColor; stroke-width: 2.2; stroke-linecap: round; stroke-linejoin: round; }
  h2 { font-size: 16px; margin: 0; }
  .box { padding: 14px; display: grid; gap: 10px; }
  .box p { margin: 0; }
  .box a { color: var(--accent); }
  label { display: grid; gap: 4px; font-size: 13px; color: var(--muted); }
  input { border: 0; background: var(--surface-2); border-radius: 10px; padding: 11px 12px; font-size: 16px; outline: none; font-family: ui-monospace, monospace; }
  .row { display: flex; gap: 8px; }
  .seg { display: grid; grid-template-columns: repeat(3, 1fr); background: var(--surface-2); border-radius: 12px; padding: 3px; }
  .seg.two { grid-template-columns: 1fr 1fr; }
  .seg button { border: 0; background: none; padding: 9px; border-radius: 9px; font-weight: 600; color: var(--muted); }
  .seg button[aria-checked='true'] { background: var(--surface); color: var(--text); box-shadow: var(--shadow-sm); }
</style>
