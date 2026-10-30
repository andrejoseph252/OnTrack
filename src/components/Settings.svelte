<script lang="ts">
  import { dbCreds, setDbCreds, testDbCreds } from '../lib/api/db'
  import { app } from '../lib/state.svelte'

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
  <header>
    <button class="back" onclick={() => (app.view = 'search')} aria-label="Back">←</button>
    <h1>Settings</h1>
  </header>

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
</div>

<style>
  .page { padding: 16px; display: grid; gap: 12px; }
  header { display: flex; gap: 12px; align-items: center; }
  h1 { font-size: 20px; margin: 0; }
  h2 { font-size: 16px; margin: 0; }
  .back { width: 40px; height: 40px; border: 0; border-radius: 12px; background: var(--surface); box-shadow: var(--shadow); font-size: 20px; }
  .box { padding: 14px; display: grid; gap: 10px; }
  .box p { margin: 0; }
  .box a { color: var(--accent); }
  label { display: grid; gap: 4px; font-size: 13px; color: var(--muted); }
  input { border: 0; background: var(--surface-2); border-radius: 10px; padding: 11px 12px; font-size: 15px; outline: none; font-family: ui-monospace, monospace; }
  .row { display: flex; gap: 8px; }
</style>
