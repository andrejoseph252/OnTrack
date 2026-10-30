<script lang="ts">
  import { app } from './lib/state.svelte'
  import { loadNetwork } from './lib/network.svelte'
  import { theme } from './lib/theme.svelte'
  import Sheet from './components/Sheet.svelte'
  import PlanView from './components/PlanView.svelte'
  import TripView from './components/TripView.svelte'
  import Departures from './components/Departures.svelte'
  import Places from './components/Places.svelte'
  import Settings from './components/Settings.svelte'
  import LinesView from './components/LinesView.svelte'
  import LineDetail from './components/LineDetail.svelte'

  // The map (MapLibre, ~300 kB) loads after first paint so the panel is usable at once.
  const mapView = import('./components/MapView.svelte')
  // Line maps power the tappable line badges; fetch them when the app is idle.
  setTimeout(loadNetwork, 1500)
</script>

<div class="mapwrap">
  {#await mapView}
    <div class="map-placeholder"></div>
  {:then M}
    {#key theme.dark}<M.default />{/key}
  {/await}
</div>
<!-- The map runs under the status bar; this fade keeps the clock and battery readable. -->
<div class="statusfade" class:dark={theme.dark} class:standalone={theme.standalone} aria-hidden="true"></div>

<Sheet>
  {#key app.view}
    <div class="view">
      {#if app.view === 'trip' && app.selected}
        <TripView />
      {:else if app.view === 'stop' && app.stop}
        <Departures />
      {:else if app.view === 'places'}
        <Places />
      {:else if app.view === 'settings'}
        <Settings />
      {:else if app.view === 'lines'}
        <LinesView />
      {:else if app.view === 'line'}
        <LineDetail />
      {:else}
        <PlanView />
      {/if}
    </div>
  {/key}
</Sheet>

<style>
  .map-placeholder { position: fixed; top: 0; left: 0; right: 0; height: var(--app-h, 100vh); background: var(--bg); }
  .statusfade {
    position: fixed; left: 0; right: 0; top: 0; z-index: 5; pointer-events: none;
    height: calc(env(safe-area-inset-top) + 28px);
    /* In Safari the status text follows the theme, so fade from the page colour. */
    background: linear-gradient(to bottom, var(--bg), color-mix(in srgb, var(--bg) 45%, transparent) 55%, transparent);
  }
  /* Home-screen app (black-translucent): iOS draws white status text, so fade to dark. */
  .statusfade.standalone { background: linear-gradient(to bottom, rgb(0 0 0 / 45%), rgb(0 0 0 / 18%) 60%, transparent); }
  .statusfade.standalone.dark { background: linear-gradient(to bottom, rgb(11 13 18 / 88%), rgb(11 13 18 / 35%) 60%, transparent); }
  .view { animation: in .22s ease-out; }
  @keyframes in { from { opacity: 0; transform: translateY(6px); } }
</style>
