<script lang="ts">
  import { app } from './lib/state.svelte'
  import { loadNetwork } from './lib/network.svelte'
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
    <M.default />
  {/await}
</div>

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
  .map-placeholder { position: fixed; inset: 0; background: var(--bg); }
  .view { animation: in .22s ease-out; }
  @keyframes in { from { opacity: 0; transform: translateY(6px); } }
</style>
