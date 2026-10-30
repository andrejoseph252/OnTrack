<script lang="ts">
  import * as maplibregl from 'maplibre-gl'
  import 'maplibre-gl/dist/maplibre-gl.css'
  // Bundle the map worker as its own file; MapLibre cannot locate it after Vite's dependency pre-bundling.
  import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'
  import { onDestroy, onMount } from 'svelte'
  import type { Itinerary } from '../lib/api/types'
  import { decodePolyline, headingAlong, type LngLat } from '../lib/geo'
  import { isTransit } from '../lib/realtime'
  import { lineColors, lineName } from '../lib/lines'

  maplibregl.setWorkerUrl(workerUrl)

  let { it, focus = null }: { it: Itinerary; focus?: number | null } = $props()

  let el: HTMLDivElement
  let map: maplibregl.Map | null = null
  let markers: maplibregl.Marker[] = []
  let ready = $state(false)

  const dark = matchMedia('(prefers-color-scheme: dark)').matches
  const STYLE = `https://tiles.openfreemap.org/styles/${dark ? 'dark' : 'positron'}`

  const paths = $derived(it.legs.map(l => decodePolyline(l.legGeometry.points, l.legGeometry.precision)))

  function geojson() {
    return {
      type: 'FeatureCollection' as const,
      features: it.legs.map((leg, i) => ({
        type: 'Feature' as const,
        properties: { i, walk: !isTransit(leg), color: isTransit(leg) ? lineColors(leg).bg : '#7a8594' },
        geometry: { type: 'LineString' as const, coordinates: paths[i] },
      })),
    }
  }

  function bounds(pts: LngLat[]) {
    const b = new maplibregl.LngLatBounds()
    for (const p of pts) b.extend(p)
    return b
  }

  function marker(html: string, at: LngLat, cls: string, anchor: maplibregl.PositionAnchor = 'center') {
    const div = document.createElement('div')
    div.className = cls
    div.innerHTML = html
    const m = new maplibregl.Marker({ element: div, anchor }).setLngLat(at).addTo(map!)
    markers.push(m)
  }

  function draw() {
    if (!map) return
    const src = map.getSource('legs') as maplibregl.GeoJSONSource | undefined
    if (src) src.setData(geojson())
    else {
      map.addSource('legs', { type: 'geojson', data: geojson() })
      map.addLayer({ id: 'transit-casing', type: 'line', source: 'legs', filter: ['!', ['get', 'walk']],
        layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#ffffff', 'line-width': 8, 'line-opacity': dark ? 0.15 : 0.9 } })
      map.addLayer({ id: 'transit', type: 'line', source: 'legs', filter: ['!', ['get', 'walk']],
        layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': ['get', 'color'], 'line-width': 5 } })
      map.addLayer({ id: 'walk', type: 'line', source: 'legs', filter: ['get', 'walk'],
        layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': dark ? '#c9d1db' : '#3d4652', 'line-width': 3.5, 'line-dasharray': [0.1, 1.8] } })
    }

    markers.forEach(m => m.remove())
    markers = []
    const first = it.legs[0].from, last = it.legs[it.legs.length - 1].to
    marker('', [first.lon, first.lat], 'mk start')
    marker('', [last.lon, last.lat], 'mk end')

    it.legs.forEach((leg, i) => {
      if (!isTransit(leg)) return
      const c = lineColors(leg)
      const head = headingAlong(paths[i]) ?? 0
      // Boarding point: exact platform position, with an arrow showing the direction of travel.
      marker(
        `<span class="arrow" style="transform:rotate(${head}deg);border-bottom-color:${c.bg}"></span>
         <span class="lbl" style="background:${c.bg};color:${c.fg}">${lineName(leg)}${leg.from.track ? ` · ${leg.from.track}` : ''}</span>`,
        [leg.from.lon, leg.from.lat], 'mk board')
      marker('', [leg.to.lon, leg.to.lat], 'mk alight')
    })
    fit()
  }

  function fit() {
    if (!map) return
    const pts = focus != null && paths[focus]?.length ? paths[focus] : paths.flat()
    if (!pts.length) return
    map.resize()
    // Bottom padding accounts for the sheet overlapping the map; right for the controls.
    map.fitBounds(bounds(pts), { padding: { top: 60, bottom: 50, left: 40, right: 60 }, maxZoom: 18, duration: ready ? 600 : 0 })
  }

  onMount(() => {
    map = new maplibregl.Map({ container: el, style: STYLE, bounds: bounds(paths.flat()), fitBoundsOptions: { padding: 40 }, attributionControl: { compact: true } })
    map.addControl(new maplibregl.NavigationControl({ showCompass: true, visualizePitch: false }), 'top-right')
    map.addControl(new maplibregl.GeolocateControl({ positionOptions: { enableHighAccuracy: true }, trackUserLocation: true, showAccuracyCircle: true }), 'top-right')
    map.on('load', () => { draw(); ready = true })
    new ResizeObserver(() => map?.resize()).observe(el)
  })

  onDestroy(() => map?.remove())

  $effect(() => {
    void it
    if (ready) draw()
  })
  $effect(() => {
    void focus
    if (ready) fit()
  })
</script>

<div class="map" bind:this={el}></div>

<style>
  .map { width: 100%; height: 100%; }
  :global(.mk.start), :global(.mk.end) {
    width: 16px; height: 16px; border-radius: 50%; border: 3px solid #fff; box-shadow: 0 1px 4px rgb(0 0 0 / 35%);
  }
  :global(.mk.start) { background: #14171c; }
  :global(.mk.end) { background: var(--accent); width: 20px; height: 20px; }
  :global(.mk.alight) { width: 10px; height: 10px; border-radius: 50%; background: #fff; border: 2px solid #3d4652; }
  :global(.mk.board) { position: relative; width: 14px; height: 14px; border-radius: 50%; background: #fff; border: 3px solid #14171c; }
  :global(.mk.board .lbl) {
    position: absolute; left: 16px; top: -6px; white-space: nowrap; font: 700 12px/18px system-ui, sans-serif;
    padding: 0 6px; border-radius: 5px; box-shadow: 0 1px 4px rgb(0 0 0 / 30%);
  }
  :global(.mk.board .arrow) {
    position: absolute; left: -4px; top: -22px; width: 0; height: 0; transform-origin: 8px 26px;
    border-left: 8px solid transparent; border-right: 8px solid transparent; border-bottom: 14px solid;
  }
</style>
