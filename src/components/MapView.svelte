<script lang="ts">
  import * as maplibregl from 'maplibre-gl'
  import 'maplibre-gl/dist/maplibre-gl.css'
  // Bundle the map worker as its own file; MapLibre cannot locate it after Vite's dependency pre-bundling.
  import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'
  import { onDestroy, onMount } from 'svelte'
  import { app, go, openTrip, search } from '../lib/state.svelte'
  import { theme } from '../lib/theme.svelte'
  import { decodePolyline, headingAlong, type LngLat } from '../lib/geo'
  import { isTransit } from '../lib/realtime'
  import { lineColors, lineName } from '../lib/lines'
  import { isCity, isReplacement, lineColor, lineKey, loadNetwork, net, patternPath } from '../lib/network.svelte'
  import type { Itinerary } from '../lib/api/types'

  maplibregl.setWorkerUrl(workerUrl)

  let el: HTMLDivElement
  let map: maplibregl.Map | null = null
  let markers: maplibregl.Marker[] = []
  let ready = $state(false)
  let wide = $state(window.innerWidth >= 900)

  // App.svelte remounts the map when the theme changes, so this is read once per map.
  const dark = theme.dark
  const STYLE = `https://tiles.openfreemap.org/styles/${dark ? 'dark' : 'positron'}`
  const BONN: [number, number] = [7.0982, 50.7374]

  type RouteProps = { color: string; width: number; opacity: number; walk: boolean; dashed?: boolean; ri?: number; key?: string }
  type Feature<G> = { type: 'Feature'; properties: Record<string, unknown>; geometry: G }
  interface Scene {
    id: string
    routes: Feature<{ type: 'LineString'; coordinates: LngLat[] }>[]
    points: Feature<{ type: 'Point'; coordinates: LngLat }>[]
    markers: { html: string; at: LngLat; cls: string; left?: boolean }[]
    fit: LngLat[]
  }

  const path = (it: Itinerary, i: number) => decodePolyline(it.legs[i].legGeometry.points, it.legs[i].legGeometry.precision)
  const route = (coordinates: LngLat[], p: RouteProps) => ({ type: 'Feature' as const, properties: p, geometry: { type: 'LineString' as const, coordinates } })

  function itineraryRoutes(it: Itinerary, extra: Partial<RouteProps> = {}) {
    return it.legs.map((leg, i) => route(path(it, i), {
      color: isTransit(leg) ? lineColors(leg).bg : dark ? '#c9d1db' : '#3d4652',
      width: isTransit(leg) ? 5 : 3.5, opacity: 1, walk: !isTransit(leg), ...extra,
    }))
  }

  function endpoints(it: Itinerary) {
    const a = it.legs[0].from, b = it.legs[it.legs.length - 1].to
    return [{ html: '', at: [a.lon, a.lat] as LngLat, cls: 'mk start' }, { html: '', at: [b.lon, b.lat] as LngLat, cls: 'mk end' }]
  }

  const scene = $derived.by((): Scene | null => {
    // Trip: every leg, boarding points with direction arrows.
    if (app.view === 'trip' && app.selected) {
      const it = app.selected.it
      const markers = endpoints(it)
      it.legs.forEach((leg, i) => {
        if (!isTransit(leg)) return
        const c = lineColors(leg)
        const head = headingAlong(path(it, i)) ?? 0
        markers.push({
          html: `<span class="arrow" style="transform:rotate(${head}deg);border-bottom-color:${c.bg}"></span><span class="lbl" style="background:${c.bg};color:${c.fg}">${lineName(leg)}</span>`,
          at: [leg.from.lon, leg.from.lat], cls: 'mk board',
        })
        markers.push({ html: '', at: [leg.to.lon, leg.to.lat], cls: 'mk alight' })
      })
      const f = app.tripFocus
      return {
        id: `trip:${it.startTime}:${it.legs.map(l => l.tripId).join()}:${f}`,
        routes: itineraryRoutes(it), points: [], markers,
        fit: f != null ? path(it, f) : it.legs.flatMap((_, i) => path(it, i)),
      }
    }
    // Results: all candidates, previewed one on top.
    if (app.view === 'search' && app.results.length) {
      const p = app.preview
      const order = app.results.map((a, ri) => ({ a, ri })).sort((x, y) => (x.ri === p ? 1 : 0) - (y.ri === p ? 1 : 0))
      return {
        id: `results:${app.results.map(a => a.it.startTime).join()}`,
        routes: order.flatMap(({ a, ri }) => itineraryRoutes(a.it, { ri, opacity: p == null || p === ri ? 0.95 : 0.25, width: p === ri ? 6 : 4 })),
        points: [], markers: endpoints(app.results[0].it),
        fit: app.results.flatMap(a => a.it.legs.flatMap((_, i) => path(a.it, i))),
      }
    }
    // Network: every line of the chosen type. Bonn's city lines in colour on top,
    // regional lines thin and muted beneath; temporary replacement buses left out.
    if (app.view === 'lines' && net.status === 'ready') {
      const lines = net.lines.filter(l => (app.lineFilter === 'all' || l.type === app.lineFilter) && !isReplacement(l))
        .sort((a, b) => +isCity(a) - +isCity(b))
      const muted = dark ? '#5b6475' : '#9aa3b2'
      const routes = lines.flatMap(l => l.patterns.slice(0, 1).map(pt => route(patternPath(pt), {
        color: isCity(l) || l.type === 'rail' ? lineColor(l) : muted,
        width: l.type === 'tram' ? 4.5 : l.type === 'rail' ? 3.5 : isCity(l) ? 3 : 1.6,
        opacity: isCity(l) || l.type === 'rail' ? 0.9 : 0.55, walk: false, dashed: pt.approx, key: lineKey(l),
      })))
      // Frame Bonn itself, not every far end of the regional lines.
      const fit: LngLat[] = [[BONN[0] - 0.09, BONN[1] - 0.08], [BONN[0] + 0.09, BONN[1] + 0.06]]
      return { id: `lines:${app.lineFilter}`, routes, points: [], markers: [], fit }
    }
    // One line: both directions and all stops.
    if (app.view === 'line' && app.line && net.status === 'ready') {
      const l = net.lines.find(x => lineKey(x) === app.line!.key)
      if (!l) return null
      const shown = l.patterns.find(p => p.dir === app.line!.dir) ?? l.patterns[0]
      const routes = l.patterns.map(pt => route(patternPath(pt), { color: lineColor(l), width: pt === shown ? 6 : 3, opacity: pt === shown ? 1 : 0.45, walk: false, dashed: pt.approx }))
      const points = shown.stops.map((si, i) => {
        const s = net.stops[si]
        return { type: 'Feature' as const, properties: { name: s[1].replace(/^Bonn\s+/, ''), color: lineColor(l), end: i === 0 || i === shown.stops.length - 1, si }, geometry: { type: 'Point' as const, coordinates: [s[3], s[2]] as LngLat } }
      })
      return { id: `line:${app.line.key}:${shown.dir}`, routes, points, markers: [], fit: patternPath(shown) }
    }
    // Stop: every stopping point with where it goes, so you know which side to stand on.
    if (app.view === 'stop' && app.stop?.lat != null) {
      const at: LngLat = [app.stop.lon!, app.stop.lat]
      const esc = (t: string) => t.replace(/[&<>"]/g, c => `&#${c.charCodeAt(0)};`)
      const quays = app.stopQuays.map(q => ({
        html: `<span class="q-dot" style="background:${q.color}"></span><span class="q-lbl">${q.label ? `<b>${esc(q.label)}</b>` : ''}${q.to.map(t => `<span>→ ${esc(t)}</span>`).join('')}</span>`,
        at: [q.lon, q.lat] as LngLat, cls: 'mk quay', left: true,
      }))
      const pts = app.stopQuays.map(q => [q.lon, q.lat] as LngLat)
      return {
        id: `stop:${app.stop.name}:${app.stopQuays.length}`, routes: [], points: [],
        markers: quays.length ? quays : [{ html: '', at, cls: 'mk end' }],
        fit: [...pts, [at[0] - 0.0018, at[1] - 0.0012], [at[0] + 0.0018, at[1] + 0.0012]],
      }
    }
    return null
  })

  function bounds(pts: LngLat[]) {
    const b = new maplibregl.LngLatBounds()
    for (const p of pts) b.extend(p)
    return b
  }

  function padding() {
    return wide
      ? { top: 60, bottom: 60, left: 470, right: 70 }
      : { top: 70, bottom: Math.min(app.sheetPx, app.vh * 0.6) + 24, left: 36, right: 56 }
  }

  /** Once the user pans, stop re-centring the idle map on Bonn. */
  let userMoved = false
  /** Centre Bonn in the part of the screen the sheet leaves visible. */
  function centreHome(duration = 500) {
    if (!map || userMoved) return
    const covered = wide ? 0 : Math.min(app.sheetPx, app.vh * 0.6)
    map.easeTo({ center: BONN, zoom: 12.3, offset: wide ? [210, 0] : [0, -covered / 2], duration })
  }

  let lastId = ''
  function draw(s: Scene | null) {
    if (!map) return
    const data = { type: 'FeatureCollection' as const, features: s?.routes ?? [] }
    ;(map.getSource('routes') as maplibregl.GeoJSONSource).setData(data as never)
    ;(map.getSource('points') as maplibregl.GeoJSONSource).setData({ type: 'FeatureCollection', features: s?.points ?? [] } as never)
    markers.forEach(m => m.remove())
    markers = (s?.markers ?? []).map(m => {
      const div = document.createElement('div')
      div.className = m.cls
      div.innerHTML = m.html
      // Left-anchored markers keep their dot (7 px radius) exactly on the coordinate.
      return new maplibregl.Marker({ element: div, ...(m.left ? { anchor: 'left' as const, offset: [-7, 0] as [number, number] } : {}) }).setLngLat(m.at).addTo(map!)
    })
    if (s && s.id !== lastId && s.fit.length) fit(s.fit)
    lastId = s?.id ?? ''
  }

  function fit(pts: LngLat[]) {
    if (!map || !pts.length) return
    map.fitBounds(bounds(pts), { padding: padding(), maxZoom: 17, duration: 650 })
  }

  onMount(() => {
    map = new maplibregl.Map({
      container: el, style: STYLE, center: BONN, zoom: 12.3, attributionControl: { compact: true },
      // Pitch/rotate gestures get in the way of one-handed use.
      dragRotate: false, pitchWithRotate: false, touchPitch: false,
    })
    map.touchZoomRotate.disableRotation()
    map.addControl(new maplibregl.GeolocateControl({ positionOptions: { enableHighAccuracy: true }, trackUserLocation: true, showAccuracyCircle: true }), 'top-right')

    map.on('load', () => {
      const m = map!
      centreHome(0)
      m.on('dragstart', () => (userMoved = true))
      m.addSource('routes', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } })
      m.addSource('points', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } })
      const solid: maplibregl.FilterSpecification = ['all', ['!', ['get', 'walk']], ['!', ['to-boolean', ['get', 'dashed']]]]
      m.addLayer({ id: 'casing', type: 'line', source: 'routes', filter: solid, layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': dark ? '#0b0d12' : '#ffffff', 'line-width': ['+', ['get', 'width'], 3], 'line-opacity': ['*', ['get', 'opacity'], dark ? 0.6 : 0.9] } })
      m.addLayer({ id: 'line', type: 'line', source: 'routes', filter: solid, layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': ['get', 'color'], 'line-width': ['get', 'width'], 'line-opacity': ['get', 'opacity'] } })
      m.addLayer({ id: 'dashed', type: 'line', source: 'routes', filter: ['to-boolean', ['get', 'dashed']], layout: { 'line-cap': 'butt', 'line-join': 'round' },
        paint: { 'line-color': ['get', 'color'], 'line-width': ['get', 'width'], 'line-opacity': ['get', 'opacity'], 'line-dasharray': [2, 1.5] } })
      m.addLayer({ id: 'walk', type: 'line', source: 'routes', filter: ['get', 'walk'], layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': ['get', 'color'], 'line-width': ['get', 'width'], 'line-opacity': ['get', 'opacity'], 'line-dasharray': [0.1, 1.8] } })
      m.addLayer({ id: 'stops', type: 'circle', source: 'points',
        paint: { 'circle-radius': ['interpolate', ['linear'], ['zoom'], 11, ['case', ['get', 'end'], 4, 2], 14, ['case', ['get', 'end'], 7, 5]],
          'circle-stroke-width': ['interpolate', ['linear'], ['zoom'], 11, 1.5, 14, 3], 'circle-color': dark ? '#151922' : '#ffffff', 'circle-stroke-color': ['get', 'color'] } })
      m.addLayer({ id: 'stop-labels', type: 'symbol', source: 'points', minzoom: 12.5,
        layout: { 'text-field': ['get', 'name'], 'text-font': ['Noto Sans Regular'], 'text-size': 12, 'text-offset': [0.9, 0], 'text-anchor': 'left', 'text-optional': true },
        paint: { 'text-color': dark ? '#e8ebf0' : '#1d2330', 'text-halo-color': dark ? '#0b0d12' : '#ffffff', 'text-halo-width': 1.6 } })

      // Tap a result's route to open it; tap a line in the network to open that line.
      const onRoute = (e: maplibregl.MapLayerMouseEvent) => {
        const p = e.features?.[0]?.properties as RouteProps | undefined
        if (p?.ri != null && app.view === 'search') openTrip(app.results[p.ri])
        else if (p?.key && app.view === 'lines') { app.line = { key: p.key, dir: 0 }; go('line', 'half') }
      }
      m.on('click', 'line', onRoute)
      m.on('click', 'dashed', onRoute)
      m.on('click', 'stops', e => {
        const f = e.features?.[0]
        if (!f) return
        const s = net.stops[(f.properties as { si: number }).si]
        app.stop = { name: s[1], lat: s[2], lon: s[3] }
        go('stop', 'half')
      })
      for (const id of ['line', 'stops']) {
        m.on('mouseenter', id, () => (m.getCanvas().style.cursor = 'pointer'))
        m.on('mouseleave', id, () => (m.getCanvas().style.cursor = ''))
      }
      ready = true
    })
  })

  // Saved places as small emoji pins (quiet, like Maps' saved-place markers). Tap = route there.
  let placeMarkers: maplibregl.Marker[] = []
  $effect(() => {
    const places = app.places.map(p => ({ id: p.id, name: p.name, icon: p.icon, lat: p.lat, lon: p.lon }))
    const show = app.view !== 'line' && app.view !== 'stop'
    if (!ready) return
    placeMarkers.forEach(m => m.remove())
    placeMarkers = show ? places.map(p => {
      const el = document.createElement('button')
      el.className = 'place-pin'
      el.type = 'button'
      el.title = p.name
      el.setAttribute('aria-label', `Route to ${p.name}`)
      el.textContent = p.icon
      el.addEventListener('click', e => {
        e.stopPropagation()
        const place = app.places.find(x => x.id === p.id)
        if (!place) return
        app.to = place
        go('search')
        search()
      })
      return new maplibregl.Marker({ element: el }).setLngLat([p.lon, p.lat]).addTo(map!)
    }) : []
  })

  onDestroy(() => map?.remove())

  $effect(() => {
    const s = scene
    if (ready) draw(s)
  })

  // Keep the framed area (or Bonn, when idle) visible when the sheet snaps to a new height.
  $effect(() => {
    void app.sheet
    const s = scene
    if (!ready) return
    if (s?.fit.length) setTimeout(() => fit(s.fit), 60)
    else setTimeout(() => centreHome(), 60)
  })

  $effect(() => {
    if (app.view === 'lines' || app.view === 'line') loadNetwork()
  })
</script>

<svelte:window onresize={() => (wide = window.innerWidth >= 900)} />

<div class="map" bind:this={el}></div>

<style>
  .map { position: fixed; top: 0; left: 0; right: 0; height: var(--app-h, 100vh); }
  :global(.maplibregl-ctrl-top-right) { top: env(safe-area-inset-top); }
  :global(.maplibregl-ctrl-group) { border-radius: 12px !important; box-shadow: var(--shadow) !important; overflow: hidden; }
  :global(.mk.start), :global(.mk.end) { width: 18px; height: 18px; border-radius: 50%; border: 3px solid #fff; box-shadow: 0 1px 5px rgb(0 0 0 / 35%); }
  :global(.mk.start) { background: #0f1218; }
  :global(.mk.end) { background: var(--accent); width: 22px; height: 22px; }
  :global(.mk.alight) { width: 11px; height: 11px; border-radius: 50%; background: #fff; border: 2.5px solid #3d4652; }
  :global(.mk.board) { position: relative; width: 16px; height: 16px; border-radius: 50%; background: #fff; border: 3px solid #0f1218; }
  :global(.mk.board .lbl) {
    position: absolute; left: 18px; top: -6px; white-space: nowrap; font: 750 12px/20px var(--font);
    padding: 0 7px; border-radius: 6px; box-shadow: 0 1px 5px rgb(0 0 0 / 30%);
  }
  :global(.place-pin) {
    width: 30px; height: 30px; border-radius: 50%; display: grid; place-items: center; padding: 0;
    font-size: 15px; line-height: 1; cursor: pointer;
    background: var(--surface); border: 2px solid var(--surface);
    box-shadow: 0 0 0 1px rgb(127 127 127 / 22%), 0 1px 2px rgb(0 0 0 / 18%), 0 3px 10px rgb(0 0 0 / 22%);
    transition: transform .15s;
  }
  :global(.place-pin:active) { transform: scale(.92); }
  :global(.mk.quay) { display: flex; align-items: center; gap: 6px; }
  :global(.mk.quay .q-dot) { width: 14px; height: 14px; border-radius: 50%; border: 3px solid #fff; box-shadow: 0 1px 4px rgb(0 0 0 / 35%); flex: none; }
  :global(.mk.quay .q-lbl) {
    display: grid; background: var(--surface); color: var(--text); font: 600 11.5px/1.35 var(--font);
    padding: 4px 8px; border-radius: 8px; box-shadow: var(--shadow); white-space: nowrap;
  }
  :global(.mk.quay .q-lbl b) { font-weight: 750; }
  :global(.mk.board .arrow) {
    position: absolute; left: -3px; top: -23px; width: 0; height: 0; transform-origin: 8px 28px;
    border-left: 8px solid transparent; border-right: 8px solid transparent; border-bottom: 14px solid;
  }
</style>
