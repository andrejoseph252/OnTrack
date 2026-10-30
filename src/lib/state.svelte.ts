import { plan, type PlanOptions, type PlanPoint } from './api/transitous'
import type { Itinerary, Mode } from './api/types'
import { authoritative, checkLeg, isTransit, itineraryConfidence, type Confidence } from './realtime'
import { analyseTransfers, worstRisk, type RiskLevel, type Transfer } from './transfer'
import { load, save } from './storage'
import { checkRail, dbCreds, type DbCheck } from './api/db'
import { isRail } from './lines'

export interface Loc {
  name: string
  lat: number
  lon: number
  stopId?: string
  detail?: string
}
export interface SavedPlace extends Loc {
  id: string
  icon: string
}
export interface Filters {
  dticket: boolean
  fewestChanges: boolean
  stepFree: boolean
  /** Add 2 min to every transfer for a calmer trip. */
  buffer: boolean
}
export type TimeMode = 'now' | 'depart' | 'arrive'
export type View = 'search' | 'trip' | 'stop' | 'places' | 'settings' | 'lines' | 'line'
export type Snap = 'peek' | 'half' | 'full'
/** A stop for the departures board: a Transitous stop id, or a position (all quays within ~120 m). */
export interface StopRef { id?: string; name: string; lat?: number; lon?: number; /** Opened from this line's map: offer "only this line". */ line?: string }

/** Top-level tabs; everything else is a sub-view reached from them and left with Back. */
export const ROOT_VIEWS: View[] = ['search', 'lines', 'places']
const stack: View[] = []

/**
 * Browser history only with a mouse (desktop back button). On touch devices the app keeps its
 * own back stack: with no history entries iOS has no page to swipe back to, so the left-edge
 * swipe is the app's own gesture (Sheet.svelte) in Safari and the home-screen app alike.
 */
const useHistory = typeof window !== 'undefined' && matchMedia('(pointer: fine)').matches

/** Navigate to a view, with a sensible sheet height for it. */
export function go(view: View, sheet?: Snap) {
  if (view !== app.view) {
    if (ROOT_VIEWS.includes(view)) {
      stack.length = 0
      if (useHistory) history.replaceState(null, '', location.pathname + location.search)
    } else {
      stack.push(app.view)
      if (useHistory) history.pushState({ view }, '', `#${view}`)
    }
    app.view = view
  }
  app.sheet = sheet ?? (app.sheet === 'peek' ? 'full' : app.sheet)
}

function popView() {
  app.view = stack.pop() ?? 'search'
  if (app.sheet === 'peek') app.sheet = 'full'
}

export function back() {
  if (!stack.length) go('search')
  else if (useHistory) history.back()
  else popView()
}

if (typeof window !== 'undefined') {
  // State isn't restored across reloads, so never start on a sub-view.
  if (location.hash) history.replaceState(null, '', location.pathname + location.search)
  if (useHistory) addEventListener('popstate', popView)
}

/** Everything the Deutschlandticket covers: all local transport and regional trains, no IC/ICE/EC/FlixTrain/coaches. */
export const DTICKET_MODES: Mode[] = ['TRAM', 'SUBWAY', 'METRO', 'BUS', 'FERRY', 'REGIONAL_FAST_RAIL', 'REGIONAL_RAIL', 'SUBURBAN', 'FUNICULAR', 'AERIAL_LIFT', 'CABLE_CAR', 'ODM']

export interface Annotated {
  it: Itinerary
  confidence: Confidence
  transfers: Transfer[]
  risk: RiskLevel
  /** Timetabled connection offered because live data for one of its lines is broken. */
  fallback?: string[]
  /** Built by swapping in another departure from leg `from` onward; refreshed by re-running `query`. */
  custom?: { from: number; query: PlanOptions; key: string }
}

export function annotate(it: Itinerary, fallback?: string[]): Annotated {
  const transfers = analyseTransfers(it)
  return { it, confidence: itineraryConfidence(it), transfers, risk: worstRisk(transfers), fallback }
}

/**
 * When the live feed attaches a vehicle to the wrong trip, the real trip vanishes
 * from live results (seen: the 14:47 bus 606 replaced by a ghost 607). Offer the
 * timetabled trips of affected lines, labelled, rather than hiding them.
 */
export function timetableFallback(live: Itinerary[], broken: Annotated[], scheduled: Itinerary[]): Annotated[] {
  const brokenLines = new Set(broken.flatMap(a => a.it.legs.filter(isTransit).map(l => l.routeShortName)))
  const liveTrips = new Set(live.flatMap(i => i.legs.map(l => l.tripId)).filter(Boolean))
  const liveKeys = new Set(live.map(tripKey))
  const now = Date.now()
  return scheduled
    .filter(i => !liveKeys.has(tripKey(i)) && new Date(i.startTime).getTime() > now - 60000)
    .filter(i => i.legs.some(l => isTransit(l) && brokenLines.has(l.routeShortName) && !liveTrips.has(l.tripId)))
    .map(i => annotate(i, [...new Set(i.legs.filter(l => isTransit(l) && brokenLines.has(l.routeShortName)).map(l => l.routeShortName!))]))
}

const tripKey = (it: Itinerary) => it.legs.filter(isTransit).map(l => l.tripId).join('>')

export const app = $state({
  view: 'search' as View,
  /** Bottom-sheet position on phones; ignored on wide screens (side panel). */
  sheet: 'full' as Snap,
  /** Visible height of the sheet in px, so the map can keep routes out from under it. */
  sheetPx: 0,
  /** Real app height in px (see Sheet.measure: iOS home-screen apps under-report it). */
  vh: typeof window !== 'undefined' ? window.innerHeight : 800,
  /** Leg of the open trip to frame on the map. */
  tripFocus: null as number | null,
  /** Result card being previewed on the map (search view). */
  preview: null as number | null,
  /** Selected line in the network view, and which direction is shown. */
  line: null as { key: string; dir: number } | null,
  lineFilter: 'tram' as 'tram' | 'bus' | 'rail' | 'all',
  from: null as Loc | null, // null = current location
  to: null as Loc | null,
  timeMode: 'now' as TimeMode,
  time: '',
  filters: load<Filters>('ontrack.filters', { dticket: false, fewestChanges: false, stepFree: false, buffer: false }),
  places: load<SavedPlace[]>('ontrack.places', []),
  loading: false,
  error: '',
  results: [] as Annotated[],
  /** Connections relying on self-contradictory live data (ghost trips); shown only on request. */
  hidden: [] as Annotated[],
  /** Walking the whole way (if under 45 min), shown as a slim row rather than a route card. */
  walk: null as Annotated | null,
  nextCursor: undefined as string | undefined,
  lastQuery: null as PlanOptions | null,
  selected: null as Annotated | null,
  selectedStale: false,
  updatedAt: null as Date | null,
  /** DB Timetables cross-checks per tripId: departure and arrival end of the leg. */
  db: {} as Record<string, DbCheck | null>,
  dbArr: {} as Record<string, DbCheck | null>,
  stop: null as StopRef | null,
  /** Stopping points at the open stop, with where they go: drawn on the map. */
  stopQuays: [] as { lat: number; lon: number; label: string; to: string[]; color: string }[],
})

export function persistFilters() {
  save('ontrack.filters', app.filters)
}
export function persistPlaces() {
  save('ontrack.places', app.places)
}

export function currentPosition(): Promise<Loc> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error('Location is not available on this device.'))
    navigator.geolocation.getCurrentPosition(
      p => resolve({ name: 'Current location', lat: p.coords.latitude, lon: p.coords.longitude, detail: `±${Math.round(p.coords.accuracy)} m` }),
      e => reject(new Error(e.code === 1 ? 'Location permission denied. Pick a start point instead.' : 'Could not get your location.')),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 15000 },
    )
  })
}

const point = (l: Loc): PlanPoint => (l.stopId ? { stopId: l.stopId } : { lat: l.lat, lon: l.lon })

function options(from: Loc, to: Loc, time: Date | undefined, arriveBy: boolean): PlanOptions {
  const f = app.filters
  return {
    from: point(from),
    to: point(to),
    time,
    arriveBy,
    transitModes: f.dticket ? DTICKET_MODES : undefined,
    wheelchair: f.stepFree,
    additionalTransferTime: f.buffer ? 2 : undefined,
    numItineraries: f.fewestChanges ? 8 : 5,
  }
}

/** Order: feasible first, then by arrival (or by changes when "fewest changes" is on). */
function sortResults(list: Annotated[]) {
  const infeasible = (a: Annotated) => (a.risk === 'missed' || a.confidence.cancelled > 0 ? 1 : 0)
  return list.sort((a, b) =>
    infeasible(a) - infeasible(b) ||
    (app.filters.fewestChanges ? a.it.transfers - b.it.transfers : 0) ||
    new Date(a.it.endTime).getTime() - new Date(b.it.endTime).getTime() ||
    new Date(b.it.startTime).getTime() - new Date(a.it.startTime).getTime())
}

let ctrl: AbortController | null = null
/** Bumped on every search, so slow DB checks never overwrite newer results. */
let generation = 0

export async function search() {
  if (!app.to) return
  ctrl?.abort()
  ctrl = new AbortController()
  app.loading = true
  app.error = ''
  app.results = []
  app.hidden = []
  app.walk = null
  const gen = ++generation
  try {
    const from = app.from ?? (await currentPosition())
    const time = app.timeMode === 'now' || !app.time ? undefined : new Date(app.time)
    const q = options(from, app.to, time, app.timeMode === 'arrive')
    app.lastQuery = q
    // The timetable-only query runs alongside, so the fallback costs no extra wait.
    const [r, sched] = await Promise.all([
      plan(q, ctrl.signal),
      plan({ ...q, realtimeMode: 'OFF' }, ctrl.signal).catch(() => null),
    ])
    // A walk-only route (e.g. 600 m to uni) can beat any connection: kept separately as a slim row.
    const walk = r.direct.filter(d => d.duration < 45 * 60 && d.legs.every(l => l.mode === 'WALK')).sort((a, b) => a.duration - b.duration)[0]
    app.walk = walk ? annotate(walk) : null
    const annotated = r.itineraries.map(i => annotate(i))
    const ok = annotated.filter(a => !a.confidence.broken.length)
    app.hidden = annotated.filter(a => a.confidence.broken.length)
    const extra = app.hidden.length && sched ? timetableFallback(r.itineraries, app.hidden, sched.itineraries) : []
    app.results = sortResults([...ok, ...extra])
    // Then check every train in the list with DB and re-rank on DB's times.
    crossCheckList(gen)
    app.nextCursor = r.nextPageCursor
    app.updatedAt = new Date()
    if (!r.itineraries.length && !walk) app.error = 'No connections found. Try a different time or turn off filters.'
  } catch (e) {
    if ((e as Error).name !== 'AbortError') app.error = (e as Error).message
  } finally {
    app.loading = false
  }
}

export async function loadLater() {
  if (!app.lastQuery || !app.nextCursor) return
  app.loading = true
  try {
    const r = await plan({ ...app.lastQuery, pageCursor: app.nextCursor })
    const seen = new Set([...app.results, ...app.hidden].map(a => tripKey(a.it)))
    const fresh = r.itineraries.filter(i => !seen.has(tripKey(i))).map(i => annotate(i))
    app.results = [...app.results, ...fresh.filter(a => !a.confidence.broken.length)]
    app.hidden = [...app.hidden, ...fresh.filter(a => a.confidence.broken.length)]
    app.nextCursor = r.nextPageCursor
  } catch (e) {
    app.error = (e as Error).message
  } finally {
    app.loading = false
  }
}

export function openTrip(a: Annotated) {
  app.selected = a
  app.selectedStale = false
  app.tripFocus = null
  go('trip')
  crossCheckWithDb(a.it).then(() => { if (app.selected === a) app.selected = annotate(a.it, a.fallback) })
}

/** Re-query and find the same trips again, so delays and cancellations stay current. */
export async function refreshSelected() {
  const sel = app.selected
  const q = app.lastQuery
  if (!sel || !q) return
  if (sel.custom) return refreshCustom(sel)
  const start = new Date(new Date(sel.it.startTime).getTime() - 2 * 60000)
  try {
    const r = await plan({ ...q, time: start, arriveBy: false, pageCursor: undefined, numItineraries: 8, realtimeMode: sel.fallback ? 'OFF' : 'REALTIME' })
    const key = tripKey(sel.it)
    const same = r.itineraries.find(i => tripKey(i) === key)
    if (app.selected !== sel) return
    if (same) {
      app.selected = annotate(same, sel.fallback)
      app.selectedStale = false
    } else {
      app.selectedStale = true
    }
    app.updatedAt = new Date()
    await crossCheckWithDb(app.selected.it)
    if (same && app.selected?.it === same) app.selected = annotate(same, sel.fallback)
  } catch {
    /* keep last known data; the "updated" time shows its age */
  }
}

async function crossCheckWithDb(it: Itinerary) {
  await Promise.all(it.legs.filter(l => isTransit(l) && isRail(l.mode)).map(async leg => {
    if (!leg.tripId) return
    const [dep, arr] = await Promise.all([checkRail(leg, 'dp'), checkRail(leg, 'ar')])
    app.db[leg.tripId] = dep
    app.dbArr[leg.tripId] = arr
    authoritative.set(leg.tripId, { dp: dep, ar: arr })
  }))
}

/** DB-check all trains in the current results, then recompute risk, flags and order. */
async function crossCheckList(gen: number) {
  if (!dbCreds()) return
  const all = [...app.results, ...app.hidden]
  await Promise.all(all.map(a => crossCheckWithDb(a.it)))
  if (gen !== generation) return
  const re = all.map(a => annotate(a.it, a.fallback))
  app.hidden = re.filter(a => a.confidence.broken.length)
  app.results = sortResults(re.filter(a => !a.confidence.broken.length))
}

/**
 * Where you are before leg `i`: getting off the previous ride (or at the start), and when.
 * Everything after that point is what "other departures" replaces.
 */
function anchorFor(it: Itinerary, i: number) {
  const k = it.legs.slice(0, i).map((l, n) => (isTransit(l) ? n : -1)).filter(n => n >= 0).at(-1) ?? -1
  if (k >= 0) return { keep: k + 1, place: it.legs[k].to, ready: checkLeg(it.legs[k]).arr.time }
  return { keep: 0, place: it.legs[0].from, ready: new Date(Math.max(Date.now(), new Date(it.legs[0].startTime).getTime())) }
}

/**
 * "Other departures": every way on to the destination from where you are before leg `i`
 * (e.g. having got off the tram at Bonn Hbf), from the moment you're there. Planned from
 * the position, so all platforms (trains, trams, buses) count, walks included.
 */
export async function departuresFrom(i: number): Promise<{ ready: Date; at: string; options: Annotated[]; query: PlanOptions; keep: number }> {
  const sel = app.selected
  if (!sel || !app.to) throw new Error('No trip')
  const { keep, place, ready } = anchorFor(sel.it, i)
  const query = { ...options({ name: place.name, lat: place.lat, lon: place.lon }, app.to, new Date(ready.getTime() - 60000), false), numItineraries: 7 }
  const r = await plan(query)
  const firstRide = (x: Itinerary) => x.legs.find(isTransit)
  const found = r.itineraries
    .map(x => annotate(x))
    .filter(a => !a.confidence.broken.length && firstRide(a.it) && checkLeg(firstRide(a.it)!).dep.time.getTime() >= ready.getTime() - 60000)
    .sort((a, b) => checkLeg(firstRide(a.it)!).dep.time.getTime() - checkLeg(firstRide(b.it)!).dep.time.getTime())
  return { ready, at: place.name, options: found, query, keep }
}

/** Keep the trip up to the anchor (`keep` legs), then continue with the chosen option. */
export function useDeparture(keep: number, alt: Annotated, query: PlanOptions) {
  const sel = app.selected
  if (!sel) return
  const it = joinTrip(sel.it.legs.slice(0, keep), alt.it)
  app.selected = { ...annotate(it), custom: { from: keep, query, key: tripKey(alt.it) } }
  app.selectedStale = false
  app.tripFocus = null
  crossCheckWithDb(it).then(() => { if (app.selected?.it === it) app.selected = { ...annotate(it), custom: app.selected.custom } })
}

function joinTrip(prefix: Itinerary['legs'], rest: Itinerary): Itinerary {
  const legs = [...prefix, ...rest.legs]
  const start = legs[0].startTime
  return { ...rest, legs, startTime: start, duration: Math.round((new Date(rest.endTime).getTime() - new Date(start).getTime()) / 1000), transfers: Math.max(0, legs.filter(isTransit).length - 1) }
}

/** Refresh a swapped trip: re-run the continuation and find the same trips again. */
async function refreshCustom(sel: Annotated) {
  const c = sel.custom!
  try {
    const r = await plan(c.query)
    const same = r.itineraries.find(x => tripKey(x) === c.key)
    if (app.selected !== sel) return
    if (!same) { app.selectedStale = true; return }
    const it = joinTrip(sel.it.legs.slice(0, c.from), same)
    await crossCheckWithDb(it)
    if (app.selected === sel) app.selected = { ...annotate(it), custom: c }
    app.updatedAt = new Date()
  } catch {
    /* keep last known data */
  }
}

/** Start over: empty both ends, results and time choice (filters and saved places stay). */
export function resetSearch() {
  ctrl?.abort()
  generation++
  app.from = null
  app.to = null
  app.results = []
  app.hidden = []
  app.walk = null
  app.error = ''
  app.loading = false
  app.nextCursor = undefined
  app.lastQuery = null
  app.timeMode = 'now'
  app.time = ''
  app.preview = null
}

/** "I'm here now": plan from the current position, right now, to the same destination. */
export async function replanFromHere() {
  app.from = null
  app.timeMode = 'now'
  go('search')
  await search()
}
