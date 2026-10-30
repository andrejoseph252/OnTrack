import { plan, type PlanOptions, type PlanPoint } from './api/transitous'
import type { Itinerary, Mode } from './api/types'
import { checkLeg, isTransit, itineraryConfidence, type Confidence } from './realtime'
import { analyseTransfers, worstRisk, type RiskLevel, type Transfer } from './transfer'
import { load, save } from './storage'
import { checkDeparture, type DbCheck } from './api/db'

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

/** Everything the Deutschlandticket covers: all local transport and regional trains, no IC/ICE/EC/FlixTrain/coaches. */
export const DTICKET_MODES: Mode[] = ['TRAM', 'SUBWAY', 'METRO', 'BUS', 'FERRY', 'REGIONAL_FAST_RAIL', 'REGIONAL_RAIL', 'SUBURBAN', 'FUNICULAR', 'AERIAL_LIFT', 'CABLE_CAR', 'ODM']

export interface Annotated {
  it: Itinerary
  confidence: Confidence
  transfers: Transfer[]
  risk: RiskLevel
}

export function annotate(it: Itinerary): Annotated {
  const transfers = analyseTransfers(it)
  return { it, confidence: itineraryConfidence(it), transfers, risk: worstRisk(transfers) }
}

const tripKey = (it: Itinerary) => it.legs.filter(isTransit).map(l => l.tripId).join('>')

export const app = $state({
  view: 'search' as 'search' | 'trip' | 'stop' | 'places',
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
  nextCursor: undefined as string | undefined,
  lastQuery: null as PlanOptions | null,
  selected: null as Annotated | null,
  selectedStale: false,
  updatedAt: null as Date | null,
  db: {} as Record<string, DbCheck | null>,
  stop: null as { id: string; name: string } | null,
  backups: {} as Record<number, Annotated[] | 'loading' | 'none'>,
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

export async function search() {
  if (!app.to) return
  ctrl?.abort()
  ctrl = new AbortController()
  app.loading = true
  app.error = ''
  app.results = []
  app.hidden = []
  try {
    const from = app.from ?? (await currentPosition())
    const time = app.timeMode === 'now' || !app.time ? undefined : new Date(app.time)
    const q = options(from, app.to, time, app.timeMode === 'arrive')
    app.lastQuery = q
    const r = await plan(q, ctrl.signal)
    // A walk-only route (e.g. 600 m to uni) can beat any connection; show it too.
    const all = [...r.itineraries, ...r.direct.filter(d => d.duration < 45 * 60)]
    const annotated = all.map(annotate)
    app.results = sortResults(annotated.filter(a => !a.confidence.broken.length))
    app.hidden = annotated.filter(a => a.confidence.broken.length)
    app.nextCursor = r.nextPageCursor
    app.updatedAt = new Date()
    if (!all.length) app.error = 'No connections found. Try a different time or turn off filters.'
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
    const fresh = r.itineraries.filter(i => !seen.has(tripKey(i))).map(annotate)
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
  app.backups = {}
  app.view = 'trip'
  crossCheckWithDb(a.it)
  for (const t of a.transfers) if (t.level === 'risky' || t.level === 'missed') findBackup(t)
}

/** Re-query and find the same trips again, so delays and cancellations stay current. */
export async function refreshSelected() {
  const sel = app.selected
  const q = app.lastQuery
  if (!sel || !q) return
  const start = new Date(new Date(sel.it.startTime).getTime() - 2 * 60000)
  try {
    const r = await plan({ ...q, time: start, arriveBy: false, pageCursor: undefined, numItineraries: 8 })
    const key = tripKey(sel.it)
    const same = r.itineraries.find(i => tripKey(i) === key)
    if (app.selected !== sel) return
    if (same) {
      app.selected = annotate(same)
      app.selectedStale = false
    } else {
      app.selectedStale = true
    }
    app.updatedAt = new Date()
    crossCheckWithDb(app.selected.it)
  } catch {
    /* keep last known data; the "updated" time shows its age */
  }
}

async function crossCheckWithDb(it: Itinerary) {
  await Promise.all(it.legs.filter(isTransit).map(async leg => {
    if (!leg.tripId) return
    const r = await checkDeparture(leg)
    app.db[leg.tripId] = r
  }))
}

/** Backup if a transfer fails: the next connections from the transfer stop after the planned departure. */
export async function findBackup(t: Transfer) {
  const sel = app.selected
  if (!app.to || !sel || app.backups[t.toIndex]) return
  app.backups[t.toIndex] = 'loading'
  const at = t.arriving.to
  const missedDep = checkLeg(t.departing).dep.time
  try {
    const r = await plan(options({ name: at.name, lat: at.lat, lon: at.lon, stopId: at.stopId }, app.to, new Date(missedDep.getTime() + 60000), false))
    const alts = r.itineraries
      .filter(i => i.legs.find(isTransit)?.tripId !== t.departing.tripId)
      .map(annotate)
      .filter(a => !a.confidence.broken.length && a.risk !== 'missed')
      .slice(0, 2)
    if (app.selected === sel) app.backups[t.toIndex] = alts.length ? alts : 'none'
  } catch {
    if (app.selected === sel) delete app.backups[t.toIndex]
  }
}

/** "I'm here now": plan from the current position, right now, to the same destination. */
export async function replanFromHere() {
  app.from = null
  app.timeMode = 'now'
  app.view = 'search'
  await search()
}
