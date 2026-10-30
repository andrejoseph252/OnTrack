import type { Itinerary, Leg, Place, StopTime } from './api/types'
import { distance, encodePolyline, type LngLat } from './geo'
import { walkRoute } from './api/transitous'

/**
 * Tram replacement buses ("BE61" = Bus-Ersatz for tram 61) from the VRS timetable, built daily by
 * scripts/vrs-lines.mjs. The national timetable Transitous uses has been missing them (Oct 2026:
 * BE61 absent while the VRS timetable had 212 trips), so departure boards add them from here.
 */
interface RepFile {
  stops: [string, string, number, number][]
  days: Record<string, { line: string; name: string; headsign: string; stops: [number, string][] }[]>
}

let file: Promise<RepFile | null> | null = null
export function loadReplacements() {
  file ??= fetch('./data/replacements.json').then(r => (r.ok ? r.json() : null)).catch(() => { file = null; return null })
  return file
}

/** Today's date in Berlin as YYYYMMDD. */
export function berlinYmd(d = new Date()) {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Berlin' }).format(d).replace(/-/g, '')
}

/** "HH:MM" on a Berlin YYYYMMDD → Date (handles times past midnight like "24:15"). */
function at(ymd: string, hhmm: string) {
  const [h, m] = hhmm.split(':').map(Number)
  const base = new Date(`${ymd.slice(0, 4)}-${ymd.slice(4, 6)}-${ymd.slice(6, 8)}T00:00:00`)
  // Berlin offset for that day (the app runs in Germany; use the device's offset for that date).
  return new Date(base.getTime() + (h * 60 + m) * 60000)
}

/** Replacement-bus departures within `radius` m of a position in the next `minutes`, as StopTime rows. */
export async function replacementDepartures(lat: number, lon: number, minutes = 120, radius = 180): Promise<(StopTime & { replacement: true })[]> {
  const f = await loadReplacements()
  if (!f) return []
  const now = Date.now(), until = now + minutes * 60000
  const near = new Set(f.stops.map((s, i) => (distance([s[3], s[2]], [lon, lat]) <= radius ? i : -1)).filter(i => i >= 0))
  if (!near.size) return []
  const out: (StopTime & { replacement: true })[] = []
  // Today, plus yesterday's trips running past midnight.
  for (const ymd of [berlinYmd(new Date(now - 86400000)), berlinYmd()]) {
    for (const trip of f.days[ymd] ?? []) {
      trip.stops.forEach(([si, t], k) => {
        if (!near.has(si) || k === trip.stops.length - 1) return // not at the last stop (arrival only)
        const when = at(ymd, t)
        if (when.getTime() < now - 60000 || when.getTime() > until) return
        const s = f.stops[si]
        const iso = when.toISOString()
        out.push({
          replacement: true,
          place: { name: s[1], stopId: undefined, lat: s[2], lon: s[3], departure: iso, scheduledDeparture: iso },
          mode: 'BUS', realTime: false, headsign: trip.headsign, routeShortName: trip.name, displayName: trip.name,
          tripId: `rep:${trip.name}:${ymd}:${t}:${si}`, agencyName: 'Stadtwerke Bonn (replacement bus)',
        })
      })
    }
  }
  return out.sort((a, b) => a.place.departure!.localeCompare(b.place.departure!))
}

// ---- Route planning with replacement buses ----

/** Walking: straight-line distance × 1.3 for streets, at 1.25 m/s (refined with a real route later). */
const walkEstimate = (m: number) => Math.round((m * 1.3) / 1.25)
const MAX_WALK_M = 800

interface Candidate { name: string; headsign: string; ymd: string; stops: [number, string][]; i: number; j: number; dep: Date; arr: Date; walk1: number; walk2: number }

/**
 * Direct trips on a tram replacement bus ("BE61") from near `from` to near `to`: board within
 * ~10 min walk of the start, alight within ~10 min walk of the destination, on the same trip.
 * Returns ready-to-show itineraries (walk, bus, walk) from the VRS timetable.
 */
export async function replacementItineraries(
  from: { lat: number; lon: number }, to: { lat: number; lon: number },
  opts: { time?: Date; arriveBy?: boolean; color?: (tram: string) => string | undefined; max?: number } = {},
): Promise<Itinerary[]> {
  const f = await loadReplacements()
  if (!f) return []
  const t0 = (opts.time ?? new Date()).getTime()
  const distTo = (p: { lat: number; lon: number }) => f.stops.map(s => distance([s[3], s[2]], [p.lon, p.lat]))
  const dFrom = distTo(from), dTo = distTo(to)
  if (!dFrom.some(d => d <= MAX_WALK_M) || !dTo.some(d => d <= MAX_WALK_M)) return []

  const cands: Candidate[] = []
  const dayOf = (offset: number) => berlinYmd(new Date(t0 + offset * 86400000))
  for (const ymd of [dayOf(-1), dayOf(0)]) {
    for (const trip of f.days[ymd] ?? []) {
      let best: { i: number; j: number; cost: number } | null = null
      trip.stops.forEach(([si], i) => {
        if (dFrom[si] > MAX_WALK_M) return
        for (let j = i + 1; j < trip.stops.length; j++) {
          const sj = trip.stops[j][0]
          if (dTo[sj] > MAX_WALK_M) continue
          const cost = walkEstimate(dFrom[si]) + walkEstimate(dTo[sj])
          if (!best || cost < best.cost) best = { i, j, cost }
        }
      })
      if (!best) continue
      const { i, j } = best as { i: number; j: number }
      const dep = at(ymd, trip.stops[i][1]), arr = at(ymd, trip.stops[j][1])
      const walk1 = walkEstimate(dFrom[trip.stops[i][0]]), walk2 = walkEstimate(dTo[trip.stops[j][0]])
      const ok = opts.arriveBy ? arr.getTime() + walk2 * 1000 <= t0 : dep.getTime() - walk1 * 1000 >= t0 - 60000
      if (ok) cands.push({ name: trip.name, headsign: trip.headsign, ymd, stops: trip.stops, i, j, dep, arr, walk1, walk2 })
    }
  }
  cands.sort((a, b) => (opts.arriveBy ? b.dep.getTime() - a.dep.getTime() : a.arr.getTime() + a.walk2 * 1000 - (b.arr.getTime() + b.walk2 * 1000)))
  const chosen = cands.slice(0, opts.max ?? 3)

  // Real walking routes for the chosen boardings (cached per stop pair).
  const walkCache = new Map<string, Promise<Leg | null>>()
  const walk = (a: { lat: number; lon: number }, b: { lat: number; lon: number }) => {
    const k = `${a.lat},${a.lon}>${b.lat},${b.lon}`
    if (!walkCache.has(k)) walkCache.set(k, walkRoute(a, b).catch(() => null))
    return walkCache.get(k)!
  }

  return Promise.all(chosen.map(async c => {
    const s = (k: number) => f.stops[c.stops[k][0]]
    const board = s(c.i), alight = s(c.j)
    const [w1, w2] = await Promise.all([walk(from, { lat: board[2], lon: board[3] }), walk({ lat: alight[2], lon: alight[3] }, to)])
    const walk1 = w1?.duration ?? c.walk1, walk2 = w2?.duration ?? c.walk2
    const iso = (d: Date) => d.toISOString()
    const start = new Date(c.dep.getTime() - walk1 * 1000), end = new Date(c.arr.getTime() + walk2 * 1000)
    const place = (st: [string, string, number, number], t: Date, extra: Partial<Place> = {}): Place =>
      ({ name: st[1], lat: st[2], lon: st[3], departure: iso(t), scheduledDeparture: iso(t), arrival: iso(t), scheduledArrival: iso(t), ...extra })
    const path: LngLat[] = c.stops.slice(c.i, c.j + 1).map(([si]) => [f.stops[si][3], f.stops[si][2]])
    const tram = c.name.slice(2)
    const bus: Leg = {
      mode: 'BUS', routeShortName: c.name, displayName: c.name, headsign: c.headsign,
      routeColor: opts.color?.(tram)?.replace('#', ''),
      tripId: `rep:${c.name}:${c.ymd}:${c.stops[0][1]}:${c.stops[0][0]}`,
      from: place(board, c.dep), to: place(alight, c.arr),
      intermediateStops: c.stops.slice(c.i + 1, c.j).map(([si, t]) => place(f.stops[si], at(c.ymd, t))),
      startTime: iso(c.dep), endTime: iso(c.arr), scheduledStartTime: iso(c.dep), scheduledEndTime: iso(c.arr),
      duration: Math.round((c.arr.getTime() - c.dep.getTime()) / 1000), realTime: false, scheduled: true,
      legGeometry: { points: encodePolyline(path), precision: 6, length: path.length },
      agencyName: 'Stadtwerke Bonn (replacement bus, VRS timetable)',
    }
    const walkLeg = (w: Leg | null, a: Place, b: Place, secs: number, t: Date): Leg => ({
      ...(w ?? { legGeometry: { points: encodePolyline([[a.lon, a.lat], [b.lon, b.lat]]), precision: 6, length: 2 }, realTime: false, scheduled: true }),
      mode: 'WALK', from: { ...a, departure: iso(t) }, to: { ...b, arrival: iso(new Date(t.getTime() + secs * 1000)) },
      duration: secs, startTime: iso(t), endTime: iso(new Date(t.getTime() + secs * 1000)),
      scheduledStartTime: iso(t), scheduledEndTime: iso(new Date(t.getTime() + secs * 1000)), realTime: false, scheduled: true,
    } as Leg)
    const startPlace: Place = { name: 'START', lat: from.lat, lon: from.lon }
    const endPlace: Place = { name: 'END', lat: to.lat, lon: to.lon }
    const legs = [walkLeg(w1, startPlace, bus.from, walk1, start), bus, walkLeg(w2, bus.to, endPlace, walk2, c.arr)]
    return { legs, startTime: iso(start), endTime: iso(end), duration: Math.round((end.getTime() - start.getTime()) / 1000), transfers: 0 } satisfies Itinerary
  }))
}
