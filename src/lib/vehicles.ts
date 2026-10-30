import { decodePolyline, distance, bearing, type LngLat } from './geo'
import { checkTime } from './realtime'
import type { Mode } from './api/types'

/**
 * Vehicles on the map, positioned from live-adjusted timetables (not GPS): Transitous returns
 * each trip's stop-to-stop segments with real-time departure/arrival times, and a vehicle's
 * position is interpolated along the segment it is on right now.
 */
export interface Segment {
  trips: { tripId: string; displayName?: string }[]
  mode: Mode
  routeColor?: string
  departure: string
  arrival: string
  scheduledDeparture: string
  scheduledArrival: string
  realTime: boolean
  polyline: string
  from: { name: string }
  to: { name: string }
}

export interface Vehicle {
  tripId: string
  line: string
  mode: Mode
  color?: string
  at: LngLat
  bearing: number
  live: boolean
  /** Where it's heading next. */
  next: string
}

interface Prepared { seg: Segment; path: LngLat[]; cum: number[]; dep: number; arr: number; live: boolean }

/** Decode once and drop segments whose live data is implausible (ghost trips). */
export function prepare(segments: Segment[]): Map<string, Prepared[]> {
  const byTrip = new Map<string, Prepared[]>()
  for (const seg of segments) {
    const tripId = seg.trips[0]?.tripId
    if (!tripId || !seg.polyline) continue
    const t = checkTime(seg.departure, seg.scheduledDeparture, seg.realTime, seg.mode)
    if (t.status === 'unverified') continue
    const path = decodePolyline(seg.polyline, 5)
    if (path.length < 2) continue
    const cum = [0]
    for (let i = 1; i < path.length; i++) cum.push(cum[i - 1] + distance(path[i - 1], path[i]))
    const list = byTrip.get(tripId) ?? []
    list.push({ seg, path, cum, dep: new Date(seg.departure).getTime(), arr: new Date(seg.arrival).getTime(), live: seg.realTime })
    byTrip.set(tripId, list)
  }
  for (const list of byTrip.values()) list.sort((a, b) => a.dep - b.dep)
  return byTrip
}

function along(p: Prepared, f: number): { at: LngLat; bearing: number } {
  const total = p.cum[p.cum.length - 1]
  const d = Math.max(0, Math.min(1, f)) * total
  let i = 1
  while (i < p.cum.length - 1 && p.cum[i] < d) i++
  const a = p.path[i - 1], b = p.path[i]
  const span = p.cum[i] - p.cum[i - 1] || 1
  const k = (d - p.cum[i - 1]) / span
  return { at: [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k], bearing: bearing(a, b) }
}

/** Where every trip is at time `now`: moving along a segment, or waiting (≤ 2 min) at its next stop. */
export function positions(byTrip: Map<string, Prepared[]>, now: number): Vehicle[] {
  const out: Vehicle[] = []
  for (const [tripId, list] of byTrip) {
    let p = list.find(s => s.dep <= now && now < s.arr)
    let f = p ? (now - p.dep) / Math.max(1, p.arr - p.dep) : 0
    if (!p) {
      // Dwelling at a stop: about to depart on its next segment.
      const nextSeg = list.find(s => s.dep > now && s.dep - now < 120000)
      if (!nextSeg) continue
      p = nextSeg
      f = 0
    }
    const { at, bearing: b } = along(p, f)
    out.push({ tripId, line: p.seg.trips[0].displayName ?? '', mode: p.seg.mode, color: p.seg.routeColor, at, bearing: b, live: p.live, next: p.seg.to.name })
  }
  return out
}
