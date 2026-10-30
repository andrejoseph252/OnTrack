import type { Itinerary, Leg, Mode, StopTime } from './api/types'

/**
 * Real-time sanity checks.
 *
 * The free nationwide GTFS-RT feed sometimes matches live data to the wrong
 * trip, e.g. a Bonn tram reported at +137 min, or the same departure listed
 * twice with one copy 4 min early. We never show such values as fact. Times
 * are classified so the UI can label them honestly.
 */
export type TimeStatus = 'live' | 'scheduled' | 'unverified' | 'cancelled'

export interface CheckedTime {
  /** Best estimate of the actual time (the one routing used). */
  time: Date
  planned: Date
  delayMin: number
  status: TimeStatus
  reason?: string
  /** Set when the value comes from DB's own data rather than the free feed. */
  source?: 'db'
}

/** An authoritative time for one end of a leg (DB Timetables), keyed by tripId. */
export interface Authoritative {
  when: Date | null
  cancelled: boolean
}
export const authoritative = new Map<string, { dp?: Authoritative | null; ar?: Authoritative | null }>()

function applyAuthority(c: CheckedTime, a: Authoritative | null | undefined): CheckedTime {
  if (!a) return c
  if (a.cancelled) return { ...c, status: 'cancelled', reason: undefined, source: 'db' }
  if (!a.when) return c
  return { time: a.when, planned: c.planned, delayMin: Math.round((a.when.getTime() - c.planned.getTime()) / 60000), status: 'live', source: 'db' }
}

const LOCAL_MODES: Mode[] = ['BUS', 'TRAM', 'SUBWAY', 'METRO', 'FERRY', 'FUNICULAR', 'AERIAL_LIFT', 'CABLE_CAR', 'ODM']

/** Largest plausible delay per mode family, in minutes. Beyond this we assume bad trip matching. */
export const MAX_PLAUSIBLE_DELAY = { local: 45, rail: 360 }
/** Vehicles rarely leave more than this many minutes early; more means bad matching. */
export const MAX_PLAUSIBLE_EARLY = 3

export function isLocal(mode: Mode) {
  return LOCAL_MODES.includes(mode)
}

export function checkTime(
  live: string | undefined,
  scheduled: string | undefined,
  realTime: boolean,
  mode: Mode,
  cancelled = false,
): CheckedTime {
  const planned = new Date(scheduled ?? live ?? 0)
  const time = new Date(live ?? scheduled ?? 0)
  const delayMin = Math.round((time.getTime() - planned.getTime()) / 60000)

  if (cancelled) return { time, planned, delayMin, status: 'cancelled' }
  if (!realTime && delayMin === 0) return { time: planned, planned, delayMin: 0, status: 'scheduled' }
  // Not live, yet shifted: a delay carried forward from an earlier update, possibly stale.
  // Routing used the shifted time, so show it, but never as confirmed live data.
  if (!realTime) {
    return { time, planned, delayMin, status: 'unverified', reason: `Estimated ${delayMin > 0 ? '+' : ''}${delayMin} min from earlier live data; no current update.` }
  }

  const max = isLocal(mode) ? MAX_PLAUSIBLE_DELAY.local : MAX_PLAUSIBLE_DELAY.rail
  if (delayMin > max) {
    return { time, planned, delayMin, status: 'unverified', reason: `Live feed reports +${delayMin} min, which looks like a data error. Time is approximate.` }
  }
  if (delayMin < -MAX_PLAUSIBLE_EARLY) {
    return { time, planned, delayMin, status: 'unverified', reason: `Live feed reports ${-delayMin} min early, which is unusual. Be there by the planned time.` }
  }
  return { time, planned, delayMin, status: 'live' }
}

export interface CheckedLeg {
  dep: CheckedTime
  arr: CheckedTime
  /** Live data is self-contradictory (e.g. a ghost trip); the leg should not be offered. */
  broken?: string
}

/** A local bus or tram this late is almost always a stale or mismatched vehicle. */
export const GHOST_DELAY_LOCAL = 90

export function checkLeg(leg: Leg): CheckedLeg {
  // DB's own data, when matched, replaces the free feed for this leg entirely.
  const auth = leg.tripId ? authoritative.get(leg.tripId) : undefined
  if (auth && (auth.dp?.when || auth.dp?.cancelled)) {
    const base = checkLegFromFeed(leg)
    const dep = applyAuthority(base.dep, auth.dp)
    let arr = applyAuthority(base.arr, auth.ar)
    if (arr.source !== 'db' && dep.source === 'db') {
      // No DB arrival: carry DB's departure delay over the timetabled ride.
      const ride = base.arr.planned.getTime() - base.dep.planned.getTime()
      arr = { ...arr, time: new Date(dep.time.getTime() + ride), delayMin: dep.delayMin, status: dep.status === 'cancelled' ? 'cancelled' : 'unverified', reason: 'Arrival estimated from DB departure delay.' }
    }
    return { dep, arr }
  }
  return checkLegFromFeed(leg)
}

function checkLegFromFeed(leg: Leg): CheckedLeg {
  const cancelled = !!(leg.cancelled || leg.from.cancelled || leg.to.cancelled)
  const dep = checkTime(leg.from.departure ?? leg.startTime, leg.from.scheduledDeparture ?? leg.scheduledStartTime, leg.realTime, leg.mode, cancelled)
  const arr = checkTime(leg.to.arrival ?? leg.endTime, leg.to.scheduledArrival ?? leg.scheduledEndTime, leg.realTime, leg.mode, cancelled)
  // For "early" departures, the safe instruction is the planned time, so
  // being on the platform at the earlier of the two is what matters.
  if (dep.status === 'unverified' && dep.delayMin < 0) dep.time = new Date(Math.min(dep.time.getTime(), dep.planned.getTime()))

  // A live ride far shorter than the timetabled one (seen: Ramersdorf → Hbf in
  // 0 min) means the arrival is wrong. Estimate it from the timetabled ride time.
  const plannedRide = arr.planned.getTime() - dep.planned.getTime()
  const liveRide = arr.time.getTime() - dep.time.getTime()
  let broken: string | undefined
  const shifted = dep.time.getTime() !== dep.planned.getTime() || arr.time.getTime() !== arr.planned.getTime()
  if (isTransit(leg) && !cancelled && shifted && plannedRide >= 3 * 60000 && liveRide < plannedRide * 0.5) {
    arr.time = new Date(dep.time.getTime() + plannedRide)
    arr.delayMin = Math.round((arr.time.getTime() - arr.planned.getTime()) / 60000)
    arr.status = 'unverified'
    arr.reason = `Live ride time (${Math.round(liveRide / 60000)} min) is impossible; arrival estimated from the ${Math.round(plannedRide / 60000)} min timetable ride.`
    broken = `${leg.routeShortName ?? 'This vehicle'}: live data shows a ${Math.round(liveRide / 60000)} min ride for a ${Math.round(plannedRide / 60000)} min trip, so it is probably a stale or ghost trip.`
  }
  if (isTransit(leg) && !cancelled && isLocal(leg.mode) && dep.delayMin > GHOST_DELAY_LOCAL) {
    broken ??= `${leg.routeShortName ?? 'This vehicle'}: reported ${dep.delayMin} min late, which almost always means bad live data for this trip.`
  }
  return { dep, arr, broken }
}

export interface Confidence {
  transitLegs: number
  live: number
  scheduled: number
  unverified: number
  cancelled: number
  /** Reasons for legs whose live data contradicts itself. */
  broken: string[]
}

export function itineraryConfidence(it: Itinerary): Confidence {
  const c: Confidence = { transitLegs: 0, live: 0, scheduled: 0, unverified: 0, cancelled: 0, broken: [] }
  for (const leg of it.legs) {
    if (!isTransit(leg)) continue
    c.transitLegs++
    const { dep, arr, broken } = checkLeg(leg)
    if (broken) c.broken.push(broken)
    const worst = [dep.status, arr.status].includes('cancelled') ? 'cancelled'
      : [dep.status, arr.status].includes('unverified') ? 'unverified'
      : dep.status
    c[worst]++
  }
  return c
}

export function isTransit(leg: Leg) {
  return !['WALK', 'BIKE', 'CAR'].includes(leg.mode)
}

/**
 * Departure boards: drop duplicates caused by bad matching. The same line and
 * headsign at the same minute is kept once, preferring the most plausible copy.
 */
export function dedupeStopTimes(list: StopTime[]): StopTime[] {
  const best = new Map<string, { st: StopTime; score: number }>()
  const order: string[] = []
  for (const st of list) {
    const c = checkTime(st.place.departure, st.place.scheduledDeparture, st.realTime, st.mode, st.cancelled)
    const key = `${st.routeShortName}|${st.headsign}|${Math.round(c.time.getTime() / 60000)}`
    const score = (c.status === 'unverified' ? 1000 : 0) + Math.abs(c.delayMin)
    const prev = best.get(key)
    if (!prev) order.push(key)
    if (!prev || score < prev.score) best.set(key, { st, score })
  }
  return order.map(k => best.get(k)!.st)
}
