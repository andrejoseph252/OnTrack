import type { GeocodeMatch, Mode, PlanResponse, StopTimesResponse } from './types'

const BASE = 'https://api.transitous.org'

/** Bonn city centre; used to bias search results towards the home region. */
export const HOME_REGION = { lat: 50.7374, lon: 7.0982 }

async function get<T>(path: string, params: Record<string, string | number | boolean | undefined>, signal?: AbortSignal): Promise<T> {
  const url = new URL(path, BASE)
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== '') url.searchParams.set(k, String(v))
  const res = await fetch(url, { signal })
  if (!res.ok) throw new Error(`Transitous ${res.status}: ${(await res.text()).slice(0, 200)}`)
  return res.json() as Promise<T>
}

export function geocode(text: string, signal?: AbortSignal, near = HOME_REGION) {
  return get<GeocodeMatch[]>('/api/v1/geocode', {
    text,
    language: 'de',
    place: `${near.lat},${near.lon}`,
    placeBias: 1,
  }, signal)
}

export function reverseGeocode(lat: number, lon: number, signal?: AbortSignal) {
  return get<GeocodeMatch[]>('/api/v1/reverse-geocode', { place: `${lat},${lon}` }, signal)
}

/** Point to plan from/to: coordinates, or a stop id (routes from the exact stop). */
export type PlanPoint = { lat: number; lon: number } | { stopId: string }

export const placeParam = (p: PlanPoint) => ('stopId' in p ? p.stopId : `${p.lat},${p.lon}`)

export interface PlanOptions {
  from: PlanPoint
  to: PlanPoint
  time?: Date
  arriveBy?: boolean
  transitModes?: Mode[]
  maxTransfers?: number
  wheelchair?: boolean
  numItineraries?: number
  pageCursor?: string
  /** Extra buffer (minutes) added to every transfer. */
  additionalTransferTime?: number
  /** 'OFF' = timetable only, used when live data for a line is broken. */
  realtimeMode?: 'REALTIME' | 'OFF'
}

export function plan(o: PlanOptions, signal?: AbortSignal) {
  return get<PlanResponse>('/api/v5/plan', {
    fromPlace: placeParam(o.from),
    toPlace: placeParam(o.to),
    time: o.time?.toISOString(),
    arriveBy: o.arriveBy || undefined,
    transitModes: o.transitModes?.join(','),
    maxTransfers: o.maxTransfers,
    pedestrianProfile: o.wheelchair ? 'WHEELCHAIR' : undefined,
    useRoutedTransfers: o.wheelchair ? true : undefined,
    additionalTransferTime: o.additionalTransferTime,
    numItineraries: o.numItineraries ?? 5,
    // Walking-only routes default to a 30 min cap server-side; the app shows walks up to 45 min.
    maxDirectTime: 45 * 60,
    pageCursor: o.pageCursor,
    realtimeMode: o.realtimeMode === 'OFF' ? 'OFF' : undefined,
    language: 'de',
  }, signal)
}

/** Departures at a stop id, or at all quays within `radius` m of a position. */
export function stopTimes(at: { id?: string; lat?: number; lon?: number }, opts: { time?: Date; n?: number; radius?: number } = {}, signal?: AbortSignal) {
  return get<StopTimesResponse>('/api/v5/stoptimes', {
    ...(at.id ? { stopId: at.id } : { center: `${at.lat},${at.lon}`, radius: opts.radius ?? 120 }),
    n: opts.n ?? 20,
    time: opts.time?.toISOString(),
    language: 'de',
  }, signal)
}
