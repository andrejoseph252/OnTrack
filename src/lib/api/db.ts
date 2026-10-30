import type { Leg } from './types'
import { isTransit } from '../realtime'

/**
 * Optional cross-check against DB's own data (what DB Navigator shows), via a
 * db-rest compatible server (https://github.com/derhuerst/db-rest).
 *
 * Fail-safe by design: any error, timeout or ambiguous match returns null and
 * the app keeps the Transitous data. A DB value is only used when the line,
 * the stop and the planned minute all match exactly.
 */
export interface DbCheck {
  delayMin: number | null
  when: Date | null
  platform?: string
  plannedPlatform?: string
  cancelled: boolean
  remarks: string[]
}

let endpoint = 'https://v6.db.transport.rest'
let available: boolean | null = null

export function setDbEndpoint(url: string) {
  endpoint = url.replace(/\/$/, '')
  available = null
}
export const dbStatus = () => available

async function get<T>(path: string, ms = 5000): Promise<T> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), ms)
  try {
    const res = await fetch(endpoint + path, { signal: ctrl.signal })
    if (!res.ok) throw new Error(`db-rest ${res.status}`)
    return (await res.json()) as T
  } finally {
    clearTimeout(timer)
  }
}

interface DbStop { type: string; id: string; name: string }
interface DbDeparture {
  when: string | null
  plannedWhen: string
  delay: number | null
  platform: string | null
  plannedPlatform: string | null
  cancelled?: boolean
  line?: { name?: string }
  remarks?: { type: string; text?: string; summary?: string }[]
}

const stopIds = new Map<string, Promise<string | null>>()

function dbStopId(name: string) {
  if (!stopIds.has(name)) {
    stopIds.set(name, get<DbStop[]>(`/locations?query=${encodeURIComponent(name)}&results=1&addresses=false&poi=false`)
      .then(r => (r[0]?.type === 'stop' || r[0]?.type === 'station') && sameStop(r[0].name, name) ? r[0].id : null)
      .catch(() => null))
  }
  return stopIds.get(name)!
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9äöüß]/g, '')
const sameStop = (a: string, b: string) => norm(a) === norm(b)

/** "Bus 602" → "602", "STR 66" → "66", "RB 27" → "rb27", "S 23" → "s23" */
export function lineKey(name: string) {
  const n = name.replace(/^(bus|str|tram|u|stb|ast)\s+/i, '')
  return norm(n)
}

export async function checkDeparture(leg: Leg): Promise<DbCheck | null> {
  if (available === false || !isTransit(leg) || !leg.routeShortName) return null
  try {
    const id = await dbStopId(leg.from.name)
    if (!id) return null
    const planned = new Date(leg.from.scheduledDeparture ?? leg.scheduledStartTime)
    const when = new Date(planned.getTime() - 5 * 60000).toISOString()
    const r = await get<{ departures: DbDeparture[] } | DbDeparture[]>(`/stops/${id}/departures?when=${encodeURIComponent(when)}&duration=20&results=60&remarks=true`)
    available = true
    const list = Array.isArray(r) ? r : r.departures
    const want = lineKey(leg.routeShortName)
    const matches = list.filter(d =>
      d.line?.name && lineKey(d.line.name) === want &&
      Math.abs(new Date(d.plannedWhen).getTime() - planned.getTime()) < 60000)
    if (matches.length !== 1) return null
    const d = matches[0]
    return {
      delayMin: d.delay == null ? null : Math.round(d.delay / 60),
      when: d.when ? new Date(d.when) : null,
      platform: d.platform ?? undefined,
      plannedPlatform: d.plannedPlatform ?? undefined,
      cancelled: !!d.cancelled,
      remarks: (d.remarks ?? []).filter(x => x.type === 'warning' || x.type === 'status').map(x => x.summary || x.text || '').filter(Boolean),
    }
  } catch {
    if (available === null) available = false
    return null
  }
}
