import type { Leg } from './types'
import { isTransit } from '../realtime'
import { isRail } from '../lines'
import { load, save } from '../storage'

/**
 * Official DB Timetables API (DB API Marketplace): planned and changed times,
 * platforms and cancellations for trains at DB stations. Credentials are typed
 * into Settings and kept only in this browser; the API allows browser calls (CORS).
 *
 * Fail-safe by design: any error or ambiguous match returns null and the app keeps
 * the Transitous data. A DB value is only used when station, train number and
 * planned minute all match.
 */
export interface DbCheck {
  delayMin: number | null
  when: Date | null
  platform?: string
  plannedPlatform?: string
  cancelled: boolean
  remarks: string[]
}

export interface DbCreds { clientId: string; apiKey: string }

const BASE = 'https://apis.deutschebahn.com/db-api-marketplace/apis/timetables/v1'
let creds = load<DbCreds | null>('ontrack.db', null)
let status: 'off' | 'ok' | 'error' = creds ? 'ok' : 'off'
let lastError = ''

export const dbCreds = () => creds
export const dbStatus = () => ({ status, lastError })

export function setDbCreds(c: DbCreds | null) {
  creds = c && c.clientId.trim() && c.apiKey.trim() ? { clientId: c.clientId.trim(), apiKey: c.apiKey.trim() } : null
  save('ontrack.db', creds)
  status = creds ? 'ok' : 'off'
  lastError = ''
}

async function get(path: string, ms = 6000): Promise<string> {
  if (!creds) throw new Error('No DB credentials')
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), ms)
  try {
    const res = await fetch(BASE + path, { signal: ctrl.signal, headers: { 'DB-Client-Id': creds.clientId, 'DB-Api-Key': creds.apiKey, Accept: 'application/xml' } })
    const text = await res.text()
    if (!res.ok) {
      const msg = text.match(/<moreInformation>([^<]*)/)?.[1] ?? text.match(/"moreInformation":"([^"]*)/)?.[1] ?? ''
      throw new Error(`DB ${res.status}${msg ? `: ${msg}` : ''}`)
    }
    return text
  } finally {
    clearTimeout(timer)
  }
}

/** Throws with DB's message ("Not registered to plan", "Invalid client id") if the setup is wrong. */
export async function testDbCreds(): Promise<string> {
  const xml = await get('/station/8000044')
  const name = parseStations(xml)[0]?.name
  if (!name) throw new Error('Unexpected response from DB')
  return name
}

// --- XML (tiny, regex-based so it runs in tests without a DOM) ---

const attrs = (s: string) => Object.fromEntries([...s.matchAll(/([\w-]+)="([^"]*)"/g)].map(m => [m[1], m[2]]))

export function parseStations(xml: string) {
  return [...xml.matchAll(/<station\b([^>]*)\/?>/g)].map(m => attrs(m[1]) as { name: string; eva: string })
}

export interface DbStop {
  id: string
  tl: Record<string, string>
  ar?: Record<string, string>
  dp?: Record<string, string>
  messages: Record<string, string>[]
}

export function parseStops(xml: string): DbStop[] {
  return [...xml.matchAll(/<s\b([^>]*?)(\/>|>([\s\S]*?)<\/s>)/g)].map(m => {
    const body = m[3] ?? ''
    const el = (tag: string) => {
      const x = body.match(new RegExp(`<${tag}\\b([^>]*?)(/>|>([\\s\\S]*?)</${tag}>)`))
      return x ? { a: attrs(x[1]), inner: x[3] ?? '' } : undefined
    }
    const ar = el('ar'), dp = el('dp')
    const messages = [...body.matchAll(/<m\b([^>]*)\/?>/g)].map(x => attrs(x[1]))
    return { id: attrs(m[1]).id, tl: el('tl')?.a ?? {}, ar: ar?.a, dp: dp?.a, messages }
  })
}

/** "2610301448" (yyMMddHHmm, Berlin) → Date */
export function parseDbTime(t: string | undefined): Date | null {
  if (!t || t.length !== 10) return null
  const [y, mo, d, h, mi] = [t.slice(0, 2), t.slice(2, 4), t.slice(4, 6), t.slice(6, 8), t.slice(8, 10)]
  return berlinToDate(2000 + +y, +mo, +d, +h, +mi)
}

function berlinToDate(y: number, mo: number, d: number, h: number, mi: number) {
  const guess = Date.UTC(y, mo - 1, d, h, mi)
  const offset = (dt: number) => {
    const p = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Berlin', hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).formatToParts(new Date(dt))
    const g = (k: string) => +p.find(x => x.type === k)!.value
    return Date.UTC(g('year'), g('month') - 1, g('day'), g('hour'), g('minute')) - dt
  }
  return new Date(guess - offset(guess - offset(guess)))
}

export function toDbTime(d: Date) {
  const p = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Berlin', hourCycle: 'h23', year: '2-digit', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).formatToParts(d)
  const g = (k: string) => p.find(x => x.type === k)!.value
  return `${g('year')}${g('month')}${g('day')}${g('hour')}${g('minute')}`
}

/** "RE5 (28520)" / tripShortName "028520" / "IC 1645" → "28520" / "1645" */
export function trainNumber(leg: Pick<Leg, 'tripShortName' | 'displayName'>) {
  const src = leg.displayName?.match(/\((\d+)\)/)?.[1] ?? leg.tripShortName?.match(/(\d+)\s*$/)?.[1] ?? leg.displayName?.match(/(\d+)\s*$/)?.[1]
  return src ? String(+src) : undefined
}

// --- Matching ---

/** DELFI names ("Bonn Beuel Bf") differ from DB's ("Bonn-Beuel"); try a few spellings. */
export function nameVariants(name: string) {
  const v = new Set([name])
  const noBf = name.replace(/\s+Bf$/, '')
  v.add(noBf)
  v.add(noBf.replace(/^(\S+)\s+/, '$1-'))
  v.add(name.replace(/\s+Hauptbahnhof$/, ' Hbf'))
  return [...v]
}

const evaCache = load<Record<string, string[]>>('ontrack.db.eva', {})
const cache = new Map<string, { at: number; p: Promise<DbStop[]> }>()

function cached(key: string, ttl: number, f: () => Promise<DbStop[]>) {
  const hit = cache.get(key)
  if (hit && Date.now() - hit.at < ttl) return hit.p
  const p = f().catch(e => { cache.delete(key); throw e })
  cache.set(key, { at: Date.now(), p })
  return p
}

async function candidateEvas(name: string): Promise<string[]> {
  if (evaCache[name]) return evaCache[name]
  const evas: string[] = []
  for (const v of nameVariants(name)) {
    const found = parseStations(await get(`/station/${encodeURIComponent(v)}`))
    for (const s of found.slice(0, 3)) if (!evas.includes(s.eva)) evas.push(s.eva)
    if (evas.length) break
  }
  evaCache[name] = evas
  save('ontrack.db.eva', evaCache)
  return evas
}

async function stopsAt(eva: string, planned: Date) {
  const ts = toDbTime(planned)
  const plan = await cached(`plan:${eva}:${ts.slice(0, 8)}`, 30 * 60000, async () => parseStops(await get(`/plan/${eva}/${ts.slice(0, 6)}/${ts.slice(6, 8)}`)))
  const changes = await cached(`fchg:${eva}`, 25000, async () => parseStops(await get(`/fchg/${eva}`)))
  return { plan, changes }
}

/** Cross-check one end of a rail leg ('dp' = departure, 'ar' = arrival) with DB. */
export async function checkRail(leg: Leg, which: 'dp' | 'ar'): Promise<DbCheck | null> {
  if (!creds || !isTransit(leg) || !isRail(leg.mode)) return null
  const nr = trainNumber(leg)
  const place = which === 'dp' ? leg.from : leg.to
  const scheduled = which === 'dp' ? place.scheduledDeparture ?? leg.scheduledStartTime : place.scheduledArrival ?? leg.scheduledEndTime
  if (!nr || !scheduled) return null
  const planned = new Date(scheduled)
  const pt = toDbTime(planned)
  try {
    for (const eva of await candidateEvas(place.name)) {
      const { plan, changes } = await stopsAt(eva, planned)
      const matches = plan.filter(s => s.tl.n === nr && s[which]?.pt === pt)
      if (matches.length !== 1) continue
      const s = matches[0]
      const ch = changes.find(c => c.id === s.id)?.[which] ?? {}
      const p = s[which]!
      const when = parseDbTime(ch.ct) ?? parseDbTime(p.pt)
      status = 'ok'
      return {
        delayMin: when ? Math.round((when.getTime() - planned.getTime()) / 60000) : null,
        when,
        platform: ch.cp ?? p.pp,
        plannedPlatform: p.pp,
        cancelled: ch.cs === 'c',
        remarks: [],
      }
    }
    return null
  } catch (e) {
    status = 'error'
    lastError = (e as Error).message
    return null
  }
}
