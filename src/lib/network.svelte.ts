import { decodePolyline, type LngLat } from './geo'
import { readableOn } from './lines'

/** Route maps for every line serving Bonn / Rhein-Sieg, built by scripts/vrs-lines.mjs. */
export interface LinePattern {
  dir: number
  headsign: string
  shape: string
  stops: number[]
  /** Shape is only straight hops between stops; draw dashed. */
  approx?: boolean
}
export interface Line {
  id: string
  name: string
  type: 'tram' | 'bus' | 'rail' | 'ferry'
  color: string | null
  text: string
  operator: string
  desc: string
  patterns: LinePattern[]
}
/** [DELFI parent id, name, lat, lon] */
export type NetStop = [string, string, number, number]

export const net = $state({
  lines: [] as Line[],
  stops: [] as NetStop[],
  /** Tram line ("61") → days (YYYYMMDD, Berlin) when replacement buses ("BE61") run. */
  replacements: {} as Record<string, string[]>,
  status: 'idle' as 'idle' | 'loading' | 'ready' | 'error',
})

let loading: Promise<void> | null = null

export function loadNetwork() {
  loading ??= (async () => {
    net.status = 'loading'
    try {
      const r = await fetch('./data/lines.json')
      if (!r.ok) throw new Error(String(r.status))
      const d = await r.json()
      net.lines = d.lines
      net.stops = d.stops
      net.replacements = d.replacements ?? {}
      net.status = 'ready'
    } catch {
      net.status = 'error'
      loading = null
    }
  })()
  return loading
}

const FALLBACK: Record<Line['type'], string> = { tram: 'd10a11', bus: '7a3e9d', rail: '6e7884', ferry: '0090c8' }

export const lineColor = (l: Line) => `#${l.color ?? FALLBACK[l.type]}`
export const lineText = (l: Line) => readableOn(lineColor(l))
export const lineKey = (l: Line) => `${l.name}|${l.type}`
/** Rail replacement buses carry the train's name (e.g. "RB26"); mark them. */
export const isReplacement = (l: Line) => /SEV/.test(l.operator) || /^BE\d+$/.test(l.name)
/** Tram replacement buses ("BE61" = Bus-Ersatz for tram 61). */
export const isTramReplacement = (l: Line) => /^BE\d+$/.test(l.name)
/** Bonn's own city network, drawn prominently on the network map. */
export const isCity = (l: Line) => /Stadtwerke Bonn/.test(l.operator) || l.type === 'tram'

const shapeCache = new Map<string, LngLat[]>()
export function patternPath(p: LinePattern): LngLat[] {
  let s = shapeCache.get(p.shape)
  if (!s) shapeCache.set(p.shape, (s = decodePolyline(p.shape, 5)))
  return s
}

/** Find the network line for a leg or departure ("606" bus, "62" tram). */
export function findLine(name: string | undefined, mode: string): Line | undefined {
  if (!name) return undefined
  const type: Line['type'] = mode === 'BUS' || mode === 'COACH' ? 'bus' : mode === 'TRAM' || mode === 'SUBWAY' || mode === 'METRO' ? 'tram' : mode === 'FERRY' ? 'ferry' : 'rail'
  return net.lines.find(l => l.name === name && l.type === type && !isReplacement(l)) ?? net.lines.find(l => l.name === name && l.type === type)
}

/** The replacement-bus line ("BE61") if tram `line` is (partly) replaced by buses today. */
export function replacedToday(line: string | undefined): Line | undefined {
  if (!line) return undefined
  const today = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Berlin' }).format(new Date()).replace(/-/g, '')
  if (!net.replacements[line]?.includes(today)) return undefined
  return net.lines.find(l => l.name === `BE${line}`)
}

/** "Kopenhagener Str. ↔ Stadthaus" for a replacement line, from its two directions. */
export function replacementSpan(l: Line) {
  const p = l.patterns
  return p.length > 1 ? `${p[1].headsign} ↔ ${p[0].headsign}` : p[0]?.headsign ?? ''
}
