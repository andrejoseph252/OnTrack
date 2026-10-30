// Build public/data/lines.json (route maps for every line serving Bonn / Rhein-Sieg)
// from the extracted VRS static GTFS directory.
//
// Per line and direction we keep one representative pattern: the longest shape among
// those that run regularly (≥ 20% of the busiest variant's trips), so short workings
// don't hide the full route. Plus its ordered stops and a simplified polyline (~6 m).
//
// Usage: node scripts/vrs-lines.mjs <gtfs-dir> [out.json]
// Source: https://download.vrs.de/gtfs/google_transit_goR.zip (Datenlizenz Deutschland Zero 2.0)
import { createReadStream, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { createInterface } from 'node:readline'
import { dirname, join } from 'node:path'

const [, , dir, out = 'public/data/lines.json'] = process.argv
if (!dir) {
  console.error('usage: node scripts/vrs-lines.mjs <gtfs-dir> [out.json]')
  process.exit(1)
}

/** Areas served: Bonn (05314) and Rhein-Sieg-Kreis (05382). */
const AREA = /^de:(05314|05382):/
const TYPES = { 0: 'tram', 1: 'tram', 2: 'rail', 3: 'bus', 4: 'ferry', 700: 'bus', 900: 'tram' }

function splitCsvLine(line) {
  const out = []
  let field = '', quoted = false
  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    if (quoted) {
      if (c === '"' && line[i + 1] === '"') { field += '"'; i++ }
      else if (c === '"') quoted = false
      else field += c
    } else if (c === '"') quoted = true
    else if (c === ',') { out.push(field); field = '' }
    else field += c
  }
  out.push(field)
  return out
}

/** Stream a GTFS file row by row as objects (stop_times.txt is ~400 MB). */
async function eachRow(file, fn) {
  const rl = createInterface({ input: createReadStream(join(dir, file)), crlfDelay: Infinity })
  let header
  for await (const raw of rl) {
    const line = header ? raw : raw.replace(/^\uFEFF/, '')
    if (!line) continue
    const cells = splitCsvLine(line)
    if (!header) { header = cells; continue }
    const row = {}
    header.forEach((h, i) => (row[h] = cells[i]))
    fn(row)
  }
}

function readSmall(file) {
  const rows = []
  const [h, ...lines] = readFileSync(join(dir, file), 'utf8').replace(/^\uFEFF/, '').split(/\r?\n/).filter(Boolean)
  const header = splitCsvLine(h)
  for (const l of lines) {
    const c = splitCsvLine(l)
    rows.push(Object.fromEntries(header.map((k, i) => [k, c[i]])))
  }
  return rows
}

// --- polyline helpers ---
function simplify(pts, tolMetres) {
  if (pts.length < 3) return pts
  const k = 111320, cos = Math.cos((pts[0][0] * Math.PI) / 180)
  const xy = pts.map(([lat, lon]) => [lon * k * cos, lat * k])
  const keep = new Uint8Array(pts.length)
  keep[0] = keep[pts.length - 1] = 1
  const stack = [[0, pts.length - 1]]
  while (stack.length) {
    const [a, b] = stack.pop()
    let max = 0, idx = -1
    const [ax, ay] = xy[a], [bx, by] = xy[b]
    const dx = bx - ax, dy = by - ay, len = Math.hypot(dx, dy) || 1
    for (let i = a + 1; i < b; i++) {
      const d = Math.abs(dy * xy[i][0] - dx * xy[i][1] + bx * ay - by * ax) / len
      if (d > max) { max = d; idx = i }
    }
    if (max > tolMetres) { keep[idx] = 1; stack.push([a, idx], [idx, b]) }
  }
  return pts.filter((_, i) => keep[i])
}

function encode(pts, precision = 5) {
  const f = 10 ** precision
  let out = '', plat = 0, plon = 0
  const enc = v => {
    v = v < 0 ? ~(v << 1) : v << 1
    let s = ''
    while (v >= 0x20) { s += String.fromCharCode((0x20 | (v & 0x1f)) + 63); v >>= 5 }
    return s + String.fromCharCode(v + 63)
  }
  for (const [lat, lon] of pts) {
    const la = Math.round(lat * f), lo = Math.round(lon * f)
    out += enc(la - plat) + enc(lo - plon)
    plat = la; plon = lo
  }
  return out
}

// --- 1. routes ---
const agencies = Object.fromEntries(readSmall('agency.txt').map(a => [a.agency_id, a.agency_name.replace(/^\S+\s+/, '')]))
const routes = new Map()
for (const r of readSmall('routes.txt')) {
  const type = TYPES[r.route_type]
  if (!type) continue
  // Skip depot/special services without a public description (e.g. "BE62", "E").
  if (!r.route_desc && /^(BE|E$)/.test(r.route_short_name)) continue
  routes.set(r.route_id, r)
}

// --- 2. trips: count shape usage per route+direction ---
const tripInfo = new Map() // trip_id -> key
const shapeCount = new Map() // key -> Map(shape -> {n, trip, headsign})
await eachRow('trips.txt', t => {
  if (!routes.has(t.route_id) || !t.shape_id) return
  const key = `${t.route_id}|${t.direction_id || 0}`
  const m = shapeCount.get(key) ?? new Map()
  const e = m.get(t.shape_id) ?? { n: 0, trip: t.trip_id, headsign: t.trip_headsign }
  e.n++
  m.set(t.shape_id, e)
  shapeCount.set(key, m)
})
const candidates = new Map() // trip_id -> {key, shape, headsign, n}
for (const [key, m] of shapeCount) {
  const top = [...m].sort((a, b) => b[1].n - a[1].n)
  const maxN = top[0][1].n
  for (const [shape, e] of top.slice(0, 6)) if (e.n >= maxN * 0.2) candidates.set(e.trip, { key, shape, headsign: e.headsign, n: e.n })
}

// --- 3. stop_times for representative trips only ---
const tripStops = new Map()
await eachRow('stop_times.txt', st => {
  if (!candidates.has(st.trip_id)) return
  const a = tripStops.get(st.trip_id) ?? []
  a.push([+st.stop_sequence, st.stop_id])
  tripStops.set(st.trip_id, a)
})

// Longest regular variant per line+direction.
const reps = new Map()
const best = new Map()
for (const [trip, c] of candidates) {
  const len = tripStops.get(trip)?.length ?? 0
  const cur = best.get(c.key)
  if (!cur || len > cur.len || (len === cur.len && c.n > cur.n)) best.set(c.key, { trip, len, n: c.n })
}
for (const { trip } of best.values()) reps.set(trip, candidates.get(trip))

// Keep lines with at least one stop in the area.
const wantedShapes = new Set()
for (const [trip, rep] of reps) {
  const stops = tripStops.get(trip)
  if (stops?.some(([, id]) => AREA.test(id))) wantedShapes.add(rep.shape)
  else reps.delete(trip)
}

// --- 4. shapes ---
const shapes = new Map()
await eachRow('shapes.txt', p => {
  if (!wantedShapes.has(p.shape_id)) return
  const a = shapes.get(p.shape_id) ?? []
  a.push([+p.shape_pt_sequence, +p.shape_pt_lat, +p.shape_pt_lon])
  shapes.set(p.shape_id, a)
})

// --- 5. stops (display name = parent station) ---
const allStops = new Map(readSmall('stops.txt').map(s => [s.stop_id, s]))
const stopIndex = new Map()
const stopsOut = []
function stopRef(quayId) {
  const q = allStops.get(quayId)
  if (!q) return -1
  const parentId = q.parent_station || q.stop_id
  if (!stopIndex.has(parentId)) {
    const p = allStops.get(parentId) ?? q
    stopIndex.set(parentId, stopsOut.length)
    stopsOut.push([parentId, p.stop_name, +(+p.stop_lat).toFixed(5), +(+p.stop_lon).toFixed(5)])
  }
  return stopIndex.get(parentId)
}

// --- 6. assemble ---
const lines = new Map()
for (const [trip, rep] of reps) {
  const [routeId, dirId] = rep.key.split('|')
  const r = routes.get(routeId)
  const pts = (shapes.get(rep.shape) ?? []).sort((a, b) => a[0] - b[0]).map(([, la, lo]) => [la, lo])
  const stops = tripStops.get(trip).sort((a, b) => a[0] - b[0]).map(([, id]) => stopRef(id)).filter(i => i >= 0)
  if (pts.length < 2 || stops.length < 2) continue
  // KVB and SWB both list e.g. tram 16; one line per name and type.
  const lineKey = `${r.route_short_name}|${TYPES[r.route_type]}`
  const line = lines.get(lineKey) ?? {
    id: routeId,
    name: r.route_short_name,
    type: TYPES[r.route_type],
    color: r.route_color && r.route_color !== '000000' ? r.route_color : null,
    text: r.route_text_color || 'FFFFFF',
    operator: agencies[r.agency_id] ?? '',
    desc: (r.route_desc.match(/H:\s*([^|]+)/)?.[1] ?? r.route_long_name ?? '').trim(),
    patterns: [],
  }
  // Some shapes are straight stop-to-stop hops (express and replacement buses): flag as approximate.
  const approx = TYPES[r.route_type] !== 'rail' && pts.some((p, i) => i > 0 && Math.hypot((p[0] - pts[i - 1][0]) * 111, (p[1] - pts[i - 1][1]) * 70) > 3)
  line.patterns.push({ dir: +dirId, headsign: rep.headsign, shape: encode(simplify(pts, 6)), stops, ...(approx ? { approx: true } : {}) })
  if (!line.color && r.route_color && r.route_color !== '000000') line.color = r.route_color
  if (!line.desc && r.route_desc) line.desc = (r.route_desc.match(/H:\s*([^|]+)/)?.[1] ?? '').trim()
  lines.set(lineKey, line)
}

// After merging, keep the longest pattern per direction.
for (const l of lines.values()) {
  const byDir = new Map()
  for (const p of l.patterns) if (!byDir.has(p.dir) || p.stops.length > byDir.get(p.dir).stops.length) byDir.set(p.dir, p)
  l.patterns = [...byDir.values()]
}

const typeOrder = { tram: 0, bus: 1, rail: 2, ferry: 3 }
const natural = (a, b) => a.localeCompare(b, 'de', { numeric: true })
const sorted = [...lines.values()]
  .map(l => ({ ...l, patterns: l.patterns.sort((a, b) => a.dir - b.dir) }))
  .sort((a, b) => typeOrder[a.type] - typeOrder[b.type] || natural(a.name, b.name) || natural(a.operator, b.operator))

mkdirSync(dirname(out), { recursive: true })
writeFileSync(out, JSON.stringify({ source: 'VRS GTFS (dl-de/zero-2-0)', generated: new Date().toISOString().slice(0, 10), lines: sorted, stops: stopsOut }))
console.log(`${sorted.length} lines, ${stopsOut.length} stops → ${out}`)
