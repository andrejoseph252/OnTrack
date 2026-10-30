// Build public/data/vrs-quays.json from the VRS static GTFS stops.txt.
//
// The nationwide feed often gives internal quay numbers ("84", or the "78" placeholder
// at Bonn Hbf). VRS publishes the signposted names, keyed by the same DELFI global IDs:
//   de:05314:61101:4:14 → "Gleis U2", de:05314:65101:1:11 → "Bahnsteig B".
//
// Usage: node scripts/vrs-quays.mjs <path/to/stops.txt> [out.json]
// Source: https://download.vrs.de/gtfs/google_transit_goR.zip (Datenlizenz Deutschland Zero 2.0)
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'

const [, , input, out = 'public/data/vrs-quays.json'] = process.argv
if (!input) {
  console.error('usage: node scripts/vrs-quays.mjs <stops.txt> [out.json]')
  process.exit(1)
}

function parseCsv(text) {
  const rows = []
  let row = [], field = '', quoted = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++ }
      else if (c === '"') quoted = false
      else field += c
    } else if (c === '"') quoted = true
    else if (c === ',') { row.push(field); field = '' }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++
      row.push(field); field = ''
      if (row.length > 1 || row[0] !== '') rows.push(row)
      row = []
    } else field += c
  }
  if (field || row.length) { row.push(field); rows.push(row) }
  return rows
}

/** Only labels people see on signs; internal codes like "H.1" are skipped. */
const LABEL = /\(((?:Gleis|Bussteig|Bahnsteig|Steig|Perron)\s+[^()]+)\)\s*$/i

const [header, ...rows] = parseCsv(readFileSync(input, 'utf8').replace(/^﻿/, ''))
const col = Object.fromEntries(header.map((h, i) => [h, i]))
const quays = {}
for (const r of rows) {
  if (!['0', ''].includes(r[col.location_type])) continue
  const m = r[col.stop_name].match(LABEL)
  if (!m) continue
  quays[r[col.stop_id]] = [m[1].trim(), +(+r[col.stop_lat]).toFixed(6), +(+r[col.stop_lon]).toFixed(6)]
}

mkdirSync(dirname(out), { recursive: true })
writeFileSync(out, JSON.stringify({ source: 'VRS GTFS (dl-de/zero-2-0)', generated: new Date().toISOString().slice(0, 10), quays }))
console.log(`${Object.keys(quays).length} quays → ${out}`)
