import type { StopTime } from './api/types'
import { distance } from './geo'

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
