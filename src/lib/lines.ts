import type { Leg, Mode } from './api/types'

const MODE_COLOR: Partial<Record<Mode, string>> = {
  BUS: '#a5027d', TRAM: '#d10a11', SUBWAY: '#0a5ca8', METRO: '#0a5ca8', SUBURBAN: '#008d4f',
  REGIONAL_RAIL: '#6e7884', REGIONAL_FAST_RAIL: '#6e7884', HIGHSPEED_RAIL: '#ec0016', LONG_DISTANCE: '#ec0016',
  NIGHT_RAIL: '#282d5a', FERRY: '#0090c8', COACH: '#73d700',
}

export const MODE_LABEL: Partial<Record<Mode, string>> = {
  WALK: 'Walk', BUS: 'Bus', TRAM: 'Tram', SUBWAY: 'U-Bahn', METRO: 'U-Bahn', SUBURBAN: 'S-Bahn',
  REGIONAL_RAIL: 'Regional train', REGIONAL_FAST_RAIL: 'Regional express', HIGHSPEED_RAIL: 'ICE',
  LONG_DISTANCE: 'Long-distance train', NIGHT_RAIL: 'Night train', FERRY: 'Ferry', COACH: 'Coach',
}

const RAIL: Mode[] = ['RAIL', 'SUBURBAN', 'REGIONAL_RAIL', 'REGIONAL_FAST_RAIL', 'HIGHSPEED_RAIL', 'LONG_DISTANCE', 'NIGHT_RAIL']
export const isRail = (m: Mode) => RAIL.includes(m)

export function lineColors(leg: { routeColor?: string; routeTextColor?: string; mode: Mode }) {
  const bg = leg.routeColor && leg.routeColor !== '000000' && leg.routeColor !== 'FFFFFF' ? `#${leg.routeColor}` : MODE_COLOR[leg.mode] ?? '#4a5563'
  const fg = leg.routeColor && leg.routeTextColor ? `#${leg.routeTextColor}` : '#ffffff'
  return { bg, fg }
}

/** Rail: "IC 1645", "RB48" (route short names like "55" are internal); others: "602". */
export function lineName(leg: Pick<Leg, 'routeShortName' | 'displayName' | 'mode'>) {
  if (isRail(leg.mode) && leg.displayName) return leg.displayName.replace(/\s*\(\d+\)$/, '')
  return leg.routeShortName || leg.displayName || MODE_LABEL[leg.mode] || leg.mode
}

/** Signposted German platform: "4", "12a", "4 A-C", "101". Internal quay numbers like "78" at a 5-platform station are not. */
const SIGNPOSTED = /^(\d{1,2}[a-z]?|1\d\d)(\s+[A-G](\s*-\s*[A-G])?)?$/i
export const MAX_PLAUSIBLE_PLATFORM = 40

export function plausibleTrack(track: string | undefined) {
  if (!track) return false
  const m = track.trim().match(SIGNPOSTED)
  if (!m) return false
  const n = parseInt(m[1], 10)
  return n <= MAX_PLAUSIBLE_PLATFORM || n >= 100 // 100+ = S-Bahn/underground platforms at some hubs
}

/**
 * What to look for on the signs, or '' if the data can't be trusted.
 * Seen at Bonn Hbf: every departure (IC, RE, RB, even the underground tram)
 * carries track "78" and description "Bahnsteig Gleis 1", a placeholder.
 */
export function platformLabel(p: { track?: string; description?: string }, mode: Mode) {
  if (isRail(mode)) return plausibleTrack(p.track) ? `Platform ${p.track!.trim()}` : ''
  if (p.description && !/gleis/i.test(p.description)) return p.description
  return ''
}

export function quayRef(p: { track?: string }, mode: Mode) {
  return !isRail(mode) && p.track ? `stop point ${p.track}` : ''
}
