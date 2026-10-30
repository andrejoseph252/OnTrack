export type LngLat = [number, number]

/** Decode a Google-style encoded polyline with the given precision into [lon, lat] pairs. */
export function decodePolyline(str: string, precision = 6): LngLat[] {
  const factor = 10 ** precision
  const out: LngLat[] = []
  let lat = 0, lon = 0, i = 0
  while (i < str.length) {
    for (const which of [0, 1]) {
      let shift = 0, result = 0, b: number
      do {
        b = str.charCodeAt(i++) - 63
        result |= (b & 0x1f) << shift
        shift += 5
      } while (b >= 0x20)
      const delta = result & 1 ? ~(result >> 1) : result >> 1
      if (which === 0) lat += delta
      else lon += delta
    }
    out.push([lon / factor, lat / factor])
  }
  return out
}

const R = 6371008.8
const rad = (d: number) => (d * Math.PI) / 180

export function distance(a: LngLat, b: LngLat) {
  const dLat = rad(b[1] - a[1]), dLon = rad(b[0] - a[0])
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a[1])) * Math.cos(rad(b[1])) * Math.sin(dLon / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}

/** Initial compass bearing from a to b, degrees 0–360 (0 = north). */
export function bearing(a: LngLat, b: LngLat) {
  const y = Math.sin(rad(b[0] - a[0])) * Math.cos(rad(b[1]))
  const x = Math.cos(rad(a[1])) * Math.sin(rad(b[1])) - Math.sin(rad(a[1])) * Math.cos(rad(b[1])) * Math.cos(rad(b[0] - a[0]))
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360
}

/** Bearing of the path over its first `metres`, which smooths out a kink right at the stop. */
export function headingAlong(path: LngLat[], metres = 60) {
  if (path.length < 2) return undefined
  let acc = 0
  for (let i = 1; i < path.length; i++) {
    acc += distance(path[i - 1], path[i])
    if (acc >= metres) return bearing(path[0], path[i])
  }
  return bearing(path[0], path[path.length - 1])
}

const COMPASS = ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west']
export const compass = (deg: number) => COMPASS[Math.round(deg / 45) % 8]
