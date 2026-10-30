import { describe, expect, it } from 'vitest'
import { checkTime, dedupeStopTimes, itineraryConfidence } from '../src/lib/realtime'
import { analyseTransfers } from '../src/lib/transfer'
import { decodePolyline, headingAlong } from '../src/lib/geo'
import type { PlanResponse, StopTime } from '../src/lib/api/types'
import fixture from './fixtures/bonn-plan.json'

const real = fixture as unknown as PlanResponse
const t = (hm: string) => `2026-10-30T${hm}:00Z`

describe('checkTime', () => {
  it('accepts normal delays as live', () => {
    expect(checkTime(t('13:07'), t('13:05'), true, 'BUS')).toMatchObject({ status: 'live', delayMin: 2 })
  })
  it('flags implausible local delays (bad trip matching)', () => {
    expect(checkTime(t('13:09'), t('10:52'), true, 'TRAM').status).toBe('unverified')
  })
  it('allows long rail delays', () => {
    expect(checkTime(t('15:05'), t('13:05'), true, 'HIGHSPEED_RAIL').status).toBe('live')
  })
  it('flags very early departures', () => {
    expect(checkTime(t('13:00'), t('13:05'), true, 'TRAM').status).toBe('unverified')
  })
  it('without live data uses the scheduled time', () => {
    const c = checkTime(t('13:05'), t('13:05'), false, 'BUS')
    expect(c.status).toBe('scheduled')
    expect(c.time.toISOString()).toBe(new Date(t('13:05')).toISOString())
  })
  it('a shifted time without a current update is an estimate, not a schedule', () => {
    const c = checkTime(t('13:09'), t('13:05'), false, 'BUS')
    expect(c.status).toBe('unverified')
    expect(c.time.toISOString()).toBe(new Date(t('13:09')).toISOString())
  })
  it('cancelled wins', () => {
    expect(checkTime(t('13:05'), t('13:05'), true, 'BUS', true).status).toBe('cancelled')
  })
})

describe('real Bonn response (Beuel → Poppelsdorf, 30 Oct 2026)', () => {
  const [first] = real.itineraries

  it('marks the mismatched tram 66 (+137 min) as unverified', () => {
    const c = itineraryConfidence(first)
    expect(c.transitLegs).toBe(3)
    expect(c.unverified).toBeGreaterThanOrEqual(1)
  })

  it('rates connections after unreliable legs as risky, not ok', () => {
    const ts = analyseTransfers(first)
    expect(ts).toHaveLength(2)
    expect(ts[0].level).toBe('risky')
  })

  it('catches the impossible 0-min tram ride and the transfer it breaks', () => {
    const ts = analyseTransfers(first)
    // Tram 66 "arrives" at Hbf at departure time; the real ride is 15 min, so the 602 at 13:12 is not reachable.
    expect(ts[1].level).toBe('missed')
    expect(ts[1].reasons[0]).toMatch(/Likely missed/)
  })

  it('decodes leg geometry near Bonn', () => {
    const pts = decodePolyline(first.legs[0].legGeometry.points, first.legs[0].legGeometry.precision)
    expect(pts.length).toBeGreaterThan(5)
    for (const [lon, lat] of pts) {
      expect(lat).toBeGreaterThan(50.6); expect(lat).toBeLessThan(50.9)
      expect(lon).toBeGreaterThan(6.9); expect(lon).toBeLessThan(7.3)
    }
    const transit = first.legs[1]
    expect(headingAlong(decodePolyline(transit.legGeometry.points, 6))).toBeTypeOf('number')
  })
})

describe('analyseTransfers', () => {
  const leg = (mode: string, dep: string, arr: string, rt = true, sDep = dep, sArr = arr) => ({
    mode, duration: 0, startTime: t(dep), endTime: t(arr), scheduledStartTime: t(sDep), scheduledEndTime: t(sArr),
    realTime: rt, scheduled: true, legGeometry: { points: '', precision: 6, length: 0 },
    from: { name: 'A', lat: 0, lon: 0, departure: t(dep), scheduledDeparture: t(sDep) },
    to: { name: 'B', lat: 0, lon: 0, arrival: t(arr), scheduledArrival: t(sArr) },
  })
  const walk = (min: number) => ({ ...leg('WALK', '00:00', '00:00', false), duration: min * 60 })
  const itin = (...legs: unknown[]) => ({ duration: 0, startTime: '', endTime: '', transfers: 1, legs }) as never

  it('ok with comfortable slack', () => {
    expect(analyseTransfers(itin(leg('BUS', '13:00', '13:10'), walk(2), leg('TRAM', '13:20', '13:30')))[0]).toMatchObject({ level: 'ok', slackMin: 8 })
  })
  it('missed when live delay eats the slack', () => {
    const a = leg('BUS', '13:04', '13:14', true, '13:00', '13:10')
    expect(analyseTransfers(itin(a, walk(3), leg('TRAM', '13:15', '13:30')))[0].level).toBe('missed')
  })
  it('one step riskier when the arriving leg has no live data', () => {
    expect(analyseTransfers(itin(leg('BUS', '13:00', '13:10', false), leg('TRAM', '13:16', '13:30')))[0].level).toBe('tight')
  })
})

describe('dedupeStopTimes', () => {
  it('keeps the plausible copy of a duplicated departure', () => {
    const st = (sched: string, rt = true) => ({
      place: { name: 'Beuel', lat: 0, lon: 0, departure: t('13:12'), scheduledDeparture: t(sched) },
      mode: 'TRAM', realTime: rt, headsign: 'Dottendorf', routeShortName: '62', tripId: sched,
    }) as StopTime
    const out = dedupeStopTimes([st('11:32'), st('13:12')])
    expect(out).toHaveLength(1)
    expect(out[0].tripId).toBe('13:12')
  })
})

import ghostFixture from './fixtures/bonn-ghost.json'

describe('ghost trips (real Bonn response, 30 Oct 2026)', () => {
  const ghost = ghostFixture as unknown as PlanResponse
  const conf = ghost.itineraries.map(itineraryConfidence)

  it('flags the frozen 11:12 tram 62 (every stop at 13:13, not marked live) as broken', () => {
    expect(conf[0].broken.length).toBe(1)
    expect(conf[0].broken[0]).toMatch(/^62:/)
  })
  it('flags the +108 min bus 607 as broken', () => {
    expect(conf[1].broken.length).toBe(1)
  })
  it('keeps healthy connections', () => {
    expect(conf[2].broken).toEqual([])
    expect(conf[3].broken).toEqual([])
    expect(conf[4].broken).toEqual([])
  })
  it('never shows the stale schedule time for a shifted non-live leg', () => {
    const leg = ghost.itineraries[0].legs.find(l => l.mode === 'TRAM')!
    const c = checkTime(leg.from.departure, leg.from.scheduledDeparture, leg.realTime, leg.mode)
    expect(c.status).toBe('unverified')
    expect(c.time.toISOString()).toBe(new Date(leg.from.departure!).toISOString())
  })
})

import { lineName, platformLabel, plausibleTrack } from '../src/lib/lines'

describe('platform labels', () => {
  it('accepts signposted platforms', () => {
    for (const t of ['1', '4 A-C', '12a', '101']) expect(plausibleTrack(t)).toBe(true)
  })
  it('rejects internal quay numbers (Bonn Hbf "78")', () => {
    expect(plausibleTrack('78')).toBe(false)
    expect(platformLabel({ track: '78', description: 'Bahnsteig Gleis 1' }, 'REGIONAL_RAIL')).toBe('')
  })
  it('ignores rail placeholder descriptions on trams', () => {
    expect(platformLabel({ track: '18', description: 'Bahnsteig Gleis 1' }, 'TRAM')).toBe('')
    expect(platformLabel({ track: '11', description: 'Bahnsteig B' }, 'TRAM')).toBe('Bahnsteig B')
  })
  it('uses proper train names', () => {
    expect(lineName({ mode: 'LONG_DISTANCE', routeShortName: '55', displayName: 'IC 1645' })).toBe('IC 1645')
    expect(lineName({ mode: 'REGIONAL_RAIL', routeShortName: 'RB48', displayName: 'RB48 (17346)' })).toBe('RB48')
    expect(lineName({ mode: 'BUS', routeShortName: '602', displayName: '602' })).toBe('602')
  })
})
