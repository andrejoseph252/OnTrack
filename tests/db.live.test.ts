// Temporary live check (not committed): real Transitous trips vs real DB Timetables data.
import { it } from 'vitest'
import { plan } from '../src/lib/api/transitous'
import { checkRail, setDbCreds, trainNumber } from '../src/lib/api/db'
import { isTransit } from '../src/lib/realtime'
import { lineName } from '../src/lib/lines'

const f0 = globalThis.fetch
globalThis.fetch = ((u: RequestInfo | URL, init: RequestInit = {}) => f0(u, { ...init, headers: { ...(init.headers as object), 'User-Agent': 'OnTrack-dev/0.1 (personal; jandre252@gmail.com)' } })) as typeof fetch

// Run manually: DBID=... DBKEY=... npx vitest run tests/db.live.test.ts
it.skipIf(!process.env.DBID)('matches live trains', async () => {
  setDbCreds({ clientId: process.env.DBID!, apiKey: process.env.DBKEY! })
  const trips = [
    { from: { stopId: 'de-DELFI_de:05314:61101' }, to: { lat: 50.9430, lon: 6.9589 } }, // Bonn Hbf → Köln Hbf
    { from: { lat: 50.7387, lon: 7.1269 }, to: { lat: 50.8008, lon: 7.2049 } },           // Beuel → Siegburg
    { from: { lat: 50.6840, lon: 7.1580 }, to: { stopId: 'de-DELFI_de:05314:61101' } },   // Bad Godesberg → Bonn Hbf
  ]
  for (const t of trips) {
    const r = await plan({ ...t, numItineraries: 5, transitModes: ['REGIONAL_RAIL', 'REGIONAL_FAST_RAIL', 'SUBURBAN', 'LONG_DISTANCE', 'HIGHSPEED_RAIL'] } as never)
    for (const leg of r.itineraries.flatMap(i => i.legs).filter(isTransit)) {
      const [dp, ar] = await Promise.all([checkRail(leg, 'dp'), checkRail(leg, 'ar')])
      const f = (s?: string) => s?.slice(11, 16)
      console.log(`${lineName(leg).padEnd(9)} #${trainNumber(leg)} ${leg.from.name} ${f(leg.from.scheduledDeparture)}→${f(leg.from.departure)} trk ${leg.from.track ?? '-'} | DB dp: ${dp ? `${dp.delayMin}min pl ${dp.platform}${dp.platform !== dp.plannedPlatform ? `(was ${dp.plannedPlatform})` : ''}${dp.cancelled ? ' CANCELLED' : ''}` : 'no match'} | ${leg.to.name} DB ar: ${ar ? `${ar.delayMin}min pl ${ar.platform}` : 'no match'}`)
    }
  }
}, 60000)
