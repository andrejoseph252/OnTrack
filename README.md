# OnTrack

Personal door-to-door public transport app for Bonn (VRS) and the rest of Germany.
Static PWA on GitHub Pages; no backend, no API keys.

```
npm install
npm run dev      # http://localhost:5173
npm test         # accuracy rules, run against real captured Bonn responses
npm run build    # → dist/
```

Pushing to `main` deploys via `.github/workflows/deploy.yml`. One-time setup on GitHub:
Settings → Pages → Source: **GitHub Actions**.

## How it works

| Piece | Source |
|---|---|
| Search (addresses, places, stops) | Transitous `/api/v1/geocode`, biased to Bonn |
| Door-to-door routing, walking paths, stop positions | Transitous (MOTIS 2) `/api/v5/plan`: DELFI timetables + OpenStreetMap |
| Live departures | Transitous `/api/v5/stoptimes` (nationwide GTFS-RT) |
| DB cross-check (optional) | Any db-rest server (`src/lib/api/db.ts`), used only on exact match |
| Signposted quay names ("Gleis U3a", "Bussteig E") | VRS static GTFS → `public/data/vrs-quays.json`, refreshed weekly by `.github/workflows/vrs-data.yml` |
| Line maps (195 lines serving Bonn / Rhein-Sieg: route, stops, colours) | VRS static GTFS → `public/data/lines.json` (`scripts/vrs-lines.mjs`, same weekly workflow) |
| Train delays, platforms, cancellations | DB Timetables API (keys entered in ⚙ Settings, stored on-device) |
| Map | MapLibre + OpenFreeMap tiles |

### Accuracy rules (`src/lib/realtime.ts`, `src/lib/transfer.ts`, `src/lib/lines.ts`)

The free live feed has real problems in Bonn. Each rule below comes from data observed on 30 Oct 2026 and is covered by a test:

- **Ghost trips:** a tram or bus whose live data shows an impossible ride (e.g. Ramersdorf → Hbf in 0 min, or every stop at the same minute), or a local vehicle more than 90 min late. These connections are hidden behind "left out because the live data contradicts itself".
- **Implausible delays:** local delays over 45 min, or departures more than 3 min early, are marked `?` (unverified) and never shown as fact.
- **Shifted but not live:** a time that differs from the timetable without a current update is shown as `~` (estimate), never as the old timetable time.
- **Platforms:** at Bonn Hbf every departure carries the placeholder track "78" / "Bahnsteig Gleis 1". Rail platforms are shown only when they look signposted ("1", "4 A-C"). Otherwise the app says "check the departure board".
- **Transfers:** slack = next departure − arrival − walk. Under 2 min is risky, under 5 min is tight. Uncertain arrival data raises the risk one level. Risky transfers fetch backup options automatically.
- **Duplicated departures** on boards are merged, keeping the most plausible copy.
- Live data refreshes every 30 s and whenever the app comes back to the foreground. If the selected connection disappears from live results, the app says so.

## Interface

Map-first: a full-screen map with a draggable bottom sheet (peek / half / full) on phones, a side panel on wide screens.
The map always shows what the sheet is about: all candidate routes while choosing, the trip's legs and boarding
points, the whole network (Lines tab), a single line with its stops, or a stop's individual stopping points with
where each goes ("→ 62 Oberkassel"), so you can see which side of the street to stand on. Tapping any line badge
opens that line's map; tapping a stop on a line opens its departures.

## Roadmap

**Next (biggest accuracy gains)**
1. **A DB/VRS live source that actually responds.** The public db-rest server returned 503 errors and bahn.de blocks automated clients, so the DB cross-check is built but currently inactive. Options:
   - self-host db-rest
   - the official DB API Marketplace (free key; Timetables API for train platforms and changes) behind a free Cloudflare Worker
   - VRS's own data, if a usable feed exists
2. **Timetable fallback for ghost trips.** When a line's live data is broken (e.g. tram 62), also query `realtimeMode=OFF` and offer the timetabled trip, labelled "timetable only".
3. **Arrival-side DB check** (currently departures only), and platform changes for arrivals.

**The last 200 metres**
4. **Side of street:** weekly GitHub Action pulls OSM platforms/stop positions for the Bonn area (Overpass). Compare the platform with the road centreline to say "far side of Kaiserstraße, cross at the lights".
5. **Station layouts:** entrances, lifts, levels from OSM indoor data. Lift status from the DB FaSta API (behind the Worker).
6. Follow-me mode in a trip: live position on the map, "get off in 2 stops", next-step prompts.

**Network**
- ~~Route maps for every bus and tram line~~ (done: Lines tab).
- Live vehicle positions on a line's map (Transitous `/api/v6/map/trips`).

**Comfort**
7. Saved places export/import (JSON), and "from home" as well as "to home".
8. Departures near me, and favourite stops.
9. Historical delay stats for your regular trips, to make the transfer risk score evidence-based.
10. PNG app icons (iOS home screen), and a light/dark toggle.

## Known limitations
- Transitous and db-rest are volunteer-run with no uptime guarantee.
- Map pins for stops come from the same timetable data; where quay mapping is broken (Bonn Hbf), a pin can be at the wrong part of the station.
- The step-free filter changes walking routes only. Vehicle accessibility data for SWB is wrong in the feed (reported "not accessible"), so it isn't used.
- The Deutschlandticket filter excludes all IC/ICE, including the few IC sections that accept it.
