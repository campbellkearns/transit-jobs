# Pinned MARTA GTFS feed

`google_transit.zip` is the station source of truth. It is read only by the
seed script (`npm run db:seed`) and never fetched at runtime — MARTA publishes
on no fixed cadence, so a runtime fetch would let the station table change
underneath live job associations without a deploy.

## Provenance

| | |
|---|---|
| Upstream URL | `https://itsmarta.com/google_transit_feed/google_transit.zip` |
| Retrieved | 2026-09-03 |
| Upstream `Last-Modified` | Tue, 18 Aug 2026 18:28:00 GMT |
| Upstream size / SHA-256 | 18,620,232 bytes · `f4a36309f42858d3c55bf46298395471621ba6ec1888a141c543a1190a52e2e1` |
| This file SHA-256 | `4a4a0d0470b0dc45343f366ba28b76b2c979b5f63e2001dd1202d7eb95fb8954` |

**Use the `google_transit_feed/` path, not `https://itsmarta.com/google_transit.zip`.**
The shorter URL also returns 200 and looks like the same feed, but serves an
April 2025 snapshot in which *no* stop carries `location_type` or
`parent_station` at all. The parent-station join silently returns platform-level
stops there — 80 rows, several per station, rather than 38 — and it predates
the December 2025 GWCC/CNN Center → SEC District Station rename, so `510039`
does not exist in it at all.

## What was trimmed, and why it is still a fair test

The upstream zip is 18.6 MB, dominated by `shapes.txt` (15 MB) and
`stop_times.txt` (108 MB uncompressed). Committing that to git would tax every
clone and CI checkout for data the seed never reads. This copy is 1.3 MB:

- **`shapes.txt` — dropped.** Route geometry; the seed reads stop coordinates.
- **`stop_times.txt` — reduced** to rail trips, the streetcar's trips, and a
  deterministic sample of 800 bus trips (112,653 of 2.2 M rows).
- **`agency.txt`, `calendar.txt`, `calendar_dates.txt`, `routes.txt`,
  `stops.txt`, `trips.txt` — untouched, complete.**

The trim deliberately preserves every distinction the seed's join has to draw,
so the tests can still fail if the logic breaks:

- `routes.txt` keeps all 86 routes (81 bus, 4 rail, 1 streetcar), so the
  `route_type=1` filter has non-rail routes to reject — including the Atlanta
  Streetcar, which is `route_type=0` and must not be treated as rail.
- `trips.txt` keeps all 45,367 trips, so the rail-trip filter is discriminating.
- `stop_times.txt` retains 45,009 non-rail rows for the same reason: a seed that
  forgot to filter by trip would pull in bus stops and blow the count.
- `stops.txt` keeps all 7,055 stops — every park-and-ride, every bus stop, and
  all 81 rail platform children — so parent-station resolution and
  park-and-ride exclusion are exercised against the real shape of the data.

## Regenerating

`npm run gtfs:pin` re-downloads the upstream feed and rebuilds this file. Doing
so is a deliberate act: it can change the station set, so re-run the seed tests
and expect `EXPECTED_STATION_COUNT` in `db/gtfs.ts` to need review.

## Attribution

Schedule data © MARTA, from its published GTFS feed. MARTA's developer terms
forbid use of its trademarks and logos without written consent, so the product
credits the data and never presents itself as MARTA.
