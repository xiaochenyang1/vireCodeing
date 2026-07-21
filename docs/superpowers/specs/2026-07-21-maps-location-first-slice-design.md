# Maps Location First Slice Design

## Goal

Establish a maps foundation without a real Amap key: store optional pickup/delivery coordinates on orders, geocode addresses through a sandbox provider, let drivers report a latest location snapshot, let shippers read that location for in-progress orders, and let mobile open external navigation apps.

## Current Evidence

- `OrderLocation` only stores address/contact/note text; no latitude/longitude.
- `TrackingCard` is a local demo card with no platform location API.
- Driver `maxDistanceKm` is persisted but not used for distance filtering.
- `apps/api/src/maps` is empty; no map provider, no location tables, no OpenAPI map paths.
- Architecture prefers Amap later; this slice must not hard-require a vendor key.

## Scope

### In Scope

- `OrderLocation.latitude/longitude/geocodeStatus/geocodedAt`
- `DriverLocationSnapshot` latest-point table (not full trajectory history)
- `MAP_PROVIDER=sandbox` geocode/distance provider abstraction
- `POST /maps/geocode`
- `POST /driver/location`
- `GET /shipper/orders/{orderId}/driver-location`
- `GET /driver/orders/{orderId}/navigation-targets`
- Optional order create/update coordinate fields
- Sandbox auto-geocode on create/update only when `MAP_PROVIDER=sandbox`
- Mobile adapter, TrackingCard latest location, external navigation deep links, draft geocode helper
- Tests, OpenAPI, status docs

### Out of Scope

- Real Amap/Baidu key integration
- In-app map SDK rendering
- Trajectory history/replay
- Redis hot location stream
- Hall distance sort/filter by `maxDistanceKm`
- Native background location permissions productization

## Data Model

```prisma
enum OrderLocationGeocodeStatus {
  none
  sandbox
  manual
  failed
}

enum DriverLocationSource {
  manual
  device
  sandbox
}

model OrderLocation {
  // existing fields...
  latitude      Decimal?                    @db.Decimal(10, 7)
  longitude     Decimal?                    @db.Decimal(10, 7)
  geocodeStatus OrderLocationGeocodeStatus  @default(none)
  geocodedAt    DateTime?
}

model DriverLocationSnapshot {
  driverId        String               @id
  orderId         String?
  latitude        Decimal              @db.Decimal(10, 7)
  longitude       Decimal              @db.Decimal(10, 7)
  accuracyMeters  Float?
  source          DriverLocationSource @default(device)
  recordedAt      DateTime
  updatedAt       DateTime             @updatedAt
  driver          User                 @relation(...)
  order           Order?               @relation(...)
}
```

## Provider

Sandbox geocode:

- Deterministic hash of trimmed address into a Shenzhen-area rectangle
- Same address always returns same coordinates
- Distance uses Haversine meters

Production must not silently invent coordinates. Auto-geocode on order create is allowed only for `MAP_PROVIDER=sandbox`.

## API Rules

- Driver location report requires `userType=driver`
- If `orderId` is present, order must be assigned to that driver and status in `loading|transporting|confirming`
- Shipper driver-location read requires order ownership and an assigned driver
- Missing snapshot returns `DRIVER_LOCATION_NOT_FOUND`
- Navigation targets return pickup/delivery address + optional coordinates for the assigned driver only

## Mobile

- Platform geocode adapter
- Draft address section can request sandbox geocode and attach coordinates
- Tracking card polls/reads latest driver location when platform order is transporting
- Driver detail exposes navigate actions via external URL builders

## Honesty Boundary

Sandbox coordinates are fake, stable fixtures for end-to-end wiring. They are not real geography and must be labeled in UI/docs.
