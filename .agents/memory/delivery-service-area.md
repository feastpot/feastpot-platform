---
name: Delivery config service area
description: How vendor service area (postcode chips) works, how radius computes them, and what search actually filters on.
---

## How search filters on service area

`vendors.repository.ts` `postcodeFilter` ORs two legs:
- **Leg A (radius)**: haversine from `dc.latitude`/`dc.longitude` to user coords <= `dc.local_radius_miles * 1.609344 km` (only fires when user coords are geocoded)
- **Leg B (postcode list)**: user's outward-code prefix appears in `dc.postcodes[]`

Both legs are active when the vendor has geocoded coordinates. The UI label "postcode list is what search uses" was misleading (both have effect). Fixed: chip set IS the postcodes list, and radius generates it; they are now one mechanism.

**Why:** Vendors setting a wide radius but few postcodes believed they had wide coverage but were invisible. See brief delivered 2026-08-13.

## Radius-to-district computation

Endpoint: `GET /vendors/me/delivery-config/compute-districts?lat=&lng=&radiusMiles=`

Uses postcodes.io: `GET https://api.postcodes.io/outcodes?longitude={lng}&latitude={lat}&limit=200&radius={meters}` (radius in METERS, not miles; convert: miles * 1609.344).

Cached in `DISTRICT_CACHE` (process-lifetime Map, 1-hour TTL per lat/lng/miles key). Returns empty array on failure rather than 500 so UI can explain the situation.

**How to apply:** When adding radius-based features, use this endpoint. Do not call postcodes.io `/outcodes` from the frontend directly (token auth required for the vendor endpoint).

## Schema fields (migration 20260813201000)

Added to `delivery_configs`:
- `kitchen_postcode VARCHAR(16)` - geocoding anchor; preferred over legacy `pickGeocodingPostcode` helper
- `collection_line1/2/town/postcode` - structured collection address replacing free-text textarea
- `collection_address` kept in sync from structured fields for backward compat (order display reads it)

## Nationwide delivery type

`nationwide` is REMOVED from the UI (no courier integration exists). The Prisma enum and DB column are kept so existing rows with `types` containing `nationwide` don't break. The orders service still handles it correctly for historic orders.

**Why:** No cold chain, no carrier API, no fulfilment backend. Food safety risk. Removed 2026-08-13.

## Kitchen postcode geocoding

`upsertMyDeliveryConfig` now prefers `dto.kitchenPostcode` as the geocoding target over `pickGeocodingPostcode()` (which picked from `postcodes[0]`). Fallback to `pickGeocodingPostcode` still runs when `kitchenPostcode` is absent.
