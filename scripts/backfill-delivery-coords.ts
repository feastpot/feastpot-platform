/**
 * Backfill DeliveryConfig.latitude/longitude for every existing vendor.
 *
 * Idempotent: re-running only touches rows where lat/lng is NULL. Geocode
 * is best-effort via postcodes.io (free, no auth) — rows whose postcode
 * we can't resolve stay NULL and surface in /v1/vendors/debug as
 * "configsWithCoordinates < deliveryConfigCount" until a vendor edits
 * their delivery config (which re-runs geocoding through the service).
 *
 * Usage:
 *   npx ts-node scripts/backfill-delivery-coords.ts
 *   npx ts-node scripts/backfill-delivery-coords.ts --all      # re-geocode every row
 *   npx ts-node scripts/backfill-delivery-coords.ts --live-only # only live vendors
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

interface PostcodesIoResponse {
  result?: { latitude?: number; longitude?: number } | null;
}

function extractPostcodeFromAddress(addr: string | null): string | null {
  if (!addr) return null;
  const m = addr.toUpperCase().match(/([A-Z]{1,2}[0-9][A-Z0-9]?)\s*([0-9][A-Z]{2})/);
  return m ? `${m[1]} ${m[2]}` : null;
}

function pickPostcode(input: { postcodes: string[]; collectionAddress: string | null }): string | null {
  const first = input.postcodes.find((p) => p && p.trim().length > 0);
  if (first) return first.trim();
  return extractPostcodeFromAddress(input.collectionAddress);
}

const cache = new Map<string, { lat: number | null; lng: number | null }>();

async function fetchPostcodesIo(
  path: string,
): Promise<{ lat: number | null; lng: number | null }> {
  try {
    const res = await fetch(`https://api.postcodes.io${path}`);
    if (!res.ok) return { lat: null, lng: null };
    const json = (await res.json()) as PostcodesIoResponse;
    const lat = json.result?.latitude;
    const lng = json.result?.longitude;
    return {
      lat: typeof lat === 'number' ? lat : null,
      lng: typeof lng === 'number' ? lng : null,
    };
  } catch (e) {
    console.warn(`  geocode error for ${path}: ${(e as Error).message}`);
    return { lat: null, lng: null };
  }
}

async function geocode(raw: string): Promise<{ lat: number | null; lng: number | null }> {
  const key = raw.replace(/\s+/g, '').toUpperCase();
  if (!key) return { lat: null, lng: null };
  const hit = cache.get(key);
  if (hit) return hit;
  // Full postcode first (8 chars max). If that misses (or this is an
  // outward-only code like "SE15"), fall back to /outcodes/<OUT>.
  let out = await fetchPostcodesIo(`/postcodes/${encodeURIComponent(key)}`);
  if (out.lat === null || out.lng === null) {
    const outward = key.match(/^[A-Z]{1,2}[0-9][A-Z0-9]?/)?.[0];
    if (outward) {
      out = await fetchPostcodesIo(`/outcodes/${encodeURIComponent(outward)}`);
    }
  }
  cache.set(key, out);
  return out;
}

async function main() {
  const args = new Set(process.argv.slice(2));
  const force = args.has('--all');
  const liveOnly = args.has('--live-only');

  const configs = await prisma.deliveryConfig.findMany({
    where: {
      ...(force ? {} : { OR: [{ latitude: null }, { longitude: null }] }),
      ...(liveOnly ? { vendor: { status: 'live' } } : {}),
    },
    select: {
      id: true,
      vendorId: true,
      postcodes: true,
      collectionAddress: true,
      vendor: { select: { businessName: true, status: true } },
    },
  });

  console.info(
    `[backfill-delivery-coords] candidates: ${configs.length} (force=${force}, liveOnly=${liveOnly})`,
  );

  let ok = 0;
  let miss = 0;
  let skipped = 0;
  for (const cfg of configs) {
    const target = pickPostcode({
      postcodes: cfg.postcodes,
      collectionAddress: cfg.collectionAddress,
    });
    if (!target) {
      skipped += 1;
      console.warn(
        `  skip ${cfg.vendor.businessName} (${cfg.vendor.status}): no postcode or address`,
      );
      continue;
    }
    const { lat, lng } = await geocode(target);
    if (lat === null || lng === null) {
      miss += 1;
      console.warn(`  miss ${cfg.vendor.businessName}: "${target}" did not geocode`);
      continue;
    }
    await prisma.deliveryConfig.update({
      where: { id: cfg.id },
      data: { latitude: lat, longitude: lng },
    });
    ok += 1;
    console.info(
      `  ok   ${cfg.vendor.businessName} (${cfg.vendor.status}): ${target} → ${lat.toFixed(4)}, ${lng.toFixed(4)}`,
    );
    // Gentle rate-limit; postcodes.io is generous but we're not in a rush.
    await new Promise((r) => setTimeout(r, 50));
  }

  console.info(
    `[backfill-delivery-coords] done: ${ok} updated, ${miss} unresolved, ${skipped} skipped`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
