---
name: Image upload fix
description: Root cause and fix for broken logo/cover images in the vendor profile form
---

## Root cause
next/image rejected Supabase Storage URLs (e.g. yeklvh*.supabase.co/storage/v1/object/public/…)
because the hostname was not whitelisted in next.config.ts. Images rendered as broken placeholders
or threw Next.js image domain errors.

## Fix
Added `images.remotePatterns` to `apps/vendor/next.config.ts`. The hostname is derived at
build time from `NEXT_PUBLIC_SUPABASE_URL` so it works for both dev and prod projects without
hardcoding a subdomain.

## ImageSlot improvements
- Switched from `<Image fill>` to plain `<img>` inside ImageSlot so blob: object URLs
  (created via URL.createObjectURL on file pick) work for immediate preview before server response.
- Added `localPreview` state: cleared when `uploading` goes false (success or error).
- Added `error?: string | null` prop with inline `role="alert"` paragraph below the slot.
- `humanizeUploadError()` helper maps HTTP status codes to vendor-readable sentences.
- ProfilePreview still uses `next/image` (benefits from CDN now that domain is configured).

**Why:** next/image doesn't support blob: URLs; plain <img> is the right choice for ephemeral
local previews. Keeping next/image in ProfilePreview retains CDN optimization for stable URLs.

**How to apply:** Any new image slot needing immediate upload preview should use <img> for
the preview state. The domain fix in next.config.ts is required for any Supabase URL rendered
via next/image anywhere in the vendor or web apps.
