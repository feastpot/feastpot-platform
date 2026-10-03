# Phase 6: Image uploads and file handling

## Storage lifecycle remediation (3 October 2026)

The orphan-storage findings below are historical. Uploads now journal deletion intent
before sending bytes; failed record writes and partially uploaded review batches
compensate their uploads. Replacement, explicit deletion and cascading deletion
write detached-object cleanup work in the same database transaction as the record
change. Workers re-check every known owner before deleting, verify physical removal,
and durably retain failures for retry every five minutes.

Covered references: vendor branding, menu images, review photos, compliance documents,
dispute evidence, application originals/public promotions, menu import originals and
generated referral QR variants. Replacement paths are unique, not overwritten.
Compliance documents support replacement and deletion in the vendor portal.
A sixth menu image is rejected before upload, not silently substituted for the first.

The scheduled two-direction inventory runs daily at 04:00 UTC and saves reports of
unreferenced storage objects AND rows referencing missing objects. The first run and
every subsequent inventory run are report-only: discovered orphans never become
automatic deletion jobs. Admin/compliance can inspect or refresh the report at
`/storage-reconciliation`. Known failed/detached uploads are independent cleanup work.

Verification: focused API regression tests plus real development Supabase upload,
replacement, deletion, foreign-key-write compensation, public-image compensation
and seeded two-direction reporting. Physical deletion invalidated a previously issued
private signed URL. Reporting left the seeded orphan intact; test fixtures were removed.
Production migration/publication have not been performed.

The remaining historical findings in this audit are not implicitly resolved by this
storage lifecycle work.

Audited commit: `9c03ecad89f258adad72cb9e768d75b53b03d4eb`

## Upload paths found

- Vendor application menu photo:
  `apps/api/src/modules/vendors/vendors.controller.ts:165-195`
- Vendor logo and cover:
  `apps/api/src/modules/vendors/vendors.controller.ts:646-684`
- Menu import files:
  `apps/api/src/modules/catalogue/catalogue.controller.ts:64-78`
- Menu item photo:
  `apps/api/src/modules/catalogue/catalogue.controller.ts:386`
- Compliance document:
  `apps/api/src/modules/compliance/compliance.controller.ts:71`
- Customer review photos:
  `apps/api/src/modules/reviews/reviews.controller.ts:71`
- Dispute evidence:
  `apps/api/src/modules/disputes/disputes.controller.ts:205`

Generated files found:

- QR SVG/PNG responses.
- Payout statement PDF.
- Terms acceptance PDF.

No generated catering compliance-pack implementation was found.

## Confirmed findings

### HEIC is rejected across upload storage

The public media bucket permits JPEG, PNG, WebP and SVG. The private document
bucket permits PDF, JPEG, PNG and WebP:
`apps/api/src/modules/catalogue/supabase-storage.service.ts:65-76`.

HEIC/HEIF is absent from both allowlists and from the shared image magic-byte
validation. This is a major launch defect for vendors uploading normal iPhone
photos.

### No phone-photo orientation handling was found

A source scan for EXIF, auto-orientation and image rotation found no upload
normalisation. The only image-related search hit was a UI comment; the two
`.rotate()` calls draw watermarks in a terms PDF.

Portrait phone photos are therefore not normalised in current source. Actual
rendering of a rotated EXIF fixture was blocked by portal authentication and
is NOT VERIFIED.

### Replacement and partial-failure cleanup is incomplete

- Menu images append then retain only the first five database URLs without
  deleting the newly orphaned storage object:
  `apps/api/src/modules/catalogue/menu-items.service.ts:1031-1051`.
- Review photos upload sequentially before the database update. A later upload
  or database failure leaves earlier objects without a persisted reference:
  `apps/api/src/modules/reviews/reviews.service.ts:203-216`.
- Vendor identity replacement stores a new URL but does not remove the old
  object in the storage service.
- Anonymous application image promotion copies to public storage without
  removing the private original.

### Compliance and dispute files bypass shared content validation

Compliance upload checks size and sanitises the path name, then uploads the
declared bytes and MIME directly:
`apps/api/src/modules/compliance/compliance.service.ts:75-100`.

Dispute upload does the same and only validates a declared photo/screenshot
type after the object has already been uploaded:
`apps/api/src/modules/disputes/disputes.service.ts:841-875`.

Neither path checks PDF or image magic bytes before storage. Empty, spoofed or
active-content files are not rejected by application code before upload.

### Private-document URL handling is not demonstrated safe

The documents bucket is configured `public: false`:
`apps/api/src/modules/catalogue/supabase-storage.service.ts:72-76`.

Compliance and dispute services nevertheless call `getPublicUrl()` and persist
that URL:
`apps/api/src/modules/compliance/compliance.service.ts:94-109`;
`apps/api/src/modules/disputes/disputes.service.ts:848-881`.

For a correctly private bucket, that URL should not work anonymously. The
audit could not upload a real document and test signed-out or cross-vendor
access, so exposure is NOT VERIFIED. Authorised rendering from those persisted
URLs is also NOT VERIFIED.

## Format and behaviour matrix

Source-supported:

- JPEG, PNG and WebP public images: allowed, subject to shared magic checks.
- PDF menu import: allowed with PDF magic and bounded OCR processing.
- PDF compliance documents: bucket accepts declared PDF, but application
  content validation is absent.
- Maximum sizes: 5 MB for public images; 10 MB for documents/import/evidence.
- Filenames used in object paths are character-sanitised and length-limited.
- Public menu/logo/review media targets the public media bucket.
- Compliance, import and dispute evidence target the private documents bucket.

Not verified in a real upload:

- JPEG, PNG and WebP success on every path.
- Explicit HEIC rejection message.
- 10 MB boundary and oversized-file user messaging.
- Zero-byte rejection.
- Extension/MIME mismatch rejection.
- SVG rejection or sanitisation on every path.
- EXIF orientation rendering.
- Upload, replace and delete lifecycle.
- Old-object deletion.
- Signed-out and cross-vendor private-file access.
- Public-image anonymous access.
- Desktop/mobile aspect ratios and placeholders.
- QR render time and pixel validity.
- Payout and terms PDF rendering and attachment delivery.
- Catering compliance pack.

## Phase verdict

HEIC is unsupported, phone orientation is not normalised, private evidence
paths bypass content validation, and object cleanup is incomplete. The most
important private-document access-control checks could not be exercised and
remain a security launch blocker until verified.
