-- Customer-uploaded review photos (max 3, enforced at the API layer).
ALTER TABLE "reviews" ADD COLUMN IF NOT EXISTS "photo_urls" TEXT[] NOT NULL DEFAULT '{}';
