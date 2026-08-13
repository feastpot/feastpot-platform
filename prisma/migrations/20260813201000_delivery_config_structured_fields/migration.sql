-- Add kitchen_postcode (delivery-centre anchor) and structured collection
-- address fields to delivery_configs. Seeding from existing data below.

ALTER TABLE delivery_configs
  ADD COLUMN IF NOT EXISTS kitchen_postcode    VARCHAR(16),
  ADD COLUMN IF NOT EXISTS collection_line1    VARCHAR(255),
  ADD COLUMN IF NOT EXISTS collection_line2    VARCHAR(255),
  ADD COLUMN IF NOT EXISTS collection_town     VARCHAR(100),
  ADD COLUMN IF NOT EXISTS collection_postcode VARCHAR(16);

-- Seed kitchen_postcode from the first element of the postcodes array.
UPDATE delivery_configs
SET    kitchen_postcode = UPPER(TRIM(postcodes[1]))
WHERE  kitchen_postcode IS NULL
  AND  array_length(postcodes, 1) > 0
  AND  TRIM(postcodes[1]) <> '';

-- Parse existing free-text collection_address into structured fields.
-- Lines are split on newline. The last UK-postcode-shaped token is extracted
-- as the postcode; remaining lines fill line1 / line2 / town.
-- Rows that cannot be parsed have their raw text placed in collection_line1
-- so vendors can see and correct them.
DO $$
DECLARE
  r           RECORD;
  lines       TEXT[];
  n           INT;
  pc          TEXT;
BEGIN
  FOR r IN
    SELECT id, collection_address
    FROM   delivery_configs
    WHERE  collection_address IS NOT NULL
      AND  TRIM(collection_address) <> ''
      AND  collection_line1 IS NULL
  LOOP
    -- Build array of non-empty trimmed lines.
    lines := ARRAY(
      SELECT TRIM(l)
      FROM   unnest(string_to_array(TRIM(r.collection_address), E'\n')) AS l
      WHERE  TRIM(l) <> ''
    );
    n  := coalesce(array_length(lines, 1), 0);
    pc := (regexp_match(UPPER(r.collection_address),
           '([A-Z]{1,2}[0-9][A-Z0-9]?\s*[0-9][A-Z]{2})'))[1];

    IF n >= 2 AND pc IS NOT NULL THEN
      UPDATE delivery_configs SET
        collection_line1    = lines[1],
        collection_line2    = CASE WHEN n >= 4 THEN lines[2] ELSE NULL END,
        collection_town     = CASE WHEN n >= 4 THEN lines[3]
                                   WHEN n = 3  THEN lines[2]
                                   ELSE NULL END,
        collection_postcode = REPLACE(pc, ' ', '')
      WHERE id = r.id;
    ELSE
      -- Could not parse: store raw text in line1 for manual correction.
      UPDATE delivery_configs SET
        collection_line1 = LEFT(r.collection_address, 255)
      WHERE id = r.id;
    END IF;
  END LOOP;
END $$;
