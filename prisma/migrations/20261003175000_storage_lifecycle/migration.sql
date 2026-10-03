CREATE TABLE public.storage_cleanup_jobs (
  locator TEXT PRIMARY KEY,
  reason TEXT NOT NULL,
  due_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  locked_until TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE public.storage_reconciliation_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  data JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
ALTER TABLE public.storage_cleanup_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.storage_reconciliation_reports ENABLE ROW LEVEL SECURITY;

-- All managed references, including private originals and generated QR variants.
-- Keeping extraction shared by the report and triggers prevents lifecycle drift.
CREATE FUNCTION public.storage_row_locators(row_data JSONB, table_name TEXT)
RETURNS SETOF TEXT LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE value TEXT; source JSONB;
BEGIN
  IF table_name = 'vendors' THEN
    RETURN QUERY SELECT row_data->>'logo_url' WHERE row_data->>'logo_url' IS NOT NULL;
    RETURN QUERY SELECT row_data->>'cover_image_url' WHERE row_data->>'cover_image_url' IS NOT NULL;
  ELSIF table_name = 'menu_items' THEN
    RETURN QUERY SELECT jsonb_array_elements_text(CASE WHEN jsonb_typeof(row_data->'image_urls') = 'array'
      THEN row_data->'image_urls' ELSE '[]'::JSONB END);
  ELSIF table_name = 'reviews' THEN
    RETURN QUERY SELECT jsonb_array_elements_text(CASE WHEN jsonb_typeof(row_data->'photo_urls') = 'array'
      THEN row_data->'photo_urls' ELSE '[]'::JSONB END);
  ELSIF table_name IN ('vendor_documents', 'dispute_evidence') THEN
    RETURN QUERY SELECT row_data->>'file_url' WHERE row_data->>'file_url' IS NOT NULL;
  ELSIF table_name = 'vendor_applications' THEN
    RETURN QUERY SELECT row_data->>'menu_photo_url' WHERE row_data->>'menu_photo_url' IS NOT NULL;
    RETURN QUERY SELECT 'feastpot-documents/' || (row_data->>'menu_photo_path')
      WHERE row_data->>'menu_photo_path' IS NOT NULL;
  ELSIF table_name = 'menu_imports' THEN
    FOR source IN SELECT jsonb_array_elements(CASE WHEN jsonb_typeof(row_data->'source_files') = 'array'
      THEN row_data->'source_files' ELSE '[]'::JSONB END) LOOP
      IF source->>'path' IS NOT NULL THEN RETURN NEXT 'feastpot-documents/' || (source->>'path'); END IF;
    END LOOP;
  ELSIF table_name = 'vendor_referral_links' THEN
    value := row_data->>'qr_code_url';
    IF value IS NOT NULL THEN
      IF left(value, 1) = '{' THEN
        BEGIN
          RETURN QUERY SELECT entry.value FROM jsonb_each_text(value::jsonb) entry
            WHERE entry.value IS NOT NULL;
        EXCEPTION WHEN invalid_text_representation THEN RETURN NEXT value;
        END;
      ELSE RETURN NEXT value;
      END IF;
    END IF;
  END IF;
END $$;

CREATE VIEW public.storage_object_references AS
SELECT 'vendors'::TEXT AS owner_table, v.id::TEXT AS owner_id, r AS locator
  FROM public.vendors v CROSS JOIN LATERAL public.storage_row_locators(to_jsonb(v), 'vendors') r
UNION ALL SELECT 'menu_items', v.id::TEXT, r FROM public.menu_items v
  CROSS JOIN LATERAL public.storage_row_locators(to_jsonb(v), 'menu_items') r
UNION ALL SELECT 'reviews', v.id::TEXT, r FROM public.reviews v
  CROSS JOIN LATERAL public.storage_row_locators(to_jsonb(v), 'reviews') r
UNION ALL SELECT 'vendor_documents', v.id::TEXT, r FROM public.vendor_documents v
  CROSS JOIN LATERAL public.storage_row_locators(to_jsonb(v), 'vendor_documents') r
UNION ALL SELECT 'dispute_evidence', v.id::TEXT, r FROM public.dispute_evidence v
  CROSS JOIN LATERAL public.storage_row_locators(to_jsonb(v), 'dispute_evidence') r
UNION ALL SELECT 'vendor_applications', v.id::TEXT, r FROM public.vendor_applications v
  CROSS JOIN LATERAL public.storage_row_locators(to_jsonb(v), 'vendor_applications') r
UNION ALL SELECT 'menu_imports', v.id::TEXT, r FROM public.menu_imports v
  CROSS JOIN LATERAL public.storage_row_locators(to_jsonb(v), 'menu_imports') r
UNION ALL SELECT 'vendor_referral_links', v.id::TEXT, r FROM public.vendor_referral_links v
  CROSS JOIN LATERAL public.storage_row_locators(to_jsonb(v), 'vendor_referral_links') r;
REVOKE ALL ON public.storage_object_references FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.storage_row_locators(JSONB, TEXT) FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.queue_detached_storage_objects() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
DECLARE object_locator TEXT; new_data JSONB;
BEGIN
  new_data := CASE WHEN TG_OP = 'DELETE' THEN '{}'::JSONB ELSE to_jsonb(NEW) END;
  FOR object_locator IN
    SELECT public.storage_row_locators(to_jsonb(OLD), TG_TABLE_NAME)
    EXCEPT SELECT public.storage_row_locators(new_data, TG_TABLE_NAME)
  LOOP
    -- Preview URLs may carry signed tokens. Cleanup needs the path, never the token.
    object_locator := split_part(object_locator, '?', 1);
    INSERT INTO public.storage_cleanup_jobs(locator, reason)
      VALUES(object_locator, 'detached_reference')
      ON CONFLICT(locator) DO UPDATE SET reason = 'detached_reference', due_at = CURRENT_TIMESTAMP;
  END LOOP;
  RETURN NULL;
END $$;
DO $$
DECLARE name TEXT;
BEGIN
  FOREACH name IN ARRAY ARRAY['vendors', 'menu_items', 'reviews', 'vendor_documents',
    'dispute_evidence', 'vendor_applications', 'menu_imports', 'vendor_referral_links'] LOOP
    EXECUTE format('CREATE TRIGGER storage_detachment AFTER UPDATE OR DELETE ON public.%I
      FOR EACH ROW EXECUTE FUNCTION public.queue_detached_storage_objects()', name);
  END LOOP;
END $$;