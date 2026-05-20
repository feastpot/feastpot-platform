-- MFA recovery codes: single-use, HMAC-SHA256(code, server pepper) hashes.
-- Plaintext is shown to the user exactly once at generate/regenerate time;
-- the API never logs or stores it. ON DELETE CASCADE so deleting a user
-- (GDPR erasure) also wipes their codes.
CREATE TABLE "mfa_recovery_codes" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "user_id" uuid NOT NULL,
  "code_hash" varchar(128) NOT NULL,
  "used_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "mfa_recovery_codes_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "mfa_recovery_codes_user_id_idx" ON "mfa_recovery_codes" ("user_id");
CREATE INDEX "mfa_recovery_codes_code_hash_idx" ON "mfa_recovery_codes" ("code_hash");

ALTER TABLE "mfa_recovery_codes"
  ADD CONSTRAINT "mfa_recovery_codes_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
