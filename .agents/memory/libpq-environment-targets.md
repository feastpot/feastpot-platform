---
name: Explicit libpq environment targets
description: Avoid accidental connections to Replit's unrelated database when using external Supabase credentials
---

Do not place a connection URI in the PGDATABASE environment variable. Unlike a psql connection argument, that environment value is treated as a literal database name.

**Why:** a read-only Supabase preflight accidentally connected to the inherited Replit PGHOST instead and tried to use the URI as its database name.

**How to apply:** parse the URI into explicit PGHOST, PGPORT, PGUSER, PGPASSWORD, PGDATABASE and SSL settings; override inherited host-address/service settings too. Keep credential values out of command arguments, output and saved reports.