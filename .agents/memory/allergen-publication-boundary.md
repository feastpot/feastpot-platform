---
name: Allergen publication boundary
description: Durable safety rule for enforcing menu allergen declarations across public data paths.
---

An available dish is public only when it declares at least one FSA allergen or explicitly confirms it is free from all 14. Apply this invariant to catalogue list/detail, vendor profile embeds, featured dishes, search SQL, and direct-read RLS.

**Why:** Protecting only the obvious catalogue endpoint leaves customer-visible names and dishes exposed through profile/search embeds or direct Supabase reads. Free-from confirmation must also remain valid in allergen-free search despite its intentionally empty allergen array.

**How to apply:** Whenever adding a customer-facing menu-item read path, reuse the same declaration predicate. Keep owner and authorised menu-team draft reads separate from public visibility.