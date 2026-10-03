---
name: Runtime audit isolation
description: Resource and evidence constraints for broad vendor/admin runtime certification
---

Run broad cold Next development route sweeps one frontend at a time, and finish them before compiling the API.

**Why:** Compiling both full portal route trees together with the language server and API build reached the container's 16 GB limit, producing browser timeouts rather than useful application evidence.

**How to apply:** Distinguish environment-interrupted checks from product failures; retain incomplete coverage explicitly. Do not call a warm/development QR measurement a production performance certificate.

Financial rejection probes need a baseline and a cleanup plan even when the expected response is 400.

**Why:** A defective guard can accept the request and change financial history. Testing the expected failure is not permission to leave the resulting test mutation in place.

**How to apply:** Snapshot affected financial windows before a probe; use unmistakably owned fixtures and restore only those changes. Verify the actual rejection reason, not just a generic 400 from another invalid field.

Validator metadata alone does not establish a business-valid ownership probe.

**Why:** Generic fixture generation repeatedly produced missing child records, oversized database values, invalid upload parameters and an enum value that the operation explicitly forbids. Those failures exercised validation or lookup, not cross-owner authorization.

**How to apply:** Establish existing resources with their real owner, preferably through the actual API. Supply valid upload parameters and business-supported DTO values before replaying the request with another vendor's real token. Keep public catalogue information separate from private-resource checks.

Parallel fixture runners must use random, collision-resistant namespaces, not timestamps alone.

**Why:** Two processes initialized in the same millisecond, reused the same vendor identity, and one runner's cleanup deleted the other runner's authenticated caller. Every remaining permission probe consequently returned an irrelevant 401.

**How to apply:** Use a UUID-based namespace per process and verify the caller can access its own resource before making negative ownership probes.

Full production-mode API startup checks require isolated services, a clean environment, and blocked external connections.

**Why:** Booting the API also starts financial workers and crons; read-only database checks alone do not isolate those side effects. Invalid fixture configuration can instead fail a production safety gate and create a misleading startup failure.

**How to apply:** Use throwaway database/queue services and non-working credentials that satisfy configuration-format gates, without weakening application guards. Exclude inherited credentials and workspace dotenv files. Treat successful local startup as code/lifecycle evidence, not proof that a cold published VM meets its readiness deadline.
