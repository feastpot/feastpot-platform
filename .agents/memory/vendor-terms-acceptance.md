---
name: Vendor Terms acceptance
description: Durable legal and onboarding invariants for version selection, acceptance evidence, and activation.
---

The current Vendor Terms are the latest version whose effective date has passed. A published future replacement must not displace that version during its notice period.

**Why:** Treating publication as immediate supersession creates a period with no effective terms, while onboarding and trading still need an enforceable current version.

**How to apply:** Use effective dates for every current-version decision. Require the server-generated click-wrap label, end-of-document confirmation, IP address, user agent, accepted content hash, version, timestamp, and method. Persist acceptance and vendor setup activation in one transaction; enqueue the evidence PDF only after commit. Gate setup, go-live, and vendor trading mutations on acceptance of the current effective version.

Historical supersession flags are not an authoritative current-version selector. Search caches and legal administration must follow the same effective-date selection as the trading gate.

**Why:** Legal history can contain a document marked superseded before it became effective. A cached search can also survive the automatic effective-date transition without any publish-time cache invalidation.

**How to apply:** Keep one deterministic effective-date selector across SQL and ORM paths. Advance eligibility cache keys with the effective document, and obtain approval before repairing historical legal timestamps or evidence.