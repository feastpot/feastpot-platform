# Terms enforcement and production evidence

Audit date: 3 October 2026. Production database target was verified against the live API health response. Database queries were read-only; this work did not change production vendor statuses or send compliance notifications.

## Production acceptance ratio

“Real” means the vendor is not marked seed data or a public demo, and its owner is not marked test data. Classification uses persisted provenance, never names or email addresses.

| Scope                       | Accepted current terms | Vendors | Interpretation                                             |
| --------------------------- | ---------------------: | ------: | ---------------------------------------------------------- |
| Real live/probation vendors |                      0 |       0 | Not applicable: no real trading vendors, not 100% coverage |
| All real vendor accounts    |                      1 |       2 | 50%; both accounts are not live                            |

The two real accounts are pending and approved. The pending account has accepted the current version; the approved account has not. Existing onboarding and the explicit go-live check require acceptance before activation.

Three production vendors with live status are marked seed data, with test-marked owners. They all have current acceptances but are excluded from real operational figures and ordering.

**Affected real trading vendors: zero.** The conditional blocking-modal/email/WhatsApp branch therefore does not apply. No production vendor was manually blocked or notified.

Reproducible aggregate query: `scripts/audit-real-vendor-terms.sql`. It contains no mutations or personal data.

## Markers and the development warning

Existing persisted vendor seed/demo and owner test/provenance markers are reused, rather than adding a redundant flag. Legal coverage, version acceptance/notice counts, default notice listings and bulk legal-notice targeting exclude marked fixtures.

The same read-only query against development returned 301 unmarked vendor accounts, including 191 live/probation accounts, with zero acceptances of the selected development version. These are **marker-filtered counts, not independently verified real businesses**. Historical development fixture classification is incomplete; this result must not be used to block production vendors. Development's selected version is a test-factory-labelled document. Cleaning up those legacy records requires provenance-based investigation rather than guessing from names.

## Trading gates implemented

- Going live: explicit current-effective acceptance assertion before readiness/status writes.
- Order acceptance: vendor and admin acceptance paths cannot bypass the check. Missing eligibility service fails closed.
- Customer search: a correlated SQL acceptance check requires the uniquely selected current-effective version. Old, missing and future-version acceptance alone does not qualify.
- Checkout and accepting proposed amendments also require current terms, preventing an old direct link from bypassing search.
- Search cache keys include the selected effective version, so a newly effective document cannot leave an older eligible-vendor search result active.
- Previously authorised read-only public demos remain labelled and non-orderable; they do not enter real operational figures.

Tests exercise go-live and order-acceptance blocking, current-record lookup, missing-service failure, SQL search filtering, fixture exclusions and version state. A read-only PostgreSQL regression using the actual search predicate allowed the current-accepted vendor and denied missing, old-only and future-only acceptances.

## Version state

Production's public terms endpoint and the read-only effective-date query agree: **Vendor Terms 2.0, effective 23 September 2026**.

The audit label `part-b-1788799279281` exists in development, not production. It was stored in the version label field: a test label, not an internal row identifier leaking into a semantic-version field. New Vendor Terms publication requires numeric two- or three-part labels, preserving existing `2.0` numbering. Rate Schedule date-based labels remain supported.

One current version is selected per document type by effective date, then publication date, then row ID; future versions cannot replace current terms during their notice period. Admin statuses and comparisons now follow that same rule rather than stale flags.

Publication cannot independently supersede a document: supersession and creating its replacement share one database transaction. Missing/invalid replacement metadata and backdated replacements that would not become current are rejected. Tests cover these rejections and preservation of the current document during a future replacement's notice period.

**Historical production metadata still needs review:** 2.0 has a superseded timestamp preceding its effective date, while the older-effective 2.1 has a null superseded timestamp. Rate Schedule history has a similar disagreement. No historical dates, content, acceptance records or legal evidence were rewritten here. The runtime selector is consistent, but historical supersession flags are not reliable proof of which document is current.

## Catering compliance pack: partial implementation exists

The audit's “no implementation” statement is incorrect. `apps/api/src/modules/catering-bookings/catering-bookings.service.ts` builds a compliance PDF on confirmation and emails it as an attachment.

The PDF contains booking/menu information, a registration number, verification summaries for registration/hygiene/insurance, and a 14-allergen matrix from the event menu snapshot.

It is **not the full evidence pack promised by clause 8.5**:

- It does not attach the underlying registration and insurance documents.
- Its FHRS section uses hygiene-document verification rather than an actual FHRS evidence record.
- Missing documents can render “On file with Feastpot”, which is not proof that evidence exists.
- Delivery is a direct email attempt with logged failure, not a durable pack-generation/delivery workflow with retry and customer retrieval.

Source existence was verified; successful delivery of a genuine production booking was not verified.

### Scope if the promised pack is completed

1. Define and snapshot the authoritative registration, current FHRS evidence and valid insurance documents for the event, including verification and expiry.
2. Generate a private, event-specific bundle containing actual evidence and the confirmed-menu allergen matrix. Explicitly represent missing evidence instead of claiming it is on file.
3. Persist the pack privately; offer authorised customer retrieval and staff delivery status. Queue generation/email with idempotent retries and failure alerts.
4. Test missing/expired evidence, confirmed-menu amendments, booking/customer access isolation, retry behavior and the complete evidence contents.

Relevant areas: catering-bookings service/module and tests, vendor document/compliance/FSA records, private storage, notification outbox and customer booking views.

Alternative: obtain legal approval to amend clause 8.5 to match the summaries actually delivered. **Neither the pack nor the clause was changed in this task.**

## Verification and release state

API and Admin typechecks passed. Targeted API tests and read-only SQL checks passed. API restarted successfully with zero compilation errors; the public homepage renders. Signed-in legal/vendor screens were not visually verified.

Existing notification backlog and missing Slack alert configuration remain operational warnings; they were not modified here.

Changes are in the workspace, not published. No production migrations or data repair were performed.
