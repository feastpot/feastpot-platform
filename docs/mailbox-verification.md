# Mailbox Verification : Feastpot contact addresses

Three email addresses appear across the Feastpot product. Each must be
monitored and capable of meeting the **5 business day** response commitment
stated in the Vendor Terms of Agreement (clause 15.2).

## Addresses in use

| Address | Purpose | Defined in |
|---|---|---|
| `support@feastpot.co.uk` | General customer and vendor support | `PLATFORM_FACTS.support.email` |
| `compliance@feastpot.co.uk` | Compliance queries: document review, verification, account closure, terms acceptance PDFs | `PLATFORM_FACTS.contact.complianceEmail` |
| `appeals@feastpot.co.uk` | Formal enforcement appeals (vendor terms clause 18.1) and dispute stage-2 reviews | `PLATFORM_FACTS.contact.appealsEmail` |
| `privacy@feastpot.co.uk` | Data subject requests, GDPR enquiries | Used in `apps/web/src/app/legal/privacy/page.tsx` and `apps/vendor/src/app/settings/close-account/page.tsx` |

## Verification checklist

Before going live (and after any team or infrastructure change), confirm each
address passes the following checks:

### 1. Delivery test
Send a test email to each address from an external account (e.g. Gmail).
Confirm receipt in the inbox within 5 minutes. Document the date.

### 2. Auto-reply or acknowledgement
Confirm each address either:
- Sends an auto-reply acknowledging receipt within one working day, **or**
- Is actively monitored by a named person who is responsible for the 5-day SLA.

### 3. Monitoring ownership
| Address | Owner / team | Monitoring tool |
|---|---|---|
| `support@` | Customer support team | Helpdesk (e.g. Zendesk / Freshdesk) |
| `compliance@` | Compliance lead | To be confirmed |
| `appeals@` | Legal / compliance lead | To be confirmed |
| `privacy@` | DPO or legal lead | To be confirmed |

> **Action required**: fill in the "To be confirmed" rows before processing
> any vendor enforcement actions or data subject requests. An unmonitored
> `compliance@` or `appeals@` mailbox turns a compliant appeal process
> (14-day window, 5-day acknowledgement) into a non-compliant one.

### 4. SLA commitment cross-check
The vendor terms state a 5 business day acknowledgement for appeals (clause
18.1). Confirm the team responsible for `appeals@feastpot.co.uk` has:
- A documented triage process for incoming messages
- Cover arrangements for holidays and absences
- Escalation path if no response is sent within 3 business days

### 5. Re-verification schedule
Re-verify all four addresses:
- After any email platform migration
- After any team restructure
- At least once per calendar quarter

## Related code

- `packages/config/src/platform-facts.ts` : canonical source for support@,
  compliance@, and appeals@ addresses
- `apps/api/src/platform-facts.spec.ts` : CI test that vendor portal files
  reference PLATFORM_FACTS rather than hardcoded strings
- `apps/vendor/src/app/settings/close-account/page.tsx` : uses privacy@
- `apps/web/src/app/legal/privacy/page.tsx` : uses privacy@ (multiple occurrences)
