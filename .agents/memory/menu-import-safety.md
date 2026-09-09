---
name: Menu import safety
description: Durable trust and runtime constraints for extracting editable menu drafts from vendor uploads.
---

Menu OCR may extract candidate dish names, descriptions, explicit prices, and explicit portions only. It must never infer allergens or dietary claims. Every allergen declaration requires a separate, explicit vendor confirmation, and imported menu items must remain unavailable and held for moderation.

**Why:** OCR is probabilistic and uploaded menus are untrusted. Guessing allergy information can harm customers, while automatically publishing extracted content can expose incorrect prices or dishes.

**How to apply:** Keep original uploads private and retained after partial or total extraction failure. Upload all sources before processing, isolate per-file failures, cap candidate counts, and make application idempotent. Bound native OCR with file/page/pixel/output limits, aggregate deadlines, capped concurrency and queueing, pre-render PDF checks, and OS memory limits.