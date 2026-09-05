---
name: Referral QR fallback timing
description: How to keep referral QR previews and downloads immediately usable while persisted Storage assets are pending.
---

When persisted referral QR URLs are absent, the initial server render must include usable black-on-white PNG and SVG data URLs. Keep client regeneration as recovery and replace fallback URLs when background Storage generation finishes.

**Why:** Dynamically importing the QR library in a client effect left the preview and SVG download unavailable beyond the five-second assertion on a throttled connection.

**How to apply:** Generate both formats at 1024px from the canonical referral URL during the server render, serialize compact data URLs, and fetch independent page data in parallel. Do not remove the durable queue/Storage path.