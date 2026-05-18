# Status update sound

Drop a short notification sound here as `status-update.mp3`.

Recommended:
- 0.5–1.0 seconds long
- Soft / pleasant tone (not a harsh beep)
- Free / royalty-free source: search "soft chime notification" or
  "gentle ding" on https://freesound.org or https://pixabay.com/sound-effects

The tracking page (`apps/web/src/app/orders/[id]/tracking/page.tsx`) calls
`new Audio('/sounds/status-update.mp3').play().catch(() => {})` whenever the
order status changes after the first load. If the file is missing the catch
swallows the error so the page still works - you'll just get a silent change.
