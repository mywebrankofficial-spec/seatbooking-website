# SeatView

Cinema seat booking where you pick a seat on a 2D map and the camera flies into a real 3D auditorium to show the view of the screen from that exact seat.

## Run it

```bash
npm i
npm run dev          # http://localhost:3000  (booking flow: /book/s-1945)
```

Other scripts: `npm run build`, `npm run lint`, `npm run typecheck`, `npm run test:e2e` (build first; Playwright starts `next start` on port 3100 and uses the real GPU; set `PW_SOFTWARE_GL=1` on machines without one, which is much slower).

Optional real trailer on the cinema screen: put a clip in `public/media/` and set `NEXT_PUBLIC_TRAILER_URL=/media/trailer.mp4`. Without it a procedural desert-dunes film plays.

## How it fits together

- `lib/hall-geometry.ts` is the single source of truth for every position. The 2D map is a literal top-down projection of the 3D hall, and the overhead 3D camera projects onto the same pixel rect, so the map "becomes" 3D.
- `store/booking.ts` holds `progress` (0 = 2D map, 1 = seated). GSAP (`lib/transitions.ts`) only tweens that number; `components/three/CameraRig.tsx` turns it into a camera pose every frame (`lib/camera-path.ts`). Sheet drags and wheel scrolls scrub the same number.
- Seat stats (distance, field of view, offset, zone) come from `computeStats()`, never hardcoded.

| Folder | What |
| --- | --- |
| `components/seatmap/` | Screen A: 2D seat map, showtime pills, bottom bar |
| `components/three/` | 3D auditorium (instanced velvet seats, curved screen + film shader, RectAreaLight), camera rig, landing rig |
| `components/seatview/` | Screen B: header pill, draggable bottom sheet, stat tiles, mini map, swipe gestures |
| `components/booking/` | Checkout sheet and confirmation ticket with QR code |
| `components/landing/` | `/` marketing page with Lenis + ScrollTrigger flythrough |
| `lib/api.ts` | Mock API (`getShowtimes`, `getSeats`, `holdSeat`, `confirmBooking`); swap for real calls |
| `tests/e2e/` | Playwright: B4 → F8 → I12 loop, sheet-drag scrub, booking, landing |
| `docs/` | Product spec and screenshots |

## Notes

- The screen is 11.8 m wide (not 14 m / 18 m) so the reference stats hold: B4 = 6.3 m / 86° / 2.2 m left, F8 = 9.8 m / 62° / 0.3 m right, I12 = 13.3 m / 48° / 3.3 m right.
- No WebGL: the seat view falls back to pre-rendered images per zone in `public/media/fallback/` (rendered from the real 3D scene).
- Interactions in Screen B: drag the sheet down (or scroll up) to scrub back to the map; drag it up for details; swipe left/right for neighbouring seats, up/down for rows; arrow keys and Escape work too.
