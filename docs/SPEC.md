# SeatView: cinema booking with a 3D view from your seat (product spec)

Mobile-first cinema seat booking web app. The user picks a seat on a 2D seat map, then the camera flies into a realistic 3D auditorium and lands at that exact seat, showing the real view of the screen from it before booking. Scroll/drag drives the 3D camera smoothly.

## 0. Reference video, second by second (the visual spec)

26 s screen recording of a phone app (portrait, 720x1280) on a near-black background. The user picks three seats one after another (B4, F8, I12), sees the view from each, goes back to the map each time.

**Overall look:** dark charcoal app (backgrounds `#0d0d10` to `#151518`), white text, one bright mint green accent, deep red velvet seats in 3D. No bright colours except the green and the warm sandy film on the screen. Calm, premium, minimal, like an Apple product demo. All motion smooth and eased; nothing snaps.

**0:00 Empty seat map.**
- Header: "Meridian" white bold, "Hall 3 · Fri 14 Nov" below in small grey. Round dark back button left, round info (i) button right.
- Three showtime pills in a dark capsule: "17:30 2D", "19:45 IMAX" (selected: white pill, black text), "22:15 2D".
- Under the pills a thin glowing white curved line (the screen), bright in the middle, fading at both ends, soft grey light spilling down from it. "SCREEN" below in tiny, widely spaced grey letters.
- Large empty gap, then the seat grid: 9 rows A–I, tiny grey letters on the left. Each row: 3 seats, aisle, 8 seats, aisle, 3 seats. Small rounded squares.
  - Available: filled dark grey. Taken: thin outline, empty middle (~1/3 taken, scattered). Rows H and I mostly maroon (recliners), some taken outlines among them.
- Legend: ● Available, ○ Taken, ● Recliner, ● Selected (green).
- Bottom: rounded dark card "Choose your seat" and "—" on the left, disabled dark grey "Continue" pill right.

**0:01 Tap B4.** 4th seat of row B (first of the middle block) turns mint green with a tiny "4" inside. A soft grey circular halo briefly pulses around it (touch ripple). Card shows "Row B · Seat 4" (small grey) and "€12.50" (bold white). Continue becomes a bright mint pill with black text.

**0:02 Morph into 3D (after Continue).** The flat map is replaced by a real 3D auditorium seen from high above at a steep angle so it looks almost like the map. Rows of red velvet seats step up toward the bottom of the frame (stadium seating), dark aisles, thin step lines between blocks. Selected seat in the same mint green, second row from the front. Top of frame is dark (towards the screen). 3D layout matches the 2D grid exactly: the map "became" 3D.

**0:02.5 Camera flight.** Camera swoops down and forward while tilting up toward the screen. The giant screen sweeps into view in strong perspective (skewed trapezoid, top-right corner higher). A row of red seats at a slanting angle at the bottom right: clearly moving through 3D space, not a crossfade.

**0:03 Landed at B4.** Screen fills the top half, very big and close, cut off at the edges, slightly angled (B4 is left of centre). The screen plays a film: pale hazy sky over sandy desert dunes with a tiny lone figure walking, warm beige tones. Under the screen darkness, then the tops of two red seat backs from row A, large and close at the bottom of the view. Top-left back button; top-centre dark glass pill with a small green dot "View from B4". A dark bottom sheet with a grey drag handle slides up: tiny green caps "UP CLOSE"; "Row B, Seat 4" big white; "Standard · €12.50" grey; on the right a mini map (small arc + dot grid + one green dot near top-left); three dark stat tiles "6.3 m / to screen", "86° / field of view", "2.2 m / left of centre".

**0:04–0:05 Sheet fully open.** Buttons under the tiles: "Change seat" (dark pill, thin outline) and "Book · €12.50" (white pill, black text). Film keeps playing.

**0:06 Change seat.** Sheet slides down and away. Camera pulls back and up, seat backs drop out of frame.
**0:07** Back at the high overhead 3D angle, B4 still green. **0:08** 3D fades back into the 2D map; B4 still selected, card still Row B · Seat 4, €12.50.

**0:09 Pick F8** (row F, seat 8, middle block). B4 deselects, F8 green with "8". Card "Row F · Seat 8 €12.50".
**0:10** Overhead 3D, green seat mid rows, centred.
**0:11–0:13 View from F8.** Screen smaller, fully visible, centred, almost straight-on, filling about the top third; black space above and below. One large red seat back from row E centred at the bottom, flanked by others. Pill "View from F8". Sheet: "SWEET SPOT", "Row F, Seat 8", "Standard · €12.50", mini-map dot in centre, tiles "9.8 m to screen", "60° field of view", "0.3 m right of centre", buttons with "Book · €12.50".
**0:14–0:16** Change seat → overhead (F8 green) → 2D map with F8 selected.

**0:17 Pick I12** (recliner, back row I, right block seat 12). Card "Row I · Seat 12 €16.00".
**0:18** Overhead: green seat back-right, past the aisle.
**0:19–0:21 View from I12.** Screen far, small, seen at an angle from the right: trapezoid whose LEFT edge is taller. Lots of dark hall around it. Several rows of dark red seat backs below, curving away in perspective, some on the left in shadow; screen light glows faintly on seat tops. Pill "View from I12". Sheet: "FULL PICTURE", "Row I, Seat 12", "Recliner · €16.00", mini-map dot bottom-right, tiles "13.3 m", "45°", "3.3 m right of centre", "Book · €16.00".
**0:22 Change seat.** As the sheet drops the camera lifts straight up out of the seat; for a moment the green recliner itself is visible in the bottom-left foreground (proves the camera really sits in it).
**0:23** Overhead, I12 green back-right. **0:24** 2D map, I12 selected, €16.00.
**0:25 Deselect.** Tapping the selected seat again deselects; card back to "Choose your seat —", Continue disabled grey.

**Key takeaways:** 2D map and 3D hall are the same geometry; overhead 3D camera lines up with the 2D grid. Loop: map → overhead 3D → fly into seat → sheet up, always reversed going back. View changes realistically per seat (front: huge, close, angled; middle centre: balanced straight-on; back side: small, far, skewed). Stats and zone label change with the seat.

## 1. Stack
Next.js 15 App Router + TS strict + Tailwind v4; three + @react-three/fiber 9 + drei 10 (+ @react-three/postprocessing); GSAP (+ScrollTrigger) for camera tweens/scrubbing; Framer Motion for 2D UI + bottom sheet; Lenis for smooth scroll; Zustand; Inter font; lucide-react icons; qrcode.react. Mock data, `lib/api.ts` layer.

## 2. Look
Dark premium minimal. Phone layout max-width 430px centred on desktop, page bg `#0a0a0c`. Card radius 24px. Accent `#6EE7A0`. Recliner `#7a2e3a`. Text white, secondary 60% / 40% opacity. Tailwind tokens are in `app/globals.css` (`bg-app`, `bg-surface`, `bg-card`, `bg-seat`, `text-accent`, `bg-recliner`, `text-fg-2`, `text-fg-3`, `rounded-card`, `.glass`, `.tabular`).

### Screen A: Seat map (2D)
Top bar: round back button (left), centred "Meridian" + "Hall 3 · Fri 14 Nov", round info button (right). Showtime pills `17:30 2D`, `19:45 IMAX` (active white pill, black text), `22:15 2D`; format tag small caps next to time. Screen arc: glowing white curved arc, bright middle fading ends, soft radial light below, "SCREEN" widely letter-spaced tiny caps; it gently breathes. Seat grid A–I, row letters tiny/dim on the left, 3 | 8 | 3. Seats ~18px rounded squares radius 5px. Available `#2a2a2e` fill; taken 1px outline transparent; recliner (H, I) maroon; selected green with tiny dark seat number + soft white halo pulse on tap. Legend row. Sticky bottom bar (slightly lighter card): "Choose your seat" + "—" or "Row B · Seat 4" + "€12.50" bold (animated number roll); "Continue" pill disabled dark grey until selection, then green with black text. Standard €12.50, Recliner €16.00.

### Transition map → seat (~1.6 s)
On Continue (or double-tap seat): 2D map fades/scales slightly while the 3D hall fades in from a high near-top-down camera matching the map; camera dollies down+forward to the seat while tilting up (power3.inOut); lands at the seated eye (1.15 m above the seat, slightly behind centre) looking at the screen, row-in-front seat backs visible at the bottom; bottom sheet slides up.

### Screen B: View from seat
Back button + glass pill "● View from B4". 3D fills the screen; screen shows a looping muted film (desert dunes) with poster fallback; RectAreaLight from the screen so seat tops catch the light; dark walls, subtle floor, fog. Bottom sheet (dark glass, drag handle): green caps zone label (UP CLOSE rows A–C; SWEET SPOT rows D–G centre block; SIDE VIEW rows D–G side blocks; FULL PICTURE rows H–I), big title "Row B, Seat 4", subtitle "Standard · €12.50", mini-map thumbnail right with arc + green dot, three stat tiles (distance "6.3 m · to screen", fov "86° · field of view", offset "2.2 m · left of centre" / "centre"), buttons "Change seat" (outlined) and "Book · €12.50" (white). Stats come from `computeStats()`; never hardcoded.

### Reverse
Sheet down, camera rises/pulls back to overhead, canvas crossfades back to the 2D map with the seat still selected. Seat → different seat goes overhead then down (never cut).

## 3. Scroll & drag
- Screen B: dragging the sheet down or scrolling up scrubs the camera back along the same path toward overhead. Release past 50% completes to the map, otherwise snaps back.
- Dragging the sheet up expands it (seat type, accessibility note, "similar seats with better view" suggestions).
- Horizontal swipe on Screen B → neighbouring seat in the row (camera glides sideways, stats update live). Vertical swipe on the 3D area → one row forward/back.
- Landing page `/`: long scroll section (Lenis + ScrollTrigger, pinned canvas) flies the camera from the back of the hall to the front, stat tiles update as you scroll. Booking flow at `/book/[showId]`.
- `prefers-reduced-motion`: camera flights become crossfades.

## 7. Premium details
Seat tap: scale 0.9 → spring 1, halo pulse, `navigator.vibrate?.(8)`. Screen arc breathes. Price number roll. 2D map shows instantly; 3D preloads after first paint. WebGL unavailable → pre-rendered image per zone (`/media/fallback/<zone>.jpg`). Taken seats shake, not selectable. Metres one decimal, whole degrees.

## 8. Don't
No hardcoded stats. No fake 2D perspective images for the seat view (real 3D camera). No licensed external 3D models (procedural only). No section labels above headings / marketing copy inside the booking flow.

## 9. Acceptance
- B4 → camera behind row A, big screen fills the top; ~6.3 m / 86° / 2.2 m left of centre.
- F8 → SWEET SPOT, nearly centred, ~60° (geometry gives 62°). I12 → FULL PICTURE, Recliner €16.00, screen smaller and seen from the right.
- Change seat flies back to the map with the seat still selected; new seat + Continue flies to the new seat.
- Sheet drag down scrubs the camera smoothly and snaps correctly.
- No console errors; Safari iOS + Chrome Android. `npm run build` zero type errors.
