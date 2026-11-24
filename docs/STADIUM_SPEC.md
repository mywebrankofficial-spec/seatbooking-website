# Arena: 3D stadium ticketing (product + visual spec)

Second product in the SeatView codebase. The user starts above a stadium seen from the sky, drills down stand → tier/block → seat, sees the real view from that seat, can upgrade to a VIP skybox, and confirms the ticket. Desktop-first full-screen browser app, also responsive. Currency AED. Venue is called "Arena" (no real stadium, club or brand names).

## 0. Reference video, second by second (THE visual spec)

28 s recording of a MacBook. Every interaction is hover to preview, click to go deeper; the camera moves smoothly between levels.

**Overall look**: photoreal 3D modern football stadium with a **white curved roof shell**, **red seats**, **blue accent bands along the tier edges**, and a **green striped pitch**. The stadium sits in a **park**: lush green grass, dense dark-green tree clusters, winding grey roads/paths. **Afternoon sunlight with strong shadows** (the stadium casts a big shadow on one side). UI = minimal floating cards in **light frosted white**, rounded corners, dark text, prices in **red/orange**. Hover/selection accent = vivid orange **#F26A21**. Taken seats **blue**; seats outside the active block **red**.

- **0:00–0:01 Aerial, hovering stands.** Camera high above, angled, whole stadium small in the centre of the park. Hovering a section of the bowl lights that stand orange (whole wedge tinted). Floating card near the hovered stand: small grey "FROM", bold stand name ("South-West Corner"), green dot "79 left" | divider | small grey "AED" and price "850" in red.
- **0:02 Click North Stand.** Camera dives, zooming in and tilting so the bowl fills the screen; roof rim curves around the top. Clicked stand stays orange: a wedge of seats from pitch level to the top. Pitch visible in the centre with crisp white lines.
- **0:03–0:05 Stand level.** Closer, more top-down over that stand. Three tiers of red seats separated by blue bands and concrete walkways, radial aisles dividing tiers into blocks. Pitch edge at the bottom of the frame. Hover a block → card "UPPER TIER / Block 331 / ● 73 left / AED 850", or "MIDDLE TIER / Block 234 / ● Sold out (red dot) / AED 1,250". Sold-out blocks look slightly greyed. Cards cross-fade block to block.
- **0:06 Click Block 232.** Camera drops close, block almost straight on. Clicked block glows orange for a moment. Neighbouring blocks show individual red seats with many blue (taken) seats scattered. Concrete stair aisles between blocks.
- **0:07–0:08 Seat level.** Active block's seats turn white/light grey (available); taken ones red or blue. Hover taken: "ROW 11 · SEAT 12 / Taken / AED —". Hover available: tiny thumbnail of the view on the left, small grey "BLOCK 232", bold "Row 10 · Seat 8", "AED 1,250" in red.
- **0:09 Click the seat.** Camera zooms right into the row with slight motion blur. Seats large, pale grey/lavender plastic; chosen seat bright orange mid-frame.
- **0:10–0:12 Ticket card.** Background stays on the close-up seats, softly out of focus (DOF). Wide ticket-shaped card in the centre with a perforated stub on the right. Left: photo-like render of the view from that seat (pitch, goal, stands) with dark pill "● Your view". Middle (white): small grey "NORTH STAND · MIDDLE TIER", bold "Block 232"; label/value pairs "ROW 10", "SEAT 8", "GATE N3"; orange pill "Upgrade · +2,500 AED" with small grey "Keep my seat" link under it. Right stub: small "AED", a barcode, "1,250" in red.
- **0:13 Click Upgrade.** Card flips/crossfades to a **dark VIP version**: left = inside of a glass skybox (black leather chairs, view of the stands) with pill "● Your view from the box"; middle (dark): small "VIP · LEVEL 2", bold white "Skybox 12", "SEATS 8", "ENTRY VIP", white pill "Choose your VIP seat →". Right stub: barcode and "3,750".
- **0:14 Click Choose your VIP seat.** Card disappears; camera pulls back out of the row (red seats close up, one blue seat), rises and turns.
- **0:15–0:17 Skybox level.** Camera faces a row of glass-fronted hospitality boxes built into the stand under a bright blue fascia band; red tiers above and below. Inside each box: rows of black leather recliner chairs, warm wood walls, interior lights. Hover a box: "VIP · LEVEL 2 / Skybox 11 / ● Sold out / AED 3,750".
- **0:18–0:19 Enter Skybox 12.** Camera glides forward through the glass into the box. Dark leather chairs, one highlighted tan/orange (Seat 5). Faint reflection of the VIP card on the glass.
- **0:20 View from the skybox seat.** Camera turns from the chair toward the pitch; the stadium interior opens up: huge white roof truss structure with a big video screen hanging under it; red bowl wrapping around; a sun shaft lighting part of the pitch bright yellow-green; goals and pitch lines. Holds at seat eye level.
- **0:21–0:22 Final card.** Card fades in top centre: small grey "FROM SKYBOX 12 · SEAT 5", bold "Another view", "● VIP · Level 2", "AED 3,750" in red. Bottom-right buttons: "Confirm ticket" (solid orange) and "Choose another seat" (white).
- **0:23–0:27 Back to aerial.** Camera flies all the way back up (smooth reverse of the dive). Hovering stands: "South Stand", "North-West Corner · 12 left · AED 850", "South-East Corner".

**Key takeaways**: four nested zoom levels Aerial → Stand → Block → Seat, plus Seat → Skybox → Box seat. Each level: hover preview (orange highlight + floating card), click to go deeper. Camera always flies continuously, no page cuts. Ticket is the main UI element with the VIP upsell built in.

## Zoom levels & interactions
1. **Aerial**: ~350 m up, 35° tilt, slow idle orbit (1°/s, paused on hover). Hover stand → orange tint + card "FROM / {stand} / ● {n} left / AED {min}". Click → Stand.
2. **Stand**: top-down-ish shot. Hover block → tint + card "{TIER} / Block {id} / ● {n} left | Sold out / AED {price}". Click available → Block. Sold-out block shakes gently and says "Sold out".
3. **Block**: close front-on shot; real seats with states. Hover available seat → card with live-rendered view thumbnail, "BLOCK {id}", "Row {r} · Seat {s}", price. Hover taken → "ROW · SEAT / Taken / AED —". Click available → Seat.
4. **Seat → Ticket**: fast dolly into the row + DOF; chosen seat orange; ticket card. Clicking the view thumbnail flies into the seat eye and turns to the pitch, with "Confirm ticket" / "Choose another seat". "Keep my seat" → checkout. "Upgrade · +X AED" → VIP face.
5. **VIP**: dark card. "Choose your VIP seat →" flies out/up to the skybox ring; hover box card; click box → glide through glass; chairs pickable, selected chair tinted orange; then turn to the pitch: "Another view" card + Confirm / Choose another seat.

**Navigation**: Back = Esc, top-left back button, breadcrumbs (Stadium / North Stand / Block 232 / Row 10 Seat 8); each flies back one level. "Choose another seat" → Block level. Mouse wheel zooms smoothly within the current level (clamped); scrolling past a threshold moves one level deeper/back with snapping. Mobile: first tap previews, second selects; pinch zoom; cards become bottom sheets. Keyboard: arrows move the highlight between stands/blocks/seats; Enter selects.

## Seat colours
Other blocks: red. Taken: blue. Available in active block: light grey/white. Hover: lighter orange. Selected: orange. Sold-out block: desaturated + light grey overlay.

## Premium details
Hover cards: 150 ms fade + 8 px rise; prices roll. Highlights ease in/out. During long flights: DOF blur up, cards fade. Idle aerial: gently moving tree shadows, slow cloud shadow. Skybox glass: subtle reflections; warm point lights inside. Sun shafts (light cones) when looking at the pitch. prefers-reduced-motion: crossfades instead of flights.

## Don't
No paid/licensed models, no real club branding or real stadium names. Never fake the seat view with a stock image: render it from the real 3D seat position. Don't break the cinema. No small label line above headings in page sections.

## Acceptance
- Aerial: each of the 8 stands highlights orange on hover with a correct card.
- North Stand → "Block 234 Sold out" and "Block 331 73 left" cards → Block 232 → seat hover cards show taken/available correctly.
- Row 10 Seat 8 → ticket: Block 232, Row 10, Seat 8, Gate N3, AED 1,250, real rendered view.
- Upgrade → VIP card (Skybox 12, AED 3,750). Choose VIP seat → skyboxes → Skybox 11 Sold out → enter Skybox 12, Seat 5 → pitch view with Confirm ticket / Choose another seat.
- Back/Esc/breadcrumbs work from every level, camera always flies back smoothly.
- /stadium scroll flythrough works. Cinema still passes. Build zero type errors, no console errors, aerial 50 fps+ on desktop.
