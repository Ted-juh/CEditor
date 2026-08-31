# The rack canvas: a patch you can see

Status: **a plan, not a commitment.** Nothing here is built. It is written to be argued with, and
to be added to — the running log at the end is the place for new ideas as they arrive.

## The complaint

"Too clunky, it feels like the 80s." That is a fair reading of what is on screen, and it is worth
being specific about *why*, because "make it prettier" is not actionable and the actual faults are.

The instrument host today is **one scrolling column of labelled rows**. The rack is a stack, the
MIDI chain is a stack under it, the inserts are a stack under that, then the mixer, then the
control pages. Every one of them is a list of text with buttons on the right.

Four concrete consequences, all of which we hit while using it:

1. **The signal path is described, not drawn.** A heading that says `Inserts — Stage Keys` tells you
   the chain belongs to that part. It does not show you that the part's audio goes through those
   inserts, into a bus, through the bus's inserts, into the master. You have to hold the topology
   in your head, and the moment there are two instruments and a bus, you cannot.
2. **The focused part is invisible state.** `Load` in the browser targets whichever part is
   focused, and focus is a border colour you have to notice. Adding a part and then clicking Load
   put the instrument somewhere unexpected — that is a design fault, not a user error.
3. **Nothing is draggable.** Reordering a MIDI module or an insert is ▲/▼ buttons, one position per
   click. Moving a part to a bus is a dropdown. These are all *spatial* operations expressed as
   text controls.
4. **The browser is a text list.** Plug-ins are the most recognisable objects in the whole
   application — every one has a look — and they are presented as two lines of grey type.

## The proposal

From the owner, in his own framing, and it is the right instinct:

- **Drag and drop** a plug-in from the browser onto an instrument bar to load it.
- Every entry point — an instrument, an effect — is a **thumbnail with its own bar**, laid out on a
  canvas and **coupled by lines**: a simple start→end wire, horizontal or vertical. Reason's
  cabling, except the device is a thumbnail rather than a full front panel.
- A chain of effects reads like a **timeline the signal follows**.
- **Clicking a thumbnail opens its editor in a bottom display panel** — the arpeggiator, the step
  sequencer, the mixer, panning, whatever that node is. One dock, many editors.
- **The browser's plug-ins become thumbnails too.**

## Why this is cheaper than it looks

**The document is already a graph.** This is the part worth internalising before anybody estimates
the work. `Performance` holds parts, buses, returns and a master chain; every node in it already
has a stable, minted-once identity — `partId`, `effectId`, `slotId`, `busId`, `returnId` — and
every edge already exists as data:

| Edge | Where it lives today |
|---|---|
| instrument → its inserts, in order | `RackPart::effects` (array order *is* the chain) |
| part → group bus | `RackPart::destinationBusId` |
| part → return (a copy) | `RackPart::sends` |
| bus → bus, or master | `BusChain::destinationBusId` |
| return → master | implicit; every return rejoins the master path |
| part → an output pair | `RackPart::outputPair`, `extraOuts` |
| keyboard → zone → MIDI modules → instrument | `PartMidiRules` + `RackPart::midiChain` |

`InstrumentRackHost::rewireAudio` already walks exactly this structure to build the live
`AudioProcessorGraph`. A canvas is therefore **a second view of a graph that exists**, not a new
model — and the model already refuses what the canvas must refuse (`busRoutingWouldLoop`).

What is genuinely missing is short:

- **Positions.** Nothing in the manifest says where a node sits.
- **Sockets.** Connections are implicit today (an array's order, a field naming a destination).
  A wire UI needs a place to grab and a place to drop.
- **A selection store.** "What is the dock showing?" has no answer yet.
- **Thumbnails.** There is no artwork for a plug-in class anywhere in the system.

## The one tension that decides the design

**Reason's wires work because Reason is arbitrarily routable. This engine is not.**

A part's inserts are a *serial* chain — instrument, then effect 1, then effect 2, then the fader.
There is no split, no parallel branch, no feedback (buses refuse cycles by design). If we draw
free-floating wires between free-floating boxes, we promise a patchbay we do not have, and the
first thing a user will try is the first thing that fails.

Two honest ways out:

- **(A) Constrain the canvas to the topology the engine supports.** A part is one *lane*: a fixed
  row of sockets in signal order. You can drag a node into a lane, reorder within it, and drag the
  lane's output onto a bus, a return or the master. Only legal drops light up. Wires exist where
  the model genuinely has a choice — part→bus, bus→bus, part→return, and nowhere else.
- **(B) Generalise the engine into a real modular router** — arbitrary splits, parallel chains,
  per-node fan-out.

**(A) is the recommendation**, and not as a consolation prize: it is a truthful picture of the
signal path, it is buildable on the model as it stands, and it cannot be drawn into a state the
audio graph will refuse. (B) is a far larger job that changes `rewireAudio`, latency reporting and
the manifest, and it should be argued for on its own merits later, if at all.

There is a second structural fact the drawing has to respect: **MIDI and audio are two different
graphs.** MIDI runs keyboard/transport → zone filter → `midiChain` → instrument. Audio runs
instrument → inserts → fader → bus/master/output pair. The instrument is where one becomes the
other. Reason solves this with front/back and cable colour; the equivalent here is a node with
**MIDI sockets on top and audio sockets on the bottom**, with the two wire families visually
distinct. Trying to draw them as one undifferentiated flow will read as clear and be wrong.

## Thumbnails: what is actually possible

VST3 ships no icon. There is nothing to read off disk. So:

- **Generated tiles, immediately.** A colour and a mark derived from the class identity (`ceId`),
  with the vendor's initial and the plug-in name. Deterministic, instant, needs nothing loaded, and
  makes the browser scannable by shape and colour rather than by reading. This alone fixes most of
  complaint 4.
- **Cached editor snapshots, opportunistically.** The first time a plug-in's editor opens, capture
  it, downscale it, and cache it under the data directory keyed by `ceId` + plug-in version. From
  then on the node shows the real thing. This must never happen at scan time — snapshotting a
  library of several hundred plug-ins means instantiating several hundred plug-ins, which is the
  scanner's whole reason for existing in a separate process.
- **A user override.** Point a class at an image. Cheap to add once the cache path exists.

## The staged path

Ordered so that each stage is useful shipped alone, and none of them requires the next one.

1. ~~**Selection + the bottom dock.**~~ **BUILT, 2026-08-31.** The focused part's editors — zone,
   MIDI modules, inserts, routing — plus the parameter view and the rack-wide chains moved out of
   the rack column into a resizable, collapsible strip along the bottom, tabbed and driven by what
   is focused. No model change and no new commands: the same components, in one place, addressed
   by a tab instead of by scrolling.

   Two things it turned out to be worth beyond tidiness. The editors are now **as wide as the
   window** rather than as wide as a column, which is the difference between an arpeggiator grid
   you can draw on and one you cannot. And the tab list is **derived from what applies** — with no
   part focused only the rack-wide chains are offered, and the parameter tab appears when there is
   something to inspect — so the dock cannot show you a pane for something that is not there.

   The stack also had a **second dead layer** in it: 124 lines of arpeggiator and step-grid script
   in `InstrumentHostView` left behind when those editors moved to `MidiChainPanel`, matching the
   dead CSS removed the same day. An extraction is not finished until the markup, the styles *and*
   the script have gone.
2. ~~**The canvas as a read-only picture.**~~ **BUILT, 2026-08-31.** A List/Canvas switch on the
   rack column. Canvas draws the graph the document already holds: instruments as sources on the
   left, each bus one column past the deepest thing feeding it, the master last, returns in a band
   of their own because they take a *copy* rather than carrying the signal. Solid wires for the
   path, dashed for sends. Clicking a part focuses it, which is what clicking its row does, so the
   dock follows; nothing else is clickable and every other node says where it *is* edited.

   The layout is a pure function (`rackCanvasLayout` in the store) rather than a component
   measuring the DOM, so the arithmetic is tested in node: columns, which wires exist, and the two
   cases a picture can get actively wrong.

   The first of those was worth building it to find. A wire that skips a column was drawn straight
   **through** whatever occupied the column it skipped — a part going direct to the master crossed
   a bus's box, which reads as "it goes in there", the one question the picture exists to answer.
   Long runs now drop into a lane under the nodes and come back up, the way a schematic routes
   around a part rather than over it. The second: a hand-edited manifest carrying a routing cycle
   must not hang the layout, so depth resolution is guarded and a bus pointed at itself falls back
   to the master exactly as the loader does.

   The List view stays and stays first. It is keyboard-navigable and carries the per-part mixer;
   the canvas is neither, and neither one gets to be the only way in.
3. ~~**Make it interactive.**~~ **BUILT (routing), 2026-08-31.** Drag a part or a bus onto its
   destination; drag an instrument from the browser onto a part to load it there. Every drop
   issues a command that already existed (`setPartDestination`, `setBusDestination`,
   `loadInstrument`) — the canvas decides what is *legal*, the service decides what *happens*,
   exactly as the dropdowns do.

   Legality is a pure function (`canvasDropTargets`) and it is the whole reason the constrained
   canvas is honest: legal targets light up, everything else refuses the drop outright, so the
   picture cannot be drawn into a routing the engine would turn down. A node's current
   destination is not offered again either — a drop that changes nothing reads as a drop that
   failed.

   Sharing that function with the mixer found a real gap. The mixer's destination dropdown
   excluded only the bus *itself*, and its comment claimed loops were "never offered here": an
   indirect loop (A into B, then B into A) was still on the menu, and picking it got you an error
   instead of a destination. Both now ask `busDestinationWouldLoop`.

   Two HTML5 drag-and-drop traps, recorded because neither reports anything when it goes wrong:
   a `dropEffect` that does not match the source's `effectAllowed` cancels the drop **silently**
   (an instrument is copied, a node is moved, and saying "move" over a copy source loses it); and
   `dragleave` fires when the pointer crosses onto a *child* of the target, with `relatedTarget`
   null during a drag in Chromium, so the event cannot tell "left the box" from "moved within
   it" — the highlight switched off while you were still over the box you were aiming at.
   `dragover` owns the highlight now and the end of the drag clears it.

   **Effects joined it, 2026-08-31.** The browser listed instruments only, so an effect could
   not be dragged anywhere — the only way to reach one was a dropdown on whichever chain you
   happened to be looking at, with no search, no vendor and no tile, while effects are
   first-class in every chain the model has. They now have the same list, tile and drag, and
   an effect drops onto anything that HAS a chain: a part, a bus, a return, the master — which
   is exactly the four ids `chainFor` accepts, so the drawing offers precisely what the service
   takes.

   The `dropEffect` trap bit a **second** time here, which is the interesting part. The rule
   had been written down after the instrument drag, and the code still keyed on
   `kind === 'instrument'` — so an effect got "move" over a "copy" source and the drop vanished
   silently again. The durable fix is not the value but the category: anything dragged from the
   CATALOGUE is a copy, anything dragged INSIDE the canvas is a move. A rule about a kind
   breaks when a kind is added; a rule about a category does not.

   **Not built:** dragging to reorder a chain (inserts and MIDI modules still reorder with ▲▼ in
   the dock), and dropping an instrument on empty canvas to make a new part — that one needs a
   native add-and-load transaction, since add and load are two commands and the new part's id
   only arrives on the next state push.

   Keyboard equivalents exist by construction rather than by addition: every drop has a control
   that still does the same job — the mixer's destination dropdowns, and the browser's Load
   button — which is why the List view stays first.
4. **Thumbnails.** ~~Generated tiles~~ **BUILT, 2026-08-31**; snapshots and overrides still to
   come.

   A tile is *derived*, not found: a hue, a pattern and two letters, all from the catalogue's
   stable `ceId`. Same class, same tile, on every machine and after every rescan — which is what
   makes it recognition rather than decoration, and why a rename moves the letters but not the
   colour. They are on the browser rows, the rack rows, the library rows and the canvas nodes.

   The pattern is not ornament. Colour alone excludes anyone who cannot separate two hues, so the
   same hash picks a second, non-colour channel, and a test asserts the patterns actually spread
   rather than all landing on "plain".

   **Still to build: the real snapshot.** Capture the plug-in's own editor the first time it
   opens (`Component::createComponentSnapshot`), downscale it, and cache it under the data
   directory keyed by `ceId` + plug-in version. Two things decide the design and neither is the
   drawing: it must never happen at *scan* time, because snapshotting a library of several
   hundred plug-ins means instantiating several hundred plug-ins, which is the whole reason the
   scanner is a separate process; and the WebView needs a path to the cached file, so this is
   native work — a virtual-host mapping or a per-thumbnail event, not another field on every
   state push. The generated tile stays as the fallback whenever no snapshot exists, the same
   pattern as auto-layout versus saved positions.
5. **Persisted positions**, optional: `x`/`y` per node in the manifest, with auto-layout as the
   fallback when they are absent, so an older session and a hand-written manifest both still open.
   The repo's existing habit — migrate by construction, never refuse a file for a missing field.

## What must not be lost on the way

- **Keyboard operability.** The current list UI is fully keyboard-navigable. A canvas is not, for
  free. The list view stays as a peer view, not a casualty — and the canvas gets keyboard
  equivalents for every drag.
- **The floating editor windows.** Several vendor GUIs open at once is a feature people asked for.
  The dock is for *our* editors; a plug-in's own window still floats.
- **The CTRL49 pages.** Control pages address parameters by identity and are unaffected by any of
  this. If anything the canvas should make page assignment more obvious, not compete with it.
- **Honesty about latency.** Bus latency is reported and not compensated. If wires are drawn, the
  slow path should be visible on the wire rather than buried in a number.

## Open questions

- Does the canvas replace the rack list, or sit beside it as a toggle? (Recommend: beside it, until
  it is demonstrably better.)
- One canvas for the whole performance, or one per part with a performance-level overview?
- Where do the control pages live in this picture — a node type, a dock tab, or unchanged?
- How much of the CEditor panel-designer machinery can the dock reuse? The two problems rhyme.

## Running idea log

New ideas go here with a date, so nothing gets lost between sessions.

- **2026-08-31** — the original sketch above: drag-and-drop from the browser, thumbnail nodes on
  their own bars, Reason-style start/end wires horizontal and vertical, effects reading as a
  timeline the signal follows, a bottom display panel that shows whatever node is selected
  (arpeggiator, step sequencer, mixer, panning), and thumbnails in the plug-in browser.

- **2026-08-31** — **the controller itself as a picture in the dock.** Setting up hardware controls
  should not be a list of eight text rows either. The dock shows a drawing of the connected
  surface — its keys, its encoder row, its pads, its faders — laid out the way the hardware
  actually is. Click a segment (the encoders, the pads, a key zone) and it zooms to that section at
  a workable size; a back button returns to the whole instrument.

  *Why it fits:* same dock, same selection idea as the rack canvas, pointed at hardware instead of
  signal. Assignment is inherently spatial — "this knob" is a position, and today it is row 3 of a
  list.

  *What already exists:* `SurfaceProfile` (`CE/src/ControlSurface/SurfaceProfile.h`) is the right
  home, and it is already built on the rule that a surface describes itself rather than being
  assumed. It carries `SurfaceCapabilities` — `encoders`, `faders`, `pads`, `padBanks`, display
  size, transport buttons — and the registry is keyed by a stable `profileId` ("akai-ctrl49"), so a
  Performance already names the surface it was authored on. Control pages already bind by parameter
  identity with MIDI learn behind them, so the drawing issues commands that exist rather than new
  ones.

  *What is missing, and the fork in the road:* capabilities are **counts, not a layout**. No
  positions, no sizes, no groupings, no key count at all. Two ways to go:

  - **Generic, from the counts we have.** A row of N encoders, a grid of N pads in banks, N faders,
    a generic keybed. Works for every controller the moment its profile exists; looks like nobody's
    hardware in particular.
  - **A real layout per profile.** An optional layout block — normalised positions and sizes per
    control, named regions — so a CTRL49 looks like a CTRL49. Better, and it is per-controller work
    somebody has to do and keep correct.

  The sane order is generic first, with the layout block optional and the generic drawing as the
  fallback whenever a profile has none — the same pattern as auto-layout versus saved positions on
  the rack canvas. **A drawing hardcoded to the CTRL49 is the one option to refuse:** the whole
  point of `SurfaceProfile` is that support is claimed by conformance, not by special-casing one
  device in the UI.

  *Worth having once it is spatial:* live feedback on the picture — the encoder you are turning
  lights up, an unassigned control is visibly empty, a pad shows what it fires — and dragging a
  parameter from the list onto a knob to assign it. That is the version that beats a list rather
  than merely replacing it.

  **BUILT, 2026-08-31 — the drawing.** `SurfaceControl` and `SurfaceLayout` are now an optional
  block on `SurfaceProfile`: normalised positions, a kind, a label, and an `index`. A dock tab
  draws it, region chips zoom to the encoders, pads, faders, buttons or keys, and a back button
  returns to the whole instrument. The CTRL49's layout is authored from a straight-on product
  photo — traced into coordinates rather than shipped as an image, because a product photograph
  belongs to its maker and this repository is AGPLv3.

  `index` turned out to be the field the whole thing rests on. -1 means *drawn, labelled and
  honestly inert*; anything else is what the runtime calls the control — encoders 0..7 as
  `Ctrl49Reducer` reports them, pads 1..8 as `buildPadRgb` addresses them. Without it, clicking a
  picture would reach whichever control looks right rather than the one that is.

  That distinction resolved a discrepancy the photo exposed. The profile declares `faders = 0`
  and the keyboard plainly has nine. Both are true and they answer different questions:
  capabilities say what CEditor can **drive**, the layout says what is **there**. Conformance now
  ties them together by checking the *addressable* count of each kind against the capability, so
  nine drawn faders and zero mapped ones is a statement the tests enforce rather than an omission
  nobody noticed. A layout that claimed eight encoders while the profile promised six would fail.

  The photo also corrected the profile's own label: it registers as "Akai Advance CTRL49", vendor
  "Akai", and the hardware is an **M-Audio CTRL49**. Sibling inMusic keyboards that both drive
  VIP, which is presumably how they got merged. The display name and vendor are fixed; the
  `profileId` stays `akai-ctrl49`, because it is identity and sessions already name it — the same
  trade this repo refuses everywhere else.

  **What rendering it found, that the numbers could not.** Every control was inside the unit,
  every index was right and every count agreed — and the drawing still had a Page button sitting
  on top of Preset, Main on the D-pad, favourite 4 under the first pad column, and the encoder
  bank row drawn straight through the encoders above it. Ten overlapping pairs, invisible in a
  list of coordinates and obvious the moment it was on screen. Conformance now refuses
  overlapping controls, which is the check that makes a traced layout maintainable rather than
  a thing nobody dares touch.

  Long labels were the other half: a 0.02-wide box clipped "Master volume" to "ster volu", which
  reads as damage. Labels are now short enough for their boxes and the tooltip carries the
  sentence.

  Still not built: live feedback (the encoder you are turning lighting up), and assigning by
  dragging a parameter onto a knob.
