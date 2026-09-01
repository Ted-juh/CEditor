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

An earlier version of this section opened "VST3 ships no icon, there is nothing to read off
disk", and that was wrong — checked against the vendored SDK on 2026-09-01. VST3 defines
`Contents/Resources/Snapshots`: one PNG per class named by class UID, `_2.0x` variants for
hi-DPI, and `Contents/Resources/moduleinfo.json` naming each class beside its snapshot. It is a
directory listing, not an instantiation. Recording the mistake because the conclusion drawn from
it — generated tiles are all that is possible — outlived the premise by a whole increment.

In order of preference:

- **The vendor's own snapshot**, when the bundle ships one. Read during the scan that already
  runs, so it costs nothing extra, and it is the real artwork rather than something derived.
- **Generated tiles** for everything else, which is most plug-ins. A colour and a mark derived
  from the class identity (`ceId`), with the vendor's initial and the plug-in name.
  Deterministic, instant, needs nothing loaded, and makes the browser scannable by shape and
  colour rather than by reading. This alone fixes most of complaint 4.
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

   **Both built, 2026-09-01.**

   *Dropping an instrument on empty canvas* needed no native transaction after all, which is
   worth recording because this note said otherwise: `loadInstrument` with no partId already
   means "into a new part", added earlier for the first click on an empty rack. One service
   call, so there is never a window in which a part exists with nothing in it. The slot the
   part will land in is drawn dashed while an instrument is in flight, and the canvas reserves
   its height even at rest — otherwise the canvas grows the moment a drag starts and slides
   the target out from under the pointer aiming at it.

   *Reordering a chain by dragging* turned out to matter more than expected: the MIDI chain
   had ▲▼ arrows, and the INSERT chain had no reordering of any kind, so the only fix for
   putting the compressor after the reverb was to delete both and add them back the other way
   round. Inserts now have the arrows (which is the keyboard's version of the move, so the
   rule below is satisfied by construction) and both chains have a drag grip. The grip is
   draggable, never the whole row — a row of five buttons that also drags makes every button
   press feel like it might do something else.

   The one piece of arithmetic worth a test lives in `reorderIndexForDrop`: both the service
   and the mock take "move to this position AFTER the row has been lifted out", which is
   exactly one off from what the pointer is saying whenever the row travels DOWNWARDS. Get it
   wrong and the row lands one place short, in one direction only — the kind of bug that
   survives a demo and a screenshot. The test asserts the resulting ORDER rather than the
   index, because an index assertion can be wrong in the same way the code is.

   Keyboard equivalents exist by construction rather than by addition: every drop has a control
   that still does the same job — the mixer's destination dropdowns, and the browser's Load
   button — which is why the List view stays first.
4. **Thumbnails.** ~~Generated tiles~~ **BUILT, 2026-08-31**. ~~Vendor snapshots~~,
   ~~editor capture~~ and ~~user overrides~~ **BUILT, 2026-09-01** — all four sources of a
   plug-in's face are in.

   A tile is *derived*, not found: a hue, a pattern and two letters, all from the catalogue's
   stable `ceId`. Same class, same tile, on every machine and after every rescan — which is what
   makes it recognition rather than decoration, and why a rename moves the letters but not the
   colour. They are on the browser rows, the rack rows, the library rows and the canvas nodes.

   The pattern is not ornament. Colour alone excludes anyone who cannot separate two hues, so the
   same hash picks a second, non-colour channel, and a test asserts the patterns actually spread
   rather than all landing on "plain".

   **Vendor snapshots, 2026-09-01.** The scan worker now lists
   `Contents/Resources/Snapshots` while it has the module open and records a path per class;
   classes that shipped artwork arrive in the browser with a `snapshotUrl` and the tile draws
   the picture instead of the letters. Three decisions are worth keeping:

   *Attribution is exact or absent.* `moduleinfo.json` names each class beside its snapshot, so
   that is used when it is there; failing that, the only safe case is a module exposing a single
   class, where there is nothing to confuse. A multi-class module with no manifest gets no
   artwork on purpose — the wrong picture on a plug-in is worse than no picture.

   *The frontend never sees a path.* A snapshot lives wherever the vendor installed the plug-in,
   which is an arbitrary absolute path, and the WebView is a browser: handing it a path to fetch
   means a resource provider that serves any file it is asked for. So `PluginSnapshotRegistry`
   holds token → file, the state payload carries `/plugin-snapshot/<token>`, and the provider
   serves a token or nothing. The set of readable files is exactly the set the catalogue put
   there, which is the property that makes it safe rather than the string checks a path-based
   version would need.

   *The tile looks the URL up, it is not passed one.* A rack part and a canvas node know a
   `ceId` and a name and nothing else, so threading a URL through every call site would mean
   each one somebody forgot silently falls back to a generated tile — the failure you cannot
   see. One derived `ceId → url` map, read by the tile itself.

   In dev mode the page is served by Vite, so the relative URL goes to the dev server and 404s;
   the tile falls back, and a dev run looks like a machine whose plug-ins ship no snapshots.

   **Editor capture, 2026-09-01.** For the plug-ins that ship nothing — most of them — the
   picture is their own window, taken the first time the user opens it, downscaled to 256px
   and cached under the data directory keyed by `ceId` + version. It is served through the
   same registry as a vendor snapshot, and a vendor snapshot always wins: theirs is a picture
   of the plug-in, ours is a picture of whatever preset happened to be open.

   *`createComponentSnapshot` is not the answer, which is the thing worth writing down.* A
   hosted VST3 editor does not paint itself with JUCE. On Windows JUCE wraps it in an
   `HWNDComponent` whose own `paint()` fills black, and the plug-in draws into a foreign HWND
   the OS composites on top — so asking that component for a snapshot returns a perfectly
   valid image of nothing, which would then be cached for ever as the plug-in's face. The
   capture goes to the *window*: `PrintWindow` with `PW_RENDERFULLCONTENT` first (what reaches
   a plug-in drawing through DirectComposition or D3D), plain `PrintWindow` second, a GDI blit
   from the window's own DC third. `createComponentSnapshot` remains the path for a JUCE-drawn
   editor and the generic parameter editor.

   *Every gate fails towards the tile.* A blank result is never believed: the capture is
   retried at 900ms, 2.2s and 4.5s — a plug-in still loading its skin looks exactly like one
   that will never answer, and only waiting tells them apart — and a picture of one flat
   colour is dropped at three separate points before it could become a file. Nothing is
   cached on a maybe, because a wrong thumbnail is worse than no thumbnail.

   *Never at scan time*, for the reason above. A thumbnail is a side effect of the user
   opening an editor and nothing else. The pane and the floating windows take the picture
   because they hold the editor; the service decides whether one was wanted, where it goes and
   when it becomes visible, and pushes state itself so the tile changes without waiting for an
   unrelated rack mutation.

   *What is not verified.* The Windows capture body cannot be compiled or run off Windows, so
   a Linux build checks everything downstream of it — the blank test, the downscale, the
   encode, and every policy decision — and none of the pixel-fetching itself.

   **User overrides, 2026-09-01.** Click a plug-in's tile in the browser and pick a picture.
   It beats everything — the vendor's own included, because the user looked at what was there
   and decided otherwise — and it is a file of its OWN beside the capture rather than an
   overwrite of it, which is what makes "use its own picture again" restore whatever was there
   before instead of leaving the class with nothing. The chosen file is copied in and
   normalised to a thumbnail PNG rather than referenced where it sits: a picture in Downloads
   is one tidy-up away from a plug-in with no artwork and no explanation. The blank check is
   off for this one path only — a flat colour is a strange thing to choose and it is still
   exactly what was chosen; the check exists to catch a plug-in that failed to draw itself,
   and a person is not that.
5. **Persisted positions.** ~~Optional~~ **BUILT, 2026-09-01.**

   Drop a box on another box to route it, drop it on empty canvas to place it. That is what
   lets one drag mean two things with no modifier key, and it falls out of what the boxes
   already are: a part or a bus has a destination to change, a return and the master do not,
   so for those the drag only ever means "put it here" and nothing lights up to suggest
   otherwise.

   Positions are a side table on the Performance, not an `x`/`y` on `RackPart`, `BusChain` and
   `ReturnChain`. A canvas node is not a model object — the master has a box and no struct of
   its own — and all three would otherwise carry two fields the engine, the exporter and the
   parameter model have to ignore. One list, keyed by the node ids the canvas already uses for
   routing drops.

   Three refusals, each guarding something with no recovery: a position whose node has gone is
   dropped on save (left in, it eventually lands on whatever inherits the id — a new part
   appearing where nobody put it); a malformed position is skipped rather than fatal (refusing
   to open a rig because a coordinate was a string is an absurd trade for a drawing
   preference); a negative coordinate is clamped rather than refused, because it is still an
   intention and a box outside its own container can never be reached again.

   The COLUMN stays computed even for a placed box. It decides a wire's shape and whether a
   run counts as skipping, and those are facts about the signal, not about where the box was
   dragged.

   **Found by rendering, and by nothing else:** the canvas element shrink-wraps its boxes, so
   on a small rack the visibly empty area below them belonged to the scroller, not the canvas,
   and a drop there did nothing at all. The canvas now fills the viewport.

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
