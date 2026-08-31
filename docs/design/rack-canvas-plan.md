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

1. **Selection + the bottom dock.** A `selectedNode` store; the existing editors — the arp and step
   grids in `MidiChainPanel`, `HostMixerPanel`, `HostSplitEditor`, the parameter list — render into
   one docked panel instead of being stacked inline. No new concepts, no model change, and it
   removes most of the vertical scrolling that makes the current UI feel like a form. **Biggest
   perceived win for the least risk; do this first.**
2. **The canvas as a read-only picture.** Draw the existing graph with auto-layout (columns by
   depth: instruments, then buses, then master), wires as SVG under the nodes. Nothing is
   draggable yet. This is where we find out whether the metaphor actually reads before investing in
   interaction.
3. **Make it interactive.** Drag to reorder within a lane; drag a lane's output onto a bus; drag
   from the browser onto a lane to load. Every drop goes through the commands that already exist
   (`moveMidiSlot`, `setPartDestination`, `loadInstrument`, `addEffect`) — the canvas issues them,
   it does not bypass them.
4. **Thumbnails**, in the order above.
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
