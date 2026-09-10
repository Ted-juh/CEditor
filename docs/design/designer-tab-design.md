# The Designer tab

Status: **built**, 2026-09-10, with three designers of fourteen. The properties panel is untouched —
see [What was built](#what-was-built).

Candidate 9 from [`display-panel-candidates.md`](display-panel-candidates.md), which called it "the
most interesting one" and "the largest piece of work here". Drawn in
[`designer-tab-mockups.html`](designer-tab-mockups.html).

## The short version

Fourteen components in this app have content that is a drawing — a pattern, a curve, a register, a
keyboard split. **None of it can be authored.** There are two places it could be, and neither works:

1. **The properties panel has no drawing surface for any of them.** It has numbers, dropdowns and
   read-only text. An envelope curve is one row of two number boxes per node. The Arp's muted steps
   are `mutes.join(', ')`.
2. **Preview mode does have drawing — and preview is a rehearsal.** `stores/previewRehearsal.js`
   photographs the panels store when preview starts and puts it back when preview stops. That is
   deliberate and right: it stops a runtime script editing the author's file behind their back. But
   a pattern drawn by hand goes back with everything else.

And the Step Sequencer is worse off than the other thirteen: **it cannot be drawn even in preview.**

So this tab is a drawing surface at *design* time, whose writes are ordinary authored edits.

## The space is the largest number in the list, and the tab recovers none of it

Measured — each section editor mounted in Chromium at a 340px panel width with a default control,
every section it draws included:

| Component | Panel height | | Component | Panel height |
|---|---:|---|---|---:|
| Drum Pads | 1,017px | | Chord Pad | 502px |
| Phrase Sequencer | 943px | | Zone Splitter | 476px |
| Phrase Recorder | 912px | | Kinetic Modulator | 448px |
| Harmoniser | 831px | | Step Sequencer | 388px |
| Arpeggiator | 625px | | Transport | 347px |
| Expression Router | 568px | | Turing Modulator | 335px |
| Envelope | 516px | | Numpad | 235px |
| | | | **total** | **8,143px** |

That is twice the API tab's 4,183px and the biggest figure anywhere in the candidate list. It is
also, for the first time, **not the argument**: this tab does not take a single row out of the
panel, because what it adds is the part the panel does not have. The space and the defect point at
different things here, and the defect is the one worth building for.

(The candidate list's per-component numbers — Arpeggiator 347px, Phrase 482px, Recorder 257px — were
computed from a static cell-packing formula and are all low. It also never listed Drum Pads, the
tallest of them.)

## Three findings

### 1. Anything drawn in preview mode is thrown away

Measured, with the real stores:

```
before preview        : 8 cells      (a Phrase ships with a starter pattern)
drawn during preview  : 2 cells
after leaving preview : 8 cells
```

`previewRehearsal.js` says why, in its own header: *"preview is a rehearsal, not an edit"*. Before
it existed, a script's `set()` and a gesture on any of about twelve components wrote straight through
to the authored document and autosaved. The fix was a bracket: snapshot on start, restore on stop.

That is the right call and this tab does not touch it. What it means is that **every drawing route
in the application today is inside that bracket**. Painting a phrase, dragging a split point, muting
an arp step, drawing a Turing register — all of them, and all of them undone the moment preview stops.

Preview mode also turns off selection, dragging, the context menu and the marquee, so this is not a
mode you draw in while designing anyway. It is a mode you enter, and leave.

### 2. The Step Sequencer's pattern has no editor at all

`utils/stepSequencerLayout.js` exports 24 things. **Seven are never imported anywhere, and five of
those seven are exactly the editing half:**

| Export | What it does | Imported by |
|---|---|---|
| `cellAtPoint` | which cell is under the pointer | nothing |
| `cellAt` | read one cell | nothing |
| `isCellOn` | is it lit | nothing |
| `toggleCell` | turn one on or off | nothing |
| `setCellVelocity` | set its velocity | nothing |

The hit test, the reader and both writers, written and exported and never called. The default
pattern in `sectionDefaults.js` is `{}`. `StepSequencerEditor.svelte` edits steps, tempo, direction,
tracks and colours and never the pattern; `PanelPreviewSurface.svelte` imports the sequencer's
*clock* half — `advanceStep`, `stepMs`, `stepNotes` — and none of its editing half.

**So a Step Sequencer draws an empty grid and plays silence.** In the editor, in preview, and in the
exported player. It has done since it shipped.

### 3. The renderer already draws a value nothing could set

`StepSequencerRenderer.svelte` draws each lit cell's opacity from `cell.velocity`:

```svelte
opacity={track.muted ? 0.35 : (cell?.on ? Math.max(0.35, (cell.velocity ?? 100) / 127) : 1)}
```

`setCellVelocity` had no caller, so every cell that could ever exist would have drawn at exactly the
same opacity. The picture had a dimension the data could not carry.

## What the tab is

**One tab, many editors** — a registry, not a switch. `DESIGNER_COMPONENTS` in
`utils/designerModel.js` lists all fourteen with the section they edit, the shape their content is
and whether a designer is built. `DesignerTab.svelte` maps the three built rows to their component.
Adding a fourth is a row and an import.

That shape is the candidate list's own instruction — *"best treated as a pattern proved on one
component first"* — and it matters beyond this tab:
[`rack-canvas-plan.md`](rack-canvas-plan.md) proposes the same mechanism for the instrument host
(*"One dock, many editors"*), and if both are built they should be one thing.

**Every designer draws with the component's own renderer.** `StepSequencerRenderer`,
`EnvelopeRenderer` and `TuringRenderer` are the components the canvas draws with; here they are
mounted at dock size with a transparent hit layer over them. The geometry and the writes come from
the component's own layout module. Nothing in this tab is a second drawing of anything — the same
rule `EffectPreview` settled for this repo.

### The three that are built

| | Content | What the panel gives you | What the designer gives you |
|---|---|---|---|
| **Step Sequencer** | `pattern` | nothing at all | click and drag the grid, per-cell velocity, per-row fill / shift / invert / clear |
| **Envelope** | `points` | one row of two number boxes and a dropdown per node | drag the nodes on the curve, click empty space to add one where you clicked, six preset shapes, pick the sustain node |
| **Turing** | `steps` | Randomize and Flatten | draw the register with the pointer, type any step, rotate, snap to the levels it plays |

### The eleven that are not

Named on screen rather than silently absent: open the tab on a Phrase Sequencer and it says there is
no designer for one yet, names the three that exist, and says why preview is not the answer. The
footer names anything else on the current panel that is waiting.

## Layout

```
  designing Big Drums · Step Sequencer                        [ Use selection ] [ Clear ]

  PATTERN                          17 cells lit · 16 × 3      TRACKS               3
  ┌──────────────────────────────────────────────────┐        ● Kick             4
  │ Kick   ▪ · · · ▪ · · · ▪ · · · ▪ · · ·           │        ● Snare            4
  │ Snare  · · ▪ · · · ▪ · · · ▪ · · · ▪ ·           │        ● Hat              9
  │ Hat    ▪ · ▪ · ▪ · ▪ ▪ ▪ · ▪ · ▪ · ▪ ·           │        ┌────────────────┐
  └──────────────────────────────────────────────────┘        │ FILL HAT       │
                                                              │ /1 /2 /3 /4 /8 │
                                                              │ MOVE IT        │
                                                              │ ‹ › invert row │
                                                              │ VELOCITY       │
                                                              │ Step 8 [ 45 ]  │
                                                              │ Clear pattern  │
                                                              └────────────────┘
  Also on this panel with nothing to draw with yet: Phrase Sequencer.
```

The stage takes what is left and the tools ride beside it, the same shape in all three designers.

## The four things worth calling innovative

1. **A component's content becomes authorable for the first time.** The Step Sequencer's pattern had
   no editor in the application; now it has one, using the writers that were already there.
2. **The designer is the renderer.** What you draw on is the component, at dock size — not a
   sketch of it that is free to disagree.
3. **The registry is on screen.** A component with no designer says so and names what does have one.
   Eleven pending designers as a visible list is a different thing from three built ones and silence.
4. **The tools are the ones a hardware sequencer has.** Four-on-the-floor is one click, not four;
   off-beat hats are one click, not eight; a row shifts, inverts and clears as a row.

## No sliders

Same rule as the other seven. The envelope's nodes have handles because the value **is** the shape,
and the Turing register is step bars, which the rule keeps for the same reason. Everything else is a
click, a chip or a number cell. There is no slider and no JSON box in the tab, and the browser check
asserts both.

## What was built

| Piece | File |
|---|---|
| The model — the registry, and the pattern / curve / register edits | `utils/designerModel.js` |
| The tab frame | `components/DesignerTab.svelte` |
| The designers | `components/designer/SequencerDesigner · EnvelopeDesigner · TuringDesigner` |
| Registration | `stores/editorTarget.js`, `utils/displayDock.js`, `panels/DisplayPanel.svelte` |
| Tests | `test/designerModel.test.js` (28), `browser-checks/designerTab.mjs` (29) |

**Nothing was removed.** All fourteen section editors still draw every row they drew.
`allDesignerFieldLabels()` is ready for the day the panel's rows do come out.

### Decisions and what the building turned up

- **Three, not fourteen.** The candidate list said to prove the pattern on one component first. Three
  proves more than one does, because they are three different shapes — a grid, a curve, a set of bars
  — so the frame had to be a frame rather than one editor with a header on it.
- **The Step Sequencer went first even though it is the third-shortest section.** The height was
  never the reason; the missing editor was.
- **`moveZoneEdge` looked dead and is not.** A first pass for unused exports flagged it in
  `splitZoneLayout.js`. It is called by `dragSplitPoint` in the same file, which is called by the
  preview surface. Checked before it went in a document. The same pass flagged
  `phraseLayout.clearPattern`, which really is dead — a one-line function returning an empty pattern
  with no caller, left alone here because the Phrase has no designer yet.
- **The preview-mode banner.** Open the tab while preview is running and the header says so, because
  drawing then would be undone on exit and there would be nothing on screen to explain why.
- **The browser check computes its click points from the shipped geometry**, not from numbers copied
  out of it. A check carrying its own copy of the layout can pass while the tab clicks the wrong cell.

## Still open

1. **Eleven designers are not built**: Arpeggiator, Phrase Sequencer, Zone Splitter, Harmoniser,
   Chord Pad, Drum Pads, Expression Router, Transport, Phrase Recorder, Numpad, Kinetic Modulator.
   The frame is ready for each of them; the work is the drawing surface per component.
2. **Nothing is relocated**, and the panel needs its search index extended before anything is.
3. **`sectionDefaults.js` still carries a stale claim** about the Step Sequencer: *"tempo-sync needs
   MIDI clock in, which does not exist yet"*. `StepSequencerEditor.svelte`'s own header records that
   this stopped being true when the shared transport landed. The section defaults did not get the
   correction. Left as a note here rather than fixed in passing, because it is a data-model file and
   not this tab's to edit.
4. **The rack canvas is the other half of this.** If `rack-canvas-plan.md` is built, its dock and
   this one should be the same registry rather than two.

## Notes

- 2026-09-10: Written and built together. The heights were measured first; the rehearsal finding was
  proved with a probe against the real stores before anything was written down; the dead-export list
  was checked import by import, which is what caught `moveZoneEdge` not being dead.
