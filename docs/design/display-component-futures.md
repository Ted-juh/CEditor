# Display components: what is missing, and what it would take

A design record for `LcdDisplay` and `PixelDisplay`, written after an audit of what the two
components actually do. Nine proposals, in three tiers: things that are simply absent, things that
change what the component *is*, and three that are speculative on purpose.

**This note partly argues with [screen-builder-design.md](screen-builder-design.md).** That document
rules out compiling CEditor panels to the CTRL49's screen, for good reasons. Proposal 7 does not
overturn that; it points at the one component the reasoning does not cover. Read the non-goals
there before reading 7 here.

---

## How to read the pictures

Two kinds, and they must not be confused:

- **`docs/media/display-*.gif`** are *recordings*. They are the real renderers driven by real
  controls; nothing in them is a feature the components lack. See [the gallery](../display-gallery.md).
- **`docs/media/mockup-*.png`** illustrate *this document*, rendered by the same machinery
  (`gen-display-demos.mjs --mockups`, scenes in `displayDemos/mockups.mjs`). **Most of them are now
  recordings of shipped features rather than pictures of proposals**, because two of the three
  proposals they illustrate have since been built:

  | Figure | What it is now |
  | --- | --- |
  | `mockup-softkeys-*` | Shipped. Real `press` actions; the pressed one captured mid-press, with the inverse video drawn by the renderer. |
  | `mockup-glyphs-*` | Shipped. The same character LCD twice, differing only in eight glyph definitions. The "after" used to be a `PixelDisplay` impersonating a character LCD; that impersonation is gone. |
  | `mockup-state-*` | Shipped. All three edges are real: a press in, a `timeoutMs` out, and a cursor that moves. MENU is now a working menu — `cursorMax`, a marker zone per row, and ▲/▼ keys that move the selection. |

The state screens are what made these mockups necessary in the first place, and they are also the
clearest case for why a still is not enough: the MENU figure looks much like the drawing it
replaced, because what changed is that pressing ▼ now moves the marker. Behaviour, not pixels —
which is the document's job rather than the picture's.

## The audit, in numbers

**This table is the state that produced the list, not the state today.** It was counted on
2026-09-12, before proposals 1, 3 and 4 were built — so the CGRAM row now reads differently, and
the verb counts have grown by the verbs those proposals added. It is left as it was because it is
the evidence the proposals were argued from; the per-proposal sections say what has since changed.

| Fact | Value |
| --- | --- |
| `LcdDisplay` sections | `Background, Display, Effects, DeviceBindings, Scripts` |
| `PixelDisplay` sections | `Background, Pixel, Effects, DeviceBindings, Scripts` |
| Device-binding ports, both | `text`, `value`, `brightness`, `backlight` |
| `exportValues`, both | `[]` — neither is host-automatable |
| Zone `show` kinds | 16 |
| `lcd.*` script verbs | 35 |
| `pixel.*` script verbs | 19, **not one of which writes content** |
| Hits for CGRAM / custom characters | 0 — *proposal 1 has since shipped* |

The two verb counts are the whole flattened surface — the hand-written declarations, the
`showGlass`/`showGhost`/`showScanlines`/`showGrid` chrome appended to every family, and the
`read`/`size`/`fill` kinds each family gets for free. (An earlier draft of this note said 28 and 14,
which counted only the hand-written `v(...)` lines. The corrected figures do not change the
finding: the full `pixel` list is `backlight, brightness, contrast, gamma, glow, anim, animPreset,
animSpeed, animLoop, animFps, layoutTransition, transitionMs, brightnessSource, backlightSource,
showGlass, showGhost, showScanlines, showGrid, read` — every one of them chrome.)

Two of those rows are the whole of Tier 1. Neither component has a `Mouse`, `Behavior` or
`HitZones` section — that was the whole of proposal 4, and it is **still true after that proposal
shipped**: pressable zones were built as an exception on the existing click path rather than by
giving a display an interaction model of its own.

---

# Tier 1 — gaps, not decisions

These three are asymmetries. Nothing was decided against; they were not reached.

## 1. User-definable glyphs on the character LCD — **shipped**

**What was missing.** Zero hits for CGRAM, custom characters or user glyphs anywhere in the tree.
Every real HD44780 has eight programmable 5×8 characters, and `PixelDisplay` already has *two*
mechanisms for arbitrary artwork — `bitmap` elements with a `bits` string, and a `customFont`
sprite sheet. The character LCD has neither.

**Why it bites.** `resolveZoneContent`'s `bar` kind builds its bargraph from `█` plus the seven
partial-block characters `▏▎▍▌▋▊▉`. That is a clever fallback and it has two costs: the bar's
appearance depends on the *system font* carrying those glyphs, and no block character has a foot,
so a bar can never have the baseline that real panel bargraphs use to stay readable at a glance.

Both of these are now the **same renderer on the same panel type**, driven by the same linked knob
through the same `bar` zone. The only difference between them is eight glyph definitions:

![Without glyphs](../media/mockup-glyphs-blocks.png)

![With eight CGRAM glyphs](../media/mockup-glyphs-cgram.png)

The difference is not decoration. Each bar segment gains a foot and a gap, so the bar's length
reads without counting it; and `MIDI`/`PRG` stop spending eleven of twenty columns on words a
symbol says in one.

**What shipped.** Eight slots on the `Display` section, authored the way a datasheet writes them:

```js
Display: {
  glyphs: [
    { bits: '.....|.###.|.###.|.###.|.###.|.###.|.###.|#####', for: '█' },  // bar, full
    { bits: '.....|.....|.....|.....|.###.|.###.|.###.|#####', for: '▌' },  // bar, half
    { bits: '.###.|#...#|#.#.#|#...#|#####|..#..|..#..|.###.', for: '' },   // a MIDI plug
  ],
}
```

**Two ways to reach a glyph, because the hardware's way and the useful way differ.** *By slot:*
glyph n is the character with code n, `\x00`–`\x07`, in any zone's text — literally how CGRAM is
addressed. *By claim:* a glyph can name an ordinary character it stands in for. That last one is
what makes `bar` work without touching it: `resolveZoneContent` keeps composing block characters,
and a glyph claiming `█` turns them into a segmented bargraph at draw time. Teaching the pure zone
engine about glyphs would have pushed display state into it for no gain.

**`glyphs` defaults to eight blank slots, and that detail earns its keep twice.** It is what the
hardware is — an empty slot draws nothing and is not a glyph — and it is why `lcd.glyph(n, bits)`
could be an index-addressed `item` verb where the identical mechanism was a dead no-op on
`Pixel.elements` (proposal 2). The verb is marked `fixed`, like the Drum Pads' override array:
CGRAM is eight slots and an insert would mint a ninth that `\x00`–`\x07` cannot address.
`scriptComponents.test.js` caught that before it shipped.

**Not done: the inspector editor.** Glyphs are authorable from the panel document and from a
script, not yet by drawing on a 5×8 grid in the UI. That is the obvious follow-up and it is
ordinary UI work — the model, the rendering and the scripting all exist under it now.

## 2. `PixelDisplay` cannot be scripted, only decorated

**What is missing.** Every one of the `pixel.*` verbs is chrome — see the full list in the audit
above. Not one writes an element. The LCD at least has `lcd.text(row, line)` and `lcd.clear()`.

The richest display in the product — the one with `wave`, `adsr`, `scope` and free pixel placement
— is the one a script cannot write a word to. Its `elements` array is editable only in the
inspector.

**This one was attempted, and the attempt found the real problem.** It is written up here rather
than smoothed over, because the finding is the useful part.

The obvious mechanism is the `item` verb kind — "one property of one element of an array field,
addressed 1-based" — exactly how `DrumPads` addresses a pad:

```js
v('text', 'elements', ITEM, { item: 'text', kind: STR }),   // pixel.text(C, 1, 'SATURN VB')
v('show', 'elements', ITEM, { item: 'visible', kind: BOOL }),
```

Four verbs on that pattern were written, and `componentVerbs.test.js` rejected all four:

```
verbs that did nothing:
  pixelText: no patch     pixelShow: no patch
  pixelX: no patch        pixelY: no patch
```

**Why.** Every other `item` list in the spec has a **non-empty default** — six orbit nodes are six
stored objects, so element 1 is always there to be written. `Pixel.elements` defaults to `[]`,
because a pixel display starts blank by design. An index-addressed verb is therefore a silent no-op
on every display whose elements have not already been added in the inspector. That is precisely the
failure the test named *"every verb either changes something or explains why it cannot"* exists to
catch, and there is no exemption list to add to — the assertion is absolute.

There were three bad ways out and all were rejected: seeding `SECTION_DEFAULTS.Pixel.elements`
(changes what a new display *is*), declaring a `count` resolver like `DrumPads` (a pad grid has an
implied size; a blank screen has none), and weakening the test.

**So the real decision is addressing, and it was hiding behind the API sketch.** Index is the wrong
key for this list:

| | Index (`item`, today's mechanism) | Id |
| --- | --- | --- |
| Blank display | Silent no-op | Same, but honestly — the id is absent |
| Reorder in inspector | **Scripts silently retarget** | Stable |
| Cost | One line per verb | A new reducer kind |

Element ids already exist and are stable. `LINK` is precedent for a verb kind that resolves a
*name* in the runtime rather than the reducer, so an id-addressed kind has somewhere to live.

**Cost.** Higher than it first looked: a reducer kind, not a one-liner. Still low risk —
`updateControlProperty` already writes into `Pixel.elements`, which is what the design-mode drag
handles do when an element is moved.

**Verdict: do it, by id.** Still a hole rather than a boundary — but the shape of the fix is now
known rather than assumed.

## 3. `editText` is invisible to everything except the keyboard — **shipped**

`@edit` is a real interactive feature: a focusable field with a caret, keyboard entry, and a
knob that cycles the character under it. And:

- no verb reads or writes `editText`, on either component;
- `exportValues: []`, so a DAW cannot see it;
- the only inbound route is the `text` device-binding port, which overwrites rather than edits.

A patch name is the one genuinely *editable* value a display owns. It should be readable by a
script, bindable both ways, and arguably automatable.

**The verb half is done.** `lcd.editText` and `pixel.editText` now exist — one line each in
`componentVerbs.js`, one verb per family, reading back as well as writing because `read` is one of
the five kinds every family gets for free:

```js
ce.components.lcd.editText(C, 'HYPERSAW BRASS');   // write
const name = ce.components.lcd.editText(C);        // read
```

Adding them required regenerating the three C++ engine preludes
(`gen-script-modules.mjs --write`) and the scripting manual (`npm run docs:manual`) — the parity
tests fail until every runtime agrees a verb exists, which is the mechanism working as designed.

**What is still open** is the host-automation half. `exportValues: []` says an output has nothing to
automate; that ruling was written before `@edit` existed and deserves re-arguing on its own terms,
because a patch name is a value a DAW might reasonably want to see. Not decided here.

---

# Tier 2 — these change what the component is

## 4. Soft keys: zones as hit targets — **shipped**

**The decision was made: yes, as an exception to the rule.** A display stays display-only; only a
zone that *declares* a `press` action takes a click. The general pointer-transparency rule in
`displayMode.js` is untouched.

**What is missing.** `LcdDisplay`'s sections are `Background, Display, Effects, DeviceBindings,
Scripts`. There is no `Mouse`, no `Behavior`, no `HitZones`. The component has **no interaction
model at all** — the text-edit affordance is hard-coded into `PanelPreviewSurface` as a bespoke
`lcdEdit` state machine, not built on any general mechanism.

Every hardware synth screen has F1–F6 underneath it. Both of these render *today*:

![Soft keys at rest](../media/mockup-softkeys-idle.png)

![FLT pressed](../media/mockup-softkeys-pressed.png)

The row is four `static` zones, five columns each. The only thing separating the two pictures is
that the second one is a lie: nothing can press a zone.

**What shipped.** A zone gains a `press`:

```js
{ id: 'k2', show: 'static', text: '[FLT]', row: 4, colStart: 6, colEnd: 10,
  press: { layout: 'edit-filter' } }          // or { set: 'cutoff', to: 64 }
```

Two actions, both things a performer does mid-song rather than things an author does once —
the same line `componentVerbs.js` draws for script verbs. `{ script: ... }` was sketched and left
out: firing a hook from a press is a bigger question about who owns the event.

**It turned out cheaper than estimated, because the exception already existed.** An `edit` zone has
been clickable since the edit field was added — `PanelPreviewSurface`'s pointer-down handler
already resolved a clicked cell and armed an edit target. Pressable zones extend that path instead
of opening a new one, so no display acquired a `Mouse` or `HitZones` section and
`displayMode.js` was not touched at all.

**Three decisions worth recording:**

- **A press resolves before an edit.** A zone that declares an action is the more specific intent:
  an edit field is armed by clicking "somewhere on the display" and falls back to its *first*
  target when the click misses, so resolving edits first would make a soft key beside an edit field
  unreachable.
- **A press is resolved in paint order, read backwards.** Zones overlap by design, so the zone a
  user can *see* at a cell is the last one to paint there. `pressTargetAt` walks
  `composeLayout`'s ordering in reverse. An inert zone on top **blocks** a pressable one beneath
  it, for the same reason it hides it: the user pressed what they could see, and what they could
  see does nothing.
- **The navigated layout is transient**, held beside `lcdEdit` rather than written to the panel
  document. It beats the selector and the design default — navigating by hand is the most recent
  thing the user said — but not an overlay, which is a transient interruption that should be seen
  over whatever page you had navigated to.

**The pressed state shipped too**, so the picture above is a real capture rather than a drawing:
the key inverts — lit ground, dark glyphs — for 140ms.

Two decisions there were forced by measurement rather than taste:

- **It is a flash, not a held state.** Holding the highlight until pointer-up reads better in
  principle and gets *stuck* in practice: press, drag off the display, release, and the pointer-up
  never reaches the control, leaving a key lit with nothing to turn it off. 140ms because a click
  can be shorter than a frame, so tying the flash to the real press duration makes a fast click
  produce no feedback at all.
- **The flash is a frozen region, not a zone id.** A `{ layout }` press changes the page, so by the
  time anything paints, the pressed zone belongs to the layout the screen has just *left* — looking
  it up by id finds nothing and the key never lights. Measured: zero inverted cells. Freezing the
  row and column span at press time lights the place the finger was, over whatever page arrives,
  which is what hardware does — soft-key rows sit in the same place across pages.

**Still missing:** inverse video is **character panels only**. On a *segment* panel "inverse" has
no meaning — a starburst has lit segments and unlit ones, and lighting all of them spells nothing.
On a *graphic* panel the cells are stamped into a canvas bitmap, so inverting a region means
flipping bits after the stamp rather than styling a span: worth doing, and canvas work. And
`PixelDisplay` elements are not pressable at all — this is `LcdDisplay` zones only.

## 5. Let a zone bind a device parameter directly — **shipped**

**What is missing.** A zone's `sourceId` is always a *control* id. The only exceptions are the two
reserved sources, `@active` and `@edit`. To show a device parameter you must create a control, bind
it to the parameter, and point the zone at the control:

```mermaid
flowchart LR
  subgraph today["Today — the proxy is mandatory"]
    Z1["zone<br/>show: 'value'"] -->|sourceId| C["proxy Knob<br/>(often hidden)"]
    C -->|DeviceBindings| P1["device parameter<br/>CC 74"]
  end
  subgraph proposed["Proposed — @param"]
    Z2["zone<br/>show: 'value'"] -->|"sourceId: '@param:cutoff'"| P2["device parameter<br/>CC 74"]
  end
```

For a screen that reports eight parameters, that is eight controls existing only to be read.

**Building it turned up the thing that was actually missing, and it was not the zone syntax.**

A device parameter had no value. Not "a value that was hard to reach" — no value at all. An inbound
CC was decoded against the profile and written into the preview session of every *control* bound to
that parameter; an outbound change was read off the control that moved. So "what is the cutoff right
now" had no answer unless some control happened to be bound to it. **The device's state was
scattered across whichever widgets the panel author had drawn**, which is the same fact that forced
the proxy controls this proposal set out to remove.

So the proposal needed a device-state model, and got one:
`stores/deviceParameterValues.js`, keyed by role and parameter id.

**What made it cheap is that both directions already funnel through exactly one function each**,
and both carry the whole triple:

| Direction | Funnel | Carries |
| --- | --- | --- |
| Inbound | `syncDeviceParameterToPanelPreview` | `(role, parameterId, value)` |
| Outbound | `commitDeviceParameter` | `{ deviceRole, parameterId, value }` |

Two writes, no new bookkeeping, and nothing else in the tree can move a parameter without passing
one of them. The outbound write happens only *after* the send resolves, so a parameter the profile
could not compile is not recorded as though it had been set.

**The zone syntax was the easy half:**

```js
{ show: 'value', sourceId: '@param:filter.cutoff' }        // the default device role
{ show: 'bar',   sourceId: '@param:pad:filter.cutoff' }    // a named role
```

The role is the part before the first colon when there are two segments — a parameter id is dotted
and a role is not. Every `show` kind works unchanged, because `parameterInfo` builds the same shape
`lcdSourceInfo` produces for a control. `address` answers the parameter's own id, which is what that
kind already showed when it had to reach through a control's binding to find one.

**Three judgements worth recording:**

- **An unset parameter reads the profile's `default`, not zero.** A screen should open showing what
  the device is meant to be at, not a filter claiming to be shut.
- **A boolean parameter reports 0..1, not its wire values.** `falseValue`/`trueValue` are 0 and 127,
  and reporting those would make `pct` say 100% for "on" — true of the wire, useless beside a bar.
- **Remapping a role clears its recorded values.** They describe the old device, and two profiles
  sharing a parameter id (`filter.cutoff` is not rare) would otherwise show the previous device's
  setting as this one's.

**Verified with no proxy anywhere:** a display whose four zones all name `@param:filter.cutoff`
shows the profile default, then tracks two inbound values — with exactly one control on the panel,
the display itself.

**What this is not:** persistence, and not a patch. It is the editor's live picture of the device,
dropped with the panel, and it says nothing about whether the device agreed — a parameter the
device never confirms reads as whatever was last sent. That was already true of the bound control;
this makes it explicit rather than worse.

## 6. Layouts as a state machine, not a lookup — **shipped**

**What exists.** `pages.selectorMap` maps a control's value to a layout, plus `overlays` that show
a layout transiently on a trigger. Both are *stateless*: the active layout is a pure function of
the current values.

Real device menus are not. Three screens, each of which renders today:

![HOME](../media/mockup-state-home.png)

![EDIT](../media/mockup-state-edit.png)

![MENU](../media/mockup-state-menu.png)

What could not be expressed, when this was written, were the *edges* between them:

```mermaid
stateDiagram-v2
  [*] --> HOME
  HOME --> EDIT: press FLT
  EDIT --> HOME: 5s idle
  HOME --> MENU: hold MENU 1s
  MENU --> MENU: ▲ / ▼ move selection
  MENU --> HOME: press BAK
```

"Press FLT" is not a value change. "5 s idle" is not a value at all. And `MENU → MENU` carries
state — *which* item is selected — that no layout could hold, because a layout is a list of zones,
not a record.

**All three now exist**, and they arrived from three directions rather than as one transitions
table:

```js
// HOME -> EDIT is a press (proposal 4).
{ id: 'k2', show: 'static', text: '[FLT]', row: 4, colStart: 6, colEnd: 10,
  press: { layout: 'edit-filter' } }

// EDIT -> HOME is a timeout, declared on the page that does not stay.
{ id: 'edit-filter', name: 'Filter', timeoutMs: 5000, timeoutTo: '', zones: [...] }
```

**The timeout is declared on the page, not on the key that opened it.** "This page does not stay"
is true however you arrived — four soft keys and a selector can all lead to the same Edit screen,
and every one of them wants the same behaviour. An empty `timeoutTo` means *stop overriding*: back
to whatever the selector or the default says, which is the common case and one fewer id to keep in
step.

Two rules that fell out of building it:

- **Only a layout reached by a press runs the timer.** Timing out of a selector-chosen layout would
  fight the selector, which would simply choose it again on the next frame — a screen that flickers
  rather than one that returns.
- **It does not chain.** The layout you land on does not start a timer of its own. Two pages whose
  timeouts pointed at each other would ping-pong forever on an idle panel, and a menu that returns
  you once is what anyone actually wants.

### `MENU → MENU`: the layout gets somewhere to keep a number

The third edge is the one that needed a new idea rather than a new field. A press that changes the
page is still stateless — the page *is* the state. A selection is not: the display has to remember
which item is selected while nothing else about it changes.

The display now keeps a small record of its own, and a layout declares how far its cursor may run:

```js
{ id: 'menu', name: 'Menu', cursorMax: 2, zones: [ ... ] }   // three items, 0..2
```

Three pieces make a menu out of that, and each is a field that already had a shape:

```js
// The ▲ / ▼ keys are ordinary pressable zones — proposal 4's `press`, with a third action.
{ id: 'up', show: 'static', text: '[ ▲ ]', row: 4, colStart: 1, colEnd: 5, press: { cursor: -1 } },
{ id: 'dn', show: 'static', text: '[ ▼ ]', row: 4, colStart: 7, colEnd: 11, press: { cursor: 1 } },

// The marker is one zone per row, each shown only at its own index.
{ id: 'a1', show: 'static', text: '▶', row: 3, colStart: 1, colEnd: 1, visibleWhen: { cursor: 1 } },

// And the number itself is readable, through the same reserved-source branch as `@param`.
{ id: 'pos', show: 'value', sourceId: '@state:cursor', row: 1, colStart: 19, colEnd: 20 },
```

The MENU figure above is a capture of exactly that layout, sitting at rest on item 0.

Three decisions worth recording, because each had a plausible alternative:

- **The cursor wraps.** `moveCursor` is modular over `cursorMax + 1`, so ▼ off the bottom item
  lands on the top one. A three-item menu where ▼ stops dead at the bottom is a menu that needs
  ▲ to be reachable at all, and hardware menus wrap.
- **The state is the display's, and the bound is the layout's.** One `cursor` per display rather
  than one per layout: a menu and its sub-menu sharing a position is the behaviour a real device
  has, and `cursorMax` on the layout still stops a deep page from scrolling past its own items.
  The cursor is folded into the active layout's range *when it is read*, not when a page is
  entered, because a selector or a `timeoutMs` changes the page with no press to hang a clamp on —
  and a selection sitting past the last item of a short page draws no marker at all, which reads as
  a menu with nothing selected rather than as a number out of range.
- **`visibleWhen` is a zone-level filter, not a marker feature.** It reads the same state record
  and hides any zone, which is why the marker needed no new concept — `composeLayout` and
  `pressTargetAt` both run zones through the one predicate, so an invisible zone is also not
  pressable.

The failure this shape is built to avoid is the one that actually happened during the work:
`{ cursor: ±1 }` rendered correctly and did nothing, because the predicate that decides whether a
zone is a hit target still only knew about `layout` and `set`. The unit tests passed — they
exercised `moveCursor` and `zoneVisibleWith` in isolation, and both were right. Only driving the
real editor found it. There is now a test named for that: a zone whose only action is a cursor
move must be pressable.

---

# Tier 3 — speculative on purpose

## 7. A `PixelDisplay` on the CTRL49's real screen

**Read the non-goal first.** `screen-builder-design.md` rules this out for panels, and the reason
is sound: the firmware's Lua environment has 16 device functions — rectangles, text, and pre-made
images — with no line or arc primitives, proven by live enumeration. Translating the panel editor's
visual language into that would be "enormous effort for a degraded imitation".

**The seam.** That reasoning is about *vector* content. A `PixelDisplay` is not vector content —
it is a 1-bit framebuffer, and "pre-made image" is one of the sixteen things the firmware *can*
draw. It is the one component in the product whose output is already in the hardware's vocabulary.

```mermaid
flowchart LR
  A["PixelDisplay<br/>128×64, 1-bit"] --> B["framebuffer<br/>(already produced<br/>every frame)"]
  B --> C["encode as an<br/>image asset"]
  C --> D["firmware<br/>draw_image()"]
  E["panel with knobs<br/>(vector)"] -. "no line/arc primitives" .-> F["✗ ruled out"]
```

**What would have to be proven, in this order:**

1. **Bandwidth.** The design note's filmstrip approach implies pre-rendered assets are uploaded
   ahead of time, not streamed. If a 128×64 1-bit frame (1 KB raw) cannot be pushed at even 5 fps,
   this is a static-screen feature, not a live one — still useful, much less exciting.
2. **Image format.** Whether `draw_image` accepts an arbitrary uploaded buffer or only assets
   registered in the bundle.
3. **Who owns the screen.** The broker model says exactly one process owns the CTRL49. A panel's
   display would have to be a *client* of the bridge, like everything else.

**Verdict: a one-day spike, not a roadmap item.** Answer (1) first; if the answer is "static only",
write that down next to the non-goal and stop.

## 8. A scope fed by real audio

`wave`, `scope` and `adsr` synthesize their pictures from MIDI values — 16 additive harmonics
rolled off by whatever the `cutoff` link reads. That is genuinely clever and it is why they work
with no audio path at all.

But the product *does* have audio: an out-of-process plug-in worker and a child-process auditioner
that has been measured against a 3,600-program Surge XT library. A `scope` element whose source is
the loaded instrument's actual output would turn a decorative graph into a real meter.

**The hard part is not the drawing** — the scope already keeps a rolling history and renders it.
It is getting audio across a process boundary at a useful rate without compromising the isolation
that `hostProductBuild.test.js` exists to protect. A lock-free ring of peak values (not samples) at
~50 Hz would be enough to draw a level scope and is cheap to ship over the existing channel.

**Verdict: valuable, and it belongs to the host work, not the display work.** The display end is a
new `source: 'audio'` on an element that already exists.

## 9. Mirror the device's own screen

Some synths transmit their LCD contents over SysEx; for others the screen is derivable from
parameter state the profile already models. A `show: 'deviceScreen'` zone would put the hardware's
own display inside the editor — the most direct possible answer to "is the editor in sync with the
box?".

**Why it is last.** It is per-device work with no shared payoff: a dump format that one profile
understands buys nothing for the next. It would be a spectacular demo for one flagship device and
dead weight everywhere else.

**Verdict: only if a specific device's users ask.** Worth recording as a possibility so nobody
re-derives it.

---

## Ranking

| # | Proposal | Effort | Changes the model? | Do it? |
| --- | --- | --- | --- | --- |
| 4 | Soft keys | Moderate | No, as it turned out — an exception, not a model | **Shipped** |
| 3 | `editText` verbs | Very low | Partly (automation) | **Shipped** |
| 1 | User glyphs | Small | No | **Shipped** |
| 2 | Pixel content verbs | Low → moderate (id addressing) | No | Yes |
| 5 | `@param` zones | Moderate | Yes — and needed a device-state store | **Shipped** |
| 6 | Layout state machine | High | Yes — layouts gained state | **Shipped** |
| 7 | CTRL49 framebuffer | Spike | n/a | Spike only |
| 8 | Real-audio scope | High | No (host work) | Later |
| 9 | Device screen mirror | Per-device | No | On request |

**Soft keys are done.** They changed the component's category — a display is now a UI surface —
without changing its model, because the click path was already there for edit fields.

**If one cheap: user glyphs.** The renderer already has a per-cell glyph pipeline to hang them on.

---

## Status and sequence

| # | State |
| --- | --- |
| 5 | **Shipped** — `@param:` zones, on a new device-parameter value store. |
| 6 | **Shipped** — press in, timeout out, and a wrapping cursor with `visibleWhen` and `@state:`. |
| 1 | **Shipped** — eight CGRAM slots, addressed by code or by claim. Inspector editor still to do. |
| 4 | **Shipped** — pressable zones, `{ layout }` and `{ set }`, with inverse-video feedback. Character panels only; LcdDisplay only. |
| 3 | **Shipped** — `lcd.editText` / `pixel.editText`. Host automation still open. |
| 2 | **Attempted; redesigned.** Index addressing rejected by the spec test; needs an id-addressed reducer kind. |

| 7, 8, 9 | Spike / later / on request. |

### The next three steps, in order

**Step 1 — ~~user glyphs~~. Done, except the inspector.** `bar` now draws from glyphs when a
claiming set is defined and falls back to block characters when it is not, which was the acceptance
test. What remains is a 5×8 drawing grid in the UI — ordinary work, with the model, the renderer
and the scripting already under it.

**Step 2 — settle the soft-key question, then build it (proposal 4).** The code is not the hard
part; this one question is, and it is the owner's to answer:

> When a zone can be pressed, is the display still "display-only"? `interactionPolicy` makes a
> read-only control transparent to the pointer *specifically so* a meter laid over a knob passes
> the click through. Displays do not go through that path today. Do pressable zones become an
> exception to that rule, or does the display acquire a real `Mouse`/`HitZones` section and stop
> being display-only altogether?

The second answer is more work and more honest. Either way, decide before writing code — a
half-answered interaction model is the expensive kind of mistake.

**Step 3 — ~~id-addressed element verbs, then `@param` zones~~. Half done.** `@param` shipped and
settled the reserved-source story: a source that is not a control id resolves through its own
branch, exactly as `@active` and `@edit` do. Proposal 2's id-addressed element verbs are the
remaining half, and they now have a pattern to follow.

Proposal 6 is **done** — a press gets you in, a timeout brings you back, and the cursor moves. All
three edges in the sketch are expressible, and the MENU screen is a menu rather than three lines of
text that look like one.

### What would make this note wrong

Worth writing down so it can be checked rather than trusted: the numbers in the audit table were
counted on 2026-09-12 against `componentVerbs.js`, `componentPorts.js`, `componentTypes.js` and
`lcdZones.js`. If a later reader finds `pixel.*` has content verbs, or a `Mouse` section on a
display, this note has been overtaken and the code is right.

## Deliberately not proposed

- **Colour on the character LCD.** The palette is per-screen for a reason; per-cell colour would
  make it a pixel display with extra steps.
- **A general vector layer.** `PixelDisplay` exists precisely so that free drawing has a home with
  a 1-bit contract. Adding curves to the character grid would blur both.
- **Compiling panels to the CTRL49.** Already ruled out, and 7 does not reopen it.
