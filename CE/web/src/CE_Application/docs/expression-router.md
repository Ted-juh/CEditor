# Expression Router — make any incoming signal feel bespoke

> Status: **shipped 🟢**. Turns the panel into a **modulation-shaping desk**:
> take an incoming controller, shape its response with a drawable curve, and fan
> it to many parameters. Part of the [panel parts backlog](./README.md).

## What it is

Hardware synths *listen* to CCs, but **shaping** that response — "aftertouch
opens the filter, but only the top half, gently, and adds a touch of drive" — is
normally impossible on the device itself. The Router does exactly that: pick an
**input source** (mod wheel, aftertouch, breath, expression, a linked on-panel
control…), run it through a **drawable transfer curve** (with a dead-zone and
optional invert), then **fan the shaped value to many destinations**, each with
its own depth (±) and output range. Your existing controllers suddenly feel
tailored to the patch.

## How it works

- **Pure engine** `utils/routerLayout.js` (+ `test/routerLayout.test.js`, 15 tests):
  input and output are normalized 0..1. `shapeInput` applies invert + dead-zone
  (the remaining range rescales to fill 0..1); the transfer curve **reuses the
  Envelope's breakpoint engine** (`normalizePoints` / `envValueAt`); each
  destination maps the shaped value by |depth| (inverted for negative depth) into
  `[min,max]` — the same law as the Macro. Dynamic `dest_N` ports + fan-out
  values. `ROUTER_INPUT_SOURCES` enumerates the standard sources, and
  `routerLiveInput` maps one of them to a 0..1 value out of the shared MIDI
  expression state — returning **undefined** when that controller has never been
  seen, which is deliberately different from it having arrived at zero. Besides
  the six named sources there's a **free CC number**, so any controller can be
  used (and so MIDI learn always has somewhere to put what it finds).
- **`RouterRenderer.svelte`** — a source chip + input bar badged **LIVE** or
  **TEST**, the transfer curve (grid, dead-zone shading, editable nodes, live
  input→output crosshair) and the destination lanes with live values. Visual
  only. The badge matters: a silent controller and a working one parked at the
  test value look identical without it.
- **Model** — `Router` controlType + `Router` section (`source`, `sourceControlId`,
  `inputChannel`, `invert`, `deadzone`, the `curve[]` breakpoints and
  `destinations[]`). **Dynamic ports**: one `dest_N` per destination, so
  DeviceBindings lists them all.
- **Input** (`PanelPreviewSurface`) — for a MIDI source the value comes off the
  **hardware input**, read from the shared listener built for
  [note input echo](./note-input-echo.md): the same parser that finds the notes
  finds the CCs, aftertouch and velocities, so there is still only one listener.
  A per-control **channel filter** (0 = omni) narrows it. Until that controller
  actually sends something the section's **test value** stands in, and the
  header says `TEST` so you know. `source: 'link'` follows an on-panel control
  instead. The shaped destinations **fan out whenever the input moves**, and the
  transfer-curve nodes are **draggable**. The Player runs the same surface, so
  this all works there too.
- **MIDI learn** — press **Learn**, move the controller you want, done. The
  session watches for a few seconds and adopts **whatever moved the most**, not
  the first message to arrive: brushing a key on the way to the mod wheel sends
  a note, and plenty of keyboards trickle aftertouch constantly, so
  first-past-the-post picks the wrong thing. A candidate has to clear both a
  movement span and a message count, which is what stops a single stray note
  (span 0) or a resting controller's jitter (span 1) from being adopted the
  instant you press the button. It **pins the channel it actually arrived on**,
  applies as soon as it's confident, and times out on its own if nothing moves.
  A learned CC that matches a named source becomes that source, so the chip
  reads *Mod Wheel* rather than *CC 1*. Only one session can run at a time —
  two controls both listening for "the next thing that moves" would both adopt
  it. The reducer lives in `utils/midiNoteInput.js` and is unit-tested; the
  session itself is tested through the store.
- **`RouterEditor.svelte`** — source picker (with device-dependency hints), the
  Learn button, CC number, input channel, invert / dead-zone, a linked-control
  picker, the test value, and a destinations table. Loader, Properties tab and
  palette entry included.

## Compatibility (the honest bit)

The **output** side works on any synth whose parameters are in the device
profile — same as the Macro. The **input** side is the variable: the source has
to actually be transmitted. **Mod Wheel / Expression** are near-universal;
**Aftertouch / Breath / Foot / Velocity are device-dependent** (many synths
don't send them), so the editor flags those as "device-dependent" in the source
picker. `source: 'link'` sidesteps the issue entirely by following an on-panel
control. Traffic is light (a few destinations), so it's comfortable on DIN or USB.

It also needs a **MIDI input selected** on a device role — without one there is
nothing to listen to, and every MIDI source stays on its test value.

## Possible next steps

- **Profile-declared source gating** — grey out input sources the active device
  profile doesn't declare as transmitting, instead of only labelling them.
- ~~Player input decode~~ — **done**: MIDI sources now read the hardware input
  directly, in both the editor preview and the Player.
- ~~MIDI learn~~ — **done**, see above.
- ~~Any CC~~ — **done**: a free CC-number source sits alongside the named ones.
- **Poly aftertouch** — currently only channel pressure (0xD0) is read; per-note
  pressure (0xA0) is parsed past but not exposed.
- **Learn for the note controls too** — the session is generic; only the Router
  offers a Learn button so far.
- **Per-destination curve** — an optional secondary curve per destination, not
  just depth + range.
