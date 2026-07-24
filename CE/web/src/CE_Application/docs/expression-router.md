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

- **Pure engine** `utils/routerLayout.js` (+ `test/routerLayout.test.js`, 6 tests):
  input and output are normalized 0..1. `shapeInput` applies invert + dead-zone
  (the remaining range rescales to fill 0..1); the transfer curve **reuses the
  Envelope's breakpoint engine** (`normalizePoints` / `envValueAt`); each
  destination maps the shaped value by |depth| (inverted for negative depth) into
  `[min,max]` — the same law as the Macro. Dynamic `dest_N` ports + fan-out
  values. `ROUTER_INPUT_SOURCES` enumerates the standard sources.
- **`RouterRenderer.svelte`** — a source chip + live input bar, the transfer
  curve (grid, dead-zone shading, editable nodes, live input→output crosshair)
  and the destination lanes with live values. Visual only.
- **Model** — `Router` controlType + `Router` section (`source`, `sourceControlId`,
  `invert`, `deadzone`, the `curve[]` breakpoints and `destinations[]`). **Dynamic
  ports**: one `dest_N` per destination, so DeviceBindings lists them all.
- **Preview** (`PanelPreviewSurface`) — the live input comes from a **linked
  on-panel control** (`source: 'link'`) or the section's **test value**; the
  shaped destinations **fan out whenever the input moves**, and the transfer-curve
  nodes are **draggable**. In the exported Player, incoming MIDI feeds the input.
- **`RouterEditor.svelte`** — source picker (with device-dependency hints), invert
  / dead-zone, a linked-control picker, and a destinations table. Loader,
  Properties tab and palette entry included.

## Compatibility (the honest bit)

The **output** side works on any synth whose parameters are in the device
profile — same as the Macro. The **input** side is the variable: the source has
to actually be transmitted. **Mod Wheel / Expression** are near-universal;
**Aftertouch / Breath / Foot / Velocity are device-dependent** (many synths
don't send them), so the editor flags those as "device-dependent" in the source
picker. `source: 'link'` sidesteps the issue entirely by following an on-panel
control. Traffic is light (a few destinations), so it's comfortable on DIN or USB.

## Possible next steps

- **Profile-declared source gating** — grey out input sources the active device
  profile doesn't declare as transmitting, instead of only labelling them.
- **Player input decode** — route the chosen CC/aftertouch stream from the
  Player's incoming-MIDI decoder straight into `Router.__input`.
- **Per-destination curve** — an optional secondary curve per destination, not
  just depth + range.
