# Screen Builder & CTRL49 Control Surface Design

This document defines the design for CEditor's hardware control-surface integration: the
M-Audio CTRL49's 480×272 screen, encoders, pads, and LEDs become a physical front panel
for hardware synths, driven by CEditor — without VIP, without firmware or driver
modification.

Protocol ground truth lives outside the repo in the reverse-engineering handoff:

```text
C:\Users\Tedjuh\Documents\Codex\2026-08-16\referenced-chatgpt-conversation-this-is-an\outputs\
  CTRL49_CEditor_Complete_Engineering_Handoff.md   (byte-level protocol, proven live)
  CTRL49_CEditor_Unified_Demo.ps1 + CEditor_Unified_Demo.lua   (working reference implementation)
```

That handoff is authoritative for every byte layout, SysEx frame, and driver call. This
document does not duplicate it; it decides what CEditor builds on top of it.

## What this is — and is not

The CTRL49 (and the Akai Advance family it is hardware-identical to) has a color screen
that its firmware drives by executing **host-uploaded Lua 5.2 programs**, and a hidden
input path carrying its encoders, pads, and buttons. VIP used this to control VST plugins.
CEditor uses it for what VIP never did:

> The CTRL49 becomes the missing front panel for screenless hardware synths:
> a preset browser, a parameter display, and a few pages of assigned knobs —
> while the DAW keeps the keys and faders untouched on their public MIDI ports.

Non-goals, decided deliberately:

- **Not a VIP clone.** No generic VST3 plugin control. The one place plugins ever enter
  is as *clients* of the bridge (see broker model), never as the thing being controlled.
- **Not a panel renderer.** CEditor panels are never compiled to the screen. The firmware
  draws rectangles, text, and pre-made images — nothing else (proven by complete live
  enumeration of the Lua global environment: 16 device functions, no line/arc primitives).
  Attempting to translate the panel editor's visual language into that vocabulary would
  be enormous effort for a degraded imitation.
- **Not touching the DAW's ports.** Keys/wheels (`CTRL49 USB` input) and faders/transport
  (`CTRL49 Mackie/HUI`) are never opened by the bridge. The DAW does not know we exist.
- **CTRL49 only, for now.** Advance keyboards share the display layer (per VIP binary
  strings) but have different USB IDs and an unproven private-input path. The transport
  abstraction keeps the door open; no Advance work until a capture proves the protocol.

## The three core decisions

### 1. Templates and assignments, not freeform screen design

The user does not paint pixels. The Screen Builder edits **assignments** — which device
parameter each encoder slot controls, organized into pages — rendered through a fixed set
of Lua **templates** written once by us (knob page, list/browser page, big readout, meter,
progress). The screen's visual quality comes from pre-rendered image assets, not from
runtime drawing (see filmstrips below).

### 2. One resident broker owns the hardware; everything else is a client

The private capture path is a single-consumer resource, and the display session needs an
uninterruptible 900 ms keepalive. Therefore exactly one process — the **bridge** — ever
owns the CTRL49:

```text
Editor open   → the CEditor app hosts the bridge service.
Editor closed → the standalone Player (or a slim tray build of it) hosts the same service.
VST3          → only ever a thin client that talks to the resident bridge over IPC /
                a visible virtual MIDI port. It never touches the hardware. Optional, later.
```

This is VIP's own architecture with the fragility removed: VIP hid its singleton engine
inside the plugin DLL (shared by all instances in-process), which is why it broke under
plugin sandboxing and died with the DAW. Same broker, sturdier building.

Enforcement, two layers:

1. **Named mutex** at bridge start. Second launch reports "bridge already running" and
   opens no ports. This is the real guard — Windows allows multiple writers on the public
   output port, so the OS will not referee.
2. **Private-capture open as backstop.** If the capture open fails (VIP running, stale
   state), the bridge refuses to start the display session rather than becoming a
   talk-only zombie. Never start a session that cannot hear replies.

### 3. Device Lua is a pure renderer of host-pushed state

There is no proven timer, tick, or input hook on the device. Script functions run only
when the host calls them. Every interaction round-trips:

```text
encoder → hidden cable 2 → bridge reducer → (MIDI to synth) + set_state → draw → screen
```

Division of labor that follows:

- **Device-side (Lua):** presentation only — layout math, text formatting, arc frame
  selection, highlight states. Fat scripts, thin SysEx: a state delta is ~20–30 bytes
  instead of dozens of drawing commands.
- **Host-side (bridge):** everything authoritative — values, focus, patch lists,
  bindings, page state. The device copy is disposable (RAM only) and is rebuilt in full
  on every reconnect.
- **Animation is host-clocked:** periodic `draw` calls at a modest rate; the keepalive
  runs on an independent worker so an expensive page can never starve it.

## Architecture

```text
┌─ CE_ScreenDesigner (web) ─────────────┐
│  Screen document editor:               │
│  pages, slots, bindings, templates     │      compile
│  Preview: wasmoon + draw-API shim      │ ──────────────►  Screen Bundle
└────────────────────────────────────────┘                  ├─ generated Lua (from templates)
                                                            ├─ filmstrip PNGs (rendered by editor)
┌─ CE/src/ControlSurface (native) ──────┐                   └─ assignment map (interned IDs)
│  Protocol library (pure functions)     │                        │
│  Transports: IControllerOutput /       │   consumes             │
│              IPrivateInput             │ ◄──────────────────────┘
│  Session service (single owner)        │
│  Reducer (Shift/bank/page/encoders)    │──► DeviceProfile engine ──► synth MIDI ports
└────────────────────────────────────────┘
   hosted by: CEditor app (editor open) and Player (standalone bridge)
```

Dependency arrows point one way: builder → bundle → session service. The Screen Builder
never learns what SysEx is; the session service never learns what a document is. Deleting
the whole feature would leave the rest of the program untouched.

## The Screen document

A separate document type, sibling to panels and custom components — not a panel mode.

- Own widget vocabulary in its own source-of-truth registry file (the screen designer's
  equivalent of `componentTypes.js`): `KnobSlot`, `ListPage`, `Label`, `ValueReadout`,
  `Meter`, `Image`. Small on purpose; every widget must map onto a template capability.
- Widgets follow the house model — Core + Transform + sections, dot-path addressable —
  so the ValueTree mirror, undo, serialization, and multi-selection machinery work
  unchanged. New bridge handler domain: `ValueTreeBridgeScreenHandlers.inc`.
- A widget's distinguishing sections are `Binding` (device role + semantic parameter,
  reusing the DeviceBindings concept), `Label` (explicit text or inherit-from-profile),
  and `Style` (which filmstrip/template variant). No freeform styling sections.
- Pages can mix devices freely — page 1 GAIA macros, page 2 rack module, page 3 preset
  browser for a third synth — because bindings name a device role per slot.

## The bundle

The compile step (same philosophy as per-panel export identity and compile-at-export
native handlers) turns a Screen document into:

1. **Generated Lua** — our handwritten templates parameterized by the document. Uploaded
   as objects at session start. Always original code; VIP's scripts and graphics are
   local interoperability references only and are never redistributed.
2. **Filmstrip PNGs** — see below. Rendered at compile time by the editor's own renderer.
3. **Assignment map** — slot → (device role, parameter), with every bound address
   interned to a compact integer ID shared by bridge and Lua.

### Host ↔ Lua contract: versioned, tagged

The unified demo proved a packed fixed-offset `set_state` payload. Production uses a
tagged schema instead, so host and templates can evolve independently:

```text
[contractVersion] then repeated: [fieldId] [length] [bytes]
```

The version is stamped in both the generated Lua and the bridge. Mismatch = re-upload,
never limp along. Entry points stay minimal: `init`, `set_state`, `set_text`, `draw`.

### Filmstrips: how the screen gets CEditor's look

Proven technique (it is how VIP's rotary pages work, read from `rotary_page.lua`):

- An asset is a vertical strip of **128 pre-rendered frames**; frame N shows the control
  at value N. One `draw_image` call blits one frame via the source-rect arguments.
- Strips are authored **white-on-transparent**; the draw-call tint argument colors them
  per state at no asset cost. Gradient/full-color looks bake colors into the strip and
  skip tinting (one strip per color state — a memory trade).
- Range indicators use the eraser trick: draw 0→high in the accent color, then draw an
  eraser strip 0→low in the background color.
- CEditor generates strips mechanically from its own control rendering at compile time.
  Anti-aliasing comes free; a strip compresses to ~13 KB (consecutive frames nearly
  identical). One strip per widget *style*, shared by all instances.
- Designs sit on solid panel colors — compositing is paint-over, not true alpha layering.
  CEditor's dark-flat-minimal language is exactly what this pipeline renders best.

## The native module: CE/src/ControlSurface/

Sibling of `DeviceProfile/`, compiled into both the editor app and the Player.

```text
Protocol library     Pure functions, no I/O: base-128 integers, LSB-first 8→7-bit
                     bitstream codec, frame builders (object begin/chunk/end, create
                     target, bind, position, call, draw, keepalive, LED, pad RGB).
                     Golden-byte ctests from the handoff's proven frames.

Transports           IControllerOutput (WinMM long messages to "CTRL49 USB") and
                     IPrivateInput (CreateFileW + IOCTL_KS_PROPERTY capture, the
                     single exotic piece — all KSPROPERTY knowledge stays inside it).
                     Interfaces first: a future Advance or Windows MIDI Services
                     backend must slot in without touching session/page code.

Session service      Owns the mutex, connect/reconnect, object uploads, keepalive
                     worker (independent thread), coalescing render queue, deterministic
                     teardown on exit/exception/device removal. Full state rebuild on
                     reconnect (objects are RAM-only on the device).

Reducer              Shift and Time Division held-state, active pad bank (pads always
                     emit CC 1–8; the host owns logical bank), relative encoder deltas
                     (0x01/+1, 0x7F/−1), page focus, per-page values. Ported from the
                     unified demo's tested C# reducer, self-tests and all.
```

Input dispatch flows into the DeviceProfile engine as semantic intents — the control
surface is one more source of `Set mainSynth.filter.cutoff to 64`, exactly like a panel
control. Patch browsing uses profile patch lists / dump parsing; patch load compiles to
the profile's program-change or SysEx transaction.

## Editor integration: CE_ScreenDesigner

A sibling sub-editor, following the Custom Component Designer precedent:

- One new mode entry in the editor shell. The DisplayPanel dock stays shared — colors go
  through the Colors tab, no bespoke pickers (house rule).
- Fixed 480×272 canvas, page list, template slots; the properties rail edits a slot's
  Binding/Label/Style sections. Assignment picking is the DeviceProfile parameter
  browser, reused.
- **Preview is the real thing:** the editor runs the *generated* Lua in wasmoon against a
  canvas shim of the eight firmware draw primitives, with the *actual* compiled
  filmstrips. Pixel-for-pixel what the hardware will show; no approximation layer.

Touch points with existing subsystems — all additive: DeviceProfile (parameter browser,
patch lists), MIDI I/O service (synth ports), export pipeline (bundle emission), editor
shell (mode entry). The panel editor, CE_Panel, and the scripting model are untouched.

## Phased plan

Order chosen so hardware-free, high-certainty work lands first and the UI lands last,
after the bundle format and contract have been forced to be real.

```text
Phase 1  Protocol library + golden-byte ctests.           No hardware. 1–2 days.
Phase 2  Transports + session service + reducer in C++.   End state: a bare C++
         program doing what the PowerShell unified demo does. First hardware moment.
Phase 3  Measurements (see unknowns): RAM budget probe, redraw-rate budget,
         one CEditor-styled filmstrip on the real screen next to VIP's rotary.
Phase 4  First real synth loop: reducer → GAIA device profile → encoder 1 moves
         real cutoff, screen shows it. Proves the concept end-to-end inside CEditor.
Phase 5  Screen document + bundle compiler + bridge handlers.
Phase 6  CE_ScreenDesigner UI + wasmoon preview shim.
Phase 7  Player-hosted bridge (standalone/gig mode), reconnect hardening, packaging
         (driver-missing and port-contention messages with named culprits).
```

Deferred (log in `later-passes.md` when postponed): Advance support, thin VST3 client
for per-project patch recall, pad-RGB category coloring, patch renaming via data dial,
Mackie/HUI anything.

## Known unknowns and how each gets settled

| Unknown | Settles via |
|---|---|
| Device RAM / object budget (filmstrip ceiling) | Upload PNGs of increasing size/count until failure; also crack `mem_usage`'s numeric selector if a safe reference appears |
| Redraw cost / watchdog tolerance of slow draws | Timed draw calls of increasing complexity |
| Screen color depth (gradient banding) | One gradient test image on hardware; bake dithering if banded |
| Full Lua stdlib inventory (55 globals) | One more capability-explorer page listing them |
| Unproven natives: `asset_get_valid`, `clear_errors`, `draw_system`, `set_hook_enabled`, `led_control_set_level` | Leave uncalled; static/passive reference first. `set_hook_enabled` is the only one that could change the programming model — do not design around it |
| Advance private-input path | Its own capture project, later |

## Constraints

- Windows-only (signed M-Audio driver 7.0.0.3505, 2016; KSPROPERTY private input).
  Validate per Windows version; watch Windows MIDI Services. All of it stays inside the
  transport backend.
- Stock firmware, stock driver, always. Nothing is flashed; the keyboard reverts to
  normal via its own watchdog when the bridge stops.
- Ship only original Lua, images, and protocol code. VIP's scripts/graphics/plugin data
  are reference-only.
- Pad RGB (`04/06`) is proven but visibly quantized — use a small palette of
  well-separated functional colors, not free color choice.
