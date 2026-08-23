# MIDI Workbench — Setup · Monitor · Controller

> Status: **design / mostly-plumbed.** Backend MIDI plumbing already exists; the
> gap is a cohesive UI. Part of the [panel parts backlog](./README.md).
>
> Scope: there are **two distinct layers** — app/authoring MIDI (the Workbench,
> port-owning) and panel runtime MIDI (target-aware widgets). See "Two layers"
> below.

## Why

A MIDI device editor needs a first-class way to choose ports, watch traffic, and
fire test messages. Today these capabilities exist as backend calls and a store,
but the only UI is a 4–20 event peek in `ParameterBrowserTab.svelte`. There is
no unified Setup, no real Monitor, no Controller/tester.

## What already exists (don't rebuild)

From `DeviceProfile/DeviceRuntimeBridge.cpp` + `stores/deviceProfiles.js`:

- **Ports:** `listMidiInputs`, `listMidiDestinations`; normalization in
  `appSettingsSchema.js`.
- **Monitor feed:** `getMidiMonitorEvents` + `onMidiMonitorEvents` → the
  `midiMonitorEvents` writable store (currently only sliced to the last few).
- **Ingest:** `ingestIncomingMidiMessage`.
- **Roles / session:** `setDeviceRoleMapping`, `getDeviceSessionState`,
  `getDeviceTransportCapabilities`, `startDeviceSync`.
- **MIDI-CI:** `requestMidiCiDiscovery`, `setMidiCiProfile`.
- **Send / compile:** `compileParameterMessage`, `setDeviceParameter`,
  `compileRawMidiAction`, `triggerRawMidiAction`, `parseDumpMessage`.

So the backend is ~70% there. The work is a cohesive UI + filtering/decode/learn/
export, plus a few event-dispatch hooks (see scripting-runtime-gaps.md).

### Authoring app — GUI that exists today

There is meaningful UI already, but it's **scattered and overloaded**, not a
cohesive surface:

- **Menu** (`layout/MenuBar.svelte`): New / Open / Import Device Profile,
  "Discover Device (MIDI-CI)…".
- **Device tab → Device Profile Designer** (`editor/DeviceProfileDesignerV2.svelte`)
  with 7 screens (`editor/dpd/Dpd*Screen.svelte`): Discovery (MIDI-CI scan),
  Parameters, Overview, DeviceStructure, MessageShapes, BulkDumps, Advanced
  (raw JSON + SysEx parse + engine tests).
- **Display Panel → "Device" tab = `components/ParameterBrowserTab.svelte`** —
  the de-facto MIDI cockpit: port dropdowns (in/out), sync direction
  (pull/push/live), status/identity, **monitor panel (last 4–20 events)**,
  bulk-send diagnostics, issues, live conflicts. Everything is crammed here.
- **Look bar → `layout/DeviceInsight.svelte`**: binding status, live device
  value, quick-bind picker.
- **Properties → Device Bindings tab** (`panels/PropertiesPanel.svelte`).

### Authoring app — concrete GUI gaps

> Re-checked against the tree on 2026-08-23, item by item. **2, 4 and 5 have changed** and are
> struck through below; **1, 3, 6 and 7 are still accurate** and are the real remaining list.

1. **No dedicated MIDI connection / port manager** — pickers live only in
   `ParameterBrowserTab`'s toolbar.
2. **MIDI Learn** — ~~a disabled "Coming soon" placeholder in `DpdParametersScreen.svelte`~~. The
   placeholder was removed 2026-08-23 rather than left promising something; the feature is still
   unbuilt and is recorded in `docs/known-issues.md`, which also spells out why it is NOT the same
   thing as `MidiLearnChips.svelte` (that binds a CC to a control; this would write a parameter's
   address into a profile).
3. **No raw MIDI send / test UI** — `compileRawMidiAction` /
   `triggerRawMidiAction` are exposed with no construct-and-send surface.
4. ~~**Monitor is a peek, not a monitor** — no filters, no CC/NRPN/SysEx decode breakdown, no
   parameter-annotated stream, no export.~~ **Mostly built.** `MidiMonitorTab.svelte` filters by
   direction, device, type, free-text search and failures-only (`filterMonitorEvents`), and has
   copy/export. Decode is partial — there is decode wiring, but "parameter-annotated stream", where
   every row names the parameter it belongs to rather than showing hex, is the part still worth
   doing, and the inbound parameter index that would name them already exists.
5. ~~**No preset browser**~~ — **built.** `editor/dpd/DpdPresetsScreen.svelte` browses them, and
   `stores/presetLibrarian.js` backs it with banks, named entries and scan capture.
6. **No post-handshake identity readout** (manufacturer / product / revision).
7. **No incoming bulk-dump capture UI** — send only; parsing is hidden behind
   the Advanced-screen JSON textarea.

---

## Two layers + three runtime contexts

MIDI shows up in two different roles; don't conflate them.

- **App / authoring MIDI (the Workbench, port-owning).** The editor (and the
  standalone Player) open their own ports to talk to a real device. This is for
  *building and operating* a panel: setup, monitor, learn, dumps.
- **Panel runtime MIDI (target-aware widgets).** How a *finished* panel does I/O
  at runtime — and the backend depends on the build target.

Three contexts, all confirmed in code:

| Context | MIDI ownership | Source / sink |
|---|---|---|
| **CEditor (authoring app)** | Owns `DeviceProfileService` → own ports | Device under edit (patches, dumps, discovery) |
| **Standalone Player** | `PlayerHost.ownedService` → own ports | End-user's synth |
| **Plugin / VST** | Uses the processor's service; **host owns routing** | `processBlock` `MidiBuffer` in; `scriptMidiCollector` → host bus out |

**Implication — a transport abstraction.** A panel widget should never hardcode
"open port X"; it talks to a MIDI transport the runtime binds: real ports for
editor/standalone, the host buffer for the plugin. This half-exists already
(`PlayerHost` chooses owned-vs-processor service; `scriptMidiCollector` for the
plugin). Then "send CC" works everywhere, and only *setup* is target-specific.

### Widget availability by target

| Capability | Editor | Standalone | Plugin |
|---|---|---|---|
| Port selection / connection setup | app tool | ✅ | ❌ host routes |
| MIDI monitor (widget or tool) | ✅ | ✅ | ✅ host stream |
| Activity LED / panic | ✅ | ✅ | ✅ into host bus |
| MIDI Learn (CC→control) | ✅ | ✅ | ✅ from host (cf. DAW learn) |
| Panel parameter send | to device | to chosen port | to host MIDI bus |

The Setup section below is **app/authoring + standalone only**; Monitor,
Controller, and Learn apply across targets with the source/sink differences above.

---

## GUI shell (clean, understandable, intuitive)

Mirror the DPD designer so it feels native. Group by **what the user is doing**,
not by feature — so six capabilities collapse into **three tabs** (connect →
operate → manage data):

| Tab | Absorbs | What it is |
|---|---|---|
| **Connections** | Setup (§1) | Ports, roles, identity, MIDI-CI discovery, status |
| **Console** | Monitor (§2) + Test (§3) + **Learn (§4, as a mode)** | Live two-way traffic: watch, inject, capture-to-bind |
| **Dumps** | Analyzer (§5) + Presets (§6) | Capture → librarian (default) + analyze/diff (mode) → DPD |

Why these merges:
- **Monitor + Test are two halves of live I/O** — watch + inject in one
  bidirectional console. **Learn is just the console with "bind on next message"
  armed** — a mode, not a tab (which also surfaces it better).
- **Analyzer + Presets are both device memory** — a preset *is* a dump; the
  analyzer dissects dumps. Default to the librarian; "Analyze/Diff" is a mode.

Shell details:
- **Left nav rail**: Connections · Console · Dumps.
- **Persistent top strip** (every tab): active device / profile, connection-status
  LED, quick port switch, global monitor record/pause — never lose sight of
  "connected? data flowing?".
- **Progressive disclosure**: clean defaults; advanced controls (raw hex, dump
  internals, diagnostics) behind expanders.

> Fallback (4 tabs) if Dumps gets cramped: split the developer-facing **Analyzer**
> from the user-facing **Presets** → Connections · Console · Analyzer · Presets.
> Start at 3.

The capability sections below (§1–§6) are the detail; they map into the three
tabs per the table above — nothing is cut, just grouped.

## 1. MIDI Setup

- Enumerate & select **input / output ports** (`listMidiInputs` /
  `listMidiDestinations`).
- Map ports to **device roles** (`setDeviceRoleMapping`) — main synth,
  controller, aux.
- Per-role: **channel**, **SysEx device ID**, MIDI-CI on/off.
- **Connection status** indicators (`getDeviceSessionState`); "Test / Identify"
  (`requestMidiCiDiscovery`, `getDeviceTransportCapabilities`).
- **Persist** the setup in app settings; reconnect on launch; handle
  hot-plug (device connect/disconnect).
- Optional: virtual / loopback port support; Bluetooth-MIDI pairing
  (see juce-capabilities.md).

## 2. MIDI Monitor

- **Live scrolling log** of IN and OUT (`onMidiMonitorEvents`), not just the
  last few.
- Columns: time, **direction**, port/role, channel, **type** (Note / CC / PB /
  PC / AT / SysEx / Clock / RT), data bytes (hex).
- **Decode toggle** — raw hex ↔ human via the DPD (`parseDumpMessage` / profile
  decode): e.g. `B0 4A 64` → "CC#74 ch1 = 100 → Cutoff".
- **Filters:** by direction, port, channel, type; one-click **mute noise**
  (Clock / Active Sensing).
- **SysEx viewer:** expandable hex + ASCII, length, manufacturer-ID lookup.
- **Controls:** pause / freeze, clear, autoscroll, buffer size, search/highlight.
- **Stats:** msgs/sec rate meter, running per-type counts.
- **Export / capture:** save log as text / CSV / `.syx`.

## 3. MIDI Controller / Tester (send side)

- Send arbitrary messages: Note on/off, CC, PC, Pitch Bend, Channel/Poly
  Pressure, **NRPN/RPN**, **raw SysEx** (`compileRawMidiAction` /
  `triggerRawMidiAction`).
- **Test keyboard** (note send), **CC sliders / XY pad** for quick CC sweeps.
- **SysEx sender** with hex editor + checksum helper (`checksum` / `to14Bit`).
- **Panic** — all-notes-off / reset-all-controllers.
- **Macro / sequence sender** — a list of messages with delays (ties into the
  [Timer system](./timer-system.md)).
- **Replay** captured monitor messages back out.

## 4. MIDI Learn (flagship)

A capture-to-bind mode that ties Setup + Monitor + binding together: arm Learn,
wiggle a hardware control, capture the incoming CC/NRPN/note, and **bind it to a
panel control / device parameter** (reuses the routing/binding layer). This is
the highest-value feature for a controller editor — surfaces the whole tool.

## 5. Dump Analyzer (the DPD pre-help — flagship)

Capture a bulk / SysEx dump and break it down — a reverse-engineering tool that
feeds the Device Profile Designer:

- **Structure overlay** on the hex: auto-detect header / manufacturer ID /
  device ID / command / address / data / checksum / footer.
- **Diff mode (the killer feature):** capture dump A → change one parameter on
  the hardware → capture dump B → **highlight exactly which bytes changed** →
  infer that parameter's address/offset without docs.
- **Checksum detection** (e.g. Roland-style sum) + verify/recompute helper.
- **Record / stride splitting:** detect a bulk dump made of N repeated records
  (e.g. 128 patches × M bytes) and show the stride.
- **Annotate → export:** name byte ranges, then emit a **draft DPD message shape
  / parameter map** the Designer imports. (Today raw parse is buried in
  `DpdAdvancedScreen`; this promotes it to a first-class, diff-driven workflow.)

## 6. Preset / Bank Librarian

A patch librarian + device backup:

- **Scan & browse** presets / banks (`startPresetListScan`); rename, reorder.
- **Save / restore banks** to disk as `.syx`.
- **Whole-device backup & restore** (capture all dumps to a file, restore later).

> Consumes the DPD **preset model** (factory vs user slot ranges, writability) —
> see [preset-model.md](./preset-model.md). That model is a gap today: the
> profile has a `presetBrowser` scan recipe but no factory/user slot map, so the
> librarian can't yet know which slots are read-only ROM vs writable user.

## What else — candidate sub-tabs (ranked)

1. **Device snapshot / backup & restore** — one-click full backup to file
   (overlaps the librarian; high value).
2. **`.syx` file library** — import / export / organize SysEx files; send a file.
3. **Macros / sequences** — saved ordered message lists with delays (ties into
   the [Timer system](./timer-system.md)).
4. **Round-trip / latency test** — ping device, measure response time.
5. **MIDI router / thru / filter** — channel remap, filtering, soft-thru
   (advanced; can defer).
6. **Utilities** — standalone checksum / 14-bit / hex calculators.

## Cross-cutting

- **Decode via DPD** so the monitor shows semantic parameter names, not just hex.
- **Scripting:** the monitor is the natural place to surface `onMidiIn` /
  `onSysexIn` / `onParameterReceived` — ~~currently unwired~~ **now wired on both sides**
  (`PluginProcessor.h:679–819` for the player, the bridge's midi/sysex input events for the
  preview; see [scripting-runtime-gaps.md](./scripting-runtime-gaps.md)). Surfacing them in the
  monitor is still the open half.
- **MIDI 2.0 / UMP:** decode/show UMP + MIDI-CI Property Exchange traffic.

## Panel runtime MIDI — target-aware widgets

Placeable components for the *finished* panel (see the availability matrix
above). All route through the runtime's MIDI transport, not a hardcoded port:

- **MIDI Activity LED** — blink on in/out traffic (all targets).
- **MIDI Monitor widget** — compact live log placeable on a panel (all targets;
  plugin shows the host stream).
- **Panic button** — all-notes-off (a Button preset; into host bus under plugin).
- **MIDI Learn helper** — captures + binds CC→control inline (all targets).
- **Port/connection widget** — **standalone only** (no ports to pick in the
  plugin; hide/disable under the plugin target).

## Status / effort

- Backend: ~70% present (ports, monitor buffer, send/compile, decode).
- Missing: the cohesive Setup/Monitor/Controller UI, filters/decode/export,
  MIDI Learn, and a few event-dispatch hooks.
- So "fully established/working" is mostly **UI work over existing plumbing**.

## Implementation approach — build new, then prune

Strategy: build a cohesive **MIDI Surface** alongside the existing cockpit, then
de-clutter `ParameterBrowserTab`. Never gut the working tab first.

### Load-bearing decision first — the split rule

Decide what the new surface owns vs what stays near the canvas, so later pruning
is deterministic, not a judgment call:

- **Global / session-scoped → MIDI Surface:** connections, ports, role mapping,
  identity, monitor, raw send/test, MIDI-learn, bulk dumps.
- **Component-scoped → stays in the Display Panel:** the parameter browser +
  binding for the *currently selected* control.

→ "What to remove from `ParameterBrowserTab`" then becomes "everything global."

### Where it lives — a first-class workspace

Make it a **top-level workspace**, a peer to the Component Designer, Script
Editor, and Device Profile Designer — i.e. a new `tabType: 'midi'` in the
`editorTabs` system (`stores/panels.js`, which already dispatches `panel` /
`component` / `script` / `deviceProfile` / `settings`). Internally it has
sub-tabs **Connections · Monitor · Test · Learn**.

This settles the earlier tab-vs-dock question: it's neither a dock nor a sub-tab
of the DPD — it's its own entity, matching how every other major mode is built.

### Relationship to the DPD — Workbench as the foundation

The Workbench and DPD overlap today because the DPD re-implements live MIDI in
several screens. Split the concerns:

- **MIDI Workbench = the live session layer.** Connections, ports, roles,
  identity, monitor, send/test, learn, live dump capture/discovery. Works with
  **no profile loaded**.
- **DPD = the device data-model layer.** Parameters, message shapes, addresses,
  dump layouts, inheritance. Pure authoring.

Once the Workbench owns the session, the DPD's live-MIDI screens become **thin
consumers** of it (this is the "simplify the DPD" win):

- `DpdDiscoveryScreen` (MIDI-CI scan) → uses the Workbench session; DPD only
  turns results into a profile draft.
- `DpdBulkDumpsScreen` round-trip verify → uses the Workbench connection +
  monitor.
- `DpdAdvancedScreen` SysEx parse → operates on dumps the Workbench captured.
- The disabled **"MIDI learn"** in `DpdParametersScreen` → calls Workbench learn
  (capture address → fill parameter).

**MIDI Learn becomes one capability with two sinks:** it can fill a *panel
binding* (Display Panel) or a *profile parameter address* (DPD), since both now
sit on the same session.

**Store note:** `stores/deviceProfiles.js` already mixes the live-session slice
and the profile-data slice. The Workbench can own the session slice as-is now;
splitting the store (live session vs profile authoring) is a later cleanup, not
a prerequisite.

### Phases (non-destructive → migrate → prune)

1. **New view over existing state.** Scaffold the MIDI screen on the **same
   `stores/deviceProfiles.js` calls** `ParameterBrowserTab` already uses — no new
   plumbing, no data migration, low risk. Ship **Connections + a real Monitor**
   first (biggest gaps). `ParameterBrowserTab` untouched.
2. **Close missing features.** Add **Test** (raw `compileRawMidiAction` /
   `triggerRawMidiAction` send UI) and **Learn** (replace the disabled
   `DpdParametersScreen` placeholder).
3. **Prune.** For each feature now in the surface, delete its duplicate from
   **both** `ParameterBrowserTab` (down to the component-scoped binding browser)
   **and** the DPD's live-MIDI screens (which become thin consumers of the
   Workbench session) — per the split rule.
4. **Polish.** Progressive disclosure + persistence.

### Principles

- **It's a view, not new plumbing** — reorganize UI, reuse stores; feature-flag
  during dev so both coexist.
- **Progressive disclosure, not feature removal** — clean default (status + big
  monitor); advanced bits (raw hex send, dump capture, diagnostics) in secondary
  panels. Nothing lost, just layered.

**De-clutter done when:** the Display Panel's Device tab shows *only* what's tied
to the selected component.

## Open questions / parking lot

- ~~App tool vs placeable components~~ → **both, as two layers** (authoring
  Workbench + target-aware panel widgets).
- ~~How to tackle the build~~ → **build new MIDI Surface, then prune** (see
  Implementation approach).
- ~~Tab vs dock~~ → **top-level workspace** (`tabType: 'midi'`), peer to the
  Component/Script/Device designers.
- Later: split `deviceProfiles.js` into live-session vs profile-authoring stores?
- Define the **MIDI transport abstraction** the runtime binds (real ports vs host
  buffer) so widgets are target-agnostic.
- Where does the Workbench live — a new editor screen alongside the DPD screens,
  or a dock?
- Monitor buffer size / persistence; does capture survive reloads?
- Does MIDI Learn write into device bindings, panel routes, or both? Under the
  plugin, how does panel-internal learn coexist with the DAW's own MIDI learn?

## Add your ideas below
<!-- New MIDI workbench ideas go here. -->
