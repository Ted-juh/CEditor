# MIDI 2.0 Integration Plan — MIDI-CI first, UMP second

This document is the deferred plan for bringing MIDI 2.0 to CEditor. It is the companion to
`device-profile-engine-mvp-plan.md` (the authoring/runtime engine)
and builds on the universal Device Profile Designer (DPD) and its dump pipeline.

> The point of CEditor is to control and automate **almost any** hardware synth. MIDI 2.0 matters here
> for exactly one reason above all others: **MIDI-CI lets capable devices describe themselves**, which
> feeds the DPD's "import any synth" goal directly. High-resolution UMP control is real but secondary —
> most hardware in users' hands is still MIDI 1.0.

## TL;DR — sequencing by ROI

1. ~~**M1 — MIDI-CI live discovery (Identity + Property Exchange).**~~ ***Wired*** *(verified
   2026-08-23)* — `CE/src/DeviceProfile/MidiCiSession.cpp` calls `startDiscovery()`,
   `DeviceProfileServiceMidiCi.cpp:96` emits `midiCiDiscoveryComplete`, and
   `DeviceRuntimeBridge.cpp:153` exposes `startMidiCiDiscovery` to the panel. What has NOT happened
   is a CI-capable device on the other end of the cable, which is the same gap as everything else
   here: no hardware session yet.
2. **M2 — MIDI-CI Profile Configuration.** Enable/select a device's own MIDI-CI profiles; report them
   in the DPD. Small, builds on M1's session.
3. **M3 — UMP transport + schema scaffolding.** Add `midiVersion`, group/per-note wire qualifiers, and
   wider codecs (`u16/u32/s16/s32`) to the schema + engine, with UMP↔MIDI-1 translation. No behaviour
   change for existing 1.0 profiles.
4. **M4 — MIDI 2.0 protocol messages.** Compile to UMP (32-bit CC, high-res pitch, NRPN2) when the
   transport negotiates the MIDI 2.0 protocol; fall back to MIDI 1.0 otherwise.
5. **M5 — Per-note controllers + advanced.** Per-note CC/pitch in the component + animation model.

Each phase ships independently and leaves the app fully working. Stop after any phase.

## Current state (grounded)

Everything today is **MIDI 1.0**. Anchors:

- **Send**: `DeviceProfileService::sendTransactionNow()` (`CE/src/DeviceProfile/DeviceProfileService.cpp`
  ~1785) → `juce::MidiOutput::sendMessageNow(juce::MidiMessage(bytes…))`. Raw byte arrays.
- **Receive**: `DeviceProfileService::handleIncomingMidiMessage()` (~2691), a `juce::MidiInputCallback`;
  categorises sysex / CC / generic and dispatches to `ingestIncomingMidiBytes()`.
- **Compile**: `compileCc` (~1917, 3-byte CC), `compileNrpn` (~1959, 4× CC, 14-bit), `compileSysex`
  (~2036, template + checksum). Channels hard-limited to 1–16.
- **Value codecs** (`DeviceProfileEngine.cpp`): `u7 / u8 / s7 / u14 / nibbled / packed8to7 / bitslice`
  + dump text codecs. Max resolution 14-bit (NRPN/u14).
- **MIDI-CI**: JUCE 8.0.7 ships the full `juce_midi_ci` module — **compiled-in but not wired** to the
  runtime. `CE/dpd/tools/import-midici.mjs` already converts a **Property Exchange** JSON blob into a
  partial native profile (CC params only; explicitly notes MIDI-CI can't expose SysEx
  addresses/bit-packing/checksums/dumps), `completeness:"partial"`.
- **Transport capabilities** scaffold: `DeviceProfileService.cpp` (~651) exposes
  `canSendMidi/Sysex`, chunked sysex, scheduled messages, a plugin-format roadmap (VST3/AU/CLAP
  `midiRouting:"host"`, "planned"). **No** UMP flag, **no** group model, **no** per-note, **no**
  MIDI-CI session state.

So MIDI 2.0 is greenfield on top of a clean MIDI-1.0 base. Nothing here needs to be torn out — MIDI 2.0
is additive, gated by capability negotiation.

---

## M1 — MIDI-CI live discovery (Identity + Property Exchange)

**Goal:** plug in a CI-capable synth, press "Discover", and get a populated DPD profile — no manual
data entry. This is the single most valuable MIDI 2.0 feature for CEditor's mission.

- **Engine/transport (C++):** integrate `juce_midi_ci` `CIDevice` into `DeviceProfileService`.
  - Send a **Discovery** message; collect Discovery Replies (MUID, manufacturer, family, model,
    version) — overlaps the existing Identity-Reply matcher (`expectedResponseKind == "identity"`),
    so route both into the same device-identity result.
  - Run **Property Exchange**: request `ResourceList`, then `DeviceInfo`, `ChannelList`,
    `ProgramList`, and any `AllCtrlList`/`ChCtrlList` resources. These are JSON over CI — exactly the
    shape `import-midici.mjs` already parses.
  - Surface a `midiCiSession` object on the service: `{ muid, supportsPropertyExchange,
    supportsProfileConfiguration, supportsProcessInquiry, discovered:{…} }`.
- **Bridge + DPD (JS):** new bridge events `requestMidiCiDiscovery` / `midiCiDiscovered`. Feed the PE
  JSON straight through the **existing** `import-midici.mjs` to produce a draft profile, then open it
  in the Designer (reuse the Save→engine + reload-fidelity path already built). Mark provenance
  `source:"midi-ci"`, `completeness:"partial"`.
- **Honest limit (already documented in the importer):** MIDI-CI Property Exchange describes
  *controllers, programs, identity* — it does **not** give SysEx addresses, bit-packing, checksums, or
  dump layouts. So M1 yields a CC-level profile; the SysEx/dump layer still comes from the manual or a
  capture (the DPD byte-map UI from C2-C). M1 + manual dump entry = a full profile far faster than today.
- **Verify:** a `juce_midi_ci` loopback / mock responder in `CEditorDeviceProfileTests`: feed a canned
  Discovery + PE ResourceList/DeviceInfo/ChannelList, assert the produced profile matches a fixture
  (reuse the `import-midici.mjs` fixtures so JS and C++ agree, same single-source-of-truth pattern used
  for the dump parity tests).

## M2 — MIDI-CI Profile Configuration

**Goal:** list and toggle a device's own MIDI-CI **Profiles** (a CI concept: e.g. "General MIDI",
"Drawbar Organ"), and reflect enabled profiles in the DPD.

- Use `juce_midi_ci` profile host/delegate to enumerate **Profile Inquiry** results per channel/group,
  enable/disable, and listen for Profile Enabled/Disabled notifications.
- DPD: a read-only "Device MIDI-CI profiles" panel (Overview or Device screen) + an enable toggle.
  Store the enabled set in the profile's `provenance`/`device` block.
- Small phase; depends only on the M1 session.

## M3 — UMP transport + schema scaffolding

**Goal:** make the model and engine *able* to express MIDI 2.0 without yet requiring it. Pure additive
plumbing; existing 1.0 profiles are byte-identical.

- **Schema (`dpd.schema.json`):**
  - `midiVersion: "1.0" | "2.0"` on the profile (default `"1.0"`).
  - Wire qualifiers: optional `group` (0–15) and `perNote: boolean` on a wire; keep `channel` (now 1–16
    *within* a group).
  - Encodings: add `u16 / u32 / s16 / s32` to `$defs.encoding` (and to `codecs.mjs` encode/decode +
    `validate.mjs`); these are the MIDI 2.0 high-res value widths.
  - New message-shape kinds: `cc2`, `nrpn2`, `perNoteCc`, `relativeCc2` (UMP).
- **Engine (`DeviceProfileEngine.cpp`):** a UMP layer beside the byte-array path —
  `juce::universal_midi_packets` (UMP types, `Midi1ToBytestreamTranslator`/`ToUmp`). Compile target is
  chosen by the negotiated transport protocol; when the device/host is MIDI 1.0, **down-translate** UMP
  → MIDI-1 (so a 2.0 profile still drives 1.0 hardware at reduced resolution).
- **`codecs.mjs` / `dumps.mjs`:** widen value codecs to 16/32-bit; dumps are still MIDI-1 SysEx bytes
  (8→7 etc.), unaffected. Keep the JS ⇄ C++ parity tests.
- **Transport caps:** add `supportsUmp`, `negotiatedProtocol: "midi1"|"midi2"`, `supportsPerNote`,
  group count.

## M4 — MIDI 2.0 protocol messages

**Goal:** actually emit MIDI 2.0 when negotiated.

- `compileCc2` (32-bit value CC), high-res pitch bend, `compileNrpn2` (single UMP, 32-bit — no 4×CC
  dance), registered/assignable per-note controllers.
- Resolution mapping: a parameter's semantic range maps to 7/14/32-bit by the active protocol; one
  authoring model, multiple wire resolutions. Reuse the existing normalization (`normalizeLinear`,
  `choiceIndex`).
- Verify: UMP word-exact tests in `CEditorDeviceProfileTests` (mirror the dump parity approach: a known
  semantic value → exact UMP words, both protocols).

## M5 — Per-note controllers + advanced

**Goal:** expose per-note expression in the component + animation model (per-note CC, per-note pitch),
since MIDI 2.0's headline feature is per-note control.

- Component wires gain `perNote` targets; animation/automation keyframes can address a note dimension.
- Largely a UI/model phase once M3/M4 land; lowest urgency.

---

## Reuse (don't reinvent)

- **`juce_midi_ci`** (vendored in JUCE 8.0.7) — Discovery, Property Exchange, Profile Configuration,
  Process Inquiry. M1/M2 are integration, not protocol implementation.
- **`juce::universal_midi_packets`** — UMP types + MIDI1⇄UMP translators for M3/M4.
- **`import-midici.mjs`** — already turns PE JSON into a profile; M1 feeds it live data.
- **Identity-reply matcher** + **device-sync/request** machinery already in the service — CI Discovery
  routes into the same identity result.
- **Transport-capabilities scaffold** — extend, don't replace.
- **DPD Save→engine + reload fidelity + byte-map UI** — discovered profiles flow through the same path.
- **JS ⇄ C++ parity test pattern** (from the dump work) — one fixture drives both sides for CI import
  and UMP compilation.

## Honest scope notes

- **MIDI-CI ≠ full profile.** PE exposes controllers/programs/identity, not SysEx addresses, bit
  packing, checksums, or dump layouts. M1 accelerates the CC layer; the SysEx/dump layer still needs the
  manual or a capture via the DPD byte-map authoring (C2-C). That is a real, large speed-up — not a
  one-click complete profile.
- **Hardware reality.** MIDI-2.0-protocol hardware is still rare; **MIDI-CI over MIDI 1.0 is shipping
  today** on many recent synths. That is *why* M1/M2 lead and M3–M5 follow. Don't invert the order
  chasing UMP resolution that little current hardware accepts.
- **No teardown.** Every phase is additive and capability-gated; MIDI 1.0 profiles keep working
  byte-for-byte. A MIDI 2.0 profile driving MIDI 1.0 hardware simply down-translates.
- **Transport dependency.** Live UMP/MIDI-CI needs an OS/driver path that carries it. Standalone owns
  its ports (workable now); plugin formats route through the host (the caps roadmap already says
  `midiRouting:"host"`), and host UMP support varies — gate on `negotiatedProtocol`.

## First concrete step when resumed

Wire `juce_midi_ci` `CIDevice` into `DeviceProfileService` behind a `requestMidiCiDiscovery` bridge
event, run Discovery + a `DeviceInfo`/`ChannelList` Property Exchange, and pipe the JSON through the
existing `import-midici.mjs` to open a draft profile in the Designer. That single slice proves the
highest-value path end-to-end before any UMP/schema work.
