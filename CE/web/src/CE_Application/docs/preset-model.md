# Preset / Patch Model — Findings & Gap

> Status: **findings / design gap.** How factory vs user presets and patch names
> are modeled today, and what's missing. Part of the
> [panel parts backlog](./README.md).

## Question

Synths ship a set of **integrated/factory (ROM) presets** plus **user presets**.
How is that covered in CEditor — DPD profile, runtime, and UI?

## What exists today (the mechanism is half-there)

- **`presetBrowser` on the profile** — `{ request, slotVariable, slots |
  startSlot+slotCount }`. A *scan recipe*: "send this name-request for each of
  these slots." **Not in `dpd.schema.json`** — it's an informal field used by
  profiles (`profiles/test/test-sysex-synth.ceditor-device.json`) + the runtime.
- **Live preset scan** — `startPresetListScan` → `latestPresetListScan`
  (`stores/deviceProfiles.js`): iterates the slots, sends the name request per
  slot, parses replies via the **`text` codec**, collects `entries` (slot→name).
  Gives a live list of *whatever is currently in the device's slots*.
- **Dump definitions** — model patch/performance/bank transfers; the `text`
  codec extracts patch names; `verifiedFullDump` tracks save/load. The an1x
  profile names "User Voice (bank)" / "User Step SEQ Pattern (bank)" dumps.
- **`PARAMETER_TYPES.PATCH_NAME`** exists (`models/componentPorts.js`) — the
  [Text Input](./text-input-component.md) port would bind to it — but is barely
  wired.

## What's missing (the real gap)

- **No factory / ROM preset catalog** — nothing stores the synth's built-in
  preset names; the browser scans live, it doesn't ship a known set.
- **No factory-vs-user distinction** — slots are a flat range; no field marks
  which are **read-only ROM** vs **writable user**, no banks/categories, no
  per-slot writability. ("User Voice (bank)" is a label on a dump, not a
  structured partition.)
- **No categories / genre tags, no "init patch" concept.**
- **No persisted librarian** — save/recall user banks locally (that's the
  Workbench Preset Librarian, also unbuilt).

## Proposed split of ownership

Consistent with "Workbench operates, DPD models":

- **DPD owns the preset *model*** (and it should be promoted into
  `dpd.schema.json`): a structured **slot map** — factory/ROM ranges vs
  user/writable ranges — plus banks/categories, the formalized name-request
  recipe (today's `presetBrowser`), and optionally a shipped **factory name
  catalog**. Per-slot `writable` flag drives whether the librarian may overwrite.
- **MIDI Workbench Preset Librarian owns the *operations*** (see
  [midi-workbench.md](./midi-workbench.md) §Presets): scan, browse, save/restore
  user banks — **consuming** the DPD preset model so it knows which slots are
  factory (read-only) vs user (writable).

## Displaying & selecting presets — the selector UI

A **preset selector** is a Combobox (compact) or Listbox (always-visible browser)
whose choices *are* the device's presets; selecting one emits the recall message.
It is **not a new component** — it's a binding/data-source mode on the existing
selection components (see [combobox]/[listbox-component.md](./listbox-component.md)).

It maps almost 1:1 onto the existing `Value.rows` model
(`{ displayText, internalValue, sendValue, receiveValue }`) + the `selectedChoice`
port (CHOICE/ENUM, `onCommit`):
- `displayText` = preset name · `sendValue` = slot/program · `receiveValue` =
  what the device reports when that preset becomes active.

Two pieces are missing to make it *integrated* (vs hand-authored rows):

1. **Recall message in the DPD (device-specific).** "Select preset N" is one of:
   - **Program Change** (`0xC0`, 0–127),
   - **Bank Select** (CC0 MSB + CC32 LSB) **+ Program Change**, or
   - a **SysEx patch-recall** template.
   Model it as a parameterized **"recall slot S (bank B)" action** in the preset
   model, compiled like `compileParameterMessage` / `compileRawMidiAction`. The
   selector just says "recall slot 12"; the DPD emits the right bytes per device.

2. **Dynamic choice source on Combobox/Listbox.** Add
   `choiceSource: static | devicePresets | factoryCatalog`:
   - `devicePresets` → rows mirror the live scan (`latestPresetListScan`),
   - `factoryCatalog` → the shipped factory names (once modeled),
   - `static` → today's hand-authored rows.

Round-trip & structure:
- **Inbound feedback** — device changes preset (sends PC) → selector reflects it
  via `receiveValue` / port feedback / `onParameterReceived` (that inbound event
  isn't wired in the live runtime yet — see
  [scripting-runtime-gaps.md](./scripting-runtime-gaps.md)).
- **Factory/user grouping** — the slot map lets a Listbox section the browser
  ("Factory A/B", "User") and a Combobox group its dropdown. Writability matters
  only for *saving*, not *selecting* (ROM banks are selectable).

**Scope note:** this is the **runtime / end-user** path (picking a sound on a
finished panel, standalone *or* plugin) — distinct from the authoring **Workbench
Preset Librarian** (managing/saving banks). Same model, two consumers.

## To-do

- [ ] Formalize `presetBrowser` in `dpd.schema.json` (it's currently informal).
- [ ] Add a **slot map** to the profile: factory vs user ranges + per-slot/bank
  `writable`, bank/category structure.
- [ ] Optional: a **factory preset catalog** (shipped names) per profile/family.
- [ ] Wire `PATCH_NAME` through (Text Input binding + patch-name SysEx emit).
- [ ] Workbench Preset Librarian reads the slot map; blocks writes to ROM slots.
- [ ] Add a **preset-recall action** to the model (PC / bank+PC / SysEx template).
- [ ] Add `choiceSource: static | devicePresets | factoryCatalog` to Combobox /
  Listbox so a selector can mirror live/factory presets instead of static rows.
- [ ] Wire inbound preset-change feedback so selectors reflect the device.

## Notes

- This is the data-model counterpart to the runtime scanning that already works —
  the scan tells you *what's in a slot now*; the model tells you *what a slot is*
  (factory vs user, writable, which bank).
