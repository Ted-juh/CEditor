# Listbox — Component Integration Spec

> Status: **spec / ready to build (single-select MVP).** A new `controlType`:
> an always-visible, scrollable list of choices. Part of the
> [panel parts backlog](./README.md); see [component-gaps.md](./component-gaps.md).

## Decision

Implement **Listbox as a new `controlType`** (not a Combobox variant), and
**build a new `ListboxRenderer.svelte`**. Rationale:

- It shares the Combobox **data model** (the `Value` rows, the `selectedChoice`
  port, the same choices editor) — so authoring/binding is reused.
- But it diverges in **rendering and interaction**: always-open, multi-row,
  scrollable, row-click selection with no open/close. Combobox rendering is just
  an inline single text line + a dropdown arrow in `CanvasControl.svelte` — there
  is nothing multi-row to reuse, so a dedicated renderer is cleaner than
  threading conditionals everywhere.

**Scope this MVP to single-select.** Multi-select is a later variant — it needs a
different port (`selectedChoices`) and an export strategy (bitmap/custom), so
keep it out of v1 (see "Later: multi-select").

Effort: more than the Knob (which reused everything) — **~1 new file + ~7 edits.**

## Files to change

### New
**`editor/ListboxRenderer.svelte`** — the core new work. Renders the `Value` rows
in a scrollable container (`role="listbox"`), each row `role="option"` with
per-row selected / hover / focus styling (reuse `segmentStyle` per-row overrides
like the radio/slider parts). No dropdown, no arrow.

### Edit
1. **`models/componentTypes.js`** — add a `Listbox` entry to `COMPONENT_TYPES`,
   copied from `Combobox` but:
   - `Transform: { width: 160, height: 200 }` (tall enough for ~5 rows),
   - `ContentLayout.paddingRight: 10` (no arrow gutter),
   - `Behavior: { buttonType: 'listbox', subtype: 'scrollable', family: 'select',
     role: 'listbox', valueType: 'enum', selectionMode: 'single', ... }`,
   - `States`: add a `createListboxStates()` (clone `createComboboxStates()`),
   - `Value`: same default rows as Combobox.
2. **`models/componentPorts.js`** — add `Listbox` with the **same `selectedChoice`
   port** as Combobox (accepts CHOICE/ENUM, `onCommit`).
3. **`layout/IconPanel.svelte`** — palette entry
   `{ type: 'Listbox', icon: List, label: 'Insert Listbox' }` (lucide `List`).
4. **`editor/CanvasControl.svelte`** — add
   `let isListboxControl = $derived(buttonType === 'listbox')` and dispatch to
   `ListboxRenderer` in the render branch (alongside `isComboboxControl`). The
   combobox-arrow markup stays combobox-only.
5. **`editor/PanelPreviewSurface.svelte`** — add `isListboxControl(control)`;
   render rows **inline** (no modal dropdown, no `openComboboxControlId`); row
   click selects (and does NOT close); Up/Down keyboard moves selection.
6. **`utils/interactionRuntime.js`** — add `'listbox'` alongside
   `radio`/`cyclic`/`combobox` in value resolution (resolve `valueRaw` → row →
   `valueDisplay`). Single-select reuses the existing path.
7. **`sections/ValueEditor.svelte`** — add `buttonType === 'listbox'` to the
   existing `radio || combobox` condition so the per-row "Default" checkbox shows.
   The whole choices editor is otherwise reused as-is.

## Reused — no change needed

- **`sectionDefaults.js`** — `Value` / `Behavior` schemas already cover it.
- **`utils/exportParameters.js`** — single-select Listbox sets `family:'select'` +
  `valueType:'enum'`, which already exports as a numeric index. No change.
- **Properties tab routing** (`panels/PropertiesPanel.svelte`) — the Value/choices
  editor shows via the `Value` section; verify the `when` predicate includes
  Listbox (it keys off the section, not the type, so it should be automatic).
- **Export / Player** (`scriptPanelExport.js`, `Player/PanelParameters.h`,
  `Player/PanelValueModel.h`) — component-type-agnostic.

## Later: multi-select variant

A `selectionMode: 'multi'` Listbox needs:
- a new **`selectedChoices`** port (array of CHOICE/ENUM),
- session state tracking a **set of selected row IDs** (not a single `valueRaw`),
- an **export strategy** (bitmap of row indices, or no automatable param),
- row **checkboxes** / ctrl-click in the renderer.

Defer until the single-select MVP lands; it's a meaningful extension, not a tweak.

## Verification checklist

1. Insert a Listbox → renders an always-open, scrollable list of rows.
2. Edit choices in the Value editor → rows update; "Default" selects the initial row.
3. Click a row / Up-Down keys → selection moves; no open/close behavior.
4. Bind the `selectedChoice` port to a CHOICE/ENUM device parameter → two-way works.
5. Export a panel with a Listbox → appears as a numeric (index) parameter; loads
   in the Player.

## Notes

- This is the template for other list/selection-style components; the
  Combobox↔Listbox split (shared data model, divergent renderer/interaction) is
  the pattern.
- **Preset selector use case:** a Listbox/Combobox with
  `choiceSource: devicePresets` bound to the DPD preset-recall action becomes a
  preset browser that recalls patches on selection — see
  [preset-model.md](./preset-model.md) §"Displaying & selecting presets". The
  always-visible Listbox is the natural patch browser; the Combobox the compact
  picker.
- Reuse `segmentStyle` per-row overrides (as radio groups do) so rows are themable.
