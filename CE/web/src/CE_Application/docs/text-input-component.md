# Text Input — Component Integration Spec

> Status: **shipped 🟢, with two named gaps.** `TextInput` is a component type, edited through
> `TextEditor.svelte`, and on QA-01. Still open, both listed in the body below:
> **multi-line** ("Later: multi-line variant") and **§8 device-binding emission for text** — sending
> a patch name as SysEx on commit, which today's emit path does not do because it assumes a numeric
> or enum value.
>
> It said "spec / ready to build" until 2026-08-23. Kept as the design record: the value-model
> section is the only written account of why the text value is modelled the way it is.

## Decision

Implement **Text Input as a new `controlType`** (not a Label variant). It is the
most involved of the data-entry trio because it introduces four things the panel
runtime has not had before:

1. A new **`Behavior.valueType: 'text'`** (alongside none/bool/enum).
2. The **first component to expose a TEXT / PATCH_NAME port** (binding text to a
   device parameter).
3. **Keyboard text-entry interaction** (type → caret → commit), where every
   prior component was click/drag/select only.
4. A **non-automatable value path** — text reaches the device via DeviceBindings
   (SysEx patch-name), not DAW automation.

Scope this MVP to **single-line**; multi-line is a later variant.

## Value model (the key design choice)

- **`Behavior.defaultValue` holds the live text**, with `Behavior.valueType:
  'text'`.
- **`Text.content` becomes the placeholder** (shown when empty) — *not* the live
  value. This is the one subtlety vs. Label, where `Text.content` *is* the value.
- At runtime (preview + Player) the field reads/writes `Behavior.defaultValue`;
  on commit it emits through the `text` port / DeviceBindings.

## Files to change

### 1. `models/componentTypes.js` — register the type
Add a `TextInput` entry, like `Label` but interactive:
```js
TextInput: {
  sections: ['Background','Text','Icon','Effects','ContentLayout','Behavior','States','DeviceBindings'],
  ports: getComponentPorts('TextInput'),
  defaultOverrides: {
    Transform: { width: 160, height: 32 },
    Text: { content: 'Enter text…' },          // placeholder
    ContentLayout: { mode: 'text_only', horizontalAlign: 'left', verticalAlign: 'center', paddingLeft: 8, paddingRight: 8 },
    Behavior: { family: 'text', role: 'textInput', valueType: 'text', defaultValue: '', keyboardEnabled: true, focusable: true, emitValueChange: true },
    States: { /* focus/disabled — clone the combobox states */ },
  },
}
```

### 2. `models/sectionDefaults.js` — allow text values
Confirm `Behavior.valueType` may be `'text'` and `Behavior.defaultValue` may hold
a **string** (today it's `null`/numeric). Mostly a documented widening, not new
fields.

### 3. `models/componentPorts.js` — the first TEXT port
```js
TextInput: [
  { id: 'text', label: 'Text',
    accepts: [PARAMETER_TYPES.TEXT, PARAMETER_TYPES.PATCH_NAME],
    defaultBindingMode: 'onCommit' },
]
```
`getBindingCompatibility` already treats TEXT/PATCH_NAME as non-numeric, so it
won't wrongly match slider/range ports — no change there.

### 4. `layout/IconPanel.svelte` — palette
Add to the static/text group (next to Label):
`{ type: 'TextInput', icon: Type, label: 'Insert Text Input' }` (or lucide
`PenLine`/`TextCursorInput` to distinguish from Label).

### 5. `editor/CanvasControl.svelte` — render an editable field
When `controlType === 'TextInput'`, render an actual `<input type="text">`
(placeholder from `Text.content`, value from `Behavior.defaultValue`), styled
from Background/Text/Font/ContentLayout. **Precedent exists:**
`InteractivePartRenderer.svelte` already renders an editable `<input>` for the
Range spinbutton value field — reuse that pattern rather than inventing one.

### 6. `editor/PanelPreviewSurface.svelte` — text-entry interaction (the new work)
- Track a `textValueOverride` in session (separate from numeric `valueOverride`).
- `focus`/`blur` set the focus state; typing updates `textValueOverride`;
  **commit on Enter or blur**.
- On commit, emit through the `text` port / DeviceBindings (extend the existing
  patch emit path to handle a string → SysEx patch-name message).
- This is a genuinely new interaction loop (type/caret/commit); the Range number
  field is the nearest reference but not a full text editor.

### 7. Properties editor — edit the value + flags
`sections/TextEditor.svelte` already covers font/placeholder (the `Text`
section). Add a small editor (extend `BehaviorEditor.svelte`) for
`Behavior.defaultValue` (initial text), `keyboardEnabled`, `focusable`, and
(later) max length / read-only.

### 8. Device-binding emission for text
Extend the panel runtime's device emit (`scripting/panelRuntime.js` /
DeviceBindings path) to send a **text/patch-name value as SysEx** on commit
(today emit assumes numeric/enum). Verify the DPD already models patchName
parameters as a send target.

## Reused — no change needed

- **`utils/exportParameters.js`** — correctly returns `null` for `valueType:
  'text'` (text is not an automatable DAW parameter). The value reaches the
  device via DeviceBindings, not APVTS. This is the intended behavior.
- **Export / Player** (`scriptPanelExport.js`, `Player/PanelParameters.h`,
  `Player/PanelValueModel.h`) — component-type-agnostic; text just isn't a param.
- **`getBindingCompatibility`** — TEXT/PATCH_NAME stay non-numeric; no false
  matches.

## Later: multi-line variant

Use `Text._children.Multiline`; render a `<textarea>`; Enter inserts a newline
and commit happens on blur (or Ctrl+Enter). Defer until single-line lands.

## Verification checklist

1. Insert a Text Input → shows placeholder; click → caret + focus state.
2. Type / Backspace → text updates; Enter or blur commits.
3. Bind the `text` port to a device `patchName` parameter → editing the field
   sends the patch-name SysEx; inbound updates populate the field.
4. Properties → font/placeholder via Text editor; initial value via Behavior.
5. Export a panel with a Text Input → it produces **no** automatable parameter
   (expected); device binding still works in the Player.

## Notes

- This establishes the **non-automatable, device-bound value path** (text →
  SysEx) — reusable for any future string-valued control.
- Single-line first keeps the new keyboard-interaction surface small; multi-line
  and validation/max-length are follow-ons.
