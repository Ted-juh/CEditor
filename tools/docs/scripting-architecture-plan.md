# CEditor Universal Scripting Architecture Plan

> ⚠️ **SUPERSEDED (historical).** The engine model in this document — a language-neutral "command graph" translated to many languages — was **rejected and retired** (the command-graph script engine has been removed from the codebase). Scripts are now written, stored, and run in the language they were authored in; the only shared thing is the panel API. See [`scripting-redesign-plan.md`](scripting-redesign-plan.md) (the "why") and [`panel-api-spec.md`](panel-api-spec.md) (the contract). Only the non-translation pieces of this plan (sandbox, loop guards, scope model, validation-as-guidance) were kept.

## Purpose

This document describes a scripting architecture for CEditor that works across custom components, panels, devices, and future exported runtimes. The goal is not to bolt JavaScript onto the editor, but to build a language-neutral scripting system that can be authored visually, displayed as readable script, executed in the editor, and translated to JavaScript, Lua, C++, or other targets later.

Three design tensions drive every decision in this plan:

1. **Approachable without being kiddy.** A first-time scripter and a career C++ engineer must both feel the tool was built for them. We solve this with progressive disclosure: one system, several authoring surfaces, no walls between them.
2. **Multi-language as a promise, not an afterthought.** Multiple languages are supported because the source of truth is *not* a language. JavaScript, Lua, and C++ are projections of a shared model, so "supporting Lua" never means re-implementing the system.
3. **A hard line between settings and scripts.** What a component/panel/device *is* lives in settings (declarative, safe, always portable). What it *does* in response to events lives in scripts. This boundary is defined explicitly below and enforced by the runtime, not left to convention.

The core idea is simple:

**Do not make JavaScript the real scripting system.**

JavaScript can be one runtime and one export target, but the real scripting model should be a structured, language-neutral command graph.

## Core Principle

CEditor scripting should be stored as structured data, not as raw text code.

Instead of storing this as the source of truth:

```js
if (value > 64) {
  set("filter.cutoff", value * 2);
}
```

Store this:

```json
{
  "event": "onValueChanged",
  "target": "cutoffDial",
  "steps": [
    {
      "command": "if",
      "condition": {
        "op": ">",
        "left": { "ref": "event.value" },
        "right": 64
      },
      "then": [
        {
          "command": "setValue",
          "target": "filter.cutoff",
          "value": {
            "op": "*",
            "left": { "ref": "event.value" },
            "right": 2
          }
        }
      ]
    }
  ]
}
```

This structured representation is the intermediate representation, or IR. It can be shown as visual blocks, edited with forms, rendered as readable script, executed in the preview engine, or translated to another language.

The command graph is the product. JavaScript, Lua, C++, and CE Script are views or targets.

---

## The Settings / Scripting Boundary

This is the most important architectural rule in the system, and the one most likely to be violated under deadline pressure. State it loudly and enforce it in code.

### The rule

> **Settings declare what something *is*. Scripts declare what something *does* in response to events.**

If a value can be known by reading the document without running anything, it is a setting. If a value is only known by reacting to an event, it is a script.

### Why the boundary matters

- **Predictability.** Settings can be diffed, validated, migrated, and rendered without executing arbitrary logic. A panel with zero scripts is fully understood from its data alone.
- **Safety.** Settings can never loop, never emit MIDI floods, never recurse. All dynamic risk is confined to the scripting layer, where the runtime applies guards.
- **Portability.** Settings always export cleanly to every target. Scripts may contain non-portable blocks; settings never do.
- **Approachability.** A beginner can build a working, attractive panel entirely in settings and never open the script editor. Scripting becomes opt-in power, not a prerequisite.
- **Reviewability.** When something misbehaves, the first question — "is this configured or scripted?" — has an unambiguous answer.

### What belongs in Settings (declarative)

| Concern | Examples |
|---|---|
| Identity & metadata | name, id, label, description, tags |
| Static appearance | default color, size, position, font, default visibility |
| Value definition | min, max, default, step, unit, value type, enum options |
| Static structure | which parts exist, layout, anchoring, z-order |
| Static bindings | a control maps to CC#74 on channel 1 (a fixed, declarative mapping) |
| Capability declaration | "this device supports SysEx dumps", "this control is bipolar" |
| Static constraints | "this value is read-only", "this control is always 0–127" |

A setting is a fact. It does not run.

### What belongs in Scripts (behavioral)

| Concern | Examples |
|---|---|
| Conditional behavior | "if cutoff > 0.75, raise resonance" |
| Relationships between controls | macro knob drives three parameters |
| Dynamic appearance | "turn the arc red while value is hot" |
| Computed values | "format this value as a note name", checksum calculation |
| Cross-component communication | component emits `noteOn`, panel reacts |
| Reacting to incoming data | parse a SysEx dump into controls |
| Timing | debounce, animate, repeat |
| Stateful logic | mode toggles, preset initialization sequences |

A script is a reaction. It runs only when an event fires.

### The grey zone, resolved

Some cases look like they could go either way. Resolve them with a consistent test: **can it be expressed as a fixed fact, or does it require evaluating a condition or event?**

- *A control's range is 20–20000 Hz* → **setting** (a fixed fact).
- *A control's range shrinks when "eco mode" is on* → **script** (depends on state).
- *A dial maps to CC#74* → **setting** (a fixed declarative binding).
- *A dial maps to CC#74 only above value 64, otherwise CC#75* → **script** (conditional).
- *Min cannot exceed max* → **borderline.** Prefer a **declarative constraint in settings** (`constraint: "min <= max"`) when it is a simple invariant the runtime can enforce generically; fall back to a script only when the relationship is non-trivial (e.g. a minimum gap that varies by mode).

The principle: **push everything you can into declarative settings, including a small vocabulary of declarative constraints, and reach for scripts only when behavior is genuinely conditional or event-driven.** This keeps the scripting surface small, which keeps it approachable.

### Enforcement

The boundary is not a documentation suggestion. Enforce it:

- Settings schemas reject expressions and command references. A setting field accepts literals and enum choices only.
- The runtime context exposes settings as **read-only** to scripts by default. A script reads `component.minValue` but cannot *redefine* the min; it can only set the current value within the declared min/max. Changing the *definition* of min is a settings edit, not a script action.
- Declarative constraints (the small vocabulary above) are evaluated by the runtime as guardrails *around* script output, so even a script cannot push a value outside its declared bounds.
- Validation flags any script that tries to mutate a settings-owned field and suggests the equivalent settings change.

---

## Scripting Scopes

Scripting should exist at multiple levels. These scopes share the same command model, but each has different available events, targets, and permissions.

### 1. Component Scripts

Component scripts live inside a custom component package.

They handle local behavior such as:

- Value constraints beyond simple declarative invariants.
- Min, max, and current-value relationships.
- Internal state changes.
- Hit-zone responses.
- Part visibility, styling, and animation.
- Local variables.
- Component output events.

Example use cases:

- A range dial where min cannot pass max, with a mode-dependent gap.
- A waveform selector where hover starts animation.
- A button that changes internal state but exposes only one output value.
- An ADSR component that keeps points in legal order.
- A custom piano keyboard that maps clicks to note values.

### 2. Panel Scripts

Panel scripts live on the panel document.

They handle relationships between controls and wider panel behavior:

- Control-to-control routing.
- Macro knobs.
- Global panel states.
- Preset behavior.
- Conditional visibility.
- Cross-component communication.
- Panel-level variables.
- Device output decisions.

Example use cases:

- When macro changes, update cutoff, resonance, and drive.
- When a mode button changes, show one group of controls and hide another.
- When a custom component emits `noteOn`, update another visual component.
- When a preset loads, initialize several controls.

### 3. Device Scripts

Device scripts live on device/profile definitions.

They handle MIDI, SysEx, NRPN, checksums, and device state synchronization:

- Parameter formatting.
- SysEx byte construction.
- Incoming SysEx parsing.
- NRPN/RPN message sequences.
- Checksum calculation.
- Request/response handling.
- Device capability mapping (the *declaration* of capabilities is a setting; the *logic* that uses them is a script).

Example use cases:

- Roland-style checksum calculation.
- Pack a 14-bit value into two 7-bit MIDI bytes.
- Parse incoming SysEx into panel parameters.
- Request a patch dump and update controls from the response.

### 4. Global Or Project Scripts

Global scripts should be added later and kept more restricted.

They could support:

- Shared helper functions.
- Project constants.
- Reusable mappings.
- Debug helpers.
- Project-wide script libraries.

These should not have broad access to the app or filesystem. They should still use the same command library and official context API.

---

## Designing For Both Beginners And Hardcore Coders

The single biggest risk to this feature is tone. A block-only editor signals "this isn't for serious work." A code-only editor signals "go away unless you already program." The resolution is **one model, four authoring surfaces, and free movement between them** — what is sometimes called progressive disclosure.

The non-negotiable invariant: **every authoring surface reads and writes the same command graph.** A beginner builds with forms; an expert opens the same script as text; both edits land in the same IR. Nobody is locked into a "beginner format" they later have to abandon.

### What makes it approachable (not scary for beginners)

- **You can ship without scripting at all.** Settings alone produce a working panel.
- **Simple Mode** handles the 80% case ("when this changes, set that") as plain-language forms with dropdowns and target pickers. No syntax.
- **Live trace built in.** Every event shows what fired and what changed (see Preview Debugger). Beginners learn by watching, not by reading docs.
- **Inline validation with fixes.** Errors are phrased as guidance ("`rangeArc` isn't a part on this component — did you mean `rangeArc2`?"), not stack traces.
- **No blank page.** The action picker is categorized and searchable; you assemble behavior by choosing, not by remembering.

### What keeps it credible (not kiddy for experts)

- **Real text, both directions.** The CE Script text view is editable, not just a read-only preview. Experts type; the editor parses back to the graph.
- **Raw language escape hatches.** Raw JS/Lua/C++ blocks exist for people who want them (added last, sandboxed, clearly marked non-portable).
- **Keyboard-first, copy-pasteable, diff-friendly.** Scripts serialize to readable text that survives version control.
- **No dumbing-down of capability.** Anything achievable in code is achievable in the graph; the visual layer never caps what experts can express.
- **Honest portability badges.** Experts are told exactly what will and won't survive export, so they can make informed trade-offs rather than discovering them later.

### The four surfaces

They are presented later in "Script Authoring Levels." The key cultural rule: **the editor never forces a level.** A user can drop a complex panel down to text, hand-edit a tricky branch, and pop back up to forms — the graph stays the source of truth throughout.

---

## Command Library

The command library is the foundation of the scripting system. Every command should have a schema, category, documentation, validation rules, runtime executor, and optional language emitters.

Each command should define:

- Command id.
- Display name.
- Category.
- Description.
- Argument schema.
- Return type.
- Supported scopes.
- Supported events.
- Whether it is portable.
- Whether it is preview-safe.
- Whether it is export-safe.
- Runtime executor.
- JavaScript emitter.
- Lua emitter.
- C++ emitter.

Example command metadata:

```json
{
  "id": "setValue",
  "category": "Values",
  "label": "Set Value",
  "description": "Set a value channel, control value, or public input.",
  "portable": true,
  "args": [
    { "name": "target", "type": "targetRef" },
    { "name": "value", "type": "any" },
    { "name": "emit", "type": "boolean", "default": true }
  ],
  "returns": "void",
  "scopes": ["component", "panel"],
  "exports": {
    "js": "ctx.setValue(target, value, { emit })",
    "lua": "ctx:setValue(target, value, { emit = emit })",
    "cpp": "ctx.setValue(target, value, ScriptSetOptions{ emit });"
  }
}
```

### Command Categories

**Values** — `getValue`, `setValue`, `changeValue`, `clamp`, `normalize`, `scale`, `snap`, `round`, `formatValue`

**Component** — `setState`, `toggleState`, `setPartVisible`, `setPartColor`, `setPartText`, `setPartPosition`, `setPartRotation`, `setPartOpacity`, `animatePart`

**Panel** — `findControl`, `setControlValue`, `setControlEnabled`, `setControlVisible`, `setPanelState`, `broadcast`, `route`, `setPresetValue`

**MIDI And Device** — `sendCC`, `sendNRPN`, `sendRPN`, `sendSysex`, `requestParameter`, `parseSysex`, `checksum`, `pack7bit`, `unpack7bit`, `split14bit`, `combine14bit`

**Logic** — `if`, `else`, `switch`, `and`, `or`, `not`, `equals`, `greaterThan`, `lessThan`, `between`, `changed`, `risingEdge`, `fallingEdge`

**Math** (must be portable) — `add`, `subtract`, `multiply`, `divide`, `mod`, `min`, `max`, `abs`, `sin`, `cos`, `tan`, `lerp`, `curve`, `random`, `smooth`

**Timing** — `delay`, `debounce`, `throttle`, `repeat`, `stopTimer`, `onTick`, `after`, `animate`. These need special care; they can create runaway behavior if not controlled.

**Events** — `emit`, `listen`, `stopPropagation`, `preventDefault`, `onValueChanged`, `onPointerDown`, `onPointerMove`, `onPointerUp`, `onHoverStart`, `onHoverEnd`, `onLoad`, `onPresetChanged`, `onDeviceMessage`

**Storage** — `setLocal`, `getLocal`, `setComponentVariable`, `getComponentVariable`, `setPanelVariable`, `getPanelVariable`, `setPresetValue`, `getPresetValue`

**Debug** — `log`, `warn`, `traceValue`, `breakpoint`, `inspectEvent`, `showOverlay`

---

## Script Authoring Levels

Users should not be forced to start with raw code. The scripting system should have multiple authoring levels that all produce the same command graph, and the user should be free to move between them at any time.

### 1. Simple Mode

Form-based editing for common tasks. No syntax.

- When this value changes, set that value.
- When clicked, switch panel state.
- When MIDI message arrives, update parameter.

### 2. Command Mode

A categorized command builder. The user chooses an event, optional conditions, one or more actions, and optional debug output. This is the main mode for most users.

### 3. Script Text Mode

Readable script generated from the command graph — and editable back into it.

```text
on cutoff.changed:
  if cutoff.value > 0.75:
    resonance.value = scale(cutoff.value, 0.75, 1.0, 0.4, 0.9)
    panel.state = "hot"
```

This text is CE Script: a readable projection of the command graph, not JavaScript or Lua.

### 4. Advanced Export Mode

Language views: JavaScript, Lua, C++, JSON command graph. Only portable commands export cleanly to all targets; non-portable commands show warnings.

---

## Script Storage Model

Scripts should be added as structured sections, stored alongside but clearly separate from settings.

For custom components:

```json
{
  "Scripts": {
    "_children": {
      "limitRange": {
        "scope": "component",
        "enabled": true,
        "event": "onValueChanged",
        "target": "rangeDial.value",
        "language": "ce-script-v1",
        "portable": true,
        "steps": [],
        "metadata": {
          "label": "Limit range",
          "description": "Keeps min, max, and current value legal."
        }
      }
    }
  }
}
```

For panels:

```json
{
  "Scripts": {
    "_children": {
      "macroRouting": {
        "scope": "panel",
        "enabled": true,
        "event": "onControlValueChanged",
        "target": "macroControl",
        "steps": []
      }
    }
  }
}
```

The command graph is the source of truth. Text code can be cached or generated, but should not be the only stored representation.

---

## Expression System

Expressions should be language-neutral.

Examples: `event.value`, `component.minValue`, `panel.controls.cutoff.value`, `device.parameters.filterCutoff.value`, `time.now`, `math.scale(value, 0, 127, 20, 20000)`.

Internally, expressions are trees:

```json
{
  "op": "scale",
  "args": [ { "ref": "event.value" }, 0, 127, 20, 20000 ]
}
```

This exports identically across targets:

```js
scale(event.value, 0, 127, 20, 20000)   // JavaScript
```
```lua
scale(event.value, 0, 127, 20, 20000)   -- Lua
```
```cpp
scale(event.value, 0, 127, 20, 20000)   // C++
```

Note that read-only access to settings-owned fields (`component.minValue`) is allowed in expressions; *writing* them is not — that is enforced at the command and context level, not the expression level.

---

## Runtime Architecture

The script pipeline:

1. Author script.
2. Validate script (including the settings-boundary check).
3. Compile command graph.
4. Execute against a controlled context.
5. Return patches, emitted events, debug traces, and device messages.
6. Apply patches through existing editor/runtime update systems.
7. Show trace output in preview/debug tools.

Scripts must not mutate the editor or control tree directly.

Good:

```js
ctx.setValue("cutoff", 9600)
```

Bad:

```js
ctx.panel.controls[4]._children.Value.value = 9600
```

The executor returns structured effects:

```json
{
  "patches": [
    { "target": "control:cutoff", "path": "Value.current", "value": 9600 }
  ],
  "events": [
    { "name": "cutoffChanged", "payload": { "value": 9600 } }
  ],
  "deviceMessages": [],
  "trace": []
}
```

Because effects are structured and applied through the existing update system, the runtime can enforce declarative constraints from settings *as it applies patches* — a patch that would violate a declared min/max is clamped or rejected before it reaches the document.

---

## Script Context

Every script receives a controlled context.

Conceptual surface: `ctx.event`, `ctx.component`, `ctx.panel`, `ctx.device`, `ctx.values`, `ctx.states`, `ctx.parts`, `ctx.variables`, `ctx.time`, `ctx.math`, `ctx.midi`, `ctx.debug`.

The API is function-based, not raw object mutation:

```js
ctx.value("cutoff")
ctx.setValue("cutoff", 9600)
ctx.part("rangeArc").setColor("#00ffaa")
ctx.emit("changed", { value: 9600 })
```

Settings-owned fields are reachable through the context as **reads only**. There is deliberately no `ctx.setMin(...)` that redefines a control's range — that is a settings operation, performed in the settings UI, not from a script.

---

## Event Model

Events must be standardized.

**Lifecycle** — `onInit`, `onLoad`, `onUnload`, `onPresetLoad`, `onPresetSave`

**Interaction** — `onPointerDown`, `onPointerMove`, `onPointerUp`, `onClick`, `onDoubleClick`, `onHoverStart`, `onHoverEnd`, `onWheel`, `onKeyDown`, `onKeyUp`

**Value** — `onValueChanging`, `onValueChanged`, `onValueCommitted`, `onMinChanged`, `onMaxChanged`, `onStateChanged`. The distinction between changing, changed, and committed matters: dragging a dial updates preview continuously, while committed is the right time to send final MIDI output.

**Device** — `onMidiIn`, `onSysexIn`, `onParameterReceived`, `onDeviceConnected`, `onDeviceDisconnected`

**Panel** — `onControlChanged`, `onPanelStateChanged`, `onRouteMessage`, `onTimer`

---

## Validation

Validation is essential. The editor should check scripts before execution and export.

Validation should detect:

- Missing targets.
- Invalid types.
- Commands not allowed in the current scope.
- Events not supported by the target.
- **Scripts attempting to write settings-owned fields** (with a suggested settings edit).
- Circular updates.
- Infinite recursion risk.
- Excessive MIDI output.
- Broken component internals.
- Broken package export.
- Non-portable commands.
- Raw-code blocks that cannot export.

Validation messages should read as guidance, not errors:

```text
setPartColor("rangeArc") references a part that does not exist.
This component has parts: rangeArc2, dialFace, indicator.
```

```text
This script sets "minValue" definition, which is a setting.
To change the allowed range, edit the control's settings instead.
This script may only set the current value within that range.
```

---

## Preventing Infinite Loops

The runtime needs loop protection. Risk example: Script A changes value B; Script B changes value A; Script A runs again; the system loops forever.

Mitigations: transaction IDs, event-origin tracking, maximum script depth, maximum commands per event, silent updates, commit-vs-preview updates, loop detection.

```text
setValue(cutoff, 9000, emit: false)
setValue(cutoff, 9000, silent: true)
```

All of this risk lives in the scripting layer by design — settings cannot loop, which is one more reason to keep as much as possible declarative.

---

## Preview Debugger

The preview debugger should be a headline feature, because it is what makes scripting *learnable* for beginners and *trustworthy* for experts.

It should show: event fired, script name, input values, commands executed, values changed, device messages produced, time taken, warnings, errors.

Example trace:

```text
onValueChanged: macro
  event.value = 0.72
  setValue cutoff = 8701
  setValue resonance = 0.61
  sendCC ch1 cc74 value91
```

For experts, add a toggle to show the same trace as generated JS/Lua/C++ alongside the CE Script view, so they can verify exactly what each target will emit.

---

## Script Editor UI

Four main areas.

**Script List** — columns: enabled, name, event, target, scope, portability, warning count.

**Event And Condition Builder** — event type, target, optional condition, run policy, debounce/throttle options.

**Action Builder** — categorized, searchable command picker (Values, Component, Panel, MIDI, Logic, Math, Timing, Debug). Each command shows required arguments and target pickers.

**Code View** — editable CE Script text, with a mode switch to view (or export) JS, Lua, or C++.

The UI should make the current authoring level obvious and switching between levels a single click, reinforcing that no level is a trap.

---

## Language Export Strategy

Support levels: portable command graph → CE Script → JavaScript → Lua → C++.

Each command can carry emitters:

```js
emitJS(command)
emitLua(command)
emitCpp(command)
```

Commands carry portability badges: Portable, Preview only, JS only, Device only, Export safe, Advanced. These badges are shown in the editor so experts always know the export consequences of a choice before they make it.

---

## Raw Code Blocks

Raw code should be added last, not first.

Raw JavaScript is tempting because it is easy, but it creates problems: hard to translate to Lua or C++, hard to validate, hard to visualize, hard to migrate, hard to sandbox, hard for non-programmers to understand.

Recommended model: command graph first, JS runtime execution second, CE Script text view third, Lua/C++ export fourth, raw code blocks last.

If raw code is added, it must be explicit:

```text
Raw JS block. This may not export to Lua/C++.
```

Raw code must be sandboxed and only access official APIs. No direct access to: filesystem, network, DOM, native bridge, arbitrary `eval`, or internal control-tree mutation. The settings boundary still applies — a raw block reads settings but cannot redefine them.

---

## Worked Examples

### Example: Component Range Rules

The macro range arc needs: min cannot exceed max; max cannot go below min; value cannot leave min/max; optional minimum gap.

Where the boundary falls: the *existence* of min/max/value and their absolute 0–1 bounds are **settings**. The dynamic relationship (the gap, the cross-clamping on change) is a **script**, because it reacts to change events.

CE Script view:

```text
on minValue.changed:
  minValue = clamp(event.value, 0, maxValue - minGap)
  value = clamp(value, minValue, maxValue)

on maxValue.changed:
  maxValue = clamp(event.value, minValue + minGap, 1)
  value = clamp(value, minValue, maxValue)

on value.changed:
  value = clamp(event.value, minValue, maxValue)
```

Command graph fragment:

```json
{
  "event": "onValueChanged",
  "target": "minValue",
  "steps": [
    {
      "command": "setValue",
      "target": "minValue",
      "value": {
        "op": "clamp",
        "args": [
          { "ref": "event.value" },
          0,
          { "op": "-", "left": { "ref": "maxValue" }, "right": { "ref": "minGap" } }
        ]
      }
    },
    {
      "command": "setValue",
      "target": "value",
      "value": {
        "op": "clamp",
        "args": [ { "ref": "value" }, { "ref": "minValue" }, { "ref": "maxValue" } ]
      }
    }
  ]
}
```

### Example: Panel Macro Routing

A macro knob's *range* is a setting; the *routing* of its value to three parameters is a script.

```text
on macro.changed:
  cutoff.value = scale(event.value, 0, 1, 80, 12000)
  resonance.value = scale(event.value, 0, 1, 0.1, 0.85)
```

```json
{
  "event": "onValueChanged",
  "target": "macro",
  "steps": [
    {
      "command": "setValue",
      "target": "cutoff",
      "value": { "op": "scale", "args": [ { "ref": "event.value" }, 0, 1, 80, 12000 ] }
    },
    {
      "command": "setValue",
      "target": "resonance",
      "value": { "op": "scale", "args": [ { "ref": "event.value" }, 0, 1, 0.1, 0.85 ] }
    }
  ]
}
```

### Example: Device SysEx Helper

The device's id, model id, and SysEx address map are **settings** (declared facts about the device). The byte construction and checksum logic are a **script**.

```text
on cutoff.committed:
  value14 = scale(event.value, 0, 1, 0, 16383)
  bytes = sysex([
    0xF0, 0x41, deviceId, modelId,
    address.high, address.mid, address.low,
    value14.msb, value14.lsb,
    checksum(roland, address + value14),
    0xF7
  ])
  sendSysex(bytes)
```

This is command-based internally, not a raw text script.

---

## Data Model Proposal

Add a `Scripts` section to controls, custom components, panels, and device profiles — kept structurally separate from the settings sections it sits beside.

```json
{
  "Scripts": {
    "version": 1,
    "_children": {
      "scriptId": {
        "id": "scriptId",
        "label": "Script Name",
        "enabled": true,
        "scope": "component",
        "event": { "name": "onValueChanged", "target": "value" },
        "conditions": [],
        "steps": [],
        "variables": {},
        "metadata": {
          "portable": true,
          "createdBy": "command-builder",
          "description": ""
        }
      }
    }
  }
}
```

---

## Implementation Phases

**Phase 0: Settings/Scripting Boundary Spec.** Before any runtime work, write the field-ownership table for each scope (which fields are settings, which are scriptable). Add the small declarative-constraint vocabulary to settings schemas. This phase produces no code beyond schema annotations but prevents the most expensive class of future refactors.

**Phase 1: Script Data Model.** Add script storage to custom components and panels (devices later). Deliverables: `Scripts` section defaults, normalization/migration, package export/import support, validation placeholder, and the settings-boundary validation hook.

**Phase 2: Command Registry.** Create a registry for built-in commands at `CE/web/src/CE_Application/scripting/scriptCommandRegistry.js`. Start with a small but real library: `getValue`, `setValue`, `clamp`, `scale`, `if`, `and`, `or`, `not`, `emit`, `log`, `setState`, `sendCC`. Each command includes schema and validation metadata.

**Phase 3: Expression Evaluator.** `scriptExpressions.js`: resolve references (read-only for settings fields), evaluate math, clamp/convert types, report readable errors, avoid arbitrary JS execution.

**Phase 4: Runtime Executor.** `scriptRuntime.js`: execute steps, return patches, emit events, emit device messages, collect trace output, detect recursion, enforce scope permissions, and enforce declarative settings constraints when applying patches.

**Phase 5: Component Scripting Integration.** Value constraints, state changes, hit-zone output, part visibility, debug trace. Connect to existing custom-component value channels, behaviors, links, and interaction preview.

**Phase 6: Panel Scripting Integration.** Control value routing, macro routing, panel states, custom-component public API routes, device output hooks. Reuse the same runtime executor.

**Phase 7: Script Editor UI.** Script list, event picker, target picker, condition builder, action builder, command docs, trace output, generated CE Script view, and a visible authoring-level switch.

**Phase 8: CE Script Text View.** Readable generation from graphs first; later a parser from text to graph, syntax highlighting, inline validation. The parser is not mandatory for phase 1 — the graph comes first.

**Phase 9: Exporters.** JS, Lua, C++ emitters. Only portable commands export at first; non-portable blocks show warnings.

**Phase 10: Script Libraries.** Built-in, project, component, and device libraries (e.g. `clampRange`, `sendRolandChecksumSysex`, `smoothParameter`, `toggleStateGroup`, `scaleMidi14`). Versioned.

**Phase 11: Raw Code Blocks.** Added only after the graph system is strong. Raw JS/Lua/C++, explicitly non-portable unless mirrored, sandboxed in preview, never mutating internal app structures or settings definitions.

---

## Suggested Folder Structure

```text
CE/web/src/CE_Application/scripting/
  scriptCommandRegistry.js
  scriptExpressions.js
  scriptRuntime.js
  scriptValidation.js
  scriptContext.js
  scriptTrace.js
  scriptEmitters/
    emitJavaScript.js
    emitLua.js
    emitCpp.js
  scriptLibrary/
    builtInCommands.js
    builtInFunctions.js

CE/web/src/CE_Application/sections/
  ScriptEditor.svelte
  ScriptCommandBuilder.svelte
  ScriptEventPicker.svelte
  ScriptTracePanel.svelte

CE/web/test/
  scriptExpressions.test.js
  scriptRuntime.test.js
  scriptValidation.test.js
  scriptEmitters.test.js
```

---

## Recommended Build Order

1. Settings/scripting boundary spec.
2. Command graph data model.
3. Command registry.
4. Expression evaluator.
5. Runtime executor returning patches.
6. Component value constraint scripts.
7. Preview trace/debug output.
8. Panel scripts.
9. Script editor UI.
10. CE Script text view.
11. Exporters.
12. Script libraries.
13. Raw code blocks.

---

## Summary

CEditor scripting should be universal, expandable, and easy to understand. The way to get there is to avoid making JavaScript the core model, and to draw a hard line between what is configured and what is scripted.

The core should be:

- A clear settings/scripting boundary, enforced in schema and runtime.
- A structured command graph as the single source of truth.
- A portable expression tree.
- A versioned command library with portability badges.
- A controlled, function-based script context (settings read-only).
- Strong, guidance-style validation.
- A first-class preview debugger.
- Progressive disclosure: one model, four authoring surfaces, free movement between them.
- Optional generated text views and exporters to JavaScript, Lua, C++, and other targets.

This keeps the system inviting for beginners, credible for hardcore coders, predictable through the settings boundary, and portable for future runtimes.
