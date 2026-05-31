# CEditor Universal Scripting Architecture Plan

## Purpose

This document describes a scripting architecture for CEditor that works across custom components, panels, devices, and future exported runtimes. The goal is not to bolt JavaScript onto the editor, but to build a language-neutral scripting system that can be authored visually, displayed as readable script, executed in the editor, and translated to JavaScript, Lua, C++, or other targets later.

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

## Scripting Scopes

Scripting should exist at multiple levels. These scopes share the same command model, but each has different available events, targets, and permissions.

## 1. Component Scripts

Component scripts live inside a custom component package.

They handle local behavior such as:

- Value constraints.
- Min, max, and current-value relationships.
- Internal state changes.
- Hit-zone responses.
- Part visibility.
- Part styling.
- Animations.
- Local variables.
- Component output events.

Example use cases:

- A range dial where min cannot pass max.
- A waveform selector where hover starts animation.
- A button that changes internal state but exposes only one output value.
- An ADSR component that keeps points in legal order.
- A custom piano keyboard that maps clicks to note values.

## 2. Panel Scripts

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

## 3. Device Scripts

Device scripts live on device/profile definitions.

They handle MIDI, SysEx, NRPN, checksums, and device state synchronization:

- Parameter formatting.
- SysEx byte construction.
- Incoming SysEx parsing.
- NRPN/RPN message sequences.
- Checksum calculation.
- Request/response handling.
- Device capability mapping.

Example use cases:

- Roland-style checksum calculation.
- Pack a 14-bit value into two 7-bit MIDI bytes.
- Parse incoming SysEx into panel parameters.
- Request a patch dump and update controls from the response.

## 4. Global Or Project Scripts

Global scripts should be added later and kept more restricted.

They could support:

- Shared helper functions.
- Project constants.
- Reusable mappings.
- Debug helpers.
- Project-wide script libraries.

These should not have broad access to the app or filesystem. They should still use the same command library and official context API.

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

## Command Categories

## Values

Commands for reading and writing values.

- `getValue(target)`
- `setValue(target, value)`
- `changeValue(target, delta)`
- `clamp(value, min, max)`
- `normalize(value, min, max)`
- `scale(value, fromMin, fromMax, toMin, toMax)`
- `snap(value, step)`
- `round(value, decimals)`
- `formatValue(value, format)`

## Component

Commands for modifying a custom component at runtime.

- `setState(component, state)`
- `toggleState(component, state)`
- `setPartVisible(part, visible)`
- `setPartColor(part, color)`
- `setPartText(part, text)`
- `setPartPosition(part, x, y)`
- `setPartRotation(part, degrees)`
- `setPartOpacity(part, opacity)`
- `animatePart(part, property, to, duration, easing)`

## Panel

Commands for panel-level behavior.

- `findControl(id)`
- `setControlValue(id, value)`
- `setControlEnabled(id, enabled)`
- `setControlVisible(id, visible)`
- `setPanelState(state)`
- `broadcast(eventName, payload)`
- `route(source, destination)`
- `setPresetValue(target, value)`

## MIDI And Device

Commands for device communication.

- `sendCC(channel, cc, value)`
- `sendNRPN(channel, msb, lsb, value)`
- `sendRPN(channel, msb, lsb, value)`
- `sendSysex(bytes)`
- `requestParameter(parameterId)`
- `parseSysex(pattern)`
- `checksum(type, bytes)`
- `pack7bit(value)`
- `unpack7bit(bytes)`
- `split14bit(value)`
- `combine14bit(msb, lsb)`

## Logic

Commands for branching and conditions.

- `if`
- `else`
- `switch`
- `and`
- `or`
- `not`
- `equals`
- `greaterThan`
- `lessThan`
- `between`
- `changed`
- `risingEdge`
- `fallingEdge`

## Math

Math commands must be portable.

- `add`
- `subtract`
- `multiply`
- `divide`
- `mod`
- `min`
- `max`
- `abs`
- `sin`
- `cos`
- `tan`
- `lerp`
- `curve`
- `random`
- `smooth`

## Timing

Commands for delayed or repeated behavior.

- `delay`
- `debounce`
- `throttle`
- `repeat`
- `stopTimer`
- `onTick`
- `after`
- `animate`

Timing commands need special care because they can create runaway behavior if not controlled.

## Events

Commands for emitting and responding to events.

- `emit`
- `listen`
- `stopPropagation`
- `preventDefault`
- `onValueChanged`
- `onPointerDown`
- `onPointerMove`
- `onPointerUp`
- `onHoverStart`
- `onHoverEnd`
- `onLoad`
- `onPresetChanged`
- `onDeviceMessage`

## Storage

Commands for script-level variables and persistent values.

- `setLocal`
- `getLocal`
- `setComponentVariable`
- `getComponentVariable`
- `setPanelVariable`
- `getPanelVariable`
- `setPresetValue`
- `getPresetValue`

## Debug

Commands for understanding script behavior.

- `log`
- `warn`
- `traceValue`
- `breakpoint`
- `inspectEvent`
- `showOverlay`

## Script Authoring Levels

Users should not be forced to start with raw code. The scripting system should have multiple authoring levels that all produce the same command graph.

## 1. Simple Mode

Form-based editing for common tasks.

Examples:

- When this value changes, set that value.
- When clicked, switch panel state.
- When MIDI message arrives, update parameter.

## 2. Command Mode

A categorized command builder.

The user chooses:

1. Event.
2. Optional conditions.
3. One or more actions.
4. Optional debug output.

This is the main mode for most users.

## 3. Script Text Mode

Readable script generated from the command graph.

Example:

```text
on cutoff.changed:
  if cutoff.value > 0.75:
    resonance.value = scale(cutoff.value, 0.75, 1.0, 0.4, 0.9)
    panel.state = "hot"
```

This text is not JavaScript or Lua. It is CE Script: a readable projection of the command graph.

## 4. Advanced Export Mode

Language views:

- JavaScript.
- Lua.
- C++.
- JSON command graph.

Only portable commands should export cleanly to all targets. Non-portable commands should show warnings.

## Script Storage Model

Scripts should be added as structured sections.

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

The command graph should be the source of truth. Text code can be cached or generated, but should not be the only stored representation.

## Expression System

Expressions should also be language-neutral.

Examples:

- `event.value`
- `component.minValue`
- `panel.controls.cutoff.value`
- `device.parameters.filterCutoff.value`
- `time.now`
- `math.scale(value, 0, 127, 20, 20000)`

Internally, expressions should be trees:

```json
{
  "op": "scale",
  "args": [
    { "ref": "event.value" },
    0,
    127,
    20,
    20000
  ]
}
```

This can export to JavaScript:

```js
scale(event.value, 0, 127, 20, 20000)
```

Lua:

```lua
scale(event.value, 0, 127, 20, 20000)
```

C++:

```cpp
scale(event.value, 0, 127, 20, 20000)
```

## Runtime Architecture

The script pipeline should be:

1. Author script.
2. Validate script.
3. Compile command graph.
4. Execute against a controlled context.
5. Return patches, emitted events, debug traces, and device messages.
6. Apply patches through existing editor/runtime update systems.
7. Show trace output in preview/debug tools.

Scripts should not mutate the editor or control tree directly.

Good:

```js
ctx.setValue("cutoff", 9600)
```

Bad:

```js
ctx.panel.controls[4]._children.Value.value = 9600
```

The executor should return structured effects:

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

## Script Context

Every script receives a controlled context.

Conceptual API:

```js
ctx.event
ctx.component
ctx.panel
ctx.device
ctx.values
ctx.states
ctx.parts
ctx.variables
ctx.time
ctx.math
ctx.midi
ctx.debug
```

The actual API should be function-based, not raw object mutation:

```js
ctx.value("cutoff")
ctx.setValue("cutoff", 9600)
ctx.part("rangeArc").setColor("#00ffaa")
ctx.emit("changed", { value: 9600 })
```

## Event Model

Events must be standardized.

## Lifecycle Events

- `onInit`
- `onLoad`
- `onUnload`
- `onPresetLoad`
- `onPresetSave`

## Interaction Events

- `onPointerDown`
- `onPointerMove`
- `onPointerUp`
- `onClick`
- `onDoubleClick`
- `onHoverStart`
- `onHoverEnd`
- `onWheel`
- `onKeyDown`
- `onKeyUp`

## Value Events

- `onValueChanging`
- `onValueChanged`
- `onValueCommitted`
- `onMinChanged`
- `onMaxChanged`
- `onStateChanged`

The distinction between changing, changed, and committed is important. Dragging a dial may update the preview continuously, while committed may be the right time to send final MIDI output.

## Device Events

- `onMidiIn`
- `onSysexIn`
- `onParameterReceived`
- `onDeviceConnected`
- `onDeviceDisconnected`

## Panel Events

- `onControlChanged`
- `onPanelStateChanged`
- `onRouteMessage`
- `onTimer`

## Validation

Validation is essential. The editor should check scripts before execution and export.

Validation should detect:

- Missing targets.
- Invalid types.
- Commands not allowed in the current scope.
- Events not supported by the target.
- Circular updates.
- Infinite recursion risk.
- Excessive MIDI output.
- Broken component internals.
- Broken package export.
- Non-portable commands.
- Raw-code blocks that cannot export.

Example warning:

```text
setPartColor("rangeArc") references a part that does not exist.
```

## Preventing Infinite Loops

The runtime needs loop protection.

Risk example:

1. Script A changes value B.
2. Script B changes value A.
3. Script A runs again.
4. The system loops forever.

Mitigations:

- Transaction IDs.
- Event origin tracking.
- Maximum script depth.
- Maximum commands per event.
- Silent updates.
- Commit vs preview updates.
- Loop detection.

Command example:

```text
setValue(cutoff, 9000, emit: false)
```

or:

```text
setValue(cutoff, 9000, silent: true)
```

## Preview Debugger

The preview debugger should become a major feature.

It should show:

- Event fired.
- Script name.
- Input values.
- Commands executed.
- Values changed.
- Device messages produced.
- Time taken.
- Warnings.
- Errors.

Example trace:

```text
onValueChanged: macro
  event.value = 0.72
  setValue cutoff = 8701
  setValue resonance = 0.61
  sendCC ch1 cc74 value91
```

This makes scripting learnable and testable.

## Script Editor UI

The script editor should have four main areas.

## Script List

Shows all scripts in the current scope.

Columns:

- Enabled.
- Name.
- Event.
- Target.
- Scope.
- Portability.
- Warning count.

## Event And Condition Builder

Lets users choose:

- Event type.
- Target.
- Optional condition.
- Run policy.
- Debounce/throttle options.

## Action Builder

Categorized command picker.

Examples:

- Values.
- Component.
- Panel.
- MIDI.
- Logic.
- Math.
- Timing.
- Debug.

Each command should show required arguments and target pickers.

## Code View

Generated CE Script text view.

Later, this can become editable with parser support.

## Language Export Strategy

Support levels:

1. Portable command graph.
2. CE Script.
3. JavaScript.
4. Lua.
5. C++.

Each command can have emitters:

```js
emitJS(command)
emitLua(command)
emitCpp(command)
```

Commands should carry portability badges:

- Portable.
- Preview only.
- JS only.
- Device only.
- Export safe.
- Advanced.

## Raw Code Blocks

Raw code should be added last, not first.

Raw JavaScript is tempting because it is easy, but it creates problems:

- Hard to translate to Lua or C++.
- Hard to validate.
- Hard to visualize.
- Hard to migrate.
- Hard to sandbox.
- Hard for non-programmers to understand.

The recommended model:

- Command graph first.
- JS runtime execution second.
- CE Script text view third.
- Lua/C++ export fourth.
- Raw code blocks last.

If raw code is added, it should be explicit:

```text
Raw JS block. This may not export to Lua/C++.
```

Raw code must be sandboxed and only access official APIs.

No direct access to:

- Filesystem.
- Network.
- DOM.
- Native bridge.
- Arbitrary `eval`.
- Internal control tree mutation.

## Example: Component Range Rules

The macro range arc needs these rules:

- Min cannot exceed max.
- Max cannot go below min.
- Value cannot leave min/max.
- Optional minimum gap.

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
          {
            "op": "-",
            "left": { "ref": "maxValue" },
            "right": { "ref": "minGap" }
          }
        ]
      }
    },
    {
      "command": "setValue",
      "target": "value",
      "value": {
        "op": "clamp",
        "args": [
          { "ref": "value" },
          { "ref": "minValue" },
          { "ref": "maxValue" }
        ]
      }
    }
  ]
}
```

## Example: Panel Macro Routing

Panel-level macro script:

```text
on macro.changed:
  cutoff.value = scale(event.value, 0, 1, 80, 12000)
  resonance.value = scale(event.value, 0, 1, 0.1, 0.85)
```

Command graph:

```json
{
  "event": "onValueChanged",
  "target": "macro",
  "steps": [
    {
      "command": "setValue",
      "target": "cutoff",
      "value": {
        "op": "scale",
        "args": [{ "ref": "event.value" }, 0, 1, 80, 12000]
      }
    },
    {
      "command": "setValue",
      "target": "resonance",
      "value": {
        "op": "scale",
        "args": [{ "ref": "event.value" }, 0, 1, 0.1, 0.85]
      }
    }
  ]
}
```

## Example: Device SysEx Helper

CE Script view:

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

This should be command-based internally, not a raw text script.

## Data Model Proposal

Add a `Scripts` section to controls, custom components, panels, and device profiles.

Example structure:

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
        "event": {
          "name": "onValueChanged",
          "target": "value"
        },
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

## Implementation Phases

## Phase 1: Script Data Model

Add script storage to:

- Custom components.
- Panels.
- Device profiles later.

Deliverables:

- `Scripts` section defaults.
- Normalization/migration.
- Package export/import support.
- Validation placeholder.

## Phase 2: Command Registry

Create a registry for built-in commands.

Suggested file:

```text
CE/web/src/CE_Application/scripting/scriptCommandRegistry.js
```

Start with a small but real library:

- `getValue`
- `setValue`
- `clamp`
- `scale`
- `if`
- `and`
- `or`
- `not`
- `emit`
- `log`
- `setState`
- `sendCC`

Each command must include schema and validation metadata.

## Phase 3: Expression Evaluator

Create a portable expression evaluator.

Suggested file:

```text
CE/web/src/CE_Application/scripting/scriptExpressions.js
```

Responsibilities:

- Resolve references.
- Evaluate math operations.
- Clamp and convert types.
- Report readable errors.
- Avoid arbitrary JS execution.

## Phase 4: Runtime Executor

Create the command graph executor.

Suggested file:

```text
CE/web/src/CE_Application/scripting/scriptRuntime.js
```

Responsibilities:

- Execute steps.
- Return patches.
- Emit events.
- Emit device messages.
- Collect trace output.
- Detect recursion.
- Enforce scope permissions.

## Phase 5: Component Scripting Integration

Integrate scripts into custom component preview and runtime.

Initial use cases:

- Value constraints.
- State changes.
- Hit-zone output.
- Part visibility.
- Debug trace.

This phase should connect to existing custom component value channels, behaviors, links, and interaction preview.

## Phase 6: Panel Scripting Integration

Integrate scripts at panel level.

Initial use cases:

- Control value routing.
- Macro control routing.
- Panel states.
- Custom component public API routes.
- Device output hooks.

This should reuse the same runtime executor.

## Phase 7: Script Editor UI

Create a dedicated script editor.

Possible sections:

- Component script editor.
- Panel script editor.
- Device script editor.

UI should include:

- Script list.
- Event picker.
- Target picker.
- Condition builder.
- Action builder.
- Command docs.
- Trace output.
- Generated CE Script view.

## Phase 8: CE Script Text View

Add readable script generation from command graphs.

Later:

- Parser from text to graph.
- Syntax highlighting.
- Inline validation.

Do not make the parser mandatory for phase 1. The graph can come first.

## Phase 9: Exporters

Add emitters:

- JavaScript.
- Lua.
- C++.

Only portable commands export at first.

Non-portable blocks should show warnings.

## Phase 10: Script Libraries

Support reusable libraries:

- Built-in library.
- Project library.
- Component library.
- Device library.

Examples:

- `clampRange(min, max, gap)`
- `sendRolandChecksumSysex(...)`
- `smoothParameter(...)`
- `toggleStateGroup(...)`
- `scaleMidi14(...)`

Libraries should be versioned.

## Phase 11: Raw Code Blocks

Add raw code only after the command graph system is strong.

Possible raw block types:

- Raw JavaScript.
- Raw Lua.
- Raw C++.

Rules:

- Must be explicitly marked as non-portable unless mirrored.
- Must be sandboxed in preview.
- Must not mutate internal app structures directly.

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
```

UI:

```text
CE/web/src/CE_Application/sections/
  ScriptEditor.svelte
  ScriptCommandBuilder.svelte
  ScriptEventPicker.svelte
  ScriptTracePanel.svelte
```

Tests:

```text
CE/web/test/scriptExpressions.test.js
CE/web/test/scriptRuntime.test.js
CE/web/test/scriptValidation.test.js
CE/web/test/scriptEmitters.test.js
```

## Recommended Build Order

The safest implementation order is:

1. Command graph data model.
2. Command registry.
3. Expression evaluator.
4. Runtime executor returning patches.
5. Component value constraint scripts.
6. Preview trace/debug output.
7. Panel scripts.
8. Script editor UI.
9. CE Script text view.
10. Exporters.
11. Script libraries.
12. Raw code blocks.

## Summary

CEditor scripting should be universal, expandable, and easy to understand. The way to get there is to avoid making JavaScript the core model.

The core should be:

- Structured command graph.
- Portable expression tree.
- Versioned command library.
- Controlled script context.
- Strong validation.
- Preview trace/debugging.
- Optional generated text views.
- Optional exporters to JavaScript, Lua, C++, and other targets.

This keeps the system useful for beginners, powerful for advanced users, and portable for future runtimes.

