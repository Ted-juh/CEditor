## Project Overview

A graphical WYSIWYG editor that lets a user design panels that can be converted into a standalone application or plugins to be used in a DAW to communicate/automate hardware synthesizers.

Tech Stack:
- Juce 8 / C++23
- Svelte 5 (runes mode)
- Lua (Sol3 C++ side, wasmoon WebView side)
- Vite (dev server with hot reload into JUCE WebView2)

## General Coding Rules

- **Stop guessing after two failed attempts.** If the user says something still isn't working twice in a row, STOP and change approach:
  1. Re-read the actual files involved — don't work from assumptions.
  2. Ask the user to clarify if the problem description might be ambiguous.
  3. Trace the exact code path from trigger to result before proposing another fix.
  4. Search the web if unsure about an API or behavior.
  There is NO excuse for making the user repeat themselves 4-5 times. Two strikes means the current approach is wrong — debug properly or ask for help.
- Never guess. Always verify. Keep looking after the first mistake — there may be more.
- Follow best practices for each technology.
- Read existing code before modifying it.

## Svelte 5 Rules

### Runes only — no legacy syntax
- `$state()` for reactive variables, `$state.raw()` for large non-mutated objects
- `$derived()` for computed values (expression), `$derived.by()` for complex logic
- `$props()` with destructuring for component inputs
- `$effect()` sparingly — prefer `$derived`, event handlers, or `{@attach}`
- `$bindable()` when two-way binding is needed across components
- Never use: `export let`, `$:`, `on:click`, `<slot>`, `$$props`, `$$restProps`, `createEventDispatcher`, stores

### Template syntax
- `onclick={handler}` not `on:click={handler}`
- `{#snippet name()}...{/snippet}` + `{@render name()}` instead of `<slot>`
- `{@attach fn}` instead of `use:action`
- `class={['base', condition && 'active']}` instead of `class:active={condition}`
- Keyed each blocks: `{#each items as item (item.id)}` — never use index as key
- `{@html content}` only with trusted/sanitized input

### Component patterns
- Props: `let { propA, propB, ...rest } = $props();`
- Events: pass callback props (`onclick`, `onchange`), not dispatchers
- Children: `let { children } = $props();` then `{@render children?.()}`
- Rename reserved words: `let { class: className } = $props();`
- Spread remaining: `<element {...rest}>`
- Context: use `createContext()` for type-safe shared state (not `setContext`/`getContext`)
- Dynamic components: `<MyComponent />` re-renders when `MyComponent` changes — no `<svelte:component>` needed

### Reactivity rules
- `$state` creates deep proxies for objects/arrays — mutations trigger updates
- `$state.raw()` for data that is only reassigned, never mutated (API responses, large arrays)
- `$derived` returns values as-is (not proxied) — fine for read-only computed data
- Never update `$state` inside `$derived` — use `$effect` if side effects are truly needed
- `$effect` runs after DOM updates; `$effect.pre` runs before
- Effects auto-track synchronous reads — async reads after `await` are not tracked
- Use `untrack()` to exclude a read from dependency tracking

### Styling
- `<style>` is scoped by default
- `:global { ... }` or `:global(.class)` for unscoped styles
- `style:color={value}` for dynamic inline styles
- `style:--custom-prop={value}` for CSS custom properties
- Pass `--prop` on components: `<Child --color="red" />`

### Lifecycle
- `onMount()` for DOM-ready code (runs once, client only)
- Return a cleanup function from `onMount` for teardown
- `$effect()` for reactive side effects with automatic cleanup via return function
- `tick()` to wait for pending DOM updates

### Performance
- Use `$state.raw()` for large collections that are replaced, not mutated
- Avoid `$effect` for derived state — use `$derived` instead
- Keyed `{#each}` for lists that change
- Do not create effects or derived state inside loops unnecessarily

## UI/UX Conventions

- **Dark minimal style** — Figma-like: dark background, subtle borders, compact spacing, monochrome with colored accents only for active states/swatches
- **No sliders** — use Figma-style scrub+type inputs (drag to scrub, click to type) or steppers
- **Icon-driven** — prefer icons over text labels where meaning is clear
- **No comboboxes for <5 options** — use icon button groups or segmented toggles instead; dropdowns only for 5+ options
- **Select-all on focus** — every `<input>` must select all text on click/focus (`onfocus={e => e.target.select()}`)
- **Tab switching** — always use CSS `display:block/none` on wrapper divs, never `{#if}/{:else if}`. Components must stay alive in DOM so clicks inside them complete safely

## Drag Interaction Pattern

Draggable UI (gradient stops, HSL sliders, any drag-to-adjust) must follow this pattern:
1. Keep internal `$state` copy of the value
2. During drag: mutate internal state directly for instant DOM updates
3. On mouseup: push final state to parent via `onchange` callback
4. Sync from props via `$effect` only when NOT dragging (guard with a flag)
5. Use plain `document.addEventListener('mousemove/mouseup')` in `onmousedown` — not `<svelte:window>`
6. Add `pointer-events: none` to overlay layers (gradients, checkerboards)

## JUCE ↔ WebView Bridge

Communication uses `window.__JUCE__.backend`:
- **JS → C++**: `emitEvent(eventName, data)` — e.g. `setProperty`, `undo`, `redo`, `requestFullState`, `savePanelAs`, `openPanel`
- **C++ → JS**: `addEventListener(eventName, callback)` — e.g. `fullState`, `propUpdate`, `panelSaved`, `panelOpened`
- **Property paths** use dot-notation: `"Text.Fill.colour"` navigates `tree._children.Text._children.Fill.colour`
- **Bidirectional sync**: JS change → local store update + `setProperty()` → C++ ValueTree mutation → C++ emits `propUpdate` → JS store updates
- **Undo/redo**: managed by C++ `juce::UndoManager`, triggered from JS via bridge
- **Dev mode**: Vite serves at `localhost:5173`, JUCE WebView2 loads from there; hot reload works automatically

## Project File Structure

```
web/src/CE_Application/
  bridge/          — bridge.js (API), valueTree.js (synced store)
  models/          — componentTypes.js (registry), sectionDefaults.js (templates)
  stores/          — all state: controls, panels, history, colorTarget, editorView, etc.
  editor/          — EditorCanvas, CanvasControl, EditorRuler, GuideLines, TabBar
  layout/          — MenuBar, IconPanel, CommonPropertyBar, ZoomBar, StatusBar
  panels/          — PropertiesPanel, DisplayPanel, ComponentTree, PanelCardContent
  sections/        — [Section]Editor.svelte (CoreEditor, TransformEditor, BackgroundEditor, etc.)
  properties/      — Property[Type].svelte (PropertyScrub, PropertyColor, PropertyToggle, etc.)
  components/      — Display tools (ColorChooser, GradientEditor, ConsolePanel, etc.)
```

### Naming conventions
- Section editors: `[SectionType]Editor.svelte`
- Property widgets: `Property[Type].svelte`
- Display tools: `[Tool][Type].svelte` (ColorChooser, GradientEditor)
- Layout pieces: `[Element].svelte` (MenuBar, StatusBar)
- Stores: `[domain].js` (controls.js, panels.js, history.js)

## Store Patterns

- Stores use Svelte 5 `$state` exports — NOT legacy `writable`/`readable` from `svelte/store`
- New stores should follow the same pattern: export `$state` variables and functions that mutate them

## Multi-Selection

- `selectedComponentIds` is a Set of selected component IDs
- `keyObjectId` is the "orange" reference component (first selected, used as the property display source)
- `updateSelectedProperty(path, value)` applies the change to ALL selected components in one batch
- PropertiesPanel always shows the `keyObject`'s values — edits fan out to the rest

## Component Architecture

### Why this architecture
Every component (Panel, Button, Slider, Label, etc.) is built from the same set of reusable sections. This means property names are consistent everywhere — a `Background.Fill.colour` is the same whether it belongs to a Panel, a Button, or a Slider. This uniformity is the foundation for:

- **Scripting**: Lua scripts address any property via the same dot-path syntax:
  `panel.background.border.thickness = 2`
  `panel.slider1.background.fill.colour = "#FF0000"`
  A script author learns one addressing scheme that works on every component.
- **Animations**: keyframes target the same dot-paths — no special cases per component type.
- **States** (hover, pressed, disabled): state overrides are just property patches using the same paths.
- **Editor UI**: one `BackgroundEditor` component edits backgrounds everywhere — no per-type variants needed.
- **Serialization**: the ValueTree in C++ mirrors this structure directly, so the bridge, undo/redo, and file format all use the same paths.

### Structure
- **Core** (mandatory): id, name, controlType, visible, enabled, locked, zIndex, layer
- **Transform** (always present): x, y, width, height, opacity, rotation
- **Optional sections**: Background, Text, Border, Grid, Icon, Effects, Mouse, Children, States, Scripts, Animations
- **Fill** is a shared sub-node reused by Background, Text, Border, Icon, Shadow
- Component types are templates in `componentTypes.js` — just default section recipes
- `createControl(type, overrides)` factory builds a full control object from the template
- Sections paint bottom-to-top in fixed order
- Dot-notation paths address everything uniformly: properties, scripts, animations, states

## Color Target Binding

When any color swatch is clicked:
1. Switch DisplayPanel to Colors tab
2. Register a color target (`{ controlId, path }`) in `colorTarget` store
3. ColorChooser reads the target and writes changes live back to the source property
4. Everything reading that color (swatch, canvas, preview) updates in real-time

## Debugging Rules

When a bug is reported (especially repeatedly):
1. **Trace** the exact code path from trigger to result
2. **Check state** — HMR resets, stale closures, duplicate keys, wrong store subscriptions
3. **Check Svelte rendering** — keyed each blocks, reactivity chains, effect ordering
4. **For visual/CSS bugs**: create minimal standalone HTML test with actual values, verify visually, then fix
5. **Never propose a fix until the actual root cause is identified**

