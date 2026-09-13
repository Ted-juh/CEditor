# Getting from the properties panel to a dock tab

Status: **built**, 2026-09-10. Step 1 of four; see [Still open](#still-open).

Eight dock tabs were built for [`display-panel-candidates.md`](display-panel-candidates.md) —
Effects, Type, Assets, Screen, API, Library, Animation, Designer — and **not one of them could be
reached from the properties panel.** This is the way in.

## The hole

`grep` for `displayTabRequest` across the application found four setters:

| Where | Opens |
|---|---|
| `properties/SwatchCluster.svelte` | Colors |
| `editor/CanvasContextMenu.svelte` | Align |
| `panels/PanelCardContent.svelte` | Gradient |
| `sections/CustomDesignSurfaceEditor.svelte` | its own local dock |

The eight new tabs had none. The only way into any of them was to find the tab in the dock strip
yourself and then press "Use selection" — two clicks, and you had to know the tab existed.

## Colours is the precedent, and it cannot be copied exactly

`SwatchCluster` does both halves in that order:

```js
activateColorTarget({ ...s.target, _swatchKey: s.key }, s.value);
displayTabRequest.set({ tab: 'colors' });
```

What makes it work is that a swatch **is** the value. Click the thing you want to change and the
dock opens on it. None of the eight has a widget like that — an effect stack is not one colour, a
pattern is not one number — so the way in is an icon in the **section header** instead, in the
`tools` slot `PropertySection` already provides ("a section whose only decision lives in its header
needs no body rows").

The icon is the one the dock tab carries, so the two read as one thing.

## Both halves, and why

Arming a target only says WHAT is being edited. The thing that edits it is the dock, which may be
hidden or sitting on Notepad — so a target armed without a tab request lands the user on whatever
tab they left open, which looks like nothing happening.
`CustomDesignSurfaceEditor.svelte` recorded that for its own dock in July; it is the same here.

The dock un-hides itself: `App.svelte` sets `showDisplayPanel` true whenever `displayTabRequest`
changes. So the button does not have to.

## Where the openers are

| Section | Opens | Domain |
|---|---|---|
| Text → Font Settings, Typography, Multiline | Type | `type` |
| Text → Flow | Type | `flow` |
| Text → Effects | Effects | `text` |
| Effects editor → Component / Text Effects | Effects | `component` / `text` |
| Display, PixelDisplay → Screen | Screen | — |
| Display, PixelDisplay → Lighting | Effects | `lighting` |
| Custom Assets → Images, Filmstrips | Assets | — |
| Public API (both editors) | API | — |
| Package Library | Library | *(arms nothing — it edits the library)* |
| Animations → Animation List | Animation | — |
| Step Sequencer → Sequence | Designer | — |
| Envelope → Envelope | Designer | — |
| Turing → Turing Modulator | Designer | — |

**Icon effects have no opener on purpose.** The Effects tab covers text, component and screen
lighting — `availableDomains` in `effectStack.js` is the list — and icon effects are not among them.
A button that opened a tab which then showed something else would be worse than no button.

## The bug this uncovered, and the rule that came out of it

The first version of the openers did not work, and the way it failed is worth writing down.

Click the opener on the Animations section: the Animation tab opens, correctly. Click the opener on
the Sequence section next: **nothing happens.** The dock stays on Animation and the Designer tab
never gets its control.

Instrumenting `activateEditorTarget` showed two calls, in this order:

```
designer:ctrl_seq      <- the opener button
animation:ctrl_custom  <- AnimationTab.onMount
```

Every one of the eight tabs opens with *"if nothing is pointed at me, point me at the selection"*,
and that read **"if nothing of MY kind is pointed at me"**. Which is a different thing. There is one
target store and one dock: a target of another kind is not "nothing armed", it means another tab is
being opened right now. The still-mounted Animation tab saw no *animation* target, armed the
selection, and took the dock back.

So `stores/editorTarget.js` grew `armEditorTargetIfIdle`, which arms only when the store is empty,
and all seven arming tabs use it on mount. The explicit "Use selection" button in each tab still
calls `activateEditorTarget` directly — that is the user saying so out loud, and it may take the
target from whoever holds it. `dockOpeners.test.js` reads all seven tabs and fails if one arms
explicitly on mount again.

## Two other things the building turned up

- **`stopPropagation` was in the button and was not needed.** `PropertySection` renders `tools` in a
  sibling `<span>` of its collapse button rather than inside it, so a click on the opener cannot
  reach the toggle. Removed. The browser check still asserts that clicking an opener does not
  collapse its section.
- **A resize feedback loop in the Designer tab's stages.** Each stage reports its size back through
  `bind:clientWidth/clientHeight` and the renderer is drawn at that size; with the renderer in flow,
  its height fed the container's height. The renderers now sit in an absolutely-positioned layer, so
  the drawing can never influence the box it is measured from.

## What was built

| Piece | File |
|---|---|
| The registry — which tab, which target kind, what the button says | `utils/dockOpeners.js` |
| The button | `properties/OpenInDock.svelte` |
| The rule | `stores/editorTarget.js` → `armEditorTargetIfIdle` |
| Openers | 12 section editors, 16 buttons |
| Tests | `test/dockOpeners.test.js` (16), `browser-checks/dockOpeners.mjs` (13) |

The node tests read the shipped tab strip and the shipped target-kind registry, so an opener naming
a tab that does not exist, or a kind the store would refuse, fails here rather than opening nothing.

## Still open

This is step 1 of four. The panel cannot be stripped until the rest are done:

2. **The search box would go blind.** `propertyFilter` is a plain string and `PropertySection` /
   `PropertyCell` hide themselves when it matches neither their title nor their hint — so search
   only ever finds rows the panel is currently drawing. Take out the Effects rows and typing "glow"
   finds nothing. The eight `all*FieldLabels()` functions written for this day are called **zero
   times**; right now they are dead exports.
3. **Coverage is not 1:1.** Each design record lists what stayed in the panel deliberately: creating
   and deleting a whole animation, adding and removing API entries, adding / removing / duplicating
   a screen zone, saving and importing and renaming a library package, and eleven of the fourteen
   designers.
4. **Then strip**, one section at a time, with the tab already proven.

## Notes

- 2026-09-10: Built after the question "how does a user actually get from the properties panel to
  these tabs?" turned out to have the answer "they do not". The arming bug was found by
  instrumenting the store rather than by reading, after three wrong guesses at it.
