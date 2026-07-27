# Scripting modules — design

How to grow the panel scripting API from "adjust the controls someone placed" to "build, draw and
animate the panel" **without** ending up with a 250-name global namespace that can never be changed.

The capability roadmap and the namespace architecture are one decision, not two: the shape has to be
settled before the surface arrives, because every panel written against the old shape is a migration
cost later. This document settles the shape.

---

## 1. Where we are today

The API is a **flat global namespace** — 89 names, every one of them injected into every script:

| | Count | Examples |
|---|---|---|
| Commands | 20 | `set` `get` `on` `off` `emit` `run` `sendCC` `panic` `checksum` |
| Helpers | 22 | `scale` `clamp` `round` `snap` `curve` `lerp` `to7bit` `nibblize` |
| Panel-component verbs | 47 | `setlistNext` `phraseTranspose` `recorderQuantize` |
| Lifecycle + events | 25 handler names | `onPanelReady` `onValueChanged` `onTimer` |

(20 + 22 + 47 = the 89 globals a script sees; the handler names are functions a script *defines*,
not names it is given.)

`CE/web/src/CE_Application/scripting/panelApi.js` is the single source of truth for all of it, and
`CE/web/test/panelApiParity.test.js` holds five runtimes to it. That machinery is new, it works, and
everything below is designed to reuse it rather than replace it.

### Why flat stops working

- **Collisions.** Fourteen of the 89 are ordinary identifiers — `set get on off emit run panic log
  scale clamp round snap curve lerp`. A user writing `function curve(x)` for their own purposes
  shadows API surface silently. At 250 names this stops being a corner case.
- **No cost accounting.** Every export carries the entire prelude in three languages whether or not
  a script touches it. `CMakeLists.txt:295` already records a "show the MB cost" requirement for
  embedded CPython; the script surface itself has never been measured or made optional.
- **No versioning.** There is no way to evolve a member without breaking every panel that used it.
- **No extension point.** Only we can add verbs. A user cannot ship a library.
- **The picker doesn't scale.** 47 of the 89 are one category of panel-component verbs, presented as
  a flat list beside `clamp`.

The build already thinks in modules — `CEDITOR_SCRIPTING`, `CEDITOR_PYTHON`,
`CEDITOR_NATIVE_HANDLERS`, `CEDITOR_VALUE_LAYER` are opt-in with cost attached. The script API never
inherited that idea.

---

## 2. Three tiers

Not "core plus modules". Three distinct kinds of thing, because they answer different questions:

| Tier | Question it answers | Cost | Examples |
|---|---|---|---|
| **`ce`** | *What am I running inside?* | always present | `ce.version` `ce.runtime` `ce.language` `ce.modules` `ce.has()` |
| **objects** | *What am I acting on?* | always present | `ce.panel` `ce.device` `ce.host` |
| **modules** | *What can I do?* | opt-in, measured | `ce.midi` `ce.draw` `ce.math` `ce.anim` `ce.components.*` |

The tiers exist because reading `panel.width` and *creating a control* are not the same kind of
operation and should not cost the same. Under a flat module list they land in the same bucket for no
better reason than sharing a noun.

### Tier 1 — `ce`, the system

Not a module: every module depends on it, and it describes the runtime rather than extending it.
JUCE's equivalents (`JUCE_VERSION`, `SystemStats`, the module list) aren't modules either.

```lua
ce.version          -- the API version this panel was written against
ce.runtime          -- "webview" | "player"
ce.language         -- "lua" | "javascript" | "python" | "cpp" | ...
ce.modules          -- what is loaded, and at what version
ce.has("ce.draw")   -- capability query
ce.onError(fn)      -- diagnostics policy
```

`ce.has()` earns its place immediately. The API already has two runtime boundaries — members that
need the device host (`buildDump`, `.midiValue`) and members that need the panel view (the 47
component verbs) — and today the only way to discover which side you are on is to call something and
read the log. A capability query turns that into `if ce.has("ce.draw") then ... end`.

### Tier 2 — objects, the singletons

```lua
ce.panel     -- this document: size, name, background, controls
ce.device    -- the connected synth: profile, parameters, presets
ce.host      -- the DAW: tempo, transport, saved state
```

`ce.panel` **already exists** as of the panel-addressing work: `get("panel.width")` reads the
document and `self` in a panel script means the panel. That was built first precisely because
everything else needs it, and it validates the tier — it is addressed like a control but is not one.

`ce.device` and `ce.host` are the same idea for the other two singletons a script cares about, and
both are the prerequisite for real capability (see §6).

This also gives `self` a coherent definition at last: **`self` is whichever object the script is
attached to** — a control, or `ce.panel` for a panel script. Which is what SELF has claimed since
the beginning.

### Tier 3 — modules, the verbs

| Module | Contains | Runtime |
|---|---|---|
| `ce.core` | `set` `get` `log` `on` `off` `emit` `run`, lifecycle | any — **stays global** |
| `ce.midi` | CC/NRPN/Sysex + note/PC/bend/aftertouch/clock, `panic`, `checksum`, the 14 encoders | any |
| `ce.device` | dumps, `parameters()`, `profile()`, presets | any, needs device host |
| `ce.math` | `scale` `clamp` `round` `snap` `curve` `lerp`, seeded `random` | any |
| `ce.music` | note names, scales, chords, quantise-to-scale | any |
| `ce.time` | `tempo()`, `onBeat`/`onBar`, timers, `after`, `syncTimer` | any |
| `ce.panel` | `create` `destroy` `clone` `parent` `find` `each` `snapshot` | structure: webview |
| `ce.draw` | the 2D context + `onDraw` | webview |
| `ce.anim` | `animate` `spring` | values any, visuals webview |
| `ce.ui` | `notify` `status` `dialog` | webview |
| `ce.storage` | `state`, `saveSetting`/`loadSetting` | any |
| `ce.components.*` | the 47 panel verbs, one namespace per family | webview |

`ce.components.setlist.next(target)` also reads better than `setlistNext(target)`, and retires 47
globals on its own.

---

## 3. The module manifest

A module is a manifest entry in `panelApi.js` plus a prelude fragment per language. The manifest is
data, like everything else in that file, so the existing tooling reads it for free.

```js
{
  id: 'ce.midi',
  version: '1.0',
  requires: ['ce.core'],
  runtime: 'any',                          // any | webview | player
  requiresDeviceHost: false,
  cost: { lua: 2.1, js: 2.4, python: 2.0 },  // KB of prelude, per language
  members: [ /* the existing member descriptors, unchanged */ ],
}
```

Nothing about a *member* changes. `runtime`, `requiresDeviceHost`, `scopes` and `aliases` already
exist and already work; the manifest hoists the ones that are really module-wide properties up a
level. The panel verbs collapse from 47 individual `runtime: 'webview'` markers to one on
`ce.components` — **the contract gets smaller.**

### What the parity tests become

`panelApiParity.test.js` extends rather than changes:

- every member of an enabled module is implemented by each runtime that claims it (as now);
- no runtime binds a member outside the modules it declares;
- a module's `requires` are satisfiable;
- `cost` is measured, not asserted — the test computes prelude size and fails if the manifest drifts
  by more than a small tolerance.

`scriptPreludeAgreement.test.js` gains nothing new: it already executes the Lua and JS preludes and
diffs them against the WebView, and module fragments are just smaller preludes.

---

## 4. Migration — nobody's panel breaks

Three rules, in order of importance:

1. **`ce.core` stays global.** `set`, `get`, `log`, `on`, `off`, `emit`, `run` and the lifecycle
   hooks are never namespaced. This is `using namespace juce;` — JUCE doesn't make you write
   `juce::String` either, and the verbs every script uses on every line should not cost a prefix.

2. **Everything else namespaces, and keeps its flat name as a declared alias.** The `aliases` field
   already exists on a member (added for `to14Bit`) and the parity test already polices it in both
   directions. So the entire migration is *expressible in the contract we already have*, and every
   alias is machine-checked rather than remembered.

3. **The validator warns on the flat spelling; a codemod rewrites panels.** Aliases are dropped on a
   version boundary, announced, never silently.

```lua
-- all three of these work during the transition
sendCC(1, 74, 100)              -- flat, deprecated, warned
ce.midi.sendCC(1, 74, 100)      -- canonical
local midi = ce.midi            -- the idiomatic form for a script that sends a lot of MIDI
midi.sendCC(1, 74, 100)
```

**Honest cost:** namespacing makes short scripts noisier. The mitigation is rule 1 plus the local
alias above — the same trade JUCE made, and the same escape hatch.

---

## 5. Cost, opt-in and export

A panel declares the modules it uses. The exporter bundles only those preludes, in only the
languages that panel actually scripts in.

```json
"scripting": { "modules": ["ce.midi", "ce.time", "ce.draw"], "apiVersion": "2.0" }
```

That gives the Export tab a real number — *"scripting: 4 modules, 11 KB"* — beside the existing
CPython and native-handler costs, satisfying the same requirement `CMakeLists.txt:295` records for
those. Edit-time gating (the picker hides members from disabled modules) is optional and is the
thing that makes the surface feel small to a beginner; it is a UI decision, not an architectural one.

---

## 6. What this unlocks, in order

The architecture is only worth it for what it carries. Sequenced by dependency, not by appeal:

| Phase | Module(s) | What becomes possible |
|---|---|---|
| 1 | `ce.midi` note/PC/bend, `ce.storage` | A script can play a note and remember something. Both are small, both are cross-runtime, and both are current "why can't I just…" moments. |
| 2 | `ce.device` reads | `parameters()`, `profile()` — a script can ask what the synth actually has. |
| 3 | `ce.time` | Tempo, beats, musical timers. Unlocks every time-based idea at once. |
| 4 | `ce.panel` structure + `onPanelBuild` | **Panels that build themselves from the device.** Eight oscillators discovered → eight rows generated. The thing the options UI structurally cannot do. |
| 5 | `ce.draw` | Oscilloscopes, envelope editors, XY pads, spectrum displays. The highest ceiling on the list. |
| 6 | `ce.anim`, `ce.ui` | Motion and user-facing feedback. |
| 7 | `ce.components.*` completion | The remaining 26 components. Most code, least new capability — deliberately last. |

Phase 4 needs a lifecycle phase that does not exist yet:

```
onPanelLoad     → MIDI/init only, no controls yet          (exists)
onPanelBuild    → structure: create/parent/bind here        (new — phase 4)
onPanelReady    → GUI live, fill values                     (exists)
onPanelDestroy  → real teardown, distinct from window close (new)
onError(info)   → the panel reports its own failures        (new)
```

---

## 7. The runtime boundary, stated once

Most of the new capability is **panel-view only** by nature: drawing needs a canvas, structure needs
a renderer, visual animation needs both. That is the same boundary the 47 component verbs already
sit behind, and it is fine — but it must be *declared*, because an undeclared boundary is exactly
the defect that cost two rounds of repair (`on`/`emit`/`run` silently no-op in one runtime; eight
events that could never fire; `buildDump` returning a quiet null).

So the rule for every new member, without exception:

- **cross-runtime unless it physically cannot be** — `ce.midi`, `ce.math`, `ce.music`, `ce.time`,
  `ce.storage`, `ce.device` reads, and value animation all work window-closed;
- **otherwise declared `runtime: 'webview'`**, defined as an explaining stub in the C++ engines, and
  discoverable ahead of time via `ce.has()`.

The window-closed C++ runtime stays a value-and-MIDI engine. "Scripting supersedes the options" is a
panel-view story, and saying so up front keeps it a documented boundary instead of a surprise.

---

## 8. Open questions

1. **Root prefix.** `ce.midi.sendCC` or bare `midi.sendCC`? Bare is shorter and the panel document
   already scopes everything; `ce.` only earns its keep if third-party modules are expected to
   collide. *Leaning bare, with `ce` reserved for the tier-1 system namespace.*
2. **Third-party modules.** Once a module is data + a prelude + a parity contract, a user can ship
   one. Worth designing for now (module resolution, versioning, trust) or worth deferring?
3. **Edit-time gating.** Does the picker hide disabled modules, or only the exporter act on the
   list? Simpler is export-only; friendlier is both.
4. **`.d.ts` generation.** `panelApi.js` is machine-readable, so typed definitions for TypeScript
   authors are nearly free and would give autocomplete over the whole surface. Which module owns
   that — tooling, or the contract itself?

---

## 9. First slice

Convert the **existing 89 members** into modules with aliases. No new functionality, purely the
shape change, fully covered by the tests already in place — the parity and prelude-agreement suites
should stay green throughout, which is the proof that the conversion is faithful.

Only then does `ce.draw` or `ce.panel` add a single new verb. Getting the architecture right against
a surface we already understand is much cheaper than getting it right against one we are inventing
at the same time.
