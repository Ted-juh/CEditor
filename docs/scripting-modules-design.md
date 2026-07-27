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

A panel declares the modules it uses. The exporter resolves the declaration and bakes it in; the
shipped runtime gates everything else.

```json
"scripting": { "modules": ["ce.core", "ce.midi", "ce.music"], "apiVersion": "1.0" }
```

That gives the Export tab a real number — *"3 modules, 27.7 KB"* — beside the existing CPython and
native-handler costs, satisfying the same requirement `CMakeLists.txt:295` records for those.

**What the number is, and is not.** It is measured source bytes of the scripting surface, summed
across the runtimes that carry a prelude. It is **not** a binary delta: Lua and JavaScript are
compiled into the player either way, so a shorter module list does not currently produce a smaller
`.vst3`. Saying "11 KB saved" when nothing shrinks would be worse than saying nothing. What the
declaration buys today is a smaller *surface* — fewer names in scope, a picker that can be filtered
(slice 4), and a machine-checkable statement of what a panel actually depends on. Compile-time
stripping stays available later: the fragments are delimited data and the exporter already passes
per-panel cache variables to CMake, so it is a build change and not an architecture change.

Edit-time gating (the picker hides members from disabled modules) is what makes the surface feel
small to a beginner; it is a UI decision, not an architectural one, and it is slice 4.

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

## 8. Decisions

| Question | Decision |
|---|---|
| Root prefix | **`ce.` on everything.** `ce.midi.sendCC()`. Zero collision risk, obvious provenance, and it is what makes `ce.ext.*` coherent. |
| Third-party modules | **Full support.** A module is data + a prelude + a parity contract, so a user can ship one. |
| Distribution | **Installed into the app**, not bundled in a panel. A module extends what the *application* can do, so every panel gets it. |
| Third-party namespace | **`ce.ext.<name>`** — e.g. `ce.ext.roland_sysex`. Grouped under `ce` as asked, but never inside `ce.<module>`: nobody ships a JUCE module into `juce::`, and without a registry there is no name authority, so two modules claiming `ce.device.roland` would resolve as "last installed wins", silently. |
| Gating | **Export and picker both.** Unused modules are not bundled and the Export tab shows the cost; the picker hides members from modules a panel has not enabled. |
| `.d.ts` generation | Tooling, alongside `gen-script-modules.mjs`, which already reads the contract. |

### What "installed into the app" costs
A panel now depends on something outside itself, so three things follow:

- **The exporter must bundle it.** A shipped plugin has no CEditor install to read from, so the
  module's prelude is copied into the export. Otherwise every export using a module breaks on
  somebody else's machine.
- **Missing-module handling.** Opening a panel that wants `ce.ext.roland_sysex` without it installed
  must name it, say where it came from, and keep the rest of the panel working.
- **Install-time collision check**, plus install/remove/version UI.

A registry stays possible and stays deferred; the manifest already carries `id`, `version` and
`requires`, so adding one later does not change the format.

---

## 9. Slices

1. **Manifest + namespacing** — the existing 89 members into `ce.*` modules, flat names kept as
   aliases. No new functionality; the parity and prelude-agreement suites stay green throughout,
   which is the proof the conversion is faithful. ✅ *done*
2. **Phase-1 capability** — `ce.midi` note/PC/bend/aftertouch/clock, `ce.storage` state + settings.
   ✅ *done*
3. **Opt-in + cost** — a panel declares its modules, the exporter bundles only those, the Export tab
   reports the size. ✅ *done*
4. **Picker filtering** — the editor hides members from modules a panel has not enabled.

Then `ce.ext.*` install/resolve, and only after that does `ce.draw` or `ce.panel` structure add a
verb. Getting the architecture right against a surface we already understand is much cheaper than
getting it right against one we are inventing at the same time.

### How slice 1 landed
The layout lives in `MODULES` + `MODULE_MEMBERS` in `panelApi.js`. The WebView runtime builds `ce`
from that at runtime, so it cannot drift. The three C++ engines embed their preludes as string
literals and cannot import anything, so their namespace block is generated by
`tools/scripts/gen-script-modules.mjs` and committed; `panelApiParity.test.js` regenerates and fails
on a stale block.

Two things the work turned up:

- **`goto` is a Lua keyword.** `ce.components.setlist.goto(...)` parses in JS and Python and fails in
  Lua, in both the generated table and the call site. The member is `jump`, and the generator now
  refuses any short name that is a keyword in any of the three languages.
- **JS numbers reached the host as doubles.** `sendCC(1, 74, 100)` handed over `100.0` where Lua and
  Python hand over `100` — the same asymmetry `varToSol` already folded for Lua. Numerically
  harmless, but anything stringifying a script value printed differently per language. Folded at the
  single point every JS argument crosses.

### How slice 2 landed

Eleven members, all cross-runtime: `sendMidi`, `sendNote`, `sendNoteOff`, `sendProgramChange`,
`sendPitchBend`, `sendAftertouch`, `sendClock`, `sendTransport` in `ce.midi`, and `state`,
`saveSetting`, `loadSetting` in `ce.storage`.

Only **three** of them are host primitives — `sendMidi`, `saveSetting`, `loadSetting`. They are new
virtuals on `ScriptHostApi`, new `BridgeScriptHost` callbacks, and three appended slots on the native
handler vtable (`CE_ABI_VERSION` still 1: the append is compatible by construction, a bump would
disown every module already built). Everything else — every note, program change, bend, aftertouch,
clock and transport message — is arithmetic over `sendMidi` inside the shared prelude, so the five
runtimes cannot disagree about a byte. `state` is a plain per-script table living in the script's own
environment, which is what makes reloading a script clear it.

Where the settings land is the host's business, and each host answers differently: the player writes
them into the DAW session as a `ScriptSettings` child of its state, the editor keeps them under
`panel.scripting.settings`. The script sees one pair of verbs either way.

One documentation bug surfaced while testing the byte output: `panelApi.js` said `noteName(60)`
returns `"C3"`, while all four implementations return `"C4"` — scientific pitch notation, where
middle C is C4. The runtimes agreed with each other and disagreed with the doc, so **the doc was
wrong and was fixed.** Changing the code instead would have shifted every existing script's notes by
an octave to satisfy a sentence nobody had implemented.

### How slice 3 landed

Three parts: a panel declares, the runtimes enforce, and the number on the Export tab is measured.

**Declaring.** `scripting.modules` on the panel. Absent means **auto** — derived by scanning the
panel's scripts for both spellings of every member — and auto is the default because the
alternative silently breaks every panel written before modules existed. An explicit array is the
panel's decision and is obeyed even where it contradicts the scan. `resolveModules()` closes the
list over `requires` and always keeps `ce.core`. An id we have never heard of is *reported*, not
dropped: silently ignoring one is how a typo becomes a mystery.

**Enforcing.** A member of a module the panel did not declare becomes a stub that names the module
and says where to switch it on — in all five runtimes, from one template string in `panelApi.js`
that the generator copies into each C++ prelude. Gating by *removal* was the obvious alternative and
is the wrong one: `attempt to call a nil value` is exactly the class of unexplained failure the
previous two rounds were spent deleting. Both spellings are gated together, because
`ce.midi.sendCC` and the flat `sendCC` are literally the same function object. Values are the one
exception — swapping `state` for a function would turn `state.count = 1` into a type error, so
value members are left alone and only the module's `ce.has()` answer changes.

The mechanism is one generated function, `__ce_apply_modules(enabled)`, plus
`ScriptRuntime::setEnabledModules()`. Lua applies it once (one shared `sol::state`); QuickJS and
CPython apply it per script, because each script gets its own engine or namespace. Calling it again
with a wider list restores the real implementations — it re-reads a captured table rather than
stacking stubs — so toggling a module in the editor takes effect without a reload. A native handler
has no prelude and is not gated; that is recorded in the ABI header rather than left to be noticed.

**Measuring.** `@module <id>` marker lines delimit regions in every prelude, and
`gen-script-modules.mjs` sums the bytes between them into a committed `moduleCost.generated.js`. A
test regenerates and fails on drift — it caught a stale table during this slice, which is the whole
argument for generating it. `ce.components` is billed as a **group**: the five families share one
indivisible stub block in the C++ preludes and splitting it five ways would be invented precision.

| | measured |
|---|---|
| `ce.midi` | 26.2 KB |
| `ce.components` (all five) | 12.3 KB |
| `ce.storage` / `ce.math` / `ce.music` / `ce.time` / `ce.device` | 2.9 / 2.8 / 1.5 / 0.9 / 0.5 KB |
| shared baseline every panel pays | 86.4 KB |

**Be clear about what that number is.** It is source bytes across the four runtimes that carry a
prelude — not a binary delta. Lua and JavaScript are compiled into the player whether a panel uses
them or not, so declaring fewer modules does not shrink the `.vst3` today. The Export tab says so
in as many words, next to the Python runtime figure, which is the one that actually moves megabytes
(~56 MB). Compile-time stripping is now *possible* — the fragments exist as data and the exporter
already passes per-panel cache variables to CMake — but ~40 KB off a multi-megabyte plugin does not
pay for the build fragility, so it was not done. The measurement is what makes that a decision
instead of a guess.

Two things the work turned up:

- **`ce.midi` depended on `ce.music` and nobody had said so.** `sendNote(1, "C4", 100)` resolves the
  name with `noteNumber()`, which belongs to `ce.music`. Gate `ce.music` away and `sendNote` reads a
  stub and sends note 0 — silently, in the one runtime nobody is watching. Fixed in the manifest,
  and a new parity test now walks the marked prelude regions and fails on *any* call that reaches
  outside its module's declared closure, so the next one is caught at commit rather than on a synth.
- **`ce.has()` did not exist in the C++ engines at all.** It is tier-1, not a module member, so
  parity never checked it — the generated block built `ce.midi` and friends and stopped there. Slice
  3 gives it a real answer to return, so `ce.version`, `ce.runtime`, `ce.language`, `ce.modules` and
  `ce.has` are now generated into all three preludes alongside the module tables.
