# Scripting modules — design

> **What this is:** the design record for the module system, written before it was built and then
> extended as each phase landed — sections 10 onward are titled *as built* and describe shipped
> work. Section 1 is the API as it stood when the design started (89 names, one flat namespace);
> it is the baseline the argument runs from, not a description of the API today. For what the API
> is now, read the [scripting manual](scripting-manual.md) or open `docs/api-explorer.html`.

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
| `ce.math` | `scale` `clamp` `round` `snap` `curve` `lerp`, seeded `random` | any — ✅ *complete* (§24) |
| `ce.music` | note names, scales, chords, quantise-to-scale | any — ✅ *complete* (§20) |
| `ce.time` | `tempo()`, `onBeat`/`onBar`, timers, `after`, `syncTimer` | any |
| `ce.panel` | `create` `destroy` `clone` `parent` `find` `each` `snapshot` | structure: webview; `snapshot`/`restore`/`each` any — §22, §24 |
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
| 2 | `ce.device` reads | `parameters()`, `profile()` — a script can ask what the synth actually has. ✅ *done* (§11); `read`/`write` finished it in §23 |
| 3 | `ce.time` | Tempo, beats, musical timers. Unlocks every time-based idea at once. ✅ *done* (§12) |
| 4 | `ce.panel` structure + `onPanelBuild` | **Panels that build themselves from the device.** Eight oscillators discovered → eight rows generated. The thing the options UI structurally cannot do. ✅ *done* (§13) |
| 5 | `ce.draw` | Oscilloscopes, envelope editors, XY pads, spectrum displays. The highest ceiling on the list. ✅ *done* (§14) |
| 6 | `ce.anim`, `ce.ui` | Motion and user-facing feedback. ✅ *done* (§15) |
| 7 | `ce.components.*` completion | The remaining components. Most code, least new capability — deliberately last. ✅ *done* (§19) |

Phase 4 needs a lifecycle phase that does not exist yet:

```
onPanelLoad     → MIDI/init only, no controls yet          (exists)
onPanelBuild    → structure: create/parent/bind here        (phase 4 — done, §13)
onPanelReady    → GUI live, fill values                     (exists)
onPanelDestroy  → real teardown, distinct from window close (done, §17)
onError(info)   → the panel reports its own failures        (done, §16)
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
   ✅ *done*

5. **`ce.ext.*` install/resolve** — third-party modules, installed into the app. ✅ *done* (§10)

Only after that does `ce.draw` or `ce.panel` structure add a verb. Getting the architecture right against a surface we already understand is much cheaper than
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

### How slice 4 landed

The picker now groups **by module**, which retires the `category` grouping §1 opened this document
by complaining about — 47 panel-component verbs in one bucket beside `clamp`. Groups are
`ce.core`, `ce.midi`, `ce.components.setlist` and so on, in manifest order, with `Lifecycle` first
because those are functions a script *defines* rather than names it is given, so no module owns
them. `membersByCategory()` had one caller and is gone; `category` survives as a descriptive tag.

**It inserts the canonical spelling.** `ce.midi.sendCC(…)`, not `sendCC(…)`, with `ce.core` left
unprefixed because it is `global: true`. Both spellings work and will keep working — this is about
which one the editor *teaches*, and teaching the deprecated form while the rest of the system talks
in modules would be incoherent. A two-button toggle switches to flat and is remembered.

**Filtering applies to a MANUAL list only, never to auto.** That is the one real decision in this
slice and it is worth stating plainly: auto derives the module list from what the scripts already
reference, so filtering on auto would mean you cannot discover a verb until you have already used
it — the picker would only ever show you what you already knew. On auto, inserting the call is what
turns the module on. On a pinned list the user has made a decision, and the picker respects it.

Even then, nothing *vanishes*. Modules that are off collapse into one **"Not enabled — N modules"**
tail: expandable, dimmed, not insertable, with an `enable` button per module when the host passes a
handler. A verb you cannot find is a worse problem than one you have to switch on. Searching opens
that tail automatically — the same rule the Paths tab already used for matching controls — because
typing `sendCC` and getting back a collapsed count tells you less than nothing.

Two smaller things fell out:

- **`namespacedSnippet` had to rewrite every occurrence, not just the first.** `state`'s snippet
  mentions the name twice (`state.count = (state.count or 0) + 1`), so a leading-only rewrite would
  have inserted a line using both spellings at once. A negative look-behind keeps an already-
  qualified name from being prefixed twice.
- **Search matches the module path too.** `ce.midi.send` finds the send verbs, because the path is
  what the user now writes and searching for it should not come up empty.

The picker is server-rendered in `scriptPicker.test.js` against real panel documents rather than
tested through its helpers, because the interesting rule — filter on manual, never on auto — lives
in the component and would otherwise be asserted nowhere.

---

## 10. `ce.ext.*` — third-party modules, as built

Slice 5. §8 decided the shape (installed into the app, namespaced `ce.ext.<name>`, full support) and
listed the three things that decision costs. All three are now paid.

### The format

One JSON file, `<id>.cemodule`: a manifest plus a prelude per language.

```jsonc
{
  "id": "ce.ext.roland_sysex", "version": "1.0",
  "requires": ["ce.core", "ce.midi"], "runtime": "any",
  "summary": "…", "author": "…",
  "members": [ { "id": "rolandAddress", "name": "address", "signature": "…", "summary": "…" } ],
  "prelude": { "lua": "…", "javascript": "…", "python": "…", "webview": "…" }
}
```

`id` is the flat global the prelude defines; `name` is what it answers to inside the namespace.
**Both spellings exist for an extension exactly as they do for a built-in module** — which is the
central decision here, because it means an extension needs *no new machinery anywhere*. It registers
into the same tables, is gated by the same `__ce_apply_modules`, appears in the same picker group,
is measured by the same cost accounting, and answers `ce.has()` the same way. `webview` falls back
to `javascript`; a module that ships no Python simply does not exist in that engine, and `ce.has()`
says so rather than pretending.

`CE/profiles/modules/ce.ext.roland_sysex.cemodule` is the worked example — Roland address/checksum
helpers, the module §8 named. It is not installed automatically. It is verified as a *file*: the
C++ suite loads it and asserts the packed bytes in Lua and JavaScript, and the web suite loads the
same file and asserts the same bytes in the WebView. One artifact, three runtimes.

### The three costs, paid

**1. The exporter bundles it.** A shipped plugin has no CEditor install to read from, so
`extensionsToBundle()` copies each module the panel *turned on* into `scripting.extensions`, and
the player reads it from there via `ScriptRuntime::extensionsFromPanel`. Only what is enabled —
bundling the whole install would put someone else's module in an export that never calls it. A
module the panel needs and this install lacks is warned about at export, loudly, and is not fatal.

**2. Missing is named, never mysterious.** `resolveModules` now has a **`missing`** bucket distinct
from `unknown`: an unresolved `ce.ext.*` id is a real third-party module this install does not
have — a different problem with a different fix and a different sentence — while `ce.nonsense` is a
typo. The rest of the panel keeps working. And because every exported panel carries its own copy,
the Export tab can offer **"install from panel"**, which is the only answer that works offline,
there being no registry to fetch from.

**3. The install-time collision check is the name authority.** Without a registry nobody arbitrates
names, so the authority is local and enforced at install: a module may not define a member any
built-in module or any other installed module already defines, may not use a word that is a keyword
in Lua, JavaScript or Python, and may not depend on something absent. A rejected module is not
registered *at all* — a half-installed module is worse than an absent one — and a failed upgrade
leaves the working copy in place rather than uninstalling it.

### Where the code lives, and where it does not

| | |
|---|---|
| Format, validation, install rules, registry | `scripting/extensionModules.js` |
| Registration + resolution | `panelApi.js` (`allModules()`, `memberModule()`, …) |
| Storage (`userAppData/CEditor/modules/*.cemodule`) | the host — `ValueTreeBridge::emitScriptModules` |
| Evaluation | each engine's `setExtensionModules` + generated `__ce_register_module` |

The host does **not** validate. It lists, stores and deletes files. Whether a manifest is a *legal*
module depends on the API contract — which names are taken, which words are Lua keywords — and that
contract lives in JavaScript, so that is where the decision is made. Two validators would be two
answers.

The built-in constants (`MODULES`, `MEMBER_MODULE`, `ALL_MEMBERS`) are deliberately **not** mutated.
The parity suite holds five runtimes to exactly those, and an installed module must not be able to
weaken the contract they are held to; the resolution helpers read `allModules()` instead.

### The limits, stated

- **A native handler cannot be extended.** C++/C#/Java handlers are compiled at export and call the
  vtable directly — there is no prelude to append to. Recorded in `NativeHandlerAbi.h`; if the gate
  ever needs to reach there it becomes an appended `is_module_enabled` query, not a change to an
  existing slot.
- **This is not a sandbox and does not pretend to be one.** A module's JavaScript is evaluated the
  way a user's own script is (`new Function` with the API bound), and its Lua runs under the same
  instruction budget a handler does. Both are code the person using the editor chose to run. What
  the module system provides is *namespacing and collision safety*, not isolation.
- **A registry stays deferred.** The manifest already carries `id`, `version` and `requires`, so
  adding one later changes nothing about the format.

---

## 11. `ce.device` reads — phase 2, as built

Four verbs, all reads, all cross-runtime, all `requiresDeviceHost`:

```lua
ce.device.profile([role])            -- { id, name, role, connected, state, ... } or nil
ce.device.parameters([opts])         -- [{ id, name, group, type, min, max, access }]
ce.device.parameter(id [, role])     -- one descriptor, or nil
ce.device.connected([role])          -- the cheap guard before a dump request
```

`role` defaults to `"mainSynth"` everywhere. `opts` narrows the list by `role`, `query`, `group`,
`type`, `access`, `limit`.

**One host primitive, four verbs.** `deviceQuery(kind, payload)` is the only thing that crosses to
the host; the four verbs are wrappers defined in each prelude — the same trick `sendMidi` plays for
every channel message. That is what stops an engine inventing a different parameter descriptor, and
it costs one `ScriptHostApi` virtual, one `BridgeScriptHost` callback and one appended ABI slot
rather than four of each.

Inside the namespace the reads drop the `device` prefix: `ce.device.profile()`, not
`ce.device.deviceProfile()`. The flat alias keeps it, because there `deviceProfile` is the only
thing distinguishing it from a panel property.

### The asymmetry, stated

In the **player** these are synchronous calls into `DeviceProfileService` and `parameters()` is
complete on the first call. In the **editor** the parameter table arrives over the async bridge and
is cached per profile, so a cold first call has nothing to hand back. It returns `[]`, *requests the
load*, and says so — naming the asymmetry in the message, because an empty list from a cold cache
and an empty list from a synth with no parameters are indistinguishable otherwise, and a script that
cannot tell them apart will draw the wrong conclusion in silence. The next call is complete.

That is the best a synchronous verb can do over an asynchronous source. Making the verbs async was
the alternative and is worse: the C++ engines dispatch handlers synchronously, so an `await` here
would work in the editor and get cut off in the shipped plugin — the exact defect round two was
spent removing.

### Two cross-runtime defects this turned up

Both were pre-existing and both were found by *reads*, because every gated or host-less member up to
now had been a void command where a wrong return value could not be observed.

- **A Lua gate stub returned zero values, not nil.** A Lua function with no `return` statement
  yields *nothing*, so `tostring(gatedRead())` raised `bad argument #1 (value expected)` instead of
  printing `nil`. The generated stub now returns nil explicitly. A gated read still returns nil —
  a module that is off has no answer to give — which is why the documented "returns an empty list"
  holds while `ce.device` is enabled.
- **JavaScript sent `undefined` option keys as the string `"undefined"`.** `juce::var::undefined()`
  stringifies to `"undefined"`, so `deviceParameters({})` reached the host with `group:
  "undefined"` and matched nothing, while the Lua prelude simply has no key there. The JS prelude
  now omits absent keys, so the payload is byte-identical across the three engines.

---

## 12. `ce.time` — phase 3, as built

Six members and three events. Cross-runtime, because both sides genuinely have a clock: the editor
follows its own master clock (`stores/transport.js`, which follows the DAW when the panel's
transport source is `host` and an incoming MIDI clock when it is `external`), and the exported
plugin follows the DAW playhead the processor already captures.

```lua
ce.time.tempo()                  -- BPM, or nil. Read it; do not assume 120.
ce.time.playing()                -- flat alias: isPlaying()
ce.time.transport()              -- { playing, bpm, beats, bar, beat, beatsPerBar, source, valid }
ce.time.beatsToMs(beats [, bpm]) -- the delay-time calculation a synth panel needs most
ce.time.msToBeats(ms [, bpm])
ce.time.syncTimer(id, beats)     -- startTimer with a musical interval
onBeat(t)  onBar(t)  onTransport(t)
```

**The flat aliases are deliberately not the namespaced names.** `playing` and `transport` as bare
globals are exactly the collision §1 opened with — ordinary words a panel author would reach for —
so flat they are `isPlaying` and `transportInfo`, while the namespace reads `ce.time.playing()`.
The contract already supported a short name differing from the member id (`ce.components.setlist.
jump` is `setlistGoto`), so this cost one line.

**Nothing here starts or stops the transport.** A panel does not own the DAW's playhead, and a verb
that pretended to would put the panel in a fight with whatever else drives it.

### One primitive, and one number that has to agree

`transportState()` is the only thing that crosses to the host; `tempo()`, `isPlaying()` and
`transport()` are prelude wrappers over that one snapshot, so the three cannot disagree with each
other. `beatsToMs`/`msToBeats`/`syncTimer` are pure arithmetic on top — which matters more than it
sounds: a dotted eighth at 120bpm is **375ms**, and a panel that computes a delay time in the
editor and again in the shipped plugin has to get the same number. That is asserted in Lua, in
JavaScript and in the WebView, against the same three values.

`valid: false` means nothing is reporting a position, and then the rest of the snapshot is a
*default rather than a measurement* — `tempo()` is nil, the conversions are nil, and `syncTimer`
arms nothing and says why. A panel is never handed an invented 120bpm.

### The accuracy limit, stated on every member

`onBeat` / `onBar` / `onTransport` are raised by watching the position on the **message thread at
roughly 30Hz** — the editor's clock publishes at that rate, and the player's timer already runs at
it. A beat at 120bpm is 500ms, so the event lands within a frame of it: right for lighting an LED,
advancing a setlist, stepping a sequencer. **Never for timing audio.** Only transitions are raised,
and stopping forgets the position so restarting raises the first beat again rather than swallowing
it as "no change".

### Three defects this turned up

- **`syncTimer` in Python called `ce.math`'s `round`, not the builtin.** The prelude defines a
  global `round`, which shadows it. The slice-3 dependency guard caught it; rather than declare
  `ce.math` a requirement of `ce.time` for one rounding, the Python prelude now uses `int(ms + 0.5)`
  — matching Lua's `math.floor` and JS's `Math.round`, both stdlib.
- **That same guard reported a false positive on `Math.round(`.** Its regex matched a bare
  identifier anywhere, including after a dot. A member call is a *bare* identifier; anything reached
  through `.` or `:` belongs to something else. Fixed with a look-behind — and the guard now strips
  line comments before scanning, because a comment that *mentions* a call is not a call, and this
  file's own header makes exactly that argument in the other direction.
- **A test freed a payload it was still using.** `juce::DynamicObject` is reference-counted from
  zero, so three temporary `juce::var(o)`s meant the first dispatch took the last reference with it
  and the second read freed memory. One `const juce::var payload (o)`, reused. Worth recording
  because it is the second reference-counting trap in this codebase's tests, not the first.

---

## 13. `ce.panel` structure — phase 4, as built

Panels that build themselves. Ask the device what it has, then generate a control per thing you
found — the one capability the options UI structurally cannot provide.

```lua
function onPanelBuild()
  for _, p in ipairs(ce.device.parameters({ group = "Oscillator" })) do
    ce.panel.clone("template", { name = p.id, y = 40 })
  end
end
```

| | |
|---|---|
| `ce.panel.create(type, props)` | a new control; returns its name |
| `ce.panel.clone(name, props)` | copy one the author designed — the usual way to make eight of something |
| `ce.panel.destroy(name)` | it and everything inside it |
| `ce.panel.parent(name [, container])` | move into a container, or `nil` for top level |
| `ce.panel.find([query])` | names matching `{ type, generated, parent }` or a name substring |
| `ce.panel.info(name)` | `{ name, id, type, x, y, width, height, parent, generated }` |
| `ce.panel.types()` | every type `create` accepts — ask rather than guess, the list grows |

`props` takes the flat conveniences (`name`, `x`, `y`, `width`, `height`, `parent`) and any section
override, `{ Behavior = { min = 0, max = 127 } }`, **merged** into the section rather than replacing
it — a script setting one field must not wipe the rest.

### Idempotence is the whole design

`onPanelBuild` fires on every load. Without a rule, a panel that generates eight rows has sixteen
the second time and twenty-four the third, **and the accumulation is saved into the author's file**.
So:

1. Every control a script creates carries `Core.generatedBy`.
2. Every generated control is removed *before* `onPanelBuild` runs.
3. `serializePanel` strips them, top level and nested alike.

The build therefore always starts from the authored panel, running it twice cannot double the
layout, and the document on disk stays the panel the author drew. Generated names are also
de-duplicated against everything already present, because two controls answering to `cutoff` is how
`set("cutoff", …)` becomes ambiguous.

**The cost of that rule, stated rather than discovered: a generated control is not in the exported
parameter list and cannot be DAW-automated.** It is driven from a script, or not at all. That falls
straight out of the export baking parameters ahead of time, and it is the honest trade for a layout
that adapts to the device in front of it.

### The runtime boundary

Panel view only — creating a control needs a renderer, and there is none with the window shut. The
seven verbs are declared `runtime: 'webview'` and stubbed in the three C++ engines like every other
webview-only verb. `onPanelBuild` is declared webview-only *as a hook*, so the window-closed runtime
does not merely no-op it — it never fires it. A build phase that half-ran with no renderer would be
worse than one that did not run.

### Two defects this turned up

- **`WEBVIEW_ONLY_MEMBERS` was about to stub a lifecycle hook.** It filtered `ALL_MEMBERS` by
  runtime, and `onPanelBuild` is the first webview-only *hook* — the others are player-only. Stubbing
  it would have defined an `onPanelBuild` in each C++ prelude that shadows the user's. A hook is a
  function the script DEFINES; `handlerNamesForRuntime` is the mechanism that already handles it.
- **The webview-only stub returned zero values, not nil** — the same defect fixed in the module gate
  during phase 3, in the *other* stub factory. It went unnoticed while every webview-only member was
  a void command; `ce.panel.create()` is the first whose result a script reads, and
  `tostring(create(...))` raised `value expected` on the first try.

### What phase 4 did not include

`onPanelDestroy` and `onError(info)` are listed beside `onPanelBuild` in §6 and are **not** here.
Neither is needed to build a panel, and both are their own piece of work: real teardown has to be
distinguished from a window close (which already has `onPanelClose`), and an error hook has to
settle what happens when the error handler itself throws. Bundling them in would have meant doing
both badly. Both were built afterwards, each on its own — `onError` in §16, `onPanelDestroy`
in §17.

---

## 14. `ce.draw` — phase 5, as built

Oscilloscopes, envelope shapes, XY pads, readouts. The highest ceiling on the roadmap, and the one
that needed the least new architecture, because it did not add a component type.

```lua
function onDraw(info)
  ce.draw.clear()
  ce.draw.stroke("#5B9BD5", 2)
  local pts = {}
  for i = 0, 63 do
    pts[#pts + 1] = i * (info.width / 63)
    pts[#pts + 1] = info.height / 2 + sample(i) * info.height / 2
  end
  ce.draw.path(pts)
end
```

`clear` `fill` `stroke` `rect` `circle` `line` `path` `text` `redraw`, plus the `onDraw(info)` hook.

### It draws on ANY control, and that is the whole reason it is small

There is no `Canvas` component and nothing to place. A script draws on the control it is attached
to (or one it names), and the overlay paints on top of that control's normal content — so a scope
trace can go over a Background, a value readout over a Knob, a grid over a Container. Adding a
component type would have meant defaults, sections, ports, an editor and a renderer; an overlay
meant one Svelte component and one `{#if}`.

Coordinates are the **control's own**, `(0,0)` at its top-left, and `info.width`/`info.height` are
its size — so a drawing scales with whatever it is drawn on rather than with the panel. The overlay
clips to the control, per control, so a script that draws outside the bounds cannot paint over its
neighbours.

### Immediate mode, and why the renderer holds no state

Each verb records a command carrying the style **in force when it was issued**. Changing the stroke
after a shape does not reach back and repaint it. The renderer then walks the list and emits one SVG
element per command, in order — it has no style state of its own, so it cannot disagree with the
script about what colour something is. Element order is paint order.

Two consequences worth stating:

- **Nothing repaints on its own.** `onDraw` runs when something asks for it; a script animates by
  calling `ce.draw.redraw()` from `onTimer`. A per-frame callback nobody asked for is a performance
  trap, and one that fires whether or not the panel is visible is a worse one.
- **Nothing is persisted.** A drawing lives in a store, never in the panel document — the same rule
  generated controls follow (§13), and stronger here, because a scope trace saved to disk would be
  meaningless as well as wrong.

Commands are published as they are appended rather than buffered and flushed at the end of a draw
pass. That is not laziness: `dispatchEvents` is async (Lua and Python run through a WASM engine), so
"the end of the pass" is not a moment the style state can be held across without a second redraw
clobbering it. Svelte batches store updates within a tick, so a half-drawn frame is not observable.

### The runtime boundary, stated precisely

Panel view only: there is no surface with the window shut. The nine verbs are declared
`runtime: 'webview'` and stubbed in the three C++ engines; `onDraw` is declared webview-only as a
*hook*, so it is never probed for there.

The guarantee about the hook is **"no runtime raises it"** — the window-closed lifecycle does not,
and no event source does — rather than "the dispatcher refuses it". `ScriptRuntime::dispatchEvent`
routes purely by a script's declared event and knows nothing about which hooks are webview-only.
That distinction is worth writing down because a test asserting the stronger claim passes for the
wrong reason.

### What phase 5 did not include

No gradients, no images, no transforms, no clipping regions beyond the control bounds, and no mouse
input into a drawing (`pointer-events: none` — a drawing is decoration; a script that wants a click
should use a control that reports one). Each of those is a real feature and none is needed for the
things §6 named. `ce.anim` and `ce.ui` remain phase 6.

---

## 15. `ce.anim` and `ce.ui` — phase 6, as built

### `ce.anim` — values that move

```lua
ce.anim.to("cutoff", 127, { duration = 500, curve = "s" })
ce.anim.spring("cutoff", 127)
ce.anim.stop("cutoff")        -- no path stops everything
ce.anim.running("cutoff")
```

**Cross-runtime**, which §2 promised as "values any, visuals webview" and which is the whole
difficulty: a sweep triggered by a note has to work in a DAW with the panel shut, so the C++
`ScriptRuntime` carries the same engine as the WebView and the two have to agree.

They agree because **the position is a pure function of elapsed time**, never an accumulated step:

```
value = from + (to - from) * ease(elapsed / duration)
```

Two integrators ticking independently drift apart within a second. Two evaluations of the same
formula at the same elapsed time cannot. `ScriptRuntime::animationEase` / `animationSpring` and the
exported `animationEase` / `animationSpring` in `panelRuntime.js` are that formula twice, and both
test suites pin them to the same table — `ease(0.5,"exp") = 0.25`, `ease(0.25,"log") = 0.5`, a
linear 0→100 over 1000ms reading 25 / 50 / 100 at 250 / 500 / 1000ms. The curves are deliberately
the same four `ce.math.curve()` offers, computed the same way, so knowing one is knowing both.

Three rules the tests exist to hold:

- **A spring lands exactly on its target**, because the position is pinned to 1 at the end rather
  than left wherever a damped cosine happened to be.
- **`from` defaults to where the value IS**, so an animation starts from the truth rather than from
  wherever the last one stopped.
- **A second animation on a path replaces the first.** A value has one destination, and two writers
  on one path is a fight whose outcome depends on iteration order.

The engine lives in the runtime, not in a prelude and not in a host callback, so exactly one
animation list exists. The host only supplies the clock: the player ticks it from the same 30Hz
message-thread timer the beat events use, the editor from a ~60Hz interval. Nothing touches the
audio thread.

### `ce.ui` — telling somebody something

```lua
ce.ui.notify("Patch loaded", { kind = "warn", duration = 5000 })
ce.ui.status("Recording")     -- no message clears it
```

Panel view only: there is nobody to tell with the window shut.

**Two lifetimes, deliberately different.** A notification is an EVENT — it appears, it expires, it
is gone. A status is a STATE — it stays until the script changes or clears it. Collapsing them into
one verb would mean either a state that vanishes or an event that never does. `notify` renders as a
toast at the app root (so it survives whatever tab is on screen); `status` writes the status bar's
left-hand item.

Neither is a debugging tool. `log()` is for debugging, and the summaries say so.

### What phase 6 did not include: `ce.ui.dialog`

§2 lists `notify` `status` `dialog`. The first two are fire-and-forget and are here. **`dialog` was
not**, and the reason was structural rather than effort: a dialog exists to return an ANSWER, and an
answer is asynchronous, while this API is synchronous everywhere by design — the C++ engines
dispatch handlers synchronously, which is exactly why `async`/`await` is warned about at edit time.
A callback form (`ce.ui.dialog(opts, onChoice)`) is expressible and was the likely shape, but it
needed modal UI and a decision about what happens when the panel closes with a dialog open. Shipping
a half-answered dialog would have been worse than shipping none. It was built afterwards, once
those two questions had answers — §18.

### Two defects this turned up

- **The two runtimes disagreed about the clock origin.** The C++ engine started an animation from
  the last tick; the WebView started it from the wall clock. Both work in production and they
  diverge the instant a caller drives time itself — which is the only way to test an animation
  without waiting on a real one. The WebView now matches the C++ convention.
- **"Has anything ticked yet" was inferred from `now == 0`.** Zero is a perfectly good tick time
  when the caller supplies it, so the seed-on-first-use guard fired every time and overwrote the
  caller's clock. It is a boolean now, in both runtimes.

---

## 16. `onError` — the panel reports its own failures

The last hook from the §6 lifecycle list. A script fails; the panel gets told, in the panel, in its
own language, and can do something about it — light a warning, fall back to a safe patch, show a
toast — instead of the failure living only in a console the person using the panel never opens.

```lua
function onError(info)
  -- info.script    the failing script's NAME ("Cutoff follow")
  -- info.scriptId  its id, for matching against your own tables
  -- info.event     the event it was raised from ("onValueChanged"), "" when unknown
  -- info.phase     "load" (it would not compile) or "dispatch" (it threw while running)
  -- info.message   the error text
  if info.phase == "load" then
    ce.ui.notify(info.script .. " could not load — running without it", { kind = "warn" })
  end
end
```

**Cross-runtime.** It is declared for both runtimes and dispatched by `ScriptRuntime` as well as by
the WebView, because the failures a panel most wants to report are the ones nobody is watching — in
a DAW, with the window shut. It is dispatched by *handler presence*, not by declared event, so any
loaded script in any language can watch any other script's failure; a JavaScript `onError` seeing a
Lua script's exception is a case both test suites pin.

### Three rules, and why each exists

- **The log always happens.** `onError` is *in addition* to the console line, never instead of it.
  A panel whose own error handler is broken must not go silent — that is the one failure mode that
  turns a diagnostic feature into a diagnostic *loss*.
- **A failure inside `onError` is logged once and not re-dispatched.** Re-dispatching it would call
  the same broken reporter again, and again. The guard is a flag held across the whole dispatch, so
  it covers the *other* handlers too: one report per failure, never a cascade. The second line is
  marked `(in onError)` so it is distinguishable from the original.
- **Load-time failures are deferred until every script has loaded.** A script that fails to compile
  first would otherwise be reported to an `onError` that does not exist yet — which is precisely
  when a panel most wants to be told. Both runtimes hold load errors in a list and drain it after
  the load loop, with `phase = "load"`.

`info` is fully populated in every case: all five fields are always present and always strings, so
a handler that concatenates them into a message shown to somebody can never print `undefined` in
the middle of a sentence. A script that failed to *load* is not in the loaded-script list at all, so
the C++ side looks its name up in the failed list as well, and `event` falls back to `""`.

### Two defects this turned up

- **The WebView read the handler cache one level too shallow.** The cache holds `{ key, handlers }`;
  the first draft read `cache.get(id).onError` rather than `cache.get(id).handlers.onError`, so the
  hook silently never fired. It was the mixed-script test — several loaded scripts, one throwing —
  that exposed it, not the single-script case.
- **One `DynamicObject`, several `juce::var` temporaries.** The C++ dispatch built `juce::var (info)`
  *inside* the per-script loop from one raw pointer. The first temporary takes the only reference
  and drops it on destruction, deleting the payload under the loop. One `const juce::var` built
  before the loop fixes both that and the leak when no handler is declared. This is the second time
  this exact shape has appeared in this work; it is worth recognising on sight.

---

## 17. `onPanelDestroy` — phase 5, and why it is not `onPanelClose`

The last hook from the §6 lifecycle list, and the whole reason it exists is a distinction the
existing hook was quietly getting wrong:

| | what happened | do the scripts keep running? |
|---|---|---|
| `onPanelClose` | the **view** went away — preview stopped, plugin window shut | **yes** — timers still tick, MIDI still arrives |
| `onPanelDestroy` | the **scripts** went away — panel switched, set replaced, plugin unloaded | no; this is the last thing they run |

A plugin whose editor window is closed is still playing. `onPanelClose` was summarised as "really
closing", which is what a panel author would reasonably read as "your last chance" — and it is not.
Anything you actually have to do once, at the end (restore the synth, send a closing dump, release
a file), belonged in a hook that did not exist. Now it does.

```lua
function onPanelDestroy()
  sendDump("patch")      -- everything still works here
  panic()
end
```

### Where it fires

**Window-closed (`ScriptRuntime`).** `loadScripts` raises it on the outgoing set before replacing
it, so a panel switch or a script reload gets it without every host remembering to call it; the
player calls it explicitly in `~PlayerAudioProcessor`, first, before it stops timers or unhooks the
device service. It is deliberately **not** called from `~ScriptRuntime`: running arbitrary script
code against a host that may already be half torn down is the one thing a teardown hook must never
do, and a crash during shutdown is the hardest kind to diagnose.

**Panel view.** The handler cache *is* the loaded set, so the cache is what gets told and what gets
emptied — "exactly once per set" falls out of the code rather than needing a flag. Two moments raise
it: the active panel changing, and the page going away (`pagehide`, which unlike `beforeunload` also
fires when a WebView is discarded rather than navigated).

A third moment deliberately does **not**: `setLiveScripts` runs from a `$effect` on every keystroke
in the script editor. A hook whose job is "send a final dump" firing once per character typed would
spray MIDI at the synth. Editing a script is a *reload* of the set, not the destruction of it.

### The guarantees, and what each is protecting

- **Exactly once per loaded set.** A host that calls it at shutdown after a reload already sent one
  must not tell the scripts they are going away twice — an idempotent teardown is easy to write, a
  doubled one is not obviously wrong until the synth gets two dumps.
- **It runs *before* anything is torn down.** Timers, `state`, `set()`, `sendCC()` and the device
  service all still work inside it. A teardown hook that runs after teardown is decoration.
- **It does not depend on `onPanelClose` having fired.** A window that was never opened was never
  closed, but it was still loaded and still holds whatever it took — so it is still destroyed.
- **A throw does not stop the teardown.** The error is reported the normal way (log + `onError`) and
  the remaining scripts are still told. A failing teardown handler must not be able to keep the old
  script set alive.
- **An empty set raises nothing.** Firing for a panel with no scripts would make "once per loaded
  set" a lie the first time somebody opened a blank panel.

### The ordering bug this turned up

The editor's panel-switch subscriber set `live.activePanelId` and *then* reset the script state. A
teardown handler reads and writes through the **active** panel, so raising the hook after the switch
would have had the outgoing panel's `onPanelDestroy` writing values into the panel that had just
arrived — the exact opposite of cleaning up after itself. The destroy is dispatched before the id
moves, which also makes the subscriber's immediate first call a no-op.

---

## 18. `ce.ui.dialog` — asking, not telling

The verb §15 deferred, and the two questions that were blocking it now have answers.

**"An answer is asynchronous, but the API is synchronous."** The answer does not come back from the
call at all. It comes through a callback, and the return value answers a different question:

```lua
local shown = ce.ui.dialog({ title = "Overwrite the patch?", buttons = { "Overwrite", "Cancel" } },
  function(choice)
    if choice == "Overwrite" then sendDump("patch") end   -- choice is nil if it was dismissed
  end)
```

`shown` is **whether a dialog was put on screen**, never the choice. And `false` carries a promise
that makes it usable: *the callback has already run, with no answer*. So a script never has to work
out whether it is still waiting — there are two states, not three. Window-closed, one dialog already
open, and a dialog asking nothing all return `false`, and all of them have already called back.

That is also what lets the C++ engines be honest. `dialog` is declared webview-only — a modal needs
somewhere to be modal — but it is the one webview-only verb that *owes its caller something*: a
script that asks a question and waits in the callback waits forever if the callback never runs. So
window-closed it does not get the default explaining stub. It logs the explanation, calls back with
no answer, and returns `false`. "Nobody is here to ask" and "the person dismissed it" are the same
answer, and a script that handles a dismissal handles both without knowing it did.

**"What happens when the panel closes with a dialog open?"** It is dismissed. `clearScriptUi()`
settles the open question on teardown, so the callback runs exactly once no matter how the dialog
ends. A callback that never runs is the one failure mode this API cannot afford — a script that
cleans up in its callback would be left holding cleanup that never happens.

### Three rules

- **The callback runs exactly once** — on a choice, on a dismissal, or on teardown. Settling an
  already-settled dialog does nothing, so a click racing a teardown cannot answer twice.
- **One dialog at a time, and never a queue.** A second call is *refused* (returns `false`, calls
  back with no answer) rather than stacked. A queue would let a script in a loop put a hundred
  modals in front of somebody with no way out; refusing hands the decision back to the only party
  that knows what to do about it. The chained case still works, because the callback runs after the
  first dialog has closed: ask A, then ask B from inside A's callback.
- **Every route out settles it.** A button, Escape, the backdrop, and panel teardown all go through
  `answerDialog()`. A dialog that can be closed without settling is a script left waiting.

### Two defects this turned up

- **The JavaScript override was being eaten by its own stub list.** `uiDialog` is listed in the
  engine's webview-only names (it genuinely does not work window-closed) and then redefined below
  the stub loop. In Lua and Python that reads top-to-bottom and works; in JavaScript a `function
  uiDialog()` *declaration* is hoisted to the top of the script, so the loop ran afterwards and
  overwrote it with the silent stub. It is an assignment to the global now, which executes in order.
- **The callback escapes the dispatch path.** It runs long after the handler that asked has
  returned, so a throw inside it was not being caught by anything that would report it — the one
  place a script error could vanish. It is wrapped and reported like any other script failure.

---

## 19. `ce.components.*` completion — phase 7, as built

The last phase, and the one the roadmap called "most code, least new capability". Twenty-three more
component families, 182 verbs — and the interesting decision was refusing to write them.

### The five were hand-written. The twenty-three are data.

Each of the original five families earned a bespoke reducer, because each of their actions is
genuinely structural: seed a grid from a named pattern, step an index through only the *enabled*
scenes, patch one zone inside an array. Twenty-three more in that style would have been several
thousand lines of near-identical code, and near-identical code is exactly how things drift apart —
the Recorder growing a clamp the Harmoniser never got.

So `scripting/componentVerbs.js` is a **spec**. A family declares its section and its verbs; one
generic reducer turns a verb call into a patch; and four things downstream are derived from it:

| derived | from the spec |
|---|---|
| `panelApi.js` | the member descriptors, signatures, summaries, modules and the `ce.components.<family>.<verb>` map |
| `panelRuntime.js` | the implementations, in one loop |
| `gen-script-modules.mjs` | the window-closed stub names in all three C++ engines |
| the docs | the signature text, so prose cannot disagree with the code |

Adding a verb is one line, and the parity tests fail until every runtime agrees about it.

### Nine verb kinds, and why that is enough

`num` `int` `bool` `str` `enum` cover the scalars; `xy` sets two numbers at once (a puck, a probe);
`item` sets one property of one element of an array (a macro slot's depth, an orbit node's radius);
`cell` addresses a flat grid (the mod matrix) or a plain list (a Turing step); `line` writes one row
of an LCD. Everything the twenty-three families actually need is one of those.

Two behaviours fall out of the kinds and are worth stating:

- **A bare `bool` call toggles.** `ce.components.arp.run(target)` flips it; passing a value sets it.
  One footswitch does both jobs, which is what a footswitch is for.
- **An unrecognised `enum` value is a no-op, never a wrong setting.** A typo that leaves the
  arpeggiator alone is debuggable; one that quietly sets it to `"up"` is not.

Indices are **1-based** throughout — it is what the editor's own lists show, and "scene 3" should
mean the third one in every language.

### What is deliberately not a verb

Colours, sizes, label text, and anything else you set once in the inspector and never touch again.
`set()` already reaches all of it by path. A verb earns its place by being worth driving *while
somebody is playing* — mid-song, from a footswitch, from an incoming CC. That test is what keeps
182 from becoming 600.

### The stub lists became generated, and that changed the cost model

248 members are declared `runtime: 'webview'` now. Maintained by hand in three C++ engines, that is
744 chances to mistype one — and a mistyped stub is an undefined global in *exactly one* engine,
which is the hardest kind of divergence to notice. The lists are generated, with an `@module` marker
per family so the cost measurement can attribute the bytes.

That split a number that used to be lumped. `ce.components` was billed as one indivisible block for
all five families; now each family pays for its own stub names, and only the machinery they share
is billed to the group. So `costKeyFor` became `costKeysFor`: a module is charged its **own** key
*and* each ancestor group, with a group charged once however many of its modules are on. Billing
only the most specific key would have silently dropped the shared region from every panel's total.

### Testing a generated surface

Sampling does not work here — a hand-picked verb test proves nothing about the 181 you did not pick.
The tests are written against the spec instead, and each of these found something or would have:

- every family names a section the model **actually has** (a verb writing `Arpeggiator.rate` when
  the section is `Arp` would report "not an Arpeggiator" for a control that plainly is one);
- every verb writes a field that section actually has, and every `item` verb names a property its
  elements actually carry;
- every `enum` verb offers the value the component **ships with** — a default a verb cannot express
  means the panel starts in a state a script cannot restore;
- every verb, fed a plausible argument, produces a patch touching the field it declares. A verb that
  silently does nothing for every input is the failure mode a spec-driven surface is most prone to,
  and it is invisible one verb at a time;
- no verb mutates the config it was handed.

### One thing that was simply wrong

The error a verb raises against the wrong control named the *section*: `"Cutoff" is not a Arp`.
Somebody reading that has an **Arpeggiator** in front of them — the section name is an internal
detail, and the article was wrong as well. It names the family the way the editor does now, and
still says which section was looked for.

---

## 20. `ce.music` completed, and `onNoteIn`

Two things that turned out to be one slice. `ce.music` shipped as `noteName` and `noteNumber` —
a quarter of what &sect;2 defined it as. And the most common message on the wire had no event of its
own. Each makes the other worth having: an event that hands you a played note is thin without the
arithmetic to decide what to do with it, and the arithmetic is academic if nothing tells you a note
arrived.

```lua
function onNoteIn(n)
  -- snap what was played into the key the panel is in, then pass it on
  sendNote(n.channel, ce.music.quantize(n.note, ce.music.number("D3"), "dorian"), n.velocity)
end
```

### The tables are the panel's own

`ce.music.scale("dorian")` and a Chord Pad set to `dorian` have to mean the same seven notes. The
only way to guarantee that is for there to be one table, so `scripting/musicTheory.js` re-exports
the Chord Pad's `SCALES` rather than restating it, and the generator emits it into all three C++
preludes.

That is a sharper reason to generate than the phase-7 stub lists had. A mistyped *name* is a missing
global: it fails loudly, in one engine, immediately. A mistyped **interval** is silent — it loads,
it runs, and the panel is a semitone out in one scale, in the exported plugin, and correct in the
editor.

### Three rules worth stating

- **An unknown name returns nothing.** Not `"major"`. A script that asked for `"lokrian"` should be
  able to find out that this build has never heard of it; quietly substituting a scale that happens
  to sound plausible is the worst of the three options.
- **A tie goes UP.** `quantize` searches outwards from the note, testing `+d` before `-d`, so C&sharp;
  in C major is always D and never C. Without a stated rule five engines would each pick their own
  and a panel would quantise differently with the window open and shut.
- **`quantize` keeps its octave.** It matches on pitch class but returns a real pitch, so snapping
  C&sharp;5 gives D5 rather than dropping an octave to D4.

`chord(root, type)` is an **absolute shape**, not a scale degree — "what is a D minor 7" does not
depend on a key. Stacking thirds *on* a degree is a different question, and `stackedChord` in the
Chord Pad already answers it.

### The channel argument, and an inconsistency it exposed

`onNoteIn` reports `channel` as **1&ndash;16**, matching `sendNote`, so the most obvious thing a
script does with the event works:

```lua
sendNote(n.channel, n.note, n.velocity)   -- echoes on the channel it arrived on
```

`onCcIn` reports **0-based** while `sendCC` takes 1-based, so the equivalent CC echo has been off by
one since it shipped. That is older than this work and cannot be changed without breaking panels
that already compensate, so both summaries now state their convention explicitly rather than leaving
it to be discovered. Fixing `onCcIn` is a separate decision with a migration attached.

### The case everybody gets wrong

A **note-on with velocity 0 is a note-off**. Devices using running status send them constantly, and a
panel that treated one as a note-on would hang a voice on every key release. Both runtimes classify
from the **status byte** rather than from the host's `messageType`, partly because only the status
byte settles that case, and partly so the two cannot decide differently.

### One defect this turned up in phase 7

The component verb specs carried a hand-written scale list offering `"pentatonic"` and `"chromatic"`
— which no component understands, so `ce.components.arp.scale(target, "pentatonic")` wrote a name
that silently did nothing — while omitting `"pentatonicMaj"` and `"pentatonicMin"`, which they do
understand, so the verb refused a perfectly valid value. The phase-7 test only checked that each
enum offered the component's *default*, which it did. The spec reads the real table now, so the
whole class of error is gone rather than that one instance of it.

---

## 21. `ce.time.after` — the one-shot

Every timer in the API repeated. Send a program change, wait for the synth to settle, then send the
dump — a sequence panels actually need — was written as a repeating timer that cancels itself, which
every author reinvents and which has one failure mode nobody remembers.

```lua
sendProgramChange(1, 12)
after(40, function() sendDump("patch") end)
```

### Built on `startTimer`, not beside it

QuickJS has no `setTimeout`, so the C++ preludes had to build this on the timer machinery that
already exists. The WebView does the same rather than reaching for `setTimeout` — one timer map, one
cancel verb, one set of semantics. `after` returns the id it armed, so **`stopTimer(id)` cancels it**
like anything else; no new verb was needed for that.

Each prelude registers **one** `on("*", "onTimer", …)` listener at load time — from the prelude, so
it belongs to no script and survives every reload of them — and swallows the ticks that belong to a
one-shot. A one-shot is not a timer the panel declared, so surfacing it as `onTimer` would make every
`onTimer` handler in every panel learn to filter ids it never created.

### The order inside the tick is the whole point

The entry is removed and the timer stopped **before** the callback runs. That buys two things, and
they are the reason this is a verb rather than a snippet in the docs:

- **A callback that throws cannot leave the one-shot repeating.** This is exactly what a hand-rolled
  self-cancelling timer does wrong: it stops itself at the end of the callback, so a throw before
  that line leaves it firing forever.
- **A callback can schedule the next one.** Clearing first means the inner `after()` gets a fresh id
  and is not cancelled by the outer one's own stop — which is what a settle-then-send chain is.

### The fixture gap this turned up

The prelude now calls `on()` at load time, and three Lua fixtures in `scriptPreludeAgreement.test.js`
stubbed only `log` and `sendCC`. That does not fail the helper under test — it fails the **whole
prelude**, before any helper is defined, so a test about `panic()` started reporting that `panic` was
nil. Worth remembering: a prelude that does work at load time makes every fixture that loads it a
dependency.

---

## 22. `ce.panel.snapshot` / `.restore`, and the first mixed module

Capture every control's value and put them back. A/B comparison, a scripted undo, "save what it was
before I randomised it", and half of what a scene recall does — none of it expressible before
without naming every control by hand.

```lua
local before = ce.panel.snapshot()
randomisePatch()
-- …and back, from a footswitch:
ce.panel.restore(before)
```

### `ce.panel` is now MIXED, and that is the honest shape

Creating a control needs a renderer. Reading and writing a value does not — and *"put the panel back
how it was before the solo"* is a footswitch action in a DAW with the window shut, which is exactly
where it has to work. So `snapshot` and `restore` are `runtime: 'any'` while the seven structure
verbs beside them stay `runtime: 'webview'`.

That makes `ce.panel` the first module whose members do not all share its runtime, and the module
itself is declared `any`. Declaring it `webview` would make `ce.has("ce.panel")` tell a script to
skip two verbs that work perfectly window-closed. The **per-member** markers are what state the
boundary precisely; the module now says only "some of this reaches you", which is true.

### One host primitive

`panelQuery(kind, payload)`, alongside `deviceQuery` and for the same reason: one verb rather than a
method per question, so adding a question later does not change the interface every host implements.
`"controls"` returns the control names, and the preludes build both verbs on that plus `get`/`set` —
so **what a snapshot can see is exactly what a script could already address by name.**

### Two rules

- **A control with no value of its own is left out**, not recorded as nothing. Otherwise a restore
  could blank a Label by writing nil over it.
- **A name the panel no longer has is skipped**, not fatal. A snapshot taken before an edit is still
  worth most of what it holds, and an all-or-nothing restore would throw the rest away over one
  renamed knob. `restore` returns how many landed, so a script can notice.

### The bug this found, which was never snapshot's

`get("Osc1Cutoff.value")` returned nothing for a knob that was plainly there — **if it lived inside
a Group or Container.** Both runtimes looked up a control by name in the panel's *top-level* array
only, so every grouped control was unaddressable by name. Most real panels group their controls.

Nothing had noticed because the failure is quiet: `get` returns nothing, `set` reports "no such
control", and a panel author assumes they typed the name wrong. Snapshot found it because a snapshot
that stopped at the top level would have silently missed most of a panel — listing a name that
`get()` could not read would have been worse than not listing it.

Both lookups walk the whole tree now, in both runtimes. It is a pure expansion: a name that resolved
before still resolves, and the ones that never could now do.

---

## 23. `ce.device.read` / `.write` — finishing phase 2

Phase 2 gave a script `parameters()` and `profile()`: it could ask **what** the synth has. It then
had no way to touch any of it unless a control happened to be bound to that parameter. A panel that
discovered eight oscillators could enumerate them and not address them, which is a strange place to
stop.

```lua
for _, p in ipairs(ce.device.parameters({ group = "OSC1" })) do
  ce.device.write(p.id, ce.math.scale(macro, 0, 1, p.min, p.max))
end
```

That is also what makes `onPanelBuild`'s generated panels worth generating: discover the parameters,
create a control per one, and now actually drive them.

### `read` is a mirror, not a question

It returns the **last known** value — what the synth most recently told us, from a dump or a
parameter message, kept in the device runtime state. It is not a live query, and it could not be:
asking a synth is asynchronous, and every verb in this API is synchronous by design.

The distinction that earns its own test in both suites: **a parameter reported as `0` is a value,
not an absence.** Nothing comes back only when the device has never reported it at all. A script
deciding whether to initialise something would get it exactly backwards if those two looked alike.

### `write` promises dispatch, not agreement

The device profile encodes the value and the message goes out. `true` means it was **dispatched** —
not that the synth accepted it, which nothing can know synchronously. Saying so is better than a
`true` that means less than it looks.

It takes the same path a bound control takes (`compileParameterMessage` window-closed,
`commitDeviceParameter` in the panel view, both with `dryRun: false`), so a scripted change and a
knob turn are indistinguishable downstream — the same rule the Setlist's index follows.

### The host surface

`read` is a fifth `kind` on `deviceQuery`, because it genuinely is a query. `write` is **not**, so it
is its own host method rather than a sixth kind — `deviceQuery` is documented as reading the device
profile, and hiding a send inside it would make that comment a lie. Both report themselves with no
device host: `read` returns nothing, `write` returns `false` and says where it does work.

---

## 24. The last six — and one that turned out not to be missing

The review list is empty. Six candidates, in one pass.

| verb | why |
|---|---|
| `ce.math.random` / `.seed` | §2 said "seeded `random`" and it was never built |
| `ce.midi.sendRPN` / `.sendSongPosition` | NRPN was there and RPN — the *standard* path for pitch-bend range and tuning — was not |
| `ce.core.warn` / `.error` | the console renders levels; a script could not reach them |
| `ce.panel.each` | §2 listed it; `find` gets one control, nothing iterated |
| `ce.storage.settings` / `.forget` | two thirds of an interface: you could write and read a key, never list or delete one |
| `ce.draw.arc` | knob rings, radial meters, pan indicators — the one shape `path()` cannot express |

### `ce.draw.font` was not a gap

I listed it in the review as missing. It is not: `drawText` already takes
`{ size, align, family }` and the renderer honours all three. Reading the contract before adding to
it is cheaper than the verb would have been.

### Seeded means seeded

An xorshift32, written identically in all four runtimes and masked to 32 bits at every step, with the
sequence itself pinned by a cross-engine test — because "the same in every runtime" is the whole
promise, and only comparing the actual numbers catches a masking slip in one language. Two rules:
**0 is a dead state** for xorshift, so seeding with it means "the default" rather than a generator
that returns zero forever; and `random(lo, hi)` is **inclusive at both ends**, which is the form a
script wants for a note or a step.

### The one that nearly shipped wrong

`ce.core.error` was going to be a global called `error` — which in Lua **shadows the builtin**,
turning the standard way to raise into a print. Every `onError` test in the C++ suite failed at once,
which is the best possible outcome: the mistake was loud.

The flat names are `logWarn` and `logError`; the readable spellings stay `ce.core.warn` and
`ce.core.error`. That is the same rule `ce.time.playing` → `isPlaying` already follows: *the
namespaced names read well, the flat aliases are deliberately defensive.* `memberPath` learned it
too — a global module's member is normally reachable at its bare name, but where the short name
differs from the flat one, the namespaced path is the only place the short name exists.

### One thing measuring caught

Adding `warn`/`error` gave `ce.core` a prelude of its own for the first time — in JavaScript and
Python, where they are prelude text; Lua binds them from the host, so Lua's share is zero. A test
asserting "ce.core has no prelude of its own" started failing, correctly. That asymmetry is invisible
unless the cost is measured rather than asserted, which is why it is.

## 25. The missing half: what applies to *this* control

The API is organised by module. `ce.midi`, `ce.draw`, `ce.components.arp` — that answers *what can
this module do*, and it is the right shape for a contract that four runtimes have to agree on.

It is the wrong shape for the person actually writing a script. They are not holding a module. They
are holding a control called `cutoffslider`, and their question is the opposite one: **what of all
this applies to me?**

Nothing answered that. A Slider has no Arp section, so `arpRate("cutoffslider", 4)` does nothing —
but the name was in the picker, it completed (or rather, it did not, see below), and the only way to
learn it was meaningless was to run it and read the notice. The complaint that produced this slice
was exact: *"it should be clear from the API that something doesn't belong to a slider without
having to look it up with get/set or running into an error."*

### Not a Slider module

The obvious fix — give every component type its own module, `ce.slider.*`, `ce.button.*` — is the
wrong one, and worth saying why. Almost everything a script does to a Slider is not slider-specific:
you set its value, animate it, draw on it, send MIDI when it moves. Those verbs are shared by all 49
component types. A `ce.slider` module would either duplicate them 49 times or be nearly empty, and
either way the question "can I use `drawArc` here?" would still have no answer.

The real asymmetry is narrower than it looks. Of the whole surface, only the 28 **component
families** are type-specific, and each one is type-specific for exactly one reason: it drives a
model *section* that only some component types carry. `ce.components.arp` writes to `Arp`. A Slider
has no `Arp` section. That is the entire rule, and it was already expressed — twice — in data that
existed before this slice.

### Derived, not declared

`componentSchema.js` restates neither list. `COMPONENT_TYPES` already says which sections each type
carries; `COMPONENT_FAMILIES` already says which section each family drives. The map is the join:

```
moduleAppliesToType('ce.components.arp', 'Slider')
  → FAMILY_SECTIONS['ce.components.arp']      = 'Arp'
  → sectionsForType('Slider').includes('Arp')  = false
```

A module with no section in that map — `ce.midi`, `ce.draw`, `ce.core`, the lot — applies to
everything, because it genuinely does. Narrowing those would be a lie in the other direction, and a
more damaging one: they are the verbs almost every script uses.

The five hand-written families predate the spec and have their section named by hand, because
`ce.components.harmony` drives `Harmoniser` and `ce.components.split` drives `SplitZone` — inferring
the section from the module id is a rule that works until it doesn't, and it already doesn't. A test
asserts every `ce.components.*` module in the manifest has a section mapped, so the failure mode
(a new family silently applying to every control) cannot survive a run.

### One source, three surfaces

- **The picker tree.** With a script attached to `cutoffslider`, the Commands tab drops the families
  a Slider has not got and says so — *"Not for a Slider — 28 modules"* — rather than silently
  thinning out. The Paths tab drops to that one control, already expanded. A `this control / all`
  toggle sits above the search box, because narrowing hides real API and someone learning the
  surface, or about to retarget the script, has to be able to see all of it.
- **Autocomplete.** `getCompletions` takes the control type and filters the same way. This is also
  the slice where the component verbs became completable *at all*: `API_FUNCTIONS` was
  `[...COMMANDS, ...HELPERS]`, so the 182 `PANEL_COMMANDS` — by count the largest part of the API —
  had no completion, no hover and no signature help. They were left out because there was no way to
  say which of them applied. Now there is, so they are in.
- **The error message**, via `describeType`. Somebody who gets there another way is told what the
  control *does* have, not only what it hasn't.

### Two things narrowing must never do

**Narrow on "I don't know."** A wildcard target, an unknown control name, a control with no type,
a type this build has never heard of — none of those narrow the cross-cutting half. "We cannot tell
what this is" must not render as "this can do nothing".

**Narrow away the user's own names.** The filter runs over the API pool only. A local called
`arpRateOfMine` completes in a Slider's script, because it is theirs.

The asymmetry is deliberate, though: an *unknown component type* does narrow the component families
to nothing. A type the build has never heard of should show an empty component tree loudly, rather
than quietly offer all 28 families as if any of them would work.

## 26. Closing the loop: the validator and the message

§25 narrowed two surfaces. It also claimed a third — that the runtime error could name what the
control *does* have — and left it unwired. Both halves are now built, and they are the same fact
said at two different moments.

### The validator is what makes narrowing hold

The picker and autocomplete stop you *finding* the wrong verb. Neither stops you *writing* one.
Paste a snippet in, rename a control, change what the script is attached to, and the narrowing has
already happened — the source is what it is, and nothing looks at it again. Until this check
existed all three produced a script the editor marked **✓ No problems** and the runtime quietly
refused.

`validateScript` now scans for a component verb with a **literal** first argument, resolves that
name against the panel's controls (flattened — most panels group their controls, and stopping at
the top level would report half of them as unknown), and errors when the type has no such section:

```
ce.components.arp.rate("cutoffslider", …) — "cutoffslider" is a Slider, which has no Arp
section, so the call does nothing. A Slider has no component verbs of its own — ce.midi,
ce.draw and ce.anim work on it.
```

Two deliberate silences. **A computed target is not guessed at**: `arpRate(name, 4)` is unknowable
without running the thing, and a red mark on correct code is much worse than no mark on wrong code.
**An unknown name is left alone**: the panel may gain that control later, and this is not the place
to police spelling.

### The message says what it is, not only what it isn't

`"Cutoff" is not an Arpeggiator (no Arp section)` was true and no help. The person reading it
already believed it was one; the reply told them nothing about what they had. It now reads
`"Cutoff" is a Knob, not an Arpeggiator. A Knob has no component verbs of its own — …`, and where
the control has a family of its own it names it: `Its own verbs are ce.components.looper`.

It also separates two failures the old text ran together. A typo (`arpRate("Cutof", …)`) produced
the same "is not an Arpeggiator" as pointing at the wrong control, and the two want opposite fixes.
A name with nothing behind it now says so.

One helper, four call sites — the three hand-written families and the generic phase-7 path all used
the same sentence, so they all get the same better one.

### The bug the fixtures were hiding

`typeOfControl` read `_children.Core.type`. The model spells it **`controlType`** (`_type` is the
string `"Core"`), and 66 other call sites already knew that — these two were the only ones that
didn't. So in the running app every control reported no type at all, which fails *open*: nothing
broke, nothing was wrongly hidden, and the whole feature simply did nothing.

Every test passed, because every test built its own `{ Core: { type: 'Slider' } }` fixture and the
fixture agreed with the bug. A hand-written fixture only ever tests the code against itself. The
tests now build controls with `createControl` and walk **all 49 types** through
`createControl → typeOfControl → familiesForType`, which is the path the picker and the validator
actually take. That is the third time this project has been caught by a fixture that was easier to
write than the real shape, and the rule earns another statement: **if the real object is available,
the fixture is the real object.**

## 27. `ce.core` expanded — the reactive core

The module review asked a sharper question than the earlier passes: not *what verbs are missing*,
but **what can a script do that setting a property cannot?**

A properties panel stores a **constant**, decided once at design time. That is its whole nature, and
no number of extra fields changes it. So the expansion is not more properties — it is verbs that
store a **rule the runtime keeps applying**. Four of them, all in `ce.core`:

| verb | what the panel cannot express |
|---|---|
| `watch(path, fn)` | *tell me when this moves* — for any model path, not the eleven events enumerated in advance |
| `compute(path, fn)` | *this value follows those values* — a property that is a formula |
| `intercept(path, fn)` | *every write passes through me first* — transform, clamp, quantise, or veto |
| `defineAction(name, fn)` | *here is a verb the panel can be built out of* |

`defineAction`'s flat name is not `action`: `action` alone reads as "call one", and the point of the
verb is that it *defines* one. The other three are unambiguous and keep their names.

### Why not "more properties"

`compute` is the clearest case. A panel can hold `"cutoff 42"`. It can never hold *"whatever cutoff
says"*. And a `valueChange` handler that writes the label is not the same thing: the handler fires
only for the events somebody remembered to hook, so it falls out of step on load, on a dump landing,
on any path that raises no event. A formula the runtime owns cannot fall out of step, because the
runtime is what decides when to re-evaluate it.

`defineAction` inverts the relationship the other three keep. Scripts have always been things the
panel triggers. A registered action is a thing the panel is **made of** — `run("initPatch")` reaches
it from any script in any language, and it is offered wherever the panel binds actions. A registered
action deliberately beats a same-named handler: the registration is a declaration of intent, the
coincidence is not.

### The settle pass, and the order that matters

One pass runs after every change, in a fixed order, and the order is the design:

1. **Computes, to a fixpoint.** `b = a*2` and `c = b+1` both settle in one pass, so `c` never sees
   the previous `b`. Capped at eight passes — two formulas feeding each other are cut off and
   reported rather than looped on, and the cap lives *inside* one pass rather than bouncing through
   the store subscription, where it would look like the editor had hung.
2. **Filters, over their own paths.** `intercept` in the write path only catches writes that came
   through `set` — which would make it a rule that holds for scripts and not for people. The user
   dragging a control, inbound MIDI and a landing dump all write straight into the model, so the
   filter is applied afterwards and the value corrected: the knob snaps rather than refusing to
   move. This needs an idempotent filter to settle (`f(f(x)) == f(x)`), which snapping, clamping
   and quantising all are.
3. **Watchers, last**, so they only ever report a value the panel actually held. A watcher that
   fired on the intermediate state would report a number that never existed.

Three re-entry guards, because every one of these can write: a filter that calls `set` on its own
path, a compute whose write triggers the pass that is already running, a rule firing inside a
nested dispatch. In C++ the settle only runs at `dispatchDepth == 1` for the same reason.

Rules belong to the script that registered them, exactly as `on` listeners do, and a rule *replaces*
the same script's rule for the same path rather than stacking beside it — two filters on one path
would make the result depend on the order the scripts happened to load in.

### Cross-runtime, because nothing here needs a canvas

None of the four is physically panel-view-only, so under the §7 rule none of them is declared
`webview`. All four work in the Lua, JavaScript and Python engines with the window closed.

Where the rules *live* follows each engine's existing shape rather than a new convention:

- **Lua** keeps them in C++ (`std::vector<Rule>`, `sol::protected_function`), tagged by script,
  because one `sol::state` is shared by every Lua script — the same reason `on`/`off` are tagged.
- **JavaScript and Python** keep them in the **prelude**, in the script's own engine/namespace,
  because those runtimes already give each script its own — so the arrays are scoped for free and
  the C++ side is only the caller. This is exactly how `on`/`off` already differ between them.

`ScriptEngine` grew four virtuals — `runReactive`, `applyIntercepts`, `callAction`,
`registeredActions` — all defaulting to inert, so the native-handler engine (whose modules are
compiled and cannot register a closure at runtime) is unaffected rather than broken. The split is
deliberate: **the runtime owns *when* rules run, the engine owns *what* runs**, because a rule is a
language-native closure and can only live where it was made.

### The same NUL byte, twice in one session

`__sig` returns a sentinel for "no value" that `JSON.stringify` can never produce. Written directly,
that sentinel is a raw NUL — and a raw NUL in a C++ source file **truncates the string literal**, so
QuickJS received half a prelude and reported `unexpected end of string` at a line number pointing at
an innocent comment. Every JavaScript test failed at once and none of them said why.

It happened first in `panelRuntime.js`, where it was harmless enough to miss, and then again in
`JsScriptEngine.cpp`, where it took out an entire engine. Both sentinels are now written as the
escape `"\u0000void"` — plain ASCII in a plain ASCII source file. The verification set gained a
tree-wide NUL scan, because the one thing worse than an invisible character is an invisible
character you have already met.

## 28. `ce.midi` expanded — the wire, not just the sends

`ce.midi` was 29 members: **13 senders and 16 encoders**. All outbound, plus pure functions.
Inbound was react-only — `onCcIn` fires *after* a binding has already moved the control — and no
send had a destination, because a panel picks one device role at design time.

Five expansions, all cross-runtime:

| verb | what the panel cannot express |
|---|---|
| `interceptMidiIn(fn)` | rewrite, remap or swallow a message **before** the bindings act on it |
| `interceptMidiOut(fn)` | rewrite, thin or block what the panel sends — from a script *or* from a binding |
| `feedMidi(bytes)` | inject as if the hardware had sent it, driving the panel's own bindings |
| `routeMidi(role, fn)` | send a block to a different device than the one bound at design time |
| `sendNote(…, ms)` | a note that ends by itself |

### Where the filters sit is the feature

`ce.core.intercept` filters a **model path**. These filter the **wire**, and the difference is
placement. Putting them in the scripting runtime would have been easy and nearly useless: inbound
reaches the panel's bindings, the note input and the transport long before any script sees it, and
outbound leaves from a control's own binding as often as from a `sendCC`. A filter applied only
where scripts happen to look is a rule that holds for scripts and not for the panel — exactly the
half-measure `ce.core.intercept` had to grow a settle pass to avoid.

Both paths turned out to have exactly one door:

```
inbound   deviceProfileSession.js  →  latestMidiInputMessage.set(...)
outbound  bridge.js                →  triggerRawMidiAction(...)
```

Neither can import `panelRuntime` — the runtime imports both, so it would be a cycle. Hence
`midiFilters.js`: a registration seam holding one function per direction. The runtime keeps its own
per-script chains and installs one filter; which script wins and in what order stays the runtime's
business. In the C++ player the same split is a `ScriptRuntime::filterMidi(inbound, bytes)` the host
calls at its own two doors.

**A throwing filter passes the message through unchanged.** Failing closed would let a typo in one
script turn into "my hardware stopped responding" — a symptom with no visible cause. The error is
reported; the MIDI keeps flowing.

### Why `feed` is not `set`

`set("cutoff.value", 64)` moves a control and bypasses every binding. `feedMidi` goes in the front
door, so the bindings, the note input and the transport all act on it — which is how a script-built
arpeggiator or step sequencer drives the panel instead of fighting it. Fed messages run the inbound
filters too: a velocity curve that applies to the keyboard has to apply to the sequencer.

### Why routing is a block

`routeMidi(role, fn)` rather than a `role` argument on thirteen senders. The destination is a
decision about a *run* of sends, and threading it through every signature in four runtimes is the
same decision written thirteen times. It copies `noTransmit(fn)`, which already had this shape, and
the restore is in a `finally`: a throw inside the block must not leave every later send in the
session pointed at the wrong synth. `sendNote`'s scheduled note-off captures the role at send time,
so a note started inside a block ends where it began even though the block has long since closed.

### What the machinery caught

`sendNote`'s duration schedules the note off with `after()` — which is `ce.time`, not `ce.midi`. The
prelude-dependency test failed the moment the call appeared:

```
lua @module ce.midi calls after() from ce.time — add "ce.time" to ce.midi's requires
```

So `ce.midi` declares `requires: ['ce.core', 'ce.music', 'ce.time']` now, and a second test failed
in turn: a panel whose only script calls `sendCC` auto-detects `ce.time` as well, because
auto-detection follows the dependency graph rather than the names in the source. Both failures were
correct, and neither would have been noticed by hand.

The alternative — leaving the note-off to the script — is the one MIDI mistake you *hear* rather
than read. A hung voice is worth a module dependency.

### The half that was missing, and the test that would have caught it

§28 shipped `interceptMidiIn`/`Out`, `routeMidi` and `feedMidi` with the WebView side wired and
**the player side not wired at all**. `ScriptRuntime::filterMidi` existed and nothing called it;
`beginRouteOverride` and `feedMidi` were `ScriptHostApi` virtuals no host implemented, so both fell
through to their default no-ops. In the exported plugin, three of the five verbs read as working and
did nothing.

That is the exact defect this document keeps recording — an undeclared boundary — and the C++ suite
was green throughout, because every check called `runtime.filterMidi()` **directly**. Testing the
chain is not testing that anything reaches it. The missing assertion was one level up, and it is now
in `PlayerScriptIntegrationTests`: a send goes through the filter on its way out, an inbound message
on its way in, driven the way the player drives them.

The wiring itself:

- **Outbound** — `scriptSendRawMidi` is the one funnel every script send passes, so the filter runs
  there, on the assembled bytes rather than on each verb's arguments.
- **Inbound** — the `midiInputMessage` tap became `deliverInboundMidi`, a named method, and the
  filter runs before *any* of `onMidiIn` / `onCcIn` / `onNoteIn` is raised. Naming it is what lets
  `feedMidi` mean exactly the same thing: same filters, same events, same order. Two copies of that
  ordering would be two chances for a fed message to behave unlike a real one.
- **`routeMidi` is honest rather than complete.** In the plugin, every script send leaves through the
  plugin's own MIDI output bus, and which synth that reaches is the DAW's routing decision. The role
  is recorded in the log line (`{route aux, DAW-routed here}`) instead of being silently accepted.
  `routeMidi` is fully applied in the panel view, where sends are addressed to a device role
  directly. A host wiring neither callback gets a `warn` from `BridgeScriptHost` and the block still
  runs — the failure is stated, not swallowed.

The general rule this earns: **a verb is not done when its runtime implements it, only when every
host that claims it invokes it.** The parity suite checks that a name exists in each engine. Nothing
checked that the app calls the engine, and for one commit that gap was the whole feature.

---

## 29. `ce.device` writes structure — the profile stops being read-only

Ten verbs, all of them reads. The profile is a fixed thing the app was shipped with; a panel binds
to parameters it already knows, at design time. Nothing could write structure — so a panel could
only address a synth somebody had already written a profile for, which excludes most of what is
actually in people's racks.

```lua
function onPanelBuild()
  ce.device.defineParameter("cutoff", { name = "Cutoff", group = "Filter", min = 0, max = 127, cc = 74 })
  ce.panel.create("Knob", { name = "cutoffKnob", x = 20, y = 40 })
  ce.device.bind("cutoffKnob", "cutoff")
end
```

| | |
|---|---|
| `ce.device.defineParameter(id, spec [, role])` | teach the app a parameter at runtime |
| `ce.device.defineDump(kind, spec [, role])` | describe a SysEx layout at runtime |
| `ce.device.bind(control, parameterId [, opts])` | wire a control to a parameter at runtime |
| `ce.device.unbind(control [, port])` | and take it off again |
| `ce.device.ports([opts])` | what is actually plugged in |
| `ce.device.requestDump(kind [, fn [, opts]])` | the reply comes back to the caller |

### A declaration is self-encoding, and that is the whole design

`spec` carries its own wire format — `{ cc = 74 }`, `{ nrpn = { msb, lsb } }` or a SysEx template —
so **nothing in the path needs a profile to exist**. A declared parameter is compiled and sent as
raw bytes; a declared layout is matched against arriving SysEx and decoded by the same rules. That
is what makes "a panel that wires itself to a synth nobody wrote a profile for" a real sentence
rather than a slogan: discover, declare, create, bind, drive.

`defineParameter` and `bind` are the pair that matter, and they only work as a pair. `ce.panel.create`
could already make a control and nothing could connect it to anything, so a self-building panel built
**dead controls** — and the tempting half-fix is worse than none, because a bound control that moves
the picture and sends nothing looks wired. So `set()` on a control bound to a declared parameter
compiles the declaration and sends it, on both runtimes, and both suites assert the bytes.

### Refusing is a feature, twice

- **A parameter with no wire format is refused.** A descriptor with no wire enumerates perfectly and
  sends nothing, so the panel *looks* built; the failure surfaces later and somewhere else. An error
  at declaration time is strictly better than a control that is quietly ornamental.
- **A dump field naming an undeclared parameter is refused.** Deferring that to decode time means a
  dump that decodes to fewer values than the author thinks — months later, in front of an audience.
  The cost is a declaration order the script has to get right, which is a one-line fix.

Both refusals are stated with the call that would fix them, because "invalid spec" is the message
that teaches nothing.

### What is reused, and the one thing deliberately not

Decoding a dump reuses the local engine (`localParseDumpMessage`) verbatim, by handing it a
synthetic profile built from the declarations: u7/u14/nibbled/ASCII values and roland-7bit/sum-7bit
checksums are all already there, and a second decoder would drift from the first.

Encoding is **not** reused. `localCompileParameter`'s `$checksum` token is a plain clamped sum,
which is fine for an editor preview and wrong on the wire. A script-defined parameter is the real
send, and this verb exists for old and obscure hardware — which is exactly the hardware that
checksums. So the registry computes the checksum the device documents, and the SysEx template gained
`$checksumStart`: a Roland checksum covers the **address and data**, not the manufacturer header,
and no rule inferred from a template can know where the header stops. Marking it is learnable;
guessing it is a message the synth rejects in silence.

### `requestDump` closes the loop

Fire-and-forget was the odd one out — `deviceRead` already answers where it is called, and a dump's
answer turned up at `onDumpReceived` with nothing tying it to the request, so a panel that asked for
two dumps in a row could not tell which reply was which. Three rules, each protecting against a
specific way this shape goes wrong:

1. The waiter is removed **before** the callback runs, so a throw inside it cannot leave one armed
   for the next dump. Same rule `after()` follows, for the same reason.
2. A waiter that never hears back is resolved with `ok = false` rather than left hanging. A synth
   that is off, or that does not answer this request, is the common case.
3. The callback runs **after** `onDumpReceived`, so "the dump arrived" and "the dump I asked for
   arrived" cannot observe the panel in two different states.

It is assembled in each prelude over `__requestDump`, not in the host: the callback is a language
value, and a host holding one would need a per-engine way to call it back. That is also what makes
`ce.device` require `ce.time` now — the timeout is `after()`, and the prelude-dependency test failed
the moment the call appeared, which is the drift that rule exists to stop.

### The runtime boundary

`defineParameter`, `defineDump`, `ports` and the callback are **cross-runtime**: declaring is data
plus a codec, and a synth with no profile is driven from a DAW with the window shut at least as
often as from the editor. The declarations live in `ScriptRuntime` rather than in a host, for the
reason `ce.anim` does: the same bytes have to leave from a scripted write and from a bound control's
write, and the same layout has to decode an arriving dump. One owner, one answer.

`bind` and `unbind` are **panel-view only** and say so individually — the binding lives on the
control model, and there is none with the window shut. Same boundary `ce.panel.create` sits behind,
which is the right place for it: the two verbs are used together or not at all.

Declarations are script-lifetime. They are dropped before every `onPanelBuild` and on every
`loadScripts`, which is what makes a build idempotent and what stops a declaration half-saving into
the author's document — the same three-part rule generated controls follow in §13.

### Three things this turned up

- **`memberRuntime` takes a member, not an id.** A test asserting `memberRuntime('deviceBind')`
  passed `'webview'`… no, it got `'any'` for every member, because the string has no `.runtime`. It
  failed loudly here; the same mistake inside the generator would have silently declared every
  webview-only verb cross-runtime and stubbed nothing.
- **A panel-view-only verb still has a host.** `bind` first wrote through `updateControlProperty`,
  which addresses the editor's control store — correct in the editor and a no-op in the exported
  plugin's *open* window, which runs this same runtime with a host installed. `updateControls`
  already had that split for `ce.panel`; the structure verbs need it too. "Panel view only" is not
  "editor only", and the two have been confused before.
- **The native ABI had no `device_write`.** It was never appended when §23 added the verb, so a
  C++/C#/Java handler could read a parameter and not set one. `device_write` and `device_define`
  were appended together rather than the new one alone: a handler that could declare a parameter and
  not send one would build exactly the dead panel the whole section is about.

---

## 30. `ce.math` expanded — the arithmetic a panel actually does

Eight verbs, and every one of them scalar and stateless: one number in, one number out. `random`
and `seed` are the only state. Everything a panel actually wrangles — a range that comes back round,
a taper of its own shape, a set of settings rather than a step, a weighted pick — had to be
hand-rolled per panel, in five languages.

The criterion is different for this module, and worth stating rather than fudging: `ce.math` never
touches the panel, so "beyond what a property can hold" is not the test. The test is **what must a
panel hand-roll, where the hand-rolled version drifts between the runtimes?**

| | |
|---|---|
| `ce.math.wrap(v, lo, hi)` | bring a value round into a half-open range |
| `ce.math.map(v, points)` | a response curve of your own shape, as breakpoints |
| `ce.math.quantize(v, values)` | snap to the nearest of a LIST, not to a regular step |
| `ce.math.choice(values [, weights])` | a seeded pick, optionally weighted |
| `ce.math.dbToGain(db)` / `.gainToDb(gain)` | decibels, which no language provides |

### `wrap` is a bug fix wearing a feature's clothes

The five runtimes **disagree about `%`**. `(-1) % 12` is `11` in Lua and Python and `-1` in
JavaScript, C++, C# and Java. So the ordinary way to write a pitch class —
`(note + transpose) % 12` — has been giving two different answers depending on which engine the
panel is running in, and nothing said so: the editor preview and the exported plugin would simply
disagree by an octave and a semitone on any negative transpose.

`wrap` is the floored form, written identically in every prelude, and it is half-open so
`wrap(12, 0, 12)` is `0` — which is what makes it a pitch class rather than a clamp. It is the
smallest verb in the section and the only one that closes something that was already broken.

### `map` is the one that goes past a closed set

`curve(v, shape)` is four names. It is the module's only shape-of-response verb, and a taper it does
not have could not be expressed at all — not in a script, and not in a property either, since a
property stores a constant. Breakpoints are the smallest thing that can hold an arbitrary curve:

```lua
set("cutoff.value", ce.math.map(pedal, { {0, 0}, {0.5, 0.9}, {1, 1} }))   -- opens fast, finishes slow
```

Three rules, each of which is a decision rather than an accident:

- **Points are sorted by x**, so the order they are written in does not matter.
- **Outside the outermost points the value is held, not extrapolated.** A curve drawn between 0 and
  1 that suddenly runs away past 1 is never what the author drew.
- **Two points sharing an x are a step, and the breakpoint belongs to the value it steps *to*.**
  The alternative is a divide by zero — a NaN travelling into a control's value — and the choice of
  side matters: the first attempt returned the *old* value at exactly 0.5 and the new one a
  millionth above it, which is a step in the wrong place by a hair. The web suite caught it, and the
  fix was to the code rather than to the expectation.

`curve` itself gained nothing except honesty: a name it does not know used to return the input **in
silence**, which reads as a curve that does nothing rather than as a name that was never applied.
It now says so and points at `map`. That is why `ce.math` requires `ce.core` — reporting is `log()`.
`ce.core` is `global` and never gated, so the dependency costs nothing at runtime, but it is a real
call and the prelude-dependency test is right to want it declared.

### `choice` draws exactly one number, weighted or not

The seeded generator is the whole reason `random` exists here: the same seed has to replay the same
sequence in every runtime, or a "random" patch is not something you can get back. A weighted pick
that consumed a different amount of the sequence than an even one would break that promise
*downstream* — everything picked after it would differ — so both paths draw exactly one number and
divide it up differently. The test asserts the **draw count**, not the distribution, because the
distribution is the part that would look fine.

A missing or negative weight counts as zero; all-zero weights fall back to an even pick rather than
to nothing.

### Small decisions worth stating

- **A tie in `quantize` goes to the lower value**, so the answer never depends on how the two
  distances happened to round, or on the order the list was written in.
- **`gainToDb(0)` is -144 dB**, the 24-bit noise floor, not negative infinity: `-inf` is a number
  half the runtimes cannot carry through a value and none of them can put on a label.
- **Flat aliases keep a prefix where a bare word would collide.** `map` is the single most common
  name a panel author gives their own helper, and `choice` is not far behind, so flat they are
  `mapCurve` and `randomChoice` — the same rule `randomSeed` follows for `seed`.

### What running the preludes caught that parsing did not

The C++ engines cannot be built in every environment, so this section was checked by **executing
the Lua, JavaScript and Python prelude sources directly** against the same table of values the web
suite asserts. Every number matched, including the seeded draw — `0.1720386769156903` out of both
the JS and Python generators after the same seed and the same weighted pick, which is the check that
actually proves the sequence has not diverged.

It also surfaced the picker's rule the hard way: a `HELPERS` entry's `signature` must use the
member's **flat id**, because `namespacedSnippet` rewrites the flat spelling into the namespaced
path and cannot find a spelling that was never there. `signature: 'map(v, points)'` on a member
called `mapCurve` produced a snippet the picker silently failed to namespace.

---

## 31. The Properties panel gap — what a script still could not do

The module march (§27–§30) was expanding one module at a time. Partway through it stopped being
the right question, because the bar the whole exercise is measured against is not "is this module
small" but **"can a script do what the Properties panel can, and more?"** So this section is an
audit against the panel rather than against a module, and what it found is not where the module
list was heading.

**For values, scripting already equals the panel.** `set`/`get` reach every leaf of every section;
that was Q1's promise and it holds.

**For structure, the panel was ahead in four places** — and every one of them failed *silently*,
which is why none of it had ever been noticed:

| The Properties panel | A script, before this |
|---|---|
| Writes a state's patch — "when hovered, this looks like that" | Could replace the whole map, could not touch one key of it |
| Adds an entry to any of eleven collection sections | Only by hand-writing the entire node as one value |
| Removes one | **Nothing.** `set(path, nil)` leaves the entry exactly where it was |
| — | A path that led nowhere wrote nothing and said nothing |

### The silent write was the one to fix first

It is not a missing feature; it is the contract breaking its own headline. Q1 says *coverage is
total, you can never pick "wrong"* — and a missing **control** was reported while a wrong **path
inside a found control** vanished. Every gap in the table above was invisible behind it, including
one that was not in the plan at all: **a Knob and a Slider ship no `Value` section**, so
`set("knob.value", 8000)` — the most ordinary line in any panel script — writes nothing in the
editor. It works in the player only because the host routes a live value through the preview
session instead of the document.

So `setNestedValue` now answers whether it wrote, and the runtime reports a write that went
nowhere, naming the missing section when that is what it was. Two rules make that safe:

- **The probe and the write share one walk.** `resolveWriteTarget(control, path, create)` is used
  by both, because "would this land?" and the landing itself disagreeing is exactly how a check
  becomes a lie. A probe walks a *copy* of a section template rather than materialising it.
- **The host is asked, not second-guessed.** The player has its own write semantics, and a host
  that returns nothing is not making a claim — it is taken at its word rather than reported on.
  Without that rule the fix would have reported a false failure on every live value write in the
  exported plugin.

There is a third, quieter case: a path that lands but *creates* a key the node did not have. On a
typed section (`Transform`) that is a typo writing a property nothing reads, so it warns and still
writes. On a free-form map — a state's `when`, a patch map — new keys are the design, so it stays
quiet. The distinction is `_type`: a node that declares one has a shape.

### `ce.panel` gained the collections

```lua
ce.panel.entries(control, section)                -- the names in a collection
ce.panel.entry(control, section, name)            -- one of them
ce.panel.define(control, section, name, spec)     -- create, or replace
ce.panel.undefine(control, section, name)         -- remove; returns whether there was one
ce.panel.patch(control, state, patch [, part])    -- merge keys into a state's patch map
```

One verb family rather than ten, for the reason `deviceQuery` is one primitive rather than four:
`States`, `Bindings`, `Animations`, `Parts`, `ValueChannels`, `Behaviors`, `HitZones`,
`Generators`, `Links` and `Variants` differ in what an entry *means*, not in how it is listed,
added or dropped. (`Children` is the eleventh and `create`/`destroy` already owned it — which is
the proof the shape works.)

`define` **merges the spec over the section's template**, so declaring a state is one line instead
of a hand-written node carrying `_type` and both patch maps. A verb that demands the full shape
every time is a verb nobody uses. `undefine` routes to `removeControlNode`, which has existed the
whole time and which nothing script-facing had ever called.

### `patch` exists because the addressing model cannot address it

A state's patch is a map whose **keys are themselves dotted paths**:
`{ "Background.Fill.colour": "FFFF0000" }`. So
`set("k.States.Hover.patches.component.Background.Fill.colour", …)` walks off the end of the model
looking for three sections that are one key — the single place in the document where the path
grammar collides with itself. `set` can only replace the whole map, which means "make this one
thing red when hovered" requires knowing everything else the state already changes.

`patch` merges, and there is deliberately **no way to spell "remove this key"**: a nil-valued key is
simply absent from a Lua table, so a delete-by-nil convention would be unwritable in one of the five
languages. Dropping keys is `set()` on the whole map, which already worked.

### And what this buys that the panel cannot

The point was never parity. A property is chosen at design time; these verbs run while the panel
does. A state whose patch is *computed*, states attached to controls a script generated, a control
greyed out because the synth that actually answered does not have that parameter — none of it is
expressible as a stored constant, and all of it is now one line.

### The analysis was wrong once, and running it is what caught that

The first pass of this audit reported that a state's patch was unreachable. It is not: a
whole-map write always worked. That was found by probing the live runtime rather than reading it,
and the corrected finding is sharper than the original — the problem is not access, it is
*granularity*, and it comes from the key/path collision rather than from a missing feature. Reading
the code produced a plausible answer; running it produced the true one.

---

## 32. `ce.math` completed — the arithmetic a panel actually does

§30 added six members and closed a real cross-runtime defect, but it was not a *complete* pass: what
was left was still only the scalar half. This is the rest of it, arrived at by working through what
a synth panel actually computes rather than by looking for small additions.

The rule from Q10 is what keeps the list finite and is worth restating, because it is the reason
this is twenty-five members and not eighty: **nothing here duplicates the language's own scalar
maths.** `min`, `max`, `abs`, `floor`, `ceil`, `sin` all exist in every runtime already. What is
here is domain-specific, list-shaped (Lua's varargs make the language version unusable over a
table), or has to be identical in five runtimes to be worth anything at all.

| | |
|---|---|
| `norm` / `denorm` | a value to its 0–1 position and back, **clamped** |
| `bipolar` / `unipolar` | the two shapes a modulation source is in |
| `fold` | come back *off* the end instead of round it |
| `index` | 0–1 to one of N, without the off-by-one |
| `crossfade` | the Crossfader component's three laws |
| `approach` | a rate limit with no state of its own |
| `roundTo` / `almost` | a tidy number, and float comparison that means what `==` is assumed to |
| `min` / `max` / `sum` / `mean` | over a **list** |
| `blend` | morph one list of values into another |
| `randomFloat` / `gaussian` / `walk` / `chance` / `shuffle` | the seeded generator, for generative panels |
| `degrees` / `radians` / `distance` / `angle` / `polar` | geometry, in `ce.draw`'s own convention |

### Four of these are bug-shaped, not feature-shaped

- **`norm` clamps and `scale` does not.** `scale(v, lo, hi, 0, 1)` is the hand-rolled version, and
  `scale(150, 0, 100, 0, 1)` is `1.5` — past the end, and still wrong everywhere it is used after.
- **`index(1, 8)` is 7.** The hand-rolled `floor(t * count)` returns `8` at exactly 1.0, one past
  the end of the list it is addressing, and that shows up only when a knob is turned fully up.
- **`almost` exists because `0.1 + 0.2 ~= 0.3`.** A panel compares values constantly and every one
  of those values arrived through a `scale()` or a `curve()`.
- **`randomFloat` exists because `random(lo, hi)` returns whole numbers.** That is the right form
  for a note or a step, and it meant there was no seeded way to get a fractional one at all.

### The draw-count rule, and what it costs

Every random member draws a **fixed** number of times, so a seed replays the sequence whichever of
them a panel used. That is why `randomGaussian` does **not** cache Box-Muller's second value the way
the textbook version does: caching makes it alternate between two draws and none, and everything
downstream of a gaussian would land differently depending on how many had been taken before it. The
test asserts the *draw count* — that what follows a gaussian equals what follows two plain draws —
because the distribution is the part that would look fine either way.

`randomWalk` **folds** at the ends rather than clamping, for a related reason: a walk that clamps
piles up on whichever end it reached and stops being a walk. The test runs 300 steps and asserts it
sits at an end fewer than 15 times.

### `angle` and `polar` are `ce.draw`'s convention or they are nothing

`ce.draw`'s arcs are **degrees, 0 at twelve o'clock, increasing clockwise**, matching the Meter's
`arcStart`/`arcSweep`. A script drawing a knob ring had to rebuild `atan2` against that by hand, and
getting the quadrant wrong is a pointer that runs backwards. So `angleOf` returns 0 for up, 90 for
right, 270 for left — not −90 — and `polar` is its exact inverse. The round trip is asserted at five
angles.

### Running the preludes found a bug that parsing could not

The three preludes were **executed** and compared case by case — 35 of them, including the seeded
shuffle, which came out `3,2,4,5,1` from both the JavaScript and the Python generator after the same
seed. That is the check that proves the two generators have not diverged.

It also failed on the first run, in Python only, with `'str' object is not callable`. The generated
webview-only stub block ends with:

```python
for __n in __WEBVIEW_ONLY:
    globals()[__n] = __webviewOnly(__n)
```

and **a module-level loop variable outlives its loop in Python**. `__n` was left bound to the last
stub's *name* — a string — and the new helper of the same name defined 500 lines earlier was gone.
Every one of the twenty-five members would have failed at runtime, in the exported plugin, in one
engine only, and nothing in the parity suite could have seen it: the names were all present, the
file parsed, and the members existed. Only calling one found it.

Fixed on both sides: the helper is `__num` now, and the generator's loop variable is `__stubName`
with a `del` after it, so it cannot leak into a prelude again. **A generated block is code, and it
shares a namespace with everything hand-written around it** — which had not been true of any
generated block until one of them started emitting a loop.

---

## 33. `ce.math` against the Properties panel — the transforms it could not reproduce

§32 completed `ce.math` as a *maths library*. That was not the bar. The bar for this whole exercise
is **what can a script do that the Properties panel can, and more** — and measured against it, the
module had a hole that a library-shaped review could not find, because it is not a missing function.
It is a mismatch.

**The panel does not only store constants. It CONFIGURES value transforms:** a Macro slot's curve, a
Router's dead zone and transfer curve, an Envelope segment's curve and tension, a Timbre pad's blend
power, a slider's tick stops, a Meter's dB scale. Every one of those is arithmetic the app performs,
and a script could reproduce none of it — so a script could not compute what its own panel was about
to display, and anything it worked out alongside a bound control came out subtly different.

### There are three curve families in this app, and the script API matched none of the panel's

|  | `exp` | `log` | s-curve | `hold` |
|---|---|---|---|---|
| `ce.math.curve` (the script API) | `v²` | `√v` | spelled **`s`** | — |
| `macroWarp` (Macro slots) | `x²` | `1−(1−x)²` | spelled **`scurve`** | — |
| `envWarp` (Envelope, Router points) | `t^2.6` | `1−(1−t)^2.6` | spelled **`scurve`** | ✓ |

So `curve(v, get("macro.Macro.slots.0.curve"))` — reading a curve name out of the panel and applying
it, the obvious thing to write — either reported an unknown shape or returned a different number.
`log` differs in all three. `exp` agrees with the Macro and not the Envelope. The name `scurve` did
not exist in the script API at all.

**Both stay.** `curve()` is what existing panels are written against and silently changing `log`
from `√v` to `1−(1−v)²` would change how a shipped panel sounds; `shape()` is what the app itself
does. The distinction is documented on both, because two nearly-identical functions with no stated
difference is worse than the mismatch it replaces.

### Six members, all matched to the app rather than approximated

| | |
|---|---|
| `ce.math.shape(v, curve [, tension])` | the Envelope/Router warp, incl. `scurve` and `hold` |
| `ce.math.deadzone(v, amount [, invert])` | the Router's input shaping, rescale and all |
| `ce.math.weights(points, x, y [, power])` | the Timbre / Constellation inverse-distance blend |
| `ce.math.blendBy(values, weights)` | and applying them — what a morph pad IS |
| `ce.math.ticks(major [, minor])` | the slider's own tick-stop generator |
| `ce.math.dbPosition(fraction [, floor, ceil])` | the Meter's dB scale |

…plus `map()` now honours a **per-point curve and tension**, so a Router transfer curve or an
Envelope read out of a control evaluates in a script exactly as the app draws it. A plain pair list
is unchanged; straight lines are still the default.

Two oddities were matched deliberately rather than tidied:

- **`shape`'s tension defaults to 1.6, not 0.** The app computes `1 + (tension || 1.6)`, so an unset
  tension is not a straight line and `exp` is `v^2.6` rather than `v²`. A `shape()` that disagreed
  with the envelope it is named after would be worse than not having one.
- **`dbPosition(1)` is 60/66, not 1.** The Meter's ceiling is +6 dB, so full scale sits below the
  top with headroom above it. The test asserted 1 on the first run and was wrong; the comparison
  against `meterPosition` was right all along.

### The tests assert against the app's functions, not against numbers copied out of them

`scriptMath.test.js` imports `envWarp`, `shapeInput`, `buildSliderTickStops` and `meterPosition` and
compares directly, over 100+ combinations. Copying the expected numbers into the test would pin the
script API to what the app did *on the day it was written*; importing the real function means the
test fails if **either** side drifts, which is the only way "matched exactly" stays true.

The three preludes were then executed and compared case by case — 124 of them — so the same holds
window-closed.

### What this buys beyond parity

Parity was the gap; it is not the payoff. Once a script can compute the panel's transforms it can
compute them from values decided at runtime: a dead zone matched to the travel an expression pedal
actually reports, a curve tensioned per performance, a blend over anchors discovered from the device
rather than placed at design time, a scale drawn with `ce.draw` whose ticks line up with the ones
beside it. A stored property can hold one setting of each of these. A script can hold the rule that
chooses it.

---

## 34. `ce.math` — taming what arrives on the wire

The last four, and a documentation fix.

A controller does not send tidy numbers. It sends a value that jitters, crosses a threshold
repeatedly, spikes once, and has already been through a taper. §32 and §33 gave `ce.math` the
arithmetic to *shape* a value; these are what a script needs to make an incoming one usable, and
none of them composes out of what was already there.

| | |
|---|---|
| `ce.math.smooth(current, target, coefficient [, epsilon])` | one-pole exponential smoothing |
| `ce.math.hysteresis(value, on, low, high)` | a Schmitt trigger |
| `ce.math.median(values)` | spike rejection |
| `ce.math.unshape(y, curve [, tension])` | the inverse of `shape()` |

### Each one earns its place against a neighbour that looks like it

- **`smooth` is not `approach`.** `approach` moves a **fixed step** — a rate limit. `smooth` moves a
  **proportion of what is left**, so it settles fast and then creeps, which is the response a jittery
  pedal wants. It is `lerp` underneath and says so; the two reasons it is a member rather than a line
  are that the coefficient is clamped, and that it **arrives**. A one-pole is asymptotic — left alone
  it sits at 0.9999 forever, and a control smoothed with it **transmits forever**. Snapping inside
  `epsilon` is exactly what a hand-rolled version leaves out, and the test drives 200 steps and
  asserts it lands on the integer.
- **`median` is not `mean`.** A mean *smears* a spike across the result; a median rejects it. The
  test puts one 127 in a stream of 50s: the median is 50, the mean is over 65.
- **`hysteresis` has no neighbour at all.** Nothing in the module composed to it, and the cost of
  not having it is measurable: the test dithers a value across a single threshold and counts the
  flips — over 30 with a plain comparison, **zero** with two thresholds. On a bound control every
  one of those flips is a MIDI message.
- **`unshape` is the direction that was missing.** `shape` takes a value out through a taper;
  nothing brought one back. Only `map` is invertible by hand — swap x and y — while a named curve
  is not, so a value that went out shaped landed somewhere else on the way in.

`unshape` uses the **closed-form** inverse of smoothstep (`0.5 − sin(asin(1 − 2y) / 3)`) rather than
solving the cubic numerically: a numeric solve would be slower and, more to the point, would not
agree to the last bit across five runtimes. And it computes `k` the same way `shape` does, 1.6
default included — an inverse against a different exponent is an inverse of nothing.

`hold` is a step, so many inputs give one output and there is no true inverse. It returns the
**earliest** input that produces the output, which is the only answer that is a function, and the
summary says so rather than pretending.

### The documentation fix: the third curve family was reachable and unnamed

§33 said there are three curve families in the app and the script API matched none of the panel's,
then added `shape()` — the Envelope/Router warp. That left the impression the Macro family was still
out of reach. It is not: **`shape(v, curve, 1)` IS `macroWarp`, exactly, for all four curves.**
Verified rather than reasoned — with `tension = 1` the exponent `k` is 2, which turns `exp` into `x²`
and `log` into `1 − (1 − x)²`, and the s-curve is the same formula in both.

So all three families were covered by the second commit and nothing said so. `shape`'s summary now
names it. That is worth recording as its own kind of gap: **a capability nobody can find is not a
capability**, and the fix was a sentence rather than a function.

---

## 35. One generator per (script, stream)

The shared RNG was raised as a coupling problem: `shuffle()` advances the state `gaussian()` reads,
so two generative elements interfere. Looking at it properly found something worse underneath.

### It was a cross-runtime divergence, not just coupling

Where the generator's state lives was never decided — it fell out of how each engine happens to load
its prelude:

| runtime | prelude runs | generator state |
|---|---|---|
| **Lua** | once, into shared globals | **shared by every script** |
| **JavaScript** (C++) | per script — one QuickJS engine each | per script |
| **Python** (C++) | per script — its own namespace | per script |
| **WebView** | module-level `let` | **shared by every script** |

So a panel with two generative scripts produced different output in the editor than in the export,
and different again depending on which language its scripts were written in. `randomSeed(42)` in one
script silently reset another's sequence in Lua and in the editor, and did not in the shipped plugin.
That is precisely the rule Model 2 exists to guarantee — *test live = behaves the same in export* —
and nothing was watching it, because every engine was individually self-consistent.

### The fix: per script, and per named stream inside it

`randomStates` is now keyed by `(script, stream)` in all four runtimes. **Per script** rather than
per panel, for four reasons: two of the three C++ engines already were, it matches
`ce.storage.state`'s existing "the script's own scratch" scoping, it is the isolation a panel
actually wants, and it was safe to change because anything relying on the shared behaviour was
already broken in the export.

Lua needed the most work, because its prelude runs once into shared globals and a global function
cannot see its caller's environment. The engine already tracked `currentScriptId` in C++, so it now
mirrors that into a Lua global around every load and dispatch — which is what lets one global
`random()` tell the scripts apart without moving the function into each environment and breaking the
`ce` namespace, which is built from `_G`.

### `stream` is a block, not a handle

```lua
ce.math.stream("lfo", function()
  ce.math.seed(4)                 -- this stream's seed, nobody else's
  set("rate.value", ce.math.random(1, 16))
end)
```

The alternative was a stream *object* with its own `random`/`shuffle`/`choice` methods. A block wins
for the reason the design doc already gives for `routeMidi`: **the stream is a decision about a RUN
of draws, not about one of them**, and a name argument would have been nine signature changes.
A block also needs no new value shape — an object of functions would have to work identically as a
Lua table, a JavaScript object, a Python object and a gated stub, which is real cost for no gain.

It restores in a `finally` (a `pcall` in Lua), so a throw inside cannot leave every later draw in the
session pointed at the wrong stream — the same rule, and the same reason, as `routeMidi` and
`noTransmit`.

### One defect this turned up

Lua's `deliverEvent` — the path an `on(target, event, fn)` listener fires down — **never set
`currentScriptId` at all**, while a load and a dispatch both did. Anything script-scoped read inside
an `on()` handler therefore fell into a shared bucket. Nothing depended on that until now; the
per-script generator would have inherited it on day one, and a listener's draws would have come out
of a nameless generator shared with every other listener in the panel.

### What is verified

The web suite pins the cross-script isolation directly — one script drawing must not move another
along, and reseeding one must not reseed the other — and the JavaScript and Python preludes were
executed and compared: identical values, streams independent, and the override restored after a
throw. The Lua path is syntax- and parse-checked only, as ever.

---

## 36. Is `ce.math` complete? — the sweep, and the one thing it found

"Complete" had been claimed twice and been wrong twice, so this time it was checked rather than
asserted — and the way it was checked is the point. The earlier passes reviewed the module **as a
library**: what would a maths library have? That question found real things and missed the one
below, because the module is not a library. It is the arithmetic a panel needs, and the test for a
gap is **"does the app compute something a script cannot?"**

Sweeping the app's own `utils/*Layout.js` for pure functions that scripts could not reach turned up
exactly one:

**`euclid(steps, pulses [, rotation])`** — a Euclidean rhythm, `pulses` hits spread as evenly as
possible over `steps`. The Arpeggiator has used it for its rest pattern since it shipped, and
`ce.components.arp` could set `euclidSteps`/`Pulses`/`Rotate` — but no script could **compute** a
pattern, so a step sequencer, a gate, or an LFO mask had to reinvent it, and the hand-rolled version
is almost never the stable spread.

It is in `ce.math` rather than `ce.music` because it is an even-distribution algorithm over integers
— the same one as the Euclidean GCD — and `ce.music` is about pitch. That is a judgement call, and
a cheap one to reverse: it is one line in `MODULE_MEMBERS`.

Bresenham rather than the recursive Bjorklund, which produces the same output with no recursion to
port five times.

### And one behaviour that was correct and pinned by nothing

`map()` gained per-point curves in §33 so a Router transfer curve or an Envelope would evaluate in a
script exactly as the app draws it. It does — 0 mismatches over 40 samples of the Router's own
default breakpoints and of an envelope with tension on two segments. That was true *by construction*
and nothing in the suite held it there, so it is now asserted against `envValueAt` directly, the
same way the other panel transforms are.

### What is deliberately still absent

Saying where it stops is what makes "complete" mean anything:

- **Scalar `min`/`max`/`abs`/`floor`/`ceil`/`sin`, and `sort`/`reverse`/`slice`** — Q10. Every
  runtime has them. The *list* reductions are in because Lua's varargs make the language version
  unusable over a table; the scalar ones have no such excuse.
- **`inRange(v, lo, hi)`** — a plain comparison reads better inline than a call.
- **Matrix, complex, FFT** — no panel use case.
- **The Kinetic Modulator's physics step** — a pure function in `kineticLayout.js`, and reachable
  the same way `euclid` was not. Left out on purpose: it is a ball in a box with walls and
  restitution, which is a *component*, not arithmetic. A script drives it through
  `ce.components.kinetic`.
- **The Constraint modes** (`sum`/`order`/`ratio`/`mirror`) — relationships between controls, and
  already `ce.components.constraint`.

The honest summary: **`ce.math` is 50 members and the sweep found one gap, which is now closed.**
That is a much stronger claim than the two before it, because it comes from a different question —
and if a later component ships a pure transform, this is the sweep that finds it.

---

## 37. `ce.music` in a key — the questions the Properties panel answers on your behalf

`ce.music` was five verbs: `name`, `number`, `scale`, `chord`, `quantize`. Every one of them
answers a question about a note or a shape **on its own**. What a note *is* — what chord the key
implies, which degree you played, how the key spells its own accidentals — was never askable.

That is exactly the Properties-panel bar this march is measured against. Set a Chord Pad's key to
F minor and it draws `B♭m` on the fourth pad and labels it `iv`. Set a Harmoniser's voice leading
to *closest* and it picks an inversion from what you played last. Set an Arpeggiator to *updown*
and it walks the notes without repeating the endpoints. Each of those is a **stored property**
computed by a component that keeps the answer to itself. A script sitting next to that component
could not ask any of them, and — this is the part that matters — could not even *print the same
label*, because it had one spelling table and the panel had two.

**No audio is involved and none is assumed.** Everything below is integer pitch arithmetic and
strings: MIDI note numbers in, MIDI note numbers and labels out. Note↔Hz, tuning, cents,
temperament and microtuning are deliberately absent — they are the shape this module would take in
a program that made sound, and this one does not.

### The bug the sweep found first

`number()` could not read a flat.

```
noteNumber("C4")  = 60      noteNumber("C#4") = 61
noteNumber("Eb4") = 0       noteNumber("E♭4") = 0       noteNumber("Bb2") = 0
```

The regex was `^([A-G]#?)(-?\d+)$` — sharps only, ASCII only — and the failure branch returned
**0**. 0 is a real MIDI note (C-1). So a panel that *printed* `E♭4` and a script that read it back
disagreed by three octaves and a tone, and nothing anywhere said so: `sendNote(1, "Eb4", 100)`
played the bottom of the keyboard, silently, in every runtime.

It is now four spellings in and nothing out:

- `Eb4`, `E♭4`, `D#4`, `D♯4` all read 63.
- A flat lowers below the **letter**, so `Cb4` is 59 — the B underneath — not 61.
- An unreadable name returns **nothing**. `sendNote` still has to put a byte on the wire, so the
  MIDI path substitutes 0 there and only there; the verb itself stays honest.

`name()` gained the other half. With no second argument it keeps this module's plain-ASCII
spelling (`C#4`) — what every script written so far compares against, and what `number()` has
always round-tripped. **Given** a second argument it switches to the *panel's* table:
`name(63, true)` is `E♭4` and `name(61, false)` is `C♯4`, from the same `NOTE_FLAT`/`NOTE_SHARP`
the Chord Pad and Harmoniser print from. The test that pins this walks all 128 notes through both
tables and asserts each one reads back — the check that would have caught the original bug on the
day it shipped.

### The eight new verbs

| namespaced | flat | what it answers |
|---|---|---|
| `ce.music.spelling(root [, scale])` | `noteSpelling` | does this key write flats? |
| `ce.music.inScale(note, root [, scale])` | `inScale` | is this note in the key? |
| `ce.music.degree(note, root [, scale])` | `scaleDegree` | which degree is it — 1 for the tonic |
| `ce.music.degreeChord(root, scale, degree [, size])` | `degreeChord` | the chord the key builds there |
| `ce.music.quality(notes)` | `chordQuality` | name a chord from its notes |
| `ce.music.lead(notes, previous [, mode])` | `voiceLead` | re-voice for least movement |
| `ce.music.octaves(notes [, octaves])` | `expandOctaves` | spread a set up N octaves |
| `ce.music.arp(notes, pattern)` | `arpOrder` | the walk a pattern describes |

**`spelling` is the one that makes the rest agree with the screen.** It is the Chord Pad's
`useFlats`: judged by the **relative major**, so C minor spells E♭/A♭ rather than D♯/G♯. Composed
with `name` it is what a script does with it:

```lua
local flats = ce.music.spelling(60, "minor")
ce.ui.label("pad1", ce.music.name(63, flats))       -- "E♭4", the same characters the pad draws
```

**`degree` is 1-based, and a note outside the key has none.** The Harmoniser numbers its degrees
from 0 internally; the API does not, because a musician counting degrees starts at I. The refusal
matters more than the offset: rounding an out-of-key note to "the nearest degree" is how a wrong
note becomes a plausible chord. `quantize` is the verb that rounds, on purpose, and it is one call
away.

**`degreeChord` is the one `chord` cannot be.** `chord(62, "major")` is D major wherever you build
it — an absolute shape you name. `degreeChord(60, "major", 2)` is D **minor**, because in C the key
decides the third. It stacks scale thirds the way the Chord Pad does and returns the whole record:

```lua
local v = ce.music.degreeChord(60, "major", 5)
-- v.notes = {67,71,74}   v.name = "G"   v.roman = "V"   v.quality = "maj"
-- v.offsets = {7,11,14}  v.names = {"G","B","D"}  v.rootNote = 67  v.degree = 5
ce.music.degreeChord(60, "minor", 3).roman   --> "♭III", the wheel's own convention
ce.music.degreeChord("F4", "minor", 4).name  --> "B♭m", not "A♯m"
```

`size` is how many thirds to stack — 3 a triad, 4 a seventh — and a degree past the top of the
scale keeps going an octave up rather than failing, so degree 8 is the I above.

**`quality` is the inverse of `chord`**, in the panel's vocabulary (`maj`, `min`, `dim`, `aug`,
`sus2`, `sus4`, `maj7`, `dom7`, `min7`, `minMaj7`, `dim7`, `m7b5`). It reads intervals above the
**lowest** note, so it takes a chord from `chord`, from `degreeChord`, or one built by hand. An
inversion honestly gets a different name — `[64,67,72]` read from E is a minor sixth, not a C
major — and that is pinned, so nobody "fixes" it into root detection.

**`lead` is the Harmoniser's voice leading.** `closest` minimises the total movement of every
voice; `smooth` minimises the **top** voice only, holding a melody still while the inner voices
jump; `off` returns root position. With no previous chord there is nothing to lead from and the
chord comes back untouched, which is what makes the first chord of a phrase predictable. A tie
keeps the lower candidate, so five runtimes cannot pick five different inversions.

**`octaves` and `arp` are the Arpeggiator's two halves.** `octaves` drops anything that would land
above 127 rather than clamping — clamping stacks strays on one pitch, which sounds like a stuck key
rather than like nothing. `arp` returns a list of **steps**, each a list of notes, so `chord` (one
step, everything at once) has the same shape as the rest. Notes are taken in the order given, which
is what makes `asPlayed` mean anything. `random` returns the input order, exactly as the panel's
arpeggiator does — it draws its step at play time — and that is pinned rather than left implicit,
because a script expecting a shuffled *walk* would otherwise get a rising one and blame the seed.
`ce.math.shuffle` is the verb that shuffles, and it is seeded and therefore repeatable.

### Where the tables come from

`QUALITY_SUFFIX`, `ROMAN`, the minor-quality and minor-scale sets, both spelling tables and the
flat-key list moved into `scripting/musicTheory.js` and are now **generated** into all three C++
preludes alongside `__CE_SCALES`/`__CE_CHORDS`. Same rule as phase 7, one notch milder: a mistyped
semitone is a wrong note, and a mistyped note *name* is a label that disagrees with the Chord Pad
drawn beside it. Both are silent, and both are copies of a table the app already has — so neither
is copied.

### What executing the preludes found

Cross-runtime agreement was extended to 100+ music fixtures, and Python stopped being checked by
name alone: `scriptPreludeAgreement.test.js` now **executes** the Python prelude when `python3` is
on the machine. The first run of it found a shipped defect:

```python
def set(path, value, opts=None):        # ce.core's write verb...
    ...
inKey = set((base + x) % 12 for x in s)  # ...shadows the builtin for the whole namespace
```

`quantizeNote` raised `TypeError: set() missing 1 required positional argument` on **every call**
in the Python engine. Invisible to name parity, invisible to reading the code, and only findable by
running it. Fixed, and the reason is written at the site so the next generator expression does not
reach for `set()` either.

A second divergence was caught before it shipped: `0 || 3` is 3 in JavaScript and Python and **0**
in Lua, so neither `degree` nor `size` may lean on falsiness. All four runtimes now route those
through an explicit `__count(value, fallback)`, and `degreeChord(60, "major", 3, 0)` is a two-note
stack in every one of them.

### How it is tested

Three layers, and only the first two existed for `ce.music` before:

1. **Cross-runtime** — `scriptPreludeAgreement.test.js` runs every fixture through the Lua, JS and
   Python preludes and compares against the WebView. Proves the five runtimes agree.
2. **Per engine** — `ScriptRuntimeTests.cpp` §37 pins the labels through the real engines, because
   a panel that reads `E♭m` in the editor and `D♯m` in the export is the failure mode.
3. **Against the components themselves** — `scriptMusic.test.js` imports `useFlats`,
   `stackedChord`, `degreeChord`, `chordQuality`, `romanNumeral`, `scalePitchClasses`, `inScale`,
   `leadVoicing`, `orderNotes` and `expandOctaves` and asserts the verbs equal **them**, over every
   scale × every key × every degree × both chord sizes. Layers 1 and 2 prove the runtimes agree
   with each other; only this one proves they agree with the *panel*. Five runtimes can be
   consistently wrong together, and against a spelling table that is precisely what would happen.

### What is deliberately still absent

- **Note↔Hz, tuning, cents, temperament, microtuning.** There is no audio in the program. These
  are the shape this module would take in one that made sound.
- **Chord *inversion* as a verb.** `lead` picks an inversion for a musical reason. "Give me the
  second inversion" is a rotation a script can write in a line, and Q10 says the module does not
  own it.
- **Chord progressions, cadence detection, key detection from played notes.** Not something any
  component computes, so there is no panel answer to agree with — and inventing one here would put
  a second opinion in the module rather than the panel's.
- **The Chord Pad's `voicing` (close/spread/drop2) and the wheel geometry.** Component behaviour
  reached through `ce.components.chordPad`, not pitch arithmetic.

---

## 38. `ce.time` and the grid — the clock the panel runs on, and the one scripts did not have

`ce.time` was nine members: four timers, three transport reads, two conversions. Between them they
answer *where is the transport now* and *how long is a beat*. Neither of those is what a script
driving a sequence actually needs to know.

`utils/transportLayout.js` is the master clock — every synced component in the app runs on it, and
**none of its four hundred lines were reachable**. Meanwhile the Properties panel lets you set
`division`, `swing`, `loopStartBar`, `loopLengthBars` and `countInBars` on a Transport, and
`division` and `swing` on the Arpeggiator, the Phrase and the Turing. A script could **set** every
one of those and **use** none of them:

```lua
set("arp.division", "1/8T")      -- worked from the start
-- and turning "1/8T" into a third of a beat did not exist
```

That is the Properties-panel bar in its purest form: the property was writable, and the arithmetic
that gives it meaning belonged to the component.

### The gap that was not a gap in the panel at all

There was **no clock**. Not a limited one — none.

```cpp
LuaScriptEngine() { lua.open_libraries (sol::lib::base, sol::lib::math, sol::lib::string, sol::lib::table); }
```

No `os`. A Lua script could not read the time, full stop. QuickJS has `Date` and Python has `time`,
and the two disagree about epoch *and* unit, so a cross-runtime script could not measure an elapsed
interval either. Q10 says never duplicate the language's own maths — but "use the language's own"
was never available here, exactly as it was not for `wrap` and `%`.

`ce.time.now()` is a monotonic millisecond reading with an arbitrary origin. Not a wall clock and
not a date, deliberately: a wall clock jumps when the machine syncs its time, and a script measuring
an interval across that jump measures the jump. It is the one member with a *real* default on
`ScriptHost` rather than a void one — `juce::Time::getMillisecondCounterHiRes()` is platform code,
not app state, so no host has to implement anything.

### The thirteen

| namespaced | flat | what it answers |
|---|---|---|
| `ce.time.now()` | `nowMs` | monotonic ms — differences only |
| `ce.time.division(name)` | `beatsPerDivision` | `"1/8T"` → ⅓ of a beat |
| `ce.time.divisions()` | `divisionNames` | all fourteen: id, label, beats |
| `ce.time.position(beats [, perBar])` | `barBeatAt` | `{ bar, beat, tick, text }` at *any* position |
| `ce.time.step(beats, division)` | `stepAt` | which step of the grid |
| `ce.time.steps(from, to, div [, max])` | `stepsBetween` | `{ steps, dropped }` |
| `ce.time.swing(step, amount, div)` | `swingOffset` | the panel's shuffle, in beats |
| `ce.time.cycle(beats, bars [, perBar])` | `cycleAt` | `{ phase, count, length }` |
| `ce.time.looped(beats, start, length)` | `loopedBeats` | `{ beats, pass }` |
| `ce.time.tap(times [, resetMs])` | `tapTempo` | BPM from taps |
| `ce.time.clockTempo(intervalsMs)` | `clockTempo` | BPM from clock gaps |
| `ce.time.afterBeats(beats, fn)` | `afterBeats` | the musical one-shot |
| `ce.time.timers()` | `runningTimers` | what is running, by name |

The flat aliases follow §1 all over again. `now`, `step`, `steps`, `swing`, `position`, `division`,
`cycle`, `looped` and `tap` are precisely the words a panel author reaches for, so as bare globals
they are `nowMs`, `stepAt`, `stepsBetween`, `swingOffset`, `barBeatAt`, `beatsPerDivision`,
`cycleAt`, `loopedBeats` and `tapTempo`.

**`steps` is the one worth reading the source for.** It is the transport's `crossedSteps` — the
never-lose-an-event rule every synced follower runs on. A stalled frame must *fire* the steps it
slept through rather than drop them: that is the difference between a stutter and a hole in the bar.
It is capped, so returning from a backgrounded window does not dump three hundred notes at once; the
cap keeps the **most recent** steps, because catching up to now matters more than replaying where
you were; and what was dropped is **reported** rather than swallowed, so a script can say it
happened. Every script driving its own sequence was writing a worse version of this.

**`looped` is a function, not a counter.** The folded position is derived from the un-looped one, so
a loop that has been running for an hour is still exactly on the bar line, and `pass` changing is
how you see a wrap — there is no wrap handler that can be missed by a long frame. Before the loop
start the position is untouched, so you can run *in* to a loop from earlier in the song, which is
what every DAW does and what a count-in needs.

**`division` is the one place a verb deliberately disagrees with the component.** `beatsPerStep`
falls back to 1/16 for a name it does not know, because a component with a bad property still has to
keep running. A script has no such obligation, and a sequencer silently running at a sixteenth
because the division was mistyped is worse than one that stops. It returns nothing, and the test
pins both halves of that difference.

### The behaviour change: `syncTimer` follows the tempo

This is a change to a shipped verb, so it is stated plainly rather than buried.

`syncTimer("step", 0.25)` computed its interval **once**. Armed at 120 BPM it stayed a 500ms timer
at 60 BPM — which is not a sixteenth of anything. The doc said so and told you to re-arm from
`onTransport`, and that was an apology, not a design: a verb called *sync* that silently desyncs is
the wrong default, and nobody deliberately relies on a sixteenth that stops being a sixteenth.

It now follows. `{ follow = false }` freezes the interval for anyone who wants the old behaviour, and
`startTimer(id, ms)` over a sync timer stops the following — asking for milliseconds is not asking
for beats. Re-arming **resets the timer's phase**: a tempo change costs one hiccup, which is said
out loud rather than hidden, and beats a timer permanently at the wrong rate.

The re-arm rides its own subscription rather than the live event dispatch, and deliberately: the
timer is already running, and it should stay in time whether or not the editor's Live toggle is on
and whether or not any script is listening. It fires on a tempo *change*, not on every transport
publish — the store ticks at ~30Hz, and re-arming that often is a timer that never reaches its
period. Both halves are pinned by recording the intervals the runtime actually arms.

`afterBeats` closes the other half of the same asymmetry: `startTimer` had `syncTimer` and the
one-shot had nothing, so "play this in half a bar" meant working the milliseconds out by hand. A
one-shot fires once, so it does not follow — the delay is computed when you call it.

### One sharp edge, pinned rather than papered over

`tap()` discards timestamps that are not `> 0`, because the transport's own filter treats 0 as "no
reading". `now()` is monotonic from an arbitrary origin, and in the WebView that origin is close to
zero — so the very first tap of a session can be dropped. It costs one tap; changing the filter
would change the Transport component's behaviour too, which is a worse trade. The test says so.

### Where the table comes from

`DIVISIONS`, `DIVISION_LABELS`, `PPQN` and the tempo bounds moved into `scripting/timeTables.js` —
re-exported from `transportLayout.js`, never restated — and are **generated** into all three C++
preludes beside the music tables. Same rule as phase 7: fourteen fractions across four runtimes is
fifty-six chances to mistype one, and a mistyped division is silent. Nothing fails to load; a
sequencer just runs at the wrong rate, in one runtime, for one division.

The generated block sits *inside* each prelude's `ce.music` region, so it now restores the cost
marker on the way out — without that trailing `@module ce.music` line, every verb written after the
block was billed to `ce.time`. The dependency test caught it immediately, which is what that test is
for.

### How it is tested

The same three layers as §37, and the third is again the one that matters:

1. **Cross-runtime** — `scriptPreludeAgreement.test.js` runs ~70 new fixtures through the Lua, JS
   and Python preludes and compares against the WebView.
2. **Per engine** — `ScriptRuntimeTests.cpp` §38 drives the verbs through the real engines.
3. **Against the transport itself** — `scriptTime.test.js` imports `beatsPerStep`, `barBeat`,
   `formatBarBeat`, `stepAtBeat`, `crossedSteps`, `swungBeatOffset`, `cyclePhaseAt`, `cycleCountAt`,
   `cycleBeats`, `loopedBeats`, `loopCycleIndex`, `tapTempo` and `estimateTempoFromPulses`, and
   asserts the verbs equal **them** over every division, several time signatures and several hundred
   positions each. Layers 1 and 2 prove the runtimes agree with each other; four runtimes can be
   consistently wrong together, and a script stepping at a different third of a beat from the
   Arpeggiator beside it is exactly what that would look like.

The WebView does not transliterate at all — it **calls** `transportLayout.js`. That is why the
wrappers are thin to the point of looking lazy: coercing an argument before handing it over would be
a second opinion about what a missing `beatsPerBar` means, and the preludes mirror the transport's
own `num`/`clampNum` for the same reason.

### What is deliberately still absent

- **Starting or stopping the transport.** A panel does not own the DAW's playhead, and a script that
  could start it would be fighting whatever else is driving the panel. Unchanged policy since §2.
- **`songPositionBytes` / `clockPulsesBetween` / `transportEvent`.** `ce.midi` already has
  `sendClock`, `sendTransport` and `sendSongPosition`; classifying an inbound realtime byte is a
  four-line `if` on a byte a script already has.
- **`parseHostPosition` / `hostJumped` / `estimateTempoFromPulses`'s caller.** Clock plumbing the
  runtime owns. `clockTempo` is in because a script filtering 0xF8 with `interceptIn` holds the gaps
  and could not turn them into a BPM; deciding whether the host *jumped* is not a panel's question.
- **Count-in formatting, loop-range labels, transport geometry.** Component presentation, reached
  through `ce.components.transport`.
- **A `snap(beats, division)` verb.** `snap(beats, ce.time.division("1/16"))` is one line, and Q10
  says the module does not own it once the division is convertible.

---

## 39. `ce.anim` — a value that moves, and everything "moves from A to B" leaves out

`ce.anim` was four members: `to`, `spring`, `stop`, `running`. The engine was already the right
shape — the position is a pure function of elapsed time, evaluated identically in C++ and the
WebView, so a sweep never drifts between the editor and the export. What was thin was everything
around it.

This is the first module where the gap was mostly in the **options**, not the verb count. It is also
the first where the Properties panel could say things a script could not.

### The Properties panel was ahead in three places

The `Animations` section stores this per animation:

```js
{ trigger: {type, from, to, source},
  targets: [{path, properties}],     // several paths, one declaration
  duration, delay,                   // a delay
  easing: 'outCubic' }               // its own easing vocabulary
```

Several targets, a delay, and five named easings. A script had one path, no delay, and four
differently-named curves.

### The bug: the panel's easing names were silently linear

```
ease(0.5, "outCubic")  = 0.5      ← the name the Properties panel offers, three feet away
ease(0.5, "outQuad")   = 0.5
ease(0.5, "typo")      = 0.5
```

`animationEase` knew `linear|exp|log|s` and fell through to linear for everything else. So an author
who set `outCubic` in the Animations section and wrote `curve = "outCubic"` in the script beside it
got a straight line, in every runtime, with nothing said.

**Adopting the names was not the fix.** The panel stores its easings as CSS **cubic-bezier control
points** — a CSS transition needs no evaluator, so there is no numeric easing function anywhere in
the app. Defining `outQuad` as `1 - (1-t)²` would have been a *second curve wearing the same name*:

```
outQuad at t=0.5:   1-(1-t)²  = 0.75
                    the panel  = 0.7713235622464706
inQuad  at t=0.5:   t²        = 0.25
                    the panel  = 0.25599323438193494
```

Close enough to look right, far enough to be a different motion, and nothing to tell the author
which one they were getting. So the control points are re-exported from `interactionRuntime.js`,
generated into the preludes *and into ScriptRuntime.cpp*, and every runtime runs the same
Newton-Raphson-then-bisection bezier solver with **fixed** iteration counts — a loop that stops "when
it has converged" stops after a different number of steps the moment one runtime rounds differently.

The two vocabularies are deliberately **not** merged. `exp` is t², `inQuad` is a bezier that looks
like t²; calling them one thing would be a claim about the numbers that is not true. An unknown name
now reports and animates linear, the way `ce.math.curve()` has since §30.

### Seven new members: 4 → 11

| namespaced | flat | what |
|---|---|---|
| `ce.anim.envelope(path, points [, opts])` | `animateEnvelope` | drive a value **through a shape** |
| `ce.anim.value(path)` | `animateValue` | where it is, how far, how long left |
| `ce.anim.list()` | `animateList` | everything running |
| `ce.anim.pause(path)` | `animatePause` | hold without ending |
| `ce.anim.resume(path)` | `animateResume` | carry on, not restart |
| `ce.anim.reverse(path)` | `animateReverse` | turn around at the same rate |
| `ce.anim.finish(path)` | `animateFinish` | land on the target and complete |

**`envelope` is the one I left out of the first pass and should not have.** `to` and `spring` both
have one destination; an ADSR goes *up before it comes down*, and it is the single most obvious
thing a synth panel animates. The points are the Envelope component's own — `{ x, y, curve }` in
0..1 — and the lookup is `ce.math.map`, which **is** `envValueAt`.

**The four verbs `stop` is not.** `stop` cancels: it leaves the value stranded and reports
`completed = false`. That is right for a cancel and wrong for holding (`pause`), for resuming
(`resume`), for turning around (`reverse`) and for "skip the animation, apply it now" (`finish`).
Four different intentions were all being spelled with the one destructive verb.

`reverse` travels back at the **same rate**: a move that was 80% done takes 80% of its duration to
get home. `animateTo(path, from)` would restart at the full duration — an almost-finished move
taking as long coming back as the whole journey took, which reads as a bounce rather than a snap
back.

### Eight new options

`curve` (the panel's five, as the real beziers) · `delay` · `beats` · `sync` · `path` as a list ·
`stagger` · `done` · `repeat`/`pingpong`

**`sync` is stronger than `beats`.** `beats` gives the duration a musical length, once. `sync`
derives the *position* from the transport's beat count, so the animation freezes when the transport
stops and stretches when the tempo drops — which is what every synced component in the panel does
and no script could ask for. `value()` returns nil `elapsed`/`remaining` for a synced animation,
because how long it has left depends on a tempo nobody has played yet.

**`done` is told whether it finished.** "Animate, then do X" used to mean `after(duration, fn)` and
hoping the numbers matched — wrong if the animation was replaced or stopped early. `done` fires with
`completed = true` on a natural end or `finish()`, and `false` on `stop()` or on being replaced. With
a list of paths it fires **once**, when the last one lands: "when the sweep is over" means once, not
six times.

The callback is a function the script owns, so the host cannot call it. `ScriptRuntime` emits
`__animDone` and each prelude routes it to the function it stored — exactly how `after()`'s one-shot
already works, and the reason `done` can be a plain argument in every language.

### The compromise, stated rather than hidden

An envelope's shape is **sampled** to 1024 points when the animation starts, and read linearly
between them. The alternative was implementing `map()`'s per-point curves — and therefore `shape()`
and its tension family — a **fifth** time, in `ScriptRuntime.cpp`, because that is where the engine
runs with the panel shut.

The cost is real and worth naming: at a sharp corner the sampled peak can sit about a thousandth
below the drawn one. It is far finer than the rate the value is written at, and — the property that
actually matters — it is the *same* sampling in every runtime, so the four agree exactly with each
other while approximating the drawn shape identically.

### How it is tested

The layers are different here, because **`ce.anim`'s engine is not in the preludes**. It lives in
`ScriptRuntime.cpp` and in the WebView runtime; the preludes only forward. So:

1. `scriptPreludeAgreement.test.js` **cannot** see this module, and no fixtures were added there.
2. `ScriptRuntimeTests.cpp` §39 runs the fixtures on the C++ side — including the four bezier values
   above, digit for digit.
3. `scriptAnim.test.js` runs the same fixtures on the WebView side, and pins the thing neither of
   the others can: that `EASING_BEZIERS` **is** the component table, imported, not a copy — and that
   `outQuad` is *not* 0.75 and `inQuad` is *not* 0.25.

### What is deliberately still absent

- **`lfo(path, opts)`** — `repeat` + `pingpong` + `curve` already is a continuous modulator. A second
  verb meaning the same thing makes the module less coherent, not more.
- **`by(path, delta)` and `chain(...)`** — one line each over `to` and `done`.
- **`speed`** — `duration / n`.
- **`ifRunning: "ignore"` / `"queue"`** — `if not running() then` and `done`, respectively.
- **`curve` accepting a point list** — dropped on purpose after `envelope` landed. A point list now
  has exactly one meaning: it *is* the value's shape. Two ways to use one table is the incoherence
  that ruled out `lfo`.
- **Colour animation** — the Animations section does not do it either; it drives transform, opacity
  and size as CSS transitions. There is nothing to reach parity with.
- **Triggers** (`stateChange` / `valueChange`) — `ce.core.watch` plus `to`, already composable.

---

## 40. `ce.ui` — addressing what you said, and asking a question that is not a button

`ce.ui` was three members: `notify`, `status`, `dialog`. The three **lifetimes** were right from the
start and are unchanged — a notification is an event and expires, a status is a state and persists,
a dialog is a question and waits for an answer. Collapsing any two would give you a state that
vanishes, an event that never does, or a question nobody can answer.

What was missing was everything about **addressing** them, and what **kind** of question you can ask.

### The bar here is not the Properties panel

For every module so far the comparison has been "what can a stored property express that a script
cannot". That question does not apply here: the Properties panel is a *design-time* surface and has
no run-time messaging at all.

The bar is what **the app itself** does to talk to whoever is using it:

| the app does this | where |
|---|---|
| asks for a line of **text** | `NotepadEditor` reaches for the browser's `prompt()` to rename a note |
| offers a **list** to pick from | listboxes throughout the editor |
| **dismisses** a message | `ScriptNotifications` — every toast is a button that clears itself |
| **copies to the clipboard** | six places: `ColorSettings`, `ConsolePanel`, `ParameterBrowserTab`, `CustomPackageLibrary`, `DebugPanel` |

A script could do none of those. It could put a message on screen and never take it back; it could
ask "OK or Cancel" and nothing else.

Two smaller things were being computed and then thrown away. `notify()` builds an id and the runtime
discarded it, returning `true` — so a message could not be named, and therefore could not be
replaced or dismissed. And `dialogOpen()` existed in the store, unexposed: `dialog()` returning
`false` meant either *"there is nobody to ask"* or *"one is already open"*, which want opposite
handling and looked identical.

### Six new members: 3 → 9

| namespaced | flat | what |
|---|---|---|
| `ce.ui.prompt(opts, fn)` | `uiPrompt` | ask for **text** |
| `ce.ui.choose(opts, fn)` | `uiChoose` | pick from a **list**, optionally several |
| `ce.ui.dismiss([id])` | `uiDismiss` | take a message back; no id clears all |
| `ce.ui.update(id, msg [, opts])` | `uiUpdate` | replace a live message **in place** |
| `ce.ui.state()` | `uiState` | `{ status, statusKind, notifications, dialog }` |
| `ce.ui.copy(text)` | `uiCopy` | put text on the clipboard |

**`prompt` and `choose` are `dialog` with a different SHAPE of question, not two more modals.** The
store grew an `ask` field — `"choice" | "text" | "list"` — and the shape decides what the answer
*is*: a button label, a string, or a selection. One dialog open at a time whatever it is asking, one
callback contract, one teardown. Three separate verbs' worth of machinery would have been three
chances for a question to be left unanswered.

A text or list question gets a fixed accept/cancel pair rather than the caller's `buttons`, because
"how do I say yes" is not part of the question being asked — and it keeps Escape and the backdrop
meaning the same thing in all three shapes. **A cancel answers with nothing, not with `""` or
`[]`**: an empty string is something somebody might mean, and *"I did not answer"* is not one of the
things it means.

**`update` is what makes progress possible.** Dismissing and re-notifying flickers and drops the
message to the bottom of the stack every time, so in practice people stack ten toasts instead.
`notify(msg, { duration = 0 })` gives you a message that stays; `update(id, …)` replaces its text
where it sits; and `update` returning **false** is how a script learns the message was dismissed by
hand and it should stop updating one.

**`copy` says ATTEMPTED, not landed.** The write is asynchronous and a browser will decline it
without a user gesture behind it, so the return is honest about what it knows and a refusal is
reported to the console — the same rule `ce.device.write` follows. There is deliberately **no**
matching read: a script silently helping itself to whatever somebody last copied is not a panel's
business.

### Two changes to existing verbs

- **`notify()` returns its id** instead of `true`. Nothing else here is addressable without it.
- **`status(message, { kind })`** joins `notify`'s vocabulary, and `StatusBar` renders it. A state
  can be a warning, and "Device not responding" in the same grey as "Ready" is a warning nobody
  sees. The store's status went from a bare string to `{ message, kind }`; `state()` reads it back,
  which it could not before at all.

### One name that had to give way

`state` is already a flat member — `ce.storage.state`, and it was there first. Two modules cannot
own the bare word, so ce.ui's read is `uiState` and the namespaced spelling `ce.ui.state()` carries
the nice name. `prompt` and `copy` are §1 collisions of the ordinary kind: exactly the words a panel
author reaches for.

### How it is tested

There is no cross-runtime layer here, and that is not a gap. Every one of these is a person-facing
affordance, so every one is `RUNTIME_WEBVIEW` — the C++ engines carry the generated explaining
stubs, and `panelApiParity.test.js` is what checks they exist and say why. `scriptUi.test.js` drives
the verbs against the real store and the real dialog lifecycle, including the two failure modes that
matter most: a question that is refused must have **already** answered its callback, and teardown
must settle an open question rather than drop it. A callback that never runs is the one thing this
API cannot afford.

### What is deliberately still absent

- **`confirm(message, fn)`** — sugar over `dialog` with two buttons.
- **A `progress` or `busy` verb** — `notify` with `duration = 0` plus `update` *is* progress. A
  second way to say it is the incoherence that ruled out `ce.anim.lfo`.
- **Reading the clipboard** — see above.
- **Opening a URL** — a panel that can navigate somebody's browser is not a panel.
- **The editor's own chrome** (menus, the shortcuts overlay, the insight panels) — a panel script
  drives the panel, not the application around it.
- **A message attached to a CONTROL** rather than to the window. There is no per-control run-time
  message in the app to reach parity with; when there is one, this is the sweep that finds it.

---

## 41. `ce.draw` and the colour gap — the style the panel draws with

`ce.draw` was ten members and an SVG overlay. The shapes were fine. What was thin was the **style**:
`fill` and `stroke` took a flat colour and a width, and that was the entire vocabulary.

### The comparison, again, is what the app draws

| the app does this | where |
|---|---|
| **gradients** | `gradientCoords()` — whose own doc comment says *"intended for use with SVG `gradientUnits="userSpaceOnUse"`"*, i.e. it was written for this exact renderer and had never been called from it |
| **dashed strokes** | `TransportRenderer` (beat marks, `3 3`), `ConstellationRenderer` (probe link, `2 3`), `CanvasControl` (text outlines) |
| **opacity** | both renderers above, alongside their dashes |
| a **5×7 pixel font** | `pixelFont.js` — `glyphRows`, `ICON_GLYPHS`, what every LCD component prints with |
| **lighten / darken / hex↔rgb↔hsl** | `colorHelpers.js`, `colorMath.js` |

### The finding that was not in `ce.draw` at all

§36 swept `utils/*Layout.js` for pure functions a script could not reach, found `euclid`, and
concluded `ce.math` was complete.

`colorMath.js` and `colorHelpers.js` **do not match that glob.** The sweep had a blind spot exactly
the shape of its own search pattern — which is the failure mode of any sweep, and is why the answer
to "is this module complete?" is never better than the question that was asked.

Colour arithmetic is pure, cross-runtime, and useful with the window shut —
`set("knob.Background.color", darken(c))` runs in the exported plugin — so it belongs in `ce.math`,
not in the drawing module. Eight members, `RUNTIME_ANY`, in all four runtimes:

`lighten` · `darken` · `mix` · `alpha` · `rgb` · `hex` · `hsl` · `fromHsl`

**One input form, and a trap worth naming.** Every verb accepts `"RRGGBB"`, `"AARRGGBB"` or
`"#RRGGBB"` — the app's own parser reads the last six characters, so a stored colour goes straight
in — and returns `"#RRGGBB"`, which CSS, SVG and a panel property all accept. The app **stores**
colours as `AARRGGBB` (JUCE's order: `"66FFFFFF"` is a 40%-opaque white in every panel document)
while CSS wants `#RRGGBBAA` — *the same four bytes the other way round*. So exactly one verb,
`alpha`, returns the panel's form, and making a **drawing** translucent is `ce.draw.opacity()`. Two
questions, two answers, no ambiguity about which byte is which.

`mix` is the one thing here that is **not** an app algorithm, and the doc says so rather than
implying otherwise: it is `lerp()` per channel in plain RGB, which is the blend a meter fading from
green to red actually wants.

### `ce.draw` — six new members (10 → 16) and three new stroke options

| namespaced | what |
|---|---|
| `ce.draw.gradient(stops [, angle])` | a gradient as a fill or a stroke |
| `ce.draw.opacity(a)` | how opaque what follows is |
| `ce.draw.transform(opts)` | rotate / move / scale what follows |
| `ce.draw.ellipse(cx, cy, rx, ry)` | `circle` only does round |
| `ce.draw.pixelText(text, x, y [, scale])` | the app's own LCD font |
| `ce.draw.measure(text [, opts])` | how wide a string will be |

`stroke(colour, width, opts)` gained `dash`, `cap` and `join` — `path` used to hardcode round on
both and now takes yours.

**`gradient` uses the panel's angle convention and the panel's geometry.** 0 up, 90 right, the same
as the Background section's gradients, resolved by `gradientCoords()`. A gradient built in a script
and a gradient set in the Properties panel run the same way, which two conventions would not. Stops
take either shape — a list of colours ("space these evenly") or `{ at, colour, opacity }` — and
mixing them positions some and lets the rest fall where they may. Fewer than two usable stops
returns nothing, because a gradient between one colour and nothing is a colour.

**`transform` is why a knob pointer stops being trigonometry.** Rotating a shape about a centre
meant computing every corner with sin and cos, and getting the centre wrong is the classic way a
pointer ends up orbiting the wrong point.

**`pixelText` is drawn literally**, one square per lit pixel, because it *is* a bitmap font and
rendering it smoothly would stop it being the font the LCD components print. Its `(x, y)` is the
top-left rather than a baseline: a grid font has no baseline to speak of.

**`measure` is honest about which of its two answers is exact.** The pixel font is a grid, so its
width is arithmetic and exact everywhere. A proportional font has to be *measured*, which needs a
canvas — so with no surface to measure on it falls back to an estimate and **says so** in the
result, rather than handing back a guess dressed as a measurement.

Every new style field is cleared by the per-pass reset alongside `fill` and `stroke`. A dash or a
transform left set by the last pass is exactly the "a drawing depends on what ran before it"
dependency the reset exists to prevent, and the test asserts all five together rather than the two
it started with.

### How it is tested

`ce.math`'s colour is cross-runtime, so it goes through the usual three layers — 25 new fixtures in
`scriptPreludeAgreement.test.js` (hex formatting is where four runtimes drift silently: a missing
zero-pad, a rounding that goes the other way at `.5`, a case that differs), and `scriptMath.test.js`
asserts `lighten`/`darken`/the conversions against **the app's own functions**, imported, over a
sampled sweep of the whole RGB cube.

`ce.draw` is panel-view only, so there is no cross-runtime layer — but there **is** a renderer, and
that is where the interesting assertions are. `scriptDraw.test.js` server-renders the overlay and
checks the emitted SVG: that a gradient's `x1`/`x2` are `gradientCoords()`'s own numbers, that
`gradientUnits="userSpaceOnUse"` is what makes it paint on a zero-area path, and that the number of
squares `pixelText` emits **is** the number of lit pixels in the app's glyph. A different font, or a
different packing, gives a different count.

### What is deliberately still absent

- **Bezier segments in `path`.** The app's own envelope renderer *samples* its curves into a
  polyline (`envSegmentSample`, 16 steps a segment), so a polyline **is** parity — and
  `ce.math.map` plus points gets a script exactly there.
- **`drawImage`.** Image sources are document properties (`Background.Fill.imageSrc`) reached with
  `set()`. A script inventing its own asset references is a different feature with a different
  question behind it.
- **Rounded-corner polygons** (`cornerPaths.js`) and **border segments** — component chrome, not
  drawing primitives.
- **Radial gradients.** The app's gradients are linear; there is nothing to reach parity with.
- **Hit-testing a drawn shape.** A drawing is decoration and the overlay is `pointer-events: none`
  on purpose; a script that wants a click uses a control that reports one.

---

## 42. `ce.panel` — building a panel was possible, arranging one was not

`ce.panel` was fifteen members: create, clone, destroy, parent, find, info, types, the five
collection verbs, snapshot, restore and each. Building a control and inspecting it were covered.

**Arranging controls was not covered at all.**

### Twenty-seven operations, none of them reachable

`stores/alignment.js`:

```
alignLeft / HCenter / Right / Top / VCenter / Bottom            6
distributeLeftEdges / HCenters / RightEdges / TopEdges /
  VCenters / BottomEdges                                        6
distributeHSpacing / distributeVSpacing                         2
bringToFront / bringForward / sendBackward / sendToBack         4
matchWidth / matchHeight / matchBoth                            3
snapSelectionToGrid / snapSelectionToGuides                     2
flipHorizontal / flipVertical                                   2
tidyGrid(columns, gapX, gapY) / arrangeCircular(radius, angle)  2
```

Every one is on the canvas context menu. A script that built sixteen pads computed every coordinate
by hand — and got `tidyGrid`'s reading-order sort, or `arrangeCircular`'s centring on the bounding
box, subtly different from the menu item sitting next to it.

They were all written against the editor's **selection**, which is not a thing a script should
touch. So the maths moved out of the selection plumbing into pure functions — transforms in panel
space go in, a `{ id: patch }` map comes out, nothing reads a store — the existing exports became
thin wrappers over them, and the script verbs call the same functions with transforms built from
**names**.

### Nine new members: 15 → 24

| namespaced | what |
|---|---|
| `ce.panel.align(names, edge [, opts])` | the six aligns |
| `ce.panel.distribute(names, what [, opts])` | the eight distributes |
| `ce.panel.match(names, what [, opts])` | width / height / both |
| `ce.panel.order(names, where)` | front / forward / backward / back |
| `ce.panel.grid(names [, opts])` | `tidyGrid` |
| `ce.panel.circle(names [, opts])` | `arrangeCircular` |
| `ce.panel.flip(names, axis)` | mirror positions about the group centre |
| `ce.panel.rect(name)` | rect in **panel** coordinates; bounds of a set |
| `ce.panel.batch(fn)` | one undo step for a whole build |

Six collapsed verbs rather than twenty-seven members. `align(names, "left")` beats `alignLeft(names)`,
and it is the shape `ce.time.division` and `ce.music.degreeChord` already use.

### Panel coordinates are the whole trick

`Transform.x` inside a container is **container-relative**. Aligning two controls in different
containers by their local `x` aligns nothing. So transforms are gathered with the container offset
applied (`controlPanelOffset`, which the editor's own alignment uses for exactly this) and written
back through it.

That is also what `ce.panel.rect` is for on its own. "Draw a line between these two controls", "is
this one above that one", "how big is this group" — none of them had an answer, because the only
readable geometry was in whatever frame the control happened to sit in.

### Distinctions worth keeping

- **Distribute leaves the ends where they are.** That is what makes it *distribute* rather than *lay
  out in a row*, and it is why there are two families: `leftEdges`/`hCenters`/… even out the
  **positions**, while `hSpacing`/`vSpacing` even out the **gaps**. With differently-sized controls
  those are different pictures, and the app offers both because both are wanted.
- **`grid` sorts in reading order** — rows quantised to 20px, then left to right — not document
  order. "Tidy" should match what the eye already sees.
- **`flip` moves controls; it does not mirror them.** "Flip the layout" and "flip the artwork" are
  different requests, and flipping twice is exactly the identity, which the test pins.
- **`order` rewrites the sibling list**, because z-order is document order rather than a property —
  precisely why `set()` could never do it. Later paints later, so *front* is the end of the list.
  Controls reorder within their own parent; bringing something to the front of a container it is
  not in is not a thing.

### `batch` is the one that is not a port

The history store debounces its snapshots, which groups a drag nicely and leaves a script that
creates forty controls landing as an unpredictable number of undo steps. `pushSnapshot()` flushes on
demand, so bracketing the work gives exactly one — and a script that builds a page deserves to be
undone as "build the page", not forty times.

The flush is in a `finally`: a half-built panel that cannot be undone is worse than a half-built
panel. The throw still propagates, because swallowing it would hide the reason the panel is half
built.

One related decision inside the implementation: an arrangement is **one tree rewrite**, not a
property write per control. Forty individual writes would be forty store updates, forty re-renders,
and — with the debounce running underneath — an unpredictable number of undo steps for a single
"tidy these", which is the very thing `batch` exists to fix.

### How it is tested

There is no cross-runtime layer: arranging a document is editing it, and the editor is where a
document is edited — every verb is `RUNTIME_WEBVIEW`, like `create` and `destroy` already were.

`panelArrange.test.js` asserts against **the app's own functions**, imported: `boundsOf`,
`alignPatch`, `distributePatches`, `matchPatch`, `gridPatches`, `circlePatches`, `flipPatches`. Not
"align moves things left" — that would pass against a second implementation that happened to look
similar — but that the answer *is* the canvas's, including the parts nobody would reinvent the same
way. Plus the container case end to end, because the offset is where this goes wrong silently.

### What is deliberately still absent

- **Selection.** An editor concept. A script naming controls is the right shape, and these verbs
  take names.
- **`snapSelectionToGuides`.** Guides are a store the panel author fills by dragging them onto the
  canvas. A script inventing guides is a different feature with a different question behind it.
  (`snapSelectionToGrid` is `ce.math.snap` on two numbers once `rect` can report them.)
- **Rename.** The name is the address, so renaming is a document migration rather than a layout
  operation — every script, binding and drawing target that mentions it would have to move too.
- **Undo and redo themselves.** A script that could undo the user's work is not a panel.

## 43. `ce.storage` — who a setting belongs to, and turning a structure into a string

`ce.storage` was five members: `state`, `saveSetting`, `loadSetting`, `settings`, `forget`.

Nothing here is a Properties-panel gap. There is no property anywhere that means "keep this between
sessions", so the whole module is already past that bar. The two gaps are internal, and both are the
kind that reads as working until it does not.

### Gap one: `state` said who it belonged to. Settings said nothing.

`state` was documented as private to the script. Settings were panel-wide and said **nothing at
all** — so two scripts on one panel, both saving `"count"`, were writing to the same value and
neither could tell. No error, no warning, no way to ask.

That asymmetry was never a decision; it was the absence of one. Three scopes now, an option on every
settings verb:

| scope | who sees it | where it lives |
|---|---|---|
| `"panel"` *(default)* | every script on the panel | the document — travels with it |
| `"script"` | the calling script only | the document, under a key nobody else can spell |
| `"local"` | this machine | never written into the document |

`"panel"` is the default because it is exactly what settings have always been: nothing that already
works changes meaning.

`"script"` is a **key prefix on the panel store**, not a second store. A private setting should
persist, export, travel and migrate exactly like a shared one — only its *visibility* differs — and
a second store would have been a second thing to save, load, export and migrate. The prefix is
`U+0001`, and that character is not arbitrary: `U+0000` was the obvious choice and is wrong, because
a key travels through `juce::String` in the C++ engines, which is NUL-terminated and would truncate
it. The editor and the export would then disagree about what a private key is even *called*, which
is a bug that only appears after somebody ships a panel.

`"local"` is the one a panel author will reach for without being told to: a MIDI port choice, a
window position, a "don't show this again". A panel you send somebody should not carry your port
choice with it. The editor has `localStorage`; the player writes to a `.scriptlocal` properties file
beside the application's own preferences, opened lazily on first use and keyed by panel id so two
panels in one session do not read each other's. Writes go through immediately rather than at "save
the project", because a machine-local setting has no project-save moment to ride along with and the
DAW may never close the instance politely.

Wiring that up turned up something the phase had not gone looking for: `BridgeScriptHost::Callbacks`
carried `saveSetting` and `loadSetting` and **not** `listSettings` or `forgetSetting`, so those two
had been silently inert in the exported plugin — and `all()`, `clear()` and `info()` are all built on
`listSettings`, so the whole new surface would have been dead there. Both callbacks now exist and the
player wires them.

**An unknown scope is refused, not treated as `"panel"`.** Every verb bails and logs. Falling back
is how a typo in a scope name turns a private setting into a shared one, silently, at the moment it
is written — and a fallback would make that the *quiet* path.

### Gap two: no way to turn a structure into a string

The Lua engine opens `base`, `math`, `string` and `table`. There is **no `json` module**, and no way
for a script to write one that is not a parser. JavaScript and Python each have their own, with
different names and different edge cases. So "use the language's own" — the Q10 rule — was never
available here, exactly as it was not for `ce.time.now()` in §38.

What that cost: a script could not put a patch into a SysEx payload, could not read a config
somebody typed into a text control, could not save a structure as one setting, and could not compare
two structures at all.

`encode` and `decode` live in `ce.storage` rather than `ce.core` because encoding is what you do to
**put a structure somewhere** — and the somewhere is usually a setting.

### Five new members: 5 → 10

| namespaced | what |
|---|---|
| `ce.storage.all([opts])` | every setting in a scope, as a table |
| `ce.storage.clear([opts])` | forget them all, and say how many went |
| `ce.storage.info([opts])` | `{ scope, backing, available, count, bytes }` |
| `ce.storage.encode(value [, opts])` | JSON text; `opts.indent` pretty-prints |
| `ce.storage.decode(text)` | JSON text back to a value |

`all()` is the read every other module already had — before it, seeing the settings meant
`settings()` and a loop. `info()` exists because `available` is a thing worth saying **once** rather
than discovering per key: it is the difference between "nothing saved yet" and "nothing you save
here will stick", which an empty listing cannot express.

One change to an existing verb: **`saveSetting` returns whether it stored.** It used to return
nothing, so "saved" and "there was nowhere to put it" were indistinguishable — the worst possible
answer from something whose whole job is persistence.

### The encoder is written out by hand, twice, on purpose

`json.dumps` and `JSON.stringify` do not agree, and the disagreements are all in the numbers:

| value | JavaScript | Python `repr` | C `%g` |
|---|---|---|---|
| `1.0` | `1` | `1.0` | `1` |
| `1e-5` | `0.00001` | `1e-05` | `1e-05` |
| `1e-7` | `1e-7` | `1e-07` | `1e-07` |
| `1/3` | `0.3333333333333333` | same | `0.33333333333333` at `%.14g` |
| `-0.0` | `0` | `-0.0` | `-0` |
| `"é"` | `é` | `é` | — |

Any one of those means a patch encoded in the editor does not compare equal to the same patch
encoded in the plugin. So Python's JSON section does **not** call `json.dumps` for encoding: it
formats numbers and strings itself, using the same rules the Lua encoder uses, which are
JavaScript's. Reading is still `json.loads`, because that is the strict grammar `JSON.parse` accepts
— and the grammar the hand-written Lua reader had to be written to match, down to rejecting `01`
and `1.`.

Lua carries the whole thing: a `%g` loop that finds the shortest spelling which reads back as the
same double, the notation band where C and JavaScript disagree, exponent unpadding, string escaping,
a recursive-descent reader, and UTF-8 encoding by hand because the `utf8` library is not opened
either. That is why `ce.storage` is now the second-heaviest Lua module — a cost that buys the one
thing a cross-runtime API may not get wrong.

Three decisions the four runtimes share:

- **Keys come out sorted, at every depth.** Not a style choice. A Lua table has no insertion order
  to preserve, so sorted is the only ordering all four are *able* to produce — and it is the
  ordering that makes two encodings of the same structure comparable, which is half of what encode
  is for.
- **A JSON `null` reads as nothing** — an absent member, a skipped element. A Lua table cannot hold
  one, and a value the four runtimes cannot all hold is not a value this API has. So
  `{"a":1,"b":null}` is one key everywhere and `[1,null,2]` is a two-element list everywhere, rather
  than three shapes in three engines.
- **Nothing back beats a wrong string.** A cycle, a function, text that is not JSON — all return
  nothing, which is the rule every "cannot read that" in this API already follows, and the thing
  that tells a malformed config from an empty one.

One shape genuinely does not agree, and it is written down rather than hidden: an **empty** Lua table
is an empty array and an empty object at once, so `{}` encodes as `[]` in Lua and `{}` in the other
three. The codebase already reads an empty table as the empty list everywhere else.

### How it is tested

`scriptStorage.test.js` covers the scopes against a real document — that a private key really is in
the panel store, that a panel listing hides other scripts' private keys, that clearing one scope
leaves the others, that a machine-local write **fails** rather than quietly landing in the document
when there is no local store.

The JSON half is a shared fixture list, `test/fixtures/jsonCases.js`, and this is the one place in
the suite that compares **text** rather than canonicalised values — because `encode`'s output *is* a
string a script puts somewhere. `scriptPreludeAgreement.test.js` replays every fixture through the
Lua prelude under wasmoon, the JavaScript prelude under `node:vm`, and the Python prelude under
`python3`, and demands the same characters back from all four. Including the cases a JavaScript
value cannot express — `1.0`, `NaN`, a function in a list — which are written once per language.

It also pins the private-key derivation across runtimes, because a setting saved in script scope by
the editor is only readable by the export if all four spell the key identically.

### What is deliberately still absent

- **A file API.** "Persist this" and "write a file the user can find" are different features with
  different questions behind them — sandboxing, paths, permissions — and the second one is not
  storage.
- **Watching a setting.** `watch` is `ce.core`'s and it is about control values. A setting changing
  under a running script is not a thing the host does.
- **Import and export of the whole store.** `all()` and `encode()` compose into it in one line, which
  is the better shape: the script decides what a backup means.
- **YAML, TOML, MessagePack.** JSON is the one every runtime can already read and the one the panel
  document itself is written in. A second format would need a second hand-written Lua parser.
- **Size limits and quotas.** `info().bytes` reports; enforcing a ceiling is the host's business, and
  the local store already refuses cleanly when a browser's quota is hit.

## 44. `ce.components` — twenty-nine verbs that offered values no component has, and 229 that could not be read

`ce.components` was 28 modules and 229 members: 23 families generated from the data spec in
`componentVerbs.js`, plus 5 hand-written ones (split, phrase, recorder, harmony, setlist).

Nothing here is a Properties-panel gap either — these verbs exist precisely because the inspector is
design-time and a footswitch is not. The gaps are internal, and the first one is a bug.

### Gap one: the enum values were hand-typed, and 24 of 28 were wrong

`componentVerbs.js` carried its enum values as literals beside the components. Its own comment
records that going off once:

> *"Phase 7 shipped a hand-written list that offered "pentatonic" and "chromatic" (which no component
> understands, so the verb wrote a name that silently did nothing) and omitted
> "pentatonicMaj"/"pentatonicMin" (which they do understand, so the verb refused a value that was
> perfectly valid)."*

That fix was applied to **scales and nothing else**. Reproduced live before the change:

```
arpPattern("MyArp", "converge") -> undefined   stored = "converge"   ← the Arp has no such pattern
arpPattern("MyArp", "chord")    -> undefined   stored = "converge"   ← the Arp DOES have this one
```

| verb | accepted, component ignores | refused, component accepts |
|---|---|---|
| `arp.pattern` | converge, diverge | **chord** |
| `arp.division`, `turing.division` | — | **1/2D 1/4D 1/8D 1/16D 1/2T 1/4T** |
| `arp.chordType`, `chordpad.chordType` | ninth, sus2, sus4, power | — |
| `chordpad.mode` | scale | — |
| `chordpad.voicing` | open, drop3 | — |
| `noteribbon.mode` | bend | **chromatic** |
| `drumpads.mode` | gate | **oneShot** |
| `constellation.mode` | nearest | — |
| `constraint.mode` | max, ordered | **order, ratio, mirror** |
| `crossfader.law` | transition | — |
| `envelope.preset` | asr, dadsr, custom | **dahdsr, mseg, free** |
| `envelope.pointCurve`, `macro.slotCurve` | s | **scurve** |
| `ribbon.returnMode` | zero, value | **min, max, rest** |
| `router.source` | control, pitchbend | **polyAftertouch, breath, expression, foot, link** |
| `router.poly` | lowest, average | — |
| `panic.scope` | panel | — |
| `transport.source` | midi, tap | **external** |
| `lcd.scroll` | auto | — |
| `pixel.anim` | sprite, image | **file** |
| `joystick.returnAxes` | none | — |

The divisions row is a direct internal contradiction: **`ce.time.divisions()` already answered from
the transport's real fourteen** — same panel, same script — while `ce.components.arp.division`
offered a hand-typed eight.

`transport.beatUnit` was wrong in a different way: an enum of six where the transport clamps *any*
integer 1..32, so a script could not write 3/4's 3 or 12/8's 12. It is an `int` now.

And the five hand-written families' **documentation** lied where their reducers did not:
`harmonyOutOfKey` was described as `"skip"/"nearest"/"pass"` where the engine has
`pass/nearest/mute`, so an author following the contract wrote `"skip"` and got nothing. Four more
like it. Those summaries now interpolate the table.

**Nothing failed, because no test asserted the values.** `componentTables.js` now imports the table
each component's own switch reads, `componentVerbs.js` spells no value at all, an enum verb with no
table entry throws at import, and `componentEnums.test.js` asserts the binding **by identity** — a
copy would drift the same way. The LCD and Pixel display have no util module to import from, so
their two tables are pinned against the `<select>` the editor renders, read out of the `.svelte`
source: derived by test where it cannot be derived by import.

### Gap two: every one of the 229 was a write, and returned nothing

`orbitNode("MyOrbit", 99, false)` returned `undefined` — identical to success. So did an unknown
enum, a control of the wrong type, and a value that was already correct.

A verb now returns **whether the component holds what was asked**. Three outcomes, and the middle
one is why a boolean is not enough on its own:

| | returns | console |
|---|---|---|
| written | `true` | what changed |
| already that way | `true` | "already that way" |
| refused | `false` | at **error** level, with the values it does accept |

"Already that way" *must* be true, or `if not arp.pattern(a, choice) then warn() end` fires because
the arp was already on that pattern. Telling it from a refusal took two different mechanisms,
because the two halves of the module differ: the generated reducer compares against the current
value, so the spec answers `componentRequestLegal()`; the five hand-written reducers build a patch
from the request without consulting the current value, so an empty patch *is* a refusal — except at
the two places they were already comparing, which now return a shared `UNCHANGED` marker. No
reducer had to be rewritten to gain the distinction.

### Gap three: nothing could be read

A script could set the arpeggiator's pattern and could not ask what it was. No "next pattern", no
"if it is synced then…", and no reading anything the component *generated* — the Turing's steps, the
Recorder's take, the Matrix's amounts, the LCD's lines, the Envelope's breakpoints.

`ce.core.get("MyArp.Arp.syncToTransport")` did work. But it needs the section name and the
**internal field name** — `syncToTransport`, `euclidPulses`, `peakDecayPerSec`, `gateThreshold`,
`loopStartBar` — which is exactly the vocabulary the verbs exist to hide, and it hands back raw
0-based arrays against verbs that are 1-based.

### Gap four: the lists could be edited and not measured or grown

An `item` verb writes property X of element N. Nothing said how many elements there were, and
nothing could add or remove one. `ce.panel`'s collection verbs cover the *editor's* sections
(`States, Bindings, Animations, Parts…`), not these. So a script could not add a split zone, an
envelope breakpoint, an orbit node, a router destination, a macro slot, a constraint member or a
timbre anchor — all of which the canvas grows with a button.

### Gap five: sixteen steps were sixteen document changes

A Turing pattern was 16 calls, an 8×8 matrix 64 — each its own reducer pass and its own store write.

### Five verbs every family gets: 229 → 302

Appended once, after the families are declared, rather than written into 23 literals.

| namespaced | what |
|---|---|
| `read(target [, name [, index]])` | by **verb** name, in the verbs' units, 1-based |
| `size(target [, name])` | how many an indexed verb can address; the Matrix answers `{rows, cols}` |
| `fill(target, name, values)` | a whole list in one call, one document change |
| `insert(target, name [, index])` | the element the canvas adds, appended or before an index |
| `remove(target, name [, index])` | …and away again |

`read` is unconditional. `size`/`fill` exist iff the family has a list. `insert`/`remove` exist iff
it has an **`item`** list — a `cell` or `line` list is fixed-length and sized by a verb of its own
(the Turing's step count is `length`, the LCD's row count is the display's `rows`), so growing one
from here would fight the verb that owns it. `turingInsert` does not exist, and that is the design.

`fill` runs each element through **the same reducer one call would use**, so a value written in bulk
cannot land somewhere a single write could not — and it refuses a list longer than the component has
rather than truncating, because silently dropping half a pattern is worse than not writing it.

The five hand-written families gained a `read` too, but by **model field name** rather than verb
name: they predate the spec and have no verb→field map, and hand-typing a 47-entry one is the exact
thing the first half of this phase spent its time deleting. `read(target)` with no name is the whole
section either way, so the shape a script is most likely to want is the same across all 28.

### The element templates came out of the buttons

Seven "Add" handlers built their element inline in their own `.svelte` editor, so the template only
the canvas knew was one the export could not reproduce. Same move as §42 with `stores/alignment.js`:
they are now `utils/componentElements.js` and the editors call it. The Envelope keeps its own two in
`envelopeLayout.js`, because a new breakpoint going into the **widest gap** and the endpoints being
unremovable are shape decisions rather than a template.

One thing changed on the way out: element ids were `${prefix}${Date.now()}`, which collides when two
are added inside a millisecond — reachable from a script in a way it never was from a mouse. They
are the lowest unused number now: stable, unique, and diffable.

### Seven fields the phase-7 spec skipped

`phase` on the Arp, the Turing and the Looper — the Orbit and the Envelope already had it, so a
script could put those on the downbeat and not the arpeggiator. `arp.mutes`, which needed a **new
kind**: it is a sorted set of muted step indices, not a boolean per step, so neither `item` nor
`cell` fits it; `indexset` is generic, and a test asserts it agrees with the grid's own
`toggleMute()`. `arp.inputChannel`, `arp.baseOctave` and `arp.source` — what the arp listens to,
which is a performance choice. And `meter.valueMin`/`valueMax`/`dbFloor`/`dbCeil`: `meter.value` was
documented as being "in the meter's own units, between valueMin and valueMax" and a script could
neither set them nor read them.

Everything else the sweep found undriven is colours, `editable` and `show*` — set once in the
inspector, correctly excluded, exactly as `componentVerbs.js` says at the top.

### How it is tested

`componentEnums.test.js` is the regression: the values are the app's tables **by identity**, every
enum verb has an entry, every entry has a verb, the two editor-pinned tables match the `<select>`,
and each of the twenty-four specific values that used to be wrong is named.

`scriptComponents.test.js` is behaviour, against real controls from the app's own `createControl` —
one per family. It asserts each of the three outcomes separately, that `read` speaks the writers'
vocabulary (`sync`, and *not* `syncToTransport`), that a 1-based verb reads back the number it was
written with, that a grid reads and fills in rows, and that `insert` produces **the app's own
template** and `envelopeInsert` the envelope's own placement — imported, not copied. It ends with
the sibling of `componentVerbs.test.js`'s catch-all: every `read`/`size`/`fill`/`insert`/`remove`
driven on a real control, because a verb that silently does nothing for every input is invisible one
verb at a time.

### What is deliberately still absent

- **Component events.** No `onStep`, no `onScene`, no `onTakeFinished` — a script can drive a
  component and cannot hear from one. It is the largest thing left in this module and it is its own
  phase: `arpFireStep` in `PanelPreviewSurface.svelte` is where one would be raised, which is per
  family surface work rather than a change to the spec.
- **Colours, sizes and `show*`.** The inspector's, and the file has said so since phase 7.
- **Growing a `cell` or `line` list.** Owned by another verb; see above.
- **The Matrix's rows and columns as objects.** `size` reports the shape and `cell` addresses it;
  defining a new modulation source is a document edit, not a performance one.
- **A verb→field map for the five hand-written families.** Their `read` is by field name and says
  so. Restating 47 mappings by hand is the defect this phase opened by removing.

## 45. `ce.components` — hearing back from one

§44 made the module two-way for **values**: 302 members, every one readable, every one reporting
what it did. This is the other direction, and it was the last structural gap in it.

The event catalogue was **24 events** — 11 control (mouse, value, state), 2 panel, 3 time, 8 device
— and **not one came from a component**. A script could drive an arpeggiator and never be told it
fired a step; a setlist could change scene, a take could finish, a pad could be struck, all
invisibly. The only way to notice anything was to poll a `read()` on a timer, which is both wasteful
and late.

Three things confirmed by reading the code rather than assuming it:

- `emitClockFanout` — the one place a running component publishes anything — sends to the **device**.
  Nothing on that path reaches a script.
- `dispatchInteraction(controlId, event, payload)` was already public and already used by the
  surface, for exactly three events: `onWheel`, `onPointerMove`, `onDoubleClick`. The dispatch hook
  existed; nothing called it for a component.
- The component engines run **only** in `PanelPreviewSurface.svelte`. The C++ engines carry stubs
  and no engine, so these events are panel-view only — not a policy choice, an absence of anything
  that could raise one window-closed.

### Eleven events, grouped by what happened

Not by family. One handler serves several components and a script stays portable: `on("*", "step",
…)` is the same handler for an Arpeggiator, a Turing Machine and a Phrase Sequencer.

| event | payload | raised by |
|---|---|---|
| `onStep` | `index` (1-based), `of`, `notes` | Arp, Turing, Phrase |
| `onCycle` | `count` | Arp, Turing, Looper, Orbit, Phrase |
| `onHit` | `id`, `note`, `notes`, `velocity` | Chord Pad, Drum Pads, Note Ribbon |
| `onRelease` | `id`, `note`, `notes` | the same three |
| `onScene` | `index` (1-based), `name` | Setlist |
| `onStage` | `stage`, `previous` | Recorder, Envelope |
| `onSettled` | `value` | Ribbon, Crossfader, Vector Joystick |
| `onBounce` | `x`, `y`, `vx`, `vy` | Kinetic |
| `onRecall` | `id`, `label` | Constellation (snap mode) |
| `onZone` | `zone`, `previous`, `value` | Meter |
| `onVoiced` | `note`, `velocity`, `out`, `channel`, `zones` | Zone Splitter, Harmoniser |

`onStage` and not `onState`: `onStateChanged` is already a **control's** hover/pressed state, and
two events whose names differ by a suffix are two events somebody subscribes to the wrong one of.

Every payload carries `target`, supplied by the raiser rather than by eleven call sites, because
`on("*", …)` is a legitimate subscription and the handler has to know which arpeggiator. A test
asserts nothing bypasses the raiser.

### The four that needed new detection

Seven of the eleven hooked into a firing point that already existed — `arpFireStep`, the Turing's
index-change block, `phraseFireIndex`, `recallScene`, `setRecorderState`, `stepKinetic`'s
`bounced`, and the three glide loops, which already computed `settled` and threw it away. The other
four are new:

- **`onCycle`** — a 0..1 phase going *down*. That is the same test each ticker already makes to
  decide it has come round, so a cycle event and a loop seam cannot disagree. The synced branches
  have no phase of their own (it belongs to the transport), so there the wrap is the step index
  going backwards.
- **`onStage` for the Envelope** — the playhead's position relative to the sustain point:
  `start`, `attack`, `release`, `end`. Polled, because the phase is driven by whatever value source
  is bound to it and there is no envelope ticker to hang a transition off.
- **`onZone`** — `meterZoneIndexAt`, split out of the meter's own `meterZoneColourAt` so `onZone`
  can name the *band* rather than the paint. A test asserts the two cannot disagree.
- **`onVoiced`** — the Zone Splitter already returned `zoneIds` and `sends` from its reducer, and
  the Harmoniser its voices; nothing was listening to either. A note transposed by a zone is not
  the note that was played, and there was no way to find that out.

### Polled versus set, and why the recorder does not baseline

`raiseComponentStage` reports on change and **baselines its first sighting** — reporting "idle" on
the frame a panel opens would tell a script the recorder had just stopped, which is not what opening
a panel means. That is right for a stage that is *polled*.

The Recorder's is not polled: it is an explicit transition with a known previous state, and the
first arm has to fire. So it reports directly from `setRecorderState` — which every path into a
state change already goes through (a click, a script verb, the count-in promotion, the once-through
stop), so no caller has to remember to.

### A trap found on the way, and fixed

`on(target, event, fn)` matched the **handler name** (`onTimer`), because that is what
`dispatchEvents` carries — while the events list a script author reads names them by **id**
(`timer`). So `on("*", "timer", fn)` registered a listener that could never fire, silently, and had
done since the verb existed. It was not §45's bug; it is the bug §45 walked into while writing its
first test.

Both spellings work now, and `off()` matches the same way — a listener registered under one
spelling and removed under the other would otherwise stay live. The preludes' own
`on("*", "onTimer", …)`, which arms `after()` in all three C++ engines, is untouched and pinned by
a test.

### How it is tested

`panelApiParity.test.js` already refused a declared event with no source — that guard is what held
this phase to raising all eleven rather than declaring a catalogue and wiring the easy half.

`scriptComponentEvents.test.js` adds the level below it: **every field a summary promises is
actually supplied at every site that raises the event**. A payload documented as carrying
`hit.velocity` and never sending one would be `undefined` in every handler, and nothing would say
so. The test parses each `raiseComponent(…)` call out of the surface, walks to its matching brace,
splits on top-level commas and reads the keys — shorthand properties included, since `{ stage,
previous }` names two fields and contains no colon.

Plus: delivery to a named handler and to `on(target, …)` and `on("*", …)`; that a listener on
another control does not hear it; that all eleven can be delivered rather than the two that would
otherwise get spot-checked; and that the detection agrees with the app — the meter's own bands, the
tickers' own wrap test.

### What is deliberately still absent

- **Anything from a continuous component.** The Timbre pad, Router, Macro, Matrix and Constraint
  have no instant to report; an event for them would be one nothing could raise, which the parity
  test refuses.
- **Transport events.** Already `ce.time`'s `onBeat` / `onBar` / `onTransport`. A second spelling
  would be two ways to hear the same thing.
- **The LCD's scroll wrap and the Pixel display's animation loop.** Cosmetic — nothing downstream
  of them is a musical moment.
- **A per-note event from the Arpeggiator.** `onStep` carries the notes; one event per note would
  be up to six per step at a rate that already reaches ~27 steps/second at 1/32 and 200bpm.
- **Component events window-closed.** There is no component engine in the player to raise them.
  Giving the player one is a different phase with a much larger question behind it.
