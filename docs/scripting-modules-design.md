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
