# Panel API Spec (Milestone 1, Step 1)

The shared API that every scripting language calls. It must behave **identically** in every runtime (Tier 1: Lua 5.4 via Sol3, JavaScript via juce_javascript — one engine per language in the C++ host; see the Model 2 section below). This is the one contract bound into all runtimes — see [`scripting-redesign-plan.md`](scripting-redesign-plan.md).

Decisions are recorded here as we settle them, question by question.

---

## Q1 — Addressing model ✅ LOCKED

**Canonical address = a string dot-path**, rooted on a control's **name**: `"cutoff.value"`, `"button2.background.fill.colour"`.

**One operation, three faces (total coverage — every property reachable by every form, always; nothing is form-exclusive):**

1. **Primitive verbs (the spec):** `set(path, value)` / `get(path)`. Always work, for everything (value, colour, position, …).
   ```lua
   set("button2.background.fill.colour", "#ff0000")
   local v = get("cutoff.value")
   ```
2. **Handle (convenience, sugar over the primitive):** a handle just remembers a path prefix.
   ```lua
   local b = panel.get("button2")
   b:set("background.fill.colour", "#ff0000")
   b.value = 8000        -- sugar == set("button2.value", 8000)
   ```
3. **Dot-object (optional nicety, Lua/JS only):** `panel.button2.value = 8000` — same operation again, layered via metatables (Lua) / Proxy (JS). Not required for parity; never faked in C++.

**Rule that prevents the JUCE-style confusion:** the forms are interchangeable views of the *same* single operation. You can never pick "wrong." Coverage is total, not partial.

**Name vs id — hybrid, option (i):**
- The **script text always shows names** (`"cutoff.value"`) — real, readable, stored-as-written (honours Option B).
- The **program anchors each name to a stable hidden id**, used for: validation, the tree-picker, a lookup cache, and **safe rename**.
- **Renaming a control auto-updates its name in every script that references it** (like "rename symbol" in an IDE). Path references only ever appear inside `get(...)`/`set(...)`/handle calls, so they are easy to find.
- **Ids never appear in the script text.**

**The tree-picker = the "command library", done right.** A right-side tree of all components. Click a control → expand its sections (Background, Text, Transform, Value…) → click into a section → properties → leaf. The picker produces a **path**, then inserts it in the form that fits the cursor (string inside `set(...)`, suffix on a handle, or a whole `set(...)` line). One picker feeds all three forms because they share one address.

---

## Q2 — Write semantics: does a `set` transmit to the synth? ✅ LOCKED

**Default is decided automatically by origin — the user usually sets no flag:**
- A write made **while reacting to an inbound MIDI/dump event** → **not transmitted** (it is reflecting the synth; echoing back would cause a feedback storm). Automatic.
- A write from a normal "do something" script or a user gesture → **transmitted** (behaves as if the user moved the control). Automatic.

This requires **origin tracking** in the runtime (also prevents script-A→script-B→script-A loops). **JUCE does NOT provide this** — JUCE's MIDI classes are transport only (send/receive bytes); the "don't echo what I just received" policy is ours to build on top, using the DPD bindings.

**Manual override = a scoped block (set once, auto-resets — never a per-line chore), naming Family A "transmit":**
```lua
noTransmit(function()      -- write to the panel, do NOT send to the synth
  set("cutoff.value", 8000)
  set("reso.value", 40)
end)

transmit(function()        -- force send, even inside an inbound handler
  ...
end)
```
- Wrap the whole script body = "set once at the top"; wrap a few lines = partial. Auto-resets at block end, so it cannot leak even on error.
- Identical in Lua and JS (both have plain anonymous functions) → preserves cross-language parity.
- Only needed for the **author-intent** case context can't infer — e.g. an on-screen "Init Patch" / "Randomize" button that sets many values but was not triggered by the synth.

**Three levels of control:** (1) nothing — automatic origin rule, the 99% case; (2) `noTransmit(...)` / `transmit(...)` block — the normal manual override; (3) `set(path, value, { transmit = false })` (Lua; JS: `{ transmit: false }`) — per-call, last-resort fine override.

**Rejected name:** `local`/`localOnly` — clashes with the real MIDI "Local Control On/Off" feature, which means something different; would mislead the synth-literate audience.

**Related, deferred to control config (not a script flag):** drag-vs-commit (send on release, not per frame) is a control input setting.

---

## Q3 — Event subscription mechanism ✅ LOCKED

**Hybrid, matched to scope** — scripting is component-level, panel-level, panel→component, and multi-component:

- **A script attached to a control** declares its *own* events as **named functions**, implicit target = itself. Zero boilerplate. This is the everyday case. (Payload style per Q4 — the value is passed directly, with a descriptive name.)
  ```lua
  function onValueChanged(value)
    set("reso.value", value * 0.5)
  end
  ```
- **To reach other controls / the panel / the device** (from any script), use **explicit registration** `on(target, event, handler)`, also available on a handle:
  ```lua
  on("cutoff", "valueChanged", function(value) ... end)
  panel.get("cutoff"):on("valueChanged", function(value) ... end)
  ```
- **Lifecycle hooks** (Q4) are the named-function form at panel scope (`onPanelReady()`, `onClose()`).

Rule: **named functions for "me reacting to me"; explicit `on(...)` for "me reacting to something else."**

**The picker also surfaces events.** Click a control in the tree → it lists its events alongside its property sections. Selecting one inserts the full `on(target, event, function(e) … end)` skeleton. So building style-2 registrations is as guided as building paths. (Requires the event catalog — Q4.)

**New requirement logged → its own question (Q6): script composition.** Scripts must be able to call / trigger other scripts. Three mechanisms to design: **direct call** (`run("name")`), **event broadcast** (`emit("name")` + `on("name", …)`), and **shared helpers** (project-level reusable functions). Likely all three.

---

## Q4 — Event catalog + payload ✅ LOCKED

**Naming rule (applies to the whole API):** prefer established conventions (web / MIDI standard names); when choosing, pick **distinct words** over subtle tense differences; a name should explain itself. Event string ↔ function name share one word: `"valueChanged"` ↔ `onValueChanged` (prefix `on` + CamelCase).

**Control events:** `valueChange` (live, while moving — for GUI/preview), `valueChanged` (settled/final — for transmit), `click`, `doubleClick`, `pointerDown`/`pointerMove`/`pointerUp`, `hoverStart`/`hoverEnd`, `wheel`, `stateChanged`.
*(Value events: two, not three — `valueChanged` already means committed/final; the old `valueCommitted` was redundant.)*

**Panel events:** lifecycle (Q5), `controlChanged`, `panelStateChanged`, `timer`, plus custom events via `emit`.

**Device events:** at **both** levels —
- **Decoded (the DPD payoff, 90% of use):** `parameterReceived` (`parameter`, `value`), `dumpReceived` (`bytes`, `kind`).
- **Raw (power escape hatch):** `midiIn` (`bytes`, `channel`, `status`), `ccIn` (`channel`, `cc`, `value`), `sysexIn` (`bytes`).
- `deviceConnected` / `deviceDisconnected`.

**Payload = descriptive real words, NOT a generic `e` / cryptic letters.** Because each handler is tied to one known event type, the parameter is named for what it holds:
- One obvious datum → passed **directly**: `onValueChanged(value)`, `onSysexIn(bytes)`.
- Several fields → one named object: `onClick(mouse)` → `mouse.x/.y/.button`; `onMidiIn(midi)` → `midi.bytes/.channel`.
- Optional richer detail → second arg: `onValueChanged(value, info)` with `info.previous`, `info.target` (most scripts ignore it).
- Identical in Lua and JS. (`value`'s representation — normalized vs raw vs display — is Q8.)

**Editor aid:** the picker lists events with one-line descriptions and inserts the handler skeleton, so subtle pairs (`valueChange`/`valueChanged`) are *selected*, not spelled.

---

## Q5 — Lifecycle hook names/signatures ✅ LOCKED

Consistent `onPanel*` / `onDaw*` prefixes (the `onDaw*` prefix signals "the host triggers this"):
```lua
function onPanelLoad()             -- phase 1: before GUI. MIDI setup only — NO controls yet.
function onPanelReady(info)        -- phase 2: GUI ready. Read synth, fill controls.
function onPanelClose()            -- phase 4: really closing. Final cleanup / send dump / all-notes-off.
                                   -- (phase 3 = "during use" — the event handlers; it has no hook of its own)

function onDawSaveState(store)     -- DAW saves the project → write values into `store`.
function onDawRestoreState(store)  -- DAW reopens → read values back from `store`.
```

- **No `onPanelHide`** — it would only pause GUI animations while the editor window is closed (a perf nicety). No core use case needs it; add later if ever.
- **No format split** (`onPanelReady` vs `onDawReady`) — that would break "design once, runs as standalone *and* VST3" and duplicate logic. The real distinction is *first-time vs reopen*, not *standalone vs VST3*.
- **`onPanelReady(info)` carries `info.firstTime`** — true on first ready, false on every VST3 reopen. Guard one-time work (synth queries, init) behind `if info.firstTime`; the safe repaint runs every time. Same code in both formats.
- **`onPanelLoad`/`onPanelClose` fire once; `onPanelReady` may fire many times** (each VST3 editor reopen). Standalone ≈ once.
- **Open dependency:** whether `onPanelReady` could instead fire *truly once* (framework auto-repaints on reopen) depends on the deferred **"where do scripts run"** decision — persistent processor (state survives) vs disposable GUI (fresh context each reopen). The `firstTime` flag is correct either way.

---

## Q6 — Script composition ✅ LOCKED

Because we use real languages, intra-script reuse is free; the API adds only the cross-boundary glue. Four layers:

1. **Within one script** — plain language functions. No API. (Payoff of Option B.)
2. **Reusable helpers across scripts** — a **project-level library**. Define once, call from any script *of the same language* (`scaleMidi(v)`). ⚠️ language-scoped (a Lua helper ≠ callable from JS). Built-in helpers (`scale`/`clamp`/`noteName`, Q10) are different — host-provided in every language.
3. **Trigger a named action elsewhere** — `run("target.action")`. **Host-dispatched → works cross-language.** Supports **arguments and a return value**. Only simple data crosses the boundary (numbers, strings, plain tables/objects) — no live cross-engine references.
4. **Decoupled one-to-many** — `emit(name, data)` (fire-and-forget) + `on(name, fn)`. Language-neutral event bus; the universal glue.

| Want to… | Use | Cross-language? |
|---|---|---|
| reuse inside one script | plain functions | n/a |
| reuse across scripts | project **library** | same language only |
| trigger a specific named action | **`run("target.action")`** | ✅ host-dispatched |
| announce, let anyone react | **`emit` / `on`** | ✅ event bus |

### Picker scope — discoverability of the whole API (refines Q1)
The tree-picker surfaces the **entire panel API**, so users discover commands instead of reinventing them in raw code. Two sides:
- **"This panel"** — component tree → controls → sections → properties + events (the data side).
- **"Commands"** — categorized verbs: **Values** (`set`/`get`), **Transmit** (`noTransmit`/`transmit`), **Events & Flow** (`emit`/`on`/`run`), **Device/MIDI** (`sendCC`/`sendSysex`…), **Helpers**, **Lifecycle** (`onPanel*`).

Each command entry: **name + signature + one-line description + where it's valid**. Inserts the call **in the current language's syntax**. The same descriptions are the generated reference manual.

**Boundary:** the picker covers *our panel API only*, never the host language's own syntax (`if`/`for`/`function`/`=>`) — that's the code editor's normal language intelligence. Two non-overlapping helpers. This is why the API must stay **small and curated** — a browsable tree only works on a tight surface.

---

## Q7 — `self` / scope ✅ LOCKED

**`self`** = the element a script is attached to (control / panel / custom-component instance). **Injected explicitly in both Lua and JS** (the same word — do *not* rely on JS's contextual `this`). Required for reusable custom components: one script runs on many instances, so it must say "this instance," never a fixed name.

**Scope = the namespace → isolation is automatic.** `get`/`set`/`on("name…")` resolve **within the script's own container**:
- a **panel** script searches the panel's controls;
- a **custom-component** script searches only the component's own parts, and **has no name for the outside world** — ten copies never collide.

**Boundary crossing (component ↔ panel) only via:** the component's **public interface** (exposed inputs/outputs) + **`emit`/`on`**. Never by reaching across. (Same sealed-box model as the locked scope-layers decision.)

---

## Q8 — Value model ✅ LOCKED

A control's value has three representations; the DPD converts between them, so all three are exposed. One consistent "…Value" family:

| Accessor | Returns | For |
|---|---|---|
| **`.value`** *(default)* | the **real, human value** — `8000` (Hz), `"LP"` (enum name) | reading, conditions, labels; setting (DPD converts to bytes on send) |
| **`.normalizedValue`** | the **0–1 position** — `0.63` | uniform math, curves, linking controls |
| **`.midiValue`** | the value **as MIDI** — `101` | hand-built MIDI / power use |

- **`.value` is the default** because it matches how a synth-panel author thinks and reads; `set("cutoff.value", 8000)` lets the DPD turn 8000 Hz into the right bytes.
- **`.midiValue` only exists for device-bound controls** (a decorative, unmapped control returns empty). `.value`/`.normalizedValue` always work.
- **"midi" is accurate** — all device comms here are MIDI (CC/NRPN/SysEx). Revisit only if a non-MIDI transport is ever added.
- Enums: `.value` = the name string, `.midiValue` = the device byte.

---

## Q9 — Device / MIDI surface ✅ LOCKED

**Principle:** everyday per-parameter sending is **automatic** — a DPD-bound control sends the right MIDI when you set `.value` (Q2). So the device API is only for **bulk** and **raw**, which keeps it tiny.

**Bulk (DPD-driven, core use-case #2):**
- `requestDump(kind)` — ask the synth to send a dump.
- `applyDump(bytes)` — fill the whole panel from a received dump (walks the DPD map; **silent automatically** — inbound context).
- `sendDump(kind)` — build a dump from panel values and send it.
- `buildDump(kind)` — build the bytes without sending.
- *kinds* (`"patch"`, `"tone"`, `"global"`…) are defined by the DPD; pick by name.

**Raw (escape hatch, device scope):** `sendCC(channel, cc, value)`, `sendNRPN(channel, msb, lsb, value)`, `sendSysex(bytes)`, `checksum(type, bytes)`.

---

## Q10 — Helpers ✅ LOCKED

Host-provided, **identical in every language**. **Principle:** only provide what the language lacks or what must be domain-consistent — do **not** duplicate `min`/`max`/`abs`/`sin` (Lua `math.*`, JS `Math.*` already have them). The set is **extensible** — grow it as DPD profiles surface new needs.

**Value / range:** `scale(v, inLo, inHi, outLo, outHi)`, `clamp(v, lo, hi)`, `round(v)`, `snap(v, step)`, `curve(v, shape)`, `lerp(a, b, t)`.

**Music:** `noteName(60)` → `"C4"` (middle C = C4), `noteNumber("C4")` → `60`.

**MIDI data encoding** — *escape hatch only;* the DPD packs/unpacks modeled params automatically (it already has u14 / lsb-first / nibble codecs):
- multi-byte 7-bit: `to7bit(v, count, order)` / `from7bit(bytes, order)` (covers 14/21/28-bit; `order` = "msb"/"lsb" first), plus `to14bit`/`from14bit` shorthand.
- nibbles (4-bit): `toNibbles(byte)` / `fromNibbles(hi, lo)`, block `nibblize(bytes)` / `denibblize(bytes)`.
- text: `toAscii(str, length)` / `fromAscii(bytes)` (patch names).
- signed/bipolar: `toOffset(v, center)` / `fromOffset(b, center)`, `toSigned(v, bits)` / `fromSigned(b, bits)`. *(DPD still does this automatically for modeled params; helpers are for hand-rolled data.)*

*(`checksum` lives in the device surface, Q9.)*

---

## Timers ✅ (added post-Q11 — design in `CE/web/src/CE_Application/docs/timer-system.md`)

`startTimer(id, ms)` starts (or restarts) a named repeating timer; the `onTimer` panel event fires with `info.id` every `ms` until `stopTimer(id)`. Backed by one host-side `TimerManager` (never a raw thread), bound in every engine. Picker category "Timers".

---

## Q11 — Errors & safety ✅ LOCKED

**Non-negotiable: a bad script never crashes the panel.** A broken script in one control cannot take down the whole VST3.

**Runtime errors:** caught per-handler → that handler stops, everything else keeps running, panel stays alive. Logged to the editor's **script console** (script name, line, plain message) and to a log file in the exported plugin. `log("…")` prints user messages there. Never silent, never a crash.

**Runaway guards (invisible until tripped, then logged):**
- **Loop guard** — origin tracking (Q2) stops A→B→A feedback.
- **Depth limit** — no infinite script-triggers-script chains.
- **MIDI flood limit** — caps runaway message storms.
- **Infinite-loop watchdog** — instruction-count cap / timeout interrupts a stuck `while true` instead of freezing the editor/DAW. (Most important — a GUI-thread infinite loop would hang everything.)

**Sandbox:** scripts see only the panel API — no filesystem/network/OS. Achieved by not exposing those to the runtime, not by policy.

**Exported plugin (no editor):** errors go to a log file; an optional on-panel error indicator a builder can choose to show. *(open: confirm whether the on-panel indicator is in scope for M1.)*

---

## Editor authoring support ✅ LOCKED (raised after Q11)

The scripting **editor** catches faulty code *while you type*, not only at runtime. Two layers:

**Edit-time (static):**
- **Syntax errors** — the language parser (Lua/JS) flags mistakes live; provided largely by the code-editor component (Monaco/CodeMirror) — squiggles + hover.
- **API validation (our part)** — using the same API/path index that powers the picker, validate live against the real component tree and API: unknown paths ("did you mean 'cutoff'?"), wrong-scope commands ("sendSysex only in device scripts"), bad argument count/type. **Guidance-style** messages, a "Problems" list, line markers.

**Debugging (runtime, editor-only — the shipped plugin has no debugger, just the log file).** Feasibility is **split by runtime**, so the debugger is built in two layers:

*Layer 1 — API-level, language-agnostic (Milestone 1).* Built on our API/event/value control, so it works identically for Lua and JS:
- **Trace console** — every event / `set` / MIDI-out, with values (the Q11 `log()` console). Headline learnability feature.
- **Live value watch** — controls/variables update as you interact.
- **Data breakpoints / "run until…"** — pause when a watched value crosses a threshold or a condition holds. Often more useful here than line breakpoints ("pause when cutoff > 8000"). This gives "run until" without needing line-stepping.
- **Step-by-event** — run one handler at a time, inspect state between.

*Layer 2 — native line-stepping (later).* Depends on the engine:
- **Lua (Sol3): full** — line breakpoints, step in/over/out, run-to-cursor, inspect locals via Lua debug hooks (`lua_sethook`). Hooks installed only while actively stepping (the ~100× cost never touches normal runs or shipping). Feasible whenever wanted.
- **JS (juce_javascript = QuickJS via choc): a known investment** — JUCE's wrapper does **not** expose QuickJS's debugger, so native line-stepping needs patching QuickJS or swapping the backend. Flagged as later work; Layer 1 covers the common cases meanwhile.

Runtime note (Model 2): all debugging runs against the **C++ host engines** (Sol3 / juce_javascript) — *not* wasmoon/native-WebView-JS, which are unused.

**One source of truth:** the API/path index drives autocomplete **and** the picker **and** edit-time validation **and** the generated reference docs. Built once, powers all four.

---

## Runtime architecture — Model 2 ✅ LOCKED

**Scripts always run in the C++ engine (the persistent host); the WebView is always just a view — in the editor *and* in the export.** One runtime home per language, both while authoring and when shipped.

**Why (export side, near-forced):** a VST3's engine is alive even when the editor window is closed, so a synth controller must keep handling MIDI/lifecycle with the window shut. Scripts therefore live in the always-on engine; the window only reflects engine state and forwards user input. *(Standalone is the same engine + view, one process.)*

**Threading:** scripts run on a **normal/background thread, never the real-time audio thread** (they can be slow / allocate → would glitch audio). The audio thread just hands incoming MIDI to the script thread. This is also what makes the Q11 infinite-loop watchdog safe — a stuck script never freezes audio.

**Why Model 2 over "two homes":** the hard rule is *test live = behaves the same in export.* Model 2 **is** that (preview runtime = ship runtime, same code, same place), vs only approximating it. Trade accepted: live script preview needs the **JUCE-hosted editor** (not a bare browser) — but the normal dev workflow already runs it (Vite hot-reloads into the JUCE WebView2), and scripts are interpreted so editing one needs **no C++ rebuild**. Given up: pure-browser/headless script preview.

**Ripple effects:**
- **Runtimes halve.** Only the C++-host engines are bound: **Sol3 (Lua)** + **juce_javascript (JS)**. The WASM/browser engines (**wasmoon, Pyodide, native WebView JS**) are **no longer needed** — the WebView never runs scripts.
- **Cross-runtime parity caveat dissolves.** With one engine per language there is no "two sides to keep in sync." The Lua 5.4 choice still matters (which Lua Sol3 embeds), but the wasmoon-vs-Sol3 drift risk is gone. Same for JS (only juce_javascript). *(C++ Tier 3 stays export-first; live C++ preview would need a JIT.)*
- **`onPanelReady`-once resolved (Q5).** The engine persists, so the heavy "read synth / fill controls" work runs **once**; reopening the window re-syncs the view from engine state with no script re-run. `firstTime` remains as a guard but "once" is now natural.

---

## Status
**API design Q1–Q11 + editor authoring support + runtime architecture (Model 2): COMPLETE.** The shared panel API contract and where/how it runs (Milestone 1, Step 1) are fully specified.

**Debugger: designed** — Layer 1 (API-level: trace, watch, data breakpoints / "run until", step-by-event) in M1, all languages; Layer 2 native line-stepping later (Lua full via `lua_sethook`; JS needs QuickJS debugger work).

**Error visibility in the shipped plugin ✅ CONFIRMED:** always write a **log file**; an **optional opt-in error light** the panel author can place (off by default); **never** user-facing dialogs in a finished panel. Both in M1.

**ALL CAVEATS CLOSED. Design phase complete.**

**Next:** Milestone 1 build — bind the panel API into **Sol3 + juce_javascript** in the C++ host; lifecycle hooks wired to standalone + VST3 + state save/restore; the DPD-style editor shell with code editor, picker, live trace console.

**Language status note (2026-08):** beyond the Tier 1 pair this spec was written for, the app now also ships **TypeScript** as Tier 1 (transpiled to JS, same runtime) and **Python / C++ / C# / Java** as additional languages (Python via Pyodide/embedded CPython; C++/C#/Java as an interpreted preview subset, compiled at export) — see `SCRIPT_LANGUAGES` in `panelApi.js` and `docs/scripting-language-options-and-shippable-export.md`. The API contract in this document is unchanged: every language calls the same surface.
