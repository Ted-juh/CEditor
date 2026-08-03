# Scripting manual review — 2026-08-02

Scope: the scripting documentation set that serves as "the manual" today —
`tools/docs/panel-api-spec.md` (the API contract, the closest thing to a reference manual),
`tools/docs/scripting-redesign-plan.md`, `tools/docs/scripting-architecture-plan.md`,
`docs/scripting-language-options-and-shippable-export.md`,
`CE/web/src/CE_Application/docs/scripting-runtime-gaps.md`, and the in-app manual source
`CE/web/src/CE_Application/scripting/panelApi.js` (its summaries feed the picker and are, per the
spec, "the generated reference manual").

Every claim below was checked against the shipped code (`CE/src/Scripting/*`, `panelRuntime.js`,
`scriptValidate.js`).

---

## A. Errors (manual contradicts the shipped code, or itself)

1. **`noteName` octave convention is wrong in the manual.** `panelApi.js` and spec Q10 both say
   `noteName(60)` → `"C3"` / `noteNumber("C3")` → 60. All four shipped implementations
   (`JsScriptEngine.cpp:69`, `LuaScriptEngine.cpp:98`, `PythonScriptEngine.cpp:366`,
   `panelRuntime.js:172`) compute `floor(60/12) − 1 = 4` → **"C4"**. The manual documents an octave
   the code never returns. → Fix the docs to C4 (middle C = C4, matching the implementations).

2. **Timers are half-documented.** `startTimer(id, ms)` / `stopTimer(id)` are implemented in every
   engine (`JsScriptEngine.cpp:54`, `LuaScriptEngine.cpp:198`, backed by `TimerManager.h`), and
   `panelApi.js` advertises the `timer` event ("A started timer fired") — but no command in the
   picker/manual tells the user how to *start* one, and the spec never mentions timers at all. A
   user can discover the event but not the way to cause it. → Add `startTimer`/`stopTimer` to
   `panelApi.js` (category "Timers") and a Timers section to the spec.

3. **The spec's intro contradicts its own locked runtime decision.** Line 3 says the runtimes are
   "Lua 5.4 via wasmoon/Sol3, JavaScript via WebView/juce_javascript", but the Model 2 section in
   the same document locks: wasmoon and WebView-JS are **not used** — scripts run only in Sol3 +
   juce_javascript. A reader trusts the first line and gets the architecture wrong. → Fix the intro.

4. **Stale "Next" list at the bottom of the spec.** The Status section says "ALL CAVEATS CLOSED.
   Design phase complete", then relists Q7–Q11 as if they were still upcoming — leftover text from
   before those questions were settled. → Delete the leftover bullets.

5. **Spec Q3's example breaks spec Q4's rule.** Q3 shows `function onValueChanged(e)` with
   `e.value`; Q4 locks that payloads are **descriptive names passed directly** — `onValueChanged(value)` —
   and explicitly rejects "a generic `e`". Under the locked rule, `e.value` would be nil. A copied
   example from the manual must not silently fail. → Rewrite the Q3/Q7-adjacent examples to the Q4 form.

6. **Language coverage is out of date everywhere but the code.** The spec and redesign plan say
   Tier 1 = Lua + JS, Python later, C++ later. The app now ships **TypeScript as Tier 1**
   (`TIER1_LANGUAGES = ['lua','javascript','typescript']`) plus C++, **C#, and Java** preview-subset
   languages (`SCRIPT_LANGUAGES`, `csharpPreview.js`, `javaPreview.js`), and the language-options doc
   already discusses their toolchains. TS/C#/Java appear nowhere in the two design docs. → Add a short
   status note; don't rewrite history in the decision records.

7. **`scripting-runtime-gaps.md` contradicts itself about timers.** One section marks `onTimer`
   "✅ WIRED via the new TimerManager"; the "Outbound host API" section still says `startTimer`/`stopTimer`
   "needs a `juce::Timer`-backed TimerManager", and the to-do list still has that box unchecked —
   `timer-system.md` says it's done. Also names `to14Bit` (the helper is `to14bit`) and `buildSysex`
   (no such member exists in `panelApi.js`; the engines install `to7bit`/`to14bit`/`nibblize`/…).
   → Update the stale entries and names.

8. **Redesign plan §3 uses pre-decision hook names.** `onStart()` / `onClose()` vs the locked names
   `onPanelLoad` / `onPanelClose` (spec Q5, and what the engines dispatch). Anyone reading §3 first
   learns the wrong names. → Use the final names.

9. **Redesign plan §1 describes a fixed problem in the present tense.** `ScriptWorkspace.svelte`
   (10 modes, jumping grid) no longer exists; the DPD-style shell shipped as `BehaviorDesigner.svelte`.
   → One-line status note so a reader doesn't go hunting for a deleted file.

10. **`scripting-architecture-plan.md` has no supersession banner.** The redesign plan supersedes its
    engine model and the command-graph engine was retired (commit `eb3f3eb`), but the document itself
    opens as if current — 865 lines of dead architecture presented without warning. → Add a banner at
    the top pointing at the redesign plan and spec.

## B. Clear-language check

- **Phase numbering confuses inside the spec.** Q5 labels `onPanelClose` "phase 4" but the spec never
  shows phase 3; the numbering lives in the redesign plan. One parenthetical fixes it.
- **Mixed-language snippet.** Q2's `set(path, value, { transmit = false })` is Lua-flavoured in a
  spot that reads as language-neutral; label it.
- **Unexpanded internal shorthand.** DPD, FUID, IR, "Model 2", "Option B", "Family A", tiers — fine
  in decision records, but nothing user-facing ever expands them. The spec references "the DPD" ~20
  times without once saying "Device Profile Designer".
- Otherwise the writing is strong: rules are stated as rules ("named functions for 'me reacting to
  me'; explicit `on(...)` for 'me reacting to something else'"), decisions carry their why, and
  rejected options are recorded with reasons — genuinely good manual practice.

## C. Is the manual clear? What would make it more user-friendly?

**Clear for its actual audience (the developers), not yet for users.** Everything in the set is a
design/decision record. There is **no end-user scripting manual** — the closest thing users see is
the picker summaries from `panelApi.js`. What it needs, in order of value:

1. **Generate the promised reference manual.** The spec already says the picker descriptions "are
   the generated reference manual", and `panelApi.js` has every signature + one-liner. A small
   generator emitting one markdown page (commands, events, lifecycle, helpers, per-language snippets)
   would create the user manual almost for free and can never drift from the picker.
2. **Fix the errors above** — a manual that contradicts the runtime (C3 vs C4) is worse than a
   missing one.
3. **A reading-order index.** Nothing tells a newcomer that the architecture plan is historical,
   the redesign plan is the "why", and the spec is the contract. A five-line docs index (or banners,
   done here) fixes the trap.
4. **Examples per task, not per API member.** The spec's best moments are its worked snippets
   (`noTransmit` around an Init-Patch button). A "cookbook" page — link two controls, fill the panel
   from a dump, blink an LED on a timer — would serve first-time scripters far better than more
   reference text.
5. **Expand shorthand on first use** in anything user-facing.

## Changes made after this log (same branch)

- `panelApi.js` — noteName/noteNumber examples C3→C4; `startTimer`/`stopTimer` added under a new
  "Timers" category (already implemented in every engine; preview parity remains tracked in
  `timer-system.md`).
- `panel-api-spec.md` — intro runtime line fixed (Model 2); Q3 examples follow the Q4 payload rule;
  Q5 phase note; Q10 C4 fix; Timers section added; stale "Next" bullets removed.
- `scripting-redesign-plan.md` — §1 status note (shell shipped); §3 hook names finalized; §6 tier
  status note (TS/C#/Java).
- `scripting-architecture-plan.md` — supersession banner.
- `scripting-runtime-gaps.md` — timer entries marked done; `to14Bit`→`to14bit`; `buildSysex`
  reference corrected.

Follow-up (same branch): the three recommendations were then implemented too —
`docs/scripting-manual.md` generated from `panelApi.js` by
`CE/web/scripts/generate-scripting-manual.mjs` (`npm run docs:manual`),
`docs/scripting-cookbook.md`, and the reading-order index in `docs/README.md`.

Second follow-up (same branch): the component command families were registered in
`panelApi.js` (47 commands the picker/validation/manual never showed); the manual gained
all-language examples (from the validated export corpus), preview-vs-export availability
badges, structured payload fields, a conventions table, a failure-modes section, the C++/C#/
Java subset definition, and a freshness test; plus `docs/scripting-getting-started.md`.
The audit also found `run`/`emit`/`on`(custom) and `buildDump` are no-op stubs in BOTH
runtimes (logged in scripting-runtime-gaps.md), and the preview's `onDumpReceived` payload
diverges from the contract (also logged).

Third follow-up (same branch): the flagged runtime gaps were fixed — `emit`/`on`/`run`
implemented in the preview runtime (listener registry, emit-chain guard, sync `run()` returns
for JS/TS/C++/C#/Java targets; `test/scriptFlow.test.js`) and wired in the Player
(`ScriptRuntime::runAction`, `emitEvent` → `dispatchEvent`, the `valueChanged`↔`onValueChanged`
listener alias, 2-arg `on(name, fn)` in both engines); `onDumpReceived` now carries
`{ values, kind, role, bytes }` in both runtimes. `buildDump` remains the one open flow gap.

Fourth follow-up (same branch): the two top API extensions were built — the **note API**
(`sendNote`/`noteOn`/`noteOff` in all engines + the preview, `noteIn` inbound event in the
Player) and **musical time** (`transport()` snapshot everywhere; `onBeat`/`onBar` from the
panel Transport in the UI runtime and from the DAW playhead window-closed;
`startTimer(id, { beats })`). The Player's inbound `midiIn`/`ccIn` channel fields were also
corrected to the documented 1–16 convention (they were 0-based).

Fifth follow-up (same branch): component-command coverage completed — new pure reducers and
command families for the **Arpeggiator** (10), **Turing Modulator** (8), and **Gesture
Looper** (7), plus **song mode** on the Phrase Sequencer (`phraseStore`/`phraseLoad`/
`phraseChain`/`phraseChainLoop`). The picker, validation, and manual pick them up from
`panelApi.js` automatically; reducers are unit-tested in `componentScriptPatches.test.js`.

Sixth follow-up (same branch): **preview timers** (setInterval-backed, same contract as
TimerManager — the timer badges are gone), a **one-shot `{ once }` timer form** in both
runtimes, **script persistence** (`stateSet`/`stateGet`, panel-scoped; persisted with the DAW
project in the exported plugin via the ScriptState blob), and the **`controlChanged` event
wired** in both runtimes (its "Planned" badge is gone). Tested in
`scriptTimersState.test.js`.

Seventh follow-up (same branch, closing out): **preview raw MIDI-in** (`onMidiIn`/`onCcIn`/
`onNoteIn`/`onSysexIn` + per-parameter `onParameterReceived` — five badges gone),
**`onDeviceConnected`/`onDeviceDisconnected`** in both runtimes (DPD session `ready`
transitions), **`onStateChanged`** (preview interaction states), and the spec Q1 **handle
form** (`panel.get("name")` → `{ set, get, on }`, plus `self.on`) in every engine and the
preview. Tested in `scriptMidiInHandles.test.js`; the Lua prelude was verified in a real
Lua 5.4 VM (wasmoon). Remaining open items: `buildDump` (needs a synchronous DPD bulk-encode
API), `panelStateChanged` (no panel-state feature to observe), and the optional dot-object
sugar.
