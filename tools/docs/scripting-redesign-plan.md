# CEditor Scripting Redesign — What, Why, and the Language Model

> Result of a design discussion. It defines **what needs scripts and why**, and **how multi-language scripting actually works**, before deciding how the editor looks.
> It **supersedes the engine model** in [`scripting-architecture-plan.md`](scripting-architecture-plan.md): that document assumed a neutral "command graph" that exports to many languages. We are **not** doing that (see §6). We keep only its non-translation pieces.

---

## 1. The problem we are fixing

The current Script Editor (`CE/web/src/CE_Application/editor/ScriptWorkspace.svelte`, ~2,900 lines) has **10 modes** and a CSS grid that re-templates on every mode switch (lines ~1701–1760), so panels physically jump left/right. The DPD never does this — one fixed frame, content swapped with `display:none/block`.

Two problems: **the window jumps**, and **there are too many sections** — ten parallel UIs built before anyone decided what scripting is for.

The fix: **decide what scripts are for, decide how languages work, then build the smallest stable shell — like the DPD.**

---

## 2. Core definition: what is a script, and why

> **The DPD and the settings/GUI hold the *static knowledge* (what a thing *is*). A script holds an *action over time* (what happens, and *when*).**

And the rule that keeps the surface small:

> **If it can be a declarative rule on the component, it is not a script. A script is only what is left when the answer is genuinely "no."**

---

## 3. The spine: the lifecycle (the "WHEN")

Every script runs at some moment. The moments are the spine. **Four phases, all required (not a menu):**

| # | Phase | GUI ready? | What runs here |
|---|-------|-----------|----------------|
| 1 | **On panel start** (before GUI) | ❌ No | MIDI setup, open ports, init SysEx. **Must NOT touch controls — they don't exist yet.** |
| 2 | **On panel loaded** (GUI shown) | ✅ Yes | Read the synth, fill controls, restore saved state. First safe moment to touch the screen. |
| 3 | **During panel use** | ✅ Yes | Everything reactive — event-driven, runs again and again. |
| 4 | **On panel close** | closing | Save preset? send a dump back? all-notes-off? cleanup. |

- Phase 1 vs 2 is a real bug source — phase 1 can't touch controls.
- Phase 4 splits in VST3: **window hidden** vs **plugin unloading**.
- State restore (phase 2) is non-negotiable for VST3.

In each language, lifecycle hooks are just **named entry points** the host calls — e.g. `onStart()`, `onPanelReady()`, `onClose()` as a Lua function, a JS function, etc.

---

## 4. What lives "during use" (phase 3)

Phases 1, 2, 4 are run-once moments. **Phase 3 is the live, event-driven timeline** and holds ~90% of scripting:

### 4a. Bulk data ↔ panel conversion
The DPD is the **map** (byte layout, ranges, enums). A script is the **action** that walks it:
- **Dump → panel:** incoming bytes → use the map → set every control.
- **Panel → synth:** read every control → build the bytes in the DPD layout → send.

Must be a script because the *when* and *which* are author decisions no checkbox can hold.

### 4b. Scriptable everything (the coder's full-power path)
Every property and event has a **dot-path address** (`Transform.x`, `Text.Fill.colour`, `onPointerDown`). A script reads/writes the **same paths** the GUI uses, plus listens to events and does math. Move a control, change pointer color while dragging, "when this slider moves show that label," "click → toggle two buttons / show a layer," extra parameter math, bind mouse actions.

Three different *kinds* of need:

| Need | Can the GUI do it? | Why a script? |
|------|--------------------|---------------|
| Lifecycle (1,2,4) | No | The **only** way. |
| Bulk data ↔ panel | No | The **only** way. |
| Scriptable everything | Mostly yes | A **power-user alternative** over the same addresses. |

Discipline: the **GUI handles the everyday case**; the **script is the escape hatch** — using the same dot-paths, so there is only one system.

---

## 5. Scope layers (the "WHERE")

```
project  →  panel  →  component  →  custom-component (isolated)
```

A **custom component** is a self-contained machine. Its scripts live **inside it** and travel with it. It has a private **inside** (local names) and a small public **interface** (e.g. one `value` + one `onChange`); the panel scripts against the interface, never the guts. Two copies never collide. It may have its own mini-lifecycle (placed / removed). **Decision:** edited *inside the component*, not in a flat global list.

---

## 6. The language model — Option B: many real languages, no conversion

This is the heart of the redesign, and it **replaces** the old plan's neutral-IR idea.

> **A script is written, stored, and recalled in the exact language it was authored in. The program never converts one language into another. The only shared thing is the panel API that every language calls.**

So:
- **No command graph / no neutral "IR."** The **source of truth is the script text**, tagged with its language. There is nothing to translate between languages.
- **The shared contract is the panel API**, not a data format. Every language calls the same surface — `panel.filter.cutoff.value = …`, the lifecycle hooks, `device`, `midi`.
- **The "command library" becomes the API reference + autocomplete**, shown in each language's own syntax. It documents one API across several languages. (This — keeping the path/API index accurate as panels change — is the hard, valuable work.)
- **"Portability" no longer means translation.** It means one thing: *does this language's engine exist where the script must run?*

### The runtime matrix
"Live" = runs in the editor preview (WebView). "Export" = runs in the built standalone/VST3 (C++/JUCE host).

| Language | Live (preview) | Export (built) | Needs a compiler? | Difficulty |
|---|---|---|---|---|
| **Lua** | ✅ wasmoon | ✅ Sol3 | No (interpreted) | **Easy** |
| **JavaScript** | ✅ native WebView | ✅ `juce_javascript` (choc) | No (interpreted) | **Easy** |
| **Python** | ✅ Pyodide (heavy) | ✅ embed CPython / MicroPython | No (interpreted, heavy runtime) | Medium-heavy |
| **C++** | ❌ unless a JIT (Cling/LLVM) or compile-to-WASM | ✅ compiled into the build | **Yes** | Hard |

`~HTML/CSS` is **dropped** — it is markup/appearance, not behavioral scripting. If wanted later, it's a *separate* custom-component-look feature, not part of this.

### Lua version: target 5.4 (not 5.5)
The version is **gated by our two runtimes**, not by "newest." As of June 2026:
- **wasmoon** (live/WebView) is a **Lua 5.4** VM — there is **no 5.5 build**.
- **Sol3/sol2** (export/C++) supports **Lua 5.4**; **Lua 5.5 currently fails to compile** (only a pending, unmerged PR).
- Lua **5.5.0** is released (22 Dec 2025) but unavailable on *both* of our sides, so it is a **future bump**, not a now-choice.

**Decisions:**
- **Target Lua 5.4 now** — the only version both runtimes support.
- **Avoid 5.5-only syntax** (global declarations, named vararg tables) so a later bump to 5.5 is painless.
- **Keep both sides on the same 5.4.x.** That parity is what makes "test live = behaves the same in export" trustworthy.
- **No LuaJIT** — it is stuck at Lua 5.1 and would break parity with wasmoon's 5.4. Reconsider only if we ever drop the same-version guarantee for speed.
- **Watch for the 5.5 unlock** — it requires *both* a wasmoon 5.5 build *and* Sol3 merging 5.5 support. We don't control that timeline.

### Language tiers (cost is driven by the runtime, not the count)
- **Tier 1 — Lua (5.4) + JavaScript.** Both run live *and* in export with mature embeddable engines. **This is Milestone 1.**
- **Tier 2 — Python.** Big reach, interpreted, but heavy runtime both places. Later.
- **Tier 3 — C++.** **Export-first** — fits the existing compile-per-panel export model (user C++ compiled into the VST3 at build time). Live C++ needs a JIT and is a stretch goal. Later.

The work that pays off across *all* languages is the same one thing: **bind the shared panel API into each runtime.**

---

## 7. What we keep vs drop from the old engine plan

**Drop** (these existed to serve multi-language translation, which we are not doing):
- ❌ command graph as the stored source of truth
- ❌ neutral "CE Script" projection
- ❌ multi-language export *generated from one form*
- ❌ portability badges meaning "translation-safe"
- ❌ forced visual block authoring / "four authoring surfaces"

**Keep** (invisible safety + genuinely useful pieces):
- ✅ **Sandbox** — each runtime only exposes the panel API; no filesystem/network/OS from a plugin. Invisible; doesn't cramp how you write.
- ✅ **Anti-flood / loop guard** — runtime backstop so a bad script can't freeze the DAW or spam MIDI.
- ✅ **The settings vs scripts line — as a nudge, not a wall.** Static facts (min/max, a fixed CC mapping) are *encouraged* into the DPD/GUI so the DPD can see/diff/reuse them — but a coder is not forbidden from script.
- ✅ **Validation as guidance**, and the scope model.

---

## 8. UX direction: copy the DPD shell

Replace the 10 jumpy modes with the DPD skeleton (`DeviceProfileDesignerV2.svelte`):

```
┌─ fixed titlebar ───────────────────────────────┐
├──────────┬─────────────────────────────────────┤
│ nav rail │  stage — ONE screen, display:block   │
│ (fixed)  │  ┌──────────────┬──────────────────┐ │
│          │  │ script list  │ code editor      │ │   list → detail,
│          │  │ (table)      │ (the one script) │ │   frame never moves
├──────────┴─────────────────────────────────────┤
│ footer: Save / validation status               │
└────────────────────────────────────────────────┘
```

- **One fixed frame**, never re-templated. Screens toggle with `display:none/block`.
- **Nav rail organized by the lifecycle spine**: Setup (1–2), Behaviors (phase 3 event list), Teardown (4), Test (preview debugger as one screen).
- **List → detail.** The detail pane is a **real text code editor** for the script's language, with **API autocomplete + hover docs** from the path/API index. Plus a small per-script **language selector** (Tier 1: Lua / JavaScript).
- **Live test** for interpreted languages (Lua/JS) right in the editor.
- **Same shell everywhere** — editing a control's script from the canvas opens this shell, not a separate variant.

---

## 9. Phased plan

### Runtime placement — Model 2 (LOCKED, see `panel-api-spec.md`)
**Scripts always run in the C++ host engine; the WebView is always just a view** — in the editor and in the export. So the runtime matrix above collapses for placement: only **Sol3 (Lua)** + **juce_javascript (JS)** are bound; the WASM/browser engines (wasmoon, Pyodide, native WebView JS) are **not used**. One engine per language → no cross-runtime drift; "test live = ship" is literal. Scripts run on a **non-audio thread**.

### Milestone 1 — Tier 1 (Lua + JavaScript)
1. **Define the panel API once** — the shared surface every language calls (Q1–Q11 in `panel-api-spec.md`): dot-path read/write, lifecycle hooks, `device`, `midi`, composition, helpers.
2. **Bind it into the two host engines** — **Sol3 (Lua)** + **juce_javascript (JS)** in the C++ host. Used for **both** live authoring-preview and export (Model 2). The API/path index is the single source for bindings + picker + validation + docs.
3. **Lifecycle hooks** — real, separate phases (`onPanelLoad` before-GUI, `onPanelReady`, `onPanelClose`, `onDawSaveState`/`onDawRestoreState`), wired into standalone + VST3 and to state save/restore. *Highest-value missing piece.*
4. **Storage** — script = `{ language, source, scope, event }`; stored on control / custom-component / panel `Scripts` sections.
5. **The stable shell** — `BehaviorDesigner.svelte` cloned from the DPD skeleton: fixed frame, nav by lifecycle, list→detail with a text code editor + API autocomplete, language selector, live test.
6. **Bulk data ↔ panel** scripts wired to the DPD byte-map (dump→panel, panel→dump).
7. **Delete the dead modes** from `ScriptWorkspace.svelte` once Tier 1 has parity.

### Later
- **Milestone 2 — Python** (Pyodide live + embedded CPython/MicroPython export).
- **Milestone 3 — C++** (export-first; live JIT a stretch goal).
- Custom-component isolation polish; optional HTML/CSS look feature.

Milestone 1 alone proves the whole architecture: *any language, same panel API, live + export.*

---

## 10. One-paragraph summary

A script is **an action plus the moment it runs** — one of four lifecycle phases, or an event during "during-use." The DPD/GUI hold static knowledge; scripts hold actions over time, over the same dot-path addresses. The user writes in a **real language of their choice** (Tier 1: Lua or JavaScript), and it is **stored and run in that language — never converted.** The only shared thing is the **panel API** bound into each runtime. The editor stops being a 10-mode IDE that jumps around and becomes a single, stable, DPD-style shell: a real code editor with API autocomplete, organized by the lifecycle spine.
