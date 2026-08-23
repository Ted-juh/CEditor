# Program completeness review — 2026-08-03

> ⚠️ **SUPERSEDED IN PART.** Kept because its framing — three end-to-end journeys, none of which
> closes — is still the clearest account of what "feels complete but isn't" meant, and one of the
> three loops is still open. But it was written against a README and a codebase that have both moved,
> and reading it cold will mislead you. What has changed since:
>
> | Its claim | Today |
> |---|---|
> | The goal is "a visual editor for designing and building audio plugin UIs" | The README no longer says that. It leads on hardware-synth editors that are instruments in their own right — a change this document's own §3 argued for, by way of `beta-differentiation.md`. |
> | "45 component types" | 50. |
> | **The sound loop**: no preset model, no banks, no factory-vs-user slots | Built. `stores/presetLibrarian.js` has banks, named entries, scan capture and attached dump data. The DPD Presets screen is no longer a "not built yet" placeholder. |
> | **The delivery loop**: VST3-only, source-checkout-only, unsigned | CLAP and LV2 ship beside VST3. Source-checkout-only is gone — a template player exports with no compiler (`docs/scripting-language-options-and-shippable-export.md` §3a). Unsigned is unchanged and is now a named v1 blocker in the 08-10 review. |
> | Five menu stubs (Panel Properties…, Export Settings…, Build Standalone, Build Settings…) | Gone; none of those strings is in the tree. |
> | "Undo is 50 whole-panel JSON snapshots — a perf ceiling on large panels" | Fixed. `stores/history.js` keeps a shallow copy sharing the control objects; the GAIA panel's snapshot went from 21 MB and ~190 ms to a few kilobytes. |
>
> **What survives, and it is the reason this file is not retired: the people loop.** No templates,
> no example panels, no first run, no panel package format, no importer. Every word of §3 on that
> still holds, and it is item 5 in `beta-readiness-review-2026-08-10.md` §3.
>
> For current status read the [08-10 beta readiness review](beta-readiness-review-2026-08-10.md) and
> [known-issues.md](known-issues.md). This is a record of a diagnosis, not a to-do list.

**The question asked:** "The program feels complete, but it's missing something I can't point my
finger at. Given the program's goal, what is it missing?"

**The goal, per the README:** *a visual editor for designing and building audio plugin UIs — create
panels with interactive components, style them with rich property editors, and export as VST3, AU,
or standalone applications.* Originally *Ctrlr Editor*: the implied user is a musician building an
editor/controller for a hardware synth and using it in a DAW.

**The short answer:** the program is complete as a *builder* and incomplete as a *product*. Every
inward-facing capability — the canvas, 45 component types, the custom-component designer, the DPD
designer, seven scripting languages, the MIDI engine — is deep, tested, and documented. What's
missing is that none of the three end-to-end journeys the goal implies actually **closes**:

1. **The sound loop** — you can *edit* a patch but not *keep* one (no librarian, no preset model).
2. **The delivery loop** — you can *build* a plugin but not really *ship* one (VST3-only,
   Windows-only, source-checkout-only, unsigned; AU/standalone are promises).
3. **The people loop** — you can *master* the program but not *start* with it, and you can't
   *share* what you made (no templates, no onboarding, no panel-exchange story).

That's why it "feels complete": every screen you open works. The incompleteness lives *between* the
screens — at the boundaries where the program meets its two audiences, the panel author and the
panel user. Elaboration with evidence below.

---

## 1. The sound loop: no patch/preset layer (the single biggest gap)

For the target user, a hardware-synth editor's reason to exist is ultimately **managing sounds** —
pull a patch off the synth, name it, keep it, organize banks, A/B it, send it back, have it survive
the DAW project. CEditor has the *plumbing* for all of this and none of the *product*:

- **What exists:** live preset-list scans (`startPresetListScan` iterates slots, name-request per
  slot, `text`-codec parsing), bulk dump send/receive with ACK/NAK/retries/verification, dump
  parsing with checksums, `PARAMETER_TYPES.PATCH_NAME` (barely wired), and script-level
  `requestDump`/`applyDump`/`sendDump` in the exported plugin.
- **What's missing** — and [preset-model.md](../CE/web/src/CE_Application/docs/preset-model.md)
  already says it plainly: no factory/ROM preset catalog, no factory-vs-user slot distinction, no
  banks/categories, no init-patch concept, and **no persisted librarian** (save/recall user banks
  locally). The Workbench Preset Librarian is designed in
  [midi-workbench.md](../CE/web/src/CE_Application/docs/midi-workbench.md) §Presets and sits in
  roadmap **Phase 4, unbuilt**. The DPD Designer's **Presets screen renders "not built yet"**
  (`DeviceProfileDesignerV2.svelte:202-210`).
- **In the exported plugin** the gap repeats at both ends: toward the DAW,
  `getNumPrograms()` returns 1 and `setCurrentProgram` is empty (`PluginProcessor.h:213-217`) — no
  host-visible programs, no `.vstpreset` story; toward the synth, `cb.buildDump` is a stub returning
  `juce::var()` (`PluginProcessor.h:809`), so "capture the current panel state as a dump" doesn't
  work window-closed. The nearest thing to patch recall is script `ce.storage` panel scope — a
  per-project blob, not a library.

The parameter-editing half of the program is the half Ctrlr users tolerated; the librarian half is
the half they came for. This is the gap most likely to be the "something" that can't be pointed at:
the program edits sounds brilliantly and cannot *hold onto* a single one.

## 2. The delivery loop: the export promise is one-third kept

The README promises "export as VST3, AU, or standalone applications." Reality:

- **VST3 only** — the sole plugin target is `FORMATS VST3 Standalone` (`CMakeLists.txt:161-173`) and
  the exporter builds/copies only the VST3 artefact (`export-panel-vst3.mjs:370-397`). AU and CLAP
  exist as *identity strings* (`PanelExportIdentity.h:106-112`) displayed read-only in the Export
  tab; nothing consumes them (pipeline plan Phase F4, unchecked). The Standalone wrapper compiles as
  a JUCE side-effect but is never surfaced; `Build → Build Standalone` in the menu is
  `action: () => {}` (`MenuBar.svelte:148`), as are Build Settings and Export Settings.
- **Windows only** — every target unconditionally links WebView2/dwmapi with no `if(WIN32)` guards
  (`CMakeLists.txt:90-92, 116-122, …`); the mac/Linux branches that exist are explicitly marked
  UNVERIFIED. CI is `windows-latest` only and doesn't cover the export smoke test (`ci.yml:8-9`).
- **Source-checkout only** — an installed GUI-only CEditor hard-fails export
  (`ValueTreeBridgeHandlers.cpp:1217-1230`); the compiler-free standalone/CLAP template path is
  deferred future work (§3a of the language-options doc).
- **No distribution story** — zero signing/notarization anywhere (grep confirms; the pipeline plan
  says "ship unsigned for now"), no packaging of the exported artefact, and the AGPL note in the
  README applies to *exported panels too* — a real constraint on the implied "share your panel"
  end-state that nothing in the product surfaces at export time.
- **Fidelity detail worth fixing regardless:** the JS side carries `choiceMode`/`choiceValues`
  metadata but C++ maps **every** parameter to `AudioParameterFloat` (`PanelParameters.h:71-84`) —
  comboboxes/toggles show up in the DAW as anonymous 0–1 floats instead of
  `AudioParameterChoice`/`Bool`. Automation works; it just reads like a debug build to the DAW user.

If the goal is "build **and ship** panels," the building half is production-grade (the FUID
identity self-check is genuinely good) and the shipping half is scaffolding.

## 3. The people loop: no way in, no way out

- **No way in (authoring):** New Panel = blank canvas. There are **no panel templates, no example
  panels, no welcome screen, no first-run experience, no tour** — the only in-app help is the F1
  shortcut list, the `?` glossary, and hover hints. The program now contains *four* designers
  (panel canvas, custom-component surface with 22 draw tools, Behavior Designer, DPD Designer V2)
  and nothing that introduces any of them. ~~The 60 design docs in `CE_Application/docs/` and the
  scripting manual/cookbook/getting-started are invisible from inside the app.~~ *(half fixed —
  Help → Documentation now carries the scripting manual, cookbook, getting-started, release notes
  and known issues, searchable, baked into the bundle. The 60 design docs are deliberately still
  out: they are for whoever works on the program, not for whoever uses it. There is still no
  current editor manual, and the viewer says so.)* Meanwhile the
  ~~**Auto-Panel generator** (DPD → complete working panel in one step) — which would *be* the
  onboarding for the core use case — is designed and sits in Phase 5, unbuilt.~~ *(built — File →
  New Panel from Device Profile; [auto-panel.md](../CE/web/src/CE_Application/docs/auto-panel.md).
  The blank canvas is still what New Panel gives you, so the rest of this bullet stands.)*
- **No way out (sharing):** Ctrlr's actual moat was never the editor — it was the community
  ecosystem of panels. CEditor has no panel-sharing/import/export story: no package format for
  *panels* (custom components have one, with metadata, versioning, and a library — the panel level
  has nothing), no Ctrlr `.panel`/`.bpanelz` importer to bootstrap the existing community's work,
  and the DPD "Share & impact" screen is another "not built yet" stub. The
  identity-registry/"update vs new copy" policy from the export plan (D1) is also unbuilt, which is
  the piece sharing would need to not collide FUIDs.
- **End-user docs exist only for scripting.** The 2026-08-02 review fixed that for the scripting
  surface (manual, cookbook, getting-started). The *editor itself* — panels, bindings, the DPD
  workflow, export — has no user-facing manual at all; everything else in `docs/` and
  `tools/docs/` is a design/decision record.

## 4. Cross-cutting: trust the roadmap's own two flags, and sweat the seams

- **"Code written, unverified by build."** The roadmap's two critical prerequisites — inbound MIDI
  wiring in the live runtime and the C++ TimerManager — both carry this banner
  ([roadmap.md](../CE/web/src/CE_Application/docs/roadmap.md) Phase 0). Value-driven display
  (meters, LCDs, LEDs, preset feedback) — i.e. the *two-way* feel that separates an editor from a
  remote control — sits on top of them. Until a build pass + on-device verification lands, Phase 0
  is "done" only on paper.
- **The README no longer describes the program.** `CE_ComponentDesigner/` doesn't exist (the
  designer shipped inside `CE_Application/sections/`), `CE_Panel/` contains one file rather than
  the runtime components, and the AU/standalone claim is aspirational. For a project this
  well-documented internally, the front door is the stalest page in the house.
- **Menu stubs** (`Panel Properties…`, `Export Settings…`, `Build Standalone`, `Build Settings…`,
  `Validate Active Script`) are small, but they are precisely the kind of thing that makes a
  complete-feeling program feel unfinished the moment someone else touches it.
- **Longer-horizon debts, noted not urgent:** no i18n (all strings inline English), accessibility
  is concentrated in a few files with 73 `svelte-ignore a11y_*` suppressions elsewhere, no theming
  (and the DPD/Behavior designers run their own diverging local palettes), undo is 50 whole-panel
  JSON snapshots (perf ceiling on large panels).

---

## What "done, given the goal" would look like — suggested order

| # | Item | Why this order |
|---|------|----------------|
| 1 | **Build-verify Phase 0** (inbound MIDI + TimerManager) on hardware | Everything two-way sits on it; currently paper-done |
| 2 | **Preset model + Workbench librarian** (slot map in `dpd.schema.json`, factory/user ranges, recall action, persisted user banks; un-stub `buildDump`; host programs via `getNumPrograms`) | Closes the sound loop — the core user promise |
| 3 | ~~**Auto-Panel generator** (even a crude first cut: DPD → bound controls in a grid)~~ *(built — File → New Panel from Device Profile, and not crude: every control is bound and adopts the profile's range, choices and label)* | Turns the deepest asset (DPD) into the onboarding; kills the blank-canvas problem |
| 4 | **Ship the Standalone export path** + wire the stubbed Build menu items; typed parameters (`AudioParameterChoice`/`Bool`) | Cheapest honest step toward the README's promise; standalone also dodges the FUID/compiler constraint per §3a |
| 5 | **Panel package/share format** + identity registry (D1) + surface the AGPL implication at export | Closes the people loop outward |
| 6 | **Editor user manual + 2–3 example panels** shipped in-app | The scripting docs proved the pattern; repeat it for the editor |
| 7 | README rewrite to match reality; mac/AU only after 1–6 | Front door last; platform expansion is a multiplier, not a foundation |

**One-line verdict:** nothing inside the program is missing — what's missing is the program's
*outside*: the patch library that makes it useful, the shipping path that makes it real, and the
on-ramp and sharing story that make it matter to anyone but its author.
