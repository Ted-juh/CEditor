# Design records

Design records for the editor and its tooling. These are **not** user documentation — they are
the decisions, the reasoning behind them, and the plans that carried them out. User-facing docs
live in [`docs/`](../README.md).

A design record does not track the code. Where a document says something is shipped, the code has
moved on since; where it describes a plan, some of it may never have been built. Each one is
described below as what it *is*, and any status it carries about itself is repeated here. **When a
design record and the code disagree, the code is right.**

## Scripting

| Document | What it is |
|---|---|
| [Panel API spec](panel-api-spec.md) | The scripting API contract as eleven settled questions (Q1–Q11): addressing, events, lifecycle, scopes, errors. A LOCKED answer records what was decided then — later rounds added hooks and commands that were never backfilled here. For the surface as it stands, read the [scripting manual](../scripting-manual.md). |
| [Scripting redesign plan](scripting-redesign-plan.md) | Why scripting works the way it does: what needs scripts, the lifecycle spine, scope layers, and the many-real-languages model. Carries its own status — largely shipped, with §1 kept as historical motivation. |
| [Scripting architecture plan](scripting-architecture-plan.md) | ⚠️ **Superseded.** The language-neutral "command graph" model, rejected and removed from the codebase. Only its sandbox, loop guards, scope model and validation-as-guidance survived. |

The `ce.*` module system has its own record in `docs/scripting-modules-design.md`,
with an *as built* section per phase.

## Devices and MIDI

| Document | What it is |
|---|---|
| [MIDI 2.0 integration plan](midi2-integration-plan.md) | The deferred plan for MIDI 2.0 — MIDI-CI first so capable devices can describe themselves, UMP second. Some MIDI-CI work has since landed in `CE/src/DeviceProfile/`; read the plan for the reasoning, the code for what exists. |
| [Screen Builder & CTRL49 control surface](screen-builder-design.md) | The CTRL49's screen/encoders/pads as a physical front panel for screenless hardware synths, on three decisions: templates + assignments (never panel rendering), one resident broker owns the hardware, device Lua is a pure renderer of host state. Byte-level protocol lives in an external reverse-engineering handoff the doc points to. |

## Panels and export

| Document | What it is |
|---|---|
| [Panel export pipeline plan](panel-export-pipeline-plan.md) | Turning a panel into a self-contained JUCE artifact — a VST3 or standalone built fresh per panel. The scripts that do it are `tools/scripts/export-panel-vst3.mjs` and friends. |
| [Windows installer setup](windows-installer.md) | The Inno Setup 6 packaging flow and the `build/` layout it expects. The script is `tools/installer/CEditor.iss`. |

## Instrument host

| Document | What it is |
|---|---|
| [Hostage integration audit](instrument-host-integration-audit.md) | The Hostage baseline's required first task: what the host builder reuses (bridge, documents, settings, pages, CTRL49, export identity, installer route), what is genuinely new (hosting, the audio path, the scanner helper), and the documented deviations. |
| [Generated instrument-host product](instrument-host-product.md) | Stage 1 as built: one service under four consumers (editor tab, `CEHostStandalone`, `CEHostVST3`, tests), the Host Project manifest with its minted-once installer identity, and the assemble-don't-compile build pipeline (`tools/scripts/build-host-product.mjs` + `tools/installer/HostProductTemplate.iss`). Ends with what Stage 1 leaves open. |
| [The modular chain](modular-chain.md) | *As built.* Instruments, MIDI modules and inserts as separate things: the per-part MIDI insert chain that replaced the welded FX-into-arp pair (with its migration), group buses where several parts become one signal that keeps going, and chain presets that keep a whole voice — instrument, modules, inserts and zone — as one library record. Ends with what it deliberately does not do. |
| [Reliability, diagnostics and the support bundle](instrument-host-reliability.md) | The baseline's §17 layer, built after the seven functionality stages: the architecture check that keeps an unloadable module out of the browser without calling it broken, safe startup after a plug-in takes the process down, a last-known-good session that is not the crash, and a support bundle gathered by allowlist. Carries the §18.12 handover material for the host as a whole — compatibility matrix, known limitations, failure fixtures and a manual test plan. |
| [Feature-list completion audit](hostage-feature-completion-audit.md) | Evidence matrix for the 36 requested Hostage additions: persistent/native/UI/test ownership per item, permitted browser verification, and the two remaining completion gates (native rebuild and real out-of-process crash isolation). |
| [Live plug-in process isolation](plugin-process-isolation.md) | Concrete worker/proxy, real-time IPC, recovery and acceptance-test contract required before Automatic Failover can claim native-crash containment. |

## Controls and components

| Document | What it is |
|---|---|
| [Ready-made slider guide](slider-ready-made-implementation-guide.md) | Adding sliders as ready-made components without pre-empting the Component Designer. Superseded in scope by the unified family guide below. |
| [Unified slider family guide](slider-unified-family-implementation-guide.md) | The full slider family — linear and circular together — replacing the more conservative linear-first plan. |

## The Custom Component creator

The creator's redesign plan (`custom-component-creator-redesign-plan.md`) went with the rest of
the design-note tree. Its §1–§11 had all shipped; its §12 roadmap — the array primitive and
indexed repeats landed, the arpeggiator write-side, responsive anchors, theme tokens and the
sharing gallery did not — is in git history only.

This used to be a four-document chain, read in order. The other three are retired, and what
outlived them is here rather than in a document that reads as open:

- **Properties panel review** — the taxonomy diagnosis. It produced the four-stage restructure,
  all four of which shipped on 2026-07-12 and are verifiable in the code: the tabs are gated on
  `componentWorkspaceMode`, `CustomDesignerEditor.svelte` is gone, `CustomInteractEditor` is the
  cluster view, `CustomReactEditor` is the React group with its sub-nav. Its closing "what not to
  do" was guidance, not work, and is now §2 of the redesign plan.
- **Properties panel restructure stages** — the plan those four stages came from. Its one
  remaining half, the W0 decomposition, was done on 2026-08-23.
- **Designer workspace review** — closed out the same day: regressions restored, five bugs fixed
  or verified, Tier 0 and Tier 1 complete, the feasible Tier 2 items done, the theming pass
  applied, and the §5 decomposition finished at eight components. The decisions it raised that
  nobody acted on are in [known-issues.md](../known-issues.md). Pinned by
  `CE/web/test/surfaceDecomposition.test.js`.

## Post-beta bets

Plans, not commitments. Each says what the thing is, why it would matter, and what it would cost —
written to be argued with before anybody builds one. The overview is
[beta differentiation](../beta-differentiation.md).

| Document | What it is |
|---|---|
| [The rack canvas](rack-canvas-plan.md) | *Nothing built.* Why the instrument host reads as a form rather than an instrument, and the proposal it deserves: thumbnail nodes on a canvas, wired the way Reason cables devices, with one bottom dock showing whichever node is selected. Names the tension that decides it — Reason's wires imply arbitrary routing and this engine's topology is deliberately constrained — and carries a running idea log. |
| [Tier 3 moonshots](tier-3-moonshots.md) | The post-beta bets, ranked, and the Tier 1 story in plain English. |
| [The Sound Browser](sound-browser-plan.md) | *Stages A–F built, B2 included.* The preset system, which is what the product this succeeds was bought for. The proposal is to index sounds rather than files — one record for a vendor preset, a captured state, a hardware patch, a chain or a rack — and to play every one of them once, offline, so the browser filters on what was measured rather than on what a vendor typed. Instant audition from the probe render, versions instead of overwrites, a map, and a substitute when the plug-in is missing. Five screens are drawn in [`sound-browser-mockups.html`](sound-browser-mockups.html). Stage A — the workspace, facets with exclusion, counts that predict the click, saved queries — is in `SoundBrowser.svelte` over `LibraryQuery` in `Library.h`. Stage B is the auditioner: `SonicProbe.h` plays every preset once and `SonicProfile` is what it wrote down, which is what the measured range filters, the drawn thumbprints and the duplicate fold all read. Stage C is instant audition: the render is kept as a small FLAC so a click makes a sound now while the plug-in loads behind it, and `RecentPlay` remembers your last few bars so the handoff plays your own line rather than a middle C. Stage D replaces overwriting with versions — a retention rule rather than a rail is the design work — and compares two saves by parameter through the plug-in that understands them. Stage E spends the distance function three times — "sounds like", a map of two measured axes whose rectangular selection IS a saveable query, and the nearest thing you own when a rack's plug-in has gone. Stage F puts the library on the hardware without naming a device: a surface arrives as its capabilities and the browser is built to fit it, or is told in a sentence what it cannot do — and the bytes now travel, on the knob page the device already has, over the command surface the workspace uses, so the screen follows the hands. Stage B2 moves the listening into a child process — the worker reports a line per preset, so a crash at preset 300 keeps the 299 before it and blames the one sound that caused it rather than the whole plug-in. Each stage ends with what building it found. Ends with what a real VST3 found that the stub could not — a bug in which every preset was measured with the previous preset's sound. |
| [Capture Session](capture-session-plan.md) | Learning a synth from the synth: turn its knobs, watch what it sends, write the profile. |
| [Total Recall](total-recall-plan.md) | Hardware that behaves like a plugin — the session restores the rig's state. |
| [Ctrlr import](ctrlr-import-plan.md) | Reading the existing Ctrlr panel library, so a user's collection is not stranded. |
| [The MIDI frontier](midi-frontier.md) | *Nothing built.* An idea record, not a plan: thirty-odd things this program could do with a cable that other editors structurally cannot, organised as seven theses — hardware that has an undo, MIDI that is not late, a synth that describes itself by sound as well as by bytes, patches as data with arithmetic, the panel playing like hardware that costs more, a rig that verifies itself before the gig, and a section of deliberately unhinged ones. Each entry names what it stands on in the tree and carries its limits in the same breath as its pitch. Ends with a ranking, a pick of three, and the one property they all descend from: the device layer compiles intent, not messages. |

## Deleted records

Seven design records were deleted in `2d436bae` ("Delete the design-note tree") — the code and
its tests are the record now, and git history holds the reasoning. Documents here and in
`docs/` still name them in plain text where the reasoning is worth chasing:
`device-profile-engine-mvp-plan.md`, `button-system-redesign-spec.md`,
`interactive-components-implementation-spec.md`, `custom-component-creator-redesign-plan.md`,
`scripting-modules-design.md`, `program-completeness-review-2026-08-03.md` and
`beta-readiness-review-2026-08-10.md`.
