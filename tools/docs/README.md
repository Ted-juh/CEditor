# tools/docs index

Design records for the editor and its tooling. These are **not** user documentation — they are
the decisions, the reasoning behind them, and the plans that carried them out. User-facing docs
live in [`docs/`](../../docs/README.md).

A design record does not track the code. Where a document says something is shipped, the code has
moved on since; where it describes a plan, some of it may never have been built. Each one is
described below as what it *is*, and any status it carries about itself is repeated here. **When a
design record and the code disagree, the code is right.**

## Scripting

| Document | What it is |
|---|---|
| [Panel API spec](panel-api-spec.md) | The scripting API contract as eleven settled questions (Q1–Q11): addressing, events, lifecycle, scopes, errors. A LOCKED answer records what was decided then — later rounds added hooks and commands that were never backfilled here. For the surface as it stands, read the [scripting manual](../../docs/scripting-manual.md). |
| [Scripting redesign plan](scripting-redesign-plan.md) | Why scripting works the way it does: what needs scripts, the lifecycle spine, scope layers, and the many-real-languages model. Carries its own status — largely shipped, with §1 kept as historical motivation. |
| [Scripting architecture plan](scripting-architecture-plan.md) | ⚠️ **Superseded.** The language-neutral "command graph" model, rejected and removed from the codebase. Only its sandbox, loop guards, scope model and validation-as-guidance survived. |

The `ce.*` module system has its own record in [`docs/scripting-modules-design.md`](../../docs/scripting-modules-design.md),
with an *as built* section per phase.

## Devices and MIDI

| Document | What it is |
|---|---|
| [Device profile engine MVP plan](device-profile-engine-mvp-plan.md) | The first plan for the device profile and MIDI layer, on one architectural decision: build a device *intent compiler*, not a SysEx generator. The engine it plans exists as `CE/src/DeviceProfile/`. |
| [MIDI 2.0 integration plan](midi2-integration-plan.md) | The deferred plan for MIDI 2.0 — MIDI-CI first so capable devices can describe themselves, UMP second. Some MIDI-CI work has since landed in `CE/src/DeviceProfile/`; read the plan for the reasoning, the code for what exists. |

## Panels and export

| Document | What it is |
|---|---|
| [Panel export pipeline plan](panel-export-pipeline-plan.md) | Turning a panel into a self-contained JUCE artifact — a VST3 or standalone built fresh per panel. The scripts that do it are `tools/scripts/export-panel-vst3.mjs` and friends. |
| [Windows installer setup](windows-installer.md) | The Inno Setup 6 packaging flow and the `build/` layout it expects. The script is `tools/installer/CEditor.iss`. |

## Controls and components

| Document | What it is |
|---|---|
| [Button system redesign spec](button-system-redesign-spec.md) | The button-first model that replaced the over-abstracted interaction system, specified before it was built. |
| [Interactive components implementation spec](interactive-components-implementation-spec.md) | Unifying interactive controls on the existing section system rather than replacing it. |
| [Ready-made slider guide](slider-ready-made-implementation-guide.md) | Adding sliders as ready-made components without pre-empting the Component Designer. Superseded in scope by the unified family guide below. |
| [Unified slider family guide](slider-unified-family-implementation-guide.md) | The full slider family — linear and circular together — replacing the more conservative linear-first plan. |

## The Custom Component creator

Read in this order; each one is a response to the one before it.

| # | Document | What it is |
|---|---|---|
| 1 | [Creator redesign plan](custom-component-creator-redesign-plan.md) | What was wrong with the creator, the principles constraining the fix, and the phased plan: remove bookkeeping, never remove capability. |
| 2 | [Properties panel review](cc-properties-panel-review.md) | The diagnosis its predecessor did not touch — the *taxonomy* of the properties panel. Its own phasing sketch (§6) is superseded by 3. |
| 3 | [Properties panel restructure stages](cc-properties-panel-restructure-stages.md) | The implementation plan for 2: four independently shippable stages. Records all four as shipped on 2026-07-12. |
| 4 | [Designer workspace review](cc-designer-workspace-review.md) | The other half of the editor — canvas, palette, bars, docks — audited against the code, and the regressions that audit found. |

## Snapshots

- [Legacy controls snapshot](legacy-controls/README.md) — the pre-rewrite interactive control
  system, kept as a parts bin rather than a base architecture. The code it describes is beside it
  under `legacy-controls/reference/`, at its original source paths.
