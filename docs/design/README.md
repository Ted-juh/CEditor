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
| [Tier 3 moonshots](tier-3-moonshots.md) | The post-beta bets, ranked, and the Tier 1 story in plain English. |
| [Capture Session](capture-session-plan.md) | Learning a synth from the synth: turn its knobs, watch what it sends, write the profile. |
| [Total Recall](total-recall-plan.md) | Hardware that behaves like a plugin — the session restores the rig's state. |
| [Ctrlr import](ctrlr-import-plan.md) | Reading the existing Ctrlr panel library, so a user's collection is not stranded. |

## Deleted records

Seven design records were deleted in `2d436bae` ("Delete the design-note tree") — the code and
its tests are the record now, and git history holds the reasoning. Documents here and in
`docs/` still name them in plain text where the reasoning is worth chasing:
`device-profile-engine-mvp-plan.md`, `button-system-redesign-spec.md`,
`interactive-components-implementation-spec.md`, `custom-component-creator-redesign-plan.md`,
`scripting-modules-design.md`, `program-completeness-review-2026-08-03.md` and
`beta-readiness-review-2026-08-10.md`.
