# CEditor docs index

## Scripting — read in this order

| # | Document | What it is |
|---|---|---|
| 1 | [Scripting manual](scripting-manual.md) | **The user-facing API reference.** Generated from `panelApi.js` (`npm run docs:manual` in `CE/web`) — never edit it by hand. |
| 2 | [Scripting cookbook](scripting-cookbook.md) | Task-based recipes: link controls, fill the panel from a dump, blink an LED on a timer… |
| 3 | [Panel API spec](../tools/docs/panel-api-spec.md) | The design decisions (Q1–Q11) behind the API — the contract and its *why*. |
| 4 | [Scripting redesign plan](../tools/docs/scripting-redesign-plan.md) | Why scripting works this way: lifecycle spine, scope layers, the many-real-languages model, Model 2 runtime. |
| 5 | [Language options & shippable export](scripting-language-options-and-shippable-export.md) | Per-language toolchains, installer options, exporting from an installed app. |
| — | [Scripting architecture plan](../tools/docs/scripting-architecture-plan.md) | ⚠️ **Historical.** The retired command-graph model; superseded by 3 and 4. |

Working notes: [runtime gaps](../CE/web/src/CE_Application/docs/scripting-runtime-gaps.md) (what the
API advertises vs what the C++ runtime backs), [timer system](../CE/web/src/CE_Application/docs/timer-system.md),
and the [manual review of 2026-08-02](scripting-manual-review-2026-08-02.md) that produced this index.

## Other documents here

- [Project review 2026-07-02](project-review-2026-07-02.md)
- [License decision](license-decision.md)
- [Verify end-to-end](verify-end-to-end.md)

Component and panel-part design docs live in `CE/web/src/CE_Application/docs/`; editor/tooling
design docs in `tools/docs/`.
