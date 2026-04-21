# Legacy Controls Snapshot

This folder preserves the pre-rewrite interactive control system as reference material.

It exists for two reasons:

- Keep a browsable copy of the old button/range/slider code while we redesign controls from the ground up.
- Make it easy to salvage small useful pieces without dragging the whole old architecture back in.

## Exact-State Backup

- Git backup branch: `codex-legacy-controls-backup-2026-04-21`
- Working branch was left unchanged.
- The branch was created only as a recovery/reference point.

## Snapshot Layout

- Reference root: [reference](C:/dev/Projects/CEditor/docs/legacy-controls/reference)
- Source paths are preserved under `reference/` so diffs and lookups stay obvious.

Included areas:

- Behavior and binding editors
- Component type registry and interactive defaults
- Interaction runtime and preview session store
- Range/enum/select helper utilities
- Preview surfaces and interactive part rendering
- Insert/menu entry points
- Existing implementation spec doc

## Likely Reusable Pieces

- `enumBehavior.js`: enum normalization and cycling
- `rangeBehavior.js`: numeric clamping, stepping, scrubbing, formatting
- `interactionPreview.js`: preview session shape and reset/update patterns
- `InteractivePartRenderer.svelte`: part-level background/text/input rendering idea
- `selectGroupUtils.js`: exclusive group logic for radio/segmented-style controls

## Likely Not Worth Reusing As-Is

- The generalized `family / role / valueType` authoring model for basic button setup
- The current all-in-one behavior editor flow
- The old mental model that grouped buttons and sliders together too early
- The amount of indirection between behavior, parts, bindings, and states for simple controls

## Rewrite Guidance

For the new control system, treat this snapshot as a parts bin, not as a base architecture.

Recommended mindset:

- Rebuild the authoring model from first principles.
- Pull back only isolated utilities or rendering ideas when they clearly simplify the new system.
- Do not preserve old abstractions just because code already exists.

## Reference Files

- [BehaviorEditor.svelte](C:/dev/Projects/CEditor/docs/legacy-controls/reference/CE/web/src/CE_Application/sections/BehaviorEditor.svelte)
- [BindingsEditor.svelte](C:/dev/Projects/CEditor/docs/legacy-controls/reference/CE/web/src/CE_Application/sections/BindingsEditor.svelte)
- [componentTypes.js](C:/dev/Projects/CEditor/docs/legacy-controls/reference/CE/web/src/CE_Application/models/componentTypes.js)
- [interactionDefaults.js](C:/dev/Projects/CEditor/docs/legacy-controls/reference/CE/web/src/CE_Application/models/interactionDefaults.js)
- [interactionRuntime.js](C:/dev/Projects/CEditor/docs/legacy-controls/reference/CE/web/src/CE_Application/utils/interactionRuntime.js)
- [interactionPreview.js](C:/dev/Projects/CEditor/docs/legacy-controls/reference/CE/web/src/CE_Application/stores/interactionPreview.js)
- [rangeBehavior.js](C:/dev/Projects/CEditor/docs/legacy-controls/reference/CE/web/src/CE_Application/utils/rangeBehavior.js)
- [enumBehavior.js](C:/dev/Projects/CEditor/docs/legacy-controls/reference/CE/web/src/CE_Application/utils/enumBehavior.js)
- [CanvasControl.svelte](C:/dev/Projects/CEditor/docs/legacy-controls/reference/CE/web/src/CE_Application/editor/CanvasControl.svelte)
- [InteractivePartRenderer.svelte](C:/dev/Projects/CEditor/docs/legacy-controls/reference/CE/web/src/CE_Application/editor/InteractivePartRenderer.svelte)
- [PanelPreviewSurface.svelte](C:/dev/Projects/CEditor/docs/legacy-controls/reference/CE/web/src/CE_Application/editor/PanelPreviewSurface.svelte)
- [InteractiveTestSurface.svelte](C:/dev/Projects/CEditor/docs/legacy-controls/reference/CE/web/src/CE_Application/components/InteractiveTestSurface.svelte)
- [InteractionPreviewTab.svelte](C:/dev/Projects/CEditor/docs/legacy-controls/reference/CE/web/src/CE_Application/components/InteractionPreviewTab.svelte)
- [interactive-components-implementation-spec.md](C:/dev/Projects/CEditor/docs/legacy-controls/reference/docs/interactive-components-implementation-spec.md)
