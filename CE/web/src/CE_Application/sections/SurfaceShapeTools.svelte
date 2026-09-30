<script>
  /**
   * The design surface's shape operations: combining the selection into a live combined shape
   * (utils/booleanGroups.js — unite, subtract, intersect, exclude), and for a selected shape its
   * toolbar (switch the operation, Release, Flatten); Smooth for a selected Pen path; and keeping each
   * shape's cached outline in step with its operands.
   *
   * Lifted out of CustomDesignSurfaceEditor with its state and styles, as the other surface regions
   * were (test/surfaceDecomposition.test.js). The editor keeps the Combine buttons in its alignment
   * toolbar and calls `combine()` here.
   */
  import SquaresUnite from 'lucide-svelte/icons/squares-unite';
  import SquaresSubtract from 'lucide-svelte/icons/squares-subtract';
  import SquaresIntersect from 'lucide-svelte/icons/squares-intersect';
  import SquaresExclude from 'lucide-svelte/icons/squares-exclude';
  import Spline from 'lucide-svelte/icons/spline';
  import { applyControlPatch } from '../stores/controls.js';
  import { flushHistory, setHistoryRecordingSuppressed } from '../stores/history.js';
  import { applyPartPatch, planFlatten, planPathSmooth } from '../utils/partBooleans.js';
  import {
    BOOLEAN_LABELS, BOOLEAN_OPERATIONS, booleanSpec, isBooleanGroup, planBooleanGroup, refreshedGroup,
    releasedParts, withOperation,
  } from '../utils/booleanGroups.js';

  let {
    controlId = '',
    control = null,
    authoredParts = {},
    parts = {},
    selectedLayerNames = [],
    selectedLayer = '',
    selectedAuthoredPart = null,
    activeSelectionKind = 'layer',
    penEditPart = null,
    activeSelectionFrame = null,
    interaction = null,
    designerPreviewing = false,
    artboardWidth = 1,
    artboardHeight = 1,
    toolbarTop = (frame) => frame.top - 30,
    stopSelectionAction = () => {},
    onSelection = () => {},
    onNotice = () => {},
    busy = $bindable(false),
  } = $props();

  const ICONS = { unite: SquaresUnite, subtract: SquaresSubtract, intersect: SquaresIntersect, exclude: SquaresExclude };

  let selectedGroup = $derived(activeSelectionKind === 'layer' && selectedLayerNames.length === 1 && isBooleanGroup(selectedAuthoredPart)
    ? { name: selectedLayer, spec: booleanSpec(selectedAuthoredPart) } : null);

  function select(names, primary = names[names.length - 1] ?? '') {
    onSelection(names);
    return {
      'Designer.selectedLayer': primary,
      'Designer.selectedLayers': names,
      'Designer.selectedSurfaceKind': 'layer',
    };
  }

  function refusal(verb, plan) {
    const first = plan.refused[0];
    onNotice(`Can't ${verb}: ${first.name ? `${first.name} — ` : ''}${first.reason}`);
  }

  /**
   * Combine the selected shapes into a live combined shape: the operands are kept, so nothing that
   * names them breaks, and the shape follows them. One write of the Parts section, one undo.
   */
  export async function combine(operation) {
    if (!controlId || selectedLayerNames.length < 2 || busy) return;
    busy = true;
    try {
      const entries = selectedLayerNames.map((name) => [name, authoredParts?.[name] ?? null, parts?.[name]]);
      const plan = await planBooleanGroup(authoredParts, entries, operation, { artboardWidth, artboardHeight });
      if (!plan.ok) {
        refusal(BOOLEAN_LABELS[operation].toLowerCase(), plan);
        return;
      }
      applyControlPatch(controlId, { 'Parts._children': plan.parts, ...select([plan.groupName]) });
      onNotice(plan.empty
        ? `${BOOLEAN_LABELS[operation]}: the shapes do not overlap, so ${plan.groupName} is empty for now`
        : `${BOOLEAN_LABELS[operation]}: ${entries.length} shapes into ${plan.groupName}`);
    } finally {
      busy = false;
    }
  }

  function setOperation(operation) {
    if (!controlId || !selectedGroup || selectedGroup.spec.operation === operation) return;
    applyControlPatch(controlId, { 'Parts._children': withOperation(authoredParts, selectedGroup.name, operation) });
  }

  // Release: the shape goes and its operands draw as themselves again, exactly as they were.
  function release() {
    if (!controlId || !selectedGroup) return;
    // Captured first: the write below deselects the shape, and `selectedGroup` with it.
    const { name, spec } = selectedGroup;
    applyControlPatch(controlId, { 'Parts._children': releasedParts(authoredParts, name), ...select(spec.operands) });
    onNotice(`Released ${name}`);
  }

  // Flatten: bake the shape into one path and drop its operands (refused while anything names them).
  async function flatten() {
    if (!controlId || !selectedGroup || busy) return;
    busy = true;
    try {
      const name = selectedGroup.name;
      const plan = await planFlatten(control, authoredParts, parts, name, { artboardWidth, artboardHeight });
      if (!plan.ok) {
        refusal('flatten', plan);
        return;
      }
      applyControlPatch(controlId, { 'Parts._children': plan.parts, ...select([name]) });
      onNotice(`Flattened ${name}`);
    } finally {
      busy = false;
    }
  }

  // Smooth a Pen path into a curve through the same points.
  async function smooth() {
    if (!controlId || !penEditPart || busy) return;
    busy = true;
    try {
      const name = penEditPart.name;
      const plan = await planPathSmooth(parts?.[name], { artboardWidth, artboardHeight });
      if (!plan.ok) { onNotice(plan.reason); return; }
      applyControlPatch(controlId, { [`Parts.${name}`]: applyPartPatch(authoredParts[name], plan.patch) });
      onNotice(`Smoothed ${name}`);
    } finally {
      busy = false;
    }
  }

  // Keep each shape's cached outline and box in step with its operands, so a panel paints it at once
  // instead of computing it first. After an edit settles (past the history debounce), and not as an
  // undo step of its own: undo brings the operands back, and the cache follows them again.
  let refreshTimer = null;
  $effect(() => {
    const authored = authoredParts;
    const resolved = parts;
    const id = controlId;
    const width = artboardWidth;
    const height = artboardHeight;
    if (!id || interaction || designerPreviewing) return;
    const groups = Object.entries(authored ?? {}).filter(([, part]) => isBooleanGroup(part));
    if (!groups.length) return;
    clearTimeout(refreshTimer);
    refreshTimer = setTimeout(async () => {
      const patch = {};
      for (const [name, group] of groups) {
        const next = await refreshedGroup(group, resolved?.[name], width, height);
        if (!next) continue;
        patch[`Parts.${name}.meta.cache`] = next.meta.cache;
        for (const [key, value] of Object.entries(next._children.Layout)) patch[`Parts.${name}.Layout.${key}`] = value;
      }
      if (!Object.keys(patch).length || controlId !== id) return;
      flushHistory();
      setHistoryRecordingSuppressed(true);
      try {
        applyControlPatch(id, patch);
      } finally {
        setHistoryRecordingSuppressed(false);
      }
    }, 650);
    return () => clearTimeout(refreshTimer);
  });
</script>

{#if !designerPreviewing && penEditPart && !interaction && activeSelectionFrame}
  <div
    class="align-toolbar shape-toolbar"
    style={`left:${Math.max(0, activeSelectionFrame.left)}px;top:${toolbarTop(activeSelectionFrame)}px;`}
    role="toolbar"
    tabindex="-1"
    aria-label="Path"
    onmousedown={stopSelectionAction}
  >
    <button type="button" data-path-smooth onclick={smooth} disabled={busy} title="Smooth: a curve through the same points" aria-label="Smooth"><Spline size={13} /></button>
  </div>
{/if}

{#if !designerPreviewing && selectedGroup && !interaction && activeSelectionFrame}
  <div
    class="align-toolbar shape-toolbar"
    style={`left:${Math.max(0, activeSelectionFrame.left)}px;top:${toolbarTop(activeSelectionFrame)}px;`}
    role="toolbar"
    tabindex="-1"
    aria-label="Combined shape"
    onmousedown={stopSelectionAction}
  >
    {#each BOOLEAN_OPERATIONS as operation (operation)}
      {@const Icon = ICONS[operation]}
      <button type="button" data-group-operation={operation} class:active={selectedGroup.spec.operation === operation}
        onclick={() => setOperation(operation)} title={BOOLEAN_LABELS[operation]} aria-label={BOOLEAN_LABELS[operation]}
        aria-pressed={selectedGroup.spec.operation === operation}><Icon size={13} /></button>
    {/each}
    <span class="toolbar-sep"></span>
    <button type="button" data-group-release onclick={release} title="Release: the operands draw as themselves again">Release</button>
    <button type="button" data-group-flatten onclick={flatten} disabled={busy} title="Flatten: bake into one path and remove the operands">Flatten</button>
  </div>
{/if}

<style>
  .shape-toolbar {
    position: absolute;
    z-index: 2420;
    display: flex;
    align-items: center;
    gap: 2px;
    padding: 2px 4px;
    border-radius: 6px;
    background: rgba(30, 30, 36, 0.94);
    border: 1px solid rgba(120, 130, 150, 0.4);
    box-shadow: 0 3px 12px rgba(0, 0, 0, 0.35);
  }

  .shape-toolbar button {
    min-width: 22px;
    height: 20px;
    padding: 0 3px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border: none;
    border-radius: 4px;
    background: transparent;
    color: rgba(222, 228, 238, 0.92);
    font-size: 12px;
    line-height: 1;
    cursor: pointer;
  }

  .shape-toolbar button:hover:not(:disabled) {
    background: rgba(91, 155, 213, 0.3);
  }

  .shape-toolbar button:disabled {
    opacity: 0.35;
    cursor: default;
  }

  .shape-toolbar button.active {
    background: rgba(20, 184, 166, 0.35);
  }

  .toolbar-sep {
    width: 1px;
    height: 14px;
    margin: 0 2px;
    background: rgba(120, 130, 150, 0.4);
  }
</style>
