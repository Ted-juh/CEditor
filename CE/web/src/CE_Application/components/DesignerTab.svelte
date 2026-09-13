<script>
  /**
   * The Designer tab — one tab, many editors.
   *
   * Candidate 9 of the display-panel plan. See docs/design/designer-tab-design.md.
   *
   * WHAT IT IS FOR. Fourteen components in this app have content that is a drawing: a pattern, a
   * curve, a register, a keyboard split. None of it can be authored. The properties panel has no
   * drawing surface for any of them, and preview mode — which does have drawing for several — is a
   * rehearsal that puts the document back when it stops. Measured, and pinned by a test.
   *
   * The Step Sequencer is worse off than the rest: it cannot be drawn even in preview. Its layout
   * module has had the hit test and both writers all along and nothing imported them.
   *
   * HOW IT IS BUILT. A registry, not a switch: `DESIGNER_COMPONENTS` in utils/designerModel.js says
   * which component types have a designer, and this file maps the three that are built to their
   * component. Adding a fourth is a row and an import. That shape is the point — the candidate list
   * called this "the largest piece of work here" and said to prove the pattern on one component
   * first, and `rack-canvas-plan.md` proposes the same mechanism for the instrument host.
   *
   * Every designer draws with the component's OWN renderer, at dock size, with a hit layer over it.
   * The geometry and the writes come from the component's own layout module. Nothing here is a
   * second drawing of anything.
   *
   * THE PROPERTIES PANEL IS UNTOUCHED. Every section editor still draws every row it drew.
   */
  import { onMount } from 'svelte';
  import SequencerDesigner from './designer/SequencerDesigner.svelte';
  import EnvelopeDesigner from './designer/EnvelopeDesigner.svelte';
  import TuringDesigner from './designer/TuringDesigner.svelte';
  import { activePanel, selectedComponentIds } from '../stores/panels.js';
  import { getSection } from '../stores/controls.js';
  import { flatControls } from '../utils/containment.js';
  import { previewModeEnabled } from '../stores/interactionPreview.js';
  import {
    editorTarget,
    activateEditorTarget,
    armEditorTargetIfIdle,
    clearEditorTarget,
    targetOfKind,
  } from '../stores/editorTarget.js';
  import { designerForControl, builtDesigners, pendingDesigners } from '../utils/designerModel.js';

  /** The registry's built rows, bound to the component that draws each one. */
  const DESIGNERS = {
    StepSequencer: SequencerDesigner,
    Envelope: EnvelopeDesigner,
    Turing: TuringDesigner,
  };

  let mine = $derived(targetOfKind($editorTarget, 'designer'));
  let panelControls = $derived(flatControls($activePanel?.controls ?? []));

  let control = $derived(
    mine?.controlId
      ? panelControls.find((entry) => entry._children?.Core?.id === mine.controlId) ?? null
      : null
  );

  let controlId = $derived(control?._children?.Core?.id ?? '');
  let controlName = $derived(control?._children?.Core?.name || control?._children?.Core?.controlType || '');
  let entry = $derived(control ? designerForControl(control) : null);
  let Designer = $derived(entry?.built ? DESIGNERS[entry.type] ?? null : null);
  let hasSection = $derived(entry ? !!getSection(control, entry.section) : false);

  // What the panel has that this tab could take next, so the registry is visible rather than a
  // silent list of three.
  let pending = pendingDesigners();
  let onPanel = $derived(
    panelControls
      .map((c) => designerForControl(c))
      .filter((row) => row && !row.built)
      .map((row) => row.label)
  );

  // Arm from the selection only when NOTHING is armed — not merely when nothing of this kind is.
  // A target of another kind means another tab is being opened right now, and stealing it is how
  // the properties panel's opener buttons looked broken. See stores/editorTarget.js.
  onMount(() => {
    if (mine) return;
    const first = [...($selectedComponentIds ?? [])][0];
    if (first) armEditorTargetIfIdle('designer', first);
  });

  /** The explicit button: the user saying so out loud, which may take the target from another tab. */
  function armFromSelection() {
    const first = [...($selectedComponentIds ?? [])][0];
    if (first) activateEditorTarget('designer', first);
  }

  let selectionHasDesigner = $derived.by(() => {
    const first = [...($selectedComponentIds ?? [])][0];
    if (!first) return false;
    const found = panelControls.find((c) => c._children?.Core?.id === first);
    return !!designerForControl(found)?.built;
  });
</script>

<div class="des-tab">
  {#if !control}
    <div class="empty">
      <strong>Nothing armed.</strong>
      <p>
        Select a Step Sequencer, an Envelope or a Turing Modulator on the canvas, then use the button
        below. This tab stays on the control you open it with, so it will not change under you while
        you draw.
      </p>
      <button type="button" class="arm" disabled={!($selectedComponentIds?.size)} onclick={armFromSelection}>
        {($selectedComponentIds?.size) ? 'Design the selected control' : 'Select a control first'}
      </button>
      <p class="lists">Built: {builtDesigners().map((row) => row.label).join(' · ')}</p>
    </div>
  {:else if !entry}
    <div class="empty">
      <strong>{controlName} has nothing to draw.</strong>
      <p>
        This tab edits the components whose content is a drawing — a pattern, a curve, a register.
        A {control?._children?.Core?.controlType} is edited entirely in the properties panel.
      </p>
      <button type="button" class="arm" onclick={armFromSelection}>Use the selection</button>
    </div>
  {:else if !entry.built}
    <div class="empty">
      <strong>No designer for a {entry.label} yet.</strong>
      <p>
        Its {entry.content} is a {entry.shape} and it belongs here. Three are built —
        {builtDesigners().map((row) => row.label).join(', ')} — and {pending.length} are not:
        {pending.map((row) => row.label).join(', ')}.
      </p>
      <p class="lists">
        Until then a {entry.label}'s {entry.content} is drawn in preview mode, and preview is a
        rehearsal: the drawing goes back when preview stops.
      </p>
      <button type="button" class="arm" disabled={!selectionHasDesigner} onclick={armFromSelection}>
        {selectionHasDesigner ? 'Design the selected control' : 'Select one that has a designer'}
      </button>
    </div>
  {:else if !hasSection}
    <div class="empty">
      <strong>{controlName} has no {entry.section} section.</strong>
      <button type="button" class="arm" onclick={armFromSelection}>Use the selection</button>
    </div>
  {:else}
    <div class="head">
      <span class="who">
        designing <b>{controlName}</b>
        <em>{entry.label}</em>
        {#if !($selectedComponentIds?.has?.(controlId))}
          <i class="stale" title="Not the control that is selected now — the tab stays where you opened it">not selected</i>
        {/if}
      </span>

      {#if $previewModeEnabled}
        <span class="alarm" role="status">
          Preview is running — it puts the panel back when it stops, so draw here with preview off
        </span>
      {/if}

      <div class="headtools">
        <button type="button" disabled={!($selectedComponentIds?.size)} onclick={armFromSelection}
                title="Point this tab at the control that is selected now">Use selection</button>
        <button type="button" onclick={clearEditorTarget} title="Stop designing this control">Clear</button>
      </div>
    </div>

    <Designer {control} {controlId} />

    {#if onPanel.length}
      <p class="foot">
        Also on this panel with nothing to draw with yet: {[...new Set(onPanel)].join(', ')}.
      </p>
    {/if}
  {/if}
</div>

<style>
  .des-tab {
    height: 100%;
    display: flex;
    flex-direction: column;
    min-height: 0;
    overflow: auto;
    background: #15181B;
  }

  .head {
    display: flex; align-items: center; gap: 10px;
    padding: 6px 10px; border-bottom: 1px solid #2A2A2A;
    flex: 0 0 auto; flex-wrap: wrap;
  }

  .who { font: 500 9.5px/1 'IBM Plex Mono', ui-monospace, monospace; color: #616C75; white-space: nowrap; }
  .who b { color: #8FEDE3; font-weight: 600; }
  .who em { font-style: normal; margin-left: 6px; color: #8A949C; }
  .who .stale {
    font-style: normal; margin-left: 6px; color: #E5A029;
    border: 1px solid #4A3A1C; background: #241d10; border-radius: 2px; padding: 2px 4px;
  }

  .alarm {
    font: 600 9px/1.4 'IBM Plex Sans', system-ui, sans-serif; color: #F0D48A;
    border: 1px solid #6B4A1E; background: #241d10; border-radius: 3px; padding: 4px 7px;
  }

  .headtools { margin-left: auto; display: flex; gap: 4px; }
  .headtools button {
    border: 1px solid #333B42; background: #12171A; color: #9AA6AE;
    font: 600 9px/1 'IBM Plex Sans', system-ui, sans-serif;
    padding: 5px 8px; border-radius: 3px; cursor: pointer;
  }
  .headtools button:hover:not(:disabled) { border-color: #4A555E; color: #E8EEF5; }
  .headtools button:disabled { opacity: 0.4; cursor: default; }

  .foot {
    margin: 0; padding: 0 10px 10px;
    font: 400 9px/1.5 'IBM Plex Sans', system-ui, sans-serif; color: #4B545C;
  }

  .empty { padding: 22px; max-width: 52ch; color: #8A949C; }
  .empty strong { display: block; font: 600 13px/1.4 'IBM Plex Sans', system-ui, sans-serif; color: #E8EEF5; }
  .empty p { margin: 8px 0 14px; font: 400 12px/1.6 'IBM Plex Sans', system-ui, sans-serif; }
  .empty .lists { font-size: 11px; color: #69737B; }

  .arm {
    border: 1px solid #0E7C70; background: #0B2320; color: #8FEDE3;
    font: 600 11px/1 'IBM Plex Sans', system-ui, sans-serif;
    padding: 8px 12px; border-radius: 3px; cursor: pointer;
  }
  .arm:disabled { opacity: 0.45; cursor: default; border-color: #333B42; background: #12171A; color: #69737B; }
</style>
