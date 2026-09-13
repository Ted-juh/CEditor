<script>
  /**
   * The Typography tab.
   *
   * Two halves switched in the header — Type and Flow — over one control. See
   * `docs/design/typography-tab-design.md` for the argument. The two things worth knowing before
   * editing this file are in `utils/typographyModel.js` (which flow parameters a mode actually
   * reads, mirrored from the layout, and the one decoration descriptor that replaces three) and in
   * `stores/editorTarget.js` (this tab does NOT follow the selection, deliberately).
   *
   * THE PROPERTIES PANEL IS UNTOUCHED. Every section this tab edits is still in the panel and still
   * editable there. Nothing has been relocated: the tab has to be shown to work first, and until
   * then the two are simply two ways into the same properties. `allTypographyFieldLabels()` exists
   * ready for the day the panel's copies come out, because relocating a group without its search
   * index is losing it rather than moving it.
   */
  import { onMount } from 'svelte';
  import TypeFamilies from './typography/TypeFamilies.svelte';
  import TypeSpecimen from './typography/TypeSpecimen.svelte';
  import TypeSettings from './typography/TypeSettings.svelte';
  import FlowModeGrid from './typography/FlowModeGrid.svelte';
  import FlowParams from './typography/FlowParams.svelte';
  import FlowPathEditor from './typography/FlowPathEditor.svelte';
  import EffectPreview from './effects/EffectPreview.svelte';
  import { activePanel, selectedComponentIds } from '../stores/panels.js';
  import { applyControlPatch, updateControlProperty } from '../stores/controls.js';
  import { availableFonts } from '../stores/appSettings.js';
  import { flatControls } from '../utils/containment.js';
  import {
    editorTarget,
    activateEditorTarget,
    armEditorTargetIfIdle,
    setEditorTargetDomain,
    clearEditorTarget,
    targetOfKind,
  } from '../stores/editorTarget.js';
  import {
    FONT_ROOT,
    POSITION_ROOT,
    MULTILINE_ROOT,
    FLOW_MODE_PARAMS,
    SHARED_PATH_PARAMS,
    normalizeFlowMode,
    flowFieldsFor,
    readPathPoints,
    movePathPoint,
    addPathPoint,
    removePathPoint,
    curvePresetPatch,
    matchCurvePreset,
  } from '../utils/typographyModel.js';

  let mine = $derived(targetOfKind($editorTarget, 'typography'));
  let panelControls = $derived(flatControls($activePanel?.controls ?? []));

  let control = $derived(
    mine?.controlId
      ? panelControls.find((entry) => entry._children?.Core?.id === mine.controlId) ?? null
      : null
  );

  let half = $derived(mine?.domain === 'flow' ? 'flow' : 'type');

  let text = $derived(control?._children?.Text ?? null);
  let sections = $derived({
    [FONT_ROOT]: text?._children?.Font ?? {},
    [POSITION_ROOT]: text?._children?.Position ?? {},
    [MULTILINE_ROOT]: text?._children?.Multiline ?? {},
  });

  let font = $derived(sections[FONT_ROOT]);
  let position = $derived(sections[POSITION_ROOT]);
  let mode = $derived(normalizeFlowMode(position?.flowMode));
  let shape = $derived(flowFieldsFor(mode).shape);
  let points = $derived(shape ? readPathPoints(position, mode) : []);
  let currentPreset = $derived(shape ? matchCurvePreset(position, mode) : '');

  let fontEntry = $derived(($availableFonts ?? []).find((entry) => entry.value === font?.family) ?? null);

  // What the panel renders today: 16 flow fields plus the 10 shape properties. The count is shown
  // so the tab is honest about what it is holding back rather than quietly dropping it.
  const TOTAL_FLOW_CONTROLS =
    new Set([...Object.values(FLOW_MODE_PARAMS).flat(), ...SHARED_PATH_PARAMS]).size + 10;
  let shownCount = $derived.by(() => {
    const fields = flowFieldsFor(mode);
    return fields.own.length + fields.shared.length + (fields.shape ? (mode === 'bezier' ? 8 : 2) : 0);
  });

  let controlName = $derived(control?._children?.Core?.name || control?._children?.Core?.controlType || '');
  let hasText = $derived(!!text);

  // Opening the tab arms it on whatever is selected right now, and that is the only moment it
  // retargets — from then on it stays put and the header says what it is holding.
    // Arm from the selection only when NOTHING is armed — not merely when nothing of this kind is.
  // A target of another kind means another tab is being opened right now, and stealing it is how
  // the properties panel's opener buttons looked broken. See stores/editorTarget.js.
onMount(() => {
    if (mine) return;
    const first = [...($selectedComponentIds ?? [])][0];
    if (first) armEditorTargetIfIdle('typography', first, 'type');
  });

  function armFromSelection() {
    const first = [...($selectedComponentIds ?? [])][0];
    if (first) activateEditorTarget('typography', first, half);
  }

  function setField(root, key, value) {
    const id = control?._children?.Core?.id;
    if (!id) return;
    updateControlProperty(id, `${root}.${key}`, value);
  }

  function setFamily(value) {
    setField(FONT_ROOT, 'family', value);
  }

  function setWeight(value) {
    const id = control?._children?.Core?.id;
    if (!id) return;
    applyControlPatch(id, {
      [`${FONT_ROOT}.weightValue`]: value,
      [`${FONT_ROOT}.weight`]: value >= 700 ? 'Bold' : 'Regular',
    });
  }

  function setMode(value) {
    setField(POSITION_ROOT, 'flowMode', value);
  }

  function patch(next) {
    const id = control?._children?.Core?.id;
    if (!id || !Object.keys(next).length) return;
    applyControlPatch(id, next);
  }
</script>

<div class="type-tab">
  {#if !control}
    <div class="empty">
      <strong>Nothing armed.</strong>
      <p>
        Select a control on the canvas, then use the button below. This tab stays on the control you
        open it with, so it will not change under you while you work.
      </p>
      <button type="button" class="arm" disabled={!($selectedComponentIds?.size)} onclick={armFromSelection}>
        {($selectedComponentIds?.size) ? 'Edit the selected control’s type' : 'Select a control first'}
      </button>
    </div>
  {:else if !hasText}
    <div class="empty">
      <strong>{controlName} has no text.</strong>
      <p>This tab edits a control's Text section. Pick a label, button or anything else that draws type.</p>
      <button type="button" class="arm" onclick={armFromSelection}>Use the selection</button>
    </div>
  {:else}
    <div class="head">
      <span class="who">
        editing <b>{controlName}</b>
        {#if !($selectedComponentIds?.has?.(control._children.Core.id))}
          <i class="stale" title="This is not the control currently selected — the tab stays where you opened it">not selected</i>
        {/if}
      </span>

      <div class="halves" role="tablist" aria-label="Typography half">
        <button type="button" role="tab" class:on={half === 'type'} aria-selected={half === 'type'}
                onclick={() => setEditorTargetDomain('type')}>Type</button>
        <button type="button" role="tab" class:on={half === 'flow'} aria-selected={half === 'flow'}
                onclick={() => setEditorTargetDomain('flow')}>Flow</button>
      </div>

      <div class="headtools">
        <button type="button" disabled={!($selectedComponentIds?.size)} onclick={armFromSelection}
                title="Point this tab at the control that is selected now">Use selection</button>
        <button type="button" onclick={clearEditorTarget} title="Stop editing this control">Clear</button>
      </div>
    </div>

    {#if half === 'type'}
      <div class="cols">
        <div class="famcol">
          <div class="colh">Families <s>{($availableFonts ?? []).length}</s></div>
          <TypeFamilies family={font?.family ?? ''} onpick={setFamily} />
        </div>

        <div class="speccol">
          <div class="colh">Specimen <s>live · this control</s></div>
          <TypeSpecimen
            {control}
            weight={font?.weightValue ?? 400}
            supportsWeight={fontEntry?.supportsWeight === true}
            onweight={setWeight}
          />
        </div>

        <div class="setcol">
          <div class="colh">Settings</div>
          <TypeSettings
            {sections}
            supportedFeatures={fontEntry?.featureSupportKnown ? fontEntry.supportedFeatures : null}
            onset={setField}
          />
        </div>
      </div>
    {:else}
      <div class="cols">
        <div class="modecol">
          <div class="colh">Modes <s>13</s></div>
          <FlowModeGrid {control} {mode} onpick={setMode} />
        </div>

        <div class="speccol">
          <div class="colh">Specimen <s>{shape ? 'drag the points' : 'live · this control'}</s></div>
          <div class="spec">
            <!-- The path editor goes INSIDE the preview, not over the specimen box: its
                 coordinates are percentages of the control, and the control is a scaled rectangle
                 somewhere in the middle of that box. -->
            <EffectPreview {control} boxWidth={420} boxHeight={208} padding={12} maxScale={3} label="Flow specimen">
              {#snippet children()}
                {#if shape}
                  <FlowPathEditor
                    {points}
                    {mode}
                    onmove={(index, x, y) => patch(movePathPoint(position, mode, index, x, y))}
                    onadd={(index) => patch(addPathPoint(position, mode, index))}
                    onremove={(index) => patch(removePathPoint(position, mode, index))}
                  />
                {/if}
              {/snippet}
            </EffectPreview>
          </div>
        </div>

        <div class="paramcol">
          <div class="colh">{mode} <s>{shownCount} of {TOTAL_FLOW_CONTROLS}</s></div>
          <FlowParams
            {mode}
            {position}
            {currentPreset}
            hiddenCount={Math.max(0, TOTAL_FLOW_CONTROLS - shownCount)}
            onset={setField}
            onpreset={(preset) => patch(curvePresetPatch(mode, preset))}
          />
        </div>
      </div>
    {/if}
  {/if}
</div>

<style>
  .type-tab {
    height: 100%;
    display: flex;
    flex-direction: column;
    min-height: 0;
    overflow: auto;
    background: #15181B;
  }

  .head {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 6px 10px;
    border-bottom: 1px solid #2A2A2A;
    flex: 0 0 auto;
  }

  .who {
    font: 500 9.5px/1 'IBM Plex Mono', ui-monospace, monospace;
    color: #616C75;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .who b { color: #8FEDE3; font-weight: 600; }
  .who .stale {
    font-style: normal;
    margin-left: 6px;
    color: #E5A029;
    border: 1px solid #4A3A1C;
    background: #241d10;
    border-radius: 2px;
    padding: 2px 4px;
  }

  .halves { display: flex; gap: 2px; }
  .halves button {
    border: 1px solid transparent;
    background: transparent;
    color: #96A6B2;
    font: 600 10px/1 'IBM Plex Sans', system-ui, sans-serif;
    padding: 5px 10px;
    border-radius: 4px;
    cursor: pointer;
  }
  .halves button:hover { color: #DDE6EC; }
  .halves button.on { border-color: #5B9BD5; background: #173449; color: #EAF5FF; }

  .headtools { margin-left: auto; display: flex; gap: 4px; }
  .headtools button {
    border: 1px solid #333B42;
    background: #12171A;
    color: #9AA6AE;
    font: 600 9px/1 'IBM Plex Sans', system-ui, sans-serif;
    padding: 5px 8px;
    border-radius: 3px;
    cursor: pointer;
  }
  .headtools button:hover:not(:disabled) { border-color: #4A555E; color: #E8EEF5; }
  .headtools button:disabled { opacity: 0.4; cursor: default; }

  .cols {
    display: flex;
    gap: 10px;
    padding: 10px;
    align-items: flex-start;
    min-width: 0;
    flex: 1 1 auto;
  }

  .famcol { flex: 0 0 190px; min-width: 0; }
  .speccol { flex: 1 1 0; min-width: 260px; }
  .setcol { flex: 0 0 272px; min-width: 0; }
  .modecol { flex: 0 0 218px; min-width: 0; }
  .paramcol { flex: 0 0 244px; min-width: 0; }

  .spec {
    position: relative;
    background: #0C0F12;
    border: 1px solid #333;
    border-radius: 4px;
    height: 212px;
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
  }

  .colh {
    display: flex;
    align-items: center;
    gap: 6px;
    font: 600 8.5px/1 'IBM Plex Mono', ui-monospace, monospace;
    letter-spacing: 0.13em;
    text-transform: uppercase;
    color: #616C75;
    margin-bottom: 7px;
    white-space: nowrap;
    overflow: hidden;
  }
  .colh s { margin-left: auto; text-decoration: none; font-size: 8.5px; }

  .empty { padding: 22px; max-width: 46ch; color: #8A949C; }
  .empty strong { display: block; font: 600 13px/1.4 'IBM Plex Sans', system-ui, sans-serif; color: #E8EEF5; }
  .empty p { margin: 8px 0 14px; font: 400 12px/1.6 'IBM Plex Sans', system-ui, sans-serif; }

  .arm {
    border: 1px solid #0E7C70;
    background: #0B2320;
    color: #8FEDE3;
    font: 600 11px/1 'IBM Plex Sans', system-ui, sans-serif;
    padding: 8px 12px;
    border-radius: 3px;
    cursor: pointer;
  }
  .arm:disabled { opacity: 0.45; cursor: default; border-color: #333B42; background: #12171A; color: #69737B; }

  @media (max-width: 1040px) {
    .cols { flex-wrap: wrap; }
    .speccol { flex: 1 1 100%; order: -1; }
  }
</style>
