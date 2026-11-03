<script>
  /**
   * Create Component from Selection (docs/design/changeable-control-sets.md, piece D2), as the owner
   * approved in the mock-up: the component's name, and for knobs, sliders, buttons, switches and
   * meters, how they come in:
   *
   *   As layers          each part a layer the designer edits (utils/valueControlLayers.js), wired to
   *                      the value by bindings, colours linked to the set's colour roles;
   *   As one exact part  drawn by the panel's own knob code, as before (utils/sliderControlPart.js);
   *                      knobs and sliders only.
   *
   * A knob a layer cannot draw yet comes in as one exact part either way, named here with the reason;
   * a button or a meter layers cannot draw is refused, and a selection that cannot convert says why
   * before anything is made. Opened by
   * stores/componentFromSelectionActions.js `createComponentFromSelectionWithPrompt` (Edit menu, canvas
   * menu).
   */
  import { panels } from '../stores/panels.js';
  import {
    componentFromSelectionRequest, createComponentFromSelection, previewComponentFromSelection,
  } from '../stores/componentFromSelectionActions.js';
  import { describeRefusals } from '../utils/customComponentFromControls.js';
  import { flatControls } from '../utils/containment.js';

  const KIND_NAMES = {
    Knob: ['knob', 'knobs'], Slider: ['slider', 'sliders'], Label: ['label', 'labels'], Shape: ['shape', 'shapes'],
    Image: ['image', 'images'], Background: ['background', 'backgrounds'], Button: ['button', 'buttons'],
    MomentaryButton: ['button', 'buttons'], ToggleButton: ['switch', 'switches'], Meter: ['meter', 'meters'],
  };

  let request = $derived($componentFromSelectionRequest);
  let name = $state('');
  let valueControlsAs = $state('layers');
  let openedFor = $state('');

  $effect(() => {
    const key = request ? `${request.panelId}:${request.ids.join(',')}` : '';
    if (key === openedFor) return;
    openedFor = key;
    if (!request) return;
    name = request.suggestion ?? 'Artwork';
    valueControlsAs = 'layers';
  });

  let panel = $derived(request ? $panels.find((entry) => entry.id === request.panelId) ?? null : null);
  let selected = $derived(panel && request ? flatControls(panel.controls ?? []).filter((control) => request.ids.includes(String(control?._children?.Core?.id))) : []);
  let counts = $derived.by(() => {
    const byType = new Map();
    for (const control of selected) {
      const type = String(control._children.Core.controlType ?? '');
      byType.set(type, (byType.get(type) ?? 0) + 1);
    }
    return [...byType].map(([type, n]) => {
      const [one, many] = KIND_NAMES[type] ?? [type.toLowerCase(), `${type.toLowerCase()}s`];
      return `${n} ${n === 1 ? one : many}`;
    });
  });
  let hasValueControls = $derived(selected.some((control) => ['Knob', 'Slider', 'Button', 'MomentaryButton', 'ToggleButton', 'Meter'].includes(String(control._children.Core.controlType))));
  // Read again when the panel changes, or the choice does.
  let plan = $derived(request && $panels ? previewComponentFromSelection(valueControlsAs) : null);
  let refusals = $derived(plan && !plan.ok ? describeRefusals(plan.refused) : []);
  let asParts = $derived(plan?.ok && valueControlsAs === 'layers' ? plan.asParts ?? [] : []);

  function close() {
    componentFromSelectionRequest.set(null);
  }

  function create() {
    if (!plan?.ok) return;
    createComponentFromSelection(String(name).trim() || 'Artwork', { valueControlsAs });
    close();
  }

  function onKeydown(event) {
    if (!request) return;
    if (event.key === 'Escape') { event.preventDefault(); close(); }
    if (event.key === 'Enter' && event.target?.tagName !== 'BUTTON') { event.preventDefault(); create(); }
  }
</script>

<svelte:window onkeydown={onKeydown} />

{#if request}
  <div class="backdrop" role="presentation" onclick={(event) => { if (event.target === event.currentTarget) close(); }}>
    <div class="dialog" role="dialog" aria-modal="true" aria-label="Create Component from Selection" data-testid="component-from-selection">
      <div class="title">Create Component from Selection</div>
      <p class="muted">{selected.length} control{selected.length === 1 ? '' : 's'}: {counts.join(', ')}.</p>
      <label class="field"><span>Name</span>
        <!-- svelte-ignore a11y_autofocus -->
        <input type="text" bind:value={name} autofocus spellcheck="false" />
      </label>

      {#if hasValueControls}
        <div class="group">Knobs, sliders, buttons, switches and meters</div>
        <label class="option" class:on={valueControlsAs === 'layers'}>
          <input type="radio" name="value-controls-as" value="layers" bind:group={valueControlsAs} />
          <span><b>As layers</b><em>Each part a layer you can edit: housing, track, value arc, cap, pointer, ticks, readout; a button's plate and text, or its housing, key and legend; a meter's track and fill, or its face, scale and needle. Colours stay linked to the set's colour roles.</em></span>
        </label>
        <label class="option" class:on={valueControlsAs === 'part'}>
          <input type="radio" name="value-controls-as" value="part" bind:group={valueControlsAs} />
          <span><b>As one exact part</b><em>Drawn by the panel's own knob code. Looks and behaves exactly the same; not editable layer by layer. Knobs and sliders only.</em></span>
        </label>
        {#each asParts as entry (entry.id)}
          <p class="warn" data-testid="as-one-part">⚠ {entry.name} comes in as one exact part: {entry.reason}.</p>
        {/each}
      {/if}

      {#each refusals as line (line)}
        <p class="refused">{line}</p>
      {/each}
      {#if refusals.length}
        <p class="muted">These cannot convert without changing how they look. Change or deselect them, then try again.</p>
      {/if}

      <div class="actions">
        <button class="btn" type="button" onclick={close}>Cancel</button>
        <button class="btn primary" type="button" onclick={create} disabled={!plan?.ok}>Create</button>
      </div>
    </div>
  </div>
{/if}

<style>
  .backdrop { position: fixed; inset: 0; z-index: 1250; background: rgba(0, 0, 0, 0.55); display: flex; align-items: center; justify-content: center; }
  .dialog {
    width: 470px; max-width: calc(100vw - 48px); max-height: calc(100vh - 64px); overflow-y: auto; box-sizing: border-box;
    background: #252526; border: 1px solid #3A3A3A; border-radius: 8px; box-shadow: 0 18px 50px rgba(0, 0, 0, 0.6);
    padding: 16px 18px; display: flex; flex-direction: column; gap: 6px; color: #DDD; font-size: 12px;
  }
  .title { font-size: 15px; font-weight: 600; color: #EEE; }
  .muted { margin: 2px 0; color: #8F8F8F; font-size: 11px; }
  .group { margin-top: 8px; color: #6FA8C7; font-size: 10px; font-weight: 700; letter-spacing: 0.05em; text-transform: uppercase; }
  .field { display: flex; flex-direction: column; gap: 4px; margin-top: 4px; }
  .field span { color: #6FA8C7; font-size: 10px; text-transform: uppercase; letter-spacing: 0.04em; }
  .field input { height: 26px; padding: 0 8px; border: 1px solid #3A3A3A; border-radius: 3px; background: #1A1A1A; color: #DDD; font: inherit; }
  .option { display: flex; gap: 8px; align-items: flex-start; padding: 7px 9px; border: 1px solid #333; border-radius: 5px; cursor: pointer; }
  .option.on { border-color: #0B6EB5; background: #10273A; }
  .option input { margin: 2px 0 0; accent-color: #5B9BD5; }
  .option b { display: block; color: #EEE; font-weight: 600; }
  .option em { display: block; color: #999; font-style: normal; font-size: 11px; line-height: 1.4; }
  .warn { margin: 2px 0; color: #E8B95A; font-size: 11px; line-height: 1.4; }
  .refused { margin: 2px 0; color: #F08A7E; font-size: 11px; line-height: 1.4; }
  .actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 12px; }
  .btn { height: 28px; padding: 0 14px; border: 1px solid #3A3A3A; border-radius: 4px; background: #2C2C2C; color: #DDD; font: inherit; font-weight: 600; cursor: pointer; }
  .btn.primary { background: #094771; border-color: #0B6EB5; color: #fff; }
  .btn:disabled { opacity: 0.45; cursor: default; }
</style>
