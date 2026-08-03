<script>
  import { getSection, updateControlProperty, updateSelectedProperty, applyControlPatch, applySelectedPatch } from '../stores/controls.js';
  import { selectedComponentIds } from '../stores/panels.js';
  import PropertyCell from '../properties/PropertyCell.svelte';
  import PropertySection from '../properties/PropertySection.svelte';
  import PropertyToggle from '../properties/PropertyToggle.svelte';
  import TextEditor from './TextEditor.svelte';

  let { control = null } = $props();

  const LABEL_TARGETS = [
    { id: 'labelTitle', label: 'Title', path: 'Parts.labelTitle.Text', visibility: 'title' },
    { id: 'labelValue', label: 'Readout', path: 'Parts.labelValue.Text', visibility: 'readout' },
    { id: 'labelMin', label: 'Min', path: 'Parts.labelMin.Text', visibility: 'minMax' },
    { id: 'labelMax', label: 'Max', path: 'Parts.labelMax.Text', visibility: 'minMax' },
    { id: 'labelStart', label: 'Start', path: 'Parts.labelStart.Text', visibility: 'handles' },
    { id: 'labelCurrent', label: 'Current', path: 'Parts.labelCurrent.Text', visibility: 'handles' },
    { id: 'labelEnd', label: 'End', path: 'Parts.labelEnd.Text', visibility: 'handles' },
    { id: 'labelUnit', label: 'Unit', path: 'Parts.labelUnit.Text', visibility: 'unit' },
  ];

  let selectedLabelId = $state('labelTitle');

  function set(path, value) {
    const controlId = getSection(control, 'Core')?.id;
    if (!controlId) return;
    if ($selectedComponentIds.size > 1) {
      updateSelectedProperty(path, value);
    } else {
      updateControlProperty(controlId, path, value);
    }
  }

  function setPatch(patch = {}) {
    const controlId = getSection(control, 'Core')?.id;
    if (!controlId) return;
    if ($selectedComponentIds.size > 1) {
      applySelectedPatch(patch);
    } else {
      applyControlPatch(controlId, patch);
    }
  }

  function labelVisible(target) {
    if (target?.visibility === 'title') return String(selectedLabelText?.content ?? '').trim().length > 0;
    if (target?.visibility === 'readout') return behavior?.showValueReadout !== false;
    if (target?.visibility === 'minMax') return behavior?.showMinMaxLabels !== false;
    if (target?.visibility === 'handles') return behavior?.showHandleLabels === true;
    if (target?.visibility === 'unit') return String(behavior?.unit ?? '').trim().length > 0;
    return selectedLabelPart?.visible !== false;
  }

  function toggleVisible(target) {
    if (target?.visibility === 'title') {
      const hasTitle = String(selectedLabelText?.content ?? '').trim().length > 0;
      set(`${target.path}.content`, hasTitle ? '' : 'Label');
      return;
    }
    if (target?.visibility === 'readout') {
      set('Behavior.showValueReadout', !(behavior?.showValueReadout !== false));
      return;
    }
    if (target?.visibility === 'minMax') {
      set('Behavior.showMinMaxLabels', !(behavior?.showMinMaxLabels !== false));
      return;
    }
    if (target?.visibility === 'handles') {
      set('Behavior.showHandleLabels', !(behavior?.showHandleLabels === true));
      return;
    }
    if (target?.visibility === 'unit') {
      set('Behavior.unit', String(behavior?.unit ?? '').trim() ? '' : 'unit');
      return;
    }
    set(`Parts.${target.id}.visible`, !(selectedLabelPart?.visible !== false));
  }

  function resetSelectedLabelText() {
    if (!selectedLabelTarget?.id) return;
    setPatch({
      [`${selectedLabelTarget.path}.content`]: '',
      [`${selectedLabelTarget.path}.Font.size`]: 11,
      [`${selectedLabelTarget.path}.Font.weightValue`]: 600,
      [`${selectedLabelTarget.path}.Font.weight`]: 'SemiBold',
      [`${selectedLabelTarget.path}.Font.style`]: 'Normal',
      [`${selectedLabelTarget.path}.Font.letterSpacing`]: 0,
      [`Parts.${selectedLabelTarget.id}.opacity`]: 1,
    });
  }

  let behavior = $derived(getSection(control, 'Behavior'));
  let parts = $derived(getSection(control, 'Parts'));
  let selectedLabelTarget = $derived(LABEL_TARGETS.find((target) => target.id === selectedLabelId) ?? LABEL_TARGETS[0]);
  let selectedLabelPart = $derived(parts?._children?.[selectedLabelTarget?.id] ?? null);
  let selectedLabelText = $derived(selectedLabelPart?._children?.Text ?? null);
</script>

{#if behavior && selectedLabelTarget}
  <PropertySection title="Slider Label">
    <PropertyCell label="Label Part" span={4} hint="Pick the slider-owned label to edit with the full Label/Text editor below.">
      <div class="label-target-grid">
        {#each LABEL_TARGETS as target (target.id)}
          <button
            class="label-target-btn"
            class:active={selectedLabelId === target.id}
            type="button"
            onclick={() => selectedLabelId = target.id}
          >
            {target.label}
          </button>
        {/each}
      </div>
    </PropertyCell>
    <PropertyCell label="Visible" span={1} hint="Visibility is mapped to the slider setting that owns this label.">
      <PropertyToggle value={labelVisible(selectedLabelTarget)} onchange={() => toggleVisible(selectedLabelTarget)} />
    </PropertyCell>
    <PropertyCell label="Reset Label" span={3} hint="Reset the selected label's text styling basics.">
      <button class="label-action-btn" type="button" onclick={resetSelectedLabelText}>Reset label text</button>
    </PropertyCell>
  </PropertySection>

  {#key selectedLabelTarget.id}
    <TextEditor
      {control}
      textOverride={selectedLabelText}
      textPathPrefix={selectedLabelTarget.path}
      editorScope="slider-label"
    />
  {/key}
{/if}

<style>
  .label-target-grid {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 6px;
    width: 100%;
  }

  .label-target-btn,
  .label-action-btn {
    border: 1px solid #3B3B3B;
    background: #1E1E1E;
    color: #D6D6D6;
    border-radius: 5px;
    padding: 7px 8px;
    font-size: 11px;
    cursor: pointer;
    font-family: inherit;
  }

  .label-target-btn:hover,
  .label-action-btn:hover {
    border-color: #5B9BD5;
    background: #232323;
  }

  .label-target-btn.active {
    border-color: #5B9BD5;
    background: #0D2A3E;
    color: #FFFFFF;
  }

  .label-action-btn {
    width: 100%;
  }
</style>
