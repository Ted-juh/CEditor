<script>
  import { getSection, updateControlProperty, updateSelectedProperty, applyControlPatch, applySelectedPatch } from '../stores/controls.js';
  import { selectedComponentIds } from '../stores/panels.js';
  import PropertyCell from '../properties/PropertyCell.svelte';
  import PropertySection from '../properties/PropertySection.svelte';
  import PropertyToggle from '../properties/PropertyToggle.svelte';
  import Type from 'lucide-svelte/icons/type';
  import TextEditor from './TextEditor.svelte';
  import AttachedLabelsEditor from './AttachedLabelsEditor.svelte';

  let { control = null } = $props();

  // The labels that ride the handles are the only text a knob or slider still draws itself: its
  // name, value and range ends are Labels of their own (AttachedLabelsEditor, above).
  const LABEL_TARGETS = [
    { id: 'labelStart', label: 'Start', path: 'Parts.labelStart.Text', visibility: 'handles' },
    { id: 'labelCurrent', label: 'Current', path: 'Parts.labelCurrent.Text', visibility: 'handles' },
    { id: 'labelEnd', label: 'End', path: 'Parts.labelEnd.Text', visibility: 'handles' },
  ];

  let selectedLabelId = $state('labelCurrent');

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
      applySelectedPatch(patch, { pin: true });
    } else {
      applyControlPatch(controlId, patch, { pin: true });
    }
  }

  function labelVisible() {
    return behavior?.showHandleLabels === true;
  }

  function toggleVisible() {
    set('Behavior.showHandleLabels', !(behavior?.showHandleLabels === true));
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

{#if $selectedComponentIds.size <= 1}
  <AttachedLabelsEditor {control} />
{/if}

{#if behavior && selectedLabelTarget}
  <PropertySection title="Handle Labels" icon={Type}>
    <PropertyCell label="Label" span={4} hint="The label that rides each handle, beside it as it moves. Pick one to style it with the Text editor below.">
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
    <PropertyCell label="Visible" span={1} hint="Whether the handles carry their labels.">
      <PropertyToggle value={labelVisible()} onchange={toggleVisible} />
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
    grid-template-columns: repeat(3, minmax(0, 1fr));
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
