<script>
  // "Publish" home (restructure Stage B1): everything the outside world sees —
  // the API contract, the variant definitions (the consumer-facing preset
  // surface), and the package/library identity. One tab replaces the former
  // API, Variants, and Designer-tab Library homes.
  import BookMarked from 'lucide-svelte/icons/book-marked';
  import Cable from 'lucide-svelte/icons/cable';
  import Rows3 from 'lucide-svelte/icons/rows-3';
  import { getSection, updateControlProperty } from '../stores/controls.js';
  import CustomPublishedPropertiesEditor from './CustomPublishedPropertiesEditor.svelte';
  import CustomVariantsEditor from './CustomVariantsEditor.svelte';
  import CustomPackageLibrary from './CustomPackageLibrary.svelte';

  let { control = null } = $props();

  const MODES = [
    { id: 'contract', label: 'Contract', icon: Cable, hint: 'Define what this component publishes to its host — inputs, outputs, and editable properties.' },
    { id: 'variants', label: 'Variants', icon: Rows3, hint: 'Named preset patches consumers can pick per instance. The active-variant picker lives on the instance Properties tab.' },
    { id: 'package', label: 'Package & Library', icon: BookMarked, hint: 'Package metadata, validation, export/import, and the local component library.' },
  ];

  let mode = $state('contract');
  let modeMeta = $derived(MODES.find((entry) => entry.id === mode) ?? MODES[0]);

  let designer = $derived(getSection(control, 'Designer'));
  let coreId = $derived(getSection(control, 'Core')?.id ?? '');

  // Deep-link channel (kept from CustomApiEditor): other surfaces request a
  // specific mode via Designer.focusApiMode; consume one-shot.
  $effect(() => {
    const requested = String(designer?.focusApiMode ?? '').trim();
    if (!MODES.some((entry) => entry.id === requested)) return;
    mode = requested;
    if (coreId) updateControlProperty(coreId, 'Designer.focusApiMode', '');
  });
</script>

<div class="publish-editor">
  <div class="publish-mode" role="tablist" aria-label="Publish editor mode">
    {#each MODES as entry (entry.id)}
      <button
        type="button"
        role="tab"
        class:active={mode === entry.id}
        aria-selected={mode === entry.id}
        onclick={() => { mode = entry.id; }}
      >
        <entry.icon size={14} strokeWidth={1.7} aria-hidden="true" />
        <span>{entry.label}</span>
      </button>
    {/each}
  </div>
  <p class="publish-mode-hint">{modeMeta.hint}</p>

  <!-- CSS display switching keeps all three editors alive in the DOM. -->
  <div style:display={mode === 'contract' ? 'block' : 'none'}>
    <CustomPublishedPropertiesEditor {control} />
  </div>
  <div style:display={mode === 'variants' ? 'block' : 'none'}>
    <CustomVariantsEditor {control} showActivePicker={false} />
  </div>
  <div style:display={mode === 'package' ? 'block' : 'none'}>
    <CustomPackageLibrary {control} />
  </div>
</div>

<style>
  .publish-editor {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .publish-mode {
    display: inline-flex;
    align-self: flex-start;
    gap: 2px;
    padding: 2px;
    border-radius: 8px;
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid rgba(255, 255, 255, 0.08);
  }

  .publish-mode button {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 5px 12px;
    border: none;
    border-radius: 6px;
    background: transparent;
    color: rgba(229, 237, 246, 0.72);
    font: inherit;
    font-size: 12px;
    cursor: pointer;
  }

  .publish-mode button:hover {
    color: #E5EDF6;
  }

  .publish-mode button.active {
    background: rgba(91, 155, 213, 0.22);
    color: #E5EDF6;
    box-shadow: 0 0 0 1px rgba(91, 155, 213, 0.4);
  }

  .publish-mode-hint {
    margin: 0 0 2px;
    font-size: 11px;
    line-height: 1.4;
    color: rgba(205, 231, 246, 0.62);
  }
</style>
