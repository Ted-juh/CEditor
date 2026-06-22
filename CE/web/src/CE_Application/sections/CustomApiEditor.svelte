<script>
  import { Cable, SlidersHorizontal } from 'lucide-svelte';
  import { getSection, updateControlProperty } from '../stores/controls.js';
  import CustomPublishedPropertiesEditor from './CustomPublishedPropertiesEditor.svelte';
  import CustomPublicPropertiesEditor from './CustomPublicPropertiesEditor.svelte';

  let { control = null } = $props();

  // One "API" home (plan §4): the published contract an author defines and the
  // instance values a consumer configures used to be two confusingly-similar
  // tabs ("Public" and "Public API"). They are now two modes of a single
  // surface so neither concept lives in two places.
  let mode = $state('contract');

  let designer = $derived(getSection(control, 'Designer'));
  let coreId = $derived(getSection(control, 'Core')?.id ?? '');

  // Let other surfaces deep-link to a specific mode via Designer.focusApiMode.
  // Consume it one-shot (like Designer.focusSection) so the user stays in
  // control of the mode afterward.
  $effect(() => {
    const requested = String(designer?.focusApiMode ?? '').trim();
    if (requested !== 'contract' && requested !== 'values') return;
    mode = requested;
    if (coreId) updateControlProperty(coreId, 'Designer.focusApiMode', '');
  });
</script>

<div class="api-editor">
  <div class="api-mode" role="tablist" aria-label="API editor mode">
    <button
      type="button"
      role="tab"
      class:active={mode === 'contract'}
      aria-selected={mode === 'contract'}
      onclick={() => { mode = 'contract'; }}
    >
      <Cable size={14} strokeWidth={1.7} aria-hidden="true" />
      <span>Contract</span>
    </button>
    <button
      type="button"
      role="tab"
      class:active={mode === 'values'}
      aria-selected={mode === 'values'}
      onclick={() => { mode = 'values'; }}
    >
      <SlidersHorizontal size={14} strokeWidth={1.7} aria-hidden="true" />
      <span>Values</span>
    </button>
  </div>
  <p class="api-mode-hint">
    {mode === 'contract'
      ? 'Define what this component publishes to its host — inputs, outputs, and editable properties.'
      : 'Configure this instance: set published values and review the source package.'}
  </p>

  {#if mode === 'contract'}
    <CustomPublishedPropertiesEditor {control} />
  {:else}
    <CustomPublicPropertiesEditor {control} />
  {/if}
</div>

<style>
  .api-editor {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .api-mode {
    display: inline-flex;
    align-self: flex-start;
    gap: 2px;
    padding: 2px;
    border-radius: 8px;
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid rgba(255, 255, 255, 0.08);
  }

  .api-mode button {
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

  .api-mode button:hover {
    color: #E5EDF6;
  }

  .api-mode button.active {
    background: rgba(91, 155, 213, 0.22);
    color: #E5EDF6;
    box-shadow: 0 0 0 1px rgba(91, 155, 213, 0.4);
  }

  .api-mode-hint {
    margin: 0 0 2px;
    font-size: 11px;
    line-height: 1.4;
    color: rgba(205, 231, 246, 0.62);
  }
</style>
