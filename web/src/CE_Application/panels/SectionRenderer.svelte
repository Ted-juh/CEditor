<script>
  /**
   * Dispatches a tab id to the right section editor. Used by PropertiesPanel
   * in four places (single + multi × normal + pinned-split views), all of
   * which used an identical if/else chain.
   *
   *   contextMode — 'panel' | 'component'
   *   tabId       — current tab id
   *   control     — $selectedControl (only used when contextMode is 'component')
   *   fallbackLabel — human label for the placeholder
   */
  import PanelCardContent from './PanelCardContent.svelte';
  import CoreEditor from '../sections/CoreEditor.svelte';
  import TransformEditor from '../sections/TransformEditor.svelte';
  import BackgroundEditor from '../sections/BackgroundEditor.svelte';
  import BorderEditor from '../sections/BorderEditor.svelte';
  import EffectsEditor from '../sections/EffectsEditor.svelte';

  let { contextMode = 'panel', tabId = '', control = null, fallbackLabel = '' } = $props();
</script>

{#if contextMode === 'panel'}
  <PanelCardContent {tabId} />
{:else if tabId === 'core'}
  <CoreEditor {control} />
{:else if tabId === 'transform'}
  <TransformEditor {control} />
{:else if tabId === 'background'}
  <BackgroundEditor {control} />
{:else if tabId === 'border'}
  <BorderEditor {control} />
{:else if tabId === 'effects'}
  <EffectsEditor {control} />
{:else}
  <div class="placeholder">Component: {fallbackLabel}</div>
{/if}

<style>
  .placeholder {
    grid-column: span 4;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 20px;
    color: #444;
    font-size: 11px;
  }
</style>
