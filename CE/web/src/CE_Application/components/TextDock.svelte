<script>
  import { setContext } from 'svelte';
  import { writable } from 'svelte/store';
  import Pin from 'lucide-svelte/icons/pin';
  import TextEditor from '../sections/TextEditor.svelte';
  import { panels, resolvedActivePanelId, selectedComponentIds } from '../stores/panels.js';
  import { selectedControl, getSection } from '../stores/controls.js';
  import { textDockState } from '../stores/textDock.js';
  import { stateEditScope } from '../stores/stateEditScope.js';
  import { resolveStateScopedControl } from '../utils/interactionRuntime.js';
  import { flatControls } from '../utils/containment.js';
  import '../properties/propertyTheme.css';

  // A search in the side panel must not silently hide unrelated controls in this dock.
  setContext('propertyFilterStore', writable(''));
  setContext('propertySectionScope', () => 'text-dock');

  let panel = $derived($panels.find((item) => item.id === $resolvedActivePanelId));
  let rawControl = $derived($textDockState.followSelection ? $selectedControl
    : flatControls(panel?.controls ?? []).find((item) => item._children?.Core?.id === $textDockState.pinnedId));
  let control = $derived(resolveStateScopedControl(rawControl,
    $stateEditScope.mode === 'state' ? $stateEditScope.stateName : ''));
  let core = $derived(getSection(control, 'Core'));
  let hasText = $derived(!!getSection(control, 'Text'));
  let group = $derived($textDockState.group);

  function changeGroup(next) {
    textDockState.update((state) => ({ ...state, group: next }));
  }
  function changeDetail(key, value) {
    textDockState.update((state) => ({ ...state, [key]: value }));
  }
  function togglePin() {
    textDockState.update((state) => ({ ...state,
      followSelection: !state.followSelection,
      pinnedId: state.followSelection ? core?.id ?? null : state.pinnedId,
    }));
  }
</script>

<section class="text-dock property-theme" aria-label="Text display panel">
  <header class="target-bar">
    <strong>{core?.name || core?.controlType || 'Text'}</strong>
    {#if hasText}
      <span> / Text · {$stateEditScope.mode === 'state' ? $stateEditScope.stateName : 'Base state'}</span>
      {#if $textDockState.followSelection && $selectedComponentIds.size > 1}<span>· {$selectedComponentIds.size} selected</span>{/if}
    {/if}
    <button type="button" class:pinned={!$textDockState.followSelection} aria-pressed={!$textDockState.followSelection}
      disabled={!core?.id && $textDockState.followSelection} onclick={togglePin}
      title={$textDockState.followSelection ? 'Keep editing this control when the selection changes' : 'Follow the editor selection'}>
      <Pin size={12} />{$textDockState.followSelection ? 'Follow selection' : 'Pinned'}
    </button>
  </header>
  {#if hasText}
    {#key core.id}
      <TextEditor {control} dock editorScope="text-dock" allowMultiSelection={$textDockState.followSelection}
        bind:dockGroup={() => group, changeGroup}
        bind:dockLine={() => $textDockState.line, (value) => changeDetail('line', value)}
        bind:dockEffect={() => $textDockState.effect, (value) => changeDetail('effect', value)} />
    {/key}
  {:else}
    <div class="empty">
      {#if rawControl}This component has no Text section. Select a label, button, or another component with text.
      {:else if !$textDockState.followSelection}The pinned component is no longer available. Choose Follow selection to edit another component.
      {:else}Select a component with text to edit it here.{/if}
    </div>
  {/if}
</section>

<style>
  .text-dock { height: 100%; min-height: 0; min-width: 0; display: flex; flex-direction: column; background: #1E1E1E; color: #DDD; font-size: 11px; }
  .target-bar { display: flex; align-items: center; flex-wrap: wrap; gap: 5px; padding: 4px 8px; border-bottom: 1px solid #333; background: #222; flex: 0 0 auto; }
  .target-bar strong { font-weight: 600; overflow-wrap: anywhere; }
  .target-bar span { color: #999; }
  .target-bar button { margin-left: auto; display: flex; align-items: center; gap: 5px; min-height: 22px; padding: 2px 6px; border: 1px solid #333; border-radius: 3px; background: #1A1A1A; color: #AAA; font: inherit; cursor: pointer; }
  .target-bar button:hover { border-color: #5B9BD5; color: #FFF; }
  .target-bar button.pinned { background: #094771; color: #FFF; }
  .target-bar button:disabled { opacity: 0.4; cursor: default; }
  .empty { padding: 16px; color: #AAA; }
  .text-dock :global(.dock-editor) { flex: 1; height: auto; }
</style>
