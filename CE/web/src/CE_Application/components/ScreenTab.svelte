<script>
  import { setContext } from 'svelte';
  import { writable } from 'svelte/store';
  import Pin from 'lucide-svelte/icons/pin';
  import DisplayEditor from '../sections/DisplayEditor.svelte';
  import PixelDisplayEditor from '../sections/PixelDisplayEditor.svelte';
  import { SCREEN_DOCK_GROUPS } from '../stores/screenDock.js';
  import { panels, resolvedActivePanelId } from '../stores/panels.js';
  import { selectedControl, getSection } from '../stores/controls.js';
  import { screenDockState } from '../stores/screenDock.js';
  import { lcdDesignLayoutIds, setLcdDesignLayout } from '../stores/lcdDesignLayout.js';
  import { flatControls } from '../utils/containment.js';
  import '../properties/propertyTheme.css';

  // A search in the side panel must not silently hide unrelated controls in this dock.
  setContext('propertyFilterStore', writable(''));
  setContext('propertySectionScope', () => 'screen-dock');

  let panel = $derived($panels.find((item) => item.id === $resolvedActivePanelId));
  let rawControl = $derived($screenDockState.followSelection ? $selectedControl
    : flatControls(panel?.controls ?? []).find((item) => item._children?.Core?.id === $screenDockState.pinnedId));
  let control = $derived(rawControl);
  let core = $derived(getSection(control, 'Core'));
  let screenKind = $derived(getSection(control, 'Display') ? 'lcd' : getSection(control, 'Pixel') ? 'pixel' : '');
  let group = $derived($screenDockState.group);
  let screen = $derived(getSection(control, screenKind === 'lcd' ? 'Display' : 'Pixel'));
  let layouts = $derived(Array.isArray(screen?.layouts) ? screen.layouts : []);
  let layoutId = $derived(layouts.find((layout) => String(layout.id) === $lcdDesignLayoutIds[core?.id])?.id ?? layouts[0]?.id ?? '');

  function changeGroup(next) {
    screenDockState.update((state) => ({ ...state, group: next }));
  }
  function togglePin() {
    screenDockState.update((state) => ({ ...state,
      followSelection: !state.followSelection,
      pinnedId: state.followSelection ? core?.id ?? null : state.pinnedId,
    }));
  }
</script>

<section class="screen-dock property-theme" aria-label="Screen display panel">
  <header class="target-bar">
    <strong>{core?.name || core?.controlType || 'Screen'}</strong>
    {#if screenKind}
      <span> / {screenKind === 'lcd' ? 'LCD' : 'Pixel display'}</span>
    {/if}
    <button type="button" class:pinned={!$screenDockState.followSelection} aria-pressed={!$screenDockState.followSelection}
      disabled={!core?.id && $screenDockState.followSelection} onclick={togglePin}
      title={$screenDockState.followSelection ? 'Keep editing this control when the selection changes' : 'Follow the editor selection'}>
      <Pin size={12} />{$screenDockState.followSelection ? 'Follow selection' : 'Pinned'}
    </button>
  </header>
  {#if screenKind}
    <nav class="groups" aria-label="Screen settings groups">
      {#each SCREEN_DOCK_GROUPS as item}
        <button type="button" class:active={group === item} aria-pressed={group === item} onclick={() => changeGroup(item)}>{item[0].toUpperCase() + item.slice(1)}</button>
      {/each}
      {#if layouts.length}
        <label class="layout-picker">Layout
          <select aria-label="Active screen layout" value={String(layoutId)} onchange={(event) => setLcdDesignLayout(core.id, event.target.value)}>
            {#each layouts as layout}<option value={String(layout.id)}>{layout.name || layout.id}</option>{/each}
          </select>
        </label>
      {/if}
    </nav>
    <div class="settings" aria-label="Screen properties">
      {#key core.id}
        {#if screenKind === 'lcd'}<DisplayEditor {control} dockGroup={group} />
        {:else}<PixelDisplayEditor {control} dockGroup={group} />{/if}
      {/key}
    </div>
  {:else}
    <div class="empty">
      {#if rawControl}Select an LCD or pixel display to edit its screen settings.
      {:else if !$screenDockState.followSelection}The pinned component is no longer available. Choose Follow selection to edit another component.
      {:else}Select an LCD or pixel display to edit it here.{/if}
    </div>
  {/if}
</section>

<style>
  .screen-dock { height: 100%; min-height: 0; min-width: 0; display: flex; flex-direction: column; background: #1E1E1E; color: #DDD; font-size: 11px; }
  .target-bar { display: flex; align-items: center; flex-wrap: wrap; gap: 5px; padding: 4px 8px; border-bottom: 1px solid #333; background: #222; flex: 0 0 auto; }
  .target-bar strong { font-weight: 600; overflow-wrap: anywhere; }
  .target-bar span { color: #999; }
  .target-bar button { margin-left: auto; display: flex; align-items: center; gap: 5px; min-height: 22px; padding: 2px 6px; border: 1px solid #333; border-radius: 3px; background: #1A1A1A; color: #AAA; font: inherit; cursor: pointer; }
  .target-bar button:hover { border-color: #5B9BD5; color: #FFF; }
  .target-bar button.pinned { background: #094771; color: #FFF; }
  .target-bar button:disabled { opacity: 0.4; cursor: default; }
  .empty { padding: 16px; color: #AAA; }
  .groups { display: flex; gap: 3px; padding: 4px 8px; border-bottom: 1px solid #333; flex-wrap: wrap; }
  .groups button { padding: 3px 10px; min-height: 24px; border: 1px solid transparent; border-radius: 3px; background: transparent; color: #AAA; font: inherit; cursor: pointer; }
  .groups button:hover { color: #FFF; background: #2A2A2A; }
  .groups button.active { color: #FFF; background: #094771; border-color: #235A80; }
  .settings { flex: 1; min-height: 0; overflow: auto; }
  .layout-picker { margin-left: auto; display: flex; align-items: center; gap: 6px; color: #999; min-width: 0; }
  .layout-picker select { min-width: 0; max-width: 200px; height: 24px; border: 1px solid #333; border-radius: 3px; background: #1A1A1A; color: #DDD; font: inherit; }
  button:focus-visible { outline: 2px solid #5B9BD5; outline-offset: 1px; }
</style>
