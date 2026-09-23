<script>
  /**
   * Viewer tab for DisplayPanel. Owns its own images / hover-color /
   * status state. Extracted because this tab is self-contained: its only
   * cross-tab coupling is the eyedropper saving a color back to the
   * parent's shared swatches, which is exposed via `oncolorpicked`.
   */
  import ViewerEditor from '../components/ViewerEditor.svelte';
  import ViewerSettings from '../components/ViewerSettings.svelte';
  import { untrack } from 'svelte';
  import { activePanel, panels, updatePanel } from '../stores/panels.js';
  import { deepClone } from '../utils/deepClone.js';
  import { withViewerActiveIndex } from '../utils/panelNavigation.js';

  let {
    // Parent drives active-panel sync by toggling this reset key.
    resetKey = 0,
    oncolorpicked = null,
  } = $props();

  let images = $state([]);
  let activeIndex = $state(0);
  let editorRef = $state(null);
  let status = $state('');
  let hoverColor = $state(null);

  // Re-sync from the active panel whenever `resetKey` changes.
  $effect(() => {
    void resetKey;
    // resetKey is the panel-switch signal. Tracking the whole panel object here would also
    // deep-clone our own viewer writes back into `images`, replacing every image identity and
    // throwing away its WeakMap-backed zoom/pan state after each rename, close, or tab switch.
    const panel = untrack(() => $activePanel);
    if (!panel) { images = []; activeIndex = 0; return; }
    const vw = panel.viewer;
    if (vw) {
      images = deepClone(vw.images);
      activeIndex = vw.activeImageIndex ?? 0;
    } else {
      images = [];
      activeIndex = 0;
    }
  });

  function handleChange(updatedImages, source) {
    const panel = $activePanel;
    const panelId = source?.sourceId;
    if (!panelId || panelId !== panel?.id || source?.sourceGeneration !== resetKey) return;
    images = updatedImages;
    activeIndex = source.activeImageIndex;
    if (source.documentChanged === false) {
      // Active image is workspace navigation. Preserve the saved flag and the image objects;
      // updatePanel always marks a panel modified, even if passed modified: false.
      panels.update((list) => list.map((entry) => entry.id === panelId
        ? withViewerActiveIndex(entry, source.activeImageIndex) : entry));
      return;
    }
    updatePanel(panelId, {
      viewer: { images: deepClone(updatedImages), activeImageIndex: source.activeImageIndex },
      modified: true,
    });
  }

  function handleColorPicked(hex) {
    // Let the parent own the swatch array — return whatever status it decides.
    const result = oncolorpicked?.(hex);
    if (typeof result === 'string') status = result;
  }
</script>

{#if $activePanel}
  <div class="viewer-layout">
    <div class="viewer-canvas-area">
      <ViewerEditor
        bind:images
        bind:activeImageIndex={activeIndex}
        sourceId={$activePanel.id}
        sourceGeneration={resetKey}
        onchange={handleChange}
        onColorPicked={handleColorPicked}
        onColorHover={(hex) => hoverColor = hex}
        bind:this={editorRef}
      />
    </div>
    <div class="viewer-sidebar">
      <div class="sidebar-settings">
        <ViewerSettings
          getViewerRef={() => editorRef}
          statusMessage={status}
          {hoverColor}
        />
      </div>
    </div>
  </div>
{:else}
  <div class="placeholder">Open or create a panel to use the Viewer</div>
{/if}

<style>
  .viewer-layout {
    display: flex;
    height: 100%;
  }

  .viewer-canvas-area {
    width: 80%;
    flex-shrink: 0;
    border-right: 1px solid #333;
  }

  .viewer-sidebar {
    flex: 1;
    overflow: hidden;
    display: flex;
    flex-direction: column;
  }

  .sidebar-settings {
    flex: 3;
    overflow: auto;
  }

  .placeholder {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 100%;
    color: #444;
    font-size: 12px;
  }
</style>
