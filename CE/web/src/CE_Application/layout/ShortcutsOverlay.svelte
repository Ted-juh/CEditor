<script>
  import { GLOBAL_SHORTCUTS } from '../utils/globalShortcuts.js';
  import { EDITOR_SHORTCUTS } from '../utils/editorShortcuts.js';

  let { show = false, onclose = () => {} } = $props();

  /**
   * This list is GENERATED from the binding tables the dispatchers match on.
   *
   * It used to be typed out by hand, and the review found what always happens
   * to a list typed out beside the code it describes: five of the shortcuts it
   * documented were bound nowhere, the wheel row described a behaviour the
   * canvas did not have, and Ctrl+G, Ctrl+Shift+G and Ctrl+, were missing
   * although they worked. Reading GLOBAL_SHORTCUTS and EDITOR_SHORTCUTS makes
   * that class of bug unrepresentable — a chord and its description are one
   * object, and a binding that is not in a table does not resolve either.
   */

  /**
   * The rest: gestures no dispatcher owns, so nothing can generate them.
   *
   * A mouse gesture is a mousedown handler inside a component, not a row in a
   * chord table, and the same goes for the two keys that live in their own
   * components (F2 in the tree, Escape in this overlay). They are listed by
   * hand and each one was checked against its handler when it was written —
   * TabBar.svelte handleMiddleClick, CanvasControl.svelte handleDoubleClick,
   * EditorCanvas.svelte trackMeasure, ComponentTree.svelte's F2 — but they are
   * the part of this panel that can still drift, so check them if you move one.
   */
  const POINTER_GESTURES = [
    { section: 'Application', keys: 'Esc', description: 'Close this panel' },
    { section: 'Tabs', keys: 'Middle Click', description: 'Close tab' },
    { section: 'View', keys: 'Scroll', description: 'Scroll canvas' },
    { section: 'View', keys: 'Shift+Scroll', description: 'Scroll sideways' },
    { section: 'View', keys: 'Ctrl+Scroll', description: 'Zoom at cursor' },
    { section: 'Canvas', keys: 'Space+Drag', description: 'Pan canvas' },
    { section: 'Canvas', keys: 'Middle Drag', description: 'Pan canvas' },
    { section: 'Canvas', keys: 'Right Click', description: 'Context menu' },
    { section: 'Canvas', keys: 'Alt+Hover', description: 'Measure to the hovered control' },
    { section: 'Components', keys: 'Click', description: 'Select' },
    { section: 'Components', keys: 'Shift+Click', description: 'Extend selection' },
    { section: 'Components', keys: 'Ctrl+Click', description: 'Toggle multi-select' },
    { section: 'Components', keys: 'Double Click', description: 'Enter container / edit text' },
    { section: 'Components', keys: 'Shift+Marquee', description: 'Add marquee to selection' },
    { section: 'Components', keys: 'Drag', description: 'Move' },
    { section: 'Components', keys: 'Shift+Drag', description: 'Constrain to axis' },
    { section: 'Components', keys: 'Alt+Drag', description: 'Move a copy' },
    { section: 'Components', keys: 'Ctrl (hold)', description: 'Suspend snapping' },
    { section: 'Components', keys: 'Space (hold)', description: 'Keep current container' },
    { section: 'Components', keys: 'Shift+Resize', description: 'Aspect ratio lock' },
    { section: 'Components', keys: 'Alt+Resize', description: 'Resize about the centre' },
    { section: 'Components', keys: 'Esc (dragging)', description: 'Cancel drag / resize' },
    { section: 'Components', keys: 'Corner outside', description: 'Rotate' },
    { section: 'Components', keys: 'Shift+Rotate', description: 'Snap to 15\u00B0' },
    { section: 'Guides', keys: 'Drag from ruler', description: 'Create guide' },
    { section: 'Guides', keys: 'Drag guide label', description: 'Move guide' },
    { section: 'Guides', keys: 'Click guide label', description: 'Select guide' },
    { section: 'Guides', keys: 'Delete', description: 'Remove selected guide' },
    { section: 'Guides', keys: 'Right-click guide', description: 'Remove guide' },
    { section: 'Tree', keys: 'F2', description: 'Rename row' },
    { section: 'Tree', keys: 'Double Click', description: 'Rename row' },
  ];

  // Reading order, not table order: what you do to the document before what you
  // do to the view. Anything with a section not listed here still gets drawn,
  // at the end, so a new section can never go missing.
  const SECTION_ORDER = [
    'Application', 'File', 'Tabs', 'Edit', 'Arrange', 'Selection',
    'View', 'Canvas', 'Components', 'Guides', 'Tree',
  ];

  function buildSections(bindings) {
    const byTitle = new Map();
    const seen = new Set();

    for (const binding of bindings) {
      const title = binding.section ?? 'Other';
      // Ctrl+Shift+P is a row in BOTH tables — the canvas handles it while the
      // canvas has focus and the global resolver picks it up when focus has
      // wandered. One binding, one line.
      const fingerprint = `${title}\u0000${binding.keys}`;
      if (seen.has(fingerprint)) continue;
      seen.add(fingerprint);
      if (!byTitle.has(title)) byTitle.set(title, []);
      byTitle.get(title).push([binding.keys, binding.description]);
    }

    const rank = (title) => {
      const index = SECTION_ORDER.indexOf(title);
      return index < 0 ? SECTION_ORDER.length : index;
    };
    return [...byTitle.entries()]
      .map(([title, shortcuts]) => ({ title, shortcuts }))
      .sort((a, b) => rank(a.title) - rank(b.title));
  }

  const sections = buildSections([...GLOBAL_SHORTCUTS, ...EDITOR_SHORTCUTS, ...POINTER_GESTURES]);

  function handleBackdropClick(e) {
    if (e.target === e.currentTarget) onclose();
  }

  function handleKeyDown(e) {
    if (e.key === 'Escape') {
      e.preventDefault();
      onclose();
    }
  }
</script>

<svelte:window onkeydown={(e) => { if (show) handleKeyDown(e); }} />

{#if show}
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <div class="overlay-backdrop" onclick={handleBackdropClick}>
    <div class="overlay-panel">
      <div class="overlay-header">
        <span class="overlay-title">Keyboard Shortcuts</span>
        <button class="close-btn" onclick={onclose}>&times;</button>
      </div>
      <div class="overlay-body">
        {#each sections as section}
          <div class="section">
            <h3 class="section-title">{section.title}</h3>
            {#each section.shortcuts as [key, desc]}
              <div class="shortcut-row">
                <kbd class="key">{key}</kbd>
                <span class="desc">{desc}</span>
              </div>
            {/each}
          </div>
        {/each}
      </div>
    </div>
  </div>
{/if}

<style>
  .overlay-backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.6);
    z-index: 9999;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .overlay-panel {
    background: #2D2D2D;
    border: 1px solid #444;
    border-radius: 8px;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
    max-width: 800px;
    max-height: 80vh;
    width: 90%;
    min-width: 500px;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .overlay-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px 16px;
    border-bottom: 1px solid #444;
    flex-shrink: 0;
  }

  .overlay-title {
    font-size: 14px;
    color: #DDD;
    font-weight: 600;
  }

  .close-btn {
    background: none;
    border: none;
    color: #888;
    font-size: 20px;
    cursor: pointer;
    padding: 0 4px;
    line-height: 1;
  }
  .close-btn:hover { color: #FFF; }

  .overlay-body {
    overflow-y: auto;
    padding: 16px;
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 20px 24px;
    align-content: start;
  }

  .overlay-body::-webkit-scrollbar { width: 6px; }
  .overlay-body::-webkit-scrollbar-track { background: transparent; }
  .overlay-body::-webkit-scrollbar-thumb { background: #444; border-radius: 3px; }

  .section {
    break-inside: avoid;
  }

  .section-title {
    font-size: 11px;
    color: #5B9BD5;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    margin: 0 0 8px 0;
    padding-bottom: 4px;
    border-bottom: 1px solid #333;
  }

  .shortcut-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 3px 0;
  }

  .key {
    background: #1A1A1A;
    border: 1px solid #444;
    border-radius: 3px;
    padding: 2px 6px;
    font-size: 10px;
    color: #CCC;
    font-family: inherit;
    min-width: 50px;
    text-align: center;
  }

  .desc {
    color: #999;
    font-size: 11px;
    text-align: right;
  }
</style>
