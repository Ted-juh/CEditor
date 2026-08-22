<script>
  /**
   * Notepad tab for DisplayPanel. Owns the editor, its notes, and the
   * notepad-local swatch click semantics. The parent still drives the
   * cross-tab "pick a text color from the Colors tab" flow — when the
   * user clicks the mini "Back to Notepad" button, the parent calls
   * `applyTextColor(hex, range)` (exposed via bind:this) which focuses
   * the editor, restores the selection range, and recolours it.
   *
   * The recolouring was `document.execCommand('foreColor')` (B10): deprecated,
   * unspecified, and emitting `<font color>` in some engines — legacy markup
   * being written into a file format we still have to read back. It is a
   * Range-based span now (utils/richTextEditing.js), and the result is
   * committed through the editor rather than left in the DOM for the next
   * keystroke to notice.
   *
   * The swatch array itself lives in the parent (it's shared across three
   * tabs), so the parent owns the dbl-click clear and right-click replace
   * handlers — we just bubble those through as callbacks.
   */
  import NotepadEditor from '../components/NotepadEditor.svelte';
  import { applyTextColour } from '../utils/richTextEditing.js';
  import NotepadSettings from '../components/NotepadSettings.svelte';
  import SwatchGrid from '../components/SwatchGrid.svelte';
  import { activePanel, updatePanel } from '../stores/panels.js';
  import { deepClone } from '../utils/deepClone.js';

  let {
    swatches = [],
    resetKey = 0,
    onswatchstore = null,       // (index, color) => void  — parent stores current textColor
    onswatchdblclick = null,    // (index) => void
    onswatchrightclick = null,  // (index, e) => void
    onpickcolor = null,         // () => void  — triggers cross-tab pick flow
  } = $props();

  let notes = $state([{ name: 'Note 1', content: '' }]);
  let activeIndex = $state(0);
  let editorRef = $state(null);
  let textColor = $state('DDDDDD');

  // Re-sync from the active panel whenever `resetKey` changes.
  $effect(() => {
    void resetKey;
    const panel = $activePanel;
    if (!panel) return;
    const np = panel.notepad;
    if (np) {
      notes = deepClone(np.notes);
      activeIndex = np.activeNoteIndex ?? 0;
    } else {
      notes = [{ name: 'Note 1', content: '' }];
      activeIndex = 0;
    }
  });

  function handleChange(updatedNotes) {
    notes = updatedNotes;
    const panel = $activePanel;
    if (panel) {
      updatePanel(panel.id, {
        notepad: { notes: deepClone(updatedNotes), activeNoteIndex: activeIndex },
        modified: true,
      });
    }
  }

  // Swatch click: when cell is filled, apply that color as text foreColor.
  // When empty, ask the parent to store the current text color.
  function handleSwatchClick(index) {
    if (swatches[index]) {
      textColor = swatches[index];
      recolourSelection(swatches[index]);
    } else {
      onswatchstore?.(index, textColor);
    }
  }

  /**
   * Focus the editor, optionally put a saved range back, colour what is
   * selected, and tell the editor to save. The save is the part that used to
   * be missing entirely: execCommand raises no `input` event, so a colour
   * applied this way lived only in the DOM until the user happened to type
   * again.
   */
  function recolourSelection(hex, range = null) {
    const el = editorRef?.getEditorElement?.();
    if (!el) return false;
    el.focus();
    const selection = typeof window === 'undefined' ? null : window.getSelection?.() ?? null;
    if (range && selection) {
      selection.removeAllRanges();
      selection.addRange(range);
    }
    const applied = applyTextColour(el, selection, hex, document);
    if (applied) editorRef?.commitDomEdit?.();
    return !!applied;
  }

  // Expose the editor element accessor + a one-shot "apply color" method
  // used by the parent's cross-tab "Back to Notepad" flow.
  export function getEditorElement() {
    return editorRef?.getEditorElement?.();
  }

  export function applyTextColor(hex, range) {
    textColor = hex;
    // A frame later: the parent switches tab and applies the colour in the same
    // turn, and the editor is not back on screen (or focusable) until it paints.
    requestAnimationFrame(() => recolourSelection(hex, range));
  }
</script>

{#if $activePanel}
  <div class="notepad-layout">
    <div class="notepad-editor-area">
      <NotepadEditor
        bind:notes
        bind:activeNoteIndex={activeIndex}
        onchange={handleChange}
        bind:this={editorRef}
      />
    </div>
    <div class="notepad-sidebar">
      <div class="sidebar-settings">
        <NotepadSettings
          getEditorElement={getEditorElement}
          onPickColor={() => onpickcolor?.()}
        />
      </div>
      <SwatchGrid
        {swatches}
        onclick={handleSwatchClick}
        ondblclick={(i) => onswatchdblclick?.(i)}
        oncontextmenu={(i, e) => onswatchrightclick?.(i, e)}
        getTitle={(s) => s ? `#${s} — click to apply as text color` : 'Click to store current color'}
      />
    </div>
  </div>
{:else}
  <div class="placeholder">Open or create a panel to use the Notepad</div>
{/if}

<style>
  .notepad-layout {
    display: flex;
    height: 100%;
  }

  .notepad-editor-area {
    width: 75%;
    flex-shrink: 0;
    border-right: 1px solid #333;
  }

  .notepad-sidebar {
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
