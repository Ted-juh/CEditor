<script>
  import Plus from 'lucide-svelte/icons/plus';
  import X from 'lucide-svelte/icons/x';

  import {
    applyBlockAlignment,
    applyFontFamily,
    applyFontSize,
    applyInlineStyle,
    applyList,
    clearFormatting,
    insertPlainText,
    readCaretOffset,
    resolveNotepadSync,
    restoreCaretOffset,
  } from '../utils/richTextEditing.js';

  let { notes = $bindable([]), activeNoteIndex = $bindable(0), onchange } = $props();

  let editorEl = $state(null);

  // Plain `let`, not `$state`: the sync effect both reads and writes these, and
  // as reactive state that is a self-invalidating effect. Nothing in the markup
  // reads them either.
  let lastSyncedIndex = -1;
  let lastSyncedHtml = null;
  let composing = false;

  /**
   * Load the note into the contenteditable — on a note switch, and on an
   * EXTERNAL content change.
   *
   * The external half is review finding D2. This effect used to fire only when
   * the note INDEX changed, so an undo (menu, toolbar or Ctrl+Z) reverted the
   * model while the DOM kept showing the old text — and because the very next
   * keystroke saves `editorEl.innerHTML` back into the model, the stale DOM
   * overwrote the restored content and the undo quietly vanished. Re-syncing
   * naively instead would have been worse: the model is rewritten on every
   * keystroke, so "content changed, reload the DOM" would rebuild the editor
   * under the user's cursor as they typed. resolveNotepadSync draws that line;
   * the caret is carried across by character offset, because after
   * `innerHTML =` every node the old selection pointed at is gone.
   */
  $effect(() => {
    const idx = activeNoteIndex;
    const modelHtml = notes[idx]?.content ?? '';
    if (!editorEl) return;

    const decision = resolveNotepadSync({
      index: idx,
      lastIndex: lastSyncedIndex,
      modelHtml,
      domHtml: editorEl.innerHTML,
      lastSyncedHtml,
      composing,
    });
    if (!decision.sync) return;

    const selection = typeof window === 'undefined' ? null : window.getSelection?.() ?? null;
    const caret = decision.preserveCaret ? readCaretOffset(editorEl, selection) : null;

    lastSyncedIndex = idx;
    lastSyncedHtml = modelHtml;
    editorEl.innerHTML = modelHtml;

    if (caret != null && selection) restoreCaretOffset(editorEl, caret, selection, document);
  });

  function saveCurrentContent() {
    if (!editorEl || !notes[activeNoteIndex]) return;
    const html = editorEl.innerHTML;
    // Recorded even when unchanged: this is the "the DOM and the model agree
    // because of something WE did" marker the sync effect tests against.
    lastSyncedHtml = html;
    if (notes[activeNoteIndex].content !== html) {
      notes[activeNoteIndex].content = html;
      if (onchange) onchange(notes);
    }
  }

  function handleInput() {
    saveCurrentContent();
  }

  function currentSelection() {
    return typeof window === 'undefined' ? null : window.getSelection?.() ?? null;
  }

  function switchTab(index) {
    saveCurrentContent();
    activeNoteIndex = index;
  }

  function addNote() {
    const name = `Note ${notes.length + 1}`;
    notes = [...notes, { name, content: '' }];
    activeNoteIndex = notes.length - 1;
    if (onchange) onchange(notes);
  }

  function closeNote(index, e) {
    e.stopPropagation();
    if (notes.length <= 1) return;

    saveCurrentContent();
    notes = notes.filter((_, i) => i !== index);

    if (activeNoteIndex >= notes.length) {
      activeNoteIndex = notes.length - 1;
    } else if (activeNoteIndex > index) {
      activeNoteIndex = activeNoteIndex - 1;
    }
    // Force re-sync
    lastSyncedIndex = -1;
    if (onchange) onchange(notes);
  }

  function handleTabDblClick(index) {
    const current = notes[index].name;
    const newName = prompt('Rename note:', current);
    if (newName && newName.trim()) {
      notes[index].name = newName.trim();
      notes = [...notes];
      if (onchange) onchange(notes);
    }
  }

  function handleTabKeyDown(e, index) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      switchTab(index);
    }
  }

  // Keyboard shortcuts for formatting.
  //
  // These were `document.execCommand('bold' | 'italic' | 'underline')` and an
  // `execCommand('insertText')` for Tab (B10). execCommand is deprecated, is
  // specified nowhere, and emits different markup per engine — `<b>` here,
  // `<span style>` there — into HTML we persist into the panel file. The
  // Range-based replacements live in utils/richTextEditing.js and always emit
  // the same thing. Programmatic edits raise no `input` event, so each one
  // saves explicitly; forgetting that is how a formatted note loses its
  // formatting on the next reload.
  const FORMAT_KEYS = { b: 'bold', i: 'italic', u: 'underline' };

  function handleKeyDown(e) {
    if (e.ctrlKey || e.metaKey) {
      const command = FORMAT_KEYS[String(e.key ?? '').toLowerCase()];
      if (command) {
        e.preventDefault();
        applyInlineStyle(editorEl, currentSelection(), command, document);
        saveCurrentContent();
        return;
      }
    }
    if (e.key === 'Tab') {
      e.preventDefault();
      insertPlainText(editorEl, currentSelection(), '    ', document);
      saveCurrentContent();
    }
  }

  // Expose the editor element for settings panel to apply formatting
  export function getEditorElement() {
    return editorEl;
  }

  /**
   * Every formatting operation the sidebar and the keyboard can ask for, in ONE place.
   *
   * The sidebar used to take `getEditorElement()` and run execCommand on it directly, so clicking
   * **B** and pressing Ctrl+B wrote different markup into the same note — different enough to
   * disagree about what "already bold" means, which is how a toggle stops toggling. Both callers
   * come through here now, so they cannot drift again. The save afterwards is not optional and
   * only this component can do it: a programmatic DOM edit raises no `input` event, so a
   * formatting change that skipped the save was lost on the next reload.
   */
  const FORMAT_OPS = {
    bold: (sel) => applyInlineStyle(editorEl, sel, 'bold', document),
    italic: (sel) => applyInlineStyle(editorEl, sel, 'italic', document),
    underline: (sel) => applyInlineStyle(editorEl, sel, 'underline', document),
    strikethrough: (sel) => applyInlineStyle(editorEl, sel, 'strikethrough', document),
    clearFormatting: (sel) => clearFormatting(editorEl, sel, document),
    alignLeft: (sel) => applyBlockAlignment(editorEl, sel, 'left', document),
    alignCenter: (sel) => applyBlockAlignment(editorEl, sel, 'center', document),
    alignRight: (sel) => applyBlockAlignment(editorEl, sel, 'right', document),
    bulletList: (sel) => applyList(editorEl, sel, false, document),
    numberedList: (sel) => applyList(editorEl, sel, true, document),
  };

  export function formatSelection(command, value = null) {
    if (!editorEl) return false;
    const sel = currentSelection();
    let applied = null;

    if (command === 'fontFamily') applied = applyFontFamily(editorEl, sel, value, document);
    else if (command === 'fontSize') applied = applyFontSize(editorEl, sel, value, document);
    else applied = FORMAT_OPS[command]?.(sel) ?? null;

    if (applied) saveCurrentContent();
    return !!applied;
  }

  /** Commit whatever a caller has just done to the DOM into the model. */
  export function commitDomEdit() {
    saveCurrentContent();
  }
</script>

<div class="notepad-editor">
  <div class="note-tabs">
    {#each notes as note, i}
      <div class="note-tab-wrap" class:active={i === activeNoteIndex}>
        <button
          class="note-tab"
          class:active={i === activeNoteIndex}
          onclick={() => switchTab(i)}
          ondblclick={() => handleTabDblClick(i)}
          onkeydown={(e) => handleTabKeyDown(e, i)}
          title="Double-click to rename"
        >
          <span class="note-tab-label">{note.name}</span>
        </button>
        {#if notes.length > 1}
          <button class="note-tab-close" onclick={(e) => closeNote(i, e)} title="Close note">
            <X size={10} />
          </button>
        {/if}
      </div>
    {/each}
    <button class="note-tab-add" onclick={addNote} title="Add note">
      <Plus size={12} />
    </button>
  </div>

  <div
    class="editor-area"
    contenteditable="true"
    role="textbox"
    aria-multiline="true"
    tabindex="0"
    bind:this={editorEl}
    oninput={handleInput}
    onkeydown={handleKeyDown}
    oncompositionstart={() => composing = true}
    oncompositionend={() => { composing = false; saveCurrentContent(); }}
    spellcheck="false"
  ></div>
</div>

<style>
  .notepad-editor {
    display: flex;
    flex-direction: column;
    height: 100%;
    background: #1E1E1E;
  }

  .note-tabs {
    display: flex;
    align-items: center;
    gap: 1px;
    background: #1A1A1A;
    padding: 0 4px;
    flex-shrink: 0;
    overflow-x: auto;
  }

  .note-tabs::-webkit-scrollbar {
    height: 2px;
  }
  .note-tabs::-webkit-scrollbar-thumb {
    background: #444;
    border-radius: 1px;
  }

  .note-tab {
    display: flex;
    align-items: center;
    gap: 4px;
    background: #252525;
    border: none;
    color: #888;
    font-size: 10px;
    padding: 3px 8px;
    cursor: pointer;
    border-top: 2px solid transparent;
    font-family: inherit;
    white-space: nowrap;
    flex-shrink: 0;
  }

  .note-tab-wrap {
    display: flex;
    align-items: center;
    gap: 2px;
    background: #252525;
    border-top: 2px solid transparent;
    flex-shrink: 0;
  }

  .note-tab-wrap.active {
    background: #2D2D2D;
    border-top-color: #5B9BD5;
  }

  .note-tab:hover {
    color: #CCC;
    background: transparent;
  }

  .note-tab.active {
    color: #DDD;
    background: transparent;
  }

  .note-tab-label {
    max-width: 100px;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .note-tab-close {
    display: flex;
    align-items: center;
    justify-content: center;
    background: none;
    border: none;
    color: #666;
    cursor: pointer;
    padding: 0;
    width: 14px;
    height: 14px;
    border-radius: 2px;
    flex-shrink: 0;
  }

  .note-tab-close:hover {
    color: #E55;
    background: #333;
  }

  .note-tab-add {
    display: flex;
    align-items: center;
    justify-content: center;
    background: none;
    border: 1px dashed #444;
    color: #666;
    cursor: pointer;
    padding: 2px;
    border-radius: 3px;
    flex-shrink: 0;
    margin-left: 2px;
    width: 20px;
    height: 20px;
  }

  .note-tab-add:hover {
    color: #5B9BD5;
    border-color: #5B9BD5;
  }

  .editor-area {
    flex: 1;
    padding: 8px 10px;
    color: #DDD;
    font-family: 'Consolas', 'Courier New', monospace;
    font-size: 12px;
    line-height: 1.5;
    overflow-y: auto;
    outline: none;
    white-space: pre-wrap;
    word-wrap: break-word;
    caret-color: #5B9BD5;
  }

  .editor-area::-webkit-scrollbar {
    width: 6px;
  }
  .editor-area::-webkit-scrollbar-track {
    background: transparent;
  }
  .editor-area::-webkit-scrollbar-thumb {
    background: #444;
    border-radius: 3px;
  }
  .editor-area::-webkit-scrollbar-thumb:hover {
    background: #5B9BD5;
  }

  .editor-area:empty::before {
    content: 'Start typing...';
    color: #555;
    font-style: italic;
  }
</style>
