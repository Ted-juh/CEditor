<script>
  import { Plus, X } from 'lucide-svelte';

  let { notes = $bindable([]), activeNoteIndex = $bindable(0), onchange } = $props();

  let editorEl = $state(null);
  let lastSyncedIndex = $state(-1);

  // Load content into editor when switching notes
  $effect(() => {
    const idx = activeNoteIndex;
    if (editorEl && idx !== lastSyncedIndex) {
      lastSyncedIndex = idx;
      const note = notes[idx];
      editorEl.innerHTML = note ? note.content : '';
    }
  });

  function saveCurrentContent() {
    if (!editorEl || !notes[activeNoteIndex]) return;
    const html = editorEl.innerHTML;
    if (notes[activeNoteIndex].content !== html) {
      notes[activeNoteIndex].content = html;
      if (onchange) onchange(notes);
    }
  }

  function handleInput() {
    saveCurrentContent();
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

  // Keyboard shortcuts for formatting
  function handleKeyDown(e) {
    if (e.ctrlKey || e.metaKey) {
      switch (e.key.toLowerCase()) {
        case 'b':
          e.preventDefault();
          document.execCommand('bold');
          break;
        case 'i':
          e.preventDefault();
          document.execCommand('italic');
          break;
        case 'u':
          e.preventDefault();
          document.execCommand('underline');
          break;
      }
    }
    // Tab key inserts spaces
    if (e.key === 'Tab') {
      e.preventDefault();
      document.execCommand('insertText', false, '    ');
    }
  }

  // Expose the editor element for settings panel to apply formatting
  export function getEditorElement() {
    return editorEl;
  }
</script>

<div class="notepad-editor">
  <div class="note-tabs">
    {#each notes as note, i}
      <button
        class="note-tab"
        class:active={i === activeNoteIndex}
        onclick={() => switchTab(i)}
        ondblclick={() => handleTabDblClick(i)}
        title="Double-click to rename"
      >
        <span class="note-tab-label">{note.name}</span>
        {#if notes.length > 1}
          <button class="note-tab-close" onclick={(e) => closeNote(i, e)} title="Close note">
            <X size={10} />
          </button>
        {/if}
      </button>
    {/each}
    <button class="note-tab-add" onclick={addNote} title="Add note">
      <Plus size={12} />
    </button>
  </div>

  <div
    class="editor-area"
    contenteditable="true"
    bind:this={editorEl}
    oninput={handleInput}
    onkeydown={handleKeyDown}
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

  .note-tab:hover {
    color: #CCC;
    background: #2A2A2A;
  }

  .note-tab.active {
    color: #DDD;
    background: #2D2D2D;
    border-top-color: #5B9BD5;
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
