<script>
  import { Bold, Italic, Underline, Strikethrough, AlignLeft, AlignCenter, AlignRight, List, ListOrdered, RemoveFormatting, Pipette } from 'lucide-svelte';
  import { availableFonts } from '../stores/appSettings.js';

  let { getEditorElement, onPickColor } = $props();

  let fontFamily = $state('Consolas');
  let fontSize = $state(12);
  let selectedFontOption = $derived(
    $availableFonts.find(option => option.value === fontFamily)
    ?? $availableFonts.find(option => option.family === fontFamily)
    ?? null
  );
  let selectedFontPreviewFamily = $derived(selectedFontOption?.cssFamily ?? fontFamily);

  const fontSizes = [8, 9, 10, 11, 12, 14, 16, 18, 20, 24, 28, 32, 36, 48];

  // Map px sizes to execCommand's 1-7 scale (approximate)
  const sizeMap = { 8: 1, 9: 1, 10: 2, 11: 2, 12: 3, 14: 3, 16: 4, 18: 4, 20: 5, 24: 5, 28: 6, 32: 6, 36: 7, 48: 7 };

  function focusEditor() {
    const el = getEditorElement?.();
    if (el) el.focus();
  }

  function exec(command, value = null) {
    focusEditor();
    document.execCommand(command, false, value);
  }

  function applyFont() {
    exec('fontName', fontFamily);
  }

  function applyFontSize() {
    const scale = sizeMap[fontSize] ?? 3;
    exec('fontSize', String(scale));
    // Replace generated <font size="X"> with inline style for exact px
    const el = getEditorElement?.();
    if (el) {
      const fontEls = el.querySelectorAll(`font[size="${scale}"]`);
      for (const f of fontEls) {
        f.removeAttribute('size');
        f.style.fontSize = `${fontSize}px`;
      }
    }
  }

  function handleFontSizeKey(e) {
    if (e.key === 'Enter') {
      e.target.blur();
      applyFontSize();
    }
  }

  function selectAll(e) {
    e.target.select();
  }
</script>

<div class="notepad-settings">
  <!-- Font Family -->
  <div class="section">
    <div class="section-label">Font</div>
    <select class="combo" style={`font-family:'${selectedFontPreviewFamily}'`} bind:value={fontFamily} onchange={applyFont}>
      {#each $availableFonts as f}
        <option value={f.value} style={`font-family:'${f.cssFamily ?? f.value}'`}>{f.label}</option>
      {/each}
    </select>
  </div>

  <!-- Font Size -->
  <div class="section">
    <div class="section-label">Size</div>
    <div class="input-row">
      <select class="combo size-combo" bind:value={fontSize} onchange={applyFontSize}>
        {#each fontSizes as s}
          <option value={s}>{s}px</option>
        {/each}
      </select>
      <input
        type="number"
        class="size-input"
        bind:value={fontSize}
        min="6"
        max="72"
        onfocus={selectAll}
        onkeydown={handleFontSizeKey}
        onchange={applyFontSize}
      />
    </div>
  </div>

  <!-- Formatting -->
  <div class="section">
    <div class="section-label">Format</div>
    <div class="toolbar-row">
      <button class="tool-btn" onclick={() => exec('bold')} title="Bold (Ctrl+B)">
        <Bold size={13} />
      </button>
      <button class="tool-btn" onclick={() => exec('italic')} title="Italic (Ctrl+I)">
        <Italic size={13} />
      </button>
      <button class="tool-btn" onclick={() => exec('underline')} title="Underline (Ctrl+U)">
        <Underline size={13} />
      </button>
      <button class="tool-btn" onclick={() => exec('strikeThrough')} title="Strikethrough">
        <Strikethrough size={13} />
      </button>
      <button class="tool-btn" onclick={() => exec('removeFormat')} title="Clear formatting">
        <RemoveFormatting size={13} />
      </button>
    </div>
  </div>

  <!-- Alignment -->
  <div class="section">
    <div class="section-label">Align</div>
    <div class="toolbar-row">
      <button class="tool-btn" onclick={() => exec('justifyLeft')} title="Align left">
        <AlignLeft size={13} />
      </button>
      <button class="tool-btn" onclick={() => exec('justifyCenter')} title="Align center">
        <AlignCenter size={13} />
      </button>
      <button class="tool-btn" onclick={() => exec('justifyRight')} title="Align right">
        <AlignRight size={13} />
      </button>
    </div>
  </div>

  <!-- Lists -->
  <div class="section">
    <div class="section-label">Lists</div>
    <div class="toolbar-row">
      <button class="tool-btn" onclick={() => exec('insertUnorderedList')} title="Bullet list">
        <List size={13} />
      </button>
      <button class="tool-btn" onclick={() => exec('insertOrderedList')} title="Numbered list">
        <ListOrdered size={13} />
      </button>
    </div>
  </div>

  <!-- Pick Color -->
  <div class="section">
    <div class="section-label">Text Color</div>
    <button class="pick-color-btn" onclick={onPickColor}>
      <Pipette size={13} />
      Pick from Colors
    </button>
  </div>
</div>

<style>
  .notepad-settings {
    display: flex;
    flex-direction: column;
    height: 100%;
    overflow-y: auto;
    padding: 0 6px;
  }

  .notepad-settings::-webkit-scrollbar {
    width: 4px;
  }
  .notepad-settings::-webkit-scrollbar-track {
    background: transparent;
  }
  .notepad-settings::-webkit-scrollbar-thumb {
    background: #444;
    border-radius: 2px;
  }
  .notepad-settings::-webkit-scrollbar-thumb:hover {
    background: #5B9BD5;
  }

  .section {
    padding: 6px 0;
    border-bottom: 1px solid #333;
  }

  .section-label {
    font-size: 9px;
    color: #666;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    margin-bottom: 4px;
  }

  .combo {
    width: 100%;
    background: #1A1A1A;
    border: 1px solid #333;
    color: #DDD;
    font-size: 11px;
    padding: 3px 4px;
    border-radius: 3px;
    font-family: inherit;
    cursor: pointer;
  }
  .combo:focus {
    border-color: #5B9BD5;
    outline: none;
  }

  .input-row {
    display: flex;
    gap: 4px;
    align-items: center;
  }

  .size-combo {
    flex: 1;
  }

  .size-input {
    width: 42px;
    background: #1A1A1A;
    border: 1px solid #333;
    color: #DDD;
    font-size: 11px;
    padding: 3px 4px;
    border-radius: 3px;
    text-align: center;
    font-family: inherit;
  }
  .size-input:focus {
    border-color: #5B9BD5;
    outline: none;
  }

  .toolbar-row {
    display: flex;
    gap: 2px;
    flex-wrap: wrap;
  }

  .tool-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 26px;
    height: 24px;
    background: #252525;
    border: 1px solid #333;
    color: #BBB;
    cursor: pointer;
    border-radius: 3px;
    padding: 0;
  }
  .tool-btn:hover {
    background: #3D3D3D;
    color: #FFF;
    border-color: #555;
  }
  .tool-btn:active {
    background: #094771;
    color: #FFF;
  }

  .pick-color-btn {
    display: flex;
    align-items: center;
    gap: 6px;
    width: 100%;
    background: #252525;
    border: 1px solid #333;
    color: #BBB;
    font-size: 11px;
    padding: 5px 8px;
    border-radius: 3px;
    cursor: pointer;
    font-family: inherit;
  }
  .pick-color-btn:hover {
    background: #3D3D3D;
    color: #FFF;
    border-color: #5B9BD5;
  }
  .pick-color-btn:active {
    background: #094771;
    color: #FFF;
  }
</style>
