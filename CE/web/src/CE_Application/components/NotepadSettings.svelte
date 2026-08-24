<script>
  import Bold from 'lucide-svelte/icons/bold';
  import Italic from 'lucide-svelte/icons/italic';
  import Underline from 'lucide-svelte/icons/underline';
  import Strikethrough from 'lucide-svelte/icons/strikethrough';
  import AlignLeft from 'lucide-svelte/icons/align-left';
  import AlignCenter from 'lucide-svelte/icons/align-center';
  import AlignRight from 'lucide-svelte/icons/align-right';
  import List from 'lucide-svelte/icons/list';
  import ListOrdered from 'lucide-svelte/icons/list-ordered';
  import RemoveFormatting from 'lucide-svelte/icons/remove-formatting';
  import Pipette from 'lucide-svelte/icons/pipette';
  import { availableFonts, ensureStoredFontLoaded } from '../stores/appSettings.js';
  import NumberCell from '../properties/NumberCell.svelte';

  // `format` is the notepad editor's single formatting entry point. The sidebar used to take
  // `getEditorElement` and run `document.execCommand` on the element directly, which is finding
  // B10's last clause and was worse than deprecated: the keyboard half had already moved to the
  // Range-based ops, so the B button and Ctrl+B emitted different markup into the same note and
  // then disagreed about whether it was bold. One entry point, one implementation, no drift.
  let { format, onPickColor } = $props();

  let fontFamily = $state('Consolas');
  let fontSize = $state(12);
  let selectedFontOption = $derived(
    $availableFonts.find(option => option.value === fontFamily)
    ?? $availableFonts.find(option => option.family === fontFamily)
    ?? null
  );
  let selectedFontPreviewFamily = $derived(selectedFontOption?.cssFamily ?? fontFamily);
  $effect(() => {
    if (!selectedFontOption) return;
    ensureStoredFontLoaded(selectedFontOption, { delayMs: 0 });
  });

  const fontSizes = [8, 9, 10, 11, 12, 14, 16, 18, 20, 24, 28, 32, 36, 48];

  // No px-to-1-7 size map any more: execCommand's `fontSize` took the legacy HTML scale and
  // emitted `<font size="4">`, so this file mapped px onto that scale, applied it, then went
  // hunting for the `<font>` elements it had just caused and rewrote them to the px it wanted in
  // the first place. Two of those three steps existed only to undo the first.

  const run = (command, value = null) => format?.(command, value);

  function applyFont() {
    run('fontFamily', fontFamily);
  }

  function applyFontSize() {
    run('fontSize', fontSize);
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
      <span class="size-input nc-wrap">
        <NumberCell min={6} max={72} value={fontSize} onchange={(v) => { fontSize = v; applyFontSize(); }} />
      </span>
    </div>
  </div>

  <!-- Formatting -->
  <div class="section">
    <div class="section-label">Format</div>
    <div class="toolbar-row">
      <button class="tool-btn" onclick={() => run('bold')} title="Bold (Ctrl+B)">
        <Bold size={13} />
      </button>
      <button class="tool-btn" onclick={() => run('italic')} title="Italic (Ctrl+I)">
        <Italic size={13} />
      </button>
      <button class="tool-btn" onclick={() => run('underline')} title="Underline (Ctrl+U)">
        <Underline size={13} />
      </button>
      <button class="tool-btn" onclick={() => run('strikethrough')} title="Strikethrough">
        <Strikethrough size={13} />
      </button>
      <button class="tool-btn" onclick={() => run('clearFormatting')} title="Clear formatting">
        <RemoveFormatting size={13} />
      </button>
    </div>
  </div>

  <!-- Alignment -->
  <div class="section">
    <div class="section-label">Align</div>
    <div class="toolbar-row">
      <button class="tool-btn" onclick={() => run('alignLeft')} title="Align left">
        <AlignLeft size={13} />
      </button>
      <button class="tool-btn" onclick={() => run('alignCenter')} title="Align center">
        <AlignCenter size={13} />
      </button>
      <button class="tool-btn" onclick={() => run('alignRight')} title="Align right">
        <AlignRight size={13} />
      </button>
    </div>
  </div>

  <!-- Lists -->
  <div class="section">
    <div class="section-label">Lists</div>
    <div class="toolbar-row">
      <button class="tool-btn" onclick={() => run('bulletList')} title="Bullet list">
        <List size={13} />
      </button>
      <button class="tool-btn" onclick={() => run('numberedList')} title="Numbered list">
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

  /* Sizing wrapper around the size NumberCell — keeps the combo the wide half of the row. */
  .size-input {
    width: 56px;
    flex-shrink: 0;
  }
  .nc-wrap {
    display: flex;
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
