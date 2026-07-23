<script>
  // Listbox — an always-open, scrollable list of the control's Value rows.
  // Shares the Combobox data model but renders every row (role="listbox"/
  // "option"); selection + scroll are driven by the preview surface. Visual only.
  import { listboxRows, listboxRowHeight, listboxPadTop } from '../utils/listboxLayout.js';

  let { control = null, width = 0, height = 0, selectedValue = undefined, scrollTop = 0 } = $props();

  // AARRGGBB / RRGGBB → css rgba().
  function css(hex, fallback = 'rgba(224,224,224,1)') {
    const s = String(hex ?? '').replace(/^#/, '').trim();
    if (/^[0-9a-fA-F]{8}$/.test(s)) {
      const a = parseInt(s.slice(0, 2), 16) / 255;
      return `rgba(${parseInt(s.slice(2, 4), 16)},${parseInt(s.slice(4, 6), 16)},${parseInt(s.slice(6, 8), 16)},${a})`;
    }
    if (/^[0-9a-fA-F]{6}$/.test(s)) {
      return `rgba(${parseInt(s.slice(0, 2), 16)},${parseInt(s.slice(2, 4), 16)},${parseInt(s.slice(4, 6), 16)},1)`;
    }
    return fallback;
  }

  let rows = $derived(listboxRows(control));
  let rowH = $derived(listboxRowHeight(control));
  let padTop = $derived(listboxPadTop(control));
  let font = $derived(control?._children?.Text?._children?.Font ?? null);
  let textCss = $derived(css(control?._children?.Text?._children?.Fill?.colour, 'rgba(224,224,224,1)'));
  let accentCss = $derived(css(control?._children?.Background?._children?.Border?.colour, 'rgba(137,194,255,0.9)'));
  let fontFamily = $derived(String(font?.family ?? 'Arial'));
  let fontSize = $derived(Math.max(6, Number(font?.size) || 12));
  let fontWeight = $derived(Number(font?.weightValue) || 400);
  let alignH = $derived(String(control?._children?.ContentLayout?.horizontalAlign ?? 'left'));
  let padLeft = $derived(Math.max(0, Number(control?._children?.ContentLayout?.paddingLeft) || 10));

  function rowValue(row) {
    return row?.internalValue ?? row?.id ?? '';
  }
  function isSelected(row) {
    return String(rowValue(row)) === String(selectedValue ?? '');
  }
</script>

<div
  class="listbox"
  role="listbox"
  style={`width:${width}px; height:${height}px; color:${textCss}; font-family:${fontFamily}; font-size:${fontSize}px; font-weight:${fontWeight}; padding-top:${padTop}px; padding-bottom:${padTop}px;`}
>
  <div class="listbox-scroll" style={`transform: translateY(${-Math.max(0, scrollTop)}px);`}>
    {#each rows as row (row.id ?? row.internalValue ?? row.displayText)}
      {@const sel = isSelected(row)}
      <div
        class="listbox-row"
        class:selected={sel}
        role="option"
        aria-selected={sel}
        style={`height:${rowH}px; padding-left:${padLeft}px; text-align:${alignH}; ${sel ? `background:${accentCss}; color:#0B0B0B;` : ''}`}
      >
        <span class="listbox-row-label">{row.displayText ?? row.internalValue ?? ''}</span>
      </div>
    {/each}
  </div>
</div>

<style>
  .listbox {
    position: absolute;
    inset: 0;
    box-sizing: border-box;
    overflow: hidden;
    pointer-events: none;
  }
  .listbox-scroll {
    display: flex;
    flex-direction: column;
    will-change: transform;
  }
  .listbox-row {
    display: flex;
    align-items: center;
    box-sizing: border-box;
    white-space: nowrap;
    overflow: hidden;
  }
  .listbox-row.selected {
    font-weight: 600;
  }
  .listbox-row-label {
    overflow: hidden;
    text-overflow: ellipsis;
  }
</style>
