<script>
  import { getSection, updateControlProperty } from '../stores/controls.js';
  import { matrixRows, matrixCols, matrixAmounts, matrixIndex } from '../utils/matrixLayout.js';
  import PropertyCell from '../properties/PropertyCell.svelte';
  import PropertySection from '../properties/PropertySection.svelte';
  import SwatchCluster from '../properties/SwatchCluster.svelte';
  import PropertyToggle from '../properties/PropertyToggle.svelte';
  import NumberCell from '../properties/NumberCell.svelte';
  import Grid3x3 from 'lucide-svelte/icons/grid-3x3';
  import LogIn from 'lucide-svelte/icons/log-in';
  import LogOut from 'lucide-svelte/icons/log-out';
  import Hash from 'lucide-svelte/icons/hash';
  import Palette from 'lucide-svelte/icons/palette';

  let { control = null } = $props();

  let core = $derived(getSection(control, 'Core'));
  let m = $derived(getSection(control, 'Matrix'));
  let rows = $derived(matrixRows(control));
  let cols = $derived(matrixCols(control));
  let amounts = $derived(matrixAmounts(control));

  function set(prop, value) {
    if (!core?.id) return;
    updateControlProperty(core.id, `Matrix.${prop}`, value);
  }
  function toggle(prop) { set(prop, !(m?.[prop] === true)); }
  function num(v, f = 0) { const n = Number(v); return Number.isFinite(n) ? n : f; }

  // Resize the amounts array (row-major) when rows/cols change, preserving
  // overlapping cells so relabeling doesn't wipe the routing.
  function resized(oldRows, oldCols, newRows, newCols) {
    const out = new Array(newRows * newCols).fill(0);
    for (let r = 0; r < Math.min(oldRows, newRows); r += 1) {
      for (let c = 0; c < Math.min(oldCols, newCols); c += 1) {
        out[r * newCols + c] = amounts[r * oldCols + c] ?? 0;
      }
    }
    return out;
  }
  function setRowLabel(i, value) {
    set('rows', rows.map((r, idx) => idx === i ? value : r));
  }
  function setColLabel(i, value) {
    set('cols', cols.map((c, idx) => idx === i ? value : c));
  }
  function addRow() {
    const next = resized(rows.length, cols.length, rows.length + 1, cols.length);
    set('rows', [...rows, `Src ${rows.length + 1}`]);
    set('amounts', next);
  }
  function removeRow(i) {
    if (rows.length <= 1) return;
    const nextAmounts = amounts.filter((_, idx) => Math.floor(idx / cols.length) !== i);
    set('rows', rows.filter((_, idx) => idx !== i));
    set('amounts', nextAmounts);
  }
  function addCol() {
    const next = resized(rows.length, cols.length, rows.length, cols.length + 1);
    set('cols', [...cols, `Dst ${cols.length + 1}`]);
    set('amounts', next);
  }
  function removeCol(i) {
    if (cols.length <= 1) return;
    const nextAmounts = amounts.filter((_, idx) => (idx % cols.length) !== i);
    set('cols', cols.filter((_, idx) => idx !== i));
    set('amounts', nextAmounts);
  }
  function setAmount(r, c, value) {
    const bipolar = m?.bipolar !== false;
    const v = Math.max(bipolar ? -1 : 0, Math.min(1, num(value, 0)));
    set('amounts', amounts.map((a, idx) => idx === matrixIndex(r, c, cols.length) ? v : a));
  }
  function clearAmounts() { set('amounts', amounts.map(() => 0)); }

</script>

{#if m}
  <PropertySection title="Matrix" icon={Grid3x3}>
    <PropertyCell label="Cell style" span={2} hint="How each cell shows its amount.">
      <select class="val" value={m.cellStyle ?? 'bar'} onchange={(e) => set('cellStyle', e.target.value)}>
        <option value="bar">Bar</option>
        <option value="fill">Fill</option>
        <option value="dot">Dot</option>
      </select>
    </PropertyCell>
    <PropertyCell label="Bipolar" span={1} hint="Amounts range −1..1 (vs 0..1).">
      <PropertyToggle value={m.bipolar !== false} onchange={() => set('bipolar', !(m.bipolar !== false))} />
    </PropertyCell>
    <PropertyCell label="Editable" span={1} hint="Drag cells in preview.">
      <PropertyToggle value={m.editable !== false} onchange={() => set('editable', !(m.editable !== false))} />
    </PropertyCell>
    <PropertyCell label="Labels" span={1} hint="Show source/destination labels.">
      <PropertyToggle value={m.showLabels !== false} onchange={() => set('showLabels', !(m.showLabels !== false))} />
    </PropertyCell>
    <PropertyCell label="Values" span={1} hint="Print the amount in each cell.">
      <PropertyToggle value={m.showValues === true} onchange={() => toggle('showValues')} />
    </PropertyCell>
    <PropertyCell label="Snap" span={1} compact hint="Cell amount snap step (0 = free).">
      <NumberCell label="Snap" min={0} max={1} step={0.05} value={m.step ?? 0} defaultValue={0} onchange={(v) => set('step', Math.max(0, Math.min(1, v)))} />
    </PropertyCell>
    <PropertyCell label="Clear" span={1} hint="Reset all amounts to zero.">
      <button type="button" class="action-btn" onclick={clearAmounts}>Clear</button>
    </PropertyCell>
  </PropertySection>

  <PropertySection title="Sources" icon={LogIn}>
    {#snippet tools()}
      <button type="button" class="hdr-btn" title="Add source" onclick={addRow}>+ Add</button>
    {/snippet}
    <PropertyCell label="" span={4} hint="Modulation sources — the grid's rows. Each cell is a bindable 'Source → Destination' port.">
      <div class="lst">
        {#each rows as label, i (i)}
          <div class="lrow">
            <input class="val" type="text" value={label} onchange={(e) => setRowLabel(i, e.target.value)} />
            <button type="button" class="action-btn danger" disabled={rows.length <= 1} onclick={() => removeRow(i)}>✕</button>
          </div>
        {/each}
      </div>
    </PropertyCell>
  </PropertySection>

  <PropertySection title="Destinations" icon={LogOut}>
    {#snippet tools()}
      <button type="button" class="hdr-btn" title="Add destination" onclick={addCol}>+ Add</button>
    {/snippet}
    <PropertyCell label="" span={4} hint="Modulation destinations — the grid's columns.">
      <div class="lst">
        {#each cols as label, i (i)}
          <div class="lrow">
            <input class="val" type="text" value={label} onchange={(e) => setColLabel(i, e.target.value)} />
            <button type="button" class="action-btn danger" disabled={cols.length <= 1} onclick={() => removeCol(i)}>✕</button>
          </div>
        {/each}
      </div>
    </PropertyCell>
  </PropertySection>

  <PropertySection title="Amounts" icon={Hash}>
    <PropertyCell label="" span={4} hint="Set routing amounts numerically (or drag cells in preview).">
      <div class="grid" style={`grid-template-columns: 46px repeat(${cols.length}, minmax(0, 1fr));`}>
        <div class="ghdr"></div>
        {#each cols as label, c (`h${c}`)}<div class="ghdr" title={label}>{label}</div>{/each}
        {#each rows as rlabel, r (`row${r}`)}
          <div class="ghdr rlab" title={rlabel}>{rlabel}</div>
          {#each cols as _, c (`cell${r}_${c}`)}
            <span class="cell nc-wrap">
              <NumberCell min={m.bipolar !== false ? -1 : 0} max={1} step={0.05}
                          value={amounts[matrixIndex(r, c, cols.length)] ?? 0} defaultValue={0}
                          onchange={(v) => setAmount(r, c, v)} />
            </span>
          {/each}
        {/each}
      </div>
    </PropertyCell>
  </PropertySection>

  <PropertySection title="Style" icon={Palette}>
    <PropertyCell label="Colours" span={4} hint="Positive amounts, negative amounts, cell background, labels. Click a swatch to edit it in the Colors tab.">
      <SwatchCluster swatches={[
        { key: 'posColour', label: 'Pos', value: m.posColour ?? 'FF39D98A', target: { type: 'control', controlId: core?.id, path: 'Matrix.posColour' } },
        { key: 'negColour', label: 'Neg', value: m.negColour ?? 'FFEB5757', target: { type: 'control', controlId: core?.id, path: 'Matrix.negColour' } },
        { key: 'cellBg', label: 'Cells', value: m.cellBg ?? 'FF161616', target: { type: 'control', controlId: core?.id, path: 'Matrix.cellBg' } },
        { key: 'labelColour', label: 'Labels', value: m.labelColour ?? 'FFB9B9B9', target: { type: 'control', controlId: core?.id, path: 'Matrix.labelColour' } },
      ]} />
    </PropertyCell>
  </PropertySection>
{/if}

<style>
  .val { box-sizing: border-box; width: 100%; min-width: 0; height: var(--pp-field-height, 26px); padding: var(--pp-field-padding, 0 6px); background: var(--pp-field-bg, #1A1A1A); border: 1px solid var(--pp-field-border, #333); border-radius: var(--pp-field-radius, 3px); color: var(--pp-field-fg, #DDD); font-size: var(--pp-field-font, 11px); font-family: inherit; outline: none; }
  .val:focus { border-color: var(--pp-field-focus, #5B9BD5); }
  .lst { display: flex; flex-direction: column; gap: 5px; }
  .lrow { display: flex; align-items: center; gap: 5px; }
  .lrow .val { flex: 1 1 auto; }
  .grid { display: grid; gap: 3px; align-items: center; }
  .ghdr { color: #9a9a9a; font-size: 10px; text-align: center; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .ghdr.rlab { text-align: right; padding-right: 3px; }
  .cell { min-width: 0; }
  .nc-wrap { display: flex; }
  .action-btn {
    background: #252525; border: 1px solid #3B3B3B; border-radius: 3px; color: #DDD;
    font-size: 11px; padding: 4px 8px; cursor: pointer; align-self: flex-start;
  }
  .action-btn:hover { border-color: #5B9BD5; }
  .action-btn.danger { flex: 0 0 auto; padding: 3px 7px; }
  .action-btn.danger:disabled { opacity: 0.35; cursor: default; }
  .action-btn.danger:not(:disabled):hover { border-color: #C96A6A; }
  .hdr-btn {
    height: 16px; font-size: 9px; padding: 0 8px; border-radius: 8px;
    background: #252525; border: 1px solid #333; color: #777;
    font-family: inherit; cursor: pointer; line-height: 1;
  }
  .hdr-btn:hover { border-color: #4A6E8C; color: #CCC; }
</style>
