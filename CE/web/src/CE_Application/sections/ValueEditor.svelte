<script>
  import { getSection, updateControlProperty } from '../stores/controls.js';
  import { panels, resolvedActivePanelId } from '../stores/panels.js';
  import PropertyCell from '../properties/PropertyCell.svelte';
  import PropertySection from '../properties/PropertySection.svelte';
  import PropertyToggle from '../properties/PropertyToggle.svelte';

  let { control = null } = $props();

  let core = $derived(getSection(control, 'Core'));
  let text = $derived(getSection(control, 'Text'));
  let behavior = $derived(getSection(control, 'Behavior'));
  let valueSection = $derived(getSection(control, 'Value'));
  let buttonType = $derived(String(behavior?.buttonType ?? 'momentary'));
  let rows = $derived(Array.isArray(valueSection?.rows) ? valueSection.rows : []);

  // Cascading selectors: other selector controls on this panel that can drive
  // this one, plus the chosen parent's rows (to populate the per-row picker).
  let isSelector = $derived(['radio', 'combobox', 'listbox', 'cyclic'].includes(buttonType));
  let panelControls = $derived($panels.find((p) => p.id === $resolvedActivePanelId)?.controls ?? []);
  let parentOptions = $derived(panelControls.filter((c) => {
    const id = c?._children?.Core?.id;
    const bt = String(c?._children?.Behavior?.buttonType ?? '').toLowerCase();
    return id && id !== core?.id && ['radio', 'combobox', 'listbox', 'cyclic'].includes(bt);
  }));
  let dependsOn = $derived(String(valueSection?.dependsOn ?? ''));
  let parentControl = $derived(panelControls.find((c) => c?._children?.Core?.id === dependsOn) ?? null);
  let parentRows = $derived((parentControl?._children?.Value?.rows ?? []).filter((r) => r?.isHeader !== true));
  function parentRowValue(row) { return String(row?.internalValue ?? row?.id ?? ''); }
  function parentRowLabel(row) { return String(row?.displayText || row?.internalValue || row?.id || ''); }

  function set(path, value) {
    if (!core?.id) return;
    updateControlProperty(core.id, path, value);
  }

  function updateRows(nextRows) {
    set('Value.rows', nextRows);
  }

  function addRow() {
    const nextIndex = rows.length + 1;
    updateRows([
      ...rows,
      {
        id: `row_${Date.now()}_${nextIndex}`,
        displayText: `Option ${nextIndex}`,
        internalValue: `option_${nextIndex}`,
        sendValue: nextIndex - 1,
        receiveValue: '',
        selectedByDefault: rows.length === 0,
        enabled: true,
        visualOverrides: {},
      },
    ]);
  }

  function removeRow(index) {
    const next = [...rows];
    next.splice(index, 1);
    updateRows(next);
  }

  function updateRow(index, key, nextValue) {
    const next = rows.map((row, rowIndex) => rowIndex === index ? { ...row, [key]: nextValue } : row);
    updateRows(next);
  }
</script>

{#if valueSection}
  <PropertySection title="Value">
    <PropertyCell label="Mapping" span={2} hint="Reveal the row-based mapping editor when this button carries payload or send values.">
      <PropertyToggle
        value={valueSection.showMapping === true || buttonType !== 'momentary'}
        onchange={() => set('Value.showMapping', !(valueSection.showMapping === true))}
      />
    </PropertyCell>
    <PropertyCell label="Rows" span={2} hint="Add or remove rows for cyclic values, radio groups, toggles, and mapped payloads.">
      <button type="button" class="action-btn" onclick={addRow}>Add Row</button>
    </PropertyCell>
    {#if isSelector}
      <PropertyCell label="Store by name" span={4} hint="Export/save this choice by its stable name instead of a row index, so the value round-trips even when the visible rows change (cascading lists).">
        <PropertyToggle
          value={valueSection.storeByValue === true}
          onchange={() => set('Value.storeByValue', !(valueSection.storeByValue === true))}
        />
      </PropertyCell>
    {/if}
  </PropertySection>

  {#if isSelector}
    <PropertySection title="Depends on (cascading)">
      <PropertyCell label="Parent list" span={dependsOn ? 3 : 4} hint="Show only the rows that match another selector's current choice (bank → preset).">
        <select class="val" value={dependsOn} onchange={(event) => set('Value.dependsOn', event.target.value)}>
          <option value="">— None (independent) —</option>
          {#each parentOptions as parent (parent._children.Core.id)}
            <option value={parent._children.Core.id}>{parent._children?.Core?.name || parent._children.Core.id}</option>
          {/each}
        </select>
      </PropertyCell>
      {#if dependsOn}
        <PropertyCell label="Reset pick" span={1} hint="When the parent changes, jump this list to the first matching row.">
          <PropertyToggle
            value={valueSection.dependsResetOnChange !== false}
            onchange={() => set('Value.dependsResetOnChange', !(valueSection.dependsResetOnChange !== false))}
          />
        </PropertyCell>
        {#if parentControl && parentRows.length === 0}
          <PropertyCell label="" span={4}>
            <div class="empty">The parent list has no rows yet — add rows there first, then tag each row below with the parent value it belongs to.</div>
          </PropertyCell>
        {/if}
      {/if}
    </PropertySection>
  {/if}

  {#if buttonType === 'momentary' && valueSection.showMapping !== true}
    <PropertySection title="Momentary">
      <PropertyCell label="Label" span={4} hint="Keep simple momentary buttons label-first unless you need explicit payload mapping.">
        <input
          class="val"
          type="text"
          value={text?.content ?? ''}
          onchange={(event) => set('Text.content', event.target.value)}
        />
      </PropertyCell>
    </PropertySection>
  {:else}
    <PropertySection title="Rows">
      <PropertyCell label="Items" span={4} hint="Each row ties together display text, internal value, and send mapping.">
        <div class="rows-editor">
          {#if rows.length === 0}
            <div class="empty">No value rows yet. Add rows to define display and send mapping.</div>
          {/if}

          {#each rows as row, index (row.id ?? index)}
            <div class="row-card">
              <div class="row-grid">
                <input
                  class="val"
                  type="text"
                  value={row.displayText ?? ''}
                  placeholder="Display Text"
                  onchange={(event) => updateRow(index, 'displayText', event.target.value)}
                />
                <input
                  class="val"
                  type="text"
                  value={row.internalValue ?? ''}
                  placeholder="Internal Value"
                  onchange={(event) => updateRow(index, 'internalValue', event.target.value)}
                />
                <input
                  class="val"
                  type="text"
                  value={row.sendValue ?? ''}
                  placeholder="Send Value"
                  onchange={(event) => updateRow(index, 'sendValue', event.target.value)}
                />
                <input
                  class="val"
                  type="text"
                  value={row.receiveValue ?? ''}
                  placeholder="Receive Value"
                  onchange={(event) => updateRow(index, 'receiveValue', event.target.value)}
                />
              </div>
              <div class="row-actions">
                {#if buttonType === 'radio' || buttonType === 'combobox' || buttonType === 'listbox'}
                  <label class="flag">
                    <input
                      type="checkbox"
                      checked={row.selectedByDefault === true}
                      onchange={(event) => updateRow(index, 'selectedByDefault', event.currentTarget.checked)}
                    />
                    <span>Default</span>
                  </label>
                {/if}
                <label class="flag">
                  <input
                    type="checkbox"
                    checked={row.enabled !== false}
                    onchange={(event) => updateRow(index, 'enabled', event.currentTarget.checked)}
                  />
                  <span>Enabled</span>
                </label>
                <button type="button" class="action-btn danger" onclick={() => removeRow(index)}>Remove</button>
              </div>
              {#if isSelector && dependsOn && row.isHeader !== true}
                <label class="show-for">
                  <span>Show for</span>
                  <select
                    class="val"
                    value={String(row.parentValue ?? '')}
                    onchange={(event) => updateRow(index, 'parentValue', event.target.value)}
                  >
                    <option value="">All ({parentControl?._children?.Core?.name || 'parent'})</option>
                    {#each parentRows as prow (prow.id ?? prow.internalValue)}
                      <option value={parentRowValue(prow)}>{parentRowLabel(prow)}</option>
                    {/each}
                  </select>
                </label>
              {/if}
              {#if buttonType === 'listbox'}
                <div class="row-rich">
                  <label class="flag">
                    <input type="checkbox" checked={row.isHeader === true} onchange={(event) => updateRow(index, 'isHeader', event.currentTarget.checked)} />
                    <span>Header</span>
                  </label>
                  {#if row.isHeader !== true}
                    <input class="rich-in" type="text" placeholder="icon (glyph or URL)" value={row.icon ?? ''} onchange={(event) => updateRow(index, 'icon', event.target.value)} />
                    <input class="rich-in" type="text" placeholder="subtitle" value={row.subtitle ?? ''} onchange={(event) => updateRow(index, 'subtitle', event.target.value)} />
                    <input class="rich-in" type="text" placeholder="badge" value={row.badge ?? ''} onchange={(event) => updateRow(index, 'badge', event.target.value)} />
                    <input class="rich-in" type="text" placeholder="swatch AARRGGBB" value={row.swatch ?? ''} onchange={(event) => updateRow(index, 'swatch', event.target.value.trim())} />
                  {/if}
                </div>
              {/if}
            </div>
          {/each}
        </div>
      </PropertyCell>
    </PropertySection>
  {/if}
{/if}

<style>
  .val {
    width: 100%;
    min-width: 0;
    background: #1A1A1A;
    border: 1px solid #333;
    border-radius: 3px;
    color: #DDD;
    font-size: 11px;
    padding: 4px 6px;
    font-family: inherit;
    outline: none;
  }

  .val:focus {
    border-color: #5B9BD5;
  }

  .rows-editor {
    display: flex;
    flex-direction: column;
    gap: 8px;
    width: 100%;
  }

  .row-card {
    border: 1px solid #303030;
    border-radius: 6px;
    background: #171717;
    padding: 8px;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .row-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 6px;
  }

  .row-actions {
    display: flex;
    align-items: center;
    gap: 10px;
    justify-content: flex-end;
  }

  .row-rich {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px;
    margin-top: 6px;
  }
  .row-rich .rich-in {
    flex: 1 1 90px;
    min-width: 70px;
    background: #1A1A1A;
    border: 1px solid #333;
    color: #DDD;
    border-radius: 4px;
    padding: 3px 6px;
    font-size: 11px;
  }
  .row-rich .rich-in:focus-visible { outline: 2px solid #5B9BD5; outline-offset: 1px; }

  .flag {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    color: #B9B9B9;
    font-size: 11px;
  }

  .show-for {
    display: flex;
    align-items: center;
    gap: 8px;
    color: #B9B9B9;
    font-size: 11px;
  }
  .show-for span { flex: 0 0 auto; }
  .show-for .val { flex: 1 1 auto; }

  .empty {
    border: 1px dashed #3A3A3A;
    border-radius: 4px;
    color: #8A8A8A;
    font-size: 11px;
    padding: 8px;
  }

  .action-btn {
    background: #252525;
    border: 1px solid #3B3B3B;
    border-radius: 3px;
    color: #DDD;
    font-size: 11px;
    padding: 4px 8px;
    cursor: pointer;
    font-family: inherit;
  }

  .action-btn:hover {
    border-color: #5B9BD5;
  }

  .action-btn.danger:hover {
    border-color: #C96A6A;
  }
</style>
