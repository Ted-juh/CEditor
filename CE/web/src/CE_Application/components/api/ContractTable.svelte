<script>
  /**
   * The contract, as one table.
   *
   * This is the column that replaces three `<select>` dropdowns. The properties panel edits a
   * published entry by picking its name out of a list and filling in eight fields, three times over
   * — inputs, outputs, editable properties — so the answer to "what does this component expose" is
   * only obtainable by visiting every entry and remembering what you saw. Measured, the editing
   * sections do not even grow: a contract of fifty entries renders in exactly the same 198px as one
   * of five, because the height does not depend on the contract.
   *
   * The whole contract IS already listed in the panel, in the API Preview's three read-only lanes.
   * This is that list, made the thing you edit.
   *
   * A row that a consumer will never see is marked here rather than only in a summary, because the
   * row is where the author can fix it.
   */
  import ArrowRight from 'lucide-svelte/icons/arrow-right';
  import ArrowLeft from 'lucide-svelte/icons/arrow-left';
  import Dot from 'lucide-svelte/icons/dot';
  import X from 'lucide-svelte/icons/x';
  import { API_COLUMNS, API_KIND_META, rangeText } from '../../utils/publicApiModel.js';

  let {
    rows = [],
    selectedKey = '',
    sortColumn = 'kind',
    sortDirection = 'asc',
    onselect = () => {},
    onsort = () => {},
    ontoggle = () => {},
    onremove = () => {},
  } = $props();

  const ICONS = { input: ArrowRight, output: ArrowLeft, property: Dot };

  function cellText(row, key) {
    if (key === 'range') return rangeText(row);
    if (key === 'defaultValue') {
      const value = row.defaultValue;
      return value === undefined || value === null || value === '' ? '—' : String(value);
    }
    if (key === 'target') return row.target || '—';
    return String(row[key] ?? '');
  }
</script>

<div class="table" role="table" aria-label="Published contract">
  <div class="thead" role="row">
    {#each API_COLUMNS as column (column.key)}
      <button
        type="button"
        class="th {column.key}"
        class:sorted={sortColumn === column.key}
        role="columnheader"
        aria-sort={sortColumn === column.key ? (sortDirection === 'asc' ? 'ascending' : 'descending') : 'none'}
        title={`Sort by ${column.label}`}
        onclick={() => onsort(column.key)}
      >
        {column.label}{#if sortColumn === column.key}<i>{sortDirection === 'asc' ? '▲' : '▼'}</i>{/if}
      </button>
    {/each}
  </div>

  <div class="tbody">
    {#each rows as row (row.key)}
      {@const Icon = ICONS[row.kind]}
      <div
        class="tr"
        class:sel={row.key === selectedKey}
        class:off={!row.enabled}
        class:bad={!!row.issue}
        class:warned={!row.issue && row.warnings?.length}
        role="row"
        tabindex="0"
        aria-selected={row.key === selectedKey}
        title={row.issue ? `${API_KIND_META[row.kind].label} "${row.name}" ${row.issue.message}` : row.label}
        onclick={() => onselect(row.key)}
        onkeydown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onselect(row.key); } }}
      >
        <span class="td kind" role="cell" title={API_KIND_META[row.kind].label}>
          <Icon size={11} aria-hidden="true" />
        </span>
        <span class="td name" role="cell">
          {row.name}
          {#if row.label && row.label !== row.name}<i>{row.label}</i>{/if}
        </span>
        <span class="td type" role="cell">{cellText(row, 'type')}</span>
        <span class="td target" role="cell" class:missing={!!row.issue}>{cellText(row, 'target')}</span>
        <span class="td range" role="cell">{cellText(row, 'range')}</span>
        <span class="td defaultValue" role="cell">{cellText(row, 'defaultValue')}</span>
        <span class="td enabled" role="cell">
          <button
            type="button"
            class="dot"
            class:on={row.enabled}
            aria-label={`${row.name} ${row.enabled ? 'published' : 'not published'}`}
            title={row.enabled ? 'Published — click to withhold' : 'Withheld — click to publish'}
            onclick={(event) => { event.stopPropagation(); ontoggle(row); }}
          ></button>
          <button
            type="button"
            class="drop"
            aria-label={`Remove ${row.name}`}
            title={`Remove ${API_KIND_META[row.kind].label.toLowerCase()} "${row.name}" from the contract`}
            onclick={(event) => { event.stopPropagation(); onremove(row); }}
          ><X size={9} /></button>
        </span>
      </div>
    {/each}

    {#if !rows.length}
      <p class="none">This component publishes nothing yet. Add an input, output or property in the properties panel.</p>
    {/if}
  </div>
</div>

<style>
  .td.enabled { display: flex; align-items: center; gap: 4px; }
  .drop {
    width: 15px; height: 15px; display: flex; align-items: center; justify-content: center;
    padding: 0; border: 1px solid transparent; border-radius: 3px; background: transparent;
    color: #3A434A; cursor: pointer; opacity: 0;
  }
  .tr:hover .drop, .tr.sel .drop, .drop:focus-visible { opacity: 1; }
  .drop:hover { border-color: #5C3A3A; color: #D98C8C; }

  .table {
    border: 1px solid #2E3540;
    border-radius: 4px;
    background: #12171A;
    overflow: hidden;
    min-width: 0;
  }

  .thead, .tr {
    display: grid;
    grid-template-columns: 30px minmax(0, 1.5fr) 54px minmax(0, 1.7fr) 78px 62px 30px;
    align-items: center;
    gap: 6px;
    padding: 0 6px;
  }

  .thead { background: #171D22; border-bottom: 1px solid #2E3540; }

  .th {
    border: 0;
    background: transparent;
    padding: 5px 0;
    text-align: left;
    font: 600 8px/1 'IBM Plex Mono', ui-monospace, monospace;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: #4B545C;
    cursor: pointer;
    white-space: nowrap;
    overflow: hidden;
  }
  .th:hover { color: #9AA6AE; }
  .th.sorted { color: #8FEDE3; }
  .th i { font-style: normal; margin-left: 3px; font-size: 7px; }
  .th.range, .th.defaultValue, .th.enabled { text-align: right; }

  .tbody { max-height: 268px; overflow-y: auto; }

  .tr {
    border-bottom: 1px solid #1E242A;
    font: 400 10px/1.3 'IBM Plex Mono', ui-monospace, monospace;
    color: #B9C8D4;
    cursor: pointer;
    padding-top: 4px;
    padding-bottom: 4px;
    outline: none;
  }
  .tr:last-child { border-bottom: 0; }
  .tr:hover { background: #1A2126; }
  .tr:focus-visible { box-shadow: inset 0 0 0 1px #5B9BD5; }
  .tr.sel { background: #173449; box-shadow: inset 2px 0 0 #5B9BD5; }
  .tr.off { opacity: 0.45; }
  /* A row a consumer will never see. Marked on the row, not only in a summary, because the row is
     where it gets fixed. */
  .tr.bad { background: #221D12; box-shadow: inset 2px 0 0 #E5A029; }
  .tr.bad.sel { background: #2A2417; box-shadow: inset 2px 0 0 #5B9BD5; }
  .tr.warned { box-shadow: inset 2px 0 0 #4A555E; }

  .td { min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .td.kind { color: #69737B; display: flex; }
  .tr.sel .td.kind { color: #8FEDE3; }
  .name { color: #E8EEF5; }
  .name i { font-style: normal; color: #616C75; margin-left: 5px; }
  .type { color: #8A949C; }
  .target { color: #93B0C4; }
  .target.missing { color: #E5A029; }
  .range, .defaultValue { text-align: right; color: #8A949C; }
  .enabled { display: flex; justify-content: flex-end; }

  .dot {
    width: 9px;
    height: 9px;
    padding: 0;
    border-radius: 50%;
    border: 1px solid #3A434A;
    background: #2A2F33;
    cursor: pointer;
  }
  .dot.on { background: #14B8A6; border-color: #0E7C70; }

  .none {
    margin: 0;
    padding: 18px 12px;
    font: 400 10px/1.5 'IBM Plex Sans', system-ui, sans-serif;
    color: #69737B;
  }
</style>
