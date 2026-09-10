<script>
  /**
   * The API tab.
   *
   * Candidate 5 of the display-panel plan; `docs/design/api-tab-design.md` has the argument. Three
   * things are worth knowing before editing this file.
   *
   * FIRST, the contract is a table and the panel does not draw it as one. `CustomPublishedProperties
   * Editor` edits a published entry by picking its name out of a `<select>` and filling in eight
   * fields, three times over. Measured: growing a contract from eight entries to fifty leaves those
   * three sections at exactly 198px, 198px and 256px, because their height does not depend on the
   * contract. The whole contract IS listed in the same editor, read-only, in the API Preview's three
   * lanes. This tab is that list made the thing you edit.
   *
   * SECOND, the tab tells the author what the consumer will actually see. Three places answer
   * "will this entry reach an instance panel?" and they disagree — see the header of
   * `utils/publicApiModel.js`, which has the measurement. This tab gives the author the instance
   * panel's answer, because that is the one that decides whether the entry exists.
   *
   * THIRD, THE PROPERTIES PANEL IS UNTOUCHED. Both publish editors still draw every section and
   * still edit every field. Nothing is relocated; `allApiFieldLabels()` is ready for the day the
   * panel's rows come out.
   */
  import { onMount } from 'svelte';
  import ContractTable from './api/ContractTable.svelte';
  import EntrySettings from './api/EntrySettings.svelte';
  import { activePanel, selectedComponentIds } from '../stores/panels.js';
  import { applyControlPatch, updateControlProperty, getSection } from '../stores/controls.js';
  import { flatControls } from '../utils/containment.js';
  import { validateCustomComponentPackage } from '../utils/customComponentPackage.js';
  import {
    editorTarget,
    activateEditorTarget,
    clearEditorTarget,
    targetOfKind,
  } from '../stores/editorTarget.js';
  import {
    contractRows,
    attachValidation,
    sortRows,
    contractCounts,
    entryPath,
    API_KIND_META,
  } from '../utils/publicApiModel.js';

  let mine = $derived(targetOfKind($editorTarget, 'api'));
  let panelControls = $derived(flatControls($activePanel?.controls ?? []));

  let control = $derived(
    mine?.controlId
      ? panelControls.find((entry) => entry._children?.Core?.id === mine.controlId) ?? null
      : null
  );

  let controlId = $derived(control?._children?.Core?.id ?? '');
  let controlName = $derived(control?._children?.Core?.name || control?._children?.Core?.controlType || '');
  let published = $derived(getSection(control, 'PublishedProperties'));
  let channels = $derived(Object.keys(getSection(control, 'ValueChannels')?._children ?? {}));
  let parts = $derived(Object.keys(getSection(control, 'Parts')?._children ?? {}));

  // The same messages the panel's API Preview lists, attached to the rows they name instead of
  // left as prose you match by reading a quoted name.
  let validation = $derived.by(() => {
    if (!control) return [];
    const report = validateCustomComponentPackage(control);
    return [
      ...(report?.issues ?? []).map((message) => ({ severity: 'issue', message })),
      ...(report?.warnings ?? []).map((message) => ({ severity: 'warning', message })),
    ];
  });

  let rows = $derived(control ? attachValidation(contractRows(control), validation) : []);
  let counts = $derived(contractCounts(rows));

  let sortColumn = $state('kind');
  let sortDirection = $state('asc');
  let sorted = $derived(sortRows(rows, sortColumn, sortDirection));

  let wantedKey = $state('');
  let selectedKey = $derived(
    sorted.some((row) => row.key === wantedKey) ? wantedKey : (sorted[0]?.key ?? '')
  );
  let selected = $derived(sorted.find((row) => row.key === selectedKey) ?? null);

  let pathSuggestions = $derived([
    ...parts.map((name) => `Parts.${name}.Text.content`),
    ...parts.map((name) => `Parts.${name}.Background.Fill.colour`),
    ...channels.map((name) => `ValueChannels.${name}.defaultValue`),
    'Designer.activeVariant',
    'Core.name',
  ]);

  onMount(() => {
    if (mine) return;
    const first = [...($selectedComponentIds ?? [])][0];
    if (first) activateEditorTarget('api', first);
  });

  function armFromSelection() {
    const first = [...($selectedComponentIds ?? [])][0];
    if (first) activateEditorTarget('api', first);
  }

  function sortBy(column) {
    if (sortColumn === column) {
      sortDirection = sortDirection === 'asc' ? 'desc' : 'asc';
      return;
    }
    sortColumn = column;
    sortDirection = 'asc';
  }

  function setField(key, value) {
    if (!controlId || !selected) return;
    updateControlProperty(controlId, entryPath(selected.kind, selected.name, key), value);
  }

  function toggleRow(row) {
    if (!controlId || !row) return;
    updateControlProperty(controlId, entryPath(row.kind, row.name, 'enabled'), !row.enabled);
  }

  /**
   * Applying a repair clears the field it replaces. A `variable` left beside the `channel` that
   * supersedes it is the stale spelling still sitting there for the next reader to trust.
   */
  function applyFix(fix) {
    if (!controlId || !selected || !fix?.field) return;
    const patch = { [entryPath(selected.kind, selected.name, fix.field)]: fix.value };
    if (fix.field === 'channel' && selected.targetField === 'variable') {
      patch[entryPath(selected.kind, selected.name, 'variable')] = '';
    }
    applyControlPatch(controlId, patch);
  }
</script>

<div class="api-tab">
  {#if !control}
    <div class="empty">
      <strong>Nothing armed.</strong>
      <p>
        Select a custom component on the canvas, then use the button below. This tab stays on the
        control you open it with, so it will not change under you while you work.
      </p>
      <button type="button" class="arm" disabled={!($selectedComponentIds?.size)} onclick={armFromSelection}>
        {($selectedComponentIds?.size) ? 'Edit the selected control’s API' : 'Select a control first'}
      </button>
    </div>
  {:else if !published}
    <div class="empty">
      <strong>{controlName} publishes nothing.</strong>
      <p>This tab edits a custom component's public contract — the inputs, outputs and editable properties it offers to whoever uses it.</p>
      <button type="button" class="arm" onclick={armFromSelection}>Use the selection</button>
    </div>
  {:else}
    <div class="head">
      <span class="who">
        editing <b>{controlName}</b>
        <em>{counts.input} in · {counts.output} out · {counts.property} props</em>
        {#if !($selectedComponentIds?.has?.(controlId))}
          <i class="stale" title="This is not the control currently selected — the tab stays where you opened it">not selected</i>
        {/if}
      </span>

      {#if counts.dropped}
        <span class="alarm" role="status">
          {counts.dropped} {counts.dropped === 1 ? 'entry' : 'entries'} never reach a consumer
        </span>
      {/if}

      <div class="headtools">
        <button type="button" disabled={!($selectedComponentIds?.size)} onclick={armFromSelection}
                title="Point this tab at the control that is selected now">Use selection</button>
        <button type="button" onclick={clearEditorTarget} title="Stop editing this control">Clear</button>
      </div>
    </div>

    <div class="cols">
      <div class="tablecol">
        <div class="colh">Contract <s>{counts.total} {counts.total === 1 ? 'entry' : 'entries'}</s></div>
        <ContractTable
          rows={sorted}
          {selectedKey}
          {sortColumn}
          {sortDirection}
          onselect={(key) => { wantedKey = key; }}
          onsort={sortBy}
          ontoggle={toggleRow}
        />
      </div>

      <div class="setcol">
        <div class="colh">{selected ? API_KIND_META[selected.kind].label : 'Entry'}</div>
        <EntrySettings
          row={selected}
          {channels}
          {pathSuggestions}
          onset={setField}
          onfix={applyFix}
        />
      </div>
    </div>
  {/if}
</div>

<style>
  .api-tab {
    height: 100%;
    display: flex;
    flex-direction: column;
    min-height: 0;
    overflow: auto;
    background: #15181B;
  }

  .head {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 6px 10px;
    border-bottom: 1px solid #2A2A2A;
    flex: 0 0 auto;
  }

  .who {
    font: 500 9.5px/1 'IBM Plex Mono', ui-monospace, monospace;
    color: #616C75;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .who b { color: #8FEDE3; font-weight: 600; }
  .who em { font-style: normal; margin-left: 6px; color: #8A949C; }
  .who .stale {
    font-style: normal;
    margin-left: 6px;
    color: #E5A029;
    border: 1px solid #4A3A1C;
    background: #241d10;
    border-radius: 2px;
    padding: 2px 4px;
  }

  .alarm {
    font: 600 9px/1 'IBM Plex Sans', system-ui, sans-serif;
    color: #F0D48A;
    border: 1px solid #6B4A1E;
    background: #241d10;
    border-radius: 3px;
    padding: 4px 7px;
    white-space: nowrap;
  }

  .headtools { margin-left: auto; display: flex; gap: 4px; }
  .headtools button {
    border: 1px solid #333B42;
    background: #12171A;
    color: #9AA6AE;
    font: 600 9px/1 'IBM Plex Sans', system-ui, sans-serif;
    padding: 5px 8px;
    border-radius: 3px;
    cursor: pointer;
  }
  .headtools button:hover:not(:disabled) { border-color: #4A555E; color: #E8EEF5; }
  .headtools button:disabled { opacity: 0.4; cursor: default; }

  .cols {
    display: flex;
    gap: 10px;
    padding: 10px;
    align-items: flex-start;
    min-width: 0;
    flex: 1 1 auto;
  }

  .tablecol { flex: 1 1 0; min-width: 360px; }
  .setcol { flex: 0 0 272px; min-width: 0; }

  .colh {
    display: flex;
    align-items: center;
    gap: 6px;
    font: 600 8.5px/1 'IBM Plex Mono', ui-monospace, monospace;
    letter-spacing: 0.13em;
    text-transform: uppercase;
    color: #616C75;
    margin-bottom: 7px;
    white-space: nowrap;
    overflow: hidden;
  }
  .colh s { margin-left: auto; text-decoration: none; font-size: 8.5px; letter-spacing: 0.06em; }

  .empty { padding: 22px; max-width: 46ch; color: #8A949C; }
  .empty strong { display: block; font: 600 13px/1.4 'IBM Plex Sans', system-ui, sans-serif; color: #E8EEF5; }
  .empty p { margin: 8px 0 14px; font: 400 12px/1.6 'IBM Plex Sans', system-ui, sans-serif; }

  .arm {
    border: 1px solid #0E7C70;
    background: #0B2320;
    color: #8FEDE3;
    font: 600 11px/1 'IBM Plex Sans', system-ui, sans-serif;
    padding: 8px 12px;
    border-radius: 3px;
    cursor: pointer;
  }
  .arm:disabled { opacity: 0.45; cursor: default; border-color: #333B42; background: #12171A; color: #69737B; }

  @media (max-width: 1000px) {
    .cols { flex-wrap: wrap; }
    .setcol { flex: 1 1 100%; }
  }
</style>
