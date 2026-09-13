<script>
  /**
   * One published entry: what it is called, what it points at, and what a consumer gets.
   *
   * The issue banner is the point of the column. Whether a consumer will ever see this entry is
   * decided by the instance panel, which resolves the target — and the author's editor has never
   * asked it. Here the answer sits above the field that causes it, with the repair when there is
   * one.
   *
   * NO SLIDERS, as everywhere in this family of tabs: `NumberCell` for numbers, `Segmented` up to
   * four options, `PropertySelect` beyond.
   */
  import NumberCell from '../../properties/NumberCell.svelte';
  import Segmented from '../../properties/Segmented.svelte';
  import PropertySelect from '../../properties/PropertySelect.svelte';
  import { API_KIND_META, API_TYPES, rowFields } from '../../utils/publicApiModel.js';

  let {
    row = null,
    channels = [],
    pathSuggestions = [],
    onset = () => {},
    onfix = () => {},
  } = $props();

  let meta = $derived(row ? API_KIND_META[row.kind] : null);
  let fields = $derived(rowFields(row));

  const titleCase = (value) => String(value).replace(/[-_]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  const typeOptions = API_TYPES.map((value) => ({ value, label: value }));

  function valuesText(row) {
    return (row?.values ?? []).join(', ');
  }
</script>

{#if row}
  <div class="setbox">
    {#if row.issue}
      <div class="issue">
        <b>{meta.label} “{row.name}” never reaches a consumer.</b>
        It {row.issue.message}.
        {#if row.issue.fix}
          <button type="button" onclick={() => onfix(row.issue.fix)}>{row.issue.fixLabel}</button>
        {/if}
      </div>
    {/if}

    {#each row.warnings ?? [] as warning (warning.message)}
      <div class="warn {warning.severity}">{warning.message}</div>
    {/each}

    <div class="grp">Entry</div>
    <div class="r"><label for="api-name">Name</label><div class="fixed" id="api-name">{row.name}</div></div>
    <div class="r">
      <label for="api-label">Label</label>
      <input class="txt" id="api-label" type="text" value={row.label}
             onchange={(event) => onset('label', event.currentTarget.value)} />
    </div>
    <div class="r">
      <label for="api-type">Type</label>
      <PropertySelect options={typeOptions} value={row.type} ariaLabel="Type"
        onchange={(value) => onset('type', value)} />
    </div>
    <div class="r">
      <label for="api-on">Publish</label>
      <Segmented options={[{ value: false, label: 'No' }, { value: true, label: 'Yes' }]}
        value={row.enabled} ariaLabel="Publish" onchange={(value) => onset('enabled', value)} />
    </div>

    <div class="grp">{meta.targetLabel}</div>
    {#if row.kind === 'property'}
      <div class="r">
        <label for="api-path">Path</label>
        <input class="txt" id="api-path" class:bad={!!row.issue} type="text" list="api-path-options"
               value={row.target} onchange={(event) => onset('path', event.currentTarget.value)} />
        <datalist id="api-path-options">
          {#each pathSuggestions as suggestion (suggestion)}<option value={suggestion}></option>{/each}
        </datalist>
      </div>
    {:else}
      <div class="r">
        <label for="api-channel">Channel</label>
        <PropertySelect
          options={[{ value: '', label: '(none)' }, ...channels.map((name) => ({ value: name, label: name }))]}
          value={row.targetField === 'channel' ? row.target : ''}
          ariaLabel="Channel"
          onchange={(value) => onset('channel', value)}
        />
      </div>
      {#if row.targetField === 'variable'}
        <div class="r">
          <label for="api-variable">Variable</label>
          <div class="fixed stale" id="api-variable" title="A spelling nothing in the application reads">{row.target}</div>
        </div>
      {/if}
    {/if}

    <div class="grp">Consumer sees</div>
    {#each fields as field (field.key)}
      {#if field.key !== 'label'}
        <div class="r">
          <label for={`api-${field.key}`}>{field.label}</label>
          {#if field.kind === 'number'}
            <div class="cell">
              <NumberCell
                value={Number(row[field.key] ?? 0)}
                step={field.key === 'step' ? 0.01 : 1}
                label={field.label}
                onchange={(value) => onset(field.key, value)}
              />
            </div>
          {:else if field.kind === 'toggle'}
            <Segmented options={[{ value: false, label: 'No' }, { value: true, label: 'Yes' }]}
              value={row.defaultValue === true} ariaLabel={field.label}
              onchange={(value) => onset(field.key, value)} />
          {:else if field.kind === 'list'}
            <input class="txt" id={`api-${field.key}`} type="text" value={valuesText(row)}
                   title={field.hint}
                   onchange={(event) => onset('values', event.currentTarget.value.split(',').map((v) => v.trim()).filter(Boolean))} />
          {:else}
            <input class="txt" id={`api-${field.key}`} type="text" value={String(row[field.key] ?? '')}
                   title={field.hint}
                   onchange={(event) => onset(field.key, event.currentTarget.value)} />
          {/if}
        </div>
      {/if}
    {/each}
  </div>
{:else}
  <p class="none">Pick a row to edit what it publishes.</p>
{/if}

<style>
  .setbox { border: 1px solid #333; border-radius: 4px; background: #1A1D20; padding: 6px 8px 9px; }

  .grp {
    font: 600 8px/1 'IBM Plex Mono', ui-monospace, monospace;
    letter-spacing: 0.13em;
    text-transform: uppercase;
    color: #4B545C;
    margin: 9px 0 2px;
    padding-bottom: 3px;
    border-bottom: 1px solid #262B30;
  }
  .grp:first-child { margin-top: 2px; }

  .r {
    display: grid;
    grid-template-columns: 54px minmax(0, 1fr);
    gap: 6px;
    align-items: center;
    margin-top: 6px;
  }
  .r > label {
    font: 400 9.5px/1.15 'IBM Plex Sans', system-ui, sans-serif;
    color: #616C75;
    text-align: right;
  }

  .cell { min-width: 0; display: flex; }

  .fixed {
    min-width: 0;
    height: 24px;
    display: flex;
    align-items: center;
    padding: 0 6px;
    border: 1px solid #2A2F33;
    border-radius: 3px;
    background: #141719;
    font: 500 10px/1 'IBM Plex Mono', ui-monospace, monospace;
    color: #9AA6AE;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .fixed.stale { border-color: #4A3A1C; background: #241d10; color: #E5A029; }

  .txt {
    box-sizing: border-box;
    width: 100%;
    min-width: 0;
    height: 26px;
    padding: 0 6px;
    background: #1A1A1A;
    border: 1px solid #333;
    border-radius: 3px;
    color: #DDD;
    font: 400 11px/1 'IBM Plex Sans', system-ui, sans-serif;
    outline: none;
  }
  .txt:focus { border-color: #5B9BD5; }
  .txt.bad { border-color: #6B4A1E; }

  .issue {
    border: 1px solid #6B4A1E;
    background: #221D12;
    border-radius: 4px;
    padding: 6px 8px;
    margin-bottom: 4px;
    font: 400 9.5px/1.5 'IBM Plex Sans', system-ui, sans-serif;
    color: #D9BE8A;
  }
  .issue b { display: block; color: #F0D48A; font-weight: 600; }
  .issue button {
    margin-top: 5px;
    border: 1px solid #6B4A1E;
    background: #2A2213;
    color: #F0D48A;
    font: 600 9px/1 'IBM Plex Sans', system-ui, sans-serif;
    padding: 4px 7px;
    border-radius: 3px;
    cursor: pointer;
  }
  .issue button:hover { border-color: #E5A029; color: #FFF1D2; }

  .warn {
    border: 1px solid #333B42;
    background: #12171A;
    border-radius: 3px;
    padding: 5px 7px;
    margin-bottom: 4px;
    font: 400 9px/1.45 'IBM Plex Sans', system-ui, sans-serif;
    color: #8A949C;
  }
  .warn.issue { border-color: #5C3A3A; background: #241616; color: #D98C8C; }

  .none {
    margin: 0;
    padding: 16px 10px;
    border: 1px dashed #2E3540;
    border-radius: 4px;
    font: 400 10px/1.5 'IBM Plex Sans', system-ui, sans-serif;
    color: #69737B;
  }
</style>
