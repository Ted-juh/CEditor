<script>
  /**
   * The selected zone's or element's settings — what it shows, where it reads from, and the
   * handful of fields a rectangle cannot express.
   *
   * The region is here as numbers TOO, not instead. Dragging is the fast way to place a zone and
   * typing is the exact way, and the Typography tab settled that argument the same way: the numbers
   * stay beside the handles.
   *
   * NO SLIDERS, as everywhere in this family of tabs. `NumberCell` for numbers, `Segmented` up to
   * four options, `PropertySelect` beyond — the split that component's own comment asks for.
   */
  import NumberCell from '../../properties/NumberCell.svelte';
  import Segmented from '../../properties/Segmented.svelte';
  import PropertySelect from '../../properties/PropertySelect.svelte';
  import { itemFields, itemRect } from '../../utils/screenModel.js';

  let {
    kind = 'lcd',
    item = null,
    index = -1,
    grid = { unitsX: 16, unitsY: 2, unit: 'cell' },
    kinds = [],
    sources = [],
    issue = null,
    onset = () => {},
    onrect = () => {},
    onrepair = () => {},
  } = $props();

  let rect = $derived(item ? itemRect(item, kind) : null);
  let fields = $derived(itemFields(kind));

  const titleCase = (value) => String(value).replace(/[-_]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  const options = (list) => list.map((value) => ({ value, label: titleCase(value) }));

  function setRect(part, value) {
    if (!rect) return;
    onrect({ ...rect, ...part(value) });
  }
</script>

{#if item}
  <div class="setbox">
    {#if issue}
      <div class="issue">
        <b>{kind === 'lcd' ? 'Zone' : 'Element'} {index + 1} is {issue.status === 'offGrid' ? 'off the screen' : 'over the edge'}.</b>
        {issue.message}.
        <button type="button" onclick={() => onrepair(issue.repair)}>{issue.repairLabel}</button>
      </div>
    {/if}

    <div class="grp">Shows</div>
    <div class="r">
      <label for="screen-kind">Kind</label>
      <PropertySelect
        options={options(kinds)}
        value={String((kind === 'lcd' ? item.show : item.kind) ?? '')}
        ariaLabel="Kind"
        onchange={(value) => onset(kind === 'lcd' ? 'show' : 'kind', value)}
      />
    </div>
    <div class="r">
      <label for="screen-source">Source</label>
      <PropertySelect
        options={sources}
        value={String(item.sourceId ?? '')}
        ariaLabel="Source"
        placeholder="(source)"
        onchange={(value) => onset('sourceId', value)}
      />
    </div>
    {#if String((kind === 'lcd' ? item.show : item.kind) ?? '') === 'static'}
      <div class="r">
        <label for="screen-text">Text</label>
        <input class="txt" id="screen-text" type="text" value={String(item.text ?? '')}
               oninput={(event) => onset('text', event.currentTarget.value)} />
      </div>
    {/if}

    <div class="grp">Region <s>{grid.unit === 'px' ? 'pixels' : 'cells'}</s></div>
    {#if kind === 'lcd'}
      <div class="r">
        <label for="screen-row">Row</label>
        <div class="cell"><NumberCell label="Row" value={rect.y + 1} min={1} max={grid.unitsY} step={1}
          onchange={(value) => setRect((v) => ({ y: Math.round(v) - 1 }), value)} /></div>
      </div>
      <div class="r">
        <label for="screen-from">From</label>
        <div class="cell"><NumberCell label="Col" value={rect.x + 1} min={1} max={grid.unitsX} step={1}
          onchange={(value) => setRect((v) => ({ x: Math.round(v) - 1 }), value)} /></div>
      </div>
      <div class="r">
        <label for="screen-width">Width</label>
        <div class="cell"><NumberCell label="Cells" value={rect.w} min={1} max={grid.unitsX} step={1}
          onchange={(value) => setRect((v) => ({ w: Math.max(1, Math.round(v)) }), value)} /></div>
      </div>
    {:else}
      <div class="r pair">
        <label for="screen-x">X · Y</label>
        <div class="cell"><NumberCell label="X" value={rect.x} min={0} max={grid.unitsX} step={1}
          onchange={(value) => setRect((v) => ({ x: Math.round(v) }), value)} /></div>
        <div class="cell"><NumberCell label="Y" value={rect.y} min={0} max={grid.unitsY} step={1}
          onchange={(value) => setRect((v) => ({ y: Math.round(v) }), value)} /></div>
      </div>
      <div class="r pair">
        <label for="screen-w">W · H</label>
        <div class="cell"><NumberCell label="W" value={rect.w} min={1} max={grid.unitsX} step={1}
          onchange={(value) => setRect((v) => ({ w: Math.max(1, Math.round(v)) }), value)} /></div>
        <div class="cell"><NumberCell label="H" value={rect.h} min={1} max={grid.unitsY} step={1}
          onchange={(value) => setRect((v) => ({ h: Math.max(1, Math.round(v)) }), value)} /></div>
      </div>
    {/if}

    <div class="grp">Format</div>
    {#each fields as field (field.key)}
      <div class="r">
        <label for={`screen-${field.key}`}>{field.label}</label>
        {#if field.kind === 'choice' && field.options.length > 4}
          <PropertySelect options={options(field.options)} value={item[field.key]} ariaLabel={field.label}
            onchange={(value) => onset(field.key, value)} />
        {:else if field.kind === 'choice'}
          <Segmented options={options(field.options)} value={item[field.key] ?? field.options[0]} ariaLabel={field.label}
            onchange={(value) => onset(field.key, value)} />
        {:else}
          <Segmented options={[{ value: false, label: 'No' }, { value: true, label: 'Yes' }]}
            value={field.key === 'visible' ? item.visible !== false : item[field.key] === true}
            ariaLabel={field.label}
            onchange={(value) => onset(field.key, value)} />
        {/if}
      </div>
    {/each}
  </div>
{:else}
  <p class="none">Pick a region on the screen, or add one in the properties panel.</p>
{/if}

<style>
  .setbox { border: 1px solid #333; border-radius: 4px; background: #1A1D20; padding: 6px 8px 9px; }

  .grp {
    display: flex;
    align-items: center;
    font: 600 8px/1 'IBM Plex Mono', ui-monospace, monospace;
    letter-spacing: 0.13em;
    text-transform: uppercase;
    color: #4B545C;
    margin: 9px 0 2px;
    padding-bottom: 3px;
    border-bottom: 1px solid #262B30;
  }
  .grp:first-child { margin-top: 2px; }
  .grp s { margin-left: auto; text-decoration: none; letter-spacing: 0.06em; }

  .r {
    display: grid;
    grid-template-columns: 52px minmax(0, 1fr);
    gap: 6px;
    align-items: center;
    margin-top: 6px;
  }
  .r.pair { grid-template-columns: 52px minmax(0, 1fr) minmax(0, 1fr); }
  .r > label {
    font: 400 9.5px/1.15 'IBM Plex Sans', system-ui, sans-serif;
    color: #616C75;
    text-align: right;
  }

  .cell { min-width: 0; display: flex; }

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

  .none {
    margin: 0;
    padding: 16px 10px;
    border: 1px dashed #2E3540;
    border-radius: 4px;
    font: 400 10px/1.5 'IBM Plex Sans', system-ui, sans-serif;
    color: #69737B;
  }
</style>
