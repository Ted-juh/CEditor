<script>
  /**
   * The selected effect's fields — the third column.
   *
   * NO SLIDERS, which is a house rule for this tab and not a compromise. Every number here is a
   * `NumberCell`: its label is a horizontal drag handle, its steppers give exact increments
   * (Shift = ×10) and the value is always typeable. Its own comment calls this "three ways in, no
   * modes". A slider would trade the precision for a rough gesture and eat the width the dock is
   * being used for. Angles are number fields with an orientation glyph beside them, not dials.
   *
   * There is no Order field. The stack is the order — that is the whole point of the column to the
   * left of this one — so the footer says where the row sits instead of offering a number to type.
   */
  import NumberCell from '../../properties/NumberCell.svelte';
  import Segmented from '../../properties/Segmented.svelte';
  import EffectColourPopover from './EffectColourPopover.svelte';
  import { visibleFields } from '../../utils/effectStack.js';

  let {
    row = null,
    values = null,
    stackIndex = -1,
    stackSize = 0,
    onset = () => {},
    ontoggle = () => {},
  } = $props();

  let openColour = $state('');

  let fields = $derived(row ? visibleFields(row, values ?? {}) : []);

  const titleCase = (value) => String(value)
    .replace(/[-_]/g, ' ')
    .replace(/\b\w/g, (ch) => ch.toUpperCase());

  function segOptions(options) {
    return options.map((option) => ({ value: option, label: titleCase(option) }));
  }

  function swatch(value) {
    const hex = String(value ?? '000000').replace(/^#/, '');
    return hex.length >= 8 ? `#${hex.slice(2)}` : `#${hex.padStart(6, '0').slice(-6)}`;
  }

  function swatchAlpha(value) {
    const hex = String(value ?? '').replace(/^#/, '');
    return hex.length >= 8 ? parseInt(hex.slice(0, 2), 16) / 255 : 1;
  }
</script>

{#if !row}
  <div class="empty">Pick an effect on the left.</div>
{:else}
  <div class="fxbox">
    <div class="fxtitle">
      <button
        type="button"
        class="dot"
        class:on={row.enabled}
        disabled={row.alwaysOn}
        aria-label={`${row.label} ${row.enabled ? 'on' : 'off'}`}
        title={row.alwaysOn ? `${row.label} is always drawn` : `Toggle ${row.label}`}
        onclick={() => ontoggle(row)}
      ></button>
      <b>{row.label}</b>
      <s>{row.alwaysOn ? 'always on' : row.enabled ? 'on' : 'off'}</s>
    </div>

    {#if !fields.length}
      <p class="note">
        {row.key === 'fill'
          ? 'The fill is the letterform itself. Its colour and gradient live in the Text section; it is listed here so you can move it in the stack.'
          : 'This effect has no settings of its own.'}
      </p>
    {/if}

    {#each fields as field (field.key)}
      <div class="r">
        <label for={`fx-${row.key}-${field.key}`}>{field.label}</label>

        {#if field.kind === 'number'}
          <div class="cell" class:angle={field.angle}>
            {#if field.angle}
              <span class="glyph" aria-hidden="true" style={`--a:${Number(values?.[field.key] ?? 0)}deg`}>
                <svg width="12" height="12" viewBox="0 0 12 12">
                  <circle cx="6" cy="6" r="4.5" fill="none" stroke="#3B4650" stroke-width="1" />
                  <line x1="6" y1="6" x2="6" y2="1.5" stroke="#8FA4B0" stroke-width="1.5"
                        transform={`rotate(${Number(values?.[field.key] ?? 0)} 6 6)`} />
                </svg>
              </span>
            {/if}
            <NumberCell
              value={Number(values?.[field.key] ?? 0)}
              min={field.min}
              max={field.max}
              step={field.step ?? 1}
              label={field.label}
              onchange={(next) => onset(row, field.key, next)}
            />
          </div>

        {:else if field.kind === 'choice'}
          <Segmented
            options={segOptions(field.options)}
            value={values?.[field.key]}
            ariaLabel={field.label}
            onchange={(next) => onset(row, field.key, next)}
          />

        {:else if field.kind === 'toggle'}
          <Segmented
            options={[{ value: false, label: 'Off' }, { value: true, label: 'On' }]}
            value={values?.[field.key] === true}
            ariaLabel={field.label}
            onchange={(next) => onset(row, field.key, next)}
          />

        {:else if field.kind === 'colour'}
          <div class="colourwrap">
            <button
              type="button"
              id={`fx-${row.key}-${field.key}`}
              class="chip"
              title={`${field.label} — edit here, without leaving the specimen`}
              onclick={() => { openColour = openColour === field.key ? '' : field.key; }}
            >
              <i class="sw" style={`background:${swatch(values?.[field.key])};opacity:${swatchAlpha(values?.[field.key])}`}></i>
              <em>{String(values?.[field.key] ?? '').replace(/^#/, '').toUpperCase() || '—'}</em>
            </button>
            {#if openColour === field.key}
              <EffectColourPopover
                colour={values?.[field.key] ?? 'FF000000'}
                label={`${row.label} ${field.label}`}
                oninput={(hex) => onset(row, field.key, hex)}
                oncommit={() => { openColour = ''; }}
                oncancel={(hex) => { onset(row, field.key, hex); openColour = ''; }}
              />
            {/if}
          </div>
        {/if}
      </div>
    {/each}

    {#if row.stackable && stackIndex >= 0 && stackSize > 0}
      <div class="orderline">
        Order is the stack — drag the row. This one is
        <b>{stackIndex + 1} of {stackSize}</b>{#if row.key !== 'fill'}, {stackIndex < (stackSize - 1) ? 'in front of' : 'behind'} the rest{/if}.
      </div>
    {/if}
  </div>
{/if}

<style>
  .empty {
    padding: 16px 10px;
    font: 400 11px/1.5 'IBM Plex Sans', system-ui, sans-serif;
    color: #616C75;
  }

  .fxbox {
    background: #1E1E1E;
    border: 1px solid #333;
    border-radius: 4px;
    padding: 8px;
  }

  .fxtitle {
    display: flex;
    align-items: center;
    gap: 6px;
    padding-bottom: 7px;
    margin-bottom: 7px;
    border-bottom: 1px solid #2A2A2A;
  }
  .fxtitle b { font: 600 12px/1 'IBM Plex Sans', system-ui, sans-serif; color: #EAF5FF; }
  .fxtitle s {
    margin-left: auto;
    text-decoration: none;
    font: 500 8.5px/1 'IBM Plex Mono', ui-monospace, monospace;
    color: #616C75;
  }

  .dot {
    flex: 0 0 9px;
    width: 9px;
    height: 9px;
    padding: 0;
    border-radius: 50%;
    border: 1px solid #3A434A;
    background: #2A2F33;
    cursor: pointer;
  }
  .dot.on { background: #14B8A6; border-color: #0E7C70; }
  .dot:disabled { cursor: default; }

  .note {
    margin: 0 0 4px;
    font: 400 10px/1.5 'IBM Plex Sans', system-ui, sans-serif;
    color: #616C75;
  }

  .r {
    display: grid;
    grid-template-columns: 62px minmax(0, 1fr);
    gap: 7px;
    align-items: center;
    margin-top: 6px;
  }
  .r > label {
    font: 400 9.5px/1.15 'IBM Plex Sans', system-ui, sans-serif;
    color: #616C75;
    text-align: right;
  }

  .cell { min-width: 0; display: flex; }
  .cell.angle { gap: 5px; align-items: center; }
  .cell.angle :global(.number-cell) { flex: 1; min-width: 0; }
  .glyph { flex: 0 0 12px; display: flex; align-items: center; }

  .colourwrap { position: relative; min-width: 0; }

  .chip {
    display: flex;
    width: 100%;
    height: 24px;
    align-items: stretch;
    border: 1px solid #333;
    border-radius: 3px;
    background: #1A1A1A;
    padding: 0;
    cursor: pointer;
    overflow: hidden;
  }
  .chip:hover { border-color: #4A555E; }
  .chip .sw { flex: 0 0 24px; border-right: 1px solid #333; }
  .chip em {
    flex: 1;
    min-width: 0;
    font: 500 10px/22px 'IBM Plex Mono', ui-monospace, monospace;
    color: #DDD;
    padding: 0 6px;
    font-style: normal;
    text-align: left;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .orderline {
    margin-top: 9px;
    padding-top: 8px;
    border-top: 1px solid #2A2A2A;
    font: 400 9px/1.5 'IBM Plex Sans', system-ui, sans-serif;
    color: #616C75;
  }
  .orderline b { color: #14B8A6; font-weight: 600; }
</style>
