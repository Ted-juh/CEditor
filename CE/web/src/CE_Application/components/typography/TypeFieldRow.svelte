<script>
  /**
   * One field row, shared by the settings column and the flow parameters.
   *
   * NO SLIDERS, the same rule as the Effects tab. Numbers are `NumberCell` — its label is a
   * horizontal drag handle, its steppers give exact increments and the value is always typeable.
   * Angles get an orientation glyph beside the field, not a dial.
   *
   * Choices split at four. `Segmented.svelte` says so itself — "For 2-4 options only; longer enums
   * keep the select" — and it is right for a dock column: six case modes squeezed into 180px render
   * as "ppercas | owercas | Title | entenc | mallcap", which is not a control, it is a rumour.
   */
  import NumberCell from '../../properties/NumberCell.svelte';
  import Segmented from '../../properties/Segmented.svelte';
  import PropertySelect from '../../properties/PropertySelect.svelte';
  import EffectColourPopover from '../effects/EffectColourPopover.svelte';

  let { field = null, value = undefined, onset = () => {} } = $props();

  let openColour = $state(false);

  const titleCase = (v) => String(v).replace(/[-_]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  const segOptions = (options) => options.map((option) => ({ value: option, label: titleCase(option) }));

  function swatch(v) {
    const hex = String(v ?? '').replace(/^#/, '');
    if (!hex) return 'transparent';
    return hex.length >= 8 ? `#${hex.slice(2)}` : `#${hex.padStart(6, '0').slice(-6)}`;
  }
</script>

{#if field}
  <div class="r">
    <label for={`ty-${field.key}`}>{field.label}</label>

    {#if field.kind === 'number'}
      <div class="cell" class:angle={field.angle}>
        {#if field.angle}
          <span class="glyph" aria-hidden="true">
            <svg width="12" height="12" viewBox="0 0 12 12">
              <circle cx="6" cy="6" r="4.5" fill="none" stroke="#3B4650" stroke-width="1" />
              <line x1="6" y1="6" x2="6" y2="1.5" stroke="#8FA4B0" stroke-width="1.5"
                    transform={`rotate(${Number(value ?? 0)} 6 6)`} />
            </svg>
          </span>
        {/if}
        <NumberCell
          value={Number(value ?? 0)}
          min={field.min}
          max={field.max}
          step={field.step ?? 1}
          label={field.label}
          onchange={(next) => onset(field.key, next)}
        />
      </div>

    {:else if field.kind === 'choice' && field.options.length > 4}
      <PropertySelect
        options={segOptions(field.options)}
        value={value}
        ariaLabel={field.label}
        onchange={(next) => onset(field.key, next)}
      />

    {:else if field.kind === 'choice'}
      <Segmented
        options={segOptions(field.options)}
        value={value}
        ariaLabel={field.label}
        onchange={(next) => onset(field.key, next)}
      />

    {:else if field.kind === 'toggle'}
      <Segmented
        options={[{ value: false, label: 'Off' }, { value: true, label: 'On' }]}
        value={value === true}
        ariaLabel={field.label}
        onchange={(next) => onset(field.key, next)}
      />

    {:else if field.kind === 'colour'}
      <div class="colourwrap">
        <button
          type="button"
          id={`ty-${field.key}`}
          class="chip"
          title={`${field.label} — edit here, without leaving the specimen`}
          onclick={() => { openColour = !openColour; }}
        >
          <i class="sw" style={`background:${swatch(value)}`}></i>
          <em>{String(value ?? '').replace(/^#/, '').toUpperCase() || 'inherit'}</em>
        </button>
        {#if openColour}
          <EffectColourPopover
            colour={value || 'FFFFFFFF'}
            label={field.label}
            oninput={(hex) => onset(field.key, hex)}
            oncommit={() => { openColour = false; }}
            oncancel={(hex) => { onset(field.key, hex); openColour = false; }}
          />
        {/if}
      </div>
    {/if}
  </div>
{/if}

<style>
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
</style>
