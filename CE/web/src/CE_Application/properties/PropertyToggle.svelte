<script>
  /**
   * The panel's boolean. One control, so a boolean means the same thing everywhere.
   *
   * It did not, until now. The 2026-08-14 review counted six ways to render a boolean in this
   * panel — this button, a bare checkbox in a cell, `.flag` label-chips, `.ex-chk` three-letter
   * abbreviations, table-cell checkboxes and toolbar checkboxes — with nine files mixing two of
   * them in a single view. BehaviorEditor was the clean example of the problem: twelve
   * PropertyToggles, then two raw checkboxes in the same section for Editable and Focusable.
   *
   * Two props absorb the strays rather than leaving them to invent their own look:
   *
   *   `label`   — a named flag ("Invert", "Loop", "Clr") instead of On/Off. The state still reads
   *               from the fill, which is what a chip row needs: eight chips saying On/Off tell
   *               you nothing about which is which.
   *   `compact` — 20px and auto width, for chip rows and table cells where the 26px grid height
   *               is too tall. The grid form stays full width so it fills its PropertyCell.
   *
   * `active` is the amber "this is the live one" state, distinct from on/off, and predates both.
   */
  let {
    value = false,
    active = false,
    label = '',
    compact = false,
    disabled = false,
    title = '',
    ariaLabel = '',
    onchange = null,
    oncontextmenu = null,
  } = $props();

  function toggle() {
    onchange?.(!value);
  }
</script>

<button
  class="property-toggle"
  class:on={value}
  class:active
  class:compact
  {disabled}
  {title}
  role="switch"
  aria-checked={value ? 'true' : 'false'}
  aria-label={ariaLabel || label || undefined}
  onclick={toggle}
  oncontextmenu={oncontextmenu}
>
  {label || (value ? 'On' : 'Off')}
</button>

<style>
  .property-toggle {
    box-sizing: border-box;
    background: var(--pp-field-bg, #1A1A1A);
    border: 1px solid var(--pp-field-border, #333);
    color: var(--pp-field-fg-muted, #888);
    font-size: var(--pp-field-font, 11px);
    padding: 0 6px;
    border-radius: var(--pp-field-radius, 3px);
    cursor: pointer;
    font-family: inherit;
    text-align: center;
    white-space: nowrap;
    width: 100%;
    height: var(--pp-field-height, 26px);
  }

  /* Chip rows and table cells: sized to its label, not to its column. */
  .property-toggle.compact {
    width: auto;
    height: 20px;
    padding: 0 5px;
    font-size: 10px;
  }

  .property-toggle.on {
    background: #094771;
    border-color: #0B6EB5;
    color: var(--pp-field-fg, #DDD);
  }

  .property-toggle.active {
    background: #5F4A12;
    border-color: #D5A93A;
    color: #FFE7A3;
  }

  .property-toggle:hover:not(:disabled) {
    border-color: var(--pp-field-focus, #5B9BD5);
  }

  .property-toggle:disabled {
    color: var(--pp-field-disabled-fg, #555);
    cursor: not-allowed;
  }
</style>
