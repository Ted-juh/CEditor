<script>
  /**
   * The shared single-line text field.
   *
   * There are 166 raw `<input type="text">` sites across 44 section editors, each re-skinned by a
   * pasted `.val` rule. The paste is where the drift came from — and where the bug came from: 18
   * of those copies lost `box-sizing: border-box`, which in a `min-width: 0` grid column means the
   * padding and border push the field past its track and the row overflows horizontally. It looks
   * like a layout bug in the panel and it is a missing line in a stylesheet, eighteen times.
   *
   * Metrics come from the panel's custom properties (see PropertiesPanel), so the height, font and
   * radius are decided once. The fallbacks let this render correctly outside the panel too — the
   * device-profile designer mounts a few of these.
   *
   * `commit` fires on change/blur/Enter, `oninput` on every keystroke: a field bound to a store
   * that pushes to the C++ bridge wants the former, a live filter wants the latter.
   */
  let {
    value = '',
    placeholder = '',
    disabled = false,
    readonly = false,
    align = 'left',
    title = '',
    ariaLabel = '',
    spellcheck = false,
    oninput = null,
    commit = null,
    onfocus = null,
  } = $props();

  function handleKeydown(event) {
    if (event.key !== 'Enter') return;
    event.currentTarget.blur();
  }
</script>

<input
  class="pp-text"
  type="text"
  {value}
  {placeholder}
  {disabled}
  {readonly}
  {title}
  {spellcheck}
  style:text-align={align}
  aria-label={ariaLabel || undefined}
  oninput={(e) => oninput?.(e.currentTarget.value, e)}
  onchange={(e) => commit?.(e.currentTarget.value, e)}
  onfocus={(e) => onfocus?.(e)}
  onkeydown={handleKeydown}
/>

<style>
  .pp-text {
    /* The line this widget exists to stop anyone forgetting again. */
    box-sizing: border-box;
    width: 100%;
    min-width: 0;
    height: var(--pp-field-height, 26px);
    padding: var(--pp-field-padding, 0 6px);
    background: var(--pp-field-bg, #1A1A1A);
    border: 1px solid var(--pp-field-border, #333);
    border-radius: var(--pp-field-radius, 3px);
    color: var(--pp-field-fg, #DDD);
    font-size: var(--pp-field-font, 11px);
    font-family: inherit;
    outline: none;
  }

  .pp-text::placeholder {
    color: var(--pp-field-disabled-fg, #555);
  }

  .pp-text:focus {
    border-color: var(--pp-field-focus, #5B9BD5);
  }

  .pp-text:disabled {
    color: var(--pp-field-disabled-fg, #555);
    cursor: not-allowed;
  }

  .pp-text:read-only:not(:disabled) {
    color: var(--pp-field-fg-muted, #888);
  }
</style>
