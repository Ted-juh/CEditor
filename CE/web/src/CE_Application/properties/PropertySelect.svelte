<script>
  /**
   * The shared dropdown.
   *
   * 279 raw `<select>` elements live in the section editors, all wearing a pasted `.val`. A select
   * is the worst of the four to leave native: it is the only one whose intrinsic width is set by
   * its longest option, so without `box-sizing: border-box` AND `min-width: 0` it does not merely
   * overflow its grid track — it widens the track and shoves every neighbouring column out of
   * alignment. Both are here, once.
   *
   * Options are `[{ value, label, disabled? }]` or plain strings, because roughly half the call
   * sites in the panel have a bare string array and building `{value,label}` pairs at each of them
   * is the kind of ceremony that makes people write the raw element instead.
   */
  let {
    value = '',
    options = [],
    disabled = false,
    title = '',
    ariaLabel = '',
    placeholder = '',
    onchange = null,
  } = $props();

  let normalized = $derived(
    (options ?? []).map((option) => (
      option !== null && typeof option === 'object'
        ? { value: option.value, label: option.label ?? String(option.value), disabled: option.disabled === true }
        : { value: option, label: String(option), disabled: false }
    ))
  );

  // A value the option list does not contain would silently render as the first option, which is
  // how a stale profile reference turns into "the user picked something they did not pick". Show
  // it instead, marked, so it can be seen and corrected.
  let missing = $derived(
    value !== '' && value != null && !normalized.some((option) => option.value === value)
  );
</script>

<select
  class="pp-select"
  {value}
  {disabled}
  {title}
  aria-label={ariaLabel || undefined}
  onchange={(e) => onchange?.(e.currentTarget.value, e)}
>
  {#if placeholder}
    <option value="" disabled>{placeholder}</option>
  {/if}
  {#if missing}
    <option value={value}>{value} (missing)</option>
  {/if}
  {#each normalized as option (option.value)}
    <option value={option.value} disabled={option.disabled}>{option.label}</option>
  {/each}
</select>

<style>
  .pp-select {
    box-sizing: border-box;
    width: 100%;
    /* Without this a long option name widens the grid track itself. */
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
    cursor: pointer;
  }

  .pp-select:focus {
    border-color: var(--pp-field-focus, #5B9BD5);
  }

  .pp-select:disabled {
    color: var(--pp-field-disabled-fg, #555);
    cursor: not-allowed;
  }
</style>
