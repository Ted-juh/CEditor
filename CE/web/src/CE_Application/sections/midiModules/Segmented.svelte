<script>
  /**
   * A few choices side by side, one pressed. For anything with under five or so options, where
   * a dropdown would hide what the choices are. options: [{ value, label, title? }].
   */
  let { options = [], value, onchange = () => {}, label = '', testid = undefined } = $props();
</script>

<div class="seg" role="group" aria-label={label} data-testid={testid}>
  {#each options as option (option.value)}
    <button type="button" aria-pressed={option.value === value} title={option.title ?? option.label}
            data-value={option.value}
            onclick={() => { if (option.value !== value) onchange(option.value); }}>{option.label}</button>
  {/each}
</div>

<style>
  .seg { display: inline-flex; flex-wrap: wrap; gap: 2px; padding: 2px; background: var(--host-field, #12171b);
         border: 1px solid var(--host-line-soft, #2c353e); border-radius: 4px; }
  button { font: 500 12px var(--host-font, 'Archivo', sans-serif); color: var(--host-text-soft, #aab5be);
           background: transparent; border: 0; border-radius: 3px; padding: 4px 9px; min-height: 24px; cursor: pointer; }
  button:hover { background: var(--host-surface-hover, #27323b); color: var(--host-text, #d9e0e6); }
  button[aria-pressed='true'] { background: var(--host-accent-surface, #243746); color: var(--host-accent-strong, #79b9ee);
                                box-shadow: inset 0 0 0 1px var(--host-accent, #5b9bd5); }
  button:focus-visible { outline: 2px solid var(--host-accent-strong, #79b9ee); outline-offset: 1px; }
</style>
