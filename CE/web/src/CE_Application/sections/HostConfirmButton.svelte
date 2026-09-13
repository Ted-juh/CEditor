<script>
  import { onDestroy } from 'svelte';
  let { onclick, identity = '', children, class: className = '', title = 'Remove item',
    disabled = false, 'aria-label': ariaLabel = title, ...attributes } = $props();
  let armed = $state(false);
  let timer;
  function cancel() { clearTimeout(timer); armed = false; }
  $effect(() => { identity; disabled; cancel(); });
  onDestroy(cancel);
  function activate(event) {
    if (disabled) return;
    if (armed) { cancel(); onclick?.(event); return; }
    armed = true;
    timer = setTimeout(cancel, 5000);
  }
</script>

<button {...attributes} type="button" class={`ghost danger ${className}`} class:confirming={armed}
  {disabled} title={armed ? `Click again to confirm: ${title}` : title}
  aria-label={armed ? `Confirm: ${ariaLabel}` : ariaLabel} onclick={activate}
  onkeydown={(event) => { if (event.key === 'Escape') { event.stopPropagation(); cancel(); } }}>
  {#if armed}Confirm{:else}{@render children?.()}{/if}
</button>

<style>
  button { font: inherit; font-size: 12px; min-height: 30px; padding: 4px 8px;
    border: 1px solid var(--host-line, #3b4652); border-radius: var(--host-radius-control, 3px);
    background: transparent; color: var(--host-text-soft, #aab5be); cursor: pointer; }
  button.confirming { color: var(--host-danger, #d98c8c); border-color: var(--host-danger-line, #8a5151);
    background: var(--host-danger-surface, #452529); }
  button:disabled { opacity: .45; cursor: default; }
</style>
