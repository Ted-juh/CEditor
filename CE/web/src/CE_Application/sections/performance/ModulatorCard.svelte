<script>
  /**
   * The frame every modulator card shares: a power switch, the name you type over, a live
   * readout, restart and remove. What the modulator is (its picture and settings) is the body.
   */
  import HostConfirmButton from '../HostConfirmButton.svelte';

  let {
    name = '', enabled = true, kind = 'modulator', readout = '', identity = '', testid = undefined,
    onenable = () => {}, onrename = () => {}, onrestart = null, restartLabel = 'Restart', onremove = () => {},
    children,
  } = $props();
</script>

<article class="mod-card" class:disabled={!enabled} data-testid={testid}>
  <header>
    <button type="button" class="ctl power" class:on={enabled} aria-pressed={enabled}
            title={enabled ? `Switch this ${kind} off` : `Switch this ${kind} on`}
            onclick={() => onenable(!enabled)}>{enabled ? '●' : '○'}</button>
    <input class="name" value={name} aria-label={`${kind} name`}
           onchange={(e) => onrename(e.currentTarget.value)} />
    {#if readout}<span class="readout">{readout}</span>{/if}
    <span class="spacer"></span>
    {#if onrestart}<button type="button" class="ghost" onclick={onrestart}>{restartLabel}</button>{/if}
    <HostConfirmButton identity={identity} aria-label={`Remove ${kind}`} title={`Remove ${kind}`}
                       onclick={onremove}>×</HostConfirmButton>
  </header>
  {@render children?.()}
</article>

<style>
  .mod-card { min-width: 0; display: flex; flex-direction: column; gap: 10px; padding: 10px;
              border: 1px solid #393d40; border-left: 3px solid var(--mod-accent, #d7863b); background: #181c20; }
  .mod-card.disabled { border-left-color: #59616a; opacity: 0.67; }
  header { display: flex; align-items: center; gap: 8px; }
  .power { min-width: 28px; min-height: 26px; padding: 2px 6px; border-radius: 3px; cursor: pointer;
           color: #737e87; background: transparent; border: 1px solid #3b434a; }
  .power.on { color: #efad70; border-color: #8f5a35; }
  .name { width: 160px; min-width: 0; border: 0; border-bottom: 1px solid #4a4f53; background: transparent;
          color: #e0e4e7; font: 650 13px var(--host-font, sans-serif); padding: 3px 2px; }
  .name:focus { outline: none; border-bottom-color: var(--mod-accent, #d7863b); }
  .readout { color: #e2a46c; font: 11px var(--host-font-mono, monospace); white-space: nowrap; }
  .spacer { flex: 1; }
</style>
