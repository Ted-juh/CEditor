<script>
  /**
   * The one thing wrong right now, with the fix on it: silence the part a stuck note is on
   * rather than everything, reload the plug-in that stopped or leave it off. Anything else wrong
   * is counted underneath. Hiding a notice keeps it hidden until it changes.
   */
  import { hostPanic, retryFailedProcessor, dismissFailoverEvent } from '../../stores/instrumentHost.js';

  let { troubles = [] } = $props();
  let hidden = $state(new Set());
  const shown = $derived(troubles.filter((t) => !hidden.has(`${t.key}|${t.title}`)));
  const first = $derived(shown[0] ?? null);

  function act(action) {
    if (action.kind === 'panicPart') hostPanic(action.partId);
    else if (action.kind === 'panic') hostPanic();
    else if (action.kind === 'retry') retryFailedProcessor(action.targetId);
    else if (action.kind === 'dismiss') dismissFailoverEvent(action.targetId);
  }
  const hide = (trouble) => (hidden = new Set([...hidden, `${trouble.key}|${trouble.title}`]));
</script>

{#if first}
  <div class="trouble" class:urgent={first.severity >= 3} role="alert" data-testid="stage-trouble">
    <strong>{first.title}</strong>
    <span class="text">{first.text}</span>
    <span class="actions">
      {#each first.actions as action (action.label)}
        <button type="button" class="ctl fix" class:primary={action.kind !== 'dismiss'} data-testid="stage-trouble-fix"
                onclick={() => act(action)}>{action.label}</button>
      {/each}
      <button type="button" class="ctl fix" data-testid="stage-trouble-hide" onclick={() => hide(first)}>Hide</button>
    </span>
    {#if shown.length > 1}<span class="more">and {shown.length - 1} more</span>{/if}
  </div>
{/if}

<style>
  .trouble { grid-column: 1 / -1; display: flex; align-items: center; gap: 14px; flex-wrap: wrap; padding: 10px 14px; border-radius: 10px;
             background: var(--stage-warn-surface); border: 2px solid var(--stage-warn); }
  .trouble.urgent { border-color: var(--stage-panic); }
  strong { font-size: 18px; color: var(--stage-warn-text); }
  .text { flex: 1 1 280px; font-size: 14px; color: var(--stage-text); }
  .actions { display: flex; gap: 8px; flex-wrap: wrap; }
  button.fix { font: 700 14px var(--stage-font); padding: 10px 14px; border-radius: 7px; cursor: pointer;
               background: var(--stage-raised); color: var(--stage-text); border: 1px solid var(--stage-line-strong); }
  button.fix.primary { background: var(--stage-panic); border-color: var(--stage-panic); color: #fff; }
  button.fix:focus-visible { outline: 2px solid var(--stage-next); outline-offset: 2px; }
  .more { font: 12px var(--stage-mono); color: var(--stage-dim); }
</style>
