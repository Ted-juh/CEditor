<script>
  // ScriptNotifications — the toasts ce.ui.notify() raises.
  //
  // A notification is an EVENT: it appears, it expires, it is gone. (A state belongs in the status
  // bar, which ce.ui.status() drives.) Expiry is swept here rather than with a timer per toast,
  // because a hundred notifications should cost one interval, not a hundred.
  import { onMount } from 'svelte';
  import { scriptNotifications, dismissNotification, expireNotifications } from '../stores/scriptUi.js';

  onMount(() => {
    const handle = setInterval(() => expireNotifications(), 250);
    return () => clearInterval(handle);
  });
</script>

{#if $scriptNotifications.length}
  <!-- aria-live so a screen reader announces a message that appeared without being asked for. -->
  <div class="script-toasts" role="status" aria-live="polite">
    {#each $scriptNotifications as n (n.id)}
      <button class={['toast', `toast-${n.kind}`]} onclick={() => dismissNotification(n.id)} title="Dismiss">
        {n.message}
      </button>
    {/each}
  </div>
{/if}

<style>
  .script-toasts {
    position: fixed;
    right: 16px;
    bottom: 34px;              /* clear of the status bar */
    display: flex;
    flex-direction: column;
    gap: 6px;
    z-index: 900;
    pointer-events: none;      /* the container never eats clicks; the toasts themselves do */
  }
  .toast {
    pointer-events: auto;
    max-width: 320px;
    text-align: left;
    padding: 7px 11px;
    border-radius: 5px;
    border: 1px solid #333;
    background: #1E1E1E;
    color: #DDD;
    font-size: 12px;
    line-height: 1.35;
    cursor: pointer;
    box-shadow: 0 3px 12px rgba(0, 0, 0, 0.45);
  }
  .toast:hover { border-color: #5B9BD5; }
  .toast-warn  { border-color: #6A5A30; color: #E0C070; }
  .toast-error { border-color: #6A3030; color: #E08080; }
</style>
