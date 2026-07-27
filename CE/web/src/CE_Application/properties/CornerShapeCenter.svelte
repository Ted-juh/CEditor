<script>
  /**
   * Center button cluster for BorderCornerWidget's 3×3 grid — the
   * straight/link/rounded button trio that occupies the middle cell.
   *
   * Owns the `.center-group`, `.center-btn`, and `.link-btn` CSS.
   */
  import Link from 'lucide-svelte/icons/link';
  import Unlink from 'lucide-svelte/icons/unlink';

  let {
    cornerCombo,            // 'straight' | 'notch' | 'chamfer' | 'round-out' | 'round-in'
    cornerSide,             // 'straight' | 'rounded'
    linked = true,
    oncycle = null,         // (side) => void
    ontogglelink = null,    // () => void
  } = $props();

  const STRAIGHT_TITLES = {
    straight: 'Straight (click: Notch)',
    notch:    'Notch (click: Chamfer)',
    chamfer:  'Chamfer (click: Straight)',
  };

  let straightTitle = $derived(STRAIGHT_TITLES[cornerCombo] ?? 'Straight corners');
  let roundedTitle = $derived(
    cornerCombo === 'round-out' ? 'Rounded Out (click: Rounded In)' : 'Rounded In (click: Rounded Out)'
  );
</script>

<div class="center-group">
  <button class="center-btn" class:active={cornerSide === 'straight'}
    title={straightTitle}
    onclick={() => oncycle?.('straight')}>
    {#if cornerCombo === 'notch'}
      <svg viewBox="0 0 14 14" fill="none"><path d="M11 3 L7 3 L7 7 L3 7 L3 11" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round"/></svg>
    {:else if cornerCombo === 'chamfer'}
      <svg viewBox="0 0 14 14" fill="none"><path d="M11 3 L3 11" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>
    {:else}
      <svg viewBox="0 0 14 14" fill="none"><path d="M11 3 L3 3 L3 11" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round"/></svg>
    {/if}
  </button>

  <button class="center-btn link-btn" class:linked onclick={() => ontogglelink?.()}
    title={linked ? 'Unlink' : 'Link all'}>
    {#if linked}<Link size={12} strokeWidth={1.5} />{:else}<Unlink size={12} strokeWidth={1.5} />{/if}
  </button>

  <button class="center-btn" class:active={cornerSide === 'rounded'}
    title={roundedTitle}
    onclick={() => oncycle?.('rounded')}>
    {#if cornerCombo === 'round-in'}
      <svg viewBox="0 0 14 14" fill="none"><path d="M11 3 Q11 11 3 11" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" fill="none"/></svg>
    {:else}
      <svg viewBox="0 0 14 14" fill="none"><path d="M11 3 Q3 3 3 11" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" fill="none"/></svg>
    {/if}
  </button>
</div>

<style>
  .center-group {
    display: flex;
    gap: 1px;
    min-width: 0;
  }

  .center-btn {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    background: #1A1A1A;
    border: 1px solid #333;
    border-radius: 2px;
    color: #888;
    cursor: pointer;
    padding: 0;
    min-width: 0;
    font-family: inherit;
  }
  .center-btn:hover { border-color: #5B9BD5; color: #CCC; }
  .center-btn.active { background: #094771; border-color: #0B6EB5; color: #DDD; }
  .center-btn svg { width: 14px; height: 14px; }

  .link-btn { color: #888; }
  .link-btn.linked { background: #094771; border-color: #0B6EB5; color: #DDD; }
</style>
