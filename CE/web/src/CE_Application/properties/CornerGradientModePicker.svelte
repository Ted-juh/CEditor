<script>
  import Link from 'lucide-svelte/icons/link';

  let {
    mode = 'radial',         // 'radial' | 'tangential' | 'inherit'
    shapeStyle = 'rounded',  // rounded | straight | notch | chamfer
    flip = false,
    inheritSide = 'A',       // 'A' | 'B'
    inheritLabelA = 'A',
    inheritLabelB = 'B',
    onmodechange = null,
    onflip = null,
    oninheritchange = null,
  } = $props();

  let isRounded = $derived(shapeStyle === 'rounded');
  // Flip is only kept for rounded modes where directional sweep matters.
  let showFlip = $derived(isRounded && (mode === 'tangential' || mode === 'radial'));
</script>

<div class="edit-row">
  <span class="edit-label">G.Mode</span>
  <div class="cgm-picker">
    {#if isRounded}
      <button class="cgm-btn" class:active={mode === 'radial'}
        title="Radial — gradient flows along the curve (sweeps the arc)"
        onclick={() => onmodechange?.('radial')}>
        <svg viewBox="0 0 14 14" fill="none"><path d="M11 2 Q11 11 2 11" stroke="currentColor" stroke-width="1.3" fill="none" stroke-linecap="round"/><circle cx="11" cy="2" r="0.9" fill="currentColor"/><circle cx="2" cy="11" r="0.9" fill="currentColor"/></svg>
      </button>
      <button class="cgm-btn" class:active={mode === 'tangential'}
        title="Tangential — straight linear gradient between arc endpoints"
        onclick={() => onmodechange?.('tangential')}>
        <svg viewBox="0 0 14 14" fill="none"><path d="M11 3 Q3 3 3 11" stroke="currentColor" stroke-width="1.3" fill="none" stroke-linecap="round"/><path d="M3 11 L1 9 M3 11 L5 9" stroke="currentColor" stroke-width="1.3" fill="none" stroke-linecap="round"/></svg>
      </button>
      <button class="cgm-btn" class:active={mode === 'inherit'}
        title="Inherit — corner uses an adjacent side gradient"
        onclick={() => onmodechange?.('inherit')}>
        <Link size={11} strokeWidth={1.5} />
      </button>
    {:else}
      <button class="cgm-btn text-btn" class:active={mode === 'tangential'}
        title="Follow edge direction"
        onclick={() => onmodechange?.('tangential')}>
        Follow
      </button>
      <button class="cgm-btn text-btn" class:active={mode === 'radial'}
        title="Across border thickness"
        onclick={() => onmodechange?.('radial')}>
        Across
      </button>
    {/if}
  </div>
</div>

{#if showFlip}
  <div class="edit-row">
    <span class="edit-label">Dir</span>
    <button class="cgm-btn flip-btn" class:active={flip}
      title="Flip gradient direction along the arc"
      onclick={() => onflip?.()}>
      {flip ? '← Flipped' : 'Normal →'}
    </button>
  </div>
{/if}

{#if isRounded && mode === 'inherit'}
  <div class="edit-row">
    <span class="edit-label">From</span>
    <div class="cgm-picker">
      <button class="cgm-btn" class:active={inheritSide === 'A'}
        title="Inherit from horizontal side (top/bottom)"
        onclick={() => oninheritchange?.('A')}>
        {inheritLabelA}
      </button>
      <button class="cgm-btn" class:active={inheritSide === 'B'}
        title="Inherit from vertical side (left/right)"
        onclick={() => oninheritchange?.('B')}>
        {inheritLabelB}
      </button>
    </div>
  </div>
{/if}

<style>
  .edit-row {
    display: flex;
    align-items: center;
    gap: 4px;
  }

  .edit-label {
    color: #888;
    font-size: 10px;
    min-width: 32px;
    flex-shrink: 0;
  }

  .cgm-picker {
    display: flex;
    gap: 2px;
    flex: 1;
    min-width: 0;
  }

  .cgm-btn {
    flex: 1;
    height: 18px;
    border-radius: 3px;
    border: 1px solid #444;
    background: #1A1A1A;
    color: #888;
    cursor: pointer;
    padding: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    font-family: inherit;
  }
  .cgm-btn:hover { border-color: #5B9BD5; color: #CCC; }
  .cgm-btn.active { background: #094771; border-color: #0B6EB5; color: #DDD; }
  .cgm-btn svg { width: 12px; height: 12px; }
  .text-btn { font-size: 9px; }

  .flip-btn {
    flex: 1;
    font-size: 9px;
    padding: 0 6px;
  }
</style>
