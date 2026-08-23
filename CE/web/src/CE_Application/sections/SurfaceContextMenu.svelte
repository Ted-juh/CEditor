<script>
  /**
   * Right-click menu for the design surface.
   *
   * Tier 1 of the 2026-07-12 workspace review: "Right-click context menu (none exists)". The panel
   * editor has `editor/CanvasContextMenu.svelte`, but that one is built on the panel model —
   * `selectedComponentIds`, `removeControl`, containers, `flatControls` — and none of that reaches
   * a part inside a component document. So this is a sibling rather than a reuse, sharing the one
   * piece that genuinely is common: `placeMenu`, which keeps a menu opened near a window edge
   * inside the window.
   *
   * The items are the ones the review names — duplicate, z-order, lock/hide, delete,
   * make-interactive-from-part, jump-to-cluster — and every one of them is an action the surface
   * already had, reachable until now only from the dock or a keyboard shortcut.
   */
  import { placeMenu } from '../utils/menuPlacement.js';

  // null when hidden; { screenX, screenY } when shown. The parent binds so the menu can close.
  let {
    target = $bindable(null),
    canManageLayer = false,
    canDetachLayer = false,
    selectionLabel = '',
    generatorName = '',
    kitId = '',
    onDuplicate = () => {},
    onBringToFront = () => {},
    onSendToBack = () => {},
    onBringForward = () => {},
    onSendBackward = () => {},
    onToggleLock = () => {},
    onToggleVisibility = () => {},
    onMakeInteractive = () => {},
    onJumpToGenerator = () => {},
    onEditKit = () => {},
    onDetach = () => {},
    onDelete = () => {},
  } = $props();

  let menuEl = $state(null);
  let placed = $state(null);

  function close() {
    target = null;
    placed = null;
  }

  function run(action) {
    close();
    action();
  }

  // Measure, then place. The height depends on which items this selection earns (Jump to
  // generator and Edit kit come and go), so it cannot be a constant.
  $effect(() => {
    if (!target || !menuEl) { placed = null; return; }
    const rect = menuEl.getBoundingClientRect();
    const viewport = typeof window === 'undefined'
      ? { width: 0, height: 0 }
      : { width: window.innerWidth, height: window.innerHeight };
    placed = placeMenu(target.screenX, target.screenY, { width: rect.width, height: rect.height }, viewport);
  });
</script>

<svelte:window
  onkeydown={(event) => { if (target && event.key === 'Escape') close(); }}
  onmousedown={(event) => { if (target && menuEl && !menuEl.contains(event.target)) close(); }}
/>

{#if target}
  <!-- Hidden until placed, so it never flashes at the pointer before the measurement lands. -->
  <div
    class="surface-context-menu"
    bind:this={menuEl}
    role="menu"
    tabindex="-1"
    style={placed ? `left:${placed.x}px;top:${placed.y}px;` : 'left:-9999px;top:-9999px;'}
  >
    {#if selectionLabel}
      <div class="scm-heading">{selectionLabel}</div>
    {/if}

    <button type="button" role="menuitem" disabled={!canManageLayer} onclick={() => run(onDuplicate)}>
      Duplicate<kbd>Ctrl+D</kbd>
    </button>

    <div class="scm-divider"></div>
    <button type="button" role="menuitem" disabled={!canManageLayer} onclick={() => run(onBringToFront)}>Bring to front</button>
    <button type="button" role="menuitem" disabled={!canManageLayer} onclick={() => run(onBringForward)}>Bring forward</button>
    <button type="button" role="menuitem" disabled={!canManageLayer} onclick={() => run(onSendBackward)}>Send backward</button>
    <button type="button" role="menuitem" disabled={!canManageLayer} onclick={() => run(onSendToBack)}>Send to back</button>

    <div class="scm-divider"></div>
    <button type="button" role="menuitem" disabled={!canManageLayer} onclick={() => run(onToggleLock)}>Lock / unlock</button>
    <button type="button" role="menuitem" disabled={!canManageLayer} onclick={() => run(onToggleVisibility)}>Show / hide</button>

    <div class="scm-divider"></div>
    <button type="button" role="menuitem" disabled={!canManageLayer} onclick={() => run(onMakeInteractive)}>
      Make interactive<kbd>I</kbd>
    </button>

    {#if generatorName}
      <button type="button" role="menuitem" onclick={() => run(onJumpToGenerator)}>Jump to generator “{generatorName}”</button>
    {/if}
    {#if kitId}
      <button type="button" role="menuitem" onclick={() => run(onEditKit)}>Edit kit parts</button>
    {/if}
    {#if canDetachLayer}
      <button type="button" role="menuitem" onclick={() => run(onDetach)}>Detach from kit</button>
    {/if}

    <div class="scm-divider"></div>
    <button type="button" role="menuitem" class="danger" disabled={!canManageLayer} onclick={() => run(onDelete)}>
      Delete<kbd>Del</kbd>
    </button>
  </div>
{/if}

<style>
  .surface-context-menu {
    position: fixed;
    z-index: 400;
    min-width: 190px;
    padding: 4px;
    display: flex;
    flex-direction: column;
    background: #12181D;
    border: 1px solid #2A3540;
    border-radius: 6px;
    box-shadow: 0 12px 32px rgba(0, 0, 0, 0.55);
  }

  .scm-heading {
    padding: 4px 8px 6px;
    color: #6C7A88;
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.4px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .surface-context-menu button {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    padding: 5px 8px;
    background: none;
    border: none;
    border-radius: 4px;
    color: #D6DEE6;
    font-family: inherit;
    font-size: 11px;
    text-align: left;
    white-space: nowrap;
    cursor: pointer;
  }

  .surface-context-menu button:hover:not(:disabled) {
    background: #1D2A34;
  }

  .surface-context-menu button:disabled {
    color: #4A545E;
    cursor: not-allowed;
  }

  .surface-context-menu button.danger:hover:not(:disabled) {
    background: #33191C;
    color: #F2A0A0;
  }

  .surface-context-menu kbd {
    color: #5F6C79;
    font-family: inherit;
    font-size: 10px;
  }

  .scm-divider {
    height: 1px;
    margin: 4px 2px;
    background: #222C35;
  }
</style>
