<script>
  /**
   * The quick actions for the selected layer or hit zone: duplicate, copy, paste, the four stacking
   * moves, Make Interactive, lock and delete for a layer; delete for a hit zone. Drawn in the look
   * bar across the top of the designer (SurfaceLookBar's `actions`), beside the layer's style.
   *
   * Lifted out of CustomDesignSurfaceEditor when that file reached its size limit. It floated over
   * the canvas: at the bottom right it covered half of the tool strip on a narrow canvas; at the top
   * it covered the selection's name and, once a component opened fitted, the alignment bar above a
   * selection. In the look bar it covers nothing. Four of its buttons were the letters C, P, F and
   * B; every button is an icon with its name in the tooltip now.
   *
   * A view: the parent owns the selection and every action, and passes them in.
   *
   * FOLDED ON A MIDDLING DESIGNER. The ten layer buttons are 327 pixels, and at 1700 wide they left
   * the layer's style 486 of the 611 it needs: Opacity was out of sight. Between 940 and 1199 pixels
   * of designer they are one "Layer ▾" with the same actions by name, and the style fits. Wider,
   * everything fits as it is; narrower, the look bar puts the style on a row of its own
   * (SurfaceLookBar.svelte) and there is room for the buttons again. Container queries on the
   * designer (.surface-shell), so nothing is measured in script.
   */
  import { floating } from '../utils/floatingUi.js';
  import ArrowDown from 'lucide-svelte/icons/arrow-down';
  import ArrowUp from 'lucide-svelte/icons/arrow-up';
  import BringToFront from 'lucide-svelte/icons/bring-to-front';
  import ClipboardPaste from 'lucide-svelte/icons/clipboard-paste';
  import Copy from 'lucide-svelte/icons/copy';
  import CopyPlus from 'lucide-svelte/icons/copy-plus';
  import Lock from 'lucide-svelte/icons/lock';
  import SendToBack from 'lucide-svelte/icons/send-to-back';
  import Trash2 from 'lucide-svelte/icons/trash-2';
  import Unlock from 'lucide-svelte/icons/unlock';
  import Zap from 'lucide-svelte/icons/zap';

  let {
    kind = 'layer', // 'layer' or 'hitZone'
    canManageLayer = false,
    canCopy = false,
    canPaste = false,
    locked = false,
    interactiveLabel = '',
    canRemoveZone = false,
    onduplicate = () => {},
    oncopy = () => {},
    onpaste = () => {},
    onmove = () => {}, // +1 forward, -1 backward
    onextreme = () => {}, // 'front' or 'back'
    onmakeinteractive = () => {},
    ontogglelock = () => {},
    onremove = () => {},
    onremovezone = () => {},
    onmousedown = () => {},
  } = $props();

  let foldOpen = $state(false);
  let foldHost = $state(null);

  // The buttons' actions by name, for the folded menu.
  let foldItems = $derived([
    { key: 'duplicate', label: 'Duplicate layer', icon: CopyPlus, run: onduplicate, enabled: canManageLayer },
    { key: 'copy', label: 'Copy layers', hint: 'Ctrl+C', icon: Copy, run: oncopy, enabled: canCopy },
    { key: 'paste', label: 'Paste layers', hint: 'Ctrl+V', icon: ClipboardPaste, run: onpaste, enabled: canPaste },
    { key: 'forward', label: 'Bring forward', icon: ArrowUp, run: () => onmove(1), enabled: canManageLayer },
    { key: 'front', label: 'Bring to front', icon: BringToFront, run: () => onextreme('front'), enabled: canManageLayer },
    { key: 'backward', label: 'Send backward', icon: ArrowDown, run: () => onmove(-1), enabled: canManageLayer },
    { key: 'back', label: 'Send to back', icon: SendToBack, run: () => onextreme('back'), enabled: canManageLayer },
    { key: 'interactive', label: `Make interactive: ${interactiveLabel}`, icon: Zap, run: onmakeinteractive, enabled: canManageLayer },
    { key: 'lock', label: locked ? 'Unlock layer' : 'Lock layer', icon: locked ? Unlock : Lock, run: ontogglelock, enabled: canManageLayer },
    { key: 'delete', label: 'Delete layer', icon: Trash2, run: onremove, enabled: canManageLayer, danger: true },
  ]);

  function runFolded(item) {
    foldOpen = false;
    item.run();
  }

  // A click anywhere else closes the menu, and so does Escape, which stops there: the designer's own
  // Escape would also drop the selection the menu acts on.
  $effect(() => {
    if (!foldOpen) return;
    const onDown = (event) => { if (!foldHost?.contains(event.target)) foldOpen = false; };
    const onKey = (event) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopPropagation();
      foldOpen = false;
    };
    document.addEventListener('pointerdown', onDown, true);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown, true);
      document.removeEventListener('keydown', onKey);
    };
  });
</script>

<div
  class="selection-quickbar"
  class:zone-tools={kind === 'hitZone'}
  role="toolbar"
  tabindex="-1"
  aria-label={kind === 'hitZone' ? 'Selected hit zone quick actions' : 'Selected layer quick actions'}
  {onmousedown}
>
  <span class="quickbar-label">{kind === 'hitZone' ? 'Zone' : 'Layer'}</span>
  {#if kind === 'layer'}
    <span class="quickbar-buttons">
    <button type="button" onclick={onduplicate} disabled={!canManageLayer} title="Duplicate layer">
      <CopyPlus size={13} aria-hidden="true" />
    </button>
    <button type="button" onclick={oncopy} disabled={!canCopy} title="Copy layers (Ctrl+C)">
      <Copy size={13} aria-hidden="true" />
    </button>
    <button type="button" onclick={onpaste} disabled={!canPaste} title="Paste layers (Ctrl+V)">
      <ClipboardPaste size={13} aria-hidden="true" />
    </button>
    <button type="button" onclick={() => onmove(1)} disabled={!canManageLayer} title="Bring forward">
      <ArrowUp size={13} aria-hidden="true" />
    </button>
    <button type="button" onclick={() => onextreme('front')} disabled={!canManageLayer} title="Bring to front">
      <BringToFront size={13} aria-hidden="true" />
    </button>
    <button type="button" onclick={() => onmove(-1)} disabled={!canManageLayer} title="Send backward">
      <ArrowDown size={13} aria-hidden="true" />
    </button>
    <button type="button" onclick={() => onextreme('back')} disabled={!canManageLayer} title="Send to back">
      <SendToBack size={13} aria-hidden="true" />
    </button>
    <button
      type="button"
      onclick={onmakeinteractive}
      disabled={!canManageLayer}
      title={`Make interactive: ${interactiveLabel} — scaffold a wired channel + behavior + grab zone on this layer`}
    >
      <Zap size={13} aria-hidden="true" />
    </button>
    <button type="button" onclick={ontogglelock} disabled={!canManageLayer} title={locked ? 'Unlock layer' : 'Lock layer'}>
      {#if locked}
        <Unlock size={13} aria-hidden="true" />
      {:else}
        <Lock size={13} aria-hidden="true" />
      {/if}
    </button>
    <button type="button" class="danger" onclick={onremove} disabled={!canManageLayer} title="Delete layer">
      <Trash2 size={13} aria-hidden="true" />
    </button>
    </span>
    <span class="quickbar-fold" bind:this={foldHost}>
      <button type="button" class="fold-button" aria-haspopup="menu" aria-expanded={foldOpen} title="Layer actions" onclick={() => { foldOpen = !foldOpen; }}>Layer ▾</button>
      {#if foldOpen}
        <div class="fold-menu" role="menu" aria-label="Layer actions" use:floating={{ anchor: 'parent', placement: 'bottom-end', fallbackPlacements: ['top-end'] }}>
          {#each foldItems as item (item.key)}
            <button type="button" role="menuitem" class:danger={item.danger} disabled={!item.enabled} onclick={() => runFolded(item)}>
              <item.icon size={13} aria-hidden="true" />
              <span>{item.label}</span>
              {#if item.hint}<kbd>{item.hint}</kbd>{/if}
            </button>
          {/each}
        </div>
      {/if}
    </span>
  {:else}
    <button type="button" class="danger" onclick={onremovezone} disabled={!canRemoveZone} title="Delete hit zone">
      <Trash2 size={13} aria-hidden="true" />
    </button>
  {/if}
</div>

<style>
  .selection-quickbar {
    display: inline-flex;
    flex-wrap: nowrap;
    flex-shrink: 0;
    align-items: center;
    gap: 4px;
    width: max-content;
    min-height: 31px;
    padding: 3px 5px;
    border: 1px solid #34444F;
    border-radius: 4px;
    background: rgba(20, 27, 33, 0.96);
  }

  .selection-quickbar.zone-tools {
    border-color: rgba(229, 160, 41, 0.64);
  }

  .quickbar-label {
    max-width: 72px;
    overflow: hidden;
    padding: 0 7px 0 4px;
    border-right: 1px solid rgba(255, 255, 255, 0.11);
    color: #9EB2BE;
    font-size: 10px;
    font-weight: 900;
    line-height: 1;
    text-overflow: ellipsis;
    text-transform: uppercase;
    white-space: nowrap;
  }

  .selection-quickbar button {
    display: grid;
    place-items: center;
    width: 23px;
    height: 23px;
    padding: 0;
    border: 1px solid transparent;
    border-radius: 3px;
    background: transparent;
    color: #DDEEFF;
    cursor: pointer;
  }

  .selection-quickbar button:hover:not(:disabled) {
    border-color: rgba(125, 196, 243, 0.6);
    background: rgba(91, 155, 213, 0.2);
  }

  .selection-quickbar.zone-tools button:hover:not(:disabled) {
    border-color: rgba(229, 160, 41, 0.62);
    background: rgba(229, 160, 41, 0.16);
  }

  .selection-quickbar button.danger:hover:not(:disabled) {
    border-color: rgba(214, 90, 90, 0.74);
    background: rgba(75, 32, 32, 0.8);
    color: #FFE8E8;
  }

  .selection-quickbar button:disabled {
    cursor: not-allowed;
    opacity: 0.42;
  }

  /* The buttons lay out in the bar as they always have; the fold shows only between 940 and 1199
     pixels of designer (see the comment at the top). */
  .quickbar-buttons {
    display: contents;
  }

  .quickbar-fold {
    display: none;
  }

  .selection-quickbar .fold-button {
    width: auto;
    padding: 0 8px;
    border-color: #3B4650;
    background: #1D252B;
    color: #CBD7E0;
    font: inherit;
    font-size: 10px;
    font-weight: 800;
    text-transform: uppercase;
    white-space: nowrap;
  }

  .fold-menu {
    z-index: 1600;
    display: grid;
    gap: 2px;
    min-width: 210px;
    padding: 6px;
    border: 1px solid #31434F;
    border-radius: 5px;
    background: #111A21;
    box-shadow: 0 18px 34px rgba(0, 0, 0, 0.42);
  }

  .selection-quickbar .fold-menu button {
    display: grid;
    grid-template-columns: 16px minmax(0, 1fr) auto;
    align-items: center;
    justify-items: start;
    gap: 8px;
    width: 100%;
    height: 26px;
    padding: 0 8px;
    font: inherit;
    font-size: 11px;
    text-align: left;
  }

  .fold-menu kbd {
    color: #7E8B98;
    font: inherit;
    font-size: 9px;
  }

  @container (min-width: 940px) and (max-width: 1199px) {
    .selection-quickbar:not(.zone-tools) .quickbar-label,
    .quickbar-buttons {
      display: none;
    }

    .quickbar-fold {
      display: inline-flex;
    }
  }
</style>
