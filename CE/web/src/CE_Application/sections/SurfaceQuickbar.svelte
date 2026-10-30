<script>
  /**
   * The quick actions for the selected layer or hit zone, floating at the top right of the design
   * surface: duplicate, copy, paste, the four stacking moves, Make Interactive, lock and delete for
   * a layer; delete for a hit zone.
   *
   * Lifted out of CustomDesignSurfaceEditor when that file reached its size limit, and in the same
   * change it moved: it sat at the bottom right, and on a narrow canvas covered half of the tool
   * strip centred along the bottom. Four of its buttons were the letters C, P, F and B; every button
   * is an icon with its name in the tooltip now.
   *
   * A view: the parent owns the selection and every action, and passes them in.
   */
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
  {:else}
    <button type="button" class="danger" onclick={onremovezone} disabled={!canRemoveZone} title="Delete hit zone">
      <Trash2 size={13} aria-hidden="true" />
    </button>
  {/if}
</div>

<style>
  /* Top right: the tool strip is centred along the bottom, and on a narrow canvas this bar sat on it. */
  .selection-quickbar {
    position: absolute;
    right: 16px;
    bottom: auto;
    left: auto;
    top: 10px;
    z-index: 2420;
    display: inline-flex;
    align-items: center;
    gap: 4px;
    width: max-content;
    max-width: calc(100% - 32px);
    height: 31px;
    margin: 0;
    padding: 3px 5px;
    border: 1px solid #34444F;
    border-radius: 4px;
    background: rgba(20, 27, 33, 0.96);
    box-shadow: 0 14px 32px rgba(0, 0, 0, 0.38);
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
</style>
