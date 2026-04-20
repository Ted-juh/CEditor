<script>
  import { selectedComponentIds } from '../stores/panels.js';
  import { removeControl, duplicateControl, updateControlProperty } from '../stores/controls.js';
  import { cutSelection, copySelection, pasteSelection, selectAll, hasClipboardContent } from '../stores/clipboard.js';
  import { bringToFront, bringForward, sendBackward, sendToBack } from '../stores/alignment.js';
  import { displayTabRequest } from '../stores/displayTab.js';
  import { guides, clearGuides } from '../stores/guides.js';

  // `target` is null when hidden, { screenX, screenY, panelX, panelY } when shown.
  // Parent binds to this so the menu can close itself.
  let { target = $bindable(null), panel = null } = $props();

  let sub = $state(null); // open submenu: 'order' | null

  function close() { target = null; sub = null; }

  function cut()    { cutSelection(); close(); }
  function copy()   { copySelection(); close(); }
  function paste()  { pasteSelection(target ? { x: target.panelX, y: target.panelY } : null); close(); }
  function del()    { for (const id of [...$selectedComponentIds]) removeControl(id); close(); }
  function selAll() { selectAll(); close(); }
  function dupe()   { duplicateControl($selectedComponentIds); close(); }
  function align()  { displayTabRequest.set({ tab: 'align' }); close(); }
  function order(fn) { fn(); close(); }

  function toggleLock() {
    for (const id of $selectedComponentIds) {
      const ctrl = panel?.controls.find(c => c._children?.Core?.id === id);
      const locked = ctrl?._children?.Core?.locked ?? false;
      updateControlProperty(id, 'Core.locked', !locked);
    }
    close();
  }

  let allLocked = $derived.by(() => {
    if ($selectedComponentIds.size === 0 || !panel) return false;
    return panel.controls
      .filter(c => $selectedComponentIds.has(c._children?.Core?.id))
      .every(c => c._children?.Core?.locked === true);
  });
</script>

{#if target}
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    class="ctx-backdrop"
    onmousedown={close}
    oncontextmenu={(e) => { e.preventDefault(); close(); }}
  ></div>
  <div class="ctx-menu" style="left:{target.screenX}px; top:{target.screenY}px;">
    {#if $selectedComponentIds.size > 0}
      <button class="ctx-item" onclick={cut}>Cut<span class="ctx-shortcut">Ctrl+X</span></button>
      <button class="ctx-item" onclick={copy}>Copy<span class="ctx-shortcut">Ctrl+C</span></button>
    {/if}
    {#if hasClipboardContent()}
      <button class="ctx-item" onclick={paste}>Paste Here<span class="ctx-shortcut">Ctrl+V</span></button>
    {/if}
    {#if $selectedComponentIds.size > 0}
      <div class="ctx-separator"></div>
      <button class="ctx-item" onclick={dupe}>Duplicate<span class="ctx-shortcut">Ctrl+D</span></button>
      <button class="ctx-item ctx-danger" onclick={del}>Delete<span class="ctx-shortcut">Del</span></button>
      <div class="ctx-separator"></div>
      <button class="ctx-item" onclick={align}>Align &amp; Layout...</button>
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <div class="ctx-sub-wrapper" onmouseenter={() => sub = 'order'} onmouseleave={() => sub = null}>
        <button class="ctx-item">Order<span class="ctx-arrow">&#9656;</span></button>
        {#if sub === 'order'}
          <div class="ctx-submenu">
            <button class="ctx-item" onclick={() => order(bringToFront)}>Bring to Front</button>
            <button class="ctx-item" onclick={() => order(bringForward)}>Bring Forward</button>
            <button class="ctx-item" onclick={() => order(sendBackward)}>Send Backward</button>
            <button class="ctx-item" onclick={() => order(sendToBack)}>Send to Back</button>
          </div>
        {/if}
      </div>
      <div class="ctx-separator"></div>
      <button class="ctx-item" onclick={toggleLock}>{allLocked ? 'Unlock' : 'Lock'}</button>
    {/if}
    {#if panel && panel.controls.length > 0}
      <div class="ctx-separator"></div>
      <button class="ctx-item" onclick={selAll}>Select All<span class="ctx-shortcut">Ctrl+A</span></button>
    {/if}
    {#if $guides.horizontal.length > 0 || $guides.vertical.length > 0}
      <div class="ctx-separator"></div>
      <button class="ctx-item" onclick={() => { clearGuides(); close(); }}>Clear All Guides</button>
    {/if}
  </div>
{/if}

<style>
  .ctx-backdrop {
    position: fixed;
    inset: 0;
    z-index: 999;
  }

  .ctx-menu {
    position: fixed;
    z-index: 1000;
    min-width: 170px;
    background: #2D2D2D;
    border: 1px solid #444;
    border-radius: 4px;
    padding: 4px 0;
    box-shadow: 0 4px 16px rgba(0,0,0,0.5);
  }

  .ctx-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    width: 100%;
    padding: 5px 12px;
    background: none;
    border: none;
    color: #CCC;
    font-size: 12px;
    cursor: pointer;
    font-family: inherit;
    text-align: left;
  }

  .ctx-item:hover {
    background: #094771;
    color: #FFF;
  }

  .ctx-item.ctx-danger:hover {
    background: #6B1A1A;
  }

  .ctx-shortcut {
    color: #777;
    font-size: 11px;
    margin-left: 24px;
  }

  .ctx-item:hover .ctx-shortcut {
    color: #AAD;
  }

  .ctx-separator {
    height: 1px;
    background: #444;
    margin: 4px 8px;
  }

  .ctx-arrow {
    color: #777;
    font-size: 10px;
    margin-left: 24px;
  }

  .ctx-item:hover .ctx-arrow {
    color: #AAD;
  }

  .ctx-sub-wrapper {
    position: relative;
  }

  .ctx-submenu {
    position: absolute;
    left: 100%;
    top: -4px;
    min-width: 150px;
    background: #2D2D2D;
    border: 1px solid #444;
    border-radius: 4px;
    padding: 4px 0;
    box-shadow: 0 4px 16px rgba(0,0,0,0.5);
    z-index: 1001;
  }
</style>
