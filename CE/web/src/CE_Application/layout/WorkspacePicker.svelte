<script>
  /**
   * WorkspacePicker.svelte — one list-of-things-to-open popover, shared.
   *
   * Review finding D6, last clause: "'Open Saved Custom Component' still opens `library[0]` with
   * no picker while TabBar's equivalent shows a real picker." There were two answers to the same
   * question in the app — one of them a lie, because with two saved packages the File menu opened
   * whichever happened to sort first and gave no hint that it had chosen for you. Rather than
   * copy TabBar's picker into MenuBar and have two to keep in step, the picker moved here and
   * both call sites mount it.
   *
   * Positioning is the caller's business (`anchorStyle`): the tab strip hangs it under the tab
   * group at the right, the menu bar hangs it under the File menu at the left.
   */
  let {
    title = 'Open',
    entries = [],
    emptyText = 'Nothing saved yet.',
    footerLabel = '',
    anchorStyle = 'right: 0; top: calc(100% + 6px);',
    onPick = () => {},
    onClose = () => {},
    onFooter = () => {},
  } = $props();

  let root = $state(null);

  // Focus the first row on open so the picker is usable without a mouse, and so Escape has
  // somewhere to return from. Matches the icon rail's drawers.
  $effect(() => {
    root?.querySelector('.picker-list button, .picker-import, .picker-head button')?.focus();
  });

  function handleKeydown(event) {
    if (event.key !== 'Escape') return;
    event.stopPropagation();
    onClose();
  }
</script>

<div
  class="workspace-picker"
  role="dialog"
  aria-label={title}
  style={anchorStyle}
  tabindex="-1"
  bind:this={root}
  onkeydown={handleKeydown}
>
  <div class="picker-head">
    <strong>{title}</strong>
    <button type="button" title="Close" aria-label="Close {title}" onclick={() => onClose()}>×</button>
  </div>
  <div class="picker-list">
    {#each entries as entry (entry.key)}
      <button type="button" title={entry.tooltip ?? entry.subtitle ?? entry.title} onclick={() => onPick(entry)}>
        <strong>{entry.title}</strong>
        <span>{entry.subtitle}</span>
      </button>
    {/each}
    {#if entries.length === 0}
      <div class="picker-empty">{emptyText}</div>
    {/if}
  </div>
  {#if footerLabel}
    <button class="picker-import" type="button" onclick={() => onFooter()}>{footerLabel}</button>
  {/if}
</div>

<style>
  .workspace-picker {
    position: absolute;
    z-index: 300;
    width: 260px;
    max-width: calc(100vw - 24px);
    padding: 8px;
    border: 1px solid #3B4652;
    border-radius: 6px;
    background: #171A1D;
    box-shadow: 0 12px 30px rgba(0, 0, 0, 0.38);
    box-sizing: border-box;
  }

  .picker-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    margin-bottom: 6px;
    color: #DDE7EF;
    font-size: 11px;
  }

  .picker-head button {
    width: 20px;
    height: 20px;
    border: none;
    border-radius: 3px;
    background: transparent;
    color: #888;
    cursor: pointer;
  }

  .picker-head button:hover {
    background: #333;
    color: #FFF;
  }

  .picker-list {
    display: flex;
    flex-direction: column;
    gap: 4px;
    max-height: 248px;
    overflow-y: auto;
  }

  .picker-list button,
  .picker-import {
    display: flex;
    flex-direction: column;
    align-items: stretch;
    gap: 3px;
    width: 100%;
    min-height: 42px;
    padding: 7px 8px;
    border: 1px solid #30343A;
    border-radius: 4px;
    background: #202326;
    color: #D8E0E8;
    text-align: left;
    cursor: pointer;
    box-sizing: border-box;
  }

  .picker-list button:hover,
  .picker-list button:focus-visible,
  .picker-import:hover,
  .picker-import:focus-visible {
    border-color: #5B9BD5;
    background: #243241;
  }

  .picker-list strong {
    overflow: hidden;
    font-size: 11px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .picker-list span {
    overflow: hidden;
    color: #8FA0AC;
    font-size: 10px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .picker-empty {
    padding: 14px 8px;
    border: 1px dashed #3A3A3A;
    border-radius: 4px;
    color: #888;
    font-size: 11px;
    text-align: center;
  }

  .picker-import {
    align-items: center;
    justify-content: center;
    min-height: 28px;
    margin-top: 6px;
    font-size: 11px;
    font-weight: 800;
    text-align: center;
  }
</style>
