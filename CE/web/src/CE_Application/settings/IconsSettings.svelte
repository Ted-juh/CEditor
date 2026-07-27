<script>
  import ImagePlus from 'lucide-svelte/icons/image-plus';
  import Power from 'lucide-svelte/icons/power';
  import Trash2 from 'lucide-svelte/icons/trash-2';
  import {
    storedIcons,
    importLocalIconFiles,
    toggleIconEnabled,
    removeStoredIcon,
  } from '../stores/appSettings.js';

  let fileInput;
  let dragActive = $state(false);
  let importMessage = $state('');
  let importTone = $state('muted');

  async function handleImport(fileList) {
    let result;

    try {
      result = await importLocalIconFiles(fileList);
    } catch (error) {
      importTone = 'error';
      importMessage = error?.message ?? 'The icon import did not complete.';
      return;
    }

    if (result.ok) {
      importTone = 'success';
      importMessage = result.skippedCount > 0
        ? `Imported ${result.importedCount} icon(s), skipped ${result.skippedCount} duplicate(s).`
        : `Imported ${result.importedCount} icon(s).`;
      return;
    }

    importTone = 'error';
    if (result.reason === 'duplicates-only') {
      importMessage = 'Those icons are already in the library.';
    } else if (result.reason === 'no-supported-files') {
      importMessage = 'Use SVG, PNG, JPG, GIF, BMP, or WebP files.';
    } else {
      importMessage = 'The icon import did not complete.';
    }
  }

  function openPicker() {
    fileInput?.click();
  }

  function handleFileInput(event) {
    if (!event.target.files?.length) return;
    handleImport(event.target.files);
    event.target.value = '';
  }

  function handleDragOver(event) {
    event.preventDefault();
    dragActive = true;
  }

  function handleDragLeave(event) {
    if (event.currentTarget === event.target) {
      dragActive = false;
    }
  }

  function handleDrop(event) {
    event.preventDefault();
    dragActive = false;
    if (!event.dataTransfer?.files?.length) return;
    handleImport(event.dataTransfer?.files);
  }
</script>

<div
  class="icons-settings"
  class:drag-active={dragActive}
  role="region"
  aria-label="Icon settings"
  ondragover={handleDragOver}
  ondragleave={handleDragLeave}
  ondrop={handleDrop}
>
  <section class="settings-card import-card">
    <div class="card-head inline">
      <div>
        <h2>Import Local Icons</h2>
        <p>Shared across the app and ready for any component that uses the Icon section.</p>
      </div>
      <button class="primary-btn" type="button" onclick={openPicker}>
        <ImagePlus size={15} strokeWidth={1.8} />
        <span>Import Icons</span>
      </button>
    </div>

    <input
      bind:this={fileInput}
      class="hidden-input"
      type="file"
      accept=".svg,.png,.jpg,.jpeg,.gif,.bmp,.webp,image/svg+xml,image/png,image/jpeg,image/gif,image/bmp,image/webp"
      multiple
      onchange={handleFileInput}
    />

    <div class="drop-strip">
      <span>Drop files here or use the button.</span>
      <small>SVG, PNG, JPG, GIF, BMP, WebP</small>
    </div>

    {#if importMessage}
      <div class={`status ${importTone}`}>{importMessage}</div>
    {/if}
  </section>

  <section class="settings-card library-card">
    <div class="card-head">
      <div>
        <h2>Library</h2>
        <p>{($storedIcons ?? []).length} icon(s) stored locally in app settings.</p>
      </div>
    </div>

    {#if ($storedIcons ?? []).length === 0}
      <div class="empty-state">No icons imported yet.</div>
    {:else}
      <div class="icon-list">
        {#each $storedIcons as icon (icon.id)}
          <article class:disabled={!icon.enabled} class="icon-row">
            <div class="icon-preview">
              <img src={icon.dataUrl} alt={icon.name} />
            </div>

            <div class="icon-info">
              <div class="icon-title-row">
                <strong>{icon.name}</strong>
                <span class="pill">Local</span>
                <span class="pill">{icon.isVector ? 'Vector' : 'Raster'}</span>
                {#if icon.width && icon.height}
                  <span class="pill">{icon.width} x {icon.height}</span>
                {/if}
              </div>
              <div class="icon-meta">{icon.fileName}</div>
            </div>

            <div class="icon-actions">
              <button
                class="icon-btn"
                type="button"
                title={icon.enabled ? 'Disable icon' : 'Enable icon'}
                onclick={() => toggleIconEnabled(icon.id)}
              >
                <Power size={14} strokeWidth={1.8} />
              </button>
              <button
                class="icon-btn danger"
                type="button"
                title="Remove icon"
                onclick={() => removeStoredIcon(icon.id)}
              >
                <Trash2 size={14} strokeWidth={1.8} />
              </button>
            </div>
          </article>
        {/each}
      </div>
    {/if}
  </section>
</div>

<style>
  .icons-settings {
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding: 18px 18px 24px;
  }

  .icons-settings.drag-active .import-card {
    border-color: #0B6EB5;
    box-shadow: 0 0 0 1px rgba(11, 110, 181, 0.38);
  }

  .settings-card {
    border: 1px solid #303030;
    border-radius: 12px;
    background: linear-gradient(180deg, rgba(34, 34, 34, 0.98), rgba(24, 24, 24, 0.98));
    overflow: hidden;
  }

  .card-head {
    padding: 12px 14px 10px;
    border-bottom: 1px solid #2B2B2B;
  }

  .card-head.inline {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  }

  .card-head h2 {
    margin: 0;
    font-size: 17px;
    font-weight: 650;
    color: #F4F4F4;
  }

  .card-head p {
    margin: 4px 0 0;
    font-size: 11px;
    color: #949494;
  }

  .primary-btn {
    height: 32px;
    display: inline-flex;
    align-items: center;
    gap: 8px;
    border: 1px solid #0B6EB5;
    border-radius: 8px;
    background: linear-gradient(180deg, #106DAE, #094771);
    color: #FFF;
    padding: 0 12px;
    font-size: 11px;
    font-family: inherit;
    cursor: pointer;
  }

  .primary-btn:hover {
    filter: brightness(1.08);
  }

  .hidden-input {
    display: none;
  }

  .drop-strip {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    padding: 10px 14px;
    font-size: 11px;
    color: #ADADAD;
  }

  .drop-strip small {
    color: #767676;
    font-size: 10px;
  }

  .status {
    margin: 0 14px 12px;
    padding: 8px 10px;
    border-radius: 8px;
    font-size: 11px;
  }

  .status.success {
    color: #B8F1C0;
    background: rgba(37, 88, 54, 0.48);
    border: 1px solid rgba(86, 167, 103, 0.45);
  }

  .status.error {
    color: #F5C1C1;
    background: rgba(109, 39, 39, 0.4);
    border: 1px solid rgba(173, 70, 70, 0.4);
  }

  .library-card {
    display: flex;
    flex-direction: column;
  }

  .empty-state {
    padding: 18px 14px;
    color: #727272;
    font-size: 12px;
  }

  .icon-list {
    display: flex;
    flex-direction: column;
  }

  .icon-row {
    display: grid;
    grid-template-columns: 64px minmax(0, 1fr) auto;
    gap: 14px;
    align-items: center;
    padding: 12px 14px;
    border-top: 1px solid #292929;
  }

  .icon-row:first-child {
    border-top: none;
  }

  .icon-row.disabled {
    opacity: 0.45;
  }

  .icon-preview {
    width: 64px;
    height: 64px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 10px;
    border: 1px solid #3A3A3A;
    background:
      linear-gradient(45deg, #202020 25%, transparent 25%, transparent 75%, #202020 75%),
      linear-gradient(45deg, #202020 25%, transparent 25%, transparent 75%, #202020 75%);
    background-position: 0 0, 8px 8px;
    background-size: 16px 16px;
    background-color: #181818;
  }

  .icon-preview img {
    max-width: 44px;
    max-height: 44px;
    object-fit: contain;
  }

  .icon-info {
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .icon-title-row {
    display: flex;
    align-items: center;
    gap: 6px;
    flex-wrap: wrap;
  }

  .icon-title-row strong {
    font-size: 19px;
    font-weight: 650;
    color: #F2F2F2;
  }

  .icon-meta {
    font-size: 11px;
    color: #828282;
  }

  .pill {
    display: inline-flex;
    align-items: center;
    height: 22px;
    padding: 0 10px;
    border-radius: 999px;
    border: 1px solid #404040;
    background: #262626;
    color: #A9A9A9;
    font-size: 11px;
  }

  .icon-actions {
    display: flex;
    gap: 6px;
  }

  .icon-btn {
    width: 30px;
    height: 30px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-radius: 8px;
    border: 1px solid #3A3A3A;
    background: #202020;
    color: #B9B9B9;
    cursor: pointer;
    padding: 0;
  }

  .icon-btn:hover {
    border-color: #5B9BD5;
    color: #FFF;
  }

  .icon-btn.danger:hover {
    border-color: #C45F5F;
    color: #FFD7D7;
  }
</style>
