<script>
  import Download from 'lucide-svelte/icons/download';
  import Globe from 'lucide-svelte/icons/globe';
  import Power from 'lucide-svelte/icons/power';
  import PowerOff from 'lucide-svelte/icons/power-off';
  import Trash2 from 'lucide-svelte/icons/trash-2';
  import { storedFonts, fontRuntimeStatus, importLocalFontFiles, addGoogleFont, toggleFontEnabled, removeStoredFont, ensureStoredFontLoaded } from '../stores/appSettings.js';
  import { nativeFontPreviews, requestNativeFontPreview } from '../stores/nativeFontPreviews.js';

  let googleFamily = $state('');
  let errorMessage = $state('');
  let isAddingGoogle = $state(false);
  let localStatusMessage = $state('');
  let localErrorMessage = $state('');
  let isDragActive = $state(false);
  let fileInput;
  const librarySampleText = '0123456789 ABCD abcd';

  function libraryPreviewKey(font) {
    return `library:${font.id}:${font.fontStyle || 'normal'}:${font.staticWeight || 400}`;
  }

  $effect(() => {
    for (const font of $storedFonts) {
      ensureStoredFontLoaded(font, { allowFeatureBackfill: true, delayMs: 0 });
    }
  });

  $effect(() => {
    for (const font of $storedFonts) {
      if ($fontRuntimeStatus[font.id]?.status !== 'failed' || !font.localDataUrl) continue;

      requestNativeFontPreview(libraryPreviewKey(font), {
        fontData: font.localDataUrl,
        familyName: font.family,
        styleName: font.styleName || (font.fontStyle === 'italic' ? 'Italic' : 'Regular'),
        text: librarySampleText,
        width: 420,
        height: 48,
        fontSize: 30,
        colour: 'FFFFFFFF',
        justification: 'left',
        italic: font.fontStyle === 'italic',
        underline: false,
      });
    }
  });

  async function processLocalFiles(fileList) {
    localStatusMessage = '';
    localErrorMessage = '';

    try {
      const result = await importLocalFontFiles(fileList);
      if (!result.ok) {
        if (result.reason === 'no-supported-files') {
          localErrorMessage = 'Choose or drop `.ttf`, `.otf`, `.woff`, or `.woff2` files.';
        } else if (result.reason === 'duplicates-only') {
          localErrorMessage = 'Those font files are already in the library.';
        } else {
          localErrorMessage = 'Those files could not be imported.';
        }
        return;
      }

      localStatusMessage = result.skippedCount > 0
        ? `Imported ${result.importedCount} font(s). Skipped ${result.skippedCount} duplicate file(s).`
        : `Imported ${result.importedCount} font(s).`;
    } catch (error) {
      console.error('[FontsSettings] Local import failed', error);
      localErrorMessage = 'The file browser opened, but the selected font files could not be read.';
    }
  }

  function openLocalPicker() {
    localStatusMessage = '';
    localErrorMessage = '';
    fileInput?.click();
  }

  async function handleLocalInputChange(event) {
    const files = event.currentTarget?.files;
    if (files?.length) {
      await processLocalFiles(files);
    }

    event.currentTarget.value = '';
  }

  function handleDragOver(event) {
    event.preventDefault();
    isDragActive = true;
  }

  function handleDragLeave(event) {
    event.preventDefault();
    isDragActive = false;
  }

  async function handleDrop(event) {
    event.preventDefault();
    isDragActive = false;

    const files = event.dataTransfer?.files;
    if (files?.length) {
      await processLocalFiles(files);
    }
  }

  async function handleGoogleAdd() {
    if (isAddingGoogle) return;

    isAddingGoogle = true;
    errorMessage = '';

    const result = await addGoogleFont(googleFamily);
    if (!result.ok) {
      if (result.reason === 'empty') {
        errorMessage = 'Enter a Google font family name first.';
      } else if (result.reason === 'duplicate') {
        errorMessage = 'That Google font is already in the library.';
      } else if (result.reason === 'not-found') {
        errorMessage = 'Google could not find that family. Use the font name as listed on Google Fonts.';
      } else if (result.reason === 'download-failed') {
        errorMessage = 'Google found the font, but the font files could not be cached locally.';
      } else {
        errorMessage = 'Google Fonts could not be verified right now. Please try again.';
      }

      isAddingGoogle = false;
      return;
    }

    googleFamily = '';
    errorMessage = '';
    isAddingGoogle = false;
  }
</script>

<div
  class="fonts-settings"
  class:drag-active={isDragActive}
  role="region"
  aria-label="Font import area"
  ondragover={handleDragOver}
  ondragleave={handleDragLeave}
  ondrop={handleDrop}
>
  <input
    bind:this={fileInput}
    class="sr-only"
    type="file"
    accept=".ttf,.otf,.woff,.woff2"
    multiple
    onchange={handleLocalInputChange}
  />

  <div class="settings-header">
    <h1>Fonts</h1>
    <p>Import local font files or cache Google Fonts once, then reuse them anywhere text is editable.</p>
  </div>

  <div class="action-grid">
    <button class="action-card local-card" class:drag-active={isDragActive} onclick={openLocalPicker}>
      <Download size={16} strokeWidth={1.6} />
      <div>
        <strong>Import Local Fonts</strong>
        <span>Opens a file browser for `.ttf`, `.otf`, `.woff`, or `.woff2` files.</span>
        <span class="local-help">You can also drag and drop font files anywhere onto this page.</span>
        {#if localStatusMessage}
          <span class="status-text">{localStatusMessage}</span>
        {/if}
        {#if localErrorMessage}
          <span class="error-text local-error">{localErrorMessage}</span>
        {/if}
      </div>
    </button>

    <div class="action-card google-card">
      <div class="google-top-row">
        <div class="google-head">
          <Globe size={16} strokeWidth={1.6} />
          <strong>Add Google Font</strong>
        </div>
        <div class="google-row">
          <input
            class="google-input"
            type="text"
            bind:value={googleFamily}
            placeholder="Example: JetBrains Mono"
            disabled={isAddingGoogle}
            onkeydown={(event) => event.key === 'Enter' && handleGoogleAdd()}
          />
          <button class="google-add" onclick={handleGoogleAdd} disabled={isAddingGoogle}>
            {isAddingGoogle ? 'Checking...' : 'Add'}
          </button>
        </div>
      </div>
      <span class="google-help">The family is verified and cached locally before it is added. Use the name as shown on Google Fonts.</span>
      {#if errorMessage}
        <span class="error-text">{errorMessage}</span>
      {/if}
    </div>
  </div>

  <div class="library-section">
    <div class="library-header">
      <h2>Library</h2>
      <span>{$storedFonts.length} imported</span>
    </div>

    {#if $storedFonts.length === 0}
      <div class="empty-state">
        <span>No custom fonts yet.</span>
        <small>Imported fonts will appear here and then show up in text font pickers.</small>
      </div>
    {:else}
      <div class="font-list">
        {#each $storedFonts as font (font.id)}
          <div class="font-row" class:disabled={!font.enabled}>
            <div class="font-main">
              <div class="font-meta">
                <span class="font-name">{font.family}</span>
                <span class="font-badge">{font.sourceType === 'google' ? 'Google' : 'Local'}</span>
                {#if font.sourceType === 'google' && font.cachedFaces?.length}
                  <span class="font-badge accent">Cached</span>
                {/if}
                {#if font.supportsWeight}
                  <span class="font-badge accent">W</span>
                {/if}
                {#if $fontRuntimeStatus[font.id]?.status === 'loaded'}
                  <span class="font-badge success">Loaded</span>
                {:else if $fontRuntimeStatus[font.id]?.status === 'failed' && $nativeFontPreviews[libraryPreviewKey(font)]?.data}
                  <span class="font-badge native" title="Browser font load failed, native preview fallback is active">Native</span>
                {:else if $fontRuntimeStatus[font.id]?.status === 'loading'}
                  <span class="font-badge">Loading</span>
                {:else if $fontRuntimeStatus[font.id]?.status === 'failed'}
                  <span class="font-badge danger" title={$fontRuntimeStatus[font.id]?.detail || 'Font load failed'}>Failed</span>
                {/if}
              </div>
              <div class="font-details">
                {#if font.fileName}
                  <span class="font-file">{font.fileName}</span>
                {/if}
                {#if font.styleName}
                  <span class="font-file">{font.styleName}</span>
                {/if}
                {#if font.weightAxis}
                  <span class="font-file">wght {font.weightAxis.min}-{font.weightAxis.max}</span>
                {:else if font.staticWeight}
                  <span class="font-file">static {font.staticWeight}</span>
                {/if}
              </div>
            </div>
            <div class="font-preview-group">
              <span class="preview-label">Example</span>
              {#if $fontRuntimeStatus[font.id]?.status === 'failed' && $nativeFontPreviews[libraryPreviewKey(font)]?.data}
                <img
                  class="font-preview-image"
                  src={$nativeFontPreviews[libraryPreviewKey(font)].data}
                  alt=""
                />
              {:else}
                <div
                  class="font-preview"
                  style={`font-family:'${font.cssFamily || font.family}';font-style:${font.fontStyle || 'normal'};font-weight:${font.staticWeight || 400}`}
                >
                  {librarySampleText}
                </div>
              {/if}
            </div>

            <div class="font-actions">
              <button
                class="icon-btn"
                title={font.enabled ? 'Disable font' : 'Enable font'}
                onclick={() => toggleFontEnabled(font.id)}
              >
                {#if font.enabled}
                  <Power size={15} strokeWidth={1.7} />
                {:else}
                  <PowerOff size={15} strokeWidth={1.7} />
                {/if}
              </button>
              <button
                class="icon-btn danger"
                title="Remove font"
                onclick={() => removeStoredFont(font.id)}
              >
                <Trash2 size={15} strokeWidth={1.7} />
              </button>
            </div>
          </div>
        {/each}
      </div>
    {/if}
  </div>
</div>

<style>
  .fonts-settings {
    display: flex;
    flex-direction: column;
    gap: 18px;
    padding: 24px 28px 28px;
    color: #D7D7D7;
  }

  .fonts-settings.drag-active {
    outline: 1px dashed #5B9BD5;
    outline-offset: -10px;
  }

  .settings-header h1,
  .library-header h2 {
    margin: 0;
    font-size: 20px;
    font-weight: 600;
    color: #F2F2F2;
  }

  .settings-header p {
    margin: 6px 0 0;
    color: #949494;
    font-size: 13px;
    line-height: 1.5;
    max-width: 720px;
  }

  .action-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
    gap: 10px;
  }

  .action-card {
    display: flex;
    gap: 12px;
    align-items: flex-start;
    padding: 10px 12px;
    background: #232323;
    border: 1px solid #353535;
    border-radius: 10px;
    color: #D7D7D7;
    text-align: left;
    cursor: pointer;
  }

  .action-card:hover {
    border-color: #5B9BD5;
    background: #272727;
  }

  .action-card strong,
  .google-head strong {
    display: block;
    font-size: 13px;
    color: #F2F2F2;
    margin-bottom: 2px;
  }

  .action-card span,
  .google-card span {
    display: block;
    font-size: 12px;
    color: #9A9A9A;
    line-height: 1.45;
  }

  .google-card {
    cursor: default;
    flex-direction: column;
  }

  .local-card {
    align-items: flex-start;
  }

  .local-card.drag-active {
    border-color: #5B9BD5;
    background: #273240;
  }

  .local-help {
    margin-top: 2px;
    color: #808080 !important;
  }

  .status-text {
    margin-top: 4px;
    color: #9CD3AE !important;
  }

  .google-head {
    display: flex;
    align-items: center;
    gap: 10px;
    flex-shrink: 0;
  }

  .google-top-row {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .google-row {
    display: flex;
    gap: 8px;
    flex: 1;
    min-width: 0;
  }

  .google-input {
    flex: 1;
    min-width: 0;
    height: 34px;
    background: #171717;
    border: 1px solid #353535;
    border-radius: 8px;
    color: #E4E4E4;
    padding: 0 10px;
    font-size: 12px;
    font-family: inherit;
    outline: none;
  }

  .google-input:focus {
    border-color: #5B9BD5;
  }

  .google-add {
    height: 34px;
    padding: 0 14px;
    background: #094771;
    border: 1px solid #0B6EB5;
    border-radius: 8px;
    color: #FFF;
    font-size: 12px;
    font-family: inherit;
    cursor: pointer;
  }

  .google-add:hover {
    background: #0C5C93;
  }

  .google-add:disabled,
  .google-input:disabled {
    opacity: 0.7;
    cursor: default;
  }

  .google-help {
    margin-top: 6px;
    color: #808080 !important;
  }

  .error-text {
    margin-top: 4px;
    color: #E09B83 !important;
  }

  .local-error {
    margin-top: 4px;
  }

  .library-section {
    background: #202020;
    border: 1px solid #313131;
    border-radius: 12px;
    overflow: hidden;
  }

  .library-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 16px 18px;
    border-bottom: 1px solid #303030;
  }

  .library-header span {
    color: #898989;
    font-size: 12px;
  }

  .empty-state {
    padding: 22px 18px;
    color: #A0A0A0;
  }

  .empty-state small {
    display: block;
    margin-top: 6px;
    color: #7D7D7D;
  }

  .font-list {
    display: flex;
    flex-direction: column;
  }

  .font-row {
    display: grid;
    grid-template-columns: minmax(220px, 1fr) minmax(260px, 1.3fr) auto;
    gap: 14px;
    align-items: center;
    justify-content: space-between;
    padding: 12px 18px;
    border-top: 1px solid #2C2C2C;
  }

  .font-row:first-child {
    border-top: none;
  }

  .font-row.disabled {
    opacity: 0.55;
  }

  .font-main {
    min-width: 0;
  }

  .font-meta {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
    min-width: 0;
  }

  .font-details {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
    margin-top: 6px;
  }

  .font-name {
    font-size: 14px;
    font-weight: 600;
    color: #F2F2F2;
  }

  .font-badge,
  .font-file {
    font-size: 11px;
    color: #9A9A9A;
    background: #2A2A2A;
    border: 1px solid #383838;
    border-radius: 999px;
    padding: 2px 8px;
  }

  .font-badge.accent {
    color: #CFE8FF;
    border-color: #2E5F87;
    background: #16344A;
  }

  .font-badge.success {
    color: #D8F7DF;
    border-color: #2F6B43;
    background: #183624;
  }

  .font-badge.danger {
    color: #FFD6D6;
    border-color: #7A3B3B;
    background: #3A1D1D;
  }

  .font-badge.native {
    color: #FFE9C8;
    border-color: #7A6434;
    background: #3B2E14;
  }

  .font-preview {
    font-size: 18px;
    line-height: 1.2;
    color: #E5E5E5;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .font-preview-image {
    display: block;
    width: 100%;
    max-width: 420px;
    height: 38px;
    object-fit: contain;
    object-position: left center;
  }

  .font-preview-group {
    min-width: 0;
    padding-left: 14px;
    border-left: 1px solid #333333;
  }

  .preview-label {
    display: block;
    margin-bottom: 4px;
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: #767676;
  }

  .font-actions {
    display: flex;
    gap: 8px;
    flex-shrink: 0;
  }

  .icon-btn {
    width: 34px;
    height: 34px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: #171717;
    border: 1px solid #363636;
    border-radius: 8px;
    color: #C8C8C8;
    cursor: pointer;
  }

  .icon-btn:hover {
    border-color: #5B9BD5;
    color: #FFF;
  }

  .icon-btn.danger:hover {
    border-color: #C85A5A;
    color: #FFD6D6;
  }

  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
  }

  @media (max-width: 920px) {
    .google-top-row {
      flex-direction: column;
      align-items: stretch;
      gap: 8px;
    }

    .font-row {
      grid-template-columns: 1fr;
    }

    .font-preview-group {
      padding-left: 0;
      border-left: none;
      padding-top: 10px;
      border-top: 1px solid #333333;
    }

    .font-actions {
      justify-content: flex-end;
    }
  }
</style>
