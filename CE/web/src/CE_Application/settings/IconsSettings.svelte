<script>
  import { onDestroy } from 'svelte';
  import ImagePlus from 'lucide-svelte/icons/image-plus';
  import Power from 'lucide-svelte/icons/power';
  import Trash2 from 'lucide-svelte/icons/trash-2';
  import {
    storedIcons,
    importLocalIconFiles,
    addGoogleIcons,
    toggleIconEnabled,
    removeStoredIcon,
  } from '../stores/appSettings.js';
  import {
    GOOGLE_ICON_COLOURS,
    GOOGLE_ICON_STYLES,
    GOOGLE_ICON_SUGGESTIONS,
    GOOGLE_ICON_WEIGHTS,
    GOOGLE_ICONS_PAGE,
    googleIconDescription,
    googleIconKey,
    googleIconUrl,
    normalizeGoogleIconName,
    searchGoogleIconNames,
  } from '../utils/googleIcons.js';

  const GOOGLE_RESULT_LIMIT = 60;

  let fileInput;
  let dragActive = $state(false);
  let importMessage = $state('');
  let importTone = $state('muted');
  let importGeneration = 0;

  onDestroy(() => { importGeneration += 1; });
  onDestroy(() => { googleGeneration += 1; });

  /* --- Google icons ------------------------------------------------------------------------- */
  // The name list is 4,000-odd entries, so it is loaded when this page opens rather than with the
  // app. It is only for searching: addGoogleIcons fetches each icon from Google either way.
  let googleNames = $state(null);
  let googleNamesFailed = $state(false);
  import('../generated/googleIconNames.js')
    .then((module) => { googleNames = module.GOOGLE_ICON_NAMES; })
    .catch(() => { googleNamesFailed = true; });

  let googleQuery = $state('');
  let googleStyle = $state('outlined');
  let googleFill = $state(false);
  let googleWeight = $state(400);
  let googleColour = $state('white');
  let googlePicked = $state([]);
  let googleMessage = $state('');
  let googleTone = $state('muted');
  let isAddingGoogle = $state(false);
  let googleGeneration = 0;

  let googleWanted = $derived(normalizeGoogleIconName(googleQuery));
  let googleResults = $derived(googleWanted
    ? searchGoogleIconNames(googleNames ?? [], googleQuery, GOOGLE_RESULT_LIMIT)
    : [...GOOGLE_ICON_SUGGESTIONS]);
  // A name typed in full that the list does not know — Google may still have it (the list is a
  // snapshot), and the fetch is the real test.
  let googleCanTryTyped = $derived(!!googleWanted && googleNames !== null && !googleResults.includes(googleWanted));
  let googleHave = $derived(new Set(($storedIcons ?? [])
    .filter((icon) => icon.sourceType === 'google' && icon.google)
    .map((icon) => googleIconKey(icon.google))));

  function googleLook(name) {
    return { name, style: googleStyle, fill: googleFill, weight: googleWeight, colour: googleColour };
  }

  function isGoogleAdded(name) {
    return googleHave.has(googleIconKey(googleLook(name)));
  }

  function toggleGooglePick(name) {
    googlePicked = googlePicked.includes(name)
      ? googlePicked.filter((picked) => picked !== name)
      : [...googlePicked, name];
  }

  function describeGoogleResult(result) {
    const parts = [];
    if (result.added.length) parts.push(`Added ${result.added.length} icon(s).`);
    if (result.skipped.length) parts.push(`${result.skipped.length} already in the library in this look.`);
    const missing = result.failed.filter((f) => f.reason === 'not-found' || f.reason === 'invalid');
    if (missing.length) parts.push(`Google has no icon called ${missing.map((f) => `"${f.name}"`).join(', ')}.`);
    if (result.failed.some((f) => f.reason === 'network')) {
      parts.push('Google could not be reached for some icons. Check the internet connection and try again.');
    }
    return parts.join(' ');
  }

  async function addGoogle(names) {
    const wanted = names.filter((name) => !isGoogleAdded(name));
    if (wanted.length === 0) return;
    const generation = ++googleGeneration;
    isAddingGoogle = true;
    googleMessage = '';
    let result;

    try {
      result = await addGoogleIcons(wanted.map(googleLook));
    } catch (error) {
      if (generation !== googleGeneration) return;
      console.error('[icons] Google icon import failed', error);
      isAddingGoogle = false;
      googleTone = 'error';
      googleMessage = 'Google could not be reached. Try again in a moment.';
      return;
    }

    if (generation !== googleGeneration) return;
    isAddingGoogle = false;
    googlePicked = googlePicked.filter((name) => !result.added.includes(name) && !result.skipped.includes(name));
    googleTone = result.ok ? 'success' : 'error';
    googleMessage = describeGoogleResult(result) || 'Nothing was added.';
  }

  async function handleImport(fileList) {
    const generation = ++importGeneration;
    let result;

    try {
      result = await importLocalIconFiles(fileList);
    } catch (error) {
      if (generation !== importGeneration) return;
      importTone = 'error';
      importMessage = error?.message ?? 'The icon import did not complete.';
      return;
    }

    if (generation !== importGeneration) return;

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

  <section class="settings-card google-card" aria-label="Add Google Icons">
    <div class="card-head">
      <h2>Add Google Icons</h2>
      <p>
        Google's free icon set, Material Symbols. Pick icons here and CEditor fetches them from Google
        and keeps them, so the internet is needed only now. To browse them all, visit
        {GOOGLE_ICONS_PAGE.replace('https://', '')}.
      </p>
    </div>

    <div class="google-controls">
      <input
        class="google-search"
        type="search"
        placeholder="Search icons, e.g. play, volume, tune"
        aria-label="Search Google icons"
        bind:value={googleQuery}
        disabled={googleNamesFailed}
      />
      <div class="seg" role="group" aria-label="Style">
        {#each GOOGLE_ICON_STYLES as option (option.id)}
          <button type="button" class:on={googleStyle === option.id} aria-pressed={googleStyle === option.id}
            onclick={() => { googleStyle = option.id; }}>{option.label}</button>
        {/each}
      </div>
      <label class="google-check">
        <input type="checkbox" bind:checked={googleFill} />
        <span>Filled</span>
      </label>
      <label class="google-weight">
        <span>Weight</span>
        <select bind:value={googleWeight}>
          {#each GOOGLE_ICON_WEIGHTS as weight (weight)}
            <option value={weight}>{weight}</option>
          {/each}
        </select>
      </label>
      <div class="seg" role="group" aria-label="Colour">
        {#each GOOGLE_ICON_COLOURS as option (option.id)}
          <button type="button" class:on={googleColour === option.id} aria-pressed={googleColour === option.id}
            onclick={() => { googleColour = option.id; }}>{option.label}</button>
        {/each}
      </div>
    </div>

    <div class="google-hint">
      {#if googleNamesFailed}
        The list of icon names could not be loaded, so searching is not available. Suggestions still work.
      {:else if !googleWanted}
        Suggestions for a synth panel — type to search all {googleNames?.length ?? ''} icons.
      {:else if googleResults.length === 0}
        No icon in the list matches "{googleQuery}".
      {:else if googleResults.length === GOOGLE_RESULT_LIMIT}
        The first {GOOGLE_RESULT_LIMIT} matches. Type more to narrow it down.
      {:else}
        {googleResults.length} match(es).
      {/if}
    </div>

    <div class="google-grid" class:light={googleColour === 'black'}>
      {#each googleResults as name (name)}
        {@const added = isGoogleAdded(name)}
        <button
          type="button"
          class="google-tile"
          class:picked={googlePicked.includes(name)}
          class:added
          aria-pressed={googlePicked.includes(name)}
          disabled={added || isAddingGoogle}
          title={added ? `${name} — already in the library in this look` : name}
          onclick={() => toggleGooglePick(name)}
        >
          <img src={googleIconUrl(googleLook(name))} alt="" loading="lazy" />
          <span class="google-name">{name}</span>
          {#if added}<span class="google-tick" aria-hidden="true">✓</span>{/if}
        </button>
      {/each}
    </div>

    <div class="google-footer">
      {#if googleCanTryTyped}
        <button type="button" class="link-btn" disabled={isAddingGoogle}
          onclick={() => addGoogle([googleWanted])}>Try "{googleWanted}" anyway</button>
      {/if}
      <span class="google-count">{googlePicked.length} selected</span>
      <button class="primary-btn" type="button" disabled={googlePicked.length === 0 || isAddingGoogle}
        onclick={() => addGoogle([...googlePicked])}>
        {isAddingGoogle ? 'Fetching…' : 'Add to library'}
      </button>
    </div>

    {#if googleMessage}
      <div class={`status ${googleTone}`}>{googleMessage}</div>
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
            <div class="icon-preview" class:light={icon.sourceType === 'google' && icon.google?.colour === 'black'}>
              <img src={icon.dataUrl} alt={icon.name} />
            </div>

            <div class="icon-info">
              <div class="icon-title-row">
                <strong>{icon.name}</strong>
                <span class="pill">{icon.sourceType === 'google' ? 'Google' : 'Local'}</span>
                <span class="pill">{icon.isVector ? 'Vector' : 'Raster'}</span>
                {#if icon.width && icon.height}
                  <span class="pill">{icon.width} x {icon.height}</span>
                {/if}
              </div>
              <div class="icon-meta">{icon.sourceType === 'google' && icon.google ? googleIconDescription(icon.google) : icon.fileName}</div>
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

  .icon-preview.light {
    background: #E4E4E4;
    border-color: #BDBDBD;
  }

  .google-controls {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
    padding: 12px 14px 6px;
  }

  .google-search {
    flex: 1 1 220px;
    min-width: 160px;
    height: 30px;
    border-radius: 8px;
    border: 1px solid #3A3A3A;
    background: #1B1B1B;
    color: #EEE;
    padding: 0 10px;
    font: inherit;
    font-size: 12px;
  }

  .seg {
    display: inline-flex;
    border: 1px solid #3A3A3A;
    border-radius: 8px;
    overflow: hidden;
  }

  .seg button {
    height: 28px;
    padding: 0 10px;
    border: none;
    background: #202020;
    color: #B0B0B0;
    font: inherit;
    font-size: 11px;
    cursor: pointer;
  }

  .seg button + button {
    border-left: 1px solid #3A3A3A;
  }

  .seg button.on {
    background: #094771;
    color: #FFF;
  }

  .google-check,
  .google-weight {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-size: 11px;
    color: #B0B0B0;
  }

  .google-weight select {
    height: 28px;
    border-radius: 6px;
    border: 1px solid #3A3A3A;
    background: #1B1B1B;
    color: #EEE;
    font: inherit;
    font-size: 11px;
  }

  .google-hint {
    padding: 4px 14px 8px;
    font-size: 11px;
    color: #8A8A8A;
  }

  .google-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(92px, 1fr));
    gap: 6px;
    max-height: 320px;
    overflow-y: auto;
    padding: 0 14px 10px;
  }

  .google-tile {
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
    padding: 10px 6px 8px;
    border-radius: 8px;
    border: 1px solid #333;
    background: #1D1D1D;
    color: #B9B9B9;
    font: inherit;
    cursor: pointer;
  }

  .google-grid.light .google-tile {
    background: #E4E4E4;
    border-color: #BDBDBD;
    color: #333;
  }

  .google-tile img {
    width: 28px;
    height: 28px;
    /* Google's files are black; the preview shows the colour they will be stored in. */
    filter: invert(1);
  }

  .google-grid.light .google-tile img {
    filter: none;
  }

  .google-tile:hover:not(:disabled) {
    border-color: #5B9BD5;
  }

  .google-tile.picked {
    border-color: #0B6EB5;
    box-shadow: 0 0 0 1px #0B6EB5;
  }

  .google-tile.added {
    opacity: 0.5;
    cursor: default;
  }

  .google-name {
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 10px;
  }

  .google-tick {
    position: absolute;
    top: 4px;
    right: 6px;
    font-size: 11px;
    color: #7FD18C;
  }

  .google-footer {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 10px;
    padding: 4px 14px 12px;
  }

  .google-count {
    font-size: 11px;
    color: #8A8A8A;
  }

  .link-btn {
    margin-right: auto;
    border: none;
    background: none;
    color: #6FB2E8;
    font: inherit;
    font-size: 11px;
    cursor: pointer;
    padding: 0;
  }

  .primary-btn:disabled {
    opacity: 0.45;
    cursor: default;
    filter: none;
  }

  .icon-btn.danger:hover {
    border-color: #C45F5F;
    color: #FFD7D7;
  }
</style>
