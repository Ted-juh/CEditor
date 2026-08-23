<script>
  import { getSection, applyControlPatch } from '../stores/controls.js';
  import PropertyCell from '../properties/PropertyCell.svelte';
  import PropertySection from '../properties/PropertySection.svelte';
  import { creatorMode } from '../stores/creatorMode.js';
  import { customComponentLibrary } from '../stores/customComponentLibrary.js';
  import {
    createCustomComponentLibraryEnvelope,
    createCustomComponentExportEnvelope,
    normalizeCustomComponentLibraryEnvelope,
    fingerprintCustomComponent,
    normalizeCustomComponentEnvelope,
    customComponentPackageProvenance,
    summarizeCustomComponent,
    validateCustomComponentPackage,
  } from '../utils/customComponentPackage.js';
  import { deepClone } from '../utils/deepClone.js';

  let { control = null } = $props();

  let core = $derived(getSection(control, 'Core'));
  let designer = $derived(getSection(control, 'Designer'));
  let packageSummary = $derived(control ? summarizeCustomComponent(control) : {});
  let packageFingerprint = $derived(control ? fingerprintCustomComponent(control) : '');
  let packageSummaryItems = $derived([
    ['Parts', packageSummary.parts ?? 0],
    ['Runtime', (packageSummary.generatedParts ?? 0) + (packageSummary.generatedHitZones ?? 0)],
    ['Values', packageSummary.valueChannels ?? 0],
    ['Zones', packageSummary.hitZones ?? 0],
    ['Gen', packageSummary.generators ?? 0],
    ['Links', packageSummary.links ?? 0],
    ['Images', packageSummary.images ?? 0],
    ['Strips', packageSummary.filmstrips ?? 0],
    ['Variants', packageSummary.variants ?? 0],
    ['API', (packageSummary.publicInputs ?? 0) + (packageSummary.publicOutputs ?? 0)],
    ['Props', packageSummary.editableProperties ?? 0],
  ]);
  let libraryEntries = $derived($customComponentLibrary ?? []);
  let selectedLibraryId = $state('');
  let selectedLibraryEntry = $derived(libraryEntries.find((entry) => entry.id === selectedLibraryId) ?? null);
  let librarySearch = $state('');
  let libraryValidity = $state('all');
  let libraryKind = $state('all');
  let librarySort = $state('saved');
  let libraryRenameName = $state('');
  let libraryRenameVersion = $state('');
  let packageName = $state('');
  let packageVersion = $state('1.0.0');
  let packageAuthor = $state('');
  let packageDescription = $state('');
  let packageCategory = $state('custom');
  let packageLicense = $state('');
  let packageHomepage = $state('');
  let packageTags = $state('custom-component');
  let packageText = $state('');
  let importText = $state('');
  let importPreview = $derived(parseImportPreview(importText));
  let importSummaryItems = $derived(summaryItems(importPreview.envelope?.summary));
  let importIssueList = $derived([
    ...(importPreview.envelope?.validation?.issues ?? []),
    ...(importPreview.envelope?.validation?.warnings ?? []).map((warning) => `Warning: ${warning}`),
  ]);
  let libraryStatus = $state('');
  let packageValidation = $derived(control ? validateCustomComponentPackage(control) : { ok: false, issues: [], warnings: [] });
  let packageIssueList = $derived([
    ...(packageValidation?.issues ?? []).map((message) => ({ severity: 'issue', message })),
    ...(packageValidation?.warnings ?? []).map((message) => ({ severity: 'warning', message })),
  ]);
  let filteredLibraryEntries = $derived(filterLibraryEntries(libraryEntries, librarySearch, libraryValidity, libraryKind, librarySort));
  let selectedLibrarySummaryItems = $derived(summaryItems(selectedLibraryEntry?.summary));
  let selectedLibrarySurfaceItems = $derived(publicSurfaceItems(selectedLibraryEntry?.publicApiSummary ?? selectedLibraryEntry?.publicApi));
  let selectedLibraryAssetItems = $derived(assetManifestItems(selectedLibraryEntry?.assetManifest));
  let selectedLibraryIssueList = $derived([
    ...(selectedLibraryEntry?.validation?.issues ?? []),
    ...(selectedLibraryEntry?.validation?.warnings ?? []).map((warning) => `Warning: ${warning}`),
  ]);
  let currentSourcePackage = $derived(designer?.sourcePackage ?? null);
  let currentPackageMatchesSource = $derived(!!currentSourcePackage?.fingerprint && currentSourcePackage.fingerprint === packageFingerprint);
  let importSurfaceItems = $derived(publicSurfaceItems(importPreview.envelope?.publicApiSummary ?? importPreview.envelope?.publicApi));
  let importAssetItems = $derived(assetManifestItems(importPreview.envelope?.assetManifest));
  const LIBRARY_KIND_OPTIONS = [
    { id: 'all', label: 'all' },
    { id: 'custom', label: 'custom' },
    { id: 'button', label: 'button' },
    { id: 'slider', label: 'slider' },
    { id: 'multi', label: 'multi' },
    { id: 'grid', label: 'grid' },
    { id: 'piano', label: 'piano' },
    { id: 'filmstrip', label: 'filmstrip' },
    { id: 'linked', label: 'linked' },
  ];

  const PACKAGE_CATEGORIES = [
    'custom',
    'button',
    'slider',
    'multi-control',
    'grid',
    'keyboard',
    'meter',
    'display',
    'utility',
    'experimental',
  ];

  $effect(() => {
    if (!packageName && core?.name) packageName = core.name;
  });

  $effect(() => {
    if (!packageDescription && designer?.notes) packageDescription = designer.notes;
  });

  $effect(() => {
    if (selectedLibraryEntry) {
      libraryRenameName = selectedLibraryEntry.name ?? '';
      libraryRenameVersion = selectedLibraryEntry.version ?? '1.0.0';
    }
  });

  $effect(() => {
    if (selectedLibraryId && !libraryEntries.some((entry) => entry.id === selectedLibraryId)) {
      selectedLibraryId = '';
    }
  });

  function summaryItems(summary = {}) {
    return [
      ['Parts', summary.parts ?? 0],
      ['Runtime', (summary.generatedParts ?? 0) + (summary.generatedHitZones ?? 0)],
      ['Values', summary.valueChannels ?? 0],
      ['Zones', summary.hitZones ?? 0],
      ['Gen', summary.generators ?? 0],
      ['Links', summary.links ?? 0],
      ['Images', summary.images ?? 0],
      ['Strips', summary.filmstrips ?? 0],
      ['API', (summary.publicInputs ?? 0) + (summary.publicOutputs ?? 0)],
      ['Props', summary.editableProperties ?? 0],
    ];
  }

  function entryRangeLabel(entry) {
    const hasMin = entry?.min !== undefined && entry?.min !== '';
    const hasMax = entry?.max !== undefined && entry?.max !== '';
    if (Array.isArray(entry?.values) && entry.values.length) return entry.values.slice(0, 4).join(', ');
    if (hasMin || hasMax) return `${hasMin ? entry.min : '...'}-${hasMax ? entry.max : '...'}`;
    if (entry?.defaultValue !== undefined && entry.defaultValue !== '') return `default ${entry.defaultValue}`;
    return '';
  }

  function publicSurfaceItems(api = {}) {
    if (api?.counts) {
      return [
        ...(api.inputs ?? []).map((entry) => ({ kind: 'input', label: entry.label || entry.name, target: entry.channel || '', type: entry.type ?? '', meta: entryRangeLabel(entry) })),
        ...(api.outputs ?? []).map((entry) => ({ kind: 'output', label: entry.label || entry.name, target: entry.channel || '', type: entry.type ?? '', meta: entryRangeLabel(entry) })),
        ...(api.properties ?? []).map((entry) => ({ kind: 'property', label: entry.label || entry.name, target: entry.path || '', type: entry.type ?? '', meta: entryRangeLabel(entry) })),
      ];
    }
    const inputItems = Object.entries(api?.inputs ?? {})
      .filter(([, entry]) => entry?.enabled !== false)
      .map(([name, entry]) => ({ kind: 'input', label: entry?.label || name, target: entry?.channel || '', type: entry?.type ?? '', meta: entryRangeLabel(entry) }));
    const outputItems = Object.entries(api?.outputs ?? {})
      .filter(([, entry]) => entry?.enabled !== false)
      .map(([name, entry]) => ({ kind: 'output', label: entry?.label || name, target: entry?.channel || '', type: entry?.type ?? '', meta: entryRangeLabel(entry) }));
    const propertyItems = Object.entries(api?.editableProperties ?? {})
      .filter(([, entry]) => entry?.enabled !== false)
      .map(([name, entry]) => ({ kind: 'property', label: entry?.label || name, target: entry?.path || '', type: entry?.type ?? '', meta: entryRangeLabel(entry) }));
    return [...inputItems, ...outputItems, ...propertyItems];
  }

  function formatBytes(value) {
    const bytes = Number(value);
    if (!Number.isFinite(bytes) || bytes <= 0) return '';
    if (bytes < 1024) return `${Math.round(bytes)} B`;
    if (bytes < 1024 * 1024) return `${Math.round(bytes / 102.4) / 10} KB`;
    return `${Math.round(bytes / 104857.6) / 10} MB`;
  }

  function assetManifestItems(manifest = {}) {
    const images = (manifest?.images ?? []).map((asset) => ({
      kind: 'image',
      label: asset.name || asset.sourceFileName || 'image',
      target: asset.sourceFileName || asset.mimeType || '',
      type: asset.mimeType || 'image',
      meta: [
        asset.width && asset.height ? `${asset.width}x${asset.height}` : '',
        formatBytes(asset.bytes),
      ].filter(Boolean).join(' · '),
    }));
    const filmstrips = (manifest?.filmstrips ?? []).map((asset) => ({
      kind: 'filmstrip',
      label: asset.name || asset.sourceFileName || 'filmstrip',
      target: asset.valueSource || asset.sourceFileName || '',
      type: asset.orientation || 'filmstrip',
      meta: [
        asset.frameCount ? `${asset.frameCount} frames` : '',
        asset.frameWidth && asset.frameHeight ? `${asset.frameWidth}x${asset.frameHeight}` : '',
        formatBytes(asset.bytes),
      ].filter(Boolean).join(' · '),
    }));
    return [...images, ...filmstrips];
  }

  function capabilityLabels(entry) {
    return entry?.capabilities?.labels ?? [];
  }

  function filterLibraryEntries(entries, query, validity, kind, sort) {
    const term = String(query ?? '').trim().toLowerCase();
    const filtered = entries.filter((entry) => {
      if (validity === 'valid' && entry.validation?.ok === false) return false;
      if (validity === 'issues' && entry.validation?.ok !== false) return false;
      if (kind !== 'all' && entry.capabilities?.primaryKind !== kind && !capabilityLabels(entry).includes(kind)) return false;
      if (!term) return true;
      return [
        entry.name,
        entry.version,
        entry.author,
        entry.description,
        entry.category,
        entry.license,
        entry.homepage,
        entry.id,
        entry.fingerprint,
        entry.capabilities?.primaryKind,
        ...(entry.tags ?? []),
        ...capabilityLabels(entry),
        ...(entry.assetManifest?.images ?? []).flatMap((asset) => [asset.name, asset.mimeType, asset.sourceFileName]),
        ...(entry.assetManifest?.filmstrips ?? []).flatMap((asset) => [asset.name, asset.mimeType, asset.sourceFileName, asset.valueSource, asset.orientation]),
        ...publicSurfaceItems(entry.publicApiSummary ?? entry.publicApi).flatMap((item) => [item.kind, item.label, item.target, item.type, item.meta]),
      ].some((value) => String(value ?? '').toLowerCase().includes(term));
    });
    return [...filtered].sort((a, b) => {
      if (sort === 'name') return String(a.name ?? '').localeCompare(String(b.name ?? ''));
      if (sort === 'validity') return Number(a.validation?.ok === false) - Number(b.validation?.ok === false)
        || String(a.name ?? '').localeCompare(String(b.name ?? ''));
      return new Date(b.savedAt ?? 0).getTime() - new Date(a.savedAt ?? 0).getTime();
    });
  }

  function formatSavedAt(value) {
    if (!value) return 'not saved';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return 'not saved';
    return date.toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' });
  }

  function thumbnailPartStyle(part) {
    const kind = String(part?.kind ?? '').toLowerCase();
    const isRoundOutline = kind.includes('ring') || kind.includes('arc');
    const radius = kind.includes('circle') || isRoundOutline
      ? 999
      : (part?.radius ?? 3);
    const background = isRoundOutline
      ? 'transparent'
      : (part?.colour ?? '#5B9BD5');
    const border = isRoundOutline
      ? `2px solid ${part?.colour ?? '#5B9BD5'}`
      : '1px solid rgba(255,255,255,0.18)';
    return [
      `left:${part?.x ?? 0}%`,
      `top:${part?.y ?? 0}%`,
      `width:${Math.max(1, part?.width ?? 10)}%`,
      `height:${Math.max(1, part?.height ?? 10)}%`,
      `background:${background}`,
      `border:${border}`,
      `border-radius:${radius}px`,
      `transform:rotate(${part?.rotation ?? 0}deg)`,
    ].join(';');
  }

  function parseImportPreview(text) {
    const trimmed = String(text ?? '').trim();
    if (!trimmed) return { state: 'empty', envelope: null, envelopes: [], rejected: 0, error: '' };
    try {
      const parsed = JSON.parse(trimmed);
      const libraryEnvelope = normalizeCustomComponentLibraryEnvelope(parsed);
      const envelopes = libraryEnvelope?.packages ?? [normalizeCustomComponentEnvelope(parsed)].filter(Boolean);
      if (!envelopes.length) {
        return { state: 'invalid', envelope: null, envelopes: [], rejected: 0, error: 'No ceditor-component packages found.' };
      }
      return {
        state: 'ready',
        envelope: envelopes[0],
        envelopes,
        rejected: libraryEnvelope?.rejected ?? 0,
        error: '',
      };
    } catch (error) {
      return { state: 'invalid', envelope: null, envelopes: [], rejected: 0, error: error?.message ?? 'JSON parse failed.' };
    }
  }

  function focusPackageIssue(item) {
    // The assistant tray this used to jump to dissolved with the Designer
    // tab — surfacing the message in the status line is the remaining value.
    libraryStatus = String(item?.message ?? item ?? '');
  }

  function saveToLibrary() {
    if (!control) return;
    const entry = customComponentLibrary.saveControl(control, packageMetadata());
    if (entry?.id) selectedLibraryId = entry.id;
    libraryStatus = entry?.validation?.ok === false ? 'Saved with issues' : 'Saved';
  }

  function packageMetadata() {
    return {
      name: packageName || core?.name || 'Custom Component',
      version: packageVersion || '1.0.0',
      author: packageAuthor,
      description: packageDescription || (designer?.notes ?? ''),
      category: packageCategory,
      license: packageLicense,
      homepage: packageHomepage,
      tags: packageTags,
    };
  }

  function safeFileName(value, fallback = 'custom-component') {
    const name = String(value ?? '').trim().toLowerCase()
      .replace(/[^a-z0-9._-]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 80);
    return name || fallback;
  }

  function downloadJson(value, filename) {
    const text = typeof value === 'string' ? value : JSON.stringify(value, null, 2);
    const blob = new Blob([text], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    packageText = text;
  }

  async function copyPackageJson() {
    if (!control) return;
    const envelope = createCustomComponentExportEnvelope(control, packageMetadata());
    const text = JSON.stringify(envelope, null, 2);
    packageText = text;
    try {
      await navigator?.clipboard?.writeText?.(text);
      libraryStatus = 'Package JSON copied';
    } catch {
      libraryStatus = 'Package JSON ready';
    }
  }

  function downloadPackageJson() {
    if (!control) return;
    const envelope = createCustomComponentExportEnvelope(control, packageMetadata());
    const filename = `${safeFileName(envelope.metadata?.name)}-${safeFileName(envelope.metadata?.version, '1.0.0')}.ceditor-component.json`;
    downloadJson(envelope, filename);
    libraryStatus = 'Package JSON downloaded';
  }

  async function copyLibraryJson() {
    const bundle = createCustomComponentLibraryEnvelope(libraryEntries);
    const text = JSON.stringify(bundle, null, 2);
    packageText = text;
    try {
      await navigator?.clipboard?.writeText?.(text);
      libraryStatus = `Library JSON copied (${bundle.packageCount})`;
    } catch {
      libraryStatus = `Library JSON ready (${bundle.packageCount})`;
    }
  }

  function downloadLibraryJson() {
    const bundle = createCustomComponentLibraryEnvelope(libraryEntries);
    const filename = `ceditor-component-library-${new Date().toISOString().slice(0, 10)}.json`;
    downloadJson(bundle, filename);
    libraryStatus = `Library JSON downloaded (${bundle.packageCount})`;
  }

  function applyLibraryEntryToCurrent(entry) {
    if (!core?.id || !entry?.component?._children) return false;
    const patch = {};
    const provenance = customComponentPackageProvenance(entry.envelope ?? entry);
    for (const [sectionName, sectionValue] of Object.entries(entry.component._children)) {
      if (sectionName === 'Transform') continue;
      if (sectionName === 'Core') {
        patch.Core = { ...deepClone(sectionValue), id: core.id };
      } else if (sectionName === 'Designer') {
        patch.Designer = {
          ...deepClone(sectionValue),
          sourcePackage: provenance,
          packageName: provenance?.name ?? entry.name ?? '',
          packageVersion: provenance?.version ?? entry.version ?? '1.0.0',
          packageId: provenance?.id ?? entry.id ?? '',
          packageFingerprint: provenance?.fingerprint ?? entry.fingerprint ?? '',
          packageImportedAt: provenance?.importedAt ?? new Date().toISOString(),
        };
      } else {
        patch[sectionName] = deepClone(sectionValue);
      }
    }
    applyControlPatch(core.id, patch);
    return true;
  }

  function importPackageJson({ load = false } = {}) {
    const envelopes = importPreview.envelopes?.length ? importPreview.envelopes : (importPreview.envelope ? [importPreview.envelope] : []);
    if (!envelopes.length) {
      libraryStatus = importPreview.error || 'Import rejected';
      return;
    }
    let entry = null;
    for (const envelope of envelopes) {
      entry = customComponentLibrary.importEnvelope(envelope) ?? entry;
    }
    if (entry?.id) selectedLibraryId = entry.id;
    if (load && envelopes.length === 1 && applyLibraryEntryToCurrent(entry)) {
      libraryStatus = entry?.validation?.ok === false ? 'Imported and loaded with issues' : 'Imported and loaded';
    } else {
      const issueCount = envelopes.filter((envelope) => envelope.validation?.ok === false).length;
      const suffix = importPreview.rejected ? `, ${importPreview.rejected} rejected` : '';
      libraryStatus = issueCount
        ? `Imported ${envelopes.length} with ${issueCount} issue${issueCount === 1 ? '' : 's'}${suffix}`
        : `Imported ${envelopes.length}${suffix}`;
    }
    importText = '';
  }

  function removeFromLibrary() {
    if (!selectedLibraryId) return;
    customComponentLibrary.remove(selectedLibraryId);
    selectedLibraryId = '';
    libraryStatus = 'Removed';
  }

  function renameLibraryEntry() {
    if (!selectedLibraryId || !libraryRenameName.trim()) return;
    const entry = customComponentLibrary.updateMetadata(selectedLibraryId, {
      name: libraryRenameName.trim(),
      version: libraryRenameVersion.trim() || '1.0.0',
    });
    if (entry?.id) selectedLibraryId = entry.id;
    libraryStatus = entry ? 'Library metadata updated' : 'Rename failed';
  }

  function duplicateLibraryEntry() {
    if (!selectedLibraryId) return;
    const entry = customComponentLibrary.duplicate(selectedLibraryId);
    if (entry?.id) selectedLibraryId = entry.id;
    libraryStatus = entry ? 'Duplicated as copy' : 'Duplicate failed';
  }

  function loadFromLibrary() {
    if (!core?.id || !selectedLibraryId) return;
    const entry = libraryEntries.find((item) => item.id === selectedLibraryId);
    libraryStatus = applyLibraryEntryToCurrent(entry) ? 'Loaded package' : 'Load failed';
  }

  async function copySelectedPackageJson() {
    if (!selectedLibraryEntry?.envelope) return;
    const text = JSON.stringify(selectedLibraryEntry.envelope, null, 2);
    packageText = text;
    try {
      await navigator?.clipboard?.writeText?.(text);
      libraryStatus = 'Selected package copied';
    } catch {
      libraryStatus = 'Selected package JSON ready';
    }
  }

  function downloadSelectedPackageJson() {
    if (!selectedLibraryEntry?.envelope) return;
    const name = safeFileName(selectedLibraryEntry.name);
    const version = safeFileName(selectedLibraryEntry.version, '1.0.0');
    downloadJson(selectedLibraryEntry.envelope, `${name}-${version}.ceditor-component.json`);
    libraryStatus = 'Selected package downloaded';
  }

  async function importPackageFile(event) {
    const file = event?.target?.files?.[0];
    if (!file) return;
    try {
      importText = await file.text();
      libraryStatus = `Loaded file ${file.name}`;
    } catch (error) {
      libraryStatus = error?.message ?? 'File import failed';
    } finally {
      if (event?.target) event.target.value = '';
    }
  }
</script>

{#if designer}
  <PropertySection title="Library">
    {#if $creatorMode === 'advanced' && currentSourcePackage}
      <PropertyCell label="Source" span={4} hint="Package provenance kept when this component was inserted or loaded from a reusable package.">
        <div class="source-package" class:changed={!currentPackageMatchesSource}>
          <strong>{currentSourcePackage.name} {currentSourcePackage.version}</strong>
          <span>{currentSourcePackage.category || 'custom'} · {currentSourcePackage.capabilities?.primaryKind ?? 'custom'} · readiness {currentSourcePackage.readiness?.score ?? 0}%</span>
          <em>{currentPackageMatchesSource ? 'unchanged from source package' : 'edited since package load'}</em>
          <small>{currentSourcePackage.fingerprint}</small>
        </div>
      </PropertyCell>
    {/if}
    <PropertyCell label="Local Saves" span={1} hint="Custom component snapshots saved in the local user library.">
      <div class="metric">{libraryEntries.length}</div>
    </PropertyCell>
    <PropertyCell label="Status" span={3} hint="Package validation and library action result.">
      <div class="package-status" class:ok={packageValidation.ok}>
        <strong>{packageValidation.ok ? 'Package ready' : `${packageValidation.issues.length} issue${packageValidation.issues.length === 1 ? '' : 's'}`}</strong>
        <span>{libraryStatus || (packageValidation.warnings.length ? `${packageValidation.warnings.length} warning${packageValidation.warnings.length === 1 ? '' : 's'}` : 'No warnings')}</span>
        <em>{packageFingerprint}</em>
      </div>
    </PropertyCell>
    {#if $creatorMode === 'advanced' && packageIssueList.length}
      <PropertyCell label="Validation" span={4} hint="Current package issues and warnings before save, export, or upload.">
        <div class="package-issues">
          {#each packageIssueList.slice(0, 6) as item}
            <button class={item.severity} type="button" onclick={() => focusPackageIssue(item)}>
              <strong>{item.severity}</strong>
              <span>{item.message}</span>
            </button>
          {/each}
          {#if packageIssueList.length > 6}
            <em>{packageIssueList.length - 6} more validation item{packageIssueList.length - 6 === 1 ? '' : 's'}</em>
          {/if}
        </div>
      </PropertyCell>
    {/if}
    {#if $creatorMode === 'advanced'}
    <PropertyCell label="Manifest" span={4} hint="What will be saved into the reusable custom component package.">
      <div class="manifest-grid">
        {#each packageSummaryItems as [label, value]}
          <span><strong>{value}</strong><em>{label}</em></span>
        {/each}
      </div>
    </PropertyCell>
    {/if}
    <PropertyCell label="Name" span={2} hint="Package display name used in the local and shared component library.">
      <input class="val" type="text" bind:value={packageName} placeholder={core?.name ?? 'Custom Component'} />
    </PropertyCell>
    <PropertyCell label="Version" span={1} hint="Package version. Saving the same name/version replaces the previous local package.">
      <input class="val" type="text" bind:value={packageVersion} />
    </PropertyCell>
    {#if $creatorMode === 'advanced'}
    <PropertyCell label="Author" span={1} hint="Optional author name for shared libraries.">
      <input class="val" type="text" bind:value={packageAuthor} />
    </PropertyCell>
    <PropertyCell label="Category" span={1} hint="Marketplace-style category used when browsing shared packages.">
      <select class="val" bind:value={packageCategory}>
        {#each PACKAGE_CATEGORIES as category}
          <option value={category}>{category}</option>
        {/each}
      </select>
    </PropertyCell>
    <PropertyCell label="License" span={1} hint="Optional license for packages you plan to share.">
      <input class="val" type="text" bind:value={packageLicense} placeholder="personal / MIT / CC0" />
    </PropertyCell>
    <PropertyCell label="Homepage" span={2} hint="Optional source, documentation, or future database URL.">
      <input class="val" type="text" bind:value={packageHomepage} placeholder="https://..." />
    </PropertyCell>
    <PropertyCell label="Tags" span={2} hint="Comma-separated package tags.">
      <input class="val" type="text" bind:value={packageTags} />
    </PropertyCell>
    <PropertyCell label="Description" span={4} hint="Short package description shown in local and shared libraries.">
      <textarea class="val package-text" rows="2" bind:value={packageDescription} placeholder="what this component is useful for"></textarea>
    </PropertyCell>
    {/if}
    <PropertyCell label="Save" span={2} hint="Save or replace this custom component definition in the local component library.">
      <button class="library-btn" type="button" onclick={saveToLibrary}>Save local package</button>
    </PropertyCell>
    {#if $creatorMode === 'advanced'}
    <PropertyCell label="Export" span={1} hint="Create portable JSON for upload/download later.">
      <button class="library-btn" type="button" onclick={copyPackageJson}>Package JSON</button>
    </PropertyCell>
    <PropertyCell label="Export All" span={1} hint="Create a portable bundle containing every saved local custom component package.">
      <button class="library-btn" type="button" onclick={copyLibraryJson}>Library JSON</button>
    </PropertyCell>
    <PropertyCell label="Download" span={1} hint="Download this custom component package as a portable JSON file.">
      <button class="library-btn" type="button" onclick={downloadPackageJson}>Package file</button>
    </PropertyCell>
    <PropertyCell label="Download All" span={1} hint="Download the complete local custom component library as one portable JSON file.">
      <button class="library-btn" type="button" onclick={downloadLibraryJson} disabled={!libraryEntries.length}>Library file</button>
    </PropertyCell>
    {/if}
    <PropertyCell label="Find" span={1} hint="Search saved package names, tags, authors, IDs, capabilities, and fingerprints.">
      <input class="val" type="text" bind:value={librarySearch} placeholder="search library" />
    </PropertyCell>
    <PropertyCell label="Show" span={1} hint="Filter packages by validation status.">
      <select class="val" bind:value={libraryValidity}>
        <option value="all">all</option>
        <option value="valid">valid</option>
        <option value="issues">issues</option>
      </select>
    </PropertyCell>
    <PropertyCell label="Kind" span={1} hint="Filter by inferred package capability.">
      <select class="val" bind:value={libraryKind}>
        {#each LIBRARY_KIND_OPTIONS as option}
          <option value={option.id}>{option.label}</option>
        {/each}
      </select>
    </PropertyCell>
    <PropertyCell label="Sort" span={1} hint="Sort the local component library.">
      <select class="val" bind:value={librarySort}>
        <option value="saved">latest</option>
        <option value="name">name</option>
        <option value="validity">validity</option>
      </select>
    </PropertyCell>
    <PropertyCell label="Browser" span={4} hint="Saved reusable components. Select one to inspect, copy, load, or remove.">
      <div class="library-browser">
        {#each filteredLibraryEntries as entry (entry.id)}
          <button
            class="library-card"
            class:active={selectedLibraryId === entry.id}
            class:invalid={entry.validation?.ok === false}
            type="button"
            onclick={() => selectedLibraryId = entry.id}
          >
            <span class="library-card-head">
              <strong>{entry.name}</strong>
              <em>{entry.version ?? '1.0.0'}</em>
            </span>
            <span class="library-thumb" style={`aspect-ratio:${entry.thumbnail?.aspectRatio ?? 2}`}>
              {#each (entry.thumbnail?.parts ?? []).slice(0, 14) as part}
                <i class:text={!!part.text} style={thumbnailPartStyle(part)}>{part.text}</i>
              {/each}
            </span>
            <span class="library-card-meta">{entry.author || 'unknown author'} · {entry.category || 'custom'} · {formatSavedAt(entry.savedAt)}</span>
            <span class="library-card-tags">
              {#each capabilityLabels(entry).slice(0, 4) as label}
                <em class="capability">{label}</em>
              {/each}
              {#each (entry.tags ?? []).slice(0, 4) as tag}
                <em>{tag}</em>
              {/each}
              {#if (entry.tags ?? []).length === 0}<em>untagged</em>{/if}
            </span>
            <span class="library-card-metrics">
              <em>{entry.summary?.parts ?? 0} parts</em>
              <em>{entry.summary?.valueChannels ?? 0} values</em>
              <em>{entry.summary?.hitZones ?? 0} zones</em>
              <em>{(entry.summary?.publicInputs ?? 0) + (entry.summary?.publicOutputs ?? 0)} api</em>
              <em>{entry.summary?.editableProperties ?? 0} props</em>
              <em>{(entry.summary?.generatedParts ?? 0) + (entry.summary?.generatedHitZones ?? 0)} runtime</em>
              <em>{entry.readiness?.score ?? 0}% ready</em>
            </span>
            <span class="library-card-foot">
              <em>{entry.validation?.ok === false ? `${entry.validation.issues.length} issue${entry.validation.issues.length === 1 ? '' : 's'}` : 'valid'}</em>
              <small>{entry.fingerprint ?? ''}</small>
            </span>
          </button>
        {/each}
        {#if filteredLibraryEntries.length === 0}
          <div class="library-empty">
            <strong>No packages found</strong>
            <span>Save this component or adjust the library filter.</span>
          </div>
        {/if}
      </div>
    </PropertyCell>
    {#if selectedLibraryEntry}
      <PropertyCell label="Selected" span={4} hint="Selected local package manifest, validation, and editable library metadata.">
        <div class="library-detail">
          <div class="library-detail-main">
            <div class="library-summary">
              <strong>{selectedLibraryEntry.name} {selectedLibraryEntry.version}</strong>
              <span>{selectedLibraryEntry.author || 'unknown author'} · {(selectedLibraryEntry.tags ?? []).join(', ') || 'untagged'}</span>
              <span>{selectedLibraryEntry.category || 'custom'} · {selectedLibraryEntry.license || 'no license'}{selectedLibraryEntry.homepage ? ` · ${selectedLibraryEntry.homepage}` : ''}</span>
              {#if selectedLibraryEntry.description}<span>{selectedLibraryEntry.description}</span>{/if}
              <span>{selectedLibraryEntry.capabilities?.primaryKind ?? 'custom'} · {capabilityLabels(selectedLibraryEntry).join(', ') || 'custom'}</span>
              <em>{selectedLibraryEntry.validation?.ok === false ? `${selectedLibraryEntry.validation.issues.length} issue(s)` : 'valid package'}</em>
              <small>{selectedLibraryEntry.fingerprint ?? ''}</small>
            </div>
            <div class="library-thumb large" style={`aspect-ratio:${selectedLibraryEntry.thumbnail?.aspectRatio ?? 2}`}>
              {#each (selectedLibraryEntry.thumbnail?.parts ?? []).slice(0, 18) as part}
                <i class:text={!!part.text} style={thumbnailPartStyle(part)}>{part.text}</i>
              {/each}
            </div>
            <div class="manifest-grid compact">
              {#each selectedLibrarySummaryItems as [label, value]}
                <span><strong>{value}</strong><em>{label}</em></span>
              {/each}
            </div>
          </div>
          {#if selectedLibrarySurfaceItems.length}
            <div class="public-surface">
              {#each selectedLibrarySurfaceItems.slice(0, 12) as item}
                <span class={item.kind}>
                  <strong>{item.kind}</strong>
                  <em>{item.label}</em>
                  {#if item.target || item.type || item.meta}<small>{[item.type, item.meta, item.target].filter(Boolean).join(' · ')}</small>{/if}
                </span>
              {/each}
              {#if selectedLibrarySurfaceItems.length > 12}
                <span class="more"><strong>more</strong><em>{selectedLibrarySurfaceItems.length - 12}</em></span>
              {/if}
            </div>
          {/if}
          {#if selectedLibraryAssetItems.length}
            <div class="asset-surface">
              {#each selectedLibraryAssetItems.slice(0, 10) as item}
                <span class={item.kind}>
                  <strong>{item.kind}</strong>
                  <em>{item.label}</em>
                  {#if item.target || item.type || item.meta}<small>{[item.type, item.meta, item.target].filter(Boolean).join(' · ')}</small>{/if}
                </span>
              {/each}
              {#if selectedLibraryAssetItems.length > 10}
                <span class="more"><strong>more</strong><em>{selectedLibraryAssetItems.length - 10}</em></span>
              {/if}
            </div>
          {/if}
          <div class="library-detail-edit">
            <input class="val" type="text" bind:value={libraryRenameName} />
            <input class="val" type="text" bind:value={libraryRenameVersion} />
            <button class="library-btn" type="button" onclick={renameLibraryEntry}>Rename</button>
            <button class="library-btn" type="button" onclick={duplicateLibraryEntry}>Duplicate</button>
          </div>
          {#if selectedLibraryIssueList.length}
            <div class="library-issues">
              {#each selectedLibraryIssueList.slice(0, 5) as issue}
                <span>{issue}</span>
              {/each}
            </div>
          {/if}
        </div>
      </PropertyCell>
      <PropertyCell label="Load" span={1} hint="Apply the selected saved component snapshot to this custom component while preserving ID and transform.">
        <button class="library-btn" type="button" onclick={loadFromLibrary}>Load</button>
      </PropertyCell>
      <PropertyCell label="Copy" span={1} hint="Copy the selected package JSON for sharing or uploading later.">
        <button class="library-btn" type="button" onclick={copySelectedPackageJson}>Copy JSON</button>
      </PropertyCell>
      <PropertyCell label="File" span={1} hint="Download the selected package JSON for sharing or uploading later.">
        <button class="library-btn" type="button" onclick={downloadSelectedPackageJson}>Download</button>
      </PropertyCell>
      <PropertyCell label="Duplicate" span={1} hint="Create a new local copy that can be renamed and altered.">
        <button class="library-btn" type="button" onclick={duplicateLibraryEntry}>Copy</button>
      </PropertyCell>
      <PropertyCell label="Remove" span={1} hint="Remove the selected local package from this machine.">
        <button class="library-btn danger" type="button" onclick={removeFromLibrary}>Remove</button>
      </PropertyCell>
    {/if}
    <PropertyCell label="Import" span={3} hint="Paste one package JSON, a package array, or a ceditor-component-library bundle.">
      <textarea class="val package-text" rows="4" bind:value={importText} placeholder="paste package or library JSON"></textarea>
    </PropertyCell>
    <PropertyCell label="" span={1} hint="Validate and import pasted package JSON.">
      <div class="import-actions">
        <label class="library-btn file-btn">
          File
          <input type="file" accept=".json,application/json" onchange={importPackageFile} />
        </label>
        <button class="library-btn" type="button" onclick={() => importPackageJson()} disabled={importPreview.state !== 'ready'}>Import</button>
        <button class="library-btn" type="button" onclick={() => importPackageJson({ load: true })} disabled={importPreview.state !== 'ready' || importPreview.envelopes.length !== 1}>Load</button>
      </div>
    </PropertyCell>
    {#if importPreview.state !== 'empty'}
      <PropertyCell label="Incoming" span={4} hint="Parsed package preview before it is saved to the local library.">
        <div class="import-preview" class:invalid={importPreview.state === 'invalid'} class:warning={importPreview.envelope?.validation?.ok === false}>
          {#if importPreview.envelope}
            <div class="library-detail-main">
              <div class="library-summary">
                <strong>{importPreview.envelope.metadata.name} {importPreview.envelope.metadata.version}</strong>
                <span>{importPreview.envelope.metadata.author || 'unknown author'} · {(importPreview.envelope.metadata.tags ?? []).join(', ') || 'untagged'}</span>
                <span>{importPreview.envelope.metadata.category || 'custom'} · {importPreview.envelope.metadata.license || 'no license'}{importPreview.envelope.metadata.homepage ? ` · ${importPreview.envelope.metadata.homepage}` : ''}</span>
                {#if importPreview.envelope.metadata.description}<span>{importPreview.envelope.metadata.description}</span>{/if}
                <span>{importPreview.envelope.capabilities?.primaryKind ?? 'custom'} · {(importPreview.envelope.capabilities?.labels ?? []).join(', ') || 'custom'}</span>
                <em>{importPreview.envelope.validation?.ok === false ? `${importPreview.envelope.validation.issues.length} issue(s)` : 'valid package'}</em>
                <small>{importPreview.envelope.fingerprint ?? ''}</small>
              </div>
              <div class="library-thumb large" style={`aspect-ratio:${importPreview.envelope.thumbnail?.aspectRatio ?? 2}`}>
                {#each (importPreview.envelope.thumbnail?.parts ?? []).slice(0, 18) as part}
                  <i class:text={!!part.text} style={thumbnailPartStyle(part)}>{part.text}</i>
                {/each}
              </div>
              <div class="manifest-grid compact">
                {#each importSummaryItems as [label, value]}
                  <span><strong>{value}</strong><em>{label}</em></span>
                {/each}
              </div>
            </div>
            {#if importPreview.envelopes.length > 1 || importPreview.rejected}
              <div class="library-bundle-summary">
                <strong>{importPreview.envelopes.length}</strong>
                <span>packages ready</span>
                {#if importPreview.rejected}<em>{importPreview.rejected} rejected</em>{/if}
              </div>
            {/if}
            {#if importSurfaceItems.length}
              <div class="public-surface">
                {#each importSurfaceItems.slice(0, 12) as item}
                  <span class={item.kind}>
                    <strong>{item.kind}</strong>
                    <em>{item.label}</em>
                    {#if item.target || item.type || item.meta}<small>{[item.type, item.meta, item.target].filter(Boolean).join(' · ')}</small>{/if}
                  </span>
                {/each}
                {#if importSurfaceItems.length > 12}
                  <span class="more"><strong>more</strong><em>{importSurfaceItems.length - 12}</em></span>
                {/if}
              </div>
            {/if}
            {#if importAssetItems.length}
              <div class="asset-surface">
                {#each importAssetItems.slice(0, 10) as item}
                  <span class={item.kind}>
                    <strong>{item.kind}</strong>
                    <em>{item.label}</em>
                    {#if item.target || item.type || item.meta}<small>{[item.type, item.meta, item.target].filter(Boolean).join(' · ')}</small>{/if}
                  </span>
                {/each}
                {#if importAssetItems.length > 10}
                  <span class="more"><strong>more</strong><em>{importAssetItems.length - 10}</em></span>
                {/if}
              </div>
            {/if}
            {#if importIssueList.length}
              <div class="library-issues">
                {#each importIssueList.slice(0, 6) as issue}
                  <span>{issue}</span>
                {/each}
              </div>
            {/if}
          {:else}
            <strong>Import rejected</strong>
            <span>{importPreview.error}</span>
          {/if}
        </div>
      </PropertyCell>
    {/if}
    {#if packageText}
      <PropertyCell label="Package" span={4} hint="Last exported package JSON.">
        <textarea class="val package-text" rows="5" readonly value={packageText}></textarea>
      </PropertyCell>
    {/if}
  </PropertySection>

{/if}

<style>
  .val { box-sizing: border-box; width: 100%; min-width: 0; height: var(--pp-field-height, 26px); padding: var(--pp-field-padding, 0 6px); background: var(--pp-field-bg, #1A1A1A); border: 1px solid var(--pp-field-border, #333); border-radius: var(--pp-field-radius, 3px); color: var(--pp-field-fg, #DDD); font-size: var(--pp-field-font, 11px); font-family: inherit; outline: none; }

  /* A textarea wears `.val` too, and the shared skin is sized for a single-line field. Rows
     decide its height; the token is only a floor. */
  textarea.val {
    height: auto;
    min-height: var(--pp-field-height, 26px);
    padding: 4px 6px;
    line-height: 1.4;
    resize: vertical;
  }

  .val:focus {
    border-color: var(--pp-field-focus, #5B9BD5);
  }

  .metric {
    min-height: 28px;
    display: flex;
    align-items: center;
    justify-content: center;
    border: 1px solid #333;
    border-radius: 4px;
    background: #191919;
    color: #F0F0F0;
    font-size: 14px;
    font-weight: 700;
  }


  .library-btn {
    font-family: inherit;
  }

  .library-btn {
    min-height: 30px;
    border: 1px solid #353535;
    border-radius: 5px;
    background: #202020;
    color: #DDD;
    font-size: 11px;
    cursor: pointer;
  }

  .file-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    box-sizing: border-box;
  }

  .file-btn input {
    display: none;
  }

  .library-btn:disabled {
    opacity: 0.45;
    cursor: default;
  }

  .library-btn:hover {
    border-color: #5B9BD5;
    color: #FFF;
  }

  .library-btn.danger:hover {
    border-color: #D56B6B;
  }

  .package-status,
  .source-package,
  .library-summary {
    width: 100%;
    min-height: 30px;
    border: 1px solid #57402B;
    border-radius: 5px;
    background: #241D17;
    color: #E8C08A;
    display: flex;
    flex-direction: column;
    justify-content: center;
    gap: 2px;
    padding: 5px 7px;
    font-size: 10px;
    box-sizing: border-box;
  }

  .package-status.ok,
  .library-summary {
    border-color: #2F573E;
    background: #162219;
    color: #A9DCB8;
  }

  .source-package {
    border-color: #32495A;
    background: #15212A;
    color: #B8D7E8;
  }

  .source-package.changed {
    border-color: #6B5630;
    background: #241F14;
    color: #E8D4A8;
  }

  .package-status strong,
  .source-package strong,
  .library-summary strong {
    color: #F4F7FA;
    font-size: 11px;
  }

  .package-status span,
  .source-package span,
  .source-package em,
  .source-package small,
  .library-summary span,
  .library-summary em,
  .library-summary small,
  .package-status em {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-style: normal;
  }

  .package-status em,
  .source-package small,
  .library-summary small {
    color: #7F95A5;
    font-size: 9px;
  }

  .manifest-grid {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 6px;
    width: 100%;
  }

  .manifest-grid span {
    min-height: 38px;
    border: 1px solid #34424D;
    border-radius: 5px;
    background: #1C252C;
    color: #CDE1EE;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 3px;
    min-width: 0;
  }

  .manifest-grid strong {
    color: #F4F7FA;
    font-size: 13px;
  }

  .manifest-grid em {
    color: #93A6B3;
    font-size: 9px;
    font-style: normal;
  }

  .manifest-grid.compact {
    grid-template-columns: repeat(7, minmax(0, 1fr));
  }

  .manifest-grid.compact span {
    min-height: 32px;
  }

  .library-browser {
    width: 100%;
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
    gap: 7px;
    max-height: 282px;
    overflow: auto;
    padding-right: 2px;
    box-sizing: border-box;
  }

  .library-card {
    min-width: 0;
    border: 1px solid #33404A;
    border-radius: 6px;
    background: #161C21;
    color: #D8E2EA;
    padding: 8px;
    display: grid;
    gap: 6px;
    text-align: left;
    cursor: pointer;
    font-family: inherit;
  }

  .library-card:hover,
  .library-card.active {
    border-color: #5B9BD5;
    background: #192531;
  }

  .library-card.invalid {
    border-color: #68443A;
  }

  .library-card-head,
  .library-card-foot,
  .library-card-tags,
  .library-card-metrics {
    display: flex;
    align-items: center;
    gap: 5px;
    min-width: 0;
  }

  .library-card-head {
    justify-content: space-between;
  }

  .library-card-head strong,
  .library-card-meta,
  .library-card-foot small {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .library-card-head strong {
    color: #F4F7FA;
    font-size: 12px;
  }

  .library-card-head em,
  .library-card-foot em {
    color: #A9C8DC;
    font-size: 9px;
    font-style: normal;
    flex: 0 0 auto;
  }

  .library-card-meta {
    color: #8EA2B0;
    font-size: 10px;
  }

  .library-thumb {
    position: relative;
    width: 100%;
    min-height: 42px;
    max-height: 72px;
    border: 1px solid #303A42;
    border-radius: 5px;
    background:
      linear-gradient(90deg, rgba(255,255,255,0.035) 1px, transparent 1px),
      linear-gradient(180deg, rgba(255,255,255,0.035) 1px, transparent 1px),
      #101418;
    background-size: 14px 14px;
    overflow: hidden;
    box-sizing: border-box;
  }

  .library-thumb.large {
    min-height: 74px;
    max-height: 120px;
  }

  .library-thumb i {
    position: absolute;
    display: block;
    box-sizing: border-box;
    overflow: hidden;
  }

  .library-thumb i.text {
    color: #F2F6FA;
    font-size: 7px;
    line-height: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    white-space: nowrap;
  }

  .library-card-tags,
  .library-card-metrics {
    flex-wrap: wrap;
  }

  .library-card-tags em,
  .library-card-metrics em {
    border: 1px solid #31404A;
    border-radius: 999px;
    background: #10161A;
    color: #B8CBD8;
    padding: 2px 6px;
    font-size: 9px;
    font-style: normal;
  }

  .library-card-tags em.capability {
    border-color: #405A38;
    background: #172217;
    color: #BFE1A9;
  }

  .library-card-foot {
    justify-content: space-between;
  }

  .library-card-foot small {
    color: #748A9B;
    font-size: 9px;
  }

  .library-empty {
    min-height: 94px;
    border: 1px dashed #40515E;
    border-radius: 6px;
    background: #141A1F;
    color: #91A5B3;
    display: flex;
    flex-direction: column;
    justify-content: center;
    gap: 4px;
    padding: 10px;
    box-sizing: border-box;
    font-size: 11px;
  }

  .library-empty strong {
    color: #E3ECF2;
  }

  .library-detail {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: 7px;
    width: 100%;
  }

  .library-detail-main {
    display: grid;
    grid-template-columns: minmax(180px, 0.9fr) minmax(0, 1.1fr);
    gap: 7px;
    align-items: stretch;
  }

  .library-detail-edit {
    display: grid;
    grid-template-columns: minmax(120px, 1.4fr) minmax(70px, 0.7fr) minmax(76px, 0.5fr) minmax(82px, 0.5fr);
    gap: 6px;
    align-items: center;
  }

  .public-surface,
  .asset-surface {
    display: flex;
    flex-wrap: wrap;
    gap: 5px;
    min-width: 0;
  }

  .library-bundle-summary {
    border: 1px solid #33404A;
    border-radius: 5px;
    background: #121A20;
    color: #D8E2EA;
    min-height: 30px;
    display: flex;
    align-items: center;
    gap: 7px;
    padding: 5px 7px;
    box-sizing: border-box;
    min-width: 0;
  }

  .library-bundle-summary strong {
    color: #F4F7FA;
    font-size: 13px;
  }

  .library-bundle-summary span,
  .library-bundle-summary em {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 10px;
    font-style: normal;
  }

  .library-bundle-summary span {
    color: #B8CBD8;
  }

  .library-bundle-summary em {
    color: #E8C08A;
  }

  .public-surface span,
  .asset-surface span {
    max-width: 180px;
    border: 1px solid #33404A;
    border-radius: 5px;
    background: #10161A;
    color: #D8E2EA;
    padding: 4px 6px;
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    gap: 3px 5px;
    align-items: center;
    box-sizing: border-box;
  }

  .public-surface span.input {
    border-color: #31513D;
  }

  .public-surface span.output {
    border-color: #344E64;
  }

  .public-surface span.property {
    border-color: #5A4A32;
  }

  .public-surface span.more {
    border-color: #4B5660;
  }

  .asset-surface span.image {
    border-color: #424F63;
    background: #111820;
  }

  .asset-surface span.filmstrip {
    border-color: #5A4A32;
    background: #181612;
  }

  .asset-surface span.more {
    border-color: #4B5660;
  }

  .public-surface strong,
  .public-surface em,
  .public-surface small,
  .asset-surface strong,
  .asset-surface em,
  .asset-surface small {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-style: normal;
  }

  .public-surface strong,
  .asset-surface strong {
    color: #9FB4C2;
    font-size: 8px;
    text-transform: uppercase;
  }

  .public-surface em,
  .asset-surface em {
    color: #F4F7FA;
    font-size: 10px;
  }

  .public-surface small,
  .asset-surface small {
    grid-column: 1 / -1;
    color: #7F95A5;
    font-size: 9px;
  }

  .library-issues {
    display: grid;
    gap: 4px;
  }

  .library-issues span {
    border: 1px solid #5C4432;
    border-radius: 5px;
    background: #241D17;
    color: #E8C08A;
    padding: 5px 7px;
    font-size: 10px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .package-issues {
    width: 100%;
    display: grid;
    gap: 5px;
    max-height: 188px;
    overflow: auto;
  }

  .package-issues button {
    width: 100%;
    border: 1px solid #4A4A4A;
    border-radius: 5px;
    background: #202020;
    color: #CFCFCF;
    font-family: inherit;
    font-size: 10px;
    text-align: left;
    display: grid;
    grid-template-columns: 52px minmax(0, 1fr);
    gap: 8px;
    padding: 6px 7px;
    cursor: pointer;
    box-sizing: border-box;
  }

  .package-issues button:hover {
    border-color: #5B9BD5;
    color: #FFF;
  }

  .package-issues button.issue {
    border-color: #6A3939;
    background: #251717;
  }

  .package-issues button.warning {
    border-color: #5C4432;
    background: #241D17;
  }

  .package-issues strong {
    color: #F4F7FA;
    text-transform: capitalize;
  }

  .package-issues span {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: #D4B083;
  }

  .package-issues em {
    color: #888;
    font-style: normal;
    font-size: 10px;
    padding: 0 2px;
  }

  .package-text {
    resize: vertical;
    line-height: 1.35;
    font-family: Consolas, 'Courier New', monospace;
  }

  .import-actions {
    width: 100%;
    display: grid;
    grid-template-columns: 1fr;
    gap: 6px;
  }

  .import-preview {
    width: 100%;
    border: 1px solid #2F573E;
    border-radius: 6px;
    background: #131D17;
    display: grid;
    gap: 7px;
    padding: 7px;
    box-sizing: border-box;
    color: #A9DCB8;
  }

  .import-preview.warning {
    border-color: #665234;
    background: #211D15;
    color: #E8C08A;
  }

  .import-preview.invalid {
    border-color: #6A3939;
    background: #251717;
    color: #E8A0A0;
    min-height: 54px;
    justify-content: center;
  }

  .import-preview > strong {
    color: #F4F7FA;
    font-size: 12px;
  }

  .import-preview > span {
    font-size: 10px;
    color: inherit;
  }

</style>
