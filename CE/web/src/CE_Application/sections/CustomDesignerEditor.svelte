<script>
  import { getSection, updateControlProperty, applyControlPatch } from '../stores/controls.js';
  import PropertyCell from '../properties/PropertyCell.svelte';
  import PropertySection from '../properties/PropertySection.svelte';
  import { creatorMode } from '../stores/creatorMode.js';
  import PropertyToggle from '../properties/PropertyToggle.svelte';
  import {
    CUSTOM_ASSISTANT_RECIPES,
    CUSTOM_COMPONENT_STARTERS,
    createBackground,
    createBehaviorModule,
    createHitZone,
    createPartNode,
    createText,
    createValueChannel,
    createCustomComponentStarterPatch,
  } from '../utils/customComponentFactory.js';
  import { customComponentLibrary } from '../stores/customComponentLibrary.js';
  import {
    createCustomComponentLibraryEnvelope,
    createCustomComponentExportEnvelope,
    analyzeCustomComponentReadiness,
    normalizeCustomComponentLibraryEnvelope,
    fingerprintCustomComponent,
    normalizeCustomComponentEnvelope,
    customComponentPackageProvenance,
    summarizeCustomComponent,
    validateCustomComponentPackage,
  } from '../utils/customComponentPackage.js';
  import { readinessAutoFix } from '../utils/customComponentReadinessFixes.js';
  import { deepClone } from '../utils/deepClone.js';

  let { control = null } = $props();

  let core = $derived(getSection(control, 'Core'));
  let designer = $derived(getSection(control, 'Designer'));
  let parts = $derived(getSection(control, 'Parts'));
  let values = $derived(getSection(control, 'ValueChannels'));
  let behaviors = $derived(getSection(control, 'Behaviors'));
  let hitZones = $derived(getSection(control, 'HitZones'));
  let generators = $derived(getSection(control, 'Generators'));
  let bindings = $derived(getSection(control, 'Bindings'));
  let states = $derived(getSection(control, 'States'));
  let animations = $derived(getSection(control, 'Animations'));
  let assets = $derived(getSection(control, 'Assets'));
  let published = $derived(getSection(control, 'PublishedProperties'));
  let preview = $derived(designer?.preview ?? {});
  let partNames = $derived(Object.keys(parts?._children ?? {}));
  let channelNames = $derived(Object.keys(values?._children ?? {}));
  let behaviorNames = $derived(Object.keys(behaviors?._children ?? {}));
  let hitZoneNames = $derived(Object.keys(hitZones?._children ?? {}));
  let generatorNames = $derived(Object.keys(generators?._children ?? {}));
  let bindingEntries = $derived(Object.entries(bindings?._children ?? {}));
  let stateEntries = $derived(Object.entries(states?._children ?? {}));
  let animationEntries = $derived(Object.entries(animations?._children ?? {}));
  let assetCount = $derived(
    Object.keys(assets?.images ?? {}).length
    + Object.keys(assets?.filmstrips ?? {}).length
  );
  let publicInputCount = $derived(Object.values(published?.inputs ?? {}).filter((entry) => entry?.enabled !== false).length);
  let publicOutputCount = $derived(Object.values(published?.outputs ?? {}).filter((entry) => entry?.enabled !== false).length);
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
  let readiness = $derived(control ? analyzeCustomComponentReadiness(control) : { ok: false, score: 0, steps: [] });
  let readinessOpenSteps = $derived(readiness.steps.filter((step) => !step.done));
  // One-click fixes for steps that can be scaffolded mechanically.
  let readinessFixes = $derived.by(() => {
    const fixes = new Map();
    for (const step of readiness.steps) {
      if (step.done) continue;
      const fix = readinessAutoFix(control, step.id);
      if (fix) fixes.set(step.id, fix);
    }
    return fixes;
  });

  function applyReadinessFix(step) {
    const fix = readinessFixes.get(step.id);
    if (!fix || !core?.id) return;
    applyControlPatch(core.id, fix.patch);
  }
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
  let selectedAssistantContext = $derived(designer?.selectedAssistantContext ?? 'overview');
  let recipes = $derived(
    selectedAssistantContext === 'overview'
      ? CUSTOM_ASSISTANT_RECIPES
      : CUSTOM_ASSISTANT_RECIPES.filter((recipe) => recipe.group.toLowerCase() === selectedAssistantContext)
  );
  let selectedRecipeId = $state('');
  let selectedStarterId = $state(CUSTOM_COMPONENT_STARTERS[0]?.id ?? '');
  let selectedRecipe = $derived(
    recipes.find((recipe) => recipe.id === selectedRecipeId)
    ?? recipes[0]
    ?? null
  );
  let selectedStarter = $derived(
    CUSTOM_COMPONENT_STARTERS.find((starter) => starter.id === selectedStarterId)
    ?? CUSTOM_COMPONENT_STARTERS[0]
    ?? null
  );
  let selectedLayerName = $derived(designer?.selectedLayer ?? partNames[0] ?? '');
  let selectedLayerBindings = $derived(
    bindingEntries.filter(([, binding]) => String(binding?.target ?? '').startsWith(`Parts.${selectedLayerName}.`))
  );
  let selectedLayerAnimations = $derived(
    animationEntries.filter(([, animation]) => (animation?.targets ?? []).some((target) => String(target?.path ?? '').startsWith(`Parts.${selectedLayerName}.`)))
  );
  let previewStateOptions = $derived([
    'base',
    'hover',
    'pressed',
    'dragging',
    'focused',
    'disabled',
    ...stateEntries.map(([name]) => name),
  ].filter((name, index, list) => name && list.indexOf(name) === index));
  let motionSummary = $derived(
    selectedLayerBindings.length || selectedLayerAnimations.length
      ? `${selectedLayerBindings.length} binding${selectedLayerBindings.length === 1 ? '' : 's'} · ${selectedLayerAnimations.length} animation${selectedLayerAnimations.length === 1 ? '' : 's'}`
      : 'No moving-part rules yet'
  );

  const ASSISTANT_CONTEXTS = [
    { id: 'overview', label: 'All' },
    { id: 'shapes', label: 'Shapes' },
    { id: 'movement', label: 'Move' },
    { id: 'states', label: 'States' },
    { id: 'generators', label: 'Generators' },
    { id: 'assets', label: 'Assets' },
    { id: 'links', label: 'Links' },
  ];

  const SHAPE_TOOLS = [
    { kind: 'rectangle', label: 'Rectangle', preview: 'rectangle' },
    { kind: 'roundedRectangle', label: 'Rounded', preview: 'rounded' },
    { kind: 'circle', label: 'Circle', preview: 'circle' },
    { kind: 'ring', label: 'Ring', preview: 'ring' },
    { kind: 'arcTrack', label: 'Arc Track', preview: 'ring' },
    { kind: 'capsule', label: 'Capsule', preview: 'capsule' },
    { kind: 'text', label: 'Text', preview: 'text' },
  ];

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
    if (selectedRecipe && selectedRecipeId !== selectedRecipe.id) {
      selectedRecipeId = selectedRecipe.id;
    }
  });

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

  function recipePreviewKind(recipe) {
    const id = String(recipe?.id ?? '');
    if (id.includes('xyGrid')) return 'xy-grid';
    if (id.includes('pianoBar')) return 'piano-bar';
    if (id.includes('filmstrip')) return 'filmstrip';
    if (id.includes('twoSliders')) return 'two-sliders';
    if (id.includes('ticks')) return 'ticks';
    if (id.includes('track')) return 'track';
    if (id.includes('rotate')) return 'rotate';
    if (id.includes('pressBounce')) return 'press';
    if (id.includes('ring')) return 'ring';
    return 'shape';
  }

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

  function applySelectedRecipe() {
    if (!selectedRecipe) return;
    applyRecipe(selectedRecipe);
  }

  function starterPreviewKind(starter) {
    const id = String(starter?.id ?? '');
    if (id.includes('macroRings')) return 'starter-rings';
    if (id.includes('circularTick')) return 'starter-circular';
    if (id.includes('dualSlider')) return 'starter-dual';
    if (id.includes('tripleValue')) return 'starter-triple';
    if (id.includes('xyGrid')) return 'starter-grid';
    if (id.includes('piano')) return 'starter-piano';
    if (id.includes('filmstrip')) return 'starter-filmstrip';
    return 'starter-basic';
  }

  function applySelectedStarter() {
    applyStarter(selectedStarter);
  }

  function focusReadinessStep(step) {
    if (!step) return;
    setDesigner('selectedAssistantContext', step.target || 'overview');
    libraryStatus = `${step.label}: ${step.detail}`;
  }

  function focusPackageIssue(item) {
    const message = String(item?.message ?? item ?? '');
    if (message.includes('Published input') || message.includes('Published output') || message.includes('Editable property') || message.includes('published inputs or outputs')) {
      setDesigner('selectedAssistantContext', 'links');
    } else if (message.includes('Filmstrip') || message.includes('filmstrip')) {
      setDesigner('selectedAssistantContext', 'assets');
    } else if (message.includes('Generator')) {
      setDesigner('selectedAssistantContext', 'generators');
    } else if (message.includes('Hit zone')) {
      setDesigner('selectedAssistantContext', 'movement');
    } else if (message.includes('Animation') || message.includes('Binding') || message.includes('Link')) {
      setDesigner('selectedAssistantContext', 'movement');
    } else {
      setDesigner('selectedAssistantContext', 'overview');
    }
    libraryStatus = message;
  }

  function applyStarter(starter) {
    if (!core?.id || !starter) return;
    const patch = createCustomComponentStarterPatch(starter.id);
    applyControlPatch(core.id, patch);
    selectedStarterId = starter.id;
    libraryStatus = `Loaded ${starter.label}`;
  }

  function set(path, value) {
    if (!core?.id) return;
    updateControlProperty(core.id, path, value);
  }

  function setDesigner(prop, value) {
    set(`Designer.${prop}`, value);
  }

  function setPreview(prop, value) {
    set(`Designer.preview.${prop}`, value);
  }

  function nextPartName(base) {
    let index = 1;
    let name = base;
    const existing = new Set(partNames);
    while (existing.has(name)) {
      index += 1;
      name = `${base}_${index}`;
    }
    return name;
  }

  function addShape(kind) {
    if (!core?.id) return;
    const baseName = kind === 'text' ? 'textLayer' : kind;
    const name = nextPartName(baseName);
    const common = {
      role: kind,
      kind,
      zIndex: partNames.length + 1,
      layout: { x: 50, y: 50, width: 84, height: 32, widthUnit: 'px', heightUnit: 'px' },
    };
    const part = kind === 'text'
      ? createPartNode(name, {
        ...common,
        sections: { Text: createText('Text', { size: 12, weight: 600 }) },
      })
      : createPartNode(name, {
        ...common,
        layout: {
          ...common.layout,
          width: ['circle', 'ring', 'arcTrack'].includes(kind) ? 42 : common.layout.width,
          height: ['circle', 'ring', 'arcTrack'].includes(kind) ? 42 : common.layout.height,
        },
        sections: {
          Background: createBackground(['ring', 'arcTrack'].includes(kind) ? '005B9BD5' : 'FF5B9BD5', {
            borderEnabled: true,
            borderColour: ['ring', 'arcTrack'].includes(kind) ? 'FF5B9BD5' : '55FFFFFF',
            borderThickness: ['ring', 'arcTrack'].includes(kind) ? 4 : 1,
            radius: ['circle', 'ring', 'arcTrack'].includes(kind) ? 999 : (kind === 'capsule' ? 999 : 8),
          }),
        },
        meta: kind === 'arcTrack'
          ? {
            renderer: 'arcTrack',
            arcTrack: {
              startAngle: -135,
              sweepAngle: 270,
              direction: 'cw',
              thickness: 4,
              colour: 'FF5B9BD5',
            },
          }
          : {},
      });

    applyControlPatch(core.id, {
      [`Parts.${name}`]: part,
      'Designer.selectedLayer': name,
    });
  }

  function applyRecipe(recipe) {
    if (!core?.id || !recipe) return;
    const selectedLayer = designer?.selectedLayer || 'handle';
    const selectedChannel = designer?.selectedValueChannel || 'mainValue';
    const normalizedSource = selectedChannel === 'mainValue' ? 'value.normalized' : `channel.${selectedChannel}.normalized`;

    if (recipe.id === 'shape.roundedPanel') {
      addShape('roundedRectangle');
      return;
    }
    if (recipe.id === 'shape.ring') {
      addShape('ring');
      return;
    }
    if (recipe.id === 'state.pressBounce') {
      applyControlPatch(core.id, {
        'States.PressBounce': {
          _type: 'State',
          name: 'PressBounce',
          group: 'interaction',
          description: 'Scale the selected part while pressed.',
          enabled: true,
          when: { pressed: true },
          patches: {
            component: {},
            parts: {
              [selectedLayer]: { 'Layout.scale': 0.94 },
            },
          },
        },
        'Animations.pressBounce': {
          _type: 'Animation',
          name: 'pressBounce',
          enabled: true,
          kind: 'transition',
          trigger: { type: 'stateChange', from: ['*'], to: ['pressed'] },
          targets: [{ path: `Parts.${selectedLayer}.Layout.scale`, properties: ['transform'] }],
          duration: 90,
          delay: 0,
          easing: 'outQuad',
        },
      });
      return;
    }
    if (recipe.id === 'move.rotateValue') {
      const target = selectedLayer;
      applyControlPatch(core.id, {
        [`Bindings.${target}Rotation`]: {
          _type: 'Binding',
          name: `${target}Rotation`,
          enabled: true,
          source: normalizedSource,
          mapMode: 'range',
          target: `Parts.${target}.Layout.rotation`,
          outputUnit: 'deg',
          inputMin: 0,
          inputMax: 1,
          outputMin: -135,
          outputMax: 135,
          falseValue: -135,
          trueValue: 135,
          enumMap: {},
          clamp: true,
          round: false,
          invert: false,
        },
      });
      return;
    }
    if (recipe.id === 'move.trackValue') {
      const target = selectedLayer;
      applyControlPatch(core.id, {
        [`Bindings.${target}TrackX`]: {
          _type: 'Binding',
          name: `${target}TrackX`,
          enabled: true,
          source: normalizedSource,
          mapMode: 'range',
          target: `Parts.${target}.Layout.x`,
          outputUnit: 'percent',
          inputMin: 0,
          inputMax: 1,
          outputMin: 14,
          outputMax: 86,
          falseValue: 14,
          trueValue: 86,
          enumMap: {},
          clamp: true,
          round: false,
          invert: false,
        },
        'HitZones.mainDragArea': createHitZone('mainDragArea', {
          targetBehavior: 'mainSlider',
          targetValueChannel: selectedChannel,
          action: 'dragValue',
        }),
        'Designer.preview.showHitZones': true,
      });
      return;
    }
    if (recipe.id === 'generator.ticks') {
      applyControlPatch(core.id, {
        'Generators.majorTicks': {
          _type: 'Generator',
          name: 'majorTicks',
          type: 'ticks',
          enabled: true,
          targetBehavior: 'mainSlider',
          geometry: 'linear',
          count: 11,
          minorCount: 3,
          placement: 'outside',
          generatedPartPrefix: 'tick',
          generatedHitZones: false,
          detachable: true,
        },
        'Designer.selectedGenerator': 'majorTicks',
      });
      return;
    }
    if (recipe.id === 'generator.xyGrid') {
      applyControlPatch(core.id, {
        'ValueChannels.xValue': createValueChannel('xValue', { label: 'X Value', defaultValue: 0.5 }),
        'ValueChannels.yValue': createValueChannel('yValue', { label: 'Y Value', defaultValue: 0.5 }),
        'Behaviors.xyPad': {
          ...createBehaviorModule('xyPad', { type: 'xy-pad', role: 'xy-pad', valueChannel: 'xValue', geometry: 'grid' }),
          valueChannels: ['xValue', 'yValue'],
        },
        'Generators.xyGrid': {
          _type: 'Generator',
          name: 'xyGrid',
          type: 'grid',
          enabled: true,
          targetBehavior: 'xyPad',
          targetValueChannel: 'xValue',
          targetValueChannelY: 'yValue',
          geometry: 'grid',
          rows: 4,
          columns: 4,
          generatedPartPrefix: 'xyGrid',
          generatedHitZones: true,
          hitZoneAction: 'setValue',
          detachable: true,
        },
        'PublishedProperties.inputs.xValue': { channel: 'xValue', label: 'X Value', type: 'float', enabled: true },
        'PublishedProperties.inputs.yValue': { channel: 'yValue', label: 'Y Value', type: 'float', enabled: true },
        'PublishedProperties.outputs.xValue': { channel: 'xValue', label: 'X Value', type: 'float', enabled: true },
        'PublishedProperties.outputs.yValue': { channel: 'yValue', label: 'Y Value', type: 'float', enabled: true },
        'Designer.selectedValueChannel': 'xValue',
        'Designer.selectedBehavior': 'xyPad',
        'Designer.selectedGenerator': 'xyGrid',
        'Designer.preview.showHitZones': true,
      });
      return;
    }
    if (recipe.id === 'generator.pianoBar') {
      applyControlPatch(core.id, {
        'ValueChannels.note': createValueChannel('note', {
          label: 'Note',
          type: 'int',
          min: 0,
          max: 127,
          step: 1,
          defaultValue: 60,
          format: { precision: 0, unit: 'midi' },
        }),
        'Behaviors.pianoBar': createBehaviorModule('pianoBar', {
          type: 'piano-bar',
          role: 'piano',
          valueChannel: 'note',
          geometry: 'piano',
        }),
        'Generators.pianoKeys': {
          _type: 'Generator',
          name: 'pianoKeys',
          type: 'piano-keys',
          enabled: true,
          targetBehavior: 'pianoBar',
          targetValueChannel: 'note',
          geometry: 'piano',
          count: 24,
          baseNote: 48,
          generatedPartPrefix: 'piano',
          generatedHitZones: true,
          hitZoneAction: 'noteValue',
          detachable: true,
        },
        'PublishedProperties.inputs.note': { channel: 'note', label: 'Note', type: 'int', enabled: true },
        'PublishedProperties.outputs.note': { channel: 'note', label: 'Note', type: 'int', enabled: true },
        'Designer.selectedValueChannel': 'note',
        'Designer.selectedBehavior': 'pianoBar',
        'Designer.selectedGenerator': 'pianoKeys',
        'Designer.preview.showHitZones': true,
      });
      return;
    }
    if (recipe.id === 'asset.filmstrip') {
      applyControlPatch(core.id, {
        'Assets.filmstrips.knobFilmstrip': {
          source: '',
          frameCount: 31,
          frameWidth: 0,
          frameHeight: 0,
          orientation: 'vertical',
          interpolation: 'nearest',
          valueSource: selectedChannel,
        },
        'Generators.filmstripKnob': {
          _type: 'Generator',
          name: 'filmstripKnob',
          type: 'filmstrip-frames',
          enabled: true,
          generatedPartPrefix: 'filmstrip',
          assetName: 'knobFilmstrip',
          zIndex: 12,
        },
        'Designer.selectedAsset': 'knobFilmstrip',
        'Designer.selectedGenerator': 'filmstripKnob',
      });
      return;
    }
    if (recipe.id === 'logic.twoSlidersSwitch') {
      applyControlPatch(core.id, {
        'ValueChannels.valueA': createValueChannel('valueA', { label: 'Value A', defaultValue: 0.25 }),
        'ValueChannels.valueB': createValueChannel('valueB', { label: 'Value B', defaultValue: 0.75 }),
        'ValueChannels.mode': createValueChannel('mode', {
          label: 'Mode',
          type: 'enum',
          defaultValue: 'A',
          format: { precision: 0 },
        }),
        'ValueChannels.mode.values': ['A', 'B'],
        'Behaviors.sliderA': createBehaviorModule('sliderA', { type: 'slider', role: 'slider', valueChannel: 'valueA', geometry: 'linear' }),
        'Behaviors.sliderB': createBehaviorModule('sliderB', { type: 'slider', role: 'slider', valueChannel: 'valueB', geometry: 'linear' }),
        'Behaviors.switchMode': createBehaviorModule('switchMode', { type: 'cycle', role: 'button', valueChannel: 'mode', geometry: 'none' }),
        'HitZones.sliderAZone': createHitZone('sliderAZone', {
          targetBehavior: 'sliderA',
          targetValueChannel: 'valueA',
          action: 'dragValue',
          bounds: { x: 0, y: 0, width: 78, height: 50, unit: 'percent' },
        }),
        'HitZones.sliderBZone': createHitZone('sliderBZone', {
          targetBehavior: 'sliderB',
          targetValueChannel: 'valueB',
          action: 'dragValue',
          bounds: { x: 0, y: 50, width: 78, height: 50, unit: 'percent' },
        }),
        'HitZones.switchModeZone': createHitZone('switchModeZone', {
          shape: 'circle',
          targetBehavior: 'switchMode',
          targetValueChannel: 'mode',
          action: 'cycleValue',
          bounds: { x: 80, y: 20, width: 18, height: 60, unit: 'percent' },
        }),
        'Links.activeValueRoute': {
          _type: 'Link',
          name: 'activeValueRoute',
          enabled: true,
          type: 'switch',
          source: 'mode',
          target: 'mainValue',
          condition: '',
          expression: 'mode === "A" ? valueA : valueB',
          notes: 'Routes the active slider value into mainValue for combined controls.',
        },
        'Designer.selectedValueChannel': 'valueA',
        'Designer.selectedBehavior': 'sliderA',
        'Designer.preview.showHitZones': true,
      });
      return;
    }
    setDesigner('selectedAssistantContext', String(recipe.group ?? 'overview').toLowerCase());
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
  <PropertySection title="Workshop">
    <PropertyCell label="Ready" span={4} hint="Whether this component is complete enough to reuse. Full checklist is under Advanced.">
      <div class="readiness-hint" class:ok={readiness.ok}>
        <strong>{readiness.ok ? '✓ Ready to reuse' : `${readiness.requiredOpenCount} required item${readiness.requiredOpenCount === 1 ? '' : 's'} left`}</strong>
        {#if !readiness.ok && readinessOpenSteps.length}
          <span>next: {readinessOpenSteps[0].label}</span>
        {/if}
      </div>
    </PropertyCell>
    {#if $creatorMode === 'advanced'}
    <PropertyCell label="Mode" span={2} hint="Custom components are authored as reusable mini-instruments.">
      <input class="val" type="text" value={designer.mode ?? 'workshop'} onchange={(event) => setDesigner('mode', event.target.value)} />
    </PropertyCell>
    <PropertyCell label="Variant" span={2} hint="Active variant shown by the designer preview.">
      <input class="val" type="text" value={designer.activeVariant ?? 'default'} onchange={(event) => setDesigner('activeVariant', event.target.value)} />
    </PropertyCell>
    <PropertyCell label="Layer" span={2} hint="Selected part/layer for recipes and quick actions.">
      <select class="val" value={designer.selectedLayer ?? ''} onchange={(event) => setDesigner('selectedLayer', event.target.value)}>
        <option value="">none</option>
        {#each partNames as name}
          <option value={name}>{name}</option>
        {/each}
      </select>
    </PropertyCell>
    <PropertyCell label="Value" span={2} hint="Selected value channel for assistant recipes.">
      <select class="val" value={designer.selectedValueChannel ?? ''} onchange={(event) => setDesigner('selectedValueChannel', event.target.value)}>
        <option value="">none</option>
        {#each channelNames as name}
          <option value={name}>{name}</option>
        {/each}
      </select>
    </PropertyCell>
    {/if}
  </PropertySection>

  {#if $creatorMode === 'advanced'}
  <PropertySection title="Component Map">
    <PropertyCell label="Layers" span={1} hint="Visible parts/layers currently inside this component.">
      <div class="metric">{partNames.length}</div>
    </PropertyCell>
    <PropertyCell label="Values" span={1} hint="Named value channels available for internal and external linking.">
      <div class="metric">{channelNames.length}</div>
    </PropertyCell>
    <PropertyCell label="Behaviors" span={1} hint="Interaction modules that change value channels.">
      <div class="metric">{behaviorNames.length}</div>
    </PropertyCell>
    <PropertyCell label="Hit Zones" span={1} hint="Independent interactive surfaces.">
      <div class="metric">{hitZoneNames.length}</div>
    </PropertyCell>
    <PropertyCell label="Generators" span={1} hint="Generated ticks, grids, keys, and repeated structures.">
      <div class="metric">{generatorNames.length}</div>
    </PropertyCell>
    <PropertyCell label="Assets" span={1} hint="Packaged images and filmstrips.">
      <div class="metric">{assetCount}</div>
    </PropertyCell>
    <PropertyCell label="Inputs" span={1} hint="Published inputs visible to other components.">
      <div class="metric">{publicInputCount}</div>
    </PropertyCell>
    <PropertyCell label="Outputs" span={1} hint="Published outputs exposed to the panel.">
      <div class="metric">{publicOutputCount}</div>
    </PropertyCell>
  </PropertySection>

  <PropertySection title="Readiness">
    <PropertyCell label="Score" span={1} hint="How complete this component is as a reusable custom package.">
      <div class="readiness-score" class:ok={readiness.ok}>
        <strong>{readiness.score}%</strong>
        <span>{readiness.doneCount}/{readiness.totalCount}</span>
      </div>
    </PropertyCell>
    <PropertyCell label="Status" span={3} hint="Required items must be complete before the component is truly reusable.">
      <div class="readiness-status" class:ok={readiness.ok}>
        <strong>{readiness.ok ? 'Ready to reuse' : `${readiness.requiredOpenCount} required item${readiness.requiredOpenCount === 1 ? '' : 's'} open`}</strong>
        <span>{readiness.recommendedOpenCount} recommended, {readiness.optionalOpenCount} optional still open</span>
      </div>
    </PropertyCell>
    <PropertyCell label="Checklist" span={4} hint="Authoring checklist for reusable, linkable, shareable custom components.">
      <div class="readiness-list">
        {#each readiness.steps as step}
          <div class="readiness-item" class:has-fix={readinessFixes.has(step.id)}>
            <button
              class:done={step.done}
              class:required={step.severity === 'required'}
              type="button"
              onclick={() => focusReadinessStep(step)}
            >
              <span>{step.done ? 'done' : step.severity}</span>
              <strong>{step.label}</strong>
              <em>{step.detail}</em>
            </button>
            {#if readinessFixes.has(step.id)}
              <button type="button" class="readiness-fix" onclick={() => applyReadinessFix(step)} title={readinessFixes.get(step.id).label}>
                Fix
              </button>
            {/if}
          </div>
        {/each}
      </div>
    </PropertyCell>
    {#if readinessOpenSteps.length}
      <PropertyCell label="Next" span={4} hint="The most useful unfinished items to handle next.">
        <div class="readiness-next">
          {#each readinessOpenSteps.slice(0, 4) as step}
            <button type="button" onclick={() => focusReadinessStep(step)}>
              <strong>{step.label}</strong>
              <span>{step.detail}</span>
            </button>
            {#if readinessFixes.has(step.id)}
              <button type="button" class="readiness-fix" onclick={() => applyReadinessFix(step)} title={readinessFixes.get(step.id).label}>
                Fix: {readinessFixes.get(step.id).label}
              </button>
            {/if}
          {/each}
        </div>
      </PropertyCell>
    {/if}
  </PropertySection>
  {/if}

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
      <button class="library-btn" type="button" onclick={saveToLibrary}>Save Local Package</button>
    </PropertyCell>
    {#if $creatorMode === 'advanced'}
    <PropertyCell label="Export" span={1} hint="Create portable JSON for upload/download later.">
      <button class="library-btn" type="button" onclick={copyPackageJson}>Package JSON</button>
    </PropertyCell>
    <PropertyCell label="Export All" span={1} hint="Create a portable bundle containing every saved local custom component package.">
      <button class="library-btn" type="button" onclick={copyLibraryJson}>Library JSON</button>
    </PropertyCell>
    <PropertyCell label="Download" span={1} hint="Download this custom component package as a portable JSON file.">
      <button class="library-btn" type="button" onclick={downloadPackageJson}>Package File</button>
    </PropertyCell>
    <PropertyCell label="Download All" span={1} hint="Download the complete local custom component library as one portable JSON file.">
      <button class="library-btn" type="button" onclick={downloadLibraryJson} disabled={!libraryEntries.length}>Library File</button>
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

  {#if $creatorMode === 'advanced'}
  <PropertySection title="Preview Aids">
    <PropertyCell label="Hit Zones" span={1} hint="Show hit zones while designing.">
      <PropertyToggle value={preview.showHitZones === true} onchange={() => setPreview('showHitZones', !(preview.showHitZones === true))} />
    </PropertyCell>
    <PropertyCell label="Bounds" span={1} hint="Show layer bounds while designing.">
      <PropertyToggle value={preview.showBounds !== false} onchange={() => setPreview('showBounds', !(preview.showBounds !== false))} />
    </PropertyCell>
    <PropertyCell label="Values" span={1} hint="Show live value overlays in the designer.">
      <PropertyToggle value={preview.showValues !== false} onchange={() => setPreview('showValues', !(preview.showValues !== false))} />
    </PropertyCell>
    <PropertyCell label="Anim" span={1} hint="Preview animations in the test bench and assistant tray.">
      <PropertyToggle value={preview.animationsEnabled !== false} onchange={() => setPreview('animationsEnabled', !(preview.animationsEnabled !== false))} />
    </PropertyCell>
  </PropertySection>

  <PropertySection title="Preview Workbench">
    <PropertyCell label="States" span={4} hint="Switch preview states and see which authored states exist for this component.">
      <div class="state-preview-strip">
        {#each previewStateOptions as state}
          <button
            class:active={(preview.state ?? 'base') === state}
            type="button"
            onclick={() => setPreview('state', state)}
          >
            <span class={`state-glyph ${state}`}></span>
            <strong>{state}</strong>
          </button>
        {/each}
      </div>
    </PropertyCell>
    <PropertyCell label="Moving" span={2} hint="Bindings and animations that currently target the selected layer.">
      <div class="motion-card">
        <div class="motion-stage">
          <span class="motion-track"></span>
          <span class="motion-pointer"></span>
        </div>
        <div class="motion-copy">
          <strong>{selectedLayerName || 'No layer selected'}</strong>
          <span>{motionSummary}</span>
        </div>
      </div>
    </PropertyCell>
    <PropertyCell label="Targets" span={2} hint="Actual layer targets used by value-driven motion and state animations.">
      <div class="target-list">
        {#each selectedLayerBindings.slice(0, 4) as [name, binding]}
          <span><strong>{name}</strong><em>{binding?.target ?? ''}</em></span>
        {/each}
        {#each selectedLayerAnimations.slice(0, 4 - Math.min(selectedLayerBindings.length, 4)) as [name, animation]}
          <span><strong>{name}</strong><em>{animation?.kind ?? 'animation'}</em></span>
        {/each}
        {#if selectedLayerBindings.length === 0 && selectedLayerAnimations.length === 0}
          <span class="empty-target"><strong>none</strong><em>apply a movement or state recipe</em></span>
        {/if}
      </div>
    </PropertyCell>
  </PropertySection>
  {/if}

  <PropertySection title="Quick Shapes">
    <PropertyCell label="Add" span={4} hint="Create real layers in Parts so states, bindings, and animations can target them.">
      <div class="shape-grid">
        {#each SHAPE_TOOLS as tool}
          <button class="tool-card" type="button" onclick={() => addShape(tool.kind)}>
            <span class={`shape-swatch ${tool.preview}`}></span>
            <strong>{tool.label}</strong>
          </button>
        {/each}
      </div>
    </PropertyCell>
  </PropertySection>

  <div class="starter-tray">
    <div class="starter-header">
      <div>
        <div class="assistant-title">Starter Components</div>
        <div class="assistant-subtitle">Load a complete editable archetype into this custom component.</div>
      </div>
      <button class="apply-recipe-btn starter-apply" type="button" onclick={applySelectedStarter} disabled={!selectedStarter}>
        Load Starter
      </button>
    </div>

    {#if selectedStarter}
      <div class="starter-selected">
        <div class={`starter-preview ${starterPreviewKind(selectedStarter)}`}>
          <span class="starter-item a"></span>
          <span class="starter-item b"></span>
          <span class="starter-item c"></span>
          <span class="starter-item d"></span>
          <span class="starter-item e"></span>
        </div>
        <div class="selected-copy">
          <strong>{selectedStarter.label}</strong>
          <em>{selectedStarter.summary}</em>
          <div class="creates-row">
            {#each selectedStarter.creates as item}
              <span>{item}</span>
            {/each}
          </div>
        </div>
        <div class="starter-size">
          <strong>{selectedStarter.dimensions.width} x {selectedStarter.dimensions.height}</strong>
          <em>{selectedStarter.group}</em>
        </div>
      </div>
    {/if}

    <div class="starter-grid">
      {#each CUSTOM_COMPONENT_STARTERS as starter (starter.id)}
        <button
          class="starter-card"
          class:active={selectedStarter?.id === starter.id}
          type="button"
          onclick={() => selectedStarterId = starter.id}
          ondblclick={() => applyStarter(starter)}
        >
          <span class={`starter-mini ${starterPreviewKind(starter)}`}></span>
          <span class="recipe-copy">
            <strong>{starter.label}</strong>
            <em>{starter.summary}</em>
            <small>{starter.creates.join(' + ')}</small>
          </span>
        </button>
      {/each}
    </div>
  </div>

  <div class="assistant-tray">
    <div class="assistant-header">
      <div>
        <div class="assistant-title">Visual Assistant Tray</div>
        <div class="assistant-subtitle">Preview options and apply setup recipes instead of guessing paths.</div>
      </div>
      <div class="context-tabs">
        {#each ASSISTANT_CONTEXTS as context}
          <button
            class:active={selectedAssistantContext === context.id}
            type="button"
            onclick={() => setDesigner('selectedAssistantContext', context.id)}
          >
            {context.label}
          </button>
        {/each}
      </div>
    </div>

    {#if selectedRecipe}
      <div class="selected-recipe">
        <div class={`assistant-preview ${recipePreviewKind(selectedRecipe)}`}>
          <span class="preview-stage">
            <span class="preview-item a"></span>
            <span class="preview-item b"></span>
            <span class="preview-item c"></span>
            <span class="preview-item d"></span>
          </span>
        </div>
        <div class="selected-copy">
          <strong>{selectedRecipe.label}</strong>
          <em>{selectedRecipe.summary}</em>
          <div class="creates-row">
            {#each selectedRecipe.creates as item}
              <span>{item}</span>
            {/each}
          </div>
        </div>
        <button class="apply-recipe-btn" type="button" onclick={applySelectedRecipe}>Apply</button>
      </div>
    {/if}

    <div class="recipe-grid">
      {#each recipes as recipe (recipe.id)}
        <button
          class="recipe-card"
          class:active={selectedRecipe?.id === recipe.id}
          type="button"
          onclick={() => selectedRecipeId = recipe.id}
          ondblclick={() => applyRecipe(recipe)}
        >
          <span class="recipe-preview" class:movement={recipe.group === 'Movement'} class:state={recipe.group === 'States'} class:asset={recipe.group === 'Assets'}>
            <span></span>
          </span>
          <span class="recipe-copy">
            <strong>{recipe.label}</strong>
            <em>{recipe.summary}</em>
            <small>{recipe.creates.join(' + ')}</small>
          </span>
        </button>
      {/each}
    </div>
  </div>
{/if}

<style>
  .val {
    width: 100%;
    min-width: 0;
    background: #1A1A1A;
    border: 1px solid #333;
    border-radius: 3px;
    color: #DDD;
    font-size: 11px;
    padding: 4px 6px;
    font-family: inherit;
    outline: none;
    box-sizing: border-box;
  }

  .val:focus {
    border-color: #5B9BD5;
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

  .shape-grid {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 6px;
    width: 100%;
  }

  .state-preview-strip {
    display: grid;
    grid-template-columns: repeat(6, minmax(0, 1fr));
    gap: 6px;
    width: 100%;
  }

  .state-preview-strip button {
    min-height: 44px;
    border: 1px solid #343D45;
    border-radius: 5px;
    background: #1B2025;
    color: #C9D5DD;
    font-family: inherit;
    font-size: 10px;
    cursor: pointer;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 4px;
    min-width: 0;
  }

  .state-preview-strip button.active,
  .state-preview-strip button:hover {
    border-color: #5B9BD5;
    background: #172838;
    color: #FFF;
  }

  .state-preview-strip strong {
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 10px;
  }

  .state-glyph {
    width: 22px;
    height: 12px;
    border-radius: 999px;
    border: 1px solid rgba(255, 255, 255, 0.25);
    background: #5B9BD5;
    display: block;
  }

  .state-glyph.hover { box-shadow: 0 0 0 4px rgba(91, 155, 213, 0.18); }
  .state-glyph.pressed { transform: scaleX(0.78); background: #E5C06B; }
  .state-glyph.dragging { transform: translateX(5px); background: #70C08F; }
  .state-glyph.focused { outline: 1px solid #E6EEF4; outline-offset: 2px; }
  .state-glyph.disabled { opacity: 0.45; filter: grayscale(1); }

  .motion-card {
    display: grid;
    grid-template-columns: 76px minmax(0, 1fr);
    gap: 8px;
    align-items: center;
    width: 100%;
    min-height: 58px;
    border: 1px solid #303A42;
    border-radius: 6px;
    background: #171C20;
    padding: 6px;
    box-sizing: border-box;
  }

  .motion-stage {
    position: relative;
    height: 44px;
    border: 1px solid #34424D;
    border-radius: 5px;
    background: #101418;
    overflow: hidden;
  }

  .motion-track,
  .motion-pointer {
    position: absolute;
    display: block;
  }

  .motion-track {
    left: 10px;
    right: 10px;
    top: 22px;
    height: 3px;
    border-radius: 999px;
    background: #34424D;
  }

  .motion-pointer {
    left: 32px;
    top: 10px;
    width: 10px;
    height: 26px;
    border-radius: 999px;
    background: #E6EEF4;
    transform-origin: 5px 24px;
    transform: rotate(-28deg);
  }

  .motion-copy {
    display: flex;
    flex-direction: column;
    gap: 3px;
    min-width: 0;
    font-size: 10px;
  }

  .motion-copy strong,
  .motion-copy span {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .motion-copy strong { color: #F4F7FA; }
  .motion-copy span { color: #8FA1AD; }

  .target-list {
    display: flex;
    flex-direction: column;
    gap: 5px;
    width: 100%;
  }

  .target-list span {
    display: grid;
    grid-template-columns: minmax(72px, 0.8fr) minmax(0, 1.2fr);
    gap: 7px;
    align-items: center;
    min-height: 26px;
    border: 1px solid #303A42;
    border-radius: 5px;
    background: #171C20;
    padding: 4px 6px;
    box-sizing: border-box;
    font-size: 10px;
  }

  .target-list strong,
  .target-list em {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-style: normal;
  }

  .target-list strong { color: #F0F4F7; }
  .target-list em { color: #82B8E5; }
  .target-list .empty-target { opacity: 0.75; }

  .tool-card,
  .library-btn,
  .context-tabs button,
  .recipe-card {
    font-family: inherit;
  }

  .tool-card,
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

  .tool-card {
    min-height: 58px;
    display: grid;
    grid-template-columns: 38px minmax(0, 1fr);
    gap: 8px;
    align-items: center;
    padding: 6px 8px;
    text-align: left;
  }

  .tool-card strong {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 11px;
  }

  .shape-swatch {
    position: relative;
    width: 34px;
    height: 34px;
    border: 1px solid #3D4B55;
    border-radius: 5px;
    background: #101418;
    display: block;
  }

  .shape-swatch::after {
    content: '';
    position: absolute;
    inset: 9px 6px;
    background: #5B9BD5;
    border: 1px solid rgba(255, 255, 255, 0.24);
  }

  .shape-swatch.rounded::after { border-radius: 7px; }
  .shape-swatch.circle::after {
    inset: 7px;
    border-radius: 50%;
  }
  .shape-swatch.ring::after {
    inset: 7px;
    border-radius: 50%;
    background: transparent;
    border: 5px solid #5B9BD5;
  }
  .shape-swatch.capsule::after {
    inset: 10px 4px;
    border-radius: 999px;
  }
  .shape-swatch.text::after {
    content: 'T';
    inset: 5px;
    border: 0;
    background: transparent;
    color: #E6EEF4;
    font-size: 22px;
    font-weight: 700;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .library-btn:disabled {
    opacity: 0.45;
    cursor: default;
  }

  .tool-card:hover,
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

  .readiness-score,
  .readiness-status {
    width: 100%;
    min-height: 42px;
    border: 1px solid #57402B;
    border-radius: 5px;
    background: #241D17;
    color: #E8C08A;
    display: flex;
    flex-direction: column;
    justify-content: center;
    gap: 3px;
    padding: 6px 8px;
    box-sizing: border-box;
  }

  /* Compact one-line readiness signal shown in both Simple and Advanced. */
  .readiness-hint {
    width: 100%;
    display: flex;
    align-items: baseline;
    gap: 8px;
    padding: 5px 8px;
    border-radius: 5px;
    border: 1px solid #57402B;
    background: #241D17;
    color: #E8C08A;
    font-size: 11px;
  }

  .readiness-hint.ok {
    border-color: #2F573E;
    background: #162219;
    color: #A9DCB8;
  }

  .readiness-hint span {
    color: #9AA6AF;
    font-size: 10px;
  }

  .readiness-score.ok,
  .readiness-status.ok {
    border-color: #2F573E;
    background: #162219;
    color: #A9DCB8;
  }

  .readiness-score strong {
    color: #F4F7FA;
    font-size: 18px;
  }

  .readiness-score span,
  .readiness-status span {
    color: inherit;
    font-size: 10px;
  }

  .readiness-status strong {
    color: #F4F7FA;
    font-size: 12px;
  }

  .readiness-list,
  .readiness-next {
    display: grid;
    gap: 6px;
    width: 100%;
  }

  .readiness-list {
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }

  .readiness-item {
    min-width: 0;
    display: grid;
    gap: 3px;
  }

  .readiness-item > button:first-child {
    width: 100%;
  }

  .readiness-list .readiness-fix,
  .readiness-next .readiness-fix {
    min-height: 0;
    padding: 3px 7px;
    border-color: #2F573E;
    background: #14261B;
    color: #7FD79B;
    font-size: 10px;
    flex-direction: row;
    align-items: center;
  }

  .readiness-list .readiness-fix:hover,
  .readiness-next .readiness-fix:hover {
    border-color: #48A868;
    color: #C6F2D4;
  }

  .readiness-next {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .readiness-list button,
  .readiness-next button {
    min-width: 0;
    min-height: 52px;
    border: 1px solid #3A3430;
    border-radius: 5px;
    background: #211D19;
    color: #E8C08A;
    display: flex;
    flex-direction: column;
    gap: 4px;
    justify-content: center;
    padding: 7px;
    text-align: left;
    font-family: inherit;
    cursor: pointer;
  }

  .readiness-list button.done {
    border-color: #2F573E;
    background: #162219;
    color: #A9DCB8;
  }

  .readiness-list button.required:not(.done) {
    border-color: #6A3939;
    background: #251717;
    color: #E8A0A0;
  }

  .readiness-list button:hover,
  .readiness-next button:hover {
    border-color: #5B9BD5;
    color: #FFF;
  }

  .readiness-list span {
    color: inherit;
    font-size: 8px;
    text-transform: uppercase;
  }

  .readiness-list strong,
  .readiness-list em,
  .readiness-next strong,
  .readiness-next span {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-style: normal;
  }

  .readiness-list strong,
  .readiness-next strong {
    color: #F4F7FA;
    font-size: 11px;
  }

  .readiness-list em,
  .readiness-next span {
    color: inherit;
    font-size: 10px;
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

  .assistant-tray {
    margin: 8px;
    border: 1px solid #2F3A42;
    border-radius: 6px;
    background: #171B1F;
    overflow: hidden;
  }

  .starter-tray {
    margin: 8px;
    border: 1px solid #34424D;
    border-radius: 6px;
    background: #151A1F;
    overflow: hidden;
  }

  .starter-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    padding: 10px 12px;
    border-bottom: 1px solid #27313A;
  }

  .starter-apply {
    width: auto;
    min-width: 96px;
    padding: 0 10px;
  }

  .starter-selected {
    display: grid;
    grid-template-columns: 150px minmax(0, 1fr) 86px;
    gap: 10px;
    align-items: stretch;
    padding: 10px;
    border-bottom: 1px solid #27313A;
    background: #11171C;
  }

  .starter-size {
    display: flex;
    flex-direction: column;
    justify-content: center;
    gap: 4px;
    min-width: 0;
    color: #AAB7C0;
    font-size: 10px;
    text-align: right;
  }

  .starter-size strong,
  .starter-size em {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-style: normal;
  }

  .starter-size strong {
    color: #F4F7FA;
    font-size: 11px;
  }

  .starter-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 8px;
    padding: 10px;
  }

  .starter-card {
    display: flex;
    gap: 9px;
    align-items: stretch;
    min-height: 82px;
    border: 1px solid #2D363D;
    border-radius: 6px;
    background: #1D2227;
    color: #DDE6EC;
    text-align: left;
    padding: 8px;
    cursor: pointer;
    font-family: inherit;
  }

  .starter-card:hover,
  .starter-card.active {
    border-color: #6FA8D8;
    background: #202B34;
  }

  .starter-preview,
  .starter-mini {
    position: relative;
    border: 1px solid #35414B;
    border-radius: 6px;
    background: #0F1317;
    overflow: hidden;
  }

  .starter-preview {
    min-height: 92px;
  }

  .starter-mini {
    width: 54px;
    flex: 0 0 54px;
  }

  .starter-item,
  .starter-mini::before,
  .starter-mini::after {
    content: '';
    position: absolute;
    display: block;
  }

  .starter-preview.starter-rings .starter-item.a,
  .starter-preview.starter-rings .starter-item.b,
  .starter-preview.starter-rings .starter-item.c {
    border-radius: 50%;
    background: transparent;
  }

  /* Concentric, centred rings (was inset-based → elliptical + off-centre in a
     non-square preview box). */
  .starter-preview.starter-rings .starter-item.a,
  .starter-preview.starter-rings .starter-item.b,
  .starter-preview.starter-rings .starter-item.c {
    left: 50%;
    top: 50%;
  }

  .starter-preview.starter-rings .starter-item.a {
    width: 68px;
    height: 68px;
    margin: -34px 0 0 -34px;
    border: 7px solid #60A7D8;
  }

  .starter-preview.starter-rings .starter-item.b {
    width: 48px;
    height: 48px;
    margin: -24px 0 0 -24px;
    border: 7px solid #E5C06B;
  }

  .starter-preview.starter-rings .starter-item.c {
    width: 28px;
    height: 28px;
    margin: -14px 0 0 -14px;
    border: 7px solid #70C08F;
  }

  .starter-preview.starter-rings .starter-item.d {
    left: 50%;
    top: 50%;
    width: 4px;
    height: 34px;
    margin-left: -2px;
    border-radius: 999px;
    background: #EAF6FF;
    transform-origin: 2px 34px;
    transform: translateY(-34px) rotate(-32deg);
  }

  .starter-preview.starter-rings.animating .starter-item.d {
    animation: preview-rotate 1.8s ease-in-out infinite alternate;
  }

  .starter-preview.starter-circular .starter-item.a {
    left: 42px;
    top: 13px;
    width: 66px;
    height: 66px;
    border-radius: 50%;
    background: transparent;
    border: 7px solid #2B3742;
    box-shadow: 0 0 0 10px rgba(255,255,255,0.035);
  }

  .starter-preview.starter-circular .starter-item.b {
    left: 30px;
    top: 1px;
    width: 90px;
    height: 90px;
    border-radius: 50%;
    border: 0;
    background:
      repeating-conic-gradient(from 225deg, #C9D7E0 0deg 2deg, transparent 2deg 10deg),
      transparent;
    mask: radial-gradient(circle, transparent 44%, #000 45% 51%, transparent 52%);
  }

  .starter-preview.starter-circular .starter-item.c {
    left: 72px;
    top: 19px;
    width: 5px;
    height: 38px;
    border-radius: 999px;
    background: #EAF6FF;
    transform-origin: 3px 48px;
    transform: rotate(38deg);
  }

  .starter-preview.starter-circular .starter-item.d {
    left: 67px;
    top: 43px;
    width: 18px;
    height: 18px;
    border-radius: 50%;
    background: #E5C06B;
  }

  .starter-preview.starter-circular.animating .starter-item.c {
    animation: preview-rotate 1.8s ease-in-out infinite alternate;
  }

  .starter-preview.starter-dual .starter-item.a,
  .starter-preview.starter-dual .starter-item.b {
    left: 16px;
    width: 94px;
    height: 8px;
    border-radius: 999px;
    background: #29343D;
  }

  .starter-preview.starter-dual .starter-item.a { top: 30px; }
  .starter-preview.starter-dual .starter-item.b { top: 62px; }

  .starter-preview.starter-dual .starter-item.c,
  .starter-preview.starter-dual .starter-item.d {
    width: 20px;
    height: 20px;
    border-radius: 50%;
    background: #EAF6FF;
  }

  .starter-preview.starter-dual .starter-item.c { left: 40px; top: 24px; }
  .starter-preview.starter-dual .starter-item.d { left: 82px; top: 56px; background: #FFFFEDB3; }

  .starter-preview.starter-dual .starter-item.e {
    right: 14px;
    top: 26px;
    width: 28px;
    height: 48px;
    border-radius: 999px;
    background: #5B9BD5;
  }

  .starter-preview.starter-triple .starter-item.a {
    left: 16px;
    right: 16px;
    top: 48px;
    height: 8px;
    border-radius: 999px;
    background: #29343D;
  }

  .starter-preview.starter-triple .starter-item.b {
    left: 38px;
    top: 42px;
    width: 18px;
    height: 18px;
    border-radius: 50%;
    background: #70C08F;
  }

  .starter-preview.starter-triple .starter-item.c {
    left: 66px;
    top: 39px;
    width: 24px;
    height: 24px;
    border-radius: 50%;
    background: #EAF6FF;
  }

  .starter-preview.starter-triple .starter-item.d {
    left: 98px;
    top: 42px;
    width: 18px;
    height: 18px;
    border-radius: 50%;
    background: #E5C06B;
  }

  .starter-preview.starter-triple.animating .starter-item.c {
    animation: preview-slide 1.6s ease-in-out infinite alternate;
  }

  .starter-preview.starter-grid .starter-item.a {
    inset: 12px 24px;
    border: 0;
    background:
      linear-gradient(90deg, transparent 24%, rgba(255,255,255,0.22) 24% 25%, transparent 25% 49%, rgba(255,255,255,0.22) 49% 50%, transparent 50% 74%, rgba(255,255,255,0.22) 74% 75%, transparent 75%),
      linear-gradient(180deg, transparent 24%, rgba(255,255,255,0.22) 24% 25%, transparent 25% 49%, rgba(255,255,255,0.22) 49% 50%, transparent 50% 74%, rgba(255,255,255,0.22) 74% 75%, transparent 75%),
      #18212B;
  }

  .starter-preview.starter-grid .starter-item.b {
    left: 88px;
    top: 34px;
    width: 18px;
    height: 18px;
    border-radius: 50%;
    background: #E5C06B;
  }

  .starter-preview.starter-grid.animating .starter-item.b {
    animation: preview-slide 1.6s ease-in-out infinite alternate;
  }

  .starter-preview.starter-piano .starter-item.a {
    left: 10px;
    right: 10px;
    bottom: 15px;
    height: 50px;
    border: 0;
    background: repeating-linear-gradient(90deg, #EDEDE8 0 12px, #B9C1C7 12px 13px);
  }

  .starter-preview.starter-piano .starter-item.b {
    left: 28px;
    top: 18px;
    width: 8px;
    height: 36px;
    background: #111;
    box-shadow: 26px 0 #111, 39px 0 #111, 78px 0 #111, 91px 0 #111;
  }

  .starter-preview.starter-piano .starter-item.c {
    left: 36px;
    bottom: 5px;
    width: 44px;
    height: 5px;
    border-radius: 999px;
    background: #5B9BD5;
  }

  .starter-preview.starter-filmstrip .starter-item.a {
    left: 49px;
    top: 14px;
    width: 54px;
    height: 54px;
    border-radius: 50%;
    border: 6px solid #5B9BD5;
    background: #151B21;
  }

  .starter-preview.starter-filmstrip .starter-item.b {
    left: 73px;
    top: 22px;
    width: 5px;
    height: 35px;
    border-radius: 999px;
    background: #EAF6FF;
    transform-origin: 3px 34px;
    transform: rotate(-40deg);
  }

  .starter-preview.starter-filmstrip .starter-item.c {
    left: 18px;
    top: 18px;
    width: 15px;
    height: 56px;
    border-radius: 4px;
    background: repeating-linear-gradient(180deg, #5B9BD5 0 6px, #26313B 6px 12px);
  }

  .starter-preview.starter-filmstrip.animating .starter-item.b {
    animation: preview-rotate 1.8s ease-in-out infinite alternate;
  }


  .starter-mini.starter-rings::before {
    inset: 9px;
    border: 5px solid #60A7D8;
    border-radius: 50%;
  }

  .starter-mini.starter-rings::after {
    inset: 18px;
    border: 5px solid #E5C06B;
    border-radius: 50%;
  }

  .starter-mini.starter-circular::before {
    inset: 9px;
    border: 5px solid #5B9BD5;
    border-radius: 50%;
    box-shadow: 0 0 0 6px rgba(255,255,255,0.05);
  }

  .starter-mini.starter-circular::after {
    left: 26px;
    top: 12px;
    width: 4px;
    height: 27px;
    border-radius: 999px;
    background: #EAF6FF;
    transform-origin: 2px 25px;
    transform: rotate(36deg);
  }

  .starter-mini.starter-dual::before,
  .starter-mini.starter-dual::after {
    left: 8px;
    width: 38px;
    height: 7px;
    border-radius: 999px;
    background: #5B9BD5;
  }

  .starter-mini.starter-dual::before { top: 24px; }
  .starter-mini.starter-dual::after { top: 48px; background: #E5C06B; }

  .starter-mini.starter-triple::before {
    left: 7px;
    right: 7px;
    top: 34px;
    height: 7px;
    border-radius: 999px;
    background: #5B9BD5;
  }

  .starter-mini.starter-triple::after {
    left: 14px;
    top: 28px;
    width: 12px;
    height: 12px;
    border-radius: 50%;
    background: #70C08F;
    box-shadow: 14px 0 #EAF6FF, 28px 0 #E5C06B;
  }

  .starter-mini.starter-grid::before {
    inset: 8px;
    background:
      linear-gradient(90deg, transparent 32%, rgba(255,255,255,0.24) 32% 34%, transparent 34% 65%, rgba(255,255,255,0.24) 65% 67%, transparent 67%),
      linear-gradient(180deg, transparent 32%, rgba(255,255,255,0.24) 32% 34%, transparent 34% 65%, rgba(255,255,255,0.24) 65% 67%, transparent 67%),
      #18212B;
  }

  .starter-mini.starter-grid::after {
    right: 13px;
    top: 18px;
    width: 12px;
    height: 12px;
    border-radius: 50%;
    background: #E5C06B;
  }

  .starter-mini.starter-piano::before {
    left: 7px;
    right: 7px;
    bottom: 8px;
    height: 42px;
    background: repeating-linear-gradient(90deg, #EDEDE8 0 8px, #B9C1C7 8px 9px);
  }

  .starter-mini.starter-piano::after {
    left: 15px;
    top: 11px;
    width: 6px;
    height: 28px;
    background: #111;
    box-shadow: 18px 0 #111, 28px 0 #111;
  }

  .starter-mini.starter-filmstrip::before {
    left: 15px;
    top: 10px;
    width: 28px;
    height: 28px;
    border: 5px solid #5B9BD5;
    border-radius: 50%;
  }

  .starter-mini.starter-filmstrip::after {
    left: 8px;
    bottom: 8px;
    width: 40px;
    height: 8px;
    border-radius: 3px;
    background: repeating-linear-gradient(90deg, #5B9BD5 0 6px, #26313B 6px 12px);
  }

  .assistant-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    padding: 10px 12px;
    border-bottom: 1px solid #27313A;
  }

  .assistant-title {
    color: #E7EEF4;
    font-size: 12px;
    font-weight: 700;
  }

  .assistant-subtitle {
    margin-top: 2px;
    color: #8FA1AD;
    font-size: 10px;
  }

  .context-tabs {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    justify-content: flex-end;
  }

  .context-tabs button {
    border: 1px solid #343D45;
    background: #20262C;
    color: #B9C6CF;
    border-radius: 4px;
    padding: 4px 7px;
    font-size: 10px;
    cursor: pointer;
  }

  .context-tabs button.active,
  .context-tabs button:hover {
    border-color: #5B9BD5;
    color: #FFF;
  }

  .selected-recipe {
    display: grid;
    grid-template-columns: 144px minmax(0, 1fr) 72px;
    gap: 10px;
    align-items: stretch;
    padding: 10px;
    border-bottom: 1px solid #27313A;
    background: #151A1E;
  }

  .assistant-preview {
    position: relative;
    min-height: 88px;
    border: 1px solid #34424D;
    border-radius: 6px;
    background: #0F1317;
    overflow: hidden;
  }

  .preview-stage,
  .preview-item {
    position: absolute;
    display: block;
  }

  .preview-stage {
    inset: 10px;
  }

  .preview-item {
    background: #5B9BD5;
    border: 1px solid rgba(255, 255, 255, 0.24);
  }

  .assistant-preview.shape .a {
    left: 18px;
    top: 18px;
    width: 86px;
    height: 34px;
    border-radius: 8px;
  }

  .assistant-preview.ring .a {
    left: 38px;
    top: 6px;
    width: 48px;
    height: 48px;
    border-radius: 50%;
    background: transparent;
    border: 8px solid #5B9BD5;
  }

  .assistant-preview.rotate .a {
    left: 60px;
    top: 12px;
    width: 8px;
    height: 44px;
    border-radius: 999px;
    transform-origin: 4px 40px;
    transform: rotate(-35deg);
  }

  .assistant-preview.rotate.animating .a {
    animation: preview-rotate 1.8s ease-in-out infinite alternate;
  }

  .assistant-preview.track .a {
    left: 14px;
    top: 34px;
    width: 96px;
    height: 8px;
    border-radius: 999px;
    background: #26323B;
  }

  .assistant-preview.track .b {
    left: 52px;
    top: 26px;
    width: 24px;
    height: 24px;
    border-radius: 50%;
    background: #E6EEF4;
  }

  .assistant-preview.track.animating .b {
    animation: preview-slide 1.6s ease-in-out infinite alternate;
  }

  .assistant-preview.press .a {
    left: 44px;
    top: 18px;
    width: 38px;
    height: 30px;
    border-radius: 8px;
    background: #E6EEF4;
  }

  .assistant-preview.press.animating .a {
    animation: preview-press 0.9s ease-in-out infinite;
  }

  .assistant-preview.ticks .a {
    left: 12px;
    top: 44px;
    width: 100px;
    height: 2px;
    background: #34424D;
  }

  .assistant-preview.ticks .b {
    left: 16px;
    top: 30px;
    width: 92px;
    height: 24px;
    border: 0;
    background: repeating-linear-gradient(90deg, #C6D3DC 0 2px, transparent 2px 10px);
  }

  .assistant-preview.xy-grid .a {
    inset: 8px;
    border: 0;
    background:
      linear-gradient(90deg, transparent 24%, rgba(255,255,255,0.25) 24% 25%, transparent 25% 49%, rgba(255,255,255,0.25) 49% 50%, transparent 50% 74%, rgba(255,255,255,0.25) 74% 75%, transparent 75%),
      linear-gradient(180deg, transparent 24%, rgba(255,255,255,0.25) 24% 25%, transparent 25% 49%, rgba(255,255,255,0.25) 49% 50%, transparent 50% 74%, rgba(255,255,255,0.25) 74% 75%, transparent 75%),
      #182029;
  }

  .assistant-preview.xy-grid .b {
    left: 78px;
    top: 18px;
    width: 20px;
    height: 20px;
    border-radius: 50%;
    background: #E5C06B;
  }

  .assistant-preview.piano-bar .a {
    left: 8px;
    right: 8px;
    bottom: 8px;
    height: 48px;
    border: 0;
    background: repeating-linear-gradient(90deg, #EDEDE8 0 12px, #B9C1C7 12px 13px);
  }

  .assistant-preview.piano-bar .b {
    left: 22px;
    top: 8px;
    width: 8px;
    height: 34px;
    background: #111;
    box-shadow: 26px 0 #111, 39px 0 #111, 78px 0 #111, 91px 0 #111;
  }

  .assistant-preview.filmstrip .a {
    left: 44px;
    top: 8px;
    width: 38px;
    height: 58px;
    border-radius: 5px;
    background: repeating-linear-gradient(180deg, #5B9BD5 0 8px, #192633 8px 14px);
  }

  .assistant-preview.two-sliders .a,
  .assistant-preview.two-sliders .b {
    left: 12px;
    width: 78px;
    height: 8px;
    border-radius: 999px;
    background: #29343D;
  }

  .assistant-preview.two-sliders .a { top: 22px; }
  .assistant-preview.two-sliders .b { top: 48px; }

  .assistant-preview.two-sliders .c,
  .assistant-preview.two-sliders .d {
    width: 18px;
    height: 18px;
    border-radius: 50%;
    background: #E6EEF4;
  }

  .assistant-preview.two-sliders .c { left: 34px; top: 17px; }
  .assistant-preview.two-sliders .d { left: 70px; top: 43px; }

  .selected-copy {
    display: flex;
    flex-direction: column;
    min-width: 0;
    justify-content: center;
  }

  .selected-copy strong {
    color: #F4F7FA;
    font-size: 12px;
  }

  .selected-copy em {
    margin-top: 4px;
    color: #AAB7C0;
    font-style: normal;
    font-size: 10px;
    line-height: 1.35;
  }

  .creates-row {
    display: flex;
    flex-wrap: wrap;
    gap: 5px;
    margin-top: 8px;
  }

  .creates-row span {
    border: 1px solid #34424D;
    border-radius: 999px;
    color: #CDE1EE;
    background: #1C252C;
    padding: 3px 7px;
    font-size: 9px;
  }

  .apply-recipe-btn {
    align-self: center;
    width: 100%;
    min-height: 32px;
    border: 1px solid #5B9BD5;
    border-radius: 5px;
    background: #1D3A52;
    color: #F4F7FA;
    font-size: 11px;
    font-family: inherit;
    cursor: pointer;
  }

  .apply-recipe-btn:hover {
    background: #255071;
  }

  .recipe-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 8px;
    padding: 10px;
  }

  .recipe-card {
    display: flex;
    gap: 9px;
    align-items: stretch;
    min-height: 76px;
    border: 1px solid #2D363D;
    border-radius: 6px;
    background: #1D2227;
    color: #DDE6EC;
    text-align: left;
    padding: 8px;
    cursor: pointer;
  }

  .recipe-card:hover {
    border-color: #5B9BD5;
    background: #202B34;
  }

  .recipe-card.active {
    border-color: #6FA8D8;
    background: #202B34;
    box-shadow: inset 0 0 0 1px rgba(111, 168, 216, 0.32);
  }

  .recipe-preview {
    position: relative;
    width: 48px;
    border-radius: 5px;
    background: #101418;
    border: 1px solid #35414B;
    flex-shrink: 0;
    overflow: hidden;
  }

  .recipe-preview span {
    position: absolute;
    left: 10px;
    top: 24px;
    width: 28px;
    height: 18px;
    border-radius: 999px;
    background: #5B9BD5;
  }

  .recipe-preview.movement span {
    width: 22px;
    height: 4px;
    top: 36px;
    transform: rotate(-35deg);
    transform-origin: 4px 2px;
  }

  .recipe-preview.state span {
    width: 24px;
    height: 24px;
    top: 24px;
    border-radius: 50%;
    box-shadow: 0 0 0 6px rgba(91, 155, 213, 0.16);
  }

  .recipe-preview.asset span {
    width: 24px;
    height: 34px;
    top: 18px;
    border-radius: 4px;
    background: repeating-linear-gradient(180deg, #5B9BD5, #5B9BD5 5px, #1B364E 5px, #1B364E 9px);
  }

  .recipe-copy {
    display: flex;
    flex-direction: column;
    min-width: 0;
  }

  .recipe-copy strong {
    color: #F4F7FA;
    font-size: 11px;
  }

  .recipe-copy em {
    margin-top: 3px;
    color: #AAB7C0;
    font-style: normal;
    font-size: 10px;
    line-height: 1.35;
  }

  .recipe-copy small {
    margin-top: auto;
    color: #6FA8D8;
    font-size: 9px;
  }

  @keyframes preview-rotate {
    from { transform: rotate(-120deg); }
    to { transform: rotate(120deg); }
  }

  @keyframes preview-slide {
    from { transform: translateX(-34px); }
    to { transform: translateX(34px); }
  }

  @keyframes preview-press {
    0%, 100% { transform: scale(1); }
    45% { transform: scale(0.88); }
  }
</style>
