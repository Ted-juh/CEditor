<script>
  import {
    deviceProfiles,
    latestDumpParseResult,
    latestMidiPreview,
    latestProfileSourceSave,
    latestProfileSourceValidation,
    latestProfileTestResult,
    profileParameterDetails,
    profileParameterPages,
    profileParameters,
    profileSources,
    previewParameterMessage,
    parseProfileDump,
    refreshDeviceProfiles,
    refreshProfileParameters,
    requestProfileSource,
    requestProfileParameterDetail,
    runTestsForProfile,
    saveProfileParameter,
    saveProfileSource,
    validateProfileSource,
  } from '../stores/deviceProfiles.js';
  import { clearDeviceParameterDrag, startDeviceParameterDrag } from '../stores/deviceParameterDrag.js';
  import { activePanel } from '../stores/panels.js';
  import { getBindingCompatibility } from '../models/componentPorts.js';

  let { profileId = '' } = $props();

  let query = $state('');
  let activeView = $state('overview');
  let groupFilter = $state('all');
  let typeFilter = $state('all');
  let accessFilter = $state('all');
  let parameterOrderMode = $state('implementation');
  let parameterLayoutMode = $state('cards');
  let parameterEditorMode = $state('compact');
  let dumpOrderMode = $state('dump');
  let selectedParameterId = $state('');
  let previewValue = $state('');
  let sourceText = $state('');
  let sourceDirty = $state(false);
  let parameterDirty = $state(false);
  let selectedParameterDraft = $state(null);
  let selectedParameterDraftKey = $state('');
  let editableProfileDoc = $state(null);
  let loadedSourceText = $state('');
  let loadedSourceProfileId = $state('');
  let sourceLoadRequested = $state(false);
  let inspectorOpen = $state(false);
  let refreshStatus = $state(null);
  let dumpParseHex = $state('');
  let refreshStatusTimer = null;
  const parameterBatchSize = 160;
  let parameterVisibleLimit = $state(parameterBatchSize);
  let selectedProfile = $derived($deviceProfiles.find((profile) => profile.id === profileId) ?? null);
  let backendParameters = $derived($profileParameters?.[profileId] ?? []);
  let backendParameterPage = $derived($profileParameterPages?.[profileId] ?? null);
  let sourceProfile = $derived(editableProfileDoc);
  let usingEditableSource = $derived(!!sourceProfile);
  let selectedDetailKey = $derived(profileId && selectedParameterId ? `${profileId}:${selectedParameterId}` : '');
  let selectedParameterDetail = $derived(selectedDetailKey ? $profileParameterDetails?.[selectedDetailKey] ?? null : null);
  let sourceTextProfile = $derived(activeView === 'source' ? parseProfileSource(sourceText) : null);
  let sourceParseError = $derived(activeView === 'source' ? getProfileSourceParseError(sourceText) : '');
  let parameters = $derived(Array.isArray(sourceProfile?.parameters) ? sourceProfile.parameters : backendParameters);
  let messageRecipes = $derived(Array.isArray(sourceProfile?.messageRecipes) ? sourceProfile.messageRecipes : []);
  let messageRecipeIds = $derived(messageRecipes.map((recipe) => String(recipe?.id ?? '').trim()).filter(Boolean));
  let profileTests = $derived(Array.isArray(sourceProfile?.tests) ? sourceProfile.tests : []);
  let dumpDefinitions = $derived(Array.isArray(sourceProfile?.dumpDefinitions) ? sourceProfile.dumpDefinitions : []);
  let selectedParameter = $derived(
    selectedParameterDraftKey === selectedDetailKey && selectedParameterDraft
      ? selectedParameterDraft
      : selectedParameterDetail?.parameter
      ?? parameters.find((parameter) => parameter.id === selectedParameterId)
      ?? parameters[0]
      ?? null
  );
  let parameterGroups = $derived(usingEditableSource
    ? uniqueSorted(parameters.map((parameter) => parameter.group || 'Ungrouped'))
    : uniqueSorted(backendParameterPage?.groups ?? parameters.map((parameter) => parameter.group || 'Ungrouped')));
  let parameterTypes = $derived(usingEditableSource
    ? uniqueSorted(parameters.map((parameter) => parameter.type || 'unknown'))
    : uniqueSorted(backendParameterPage?.types ?? parameters.map((parameter) => parameter.type || 'unknown')));
  let parameterIdCounts = $derived(buildParameterIdCounts(parameters));
  let filteredParameters = $derived(parameters.filter((parameter) => {
    const needle = query.trim().toLowerCase();
    const group = parameter.group || 'Ungrouped';
    const type = parameter.type || 'unknown';
    const writable = parameter?.access?.canWrite !== false;
    const realtimeSafe = parameter?.access?.realtimeSafe !== false;

    if (groupFilter !== 'all' && group !== groupFilter) return false;
    if (typeFilter !== 'all' && type !== typeFilter) return false;
    if (accessFilter === 'writable' && !writable) return false;
    if (accessFilter === 'readonly' && writable) return false;
    if (accessFilter === 'realtimeWarning' && realtimeSafe) return false;

    if (!needle) return true;
    return [
      parameter.id,
      parameter.name,
      parameter.group,
      parameter.type,
      parameter?.messageRecipe,
      parameter?.ui?.preferredComponent,
    ].some((value) => String(value ?? '').toLowerCase().includes(needle));
  }));
  let orderedParameters = $derived(orderParameters(filteredParameters, parameterOrderMode));
  let profileTestResult = $derived(
    $latestProfileTestResult?.profileId && $latestProfileTestResult.profileId !== profileId
      ? null
      : $latestProfileTestResult
  );
  let profileStats = $derived(buildProfileStats(parameters, profileTestResult, usingEditableSource ? null : backendParameterPage));
  let profileQualityChecks = $derived(buildProfileQualityChecks(selectedProfile, parameters, profileTestResult));
  let qualitySummary = $derived(summarizeQuality(profileQualityChecks, parameters.length));
  let visibleParameters = $derived(orderedParameters.slice(0, parameterVisibleLimit));
  let groupedParameters = $derived(groupParameters(visibleParameters, parameterOrderMode));
  let orderedDumpDefinitions = $derived(orderDumps(dumpDefinitions, dumpOrderMode));
  let hiddenParameterCount = $derived(Math.max(0, orderedParameters.length - visibleParameters.length));
  let hasMoreParameters = $derived(hiddenParameterCount > 0);
  let hasMoreBackendParameters = $derived(!usingEditableSource && backendParameterPage?.hasMore === true);
  let parameterCountLabel = $derived(
    hasMoreBackendParameters
      ? `${backendParameterPage?.loaded ?? visibleParameters.length} of ${backendParameterPage?.total ?? filteredParameters.length} loaded`
      : hasMoreParameters
      ? `${visibleParameters.length} of ${filteredParameters.length} shown`
      : `${filteredParameters.length} shown`
  );
  let parameterWindowKey = $derived([
    profileId,
    activeView,
    query.trim(),
    groupFilter,
    typeFilter,
    accessFilter,
    parameterOrderMode,
  ].join('|'));
  let testResults = $derived(Array.isArray(profileTestResult?.results) ? profileTestResult.results : []);
  let selectedParameterJson = $derived(
    selectedParameter ? JSON.stringify(selectedParameter, null, 2) : ''
  );
  let selectedParameterIssues = $derived(buildParameterIssues(selectedParameter));
  let selectedParameterFieldIssues = $derived(buildParameterFieldIssues(selectedParameter, messageRecipes, parameterIdCounts));
  let recipeInlineIssues = $derived(messageRecipes.map((recipe, index) => buildRecipeIssues(recipe, messageRecipes, index)));
  let testInlineIssues = $derived(profileTests.map((test, index) => buildTestIssues(test, parameters, profileTests, index)));
  let selectedRecipe = $derived(findRecipeForParameter(selectedParameter, messageRecipes));
  let selectedParameterTests = $derived(findTestsForParameter(selectedParameter, profileTests, testResults));
  let selectedParameterUses = $derived(findPanelUsesForParameter($activePanel, selectedParameter));
  let selectedDiagnostics = $derived(buildSelectedDiagnostics(
    selectedParameter,
    selectedRecipe,
    selectedParameterFieldIssues,
    selectedParameterTests,
    selectedParameterUses
  ));
  let workflowChecks = $derived(buildWorkflowChecks(sourceProfile, parameters, messageRecipes, recipeInlineIssues, profileTests, testInlineIssues));
  let persistenceChecks = $derived(buildPersistenceChecks(
    profileSource,
    sourceDirty,
    sourceParseError,
    sourceValidation,
    sourceSave,
    sourceCanSave
  ));
  let selectedPreview = $derived(
    $latestMidiPreview?.parameterId && $latestMidiPreview.parameterId !== selectedParameter?.id
      ? null
      : $latestMidiPreview
  );
  let profileSource = $derived($profileSources?.[profileId] ?? null);
  let sourceValidation = $derived(
    $latestProfileSourceValidation?.profileId && $latestProfileSourceValidation.profileId !== profileId
      ? null
      : $latestProfileSourceValidation
  );
  let sourceSave = $derived(
    $latestProfileSourceSave?.profileId && $latestProfileSourceSave.profileId !== profileId
      ? null
      : $latestProfileSourceSave
  );
  let sourceValidationItems = $derived(Array.isArray(sourceValidation?.validation) ? sourceValidation.validation : []);
  let saveActionStatus = $derived(getSaveActionStatus(sourceDirty || parameterDirty, sourceSave));
  let validationActionStatus = $derived(getValidationActionStatus(sourceValidation));
  let refreshActionStatus = $derived(getRefreshActionStatus(refreshStatus));
  let testActionStatus = $derived(getTestActionStatus(profileTestResult));
  let dumpParseResult = $derived(
    $latestDumpParseResult?.profileId && $latestDumpParseResult.profileId !== profileId
      ? null
      : $latestDumpParseResult
  );
  let editSourceStatus = $derived(getEditSourceStatus(editableProfileDoc, sourceLoadRequested, profileSource));
  let sourceCanSave = $derived(
    (sourceDirty || parameterDirty)
      && !sourceParseError
      && (!currentSaveProfileId(sourceTextProfile, sourceProfile) || currentSaveProfileId(sourceTextProfile, sourceProfile) === profileId)
      && sourceSave?.running !== true
  );
  let showInspectorPanel = $derived((activeView === 'parameters' || activeView === 'compatibility') && !!selectedParameter);
  let sourceLocationLabel = $derived(
    profileSource?.filePath
      || selectedProfile?.filePath
      || (sourceText || editableProfileDoc ? 'Local draft source' : 'No source loaded')
  );
  let guidedSteps = $derived(buildGuidedSteps({
    activeView,
    sourceProfile,
    selectedProfile,
    parameters,
    messageRecipes,
    profileTests,
    profileTestResult,
    sourceValidation,
    sourceSave,
    sourceDirty,
    parameterDirty,
  }));

  $effect(() => {
    if (!profileId) return;
    if (loadedSourceProfileId && loadedSourceProfileId !== profileId) {
      sourceText = '';
      sourceDirty = false;
      parameterDirty = false;
      selectedParameterDraft = null;
      selectedParameterDraftKey = '';
      editableProfileDoc = null;
      loadedSourceText = '';
      sourceLoadRequested = false;
      selectedParameterId = '';
      previewValue = '';
    }
    refreshProfileParameters(profileId, 'mainSynth', {
      offset: 0,
      limit: parameterBatchSize,
      query,
      group: groupFilter,
      type: typeFilter,
      access: accessFilter,
    });
  });

  $effect(() => {
    if (!profileSource || !profileId) return;
    if (loadedSourceProfileId === profileId && sourceDirty) return;
    const nextSourceText = profileSource.source ?? '';
    loadedSourceProfileId = profileId;
    loadedSourceText = nextSourceText;
    sourceText = activeView === 'source' ? nextSourceText : '';
    editableProfileDoc = parseProfileSource(nextSourceText);
    sourceLoadRequested = false;
    sourceDirty = false;
  });

  $effect(() => {
    if (sourceSave?.ok !== true || sourceSave?.profileId !== profileId) return;
    loadedSourceText = currentProfileSourceText();
    sourceDirty = false;
    parameterDirty = false;
  });

  $effect(() => {
    if (!selectedParameterId && parameters[0]?.id) selectedParameterId = parameters[0].id;
    if (selectedParameterId && parameters.length > 0 && !parameters.some((parameter) => parameter.id === selectedParameterId)) {
      selectedParameterId = parameters[0].id;
    }
  });

  $effect(() => {
    if (!selectedParameter) return;
    previewValue = defaultPreviewValue(selectedParameter);
  });

  $effect(() => {
    if (!profileId || !selectedParameterId || usingEditableSource) return;
    if (selectedParameterDetail?.parameterId === selectedParameterId) return;
    requestProfileParameterDetail(profileId, selectedParameterId);
  });

  $effect(() => {
    if (!selectedDetailKey || !selectedParameterDetail?.parameter || usingEditableSource) return;
    if (selectedParameterDraftKey === selectedDetailKey) return;
    selectedParameterDraft = structuredClone(selectedParameterDetail.parameter);
    selectedParameterDraftKey = selectedDetailKey;
    parameterDirty = false;
  });

  $effect(() => {
    parameterWindowKey;
    parameterVisibleLimit = parameterBatchSize;
  });

  function buildProfileStats(list, testResult, pageMeta = null) {
    const groups = new Set();
    const typeCounts = new Map();
    let writable = 0;
    let realtimeUnsafe = 0;
    let continuous = 0;
    let commit = 0;
    let action = 0;

    for (const parameter of list ?? []) {
      if (parameter?.group) groups.add(parameter.group);
      const type = String(parameter?.type || 'unknown');
      typeCounts.set(type, (typeCounts.get(type) ?? 0) + 1);
      if (parameter?.access?.canWrite !== false) writable += 1;
      if (parameter?.access?.realtimeSafe === false) realtimeUnsafe += 1;
      const mode = String(parameter?.sendPolicy?.mode ?? '');
      if (mode === 'continuous') continuous += 1;
      else if (mode === 'explicitAction') action += 1;
      else if (mode) commit += 1;
    }

    const testsRunning = testResult?.running === true;
    const testsTotal = Number(testResult?.total ?? 0);
    const testsPassed = Number(testResult?.passed ?? 0);

    return {
      total: Number(pageMeta?.total ?? list?.length ?? 0),
      groups: groups.size,
      writable,
      realtimeUnsafe,
      continuous,
      commit,
      action,
      tests: testsRunning ? 'Running' : testsTotal > 0 ? `${testsPassed}/${testsTotal}` : 'Not run',
      types: [...typeCounts.entries()]
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([type, count]) => `${type} ${count}`)
        .join(' / ') || 'none',
    };
  }

  function uniqueSorted(values) {
    return [...new Set((values ?? []).map((value) => String(value ?? '').trim()).filter(Boolean))]
      .sort((left, right) => left.localeCompare(right));
  }

  function parseProfileSource(text) {
    if (!String(text ?? '').trim()) return null;
    try {
      const parsed = JSON.parse(text);
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }

  function getProfileSourceParseError(text) {
    if (!String(text ?? '').trim()) return '';
    try {
      JSON.parse(text);
      return '';
    } catch (error) {
      return error?.message || 'Invalid JSON';
    }
  }

  function currentSaveProfileId(textProfile, docProfile) {
    return activeView === 'source' ? textProfile?.id : docProfile?.id;
  }

  function currentProfileSourceText() {
    if (activeView === 'source') return sourceText;
    if (editableProfileDoc) return JSON.stringify(editableProfileDoc, null, 2);
    return loadedSourceText || profileSource?.source || '';
  }

  function loadEditableSource() {
    if (!profileId || sourceLoadRequested || editableProfileDoc) return;
    sourceLoadRequested = true;
    requestProfileSource(profileId);
  }

  function loadEditableSourceForEdit() {
    loadEditableSource();
  }

  function setActiveView(view) {
    activeView = view;
    if (view === 'source') {
      loadEditableSource();
      sourceText = editableProfileDoc ? JSON.stringify(editableProfileDoc, null, 2) : loadedSourceText;
    }
  }

  function commitProfileDocument(nextProfile) {
    editableProfileDoc = nextProfile;
    if (activeView === 'source') {
      sourceText = JSON.stringify(nextProfile, null, 2);
      sourceDirty = sourceText !== loadedSourceText;
      return;
    }
    sourceDirty = true;
  }

  function editableProfile() {
    const baseProfile = sourceProfile;
    if (baseProfile) return {
      ...baseProfile,
      variables: { ...(baseProfile.variables ?? {}) },
      timing: { ...(baseProfile.timing ?? {}) },
      coverage: { ...(baseProfile.coverage ?? {}) },
      parameters: Array.isArray(baseProfile.parameters) ? [...baseProfile.parameters] : [],
      messageRecipes: Array.isArray(baseProfile.messageRecipes) ? [...baseProfile.messageRecipes] : [],
      tests: Array.isArray(baseProfile.tests) ? [...baseProfile.tests] : [],
    };
    loadEditableSource();
    return null;
  }

  function updateProfileField(field, value) {
    const next = editableProfile();
    if (!next) return;
    next[field] = value;
    commitProfileDocument(next);
  }

  function updateNestedProfileField(parent, field, value) {
    const next = editableProfile();
    if (!next) return;
    next[parent] = { ...(next[parent] ?? {}), [field]: value };
    commitProfileDocument(next);
  }

  function updateSelectedParameter(updater) {
    if (!selectedParameter?.id) return;
    if (!usingEditableSource) {
      selectedParameterDraft = updater(structuredClone(selectedParameter));
      selectedParameterDraftKey = selectedDetailKey;
      parameterDirty = true;
      return;
    }
    const next = editableProfile();
    if (!next) return;
    const list = Array.isArray(next.parameters) ? [...next.parameters] : [];
    const index = list.findIndex((parameter) => parameter?.id === selectedParameter.id);
    if (index < 0) return;
    list[index] = updater({ ...list[index] });
    next.parameters = list;
    commitProfileDocument(next);
  }

  function updateSelectedParameterField(field, value) {
    updateSelectedParameter((parameter) => ({ ...parameter, [field]: value }));
  }

  function updateSelectedParameterRange(field, value) {
    updateSelectedParameter((parameter) => ({
      ...parameter,
      range: {
        ...(parameter.range ?? {}),
        [field]: numberOrString(value),
      },
    }));
  }

  function updateSelectedParameterAccess(field, value) {
    updateSelectedParameter((parameter) => ({
      ...parameter,
      access: {
        ...(parameter.access ?? {}),
        [field]: value,
      },
    }));
  }

  function updateSelectedParameterSendPolicy(field, value) {
    updateSelectedParameter((parameter) => ({
      ...parameter,
      sendPolicy: {
        ...(parameter.sendPolicy ?? {}),
        [field]: value,
      },
    }));
  }

  function updateSelectedParameterUi(field, value) {
    updateSelectedParameter((parameter) => ({
      ...parameter,
      ui: {
        ...(parameter.ui ?? {}),
        [field]: value,
      },
    }));
  }

  function updateSelectedParameterDisplay(field, value) {
    updateSelectedParameter((parameter) => ({
      ...parameter,
      display: {
        ...(parameter.display ?? {}),
        [field]: value,
      },
    }));
  }

  function updateSelectedParameterEncoding(field, value) {
    updateSelectedParameter((parameter) => ({
      ...parameter,
      encoding: {
        ...(parameter.encoding ?? {}),
        [field]: value,
      },
    }));
  }

  function updateSelectedParameterChoice(index, field, value) {
    updateSelectedParameter((parameter) => {
      const choices = Array.isArray(parameter.choices) ? [...parameter.choices] : [];
      choices[index] = { ...(choices[index] ?? {}), [field]: field === 'value' ? numberOrString(value) : value };
      return { ...parameter, choices };
    });
  }

  function addChoice() {
    updateSelectedParameter((parameter) => {
      const choices = Array.isArray(parameter.choices) ? [...parameter.choices] : [];
      const nextIndex = choices.length;
      choices.push({ id: `choice_${nextIndex + 1}`, label: `Choice ${nextIndex + 1}`, value: nextIndex });
      return { ...parameter, choices };
    });
  }

  function removeChoice(index) {
    updateSelectedParameter((parameter) => ({
      ...parameter,
      choices: (Array.isArray(parameter.choices) ? parameter.choices : []).filter((_, choiceIndex) => choiceIndex !== index),
    }));
  }

  function addParameter() {
    const next = editableProfile();
    if (!next) return;
    const list = Array.isArray(next.parameters) ? [...next.parameters] : [];
    const id = uniqueId('parameter.new', list.map((parameter) => parameter?.id));
    const parameter = {
      id,
      name: 'New Parameter',
      group: 'User',
      type: 'integer',
      range: { min: 0, max: 127 },
      default: 0,
      display: { mode: 'number', shortLabel: 'New' },
      encoding: { type: 'u7' },
      access: { canRead: true, canWrite: true, realtimeSafe: true, source: 'singleParameter' },
      sendPolicy: { mode: 'continuous', coalesce: true, minIntervalMs: 20, sendFinalOnRelease: true },
      messageRecipe: '',
      ui: { preferredComponent: 'Slider' },
    };
    list.push(parameter);
    next.parameters = list;
    selectedParameterId = id;
    commitProfileDocument(next);
  }

  function duplicateSelectedParameter() {
    if (!selectedParameter) return;
    const next = editableProfile();
    if (!next) return;
    const list = Array.isArray(next.parameters) ? [...next.parameters] : [];
    const id = uniqueId(`${selectedParameter.id}.copy`, list.map((parameter) => parameter?.id));
    const clone = structuredClone(selectedParameter);
    clone.id = id;
    clone.name = `${selectedParameter.name || selectedParameter.id} Copy`;
    list.push(clone);
    next.parameters = list;
    selectedParameterId = id;
    commitProfileDocument(next);
  }

  function deleteSelectedParameter() {
    if (!selectedParameter?.id) return;
    const next = editableProfile();
    if (!next) return;
    next.parameters = (Array.isArray(next.parameters) ? next.parameters : []).filter((parameter) => parameter?.id !== selectedParameter.id);
    selectedParameterId = next.parameters[0]?.id ?? '';
    commitProfileDocument(next);
  }

  function addTestVector() {
    const next = editableProfile();
    if (!next) return;
    const list = Array.isArray(next.tests) ? [...next.tests] : [];
    const parameterId = selectedParameter?.id || parameters[0]?.id || '';
    list.push({
      name: parameterId ? `${parameterId} test` : 'New Test',
      parameter: parameterId,
      value: selectedParameter ? parsePreviewValue(selectedParameter, defaultPreviewValue(selectedParameter)) : 0,
      expectedHex: '',
    });
    next.tests = list;
    commitProfileDocument(next);
  }

  function updateTestVector(index, field, value) {
    const next = editableProfile();
    if (!next) return;
    const list = Array.isArray(next.tests) ? [...next.tests] : [];
    list[index] = { ...(list[index] ?? {}), [field]: field === 'value' ? parseTestValue(value) : value };
    next.tests = list;
    commitProfileDocument(next);
  }

  function removeTestVector(index) {
    const next = editableProfile();
    if (!next) return;
    next.tests = (Array.isArray(next.tests) ? next.tests : []).filter((_, testIndex) => testIndex !== index);
    commitProfileDocument(next);
  }

  function parseTestValue(value) {
    const raw = String(value ?? '').trim();
    if (raw === 'true') return true;
    if (raw === 'false') return false;
    const numeric = Number(raw);
    return Number.isFinite(numeric) && raw !== '' ? numeric : value;
  }

  function addCcRecipe() {
    const next = editableProfile();
    if (!next) return;
    const list = Array.isArray(next.messageRecipes) ? [...next.messageRecipes] : [];
    const id = uniqueId('newCc', list.map((recipe) => recipe?.id));
    list.push({ id, kind: 'cc', channel: '$channel', controller: 0, value: '$encodedValue' });
    next.messageRecipes = list;
    commitProfileDocument(next);
  }

  function addNrpnRecipe() {
    const next = editableProfile();
    if (!next) return;
    const list = Array.isArray(next.messageRecipes) ? [...next.messageRecipes] : [];
    const id = uniqueId('newNrpn', list.map((recipe) => recipe?.id));
    list.push({
      id,
      kind: 'nrpn',
      channel: '$channel',
      parameterMsb: 0,
      parameterLsb: 0,
      value: '$encodedValue',
    });
    next.messageRecipes = list;
    commitProfileDocument(next);
  }

  function addSysexRecipe() {
    const next = editableProfile();
    if (!next) return;
    const list = Array.isArray(next.messageRecipes) ? [...next.messageRecipes] : [];
    const id = uniqueId('newSysex', list.map((recipe) => recipe?.id));
    list.push({
      id,
      kind: 'sysex',
      template: ['F0', '7D', '$deviceId', '$address', '$encodedValue', '$checksum', 'F7'],
      checksum: { type: 'sum-7bit', from: '$address', to: '$encodedValue' },
      delayAfterMs: 20,
    });
    next.messageRecipes = list;
    commitProfileDocument(next);
  }

  function addDumpDefinition() {
    const next = editableProfile();
    if (!next) return;
    const list = Array.isArray(next.dumpDefinitions) ? [...next.dumpDefinitions] : [];
    const id = uniqueId('currentPatchDump', list.map((dump) => dump?.id));
    list.push({
      id,
      name: 'Current Patch Dump',
      kind: 'sysex',
      matcher: {
        prefix: ['F0', '7D', '$deviceId', '01'],
        suffix: ['F7'],
      },
      payload: {
        offset: 4,
      },
      checksum: {
        type: 'sum-7bit',
        fromOffset: 3,
        toOffset: 5,
        byteOffset: 6,
      },
      mappings: [],
    });
    next.dumpDefinitions = list;
    commitProfileDocument(next);
  }

  function updateDumpDefinition(index, field, value) {
    const next = editableProfile();
    if (!next) return;
    const list = Array.isArray(next.dumpDefinitions) ? [...next.dumpDefinitions] : [];
    list[index] = { ...(list[index] ?? {}), [field]: value };
    next.dumpDefinitions = list;
    commitProfileDocument(next);
  }

  function updateDumpNested(index, parent, field, value) {
    const next = editableProfile();
    if (!next) return;
    const list = Array.isArray(next.dumpDefinitions) ? [...next.dumpDefinitions] : [];
    const dump = { ...(list[index] ?? {}) };
    dump[parent] = { ...(dump[parent] ?? {}), [field]: field.toLowerCase().includes('offset') ? numberOrString(value) : tokenListOrText(value) };
    list[index] = dump;
    next.dumpDefinitions = list;
    commitProfileDocument(next);
  }

  function addDumpMapping(index) {
    const next = editableProfile();
    if (!next) return;
    const list = Array.isArray(next.dumpDefinitions) ? [...next.dumpDefinitions] : [];
    const dump = { ...(list[index] ?? {}) };
    const mappings = Array.isArray(dump.mappings) ? [...dump.mappings] : [];
    mappings.push({ parameter: selectedParameter?.id || parameters[0]?.id || '', offset: 0 });
    dump.mappings = mappings;
    list[index] = dump;
    next.dumpDefinitions = list;
    commitProfileDocument(next);
  }

  function updateDumpMapping(dumpIndex, mappingIndex, field, value) {
    const next = editableProfile();
    if (!next) return;
    const list = Array.isArray(next.dumpDefinitions) ? [...next.dumpDefinitions] : [];
    const dump = { ...(list[dumpIndex] ?? {}) };
    const mappings = Array.isArray(dump.mappings) ? [...dump.mappings] : [];
    mappings[mappingIndex] = {
      ...(mappings[mappingIndex] ?? {}),
      [field]: field === 'offset' ? numberOrString(value) : value,
    };
    dump.mappings = mappings;
    list[dumpIndex] = dump;
    next.dumpDefinitions = list;
    commitProfileDocument(next);
  }

  function removeDumpMapping(dumpIndex, mappingIndex) {
    const next = editableProfile();
    if (!next) return;
    const list = Array.isArray(next.dumpDefinitions) ? [...next.dumpDefinitions] : [];
    const dump = { ...(list[dumpIndex] ?? {}) };
    dump.mappings = (Array.isArray(dump.mappings) ? dump.mappings : []).filter((_, index) => index !== mappingIndex);
    list[dumpIndex] = dump;
    next.dumpDefinitions = list;
    commitProfileDocument(next);
  }

  function removeDumpDefinition(index) {
    const next = editableProfile();
    if (!next) return;
    next.dumpDefinitions = (Array.isArray(next.dumpDefinitions) ? next.dumpDefinitions : []).filter((_, dumpIndex) => dumpIndex !== index);
    commitProfileDocument(next);
  }

  function addStarterCcSpine() {
    const next = editableProfile();
    if (!next) return;
    const recipeId = 'ccFilterCutoff';
    const parameterId = 'filter.cutoff';
    const recipes = Array.isArray(next.messageRecipes) ? [...next.messageRecipes] : [];
    const parametersList = Array.isArray(next.parameters) ? [...next.parameters] : [];
    const tests = Array.isArray(next.tests) ? [...next.tests] : [];

    next.manufacturer = next.manufacturer || 'Example';
    next.name = next.name || 'Starter CC Synth';
    next.family = next.family || 'MIDI CC';
    next.status = next.status || 'draft';
    next.trust = next.trust || 'local';
    next.variables = { channel: 1, ...(next.variables ?? {}) };
    next.coverage = {
      singleParameterWrite: 'partial',
      realtimeEditing: 'partial',
      ...(next.coverage ?? {}),
    };
    next.timing = { minDelayBetweenMessagesMs: 0, ...(next.timing ?? {}) };

    if (!recipes.some((recipe) => recipe?.id === recipeId)) {
      recipes.push({
        id: recipeId,
        kind: 'cc',
        channel: '$channel',
        controller: 74,
        value: '$encodedValue',
      });
    }

    if (!parametersList.some((parameter) => parameter?.id === parameterId)) {
      parametersList.push({
        id: parameterId,
        name: 'Filter Cutoff',
        group: 'Filter',
        type: 'integer',
        range: { min: 0, max: 127 },
        default: 64,
        display: { mode: 'number', shortLabel: 'Cutoff' },
        encoding: { type: 'u7' },
        access: { canRead: true, canWrite: true, realtimeSafe: true, source: 'singleParameter' },
        sendPolicy: { mode: 'continuous', coalesce: true, minIntervalMs: 20, sendFinalOnRelease: true },
        messageRecipe: recipeId,
        ui: { preferredComponent: 'Slider' },
      });
    }

    if (!tests.some((test) => test?.name === 'Filter Cutoff 64')) {
      tests.push({
        name: 'Filter Cutoff 64',
        parameter: parameterId,
        value: 64,
        expectedHex: 'B0 4A 40',
      });
    }

    next.messageRecipes = recipes;
    next.parameters = parametersList;
    next.tests = tests;
    selectedParameterId = parameterId;
    commitProfileDocument(next);
  }

  function updateRecipe(index, field, value) {
    const next = editableProfile();
    if (!next) return;
    const list = Array.isArray(next.messageRecipes) ? [...next.messageRecipes] : [];
    list[index] = { ...(list[index] ?? {}), [field]: numericRecipeFields.has(field) ? numberOrString(value) : value };
    next.messageRecipes = list;
    commitProfileDocument(next);
  }

  const numericRecipeFields = new Set([
    'controller',
    'parameterMsb',
    'parameterLsb',
    'address',
    'valueAddress',
    'delayAfterMs',
  ]);

  const sysexTokenPalette = [
    'F0',
    'F7',
    '7D',
    '$channel',
    '$deviceId',
    '$address',
    '$encodedValue',
    '$checksum',
  ];

  function recipeTemplateText(recipe) {
    const template = recipe?.template ?? recipe?.bytes ?? [];
    return Array.isArray(template)
      ? template.map((item) => String(item)).join(' ')
      : String(template ?? '');
  }

  function recipeTemplateTokens(recipe) {
    const template = recipe?.template ?? recipe?.bytes ?? [];
    if (Array.isArray(template)) return template.map((item) => String(item));
    return String(template ?? '')
      .split(/[\s,]+/)
      .map((token) => token.trim())
      .filter(Boolean);
  }

  function updateRecipeTemplate(index, value) {
    const tokens = String(value ?? '')
      .split(/[\s,]+/)
      .map((token) => token.trim())
      .filter(Boolean);
    updateRecipe(index, 'template', tokens);
  }

  function setRecipeTemplateTokens(index, tokens) {
    updateRecipe(index, 'template', tokens.map((token) => String(token ?? '').trim()).filter(Boolean));
  }

  function addRecipeTemplateToken(index, token) {
    const current = recipeTemplateTokens(messageRecipes[index]);
    const nextToken = String(token ?? '').trim();
    if (!nextToken) return;
    setRecipeTemplateTokens(index, [...current, nextToken]);
  }

  function updateRecipeTemplateToken(index, tokenIndex, value) {
    const current = recipeTemplateTokens(messageRecipes[index]);
    current[tokenIndex] = String(value ?? '').trim();
    setRecipeTemplateTokens(index, current);
  }

  function removeRecipeTemplateToken(index, tokenIndex) {
    setRecipeTemplateTokens(index, recipeTemplateTokens(messageRecipes[index]).filter((_, itemIndex) => itemIndex !== tokenIndex));
  }

  function moveRecipeTemplateToken(index, tokenIndex, direction) {
    const current = recipeTemplateTokens(messageRecipes[index]);
    const targetIndex = tokenIndex + direction;
    if (targetIndex < 0 || targetIndex >= current.length) return;
    const [token] = current.splice(tokenIndex, 1);
    current.splice(targetIndex, 0, token);
    setRecipeTemplateTokens(index, current);
  }

  function handleCustomSysexTokenKeydown(event, index) {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    addRecipeTemplateToken(index, event.currentTarget.value);
    event.currentTarget.value = '';
  }

  function recipeChecksumType(recipe) {
    if (!recipe?.checksum) return '';
    return typeof recipe.checksum === 'object' ? String(recipe.checksum.type ?? '') : String(recipe.checksum);
  }

  function recipeChecksumField(recipe, field) {
    return recipe?.checksum && typeof recipe.checksum === 'object'
      ? String(recipe.checksum[field] ?? '')
      : '';
  }

  function updateRecipeChecksum(index, field, value) {
    const next = editableProfile();
    if (!next) return;
    const list = Array.isArray(next.messageRecipes) ? [...next.messageRecipes] : [];
    const recipe = { ...(list[index] ?? {}) };
    const current = recipe.checksum && typeof recipe.checksum === 'object'
      ? { ...recipe.checksum }
      : {};

    if (field === 'type' && !value) {
      delete recipe.checksum;
    } else {
      recipe.checksum = { ...current, [field]: value };
    }

    list[index] = recipe;
    next.messageRecipes = list;
    commitProfileDocument(next);
  }

  function removeRecipe(index) {
    const next = editableProfile();
    if (!next) return;
    next.messageRecipes = (Array.isArray(next.messageRecipes) ? next.messageRecipes : []).filter((_, recipeIndex) => recipeIndex !== index);
    commitProfileDocument(next);
  }

  function uniqueId(base, existingIds) {
    const existing = new Set((existingIds ?? []).map((id) => String(id ?? '')));
    let candidate = base;
    let index = 2;
    while (existing.has(candidate)) {
      candidate = `${base}_${index}`;
      index += 1;
    }
    return candidate;
  }

  function numberOrString(value) {
    const trimmed = String(value ?? '').trim();
    if (trimmed === '') return '';
    const numeric = Number(trimmed);
    return Number.isFinite(numeric) ? numeric : value;
  }

  function tokenListOrText(value) {
    if (Array.isArray(value)) return value;
    return String(value ?? '')
      .split(/[\s,]+/)
      .map((token) => token.trim())
      .filter(Boolean);
  }

  function tokenText(value) {
    return Array.isArray(value) ? value.join(' ') : String(value ?? '');
  }

  function compareParameterLabel(left, right) {
    const leftLabel = String(left?.name || left?.id || '');
    const rightLabel = String(right?.name || right?.id || '');
    return leftLabel.localeCompare(rightLabel);
  }

  function orderParameters(list, mode) {
    const rows = [...(list ?? [])];
    if (mode === 'parameter-alpha') return rows.sort(compareParameterLabel);
    if (mode === 'grouped-alpha') {
      return rows.sort((left, right) => {
        const groupCompare = String(left?.group || 'Ungrouped').localeCompare(String(right?.group || 'Ungrouped'));
        return groupCompare || compareParameterLabel(left, right);
      });
    }
    return rows;
  }

  function orderDumps(list, mode) {
    const rows = (list ?? []).map((dump, index) => ({ dump, index }));
    if (mode === 'dump-alpha') {
      return rows.sort((left, right) => String(left.dump?.name || left.dump?.id || '').localeCompare(String(right.dump?.name || right.dump?.id || '')));
    }
    if (mode === 'request-alpha') {
      return rows.sort((left, right) => String(left.dump?.requestAction || left.dump?.id || '').localeCompare(String(right.dump?.requestAction || right.dump?.id || '')));
    }
    return rows;
  }

  function groupParameters(list, mode) {
    const groups = new Map();
    for (const parameter of list ?? []) {
      const group = parameter?.group || 'Ungrouped';
      if (!groups.has(group)) groups.set(group, []);
      groups.get(group).push(parameter);
    }
    const entries = [...groups.entries()];
    if (mode === 'grouped-alpha') {
      entries.sort(([left], [right]) => left.localeCompare(right));
      return entries.map(([name, items]) => ({ name, items: [...items].sort(compareParameterLabel) }));
    }
    return entries.map(([name, items]) => ({ name, items }));
  }

  function buildParameterIdCounts(list) {
    const counts = new Map();
    for (const parameter of list ?? []) {
      const id = String(parameter?.id ?? '').trim();
      if (!id) continue;
      counts.set(id, (counts.get(id) ?? 0) + 1);
    }
    return counts;
  }

  function buildProfileQualityChecks(profile, list, testResult) {
    const checks = [];
    const parametersList = Array.isArray(list) ? list : [];
    const hasTests = Number(testResult?.total ?? 0) > 0;
    const hasFailures = Number(testResult?.failed ?? 0) > 0;

    checks.push({
      level: parametersList.length > 0 ? 'ok' : 'warning',
      title: 'Parameters',
      detail: parametersList.length > 0 ? `${parametersList.length} descriptors exposed` : 'Add parameters or a starter spine to make this profile usable.',
    });
    checks.push({
      level: hasTests ? (hasFailures ? 'error' : 'ok') : 'warning',
      title: 'Test vectors',
      detail: hasTests ? `${testResult.passed}/${testResult.total} passed` : 'Run profile tests before trusting this profile.',
    });
    checks.push({
      level: parametersList.some((parameter) => !parameter?.messageRecipe && parameter?.type !== 'rawMidiAction') ? 'warning' : 'ok',
      title: 'Message recipes',
      detail: parametersList.some((parameter) => !parameter?.messageRecipe && parameter?.type !== 'rawMidiAction')
        ? 'Some parameters do not reference a message recipe.'
        : 'Every listed parameter has a recipe reference.',
    });
    checks.push({
      level: parametersList.some((parameter) => parameter?.access?.realtimeSafe === false) ? 'warning' : 'ok',
      title: 'Realtime safety',
      detail: parametersList.some((parameter) => parameter?.access?.realtimeSafe === false)
        ? 'At least one parameter is marked unsafe for realtime movement.'
        : 'No realtime safety warnings in exposed parameters.',
    });
    checks.push({
      level: profile?.filePath ? 'ok' : 'info',
      title: 'Profile source',
      detail: profile?.filePath || 'No file path reported by backend.',
    });

    return checks;
  }

  function buildGuidedSteps(context) {
    const profile = context.sourceProfile ?? context.selectedProfile ?? {};
    const profileHasIdentity = !!String(profile?.name ?? '').trim()
      && !!String(profile?.manufacturer ?? '').trim()
      && !!String(profile?.family ?? '').trim();
    const hasRecipes = (context.messageRecipes?.length ?? 0) > 0;
    const hasParameters = (context.parameters?.length ?? 0) > 0;
    const hasTests = (context.profileTests?.length ?? 0) > 0;
    const testsRunning = context.profileTestResult?.running === true;
    const testTotal = Number(context.profileTestResult?.total ?? 0);
    const testPassed = Number(context.profileTestResult?.passed ?? 0);
    const testsPassed = testTotal > 0 && testPassed === testTotal;
    const testsFailed = testTotal > 0 && testPassed !== testTotal;
    const validationPassed = context.sourceValidation?.ok === true;
    const validationFailed = context.sourceValidation?.ok === false;
    const dirty = context.sourceDirty || context.parameterDirty;
    const saved = !dirty && context.sourceSave?.ok === true;

    return [
      {
        id: 'overview',
        number: 1,
        label: 'Identity',
        detail: profileHasIdentity ? 'Named and classified' : 'Name the device and maker',
        status: profileHasIdentity ? 'ok' : 'attention',
      },
      {
        id: 'recipes',
        number: 2,
        label: 'Recipes',
        detail: hasRecipes ? `${context.messageRecipes.length} message recipe${context.messageRecipes.length === 1 ? '' : 's'}` : 'Start with CC, NRPN, or SysEx',
        status: hasRecipes ? 'ok' : 'attention',
      },
      {
        id: 'parameters',
        number: 3,
        label: 'Parameters',
        detail: hasParameters ? `${context.parameters.length} parameter${context.parameters.length === 1 ? '' : 's'}` : 'Expose something bindable',
        status: hasParameters ? 'ok' : 'attention',
      },
      {
        id: 'tests',
        number: 4,
        label: 'Tests',
        detail: testsRunning ? 'Running...' : testsPassed ? `${testPassed}/${testTotal} passed` : hasTests ? `${context.profileTests.length} authored` : 'Add proof vectors',
        status: testsFailed ? 'error' : testsPassed ? 'ok' : hasTests ? 'info' : 'attention',
      },
      {
        id: 'finish',
        number: 5,
        label: 'Save',
        detail: saved ? 'Saved' : validationPassed ? 'Validated, ready to save' : validationFailed ? 'Validation needs attention' : dirty ? 'Validate changes' : 'Validate before trusting',
        status: saved || validationPassed ? 'ok' : validationFailed ? 'error' : 'attention',
      },
    ].map((step) => ({
      ...step,
      active: context.activeView === step.id,
    }));
  }

  function summarizeQuality(checks, parameterCount = 0) {
    const counts = { error: 0, warning: 0, info: 0, ok: 0 };
    for (const check of checks ?? []) counts[check.level] = (counts[check.level] ?? 0) + 1;
    if (counts.error > 0) return { status: 'error', label: `${counts.error} errors` };
    if (Number(parameterCount) === 0) return { status: 'warning', label: 'Setup needed' };
    if (counts.warning > 0) return { status: 'warning', label: `${counts.warning} warnings` };
    return { status: 'ok', label: 'Ready' };
  }

  function buildParameterIssues(parameter) {
    if (!parameter) return [];
    const issues = [];
    if (parameter?.access?.canWrite === false) issues.push({ level: 'warning', text: 'Read-only parameter; controls should not send values.' });
    if (parameter?.access?.realtimeSafe === false) issues.push({ level: 'warning', text: 'Not realtime-safe; avoid continuous controls.' });
    if (!parameter?.messageRecipe && parameter?.type !== 'rawMidiAction') issues.push({ level: 'warning', text: 'No message recipe reference is exposed.' });
    if (!parameter?.ui?.preferredComponent) issues.push({ level: 'info', text: 'No preferred component hint.' });
    if ((parameter?.type === 'choice' || parameter?.type === 'enum') && !Array.isArray(parameter?.choices)) {
      issues.push({ level: 'warning', text: 'Choice-like parameter has no choices array.' });
    }
    return issues;
  }

  function isHexByteToken(token) {
    return /^[0-9a-fA-F]{1,2}$/.test(String(token ?? '').trim());
  }

  function isValidAddress(address) {
    const raw = String(address ?? '').trim();
    if (!raw) return false;
    return raw.split(/[\s,]+/).every((token) => isHexByteToken(token) && parseInt(token, 16) <= 0x7f);
  }

  function buildParameterFieldIssues(parameter, recipes, idCounts) {
    const issues = {};
    if (!parameter) return issues;

    const parameterId = String(parameter.id ?? '').trim();
    const recipeId = String(parameter.messageRecipe ?? '').trim();
    const recipe = recipes.find((item) => String(item?.id ?? '') === recipeId);
    const encoding = String(parameter?.encoding?.type ?? '').trim();
    const needsAddress = recipe?.kind === 'sysex' || String(parameter.address ?? '').trim();
    const min = parameter?.range?.min;
    const max = parameter?.range?.max;
    const defaultValue = parameter.default;

    if (!parameterId) {
      issues.id = 'Parameter id is required.';
    } else if ((idCounts?.get(parameterId) ?? 0) > 1) {
      issues.id = `Duplicate parameter id "${parameterId}".`;
    }

    if (!String(parameter.name ?? '').trim()) issues.name = 'Name is required.';

    if (!recipeId) issues.messageRecipe = 'Choose a recipe before this parameter can compile.';
    else if (!recipe) issues.messageRecipe = `Recipe "${recipeId}" does not exist.`;

    if (needsAddress && !String(parameter.address ?? '').trim()) {
      issues.address = 'SysEx parameters need an address.';
    } else if (String(parameter.address ?? '').trim() && !isValidAddress(parameter.address)) {
      issues.address = 'Use 7-bit hex bytes, e.g. 20 or 10 00 20.';
    }

    if (!encoding) issues.encoding = 'Choose how the semantic value becomes MIDI bytes.';
    else if (!['u7', 'u14', 'u14-msb-lsb', 'nibbled', 'enum', 'boolean-u7', 'text-ascii'].includes(encoding)) {
      issues.encoding = `Unsupported encoding "${encoding}".`;
    }

    if (min !== undefined && min !== '' && max !== undefined && max !== '') {
      const numericMin = Number(min);
      const numericMax = Number(max);
      if (!Number.isFinite(numericMin) || !Number.isFinite(numericMax)) {
        issues.range = 'Range min and max must be numeric.';
      } else if (numericMin > numericMax) {
        issues.range = 'Range min cannot be greater than max.';
      } else if (defaultValue !== undefined && defaultValue !== '') {
        const numericDefault = Number(defaultValue);
        if (Number.isFinite(numericDefault) && (numericDefault < numericMin || numericDefault > numericMax)) {
          issues.default = `Default must be within ${numericMin}-${numericMax}.`;
        }
      }
    }

    if (parameter.type === 'choice' || parameter.type === 'enum') {
      if (!Array.isArray(parameter.choices) || parameter.choices.length === 0) {
        issues.choices = 'Choice parameters need at least one choice.';
      } else {
        const choiceIds = parameter.choices.map((choice) => String(choice?.id ?? '').trim()).filter(Boolean);
        const duplicatedChoiceId = firstDuplicate(choiceIds);
        if (duplicatedChoiceId) issues.choices = `Duplicate choice id "${duplicatedChoiceId}".`;
      }
      if (encoding && encoding !== 'enum') {
        issues.encoding = 'Choice parameters usually need enum encoding.';
      }
    }

    if ((parameter.type === 'boolean' || parameter.type === 'momentary') && encoding && encoding !== 'boolean-u7') {
      issues.encoding = 'Boolean-like parameters usually need boolean-u7 encoding.';
    }

    return issues;
  }

  function buildRecipeIssues(recipe, recipes, recipeIndex) {
    const issues = {};
    if (!recipe) return issues;
    const kind = recipe.kind || 'cc';
    const recipeId = String(recipe.id ?? '').trim();

    if (!recipeId) issues.id = 'Recipe id is required.';
    else if ((recipes ?? []).some((item, index) => index !== recipeIndex && String(item?.id ?? '').trim() === recipeId)) {
      issues.id = `Duplicate recipe id "${recipeId}".`;
    }

    if (!['cc', 'nrpn', 'sysex'].includes(kind)) {
      issues.kind = `Unsupported recipe kind "${kind}".`;
      return issues;
    }

    if (kind === 'cc') {
      if (recipe.controller === undefined || recipe.controller === '') issues.controller = 'Controller is required.';
      else if (!Number.isInteger(Number(recipe.controller)) || Number(recipe.controller) < 0 || Number(recipe.controller) > 127) {
        issues.controller = 'Controller must be 0-127.';
      }
    } else if (kind === 'nrpn') {
      for (const field of ['parameterMsb', 'parameterLsb']) {
        if (recipe[field] === undefined || recipe[field] === '') issues[field] = 'Required.';
        else if (!Number.isInteger(Number(recipe[field])) || Number(recipe[field]) < 0 || Number(recipe[field]) > 127) {
          issues[field] = 'Must be 0-127.';
        }
      }
    } else if (kind === 'sysex') {
      const tokens = recipeTemplateTokens(recipe);
      if (tokens.length === 0) issues.template = 'Add SysEx template tokens.';
      if (tokens[0] !== 'F0') issues.template = 'SysEx must start with F0.';
      if (tokens[tokens.length - 1] !== 'F7') issues.template = 'SysEx must end with F7.';
      const invalid = tokens.find((token) => !String(token).startsWith('$') && !isHexByteToken(token));
      if (invalid) issues.template = `Invalid token "${invalid}". Use hex bytes or $tokens.`;
      const hasChecksumToken = tokens.includes('$checksum');
      const checksumType = recipeChecksumType(recipe);
      if (checksumType && !hasChecksumToken) issues.checksum = 'Checksum is configured but $checksum is not in the template.';
      if (hasChecksumToken && !checksumType) issues.checksum = '$checksum token needs a checksum type.';
      if (checksumType && !['sum-7bit', 'roland-7bit'].includes(checksumType)) issues.checksum = `Unsupported checksum "${checksumType}".`;
    }

    return issues;
  }

  function buildTestIssues(test, parameterList, tests, testIndex) {
    const issues = {};
    if (!test) return issues;
    const name = String(test.name ?? '').trim();
    const parameterId = String(test.parameter ?? '').trim();

    if (!name) issues.name = 'Test name is required.';
    else if ((tests ?? []).some((item, index) => index !== testIndex && String(item?.name ?? '').trim() === name)) {
      issues.name = `Duplicate test name "${name}".`;
    }

    if (!parameterId) {
      issues.parameter = 'Choose a parameter.';
    } else if (!(parameterList ?? []).some((parameter) => String(parameter?.id ?? '').trim() === parameterId)) {
      issues.parameter = `Parameter "${parameterId}" does not exist.`;
    }

    if (test.value === undefined || test.value === '') issues.value = 'Value is required.';
    if (!String(test.expectedHex ?? '').trim()) {
      issues.expectedHex = 'Expected hex is required.';
    } else if (!isValidHexBytes(test.expectedHex, true)) {
      issues.expectedHex = 'Use hex bytes, e.g. B0 4A 40.';
    }

    return issues;
  }

  function firstDuplicate(values) {
    const seen = new Set();
    for (const value of values ?? []) {
      if (seen.has(value)) return value;
      seen.add(value);
    }
    return '';
  }

  function isValidHexBytes(value, allowStatusBytes = false) {
    const raw = String(value ?? '').trim();
    if (!raw) return false;
    return raw.split(/[\s,]+/).every((token) => {
      if (!isHexByteToken(token)) return false;
      const byte = parseInt(token, 16);
      return allowStatusBytes ? byte <= 0xff : byte <= 0x7f;
    });
  }

  function fieldIssue(issues, field) {
    return issues?.[field] ?? '';
  }

  function findRecipeForParameter(parameter, recipes) {
    const recipeId = String(parameter?.messageRecipe ?? '').trim();
    if (!recipeId) return null;
    return recipes.find((recipe) => String(recipe?.id ?? '') === recipeId) ?? null;
  }

  function issueCount(value) {
    return Object.values(value ?? {}).filter(Boolean).length;
  }

  function pluralize(count, singular, plural = `${singular}s`) {
    return `${count} ${count === 1 ? singular : plural}`;
  }

  function parameterCardStatus(parameter) {
    if (!parameter) return { level: 'info', label: 'No parameter', detail: 'Select a parameter to inspect it.' };
    if (!String(parameter?.messageRecipe ?? '').trim() && parameter?.type !== 'dumpRequest') {
      return { level: 'warning', label: 'Needs recipe', detail: 'No message recipe is assigned yet.' };
    }
    if (parameter?.access?.canWrite === false) {
      return { level: 'info', label: 'Read-only', detail: 'This parameter is not writable from a panel.' };
    }
    if (parameter?.access?.realtimeSafe === false) {
      return { level: 'warning', label: 'Guarded', detail: 'Realtime sends need care.' };
    }
    return { level: 'ok', label: 'Bindable', detail: 'Ready for panel binding.' };
  }

  function parameterRangeLabel(parameter) {
    if (parameter?.range && (parameter.range.min !== undefined || parameter.range.max !== undefined)) {
      return `${parameter.range.min ?? '?'} to ${parameter.range.max ?? '?'}`;
    }
    if (parameter?.type === 'boolean') return `${parameter.falseValue ?? 0} / ${parameter.trueValue ?? 127}`;
    if (parameter?.type === 'choice' || parameter?.type === 'enum') {
      return pluralize(parameter?.choices?.length ?? 0, 'choice');
    }
    return 'No range';
  }

  function recipeSummary(recipe) {
    const kind = String(recipe?.kind || 'cc').toLowerCase();
    if (kind === 'cc') return `CC ${recipe?.controller ?? '?'} on ${recipe?.channel || '$channel'} -> ${recipe?.value ?? '$encodedValue'}`;
    if (kind === 'nrpn') return `NRPN ${recipe?.parameterMsb ?? '?'}:${recipe?.parameterLsb ?? '?'} on ${recipe?.channel || '$channel'}`;
    if (kind === 'sysex') return `SysEx ${pluralize(recipeTemplateTokens(recipe).length, 'token')}`;
    return kind || 'Recipe';
  }

  function recipeIssueLabel(issues) {
    const count = issueCount(issues);
    return count > 0 ? pluralize(count, 'issue') : 'Ready';
  }

  function testProofStatus(result, issues) {
    const count = issueCount(issues);
    if (result) {
      return result.passed
        ? { level: 'ok', label: 'Passed', detail: result.actualHex || 'Matches expected output' }
        : { level: 'error', label: 'Failed', detail: result.error || result.actualHex || 'Output did not match' };
    }
    if (count > 0) return { level: 'error', label: recipeIssueLabel(issues), detail: 'Fix fields before this can prove anything.' };
    return { level: 'info', label: 'Not run', detail: 'Run tests to capture actual output.' };
  }

  function sourceProofSteps() {
    return [
      { label: 'Tests', status: testActionStatus.className || 'info', value: testActionStatus.text },
      { label: 'Validation', status: validationActionStatus.className || 'info', value: validationActionStatus.text },
      { label: 'Save', status: saveActionStatus.className || 'info', value: saveActionStatus.text },
    ];
  }

  function findTestsForParameter(parameter, tests, results) {
    if (!parameter?.id) return [];
    return (tests ?? [])
      .filter((test) => String(test?.parameter ?? '') === parameter.id)
      .map((test) => {
        const result = (results ?? []).find((item) => item?.name === test?.name);
        return {
          name: test?.name || parameter.id,
          expectedHex: test?.expectedHex || '',
          actualHex: result?.actualHex || '',
          error: result?.error || '',
          passed: result?.passed,
          hasResult: !!result,
        };
      });
  }

  function findPanelUsesForParameter(panel, parameter) {
    if (!panel?.controls || !parameter?.id) return [];
    const uses = [];
    for (const control of panel.controls) {
      const core = profileControlSection(control, 'Core') ?? control;
      const deviceBindings = profileControlSection(control, 'DeviceBindings') ?? control?.DeviceBindings;
      const bindings = Array.isArray(deviceBindings?.bindings)
        ? deviceBindings.bindings
        : [];
      for (const binding of bindings) {
        if (binding?.kind !== 'deviceParameter') continue;
        if (binding?.parameterId !== parameter.id) continue;
        uses.push({
          id: core?.id || control?.id || 'control',
          name: core?.name || core?.text || core?.label || control?.name || control?.id || 'Control',
          type: core?.controlType || control?.controlType || control?.type || 'Control',
          port: binding?.port || 'value',
          dryRun: binding?.dryRun === true,
        });
      }
    }
    return uses;
  }

  function profileControlSection(control, type) {
    if (!control || typeof control !== 'object') return null;
    if (control[type] && typeof control[type] === 'object') return control[type];
    if (Array.isArray(control.sections)) {
      return control.sections.find((section) => section?._type === type || section?.type === type) ?? null;
    }
    return Object.values(control).find((section) => section?._type === type || section?.type === type) ?? null;
  }

  function buildSelectedDiagnostics(parameter, recipe, fieldIssues, tests, uses) {
    if (!parameter) return [];
    const items = [];
    const problems = issueCount(fieldIssues);
    const authoredTests = tests?.length ?? 0;
    const failedTests = (tests ?? []).filter((test) => test.hasResult && test.passed === false).length;
    const passedTests = (tests ?? []).filter((test) => test.hasResult && test.passed === true).length;
    items.push({
      level: problems > 0 ? 'error' : 'ok',
      label: 'Parameter',
      value: problems > 0 ? `${problems} setup issue${problems === 1 ? '' : 's'}` : 'Ready',
    });
    items.push({
      level: recipe ? 'ok' : 'error',
      label: 'Recipe',
      value: recipe ? `${recipe.id} / ${recipe.kind || 'cc'}` : 'Missing',
    });
    items.push({
      level: parameter?.access?.canWrite === false ? 'warning' : 'ok',
      label: 'Access',
      value: parameter?.access?.canWrite === false ? 'Read-only' : 'Writable',
    });
    items.push({
      level: parameter?.access?.realtimeSafe === false ? 'warning' : 'ok',
      label: 'Realtime',
      value: parameter?.access?.realtimeSafe === false ? 'Use with care' : 'Safe',
    });
    items.push({
      level: parameter?.sendPolicy?.mode ? 'ok' : 'info',
      label: 'Send',
      value: parameter?.sendPolicy?.mode || 'Default',
    });
    items.push({
      level: authoredTests === 0 ? 'warning' : failedTests > 0 ? 'error' : passedTests > 0 ? 'ok' : 'info',
      label: 'Tests',
      value: authoredTests === 0
        ? 'No selected tests'
        : failedTests > 0
          ? `${failedTests} failing`
          : passedTests > 0
            ? `${passedTests}/${authoredTests} passed`
            : `${authoredTests} authored`,
    });
    items.push({
      level: uses?.length > 0 ? 'ok' : 'info',
      label: 'Panel use',
      value: uses?.length > 0 ? `${uses.length} control${uses.length === 1 ? '' : 's'}` : 'Not used here',
    });
    return items;
  }

  function buildWorkflowChecks(profile, parameterList, recipes, recipeIssues, tests, testIssues) {
    const profileVariables = profile?.variables ?? {};
    const hasDeviceVariable = profileVariables.deviceId !== undefined || profileVariables.channel !== undefined;
    const duplicateParameterIds = duplicateCount((parameterList ?? []).map((parameter) => parameter?.id));
    const duplicateRecipeIds = duplicateCount((recipes ?? []).map((recipe) => recipe?.id));
    const invalidTests = (testIssues ?? []).filter((issues) => issueCount(issues) > 0).length;
    const missingRecipeRefs = (parameterList ?? []).filter((parameter) => {
      const id = String(parameter?.messageRecipe ?? '').trim();
      return id && !recipes.some((recipe) => String(recipe?.id ?? '') === id);
    }).length;
    const unboundParameters = (parameterList ?? []).filter((parameter) => !String(parameter?.messageRecipe ?? '').trim()).length;
    const invalidRecipes = (recipeIssues ?? []).filter((issues) => issueCount(issues) > 0).length;

    return [
      {
        level: parameterList?.length > 0 ? 'ok' : 'error',
        label: 'Parameters',
        detail: parameterList?.length > 0 ? `${parameterList.length} defined` : 'Add at least one parameter.',
      },
      {
        level: duplicateParameterIds === 0 ? 'ok' : 'error',
        label: 'Parameter ids',
        detail: duplicateParameterIds === 0 ? 'Unique' : `${duplicateParameterIds} duplicate id${duplicateParameterIds === 1 ? '' : 's'}`,
      },
      {
        level: recipes?.length > 0 ? 'ok' : 'error',
        label: 'Recipes',
        detail: recipes?.length > 0 ? `${recipes.length} defined` : 'Add CC, NRPN, or SysEx recipes.',
      },
      {
        level: duplicateRecipeIds === 0 ? 'ok' : 'error',
        label: 'Recipe ids',
        detail: duplicateRecipeIds === 0 ? 'Unique' : `${duplicateRecipeIds} duplicate id${duplicateRecipeIds === 1 ? '' : 's'}`,
      },
      {
        level: missingRecipeRefs === 0 ? 'ok' : 'error',
        label: 'Recipe links',
        detail: missingRecipeRefs === 0 ? 'All references resolve' : `${missingRecipeRefs} missing reference${missingRecipeRefs === 1 ? '' : 's'}`,
      },
      {
        level: unboundParameters === 0 ? 'ok' : 'warning',
        label: 'Bound parameters',
        detail: unboundParameters === 0 ? 'All parameters have recipes' : `${unboundParameters} without recipes`,
      },
      {
        level: invalidRecipes === 0 ? 'ok' : 'error',
        label: 'Recipe validation',
        detail: invalidRecipes === 0 ? 'No inline recipe errors' : `${invalidRecipes} recipe${invalidRecipes === 1 ? '' : 's'} need attention`,
      },
      {
        level: hasDeviceVariable ? 'ok' : 'info',
        label: 'Device variables',
        detail: hasDeviceVariable ? 'Channel/device variables set' : 'Set channel or SysEx device id if needed.',
      },
      {
        level: tests?.length > 0 ? (invalidTests === 0 ? 'ok' : 'error') : 'warning',
        label: 'Tests',
        detail: tests?.length > 0
          ? invalidTests === 0 ? `${tests.length} authored` : `${invalidTests} test${invalidTests === 1 ? '' : 's'} need attention`
          : 'Add at least one test vector.',
      },
    ];
  }

  function duplicateCount(values) {
    const seen = new Set();
    const duplicated = new Set();
    for (const value of values ?? []) {
      const id = String(value ?? '').trim();
      if (!id) continue;
      if (seen.has(id)) duplicated.add(id);
      seen.add(id);
    }
    return duplicated.size;
  }

  function buildPersistenceChecks(source, dirty, parseError, validation, save, canSave) {
    const hasSource = String(source?.source ?? '').trim().length > 0;
    const hasPath = String(source?.filePath ?? '').trim().length > 0;
    return [
      {
        level: hasSource ? 'ok' : 'warning',
        label: 'Source loaded',
        detail: hasSource
          ? source?.fallback === true ? 'Fallback file source loaded' : 'Native editable source loaded'
          : 'Backend did not return editable source yet',
      },
      {
        level: hasPath ? 'ok' : 'info',
        label: 'Save target',
        detail: hasPath ? source.filePath : 'No source path reported',
      },
      {
        level: parseError ? 'error' : 'ok',
        label: 'JSON',
        detail: parseError || 'Source parses cleanly',
      },
      {
        level: validation?.running ? 'info' : validation?.ok === true ? 'ok' : validation ? 'error' : 'warning',
        label: 'Validation',
        detail: validation?.running
          ? 'Running'
          : validation?.ok === true
            ? 'Passed'
            : validation?.error || 'Optional before saving',
      },
      {
        level: dirty ? (canSave ? 'warning' : 'error') : 'ok',
        label: 'Unsaved edits',
        detail: dirty ? (canSave ? 'Ready to save' : 'Fix JSON or profile id before save') : 'No pending edits',
      },
      {
        level: save?.running ? 'info' : save?.ok === true ? 'ok' : save ? 'error' : 'info',
        label: 'Last save',
        detail: save?.running ? 'Saving' : save?.ok === true ? 'Saved' : save?.error || 'Not saved this session',
      },
    ];
  }

  function accessLabel(parameter) {
    if (parameter?.access?.canWrite === false) return 'Read-only';
    if (parameter?.access?.realtimeSafe === false) return 'Writable / slow';
    return 'Writable';
  }

  function defaultValueLabel(parameter) {
    if (!parameter || parameter.default === undefined) return 'none';
    return String(parameter.default);
  }

  function defaultPreviewValue(parameter) {
    if (!parameter) return '';
    if (parameter.default !== undefined) return String(parameter.default);
    if (parameter.type === 'boolean' || parameter.type === 'momentary' || parameter.type === 'action') return 'true';
    if (Array.isArray(parameter.choices) && parameter.choices[0]?.id) return String(parameter.choices[0].id);
    if (parameter.range?.min !== undefined) return String(parameter.range.min);
    return '';
  }

  function parsePreviewValue(parameter, value) {
    const raw = String(value ?? '').trim();
    if (parameter?.type === 'boolean' || parameter?.type === 'momentary' || parameter?.type === 'action') {
      return ['1', 'true', 'on', 'yes'].includes(raw.toLowerCase());
    }
    if (['integer', 'float', 'bipolar', 'normalized', 'time'].includes(parameter?.type)) {
      const numeric = Number(raw);
      return Number.isFinite(numeric) ? numeric : raw;
    }
    return raw;
  }

  function previewSelectedParameter() {
    if (!selectedParameter?.id) return;
    previewParameterMessage({
      requestId: `dpd_preview_${profileId}_${selectedParameter.id}`,
      deviceRole: 'mainSynth',
      profileId,
      parameterId: selectedParameter.id,
      value: parsePreviewValue(selectedParameter, previewValue),
      source: currentProfileSourceText(),
    });
  }

  function resetFilters() {
    query = '';
    groupFilter = 'all';
    typeFilter = 'all';
    accessFilter = 'all';
    parameterVisibleLimit = parameterBatchSize;
  }

  function showMoreParameters() {
    if (hasMoreBackendParameters) {
      refreshProfileParameters(profileId, 'mainSynth', {
        offset: backendParameterPage?.loaded ?? backendParameters.length,
        limit: parameterBatchSize,
        query,
        group: groupFilter,
        type: typeFilter,
        access: accessFilter,
      });
      return;
    }
    parameterVisibleLimit = Math.min(filteredParameters.length, parameterVisibleLimit + parameterBatchSize);
  }

  function startParameterDrag(event, parameter) {
    const payload = {
      kind: 'ceditor.deviceParameter',
      profileId,
      profileName: selectedProfile?.name || profileId,
      deviceRole: 'mainSynth',
      parameter,
    };

    event.dataTransfer.effectAllowed = 'copy';
    event.dataTransfer.setData('application/x-ceditor-device-parameter', JSON.stringify(payload));
    event.dataTransfer.setData('text/plain', parameter.id);
    startDeviceParameterDrag(payload);
  }

  function endParameterDrag() {
    clearDeviceParameterDrag();
  }

  function runTests() {
    runTestsForProfile(profileId, { source: currentProfileSourceText() });
  }

  function parseDumpHex() {
    parseProfileDump({
      requestId: `dpd_dump_parse_${profileId}`,
      deviceRole: 'mainSynth',
      profileId,
      hex: dumpParseHex,
    });
  }

  function refresh() {
    refreshStatus = { running: true };
    refreshDeviceProfiles();
    refreshProfileParameters(profileId);
    if (sourceLoadRequested || editableProfileDoc) {
      sourceLoadRequested = false;
      loadEditableSource();
    }
    if (refreshStatusTimer) clearTimeout(refreshStatusTimer);
    refreshStatusTimer = setTimeout(() => {
      refreshStatus = { ok: true };
      refreshStatusTimer = null;
    }, 250);
  }

  function handleSourceInput(event) {
    sourceText = event.target.value;
    sourceDirty = sourceText !== loadedSourceText;
    const parsed = parseProfileSource(sourceText);
    if (parsed) editableProfileDoc = parsed;
  }

  function validateSource() {
    if (!currentProfileSourceText()) {
      loadEditableSource();
      return;
    }
    validateProfileSource(profileId, currentProfileSourceText());
  }

  function saveSource() {
    if (!sourceCanSave) return;
    if (parameterDirty && selectedParameterDraft && !usingEditableSource) {
      saveProfileParameter(profileId, selectedParameterId, selectedParameterDraft);
      return;
    }
    saveProfileSource(profileId, currentProfileSourceText());
  }

  function getSaveActionStatus(dirty, save) {
    if (save?.running) return { text: 'Saving...', className: 'muted-status' };
    if (dirty) return { text: 'Modified', className: 'dirty-label' };
    if (save?.ok === true) return { text: 'Saved', className: 'ok-text' };
    if (save) return { text: save.error || 'Save failed', className: 'error-text' };
    return { text: 'Not saved', className: 'muted-status' };
  }

  function getValidationActionStatus(validation) {
    if (validation?.running) return { text: 'Validating...', className: 'muted-status' };
    if (validation?.ok === true) return { text: 'Validated', className: 'ok-text' };
    if (validation) return { text: validation.error || 'Validation failed', className: 'error-text' };
    return { text: 'Not validated', className: 'muted-status' };
  }

  function getRefreshActionStatus(status) {
    if (status?.running) return { text: 'Refreshing...', className: 'muted-status' };
    if (status?.ok === true) return { text: 'Refreshed', className: 'ok-text' };
    if (status) return { text: status.error || 'Refresh failed', className: 'error-text' };
    return { text: 'Ready', className: 'muted-status' };
  }

  function getTestActionStatus(testResult) {
    if (testResult?.running) return { text: 'Running...', className: 'muted-status' };
    if (!testResult) return { text: 'Not run', className: 'muted-status' };
    const passed = Number(testResult.passed ?? 0);
    const total = Number(testResult.total ?? 0);
    if (total > 0 && passed === total) return { text: `${passed}/${total} passed`, className: 'ok-text' };
    if (total > 0) return { text: `${passed}/${total} passed`, className: 'error-text' };
    return { text: testResult.error || 'No tests', className: testResult.error ? 'error-text' : 'muted-status' };
  }

  function getEditSourceStatus(profileDoc, requested, loadedSource) {
    if (profileDoc) return { text: 'Edit source loaded', className: 'ok-text' };
    if (requested && !loadedSource) return { text: 'Loading source...', className: 'muted-status' };
    return { text: 'Read-only list mode', className: 'muted-status' };
  }
</script>

<div class="designer">
  <header class="designer-header">
    <div class="title-block">
      <span class="eyebrow">Device Profile Designer</span>
      <h1>{selectedProfile?.name || profileId || 'Profile'}</h1>
    </div>
    <div class="header-actions">
      <div class="header-action">
        <button onclick={validateSource}>Validate</button>
        <span class={validationActionStatus.className}>{validationActionStatus.text}</span>
      </div>
      <div class="header-action">
        <button disabled={!!editableProfileDoc || sourceLoadRequested} onclick={loadEditableSourceForEdit}>Load/Edit Source</button>
        <span class={editSourceStatus.className}>{editSourceStatus.text}</span>
      </div>
      <div class="header-action">
        <button disabled={!sourceCanSave} onclick={saveSource}>Save</button>
        <span class={saveActionStatus.className}>{saveActionStatus.text}</span>
      </div>
      <div class="header-action">
        <button onclick={refresh}>Refresh</button>
        <span class={refreshActionStatus.className}>{refreshActionStatus.text}</span>
      </div>
      <div class="header-action">
        <button onclick={runTests}>Run Tests</button>
        <span class={testActionStatus.className}>{testActionStatus.text}</span>
      </div>
    </div>
  </header>

  <section class="summary">
    <div><span>Parameters</span><strong>{profileStats.total}</strong></div>
    <div><span>Groups</span><strong>{profileStats.groups}</strong></div>
    <div><span>Writable</span><strong>{profileStats.writable}</strong></div>
    <div><span>Realtime warnings</span><strong>{profileStats.realtimeUnsafe}</strong></div>
    <div><span>Tests</span><strong>{profileStats.tests}</strong></div>
  </section>

  <nav class="guided-flow" aria-label="Device profile authoring flow">
    {#each guidedSteps as step}
      <button
        class:active={step.active}
        class={['flow-step', step.status]}
        onclick={() => setActiveView(step.id)}
      >
        <span>{step.number}</span>
        <strong>{step.label}</strong>
        <small>{step.detail}</small>
      </button>
    {/each}
    <span class={['quality-pill', qualitySummary.status]}>{qualitySummary.label}</span>
  </nav>

  <nav class="designer-tabs secondary" aria-label="Advanced device profile sections">
    <button class:active={activeView === 'dumps'} onclick={() => setActiveView('dumps')}>Dumps</button>
    <button class:active={activeView === 'compatibility'} onclick={() => setActiveView('compatibility')}>Compatibility</button>
    <button class:active={activeView === 'source'} onclick={() => setActiveView('source')}>Advanced Source</button>
  </nav>

  <main class="designer-body" class:without-inspector={!showInspectorPanel}>
    <section class="workspace">
      {#if activeView === 'overview'}
        <div class="overview-grid">
          <section class="panel-section profile-setup-card">
            <div class="section-header">
              <div>
                <span class="section-title">Profile Identity</span>
                <h2>{sourceProfile?.name || selectedProfile?.name || 'Profile'}</h2>
              </div>
              {#if sourceDirty}<span class="dirty-label">Modified</span>{/if}
            </div>
            <div class="editor-grid profile-grid">
              <label><span>Id</span><input value={sourceProfile?.id || profileId} oninput={(event) => updateProfileField('id', event.target.value)} /></label>
              <label><span>Name</span><input value={sourceProfile?.name || ''} oninput={(event) => updateProfileField('name', event.target.value)} /></label>
              <label><span>Manufacturer</span><input value={sourceProfile?.manufacturer || ''} oninput={(event) => updateProfileField('manufacturer', event.target.value)} /></label>
              <label><span>Family</span><input value={sourceProfile?.family || ''} oninput={(event) => updateProfileField('family', event.target.value)} /></label>
              <label><span>Profile Version</span><input value={sourceProfile?.profileVersion || ''} oninput={(event) => updateProfileField('profileVersion', event.target.value)} /></label>
              <label><span>Minimum CEditor</span><input value={sourceProfile?.minCEditorVersion || ''} oninput={(event) => updateProfileField('minCEditorVersion', event.target.value)} /></label>
            </div>
          </section>

          <section class="panel-section profile-setup-card">
            <div class="section-header compact">
              <div>
                <span class="section-title">Trust and Coverage</span>
                <h2>{sourceProfile?.status || 'experimental'}</h2>
              </div>
            </div>
            <div class="editor-grid profile-grid compact">
              <label><span>Status</span>
                <select value={sourceProfile?.status || 'experimental'} oninput={(event) => updateProfileField('status', event.target.value)}>
                  <option value="experimental">Experimental</option>
                  <option value="draft">Draft</option>
                  <option value="verified">Verified</option>
                  <option value="official">Official</option>
                </select>
              </label>
              <label><span>Trust</span>
                <select value={sourceProfile?.trust || 'local'} oninput={(event) => updateProfileField('trust', event.target.value)}>
                  <option value="local">Local</option>
                  <option value="imported">Imported</option>
                  <option value="community">Community</option>
                  <option value="verified">Verified</option>
                  <option value="official">Official</option>
                </select>
              </label>
              <label><span>Realtime Coverage</span><input value={sourceProfile?.coverage?.realtimeEditing || ''} oninput={(event) => updateNestedProfileField('coverage', 'realtimeEditing', event.target.value)} /></label>
            </div>
          </section>

          <section class="panel-section">
            <span class="section-title">Device Variables</span>
            <div class="editor-grid profile-grid compact">
              <label><span>MIDI Channel</span><input value={sourceProfile?.variables?.channel ?? ''} placeholder="1" oninput={(event) => updateNestedProfileField('variables', 'channel', numberOrString(event.target.value))} /></label>
              <label><span>SysEx Device ID</span><input value={sourceProfile?.variables?.deviceId ?? ''} placeholder="16" oninput={(event) => updateNestedProfileField('variables', 'deviceId', numberOrString(event.target.value))} /></label>
              <label><span>Min Delay Ms</span><input value={sourceProfile?.timing?.minDelayBetweenMessagesMs ?? ''} placeholder="20" oninput={(event) => updateNestedProfileField('timing', 'minDelayBetweenMessagesMs', numberOrString(event.target.value))} /></label>
            </div>
          </section>

          <section class="panel-section workflow-card">
            <div class="section-header compact">
              <div>
                <span class="section-title">Authoring Workflow</span>
                <h2>Profile spine</h2>
              </div>
              <button onclick={addStarterCcSpine}>Add Starter CC Spine</button>
            </div>
            <div class="workflow-list">
              {#each workflowChecks as check}
                <div class={['workflow-row', check.level]}>
                  <strong>{check.label}</strong>
                  <span>{check.detail}</span>
                </div>
              {/each}
            </div>
          </section>

          <section class="panel-section workflow-card">
            <span class="section-title">Persistence Check</span>
            <div class="workflow-list">
              {#each persistenceChecks as check}
                <div class={['workflow-row', check.level]}>
                  <strong>{check.label}</strong>
                  <span>{check.detail}</span>
                </div>
              {/each}
            </div>
          </section>

          <section class="panel-section workflow-card">
            <span class="section-title">Real Profile Trial</span>
            <div class="workflow-list">
              <div class="workflow-row info">
                <strong>1. Spine</strong>
                <span>Add or create one parameter, one recipe, and one test vector.</span>
              </div>
              <div class="workflow-row info">
                <strong>2. Compile</strong>
                <span>Select the parameter and use Dry-run Preview until the hex is correct.</span>
              </div>
              <div class="workflow-row info">
                <strong>3. Validate</strong>
                <span>Run tests, then validate source before saving.</span>
              </div>
              <div class="workflow-row info">
                <strong>4. Bind</strong>
                <span>Drag the parameter onto a panel control and check Used By Panel Controls.</span>
              </div>
            </div>
          </section>

          <section class="panel-section">
            <span class="section-title">Parameter Groups</span>
            <div class="group-cloud">
              {#each parameterGroups as group}
                <button onclick={() => { setActiveView('parameters'); groupFilter = group; }}>{group}</button>
              {:else}
                <span class="muted">No groups</span>
              {/each}
            </div>
          </section>
        </div>
      {:else if activeView === 'finish'}
        <div class="finish-workspace">
          <section class="panel-section finish-primary">
            <div class="section-header">
              <div>
                <span class="section-title">Validate and Save</span>
                <h2>{qualitySummary.label}</h2>
              </div>
              {#if sourceDirty || parameterDirty}<span class="dirty-label">Modified</span>{/if}
            </div>
            <div class="finish-actions">
              <button onclick={runTests}>Run Tests</button>
              <button onclick={validateSource}>Validate Source</button>
              <button disabled={!sourceCanSave} onclick={saveSource}>Save Profile</button>
              <button onclick={() => setActiveView('source')}>Review Source</button>
            </div>
            <div class="finish-status-grid">
              <div>
                <span class="section-title">Tests</span>
                <strong class={testActionStatus.className}>{testActionStatus.text}</strong>
              </div>
              <div>
                <span class="section-title">Validation</span>
                <strong class={validationActionStatus.className}>{validationActionStatus.text}</strong>
              </div>
              <div>
                <span class="section-title">Save</span>
                <strong class={saveActionStatus.className}>{saveActionStatus.text}</strong>
              </div>
              <div>
                <span class="section-title">Source</span>
                <strong>{sourceLocationLabel}</strong>
              </div>
            </div>
          </section>

          <section class="panel-section workflow-card">
            <span class="section-title">Authoring Checklist</span>
            <div class="workflow-list">
              {#each workflowChecks as check}
                <div class={['workflow-row', check.level]}>
                  <strong>{check.label}</strong>
                  <span>{check.detail}</span>
                </div>
              {/each}
            </div>
          </section>

          <section class="panel-section workflow-card">
            <span class="section-title">Persistence</span>
            <div class="workflow-list">
              {#each persistenceChecks as check}
                <div class={['workflow-row', check.level]}>
                  <strong>{check.label}</strong>
                  <span>{check.detail}</span>
                </div>
              {/each}
            </div>
          </section>

          <section class="panel-section workflow-card">
            <span class="section-title">Validation Messages</span>
            <div class="quality-list compact">
              {#each sourceValidationItems as item}
                <div class={['quality-row', item.level]}>
                  <strong>{item.path || '$'}</strong>
                  <span>{item.message}</span>
                </div>
              {:else}
                <div class="empty small">Validate to see schema messages from the Device Profile Engine.</div>
              {/each}
            </div>
          </section>
        </div>
      {:else if activeView === 'dumps'}
        <section class="panel-section full-height">
            <div class="section-header">
              <div>
                <span class="section-title">Bulk Dumps</span>
                <h2>{dumpDefinitions.length} definition{dumpDefinitions.length === 1 ? '' : 's'}</h2>
              </div>
              <div class="mini-actions">
                <select bind:value={dumpOrderMode} title="Dump ordering">
                  <option value="dump">Dump order</option>
                  <option value="dump-alpha">Dump alphabetically</option>
                  <option value="request-alpha">Request alphabetically</option>
                </select>
                <button disabled={!!editableProfileDoc || sourceLoadRequested} onclick={loadEditableSourceForEdit}>Load/Edit Source</button>
                <button onclick={addDumpDefinition}>Add Dump</button>
              </div>
            </div>

          <div class="dump-parse-panel">
            <div>
              <span class="section-title">Parse Incoming SysEx</span>
              <strong>Paste a captured dump to hydrate runtime state</strong>
            </div>
            <textarea
              spellcheck="false"
              value={dumpParseHex}
              oninput={(event) => dumpParseHex = event.target.value}
              placeholder="F0 7D 10 01 40 02 43 F7"
            ></textarea>
            <button disabled={!dumpParseHex.trim()} onclick={parseDumpHex}>Parse Dump</button>
            {#if dumpParseResult}
              <div class={['preview-result', dumpParseResult.ok === false ? 'error' : 'ok']}>
                <strong>{dumpParseResult.running ? 'Parsing...' : dumpParseResult.ok === false ? 'Parse failed' : `Parsed ${dumpParseResult.dumpName || dumpParseResult.dumpId}`}</strong>
                <code>{dumpParseResult.error || JSON.stringify(dumpParseResult.values ?? {}, null, 2)}</code>
              </div>
            {/if}
          </div>

          <div class="dump-list">
            {#each orderedDumpDefinitions as orderedDump}
              {@const dump = orderedDump.dump}
              {@const dumpIndex = orderedDump.index}
              <div class="dump-row">
                <div class="dump-grid">
                  <label><span>Id</span><input value={dump.id || ''} oninput={(event) => updateDumpDefinition(dumpIndex, 'id', event.target.value)} /></label>
                  <label><span>Name</span><input value={dump.name || ''} oninput={(event) => updateDumpDefinition(dumpIndex, 'name', event.target.value)} /></label>
                  <label><span>Kind</span>
                    <select value={dump.kind || 'sysex'} oninput={(event) => updateDumpDefinition(dumpIndex, 'kind', event.target.value)}>
                      <option value="sysex">SysEx</option>
                    </select>
                  </label>
                  <label><span>Payload Offset</span><input value={dump?.payload?.offset ?? ''} placeholder="4" oninput={(event) => updateDumpNested(dumpIndex, 'payload', 'offset', event.target.value)} /></label>
                  <label class="wide"><span>Matcher Prefix</span><input value={tokenText(dump?.matcher?.prefix)} placeholder="F0 7D $deviceId 01" oninput={(event) => updateDumpNested(dumpIndex, 'matcher', 'prefix', event.target.value)} /></label>
                  <label class="wide"><span>Matcher Suffix</span><input value={tokenText(dump?.matcher?.suffix)} placeholder="F7" oninput={(event) => updateDumpNested(dumpIndex, 'matcher', 'suffix', event.target.value)} /></label>
                  <label><span>Checksum</span>
                    <select value={dump?.checksum?.type || ''} oninput={(event) => updateDumpNested(dumpIndex, 'checksum', 'type', event.target.value)}>
                      <option value="">None</option>
                      <option value="sum-7bit">Sum 7-bit</option>
                      <option value="roland-7bit">Roland 7-bit</option>
                    </select>
                  </label>
                  <label><span>From</span><input value={dump?.checksum?.fromOffset ?? ''} oninput={(event) => updateDumpNested(dumpIndex, 'checksum', 'fromOffset', event.target.value)} /></label>
                  <label><span>To</span><input value={dump?.checksum?.toOffset ?? ''} oninput={(event) => updateDumpNested(dumpIndex, 'checksum', 'toOffset', event.target.value)} /></label>
                  <label><span>Byte</span><input value={dump?.checksum?.byteOffset ?? ''} oninput={(event) => updateDumpNested(dumpIndex, 'checksum', 'byteOffset', event.target.value)} /></label>
                </div>

                <div class="dump-mappings">
                  <div class="section-header compact">
                    <div>
                      <span class="section-title">Mappings</span>
                      <h2>{dump?.mappings?.length ?? 0} parameter values</h2>
                    </div>
                    <button onclick={() => addDumpMapping(dumpIndex)}>Add Mapping</button>
                  </div>
                  {#each dump?.mappings ?? [] as mapping, mappingIndex}
                    <div class="dump-mapping-row">
                      <select value={mapping.parameter || ''} oninput={(event) => updateDumpMapping(dumpIndex, mappingIndex, 'parameter', event.target.value)}>
                        <option value="">Parameter</option>
                        {#each parameters as parameter}<option value={parameter.id}>{parameter.name || parameter.id}</option>{/each}
                      </select>
                      <input value={mapping.offset ?? ''} placeholder="payload offset" oninput={(event) => updateDumpMapping(dumpIndex, mappingIndex, 'offset', event.target.value)} />
                      <button onclick={() => removeDumpMapping(dumpIndex, mappingIndex)}>Remove</button>
                    </div>
                  {:else}
                    <div class="empty small">No mappings yet. A dump only updates state after mappings are added.</div>
                  {/each}
                </div>

                <div class="mini-actions">
                  <button onclick={() => removeDumpDefinition(dumpIndex)}>Remove Dump</button>
                </div>
              </div>
            {:else}
              <div class="empty">
                No dump definitions loaded. Use Load/Edit Source, then add a dump definition.
              </div>
            {/each}
          </div>
        </section>
      {:else if activeView === 'tests'}
        <section class="panel-section full-height">
          <div class="section-header">
            <div>
              <span class="section-title">Test Vectors</span>
              <h2>{profileTests.length} authored / {profileStats.tests} last run</h2>
            </div>
            <div class="mini-actions">
              <button onclick={addTestVector}>Add Test</button>
              <button onclick={runTests}>Run Tests</button>
            </div>
          </div>
          <div class="authored-test-list">
            {#each profileTests as test, index}
              {@const result = testResults.find((item) => item.name === test.name)}
              {@const issues = testInlineIssues[index] ?? {}}
              {@const proof = testProofStatus(result, issues)}
              <div class={['test-proof-card', proof.level]}>
                <div class="proof-card-header">
                  <div>
                    <span class={['proof-badge', proof.level]}>{proof.label}</span>
                    <strong>{test.name || 'Unnamed test'}</strong>
                    <small>{proof.detail}</small>
                  </div>
                  <button onclick={() => removeTestVector(index)}>Remove</button>
                </div>
                <div class="test-proof-grid">
                  <label>
                    <span>Name</span>
                    <input class:error={fieldIssue(issues, 'name')} value={test.name || ''} placeholder="Name" oninput={(event) => updateTestVector(index, 'name', event.target.value)} />
                    {#if fieldIssue(issues, 'name')}<small class="field-issue">{fieldIssue(issues, 'name')}</small>{/if}
                  </label>
                  <label>
                    <span>Parameter</span>
                    <select class:error={fieldIssue(issues, 'parameter')} value={test.parameter || ''} oninput={(event) => updateTestVector(index, 'parameter', event.target.value)}>
                      <option value="">Parameter</option>
                      {#each parameters as parameter}<option value={parameter.id}>{parameter.name || parameter.id}</option>{/each}
                    </select>
                    {#if fieldIssue(issues, 'parameter')}<small class="field-issue">{fieldIssue(issues, 'parameter')}</small>{/if}
                  </label>
                  <label>
                    <span>Input value</span>
                    <input class:error={fieldIssue(issues, 'value')} value={test.value ?? ''} placeholder="Value" oninput={(event) => updateTestVector(index, 'value', event.target.value)} />
                    {#if fieldIssue(issues, 'value')}<small class="field-issue">{fieldIssue(issues, 'value')}</small>{/if}
                  </label>
                  <label>
                    <span>Expected MIDI</span>
                    <input class:error={fieldIssue(issues, 'expectedHex')} value={test.expectedHex || ''} placeholder="Expected hex" oninput={(event) => updateTestVector(index, 'expectedHex', event.target.value)} />
                    {#if fieldIssue(issues, 'expectedHex')}<small class="field-issue">{fieldIssue(issues, 'expectedHex')}</small>{/if}
                  </label>
                </div>
                <div class="proof-output">
                  <span>Expected</span>
                  <code>{test.expectedHex || 'missing expected hex'}</code>
                  <span>Actual</span>
                  <code>{result?.actualHex || result?.error || 'not run yet'}</code>
                </div>
              </div>
            {:else}
              <div class="empty empty-action-card">
                <strong>No test vectors yet</strong>
                <span>Add one proof vector for the selected parameter, or use the starter spine to create a working CC example.</span>
                <div class="empty-actions">
                  <button onclick={addTestVector}>Add Test</button>
                  <button onclick={addStarterCcSpine}>Add Starter CC Spine</button>
                  <button onclick={() => setActiveView('finish')}>Go to Save</button>
                </div>
              </div>
            {/each}
          </div>
        </section>
      {:else if activeView === 'recipes'}
        <section class="panel-section full-height">
          <div class="section-header">
            <div>
              <span class="section-title">Message Recipes</span>
              <h2>{messageRecipes.length} recipes</h2>
            </div>
            <div class="mini-actions">
              <button onclick={addCcRecipe}>Add CC</button>
              <button onclick={addNrpnRecipe}>Add NRPN</button>
              <button onclick={addSysexRecipe}>Add SysEx</button>
            </div>
          </div>
          <div class="recipe-list">
            <div class="recipe-starter-strip" aria-label="Recipe quick starts">
              <button class="recipe-type-card" onclick={addCcRecipe}>
                <span>CC</span>
                <strong>Single controller</strong>
                <small>Best for common 0-127 panel controls.</small>
              </button>
              <button class="recipe-type-card" onclick={addNrpnRecipe}>
                <span>NRPN</span>
                <strong>14-bit parameter pair</strong>
                <small>Use when the device expects MSB/LSB parameter numbers.</small>
              </button>
              <button class="recipe-type-card" onclick={addSysexRecipe}>
                <span>SysEx</span>
                <strong>Token template</strong>
                <small>Build proofable byte templates with palette tokens.</small>
              </button>
            </div>
            {#each messageRecipes as recipe, index}
              {@const issues = recipeInlineIssues[index] ?? {}}
              <div class="recipe-row" class:sysex={recipe.kind === 'sysex'}>
                <div class="recipe-proof-header">
                  <span class={['proof-badge', issueCount(issues) ? 'warning' : 'ok']}>{recipeIssueLabel(issues)}</span>
                  <strong>{recipe.id || `Recipe ${index + 1}`}</strong>
                  <small>{recipeSummary(recipe)}</small>
                </div>
                <label><span>Id</span><input class:error={fieldIssue(issues, 'id')} value={recipe.id || ''} placeholder="id" oninput={(event) => updateRecipe(index, 'id', event.target.value)} />
                  {#if fieldIssue(issues, 'id')}<small class="field-issue">{fieldIssue(issues, 'id')}</small>{/if}
                </label>
                <label><span>Kind</span>
                  <select value={recipe.kind || 'cc'} oninput={(event) => updateRecipe(index, 'kind', event.target.value)}>
                    <option value="cc">CC</option>
                    <option value="nrpn">NRPN</option>
                    <option value="sysex">SysEx</option>
                  </select>
                </label>
                {#if recipe.kind === 'cc' || !recipe.kind}
                  <label><span>Channel</span><input value={recipe.channel ?? ''} placeholder="$channel" oninput={(event) => updateRecipe(index, 'channel', event.target.value)} /></label>
                  <label><span>Controller</span><input class:error={fieldIssue(issues, 'controller')} value={recipe.controller ?? ''} placeholder="74" oninput={(event) => updateRecipe(index, 'controller', event.target.value)} />
                    {#if fieldIssue(issues, 'controller')}<small class="field-issue">{fieldIssue(issues, 'controller')}</small>{/if}
                  </label>
                  <label><span>Value</span><input value={recipe.value ?? '$encodedValue'} placeholder="$encodedValue" oninput={(event) => updateRecipe(index, 'value', event.target.value)} /></label>
                {:else if recipe.kind === 'nrpn'}
                  <label><span>Channel</span><input value={recipe.channel ?? ''} placeholder="$channel" oninput={(event) => updateRecipe(index, 'channel', event.target.value)} /></label>
                  <label><span>Param MSB</span><input class:error={fieldIssue(issues, 'parameterMsb')} value={recipe.parameterMsb ?? ''} placeholder="0" oninput={(event) => updateRecipe(index, 'parameterMsb', event.target.value)} />
                    {#if fieldIssue(issues, 'parameterMsb')}<small class="field-issue">{fieldIssue(issues, 'parameterMsb')}</small>{/if}
                  </label>
                  <label><span>Param LSB</span><input class:error={fieldIssue(issues, 'parameterLsb')} value={recipe.parameterLsb ?? ''} placeholder="0" oninput={(event) => updateRecipe(index, 'parameterLsb', event.target.value)} />
                    {#if fieldIssue(issues, 'parameterLsb')}<small class="field-issue">{fieldIssue(issues, 'parameterLsb')}</small>{/if}
                  </label>
                  <label><span>Value</span><input value={recipe.value ?? '$encodedValue'} placeholder="$encodedValue" oninput={(event) => updateRecipe(index, 'value', event.target.value)} /></label>
                {:else}
                  <div class="sysex-token-editor">
                    <span>Template</span>
                    <div class:error={fieldIssue(issues, 'template')} class="sysex-token-strip" aria-label="SysEx template tokens">
                      {#each recipeTemplateTokens(recipe) as token, tokenIndex}
                        <div class="sysex-token">
                          <input
                            value={token}
                            aria-label={`Template token ${tokenIndex + 1}`}
                            oninput={(event) => updateRecipeTemplateToken(index, tokenIndex, event.target.value)}
                          />
                          <div class="token-actions">
                            <button title="Move token left" disabled={tokenIndex === 0} onclick={() => moveRecipeTemplateToken(index, tokenIndex, -1)}>&lt;</button>
                            <button title="Move token right" disabled={tokenIndex === recipeTemplateTokens(recipe).length - 1} onclick={() => moveRecipeTemplateToken(index, tokenIndex, 1)}>&gt;</button>
                            <button title="Remove token" onclick={() => removeRecipeTemplateToken(index, tokenIndex)}>x</button>
                          </div>
                        </div>
                      {:else}
                        <span class="muted">No tokens yet.</span>
                      {/each}
                    </div>
                    {#if fieldIssue(issues, 'template')}<small class="field-issue">{fieldIssue(issues, 'template')}</small>{/if}
                    <div class="sysex-token-palette">
                      {#each sysexTokenPalette as token}
                        <button title={`Add ${token}`} onclick={() => addRecipeTemplateToken(index, token)}>{token}</button>
                      {/each}
                      <input
                        placeholder="hex or $token, Enter"
                        onkeydown={(event) => handleCustomSysexTokenKeydown(event, index)}
                      />
                    </div>
                    <code>{recipeTemplateText(recipe) || 'empty template'}</code>
                  </div>
                  <label><span>Delay After</span><input value={recipe.delayAfterMs ?? ''} placeholder="0" oninput={(event) => updateRecipe(index, 'delayAfterMs', event.target.value)} /></label>
                  <label><span>Checksum</span>
                    <select class:error={fieldIssue(issues, 'checksum')} value={recipeChecksumType(recipe)} oninput={(event) => updateRecipeChecksum(index, 'type', event.target.value)}>
                      <option value="">None</option>
                      <option value="sum-7bit">Sum 7-bit</option>
                      <option value="roland-7bit">Roland 7-bit</option>
                    </select>
                    {#if fieldIssue(issues, 'checksum')}<small class="field-issue">{fieldIssue(issues, 'checksum')}</small>{/if}
                  </label>
                  <label><span>Checksum From</span><input value={recipeChecksumField(recipe, 'from')} placeholder="$address" oninput={(event) => updateRecipeChecksum(index, 'from', event.target.value)} /></label>
                  <label><span>Checksum To</span><input value={recipeChecksumField(recipe, 'to')} placeholder="$encodedValue" oninput={(event) => updateRecipeChecksum(index, 'to', event.target.value)} /></label>
                {/if}
                <button onclick={() => removeRecipe(index)}>Remove</button>
              </div>
            {:else}
              <div class="empty empty-action-card">
                <strong>No message recipes yet</strong>
                <span>Start from a complete CC spine, or add the exact message type this device needs.</span>
                <div class="empty-actions">
                  <button onclick={addStarterCcSpine}>Add Starter CC Spine</button>
                  <button onclick={addCcRecipe}>Add CC</button>
                  <button onclick={addNrpnRecipe}>Add NRPN</button>
                  <button onclick={addSysexRecipe}>Add SysEx</button>
                </div>
              </div>
            {/each}
          </div>
        </section>
      {:else if activeView === 'source'}
        <section class="source-editor">
          <div class="source-toolbar">
            <div>
              <span class="section-title">Advanced Source</span>
              <strong>{sourceLocationLabel}</strong>
            </div>
            <div class="source-actions">
              {#if sourceDirty}<span class="dirty-label">Modified</span>{/if}
              <button onclick={runTests}>Run Tests</button>
              <button onclick={validateSource}>Validate</button>
              <button disabled={!sourceCanSave} onclick={saveSource}>Save</button>
            </div>
          </div>
          <div class="source-proof-strip" aria-label="Source proof status">
            {#each sourceProofSteps() as step}
              <div class={['source-proof-step', step.status]}>
                <span>{step.label}</span>
                <strong>{step.value}</strong>
              </div>
            {/each}
            <button onclick={() => setActiveView('finish')}>Review Save Flow</button>
          </div>
          <textarea
            spellcheck="false"
            value={sourceText}
            oninput={handleSourceInput}
            placeholder="Profile JSON source will appear here."
          ></textarea>
          <div class="source-status">
            {#if sourceValidation?.running}
              <span>Validating...</span>
            {:else if sourceValidation}
              <span class={sourceValidation.ok ? 'ok-text' : 'error-text'}>
                {sourceValidation.ok ? 'Validation passed' : sourceValidation.error || 'Validation failed'}
              </span>
              {#if sourceValidation.detectedProfileId && sourceValidation.detectedProfileId !== profileId}
                <span class="error-text">Profile id changes are not saved in-place yet.</span>
              {/if}
            {:else}
              <span>Not validated</span>
            {/if}
            {#if sourceSave?.running}
              <span>Saving...</span>
            {:else if sourceSave}
              <span class={sourceSave.ok ? 'ok-text' : 'error-text'}>
                {sourceSave.ok ? 'Saved' : sourceSave.error || 'Save failed'}
              </span>
            {/if}
          </div>
          <div class="source-validation">
            {#each sourceValidationItems as item}
              <div class={['quality-row', item.level]}>
                <strong>{item.path || '$'}</strong>
                <span>{item.message}</span>
              </div>
            {:else}
              <div class="empty">Validate to see schema messages from the Device Profile Engine.</div>
            {/each}
          </div>
        </section>
      {:else}
        <div class="parameter-workspace">
          <section class="parameter-table">
            <div class="table-tools">
              <input value={query} placeholder="Search parameters" oninput={(e) => query = e.target.value} />
              <select bind:value={groupFilter}>
                <option value="all">All groups</option>
                {#each parameterGroups as group}<option value={group}>{group}</option>{/each}
              </select>
              <select bind:value={typeFilter}>
                <option value="all">All types</option>
                {#each parameterTypes as type}<option value={type}>{type}</option>{/each}
              </select>
              <select bind:value={accessFilter}>
                <option value="all">All access</option>
                <option value="writable">Writable</option>
                <option value="readonly">Read-only</option>
                <option value="realtimeWarning">Realtime warning</option>
              </select>
              <select bind:value={parameterOrderMode} title="Parameter ordering">
                <option value="implementation">Implementation order</option>
                <option value="grouped-alpha">Grouped alphabetically</option>
                <option value="parameter-alpha">Parameter alphabetically</option>
              </select>
              {#if activeView !== 'compatibility'}
                <div class="view-toggle" aria-label="Parameter layout">
                  <button class:active={parameterLayoutMode === 'cards'} onclick={() => parameterLayoutMode = 'cards'}>Cards</button>
                  <button class:active={parameterLayoutMode === 'table'} onclick={() => parameterLayoutMode = 'table'}>Table</button>
                </div>
              {/if}
              <button onclick={resetFilters}>Reset</button>
              <button onclick={addParameter}>Add</button>
              <span class="parameter-count">{parameterCountLabel}</span>
            </div>
            {#if activeView === 'compatibility' || parameterLayoutMode === 'table'}
              <div class="table-head">
                <span>Name</span>
                <span>Id</span>
                <span>Type</span>
                <span>Access</span>
                <span>Preferred</span>
              </div>
            {/if}
            <div class="table-scroll">
              {#if activeView === 'compatibility'}
                {#each visibleParameters as parameter}
                  <button
                    class:selected={selectedParameter?.id === parameter.id}
                    class="compatibility-parameter-row"
                    draggable="true"
                    ondragstart={(event) => startParameterDrag(event, parameter)}
                    ondragend={endParameterDrag}
                    onclick={() => selectedParameterId = parameter.id}
                    title="Drag onto a panel component to bind"
                  >
                    <span>{parameter.name || parameter.id}</span>
                    {#each ['Slider', 'Combobox', 'RadioButtonGroup', 'CyclicButton', 'ToggleButton', 'Button'] as type}
                      {@const compatibility = getBindingCompatibility(type, parameter)}
                      <span class={['mini-compat', compatibility.status]}>{type}</span>
                    {/each}
                  </button>
                {:else}
                  <div class="empty">No parameters match the current filters.</div>
                {/each}
              {:else}
                {#if parameterLayoutMode === 'cards'}
                  <div class="parameter-card-grid">
                    {#each visibleParameters as parameter}
                      {@const cardStatus = parameterCardStatus(parameter)}
                      <button
                        class:selected={selectedParameter?.id === parameter.id}
                        class={['parameter-card', cardStatus.level]}
                        draggable="true"
                        ondragstart={(event) => startParameterDrag(event, parameter)}
                        ondragend={endParameterDrag}
                        onclick={() => selectedParameterId = parameter.id}
                        title="Drag onto a panel component to bind"
                      >
                        <span class="parameter-card-top">
                          <strong>{parameter.name || parameter.id}</strong>
                          <em>{accessLabel(parameter)}</em>
                        </span>
                        <code>{parameter.id}</code>
                        <span class="parameter-chip-row">
                          <span>{parameter.group || 'Ungrouped'}</span>
                          <span>{parameter.type || 'unknown'}</span>
                          <span>{parameterRangeLabel(parameter)}</span>
                          <span>{parameter?.ui?.preferredComponent || 'Any UI'}</span>
                        </span>
                        <span class={['parameter-card-status', cardStatus.level]}>
                          <strong>{cardStatus.label}</strong>
                          <small>{cardStatus.detail}</small>
                        </span>
                      </button>
                    {/each}
                  </div>
                {:else if parameterOrderMode === 'grouped-alpha'}
                  {#each groupedParameters as group}
                    <div class="group-heading">{group.name}</div>
                    {#each group.items as parameter}
                      <button
                        class:selected={selectedParameter?.id === parameter.id}
                        class="parameter-row"
                        draggable="true"
                        ondragstart={(event) => startParameterDrag(event, parameter)}
                        ondragend={endParameterDrag}
                        onclick={() => selectedParameterId = parameter.id}
                        title="Drag onto a panel component to bind"
                      >
                        <span>{parameter.name || parameter.id}</span>
                        <span>{parameter.id}</span>
                        <span>{parameter.type}</span>
                        <span>{accessLabel(parameter)}</span>
                        <span>{parameter?.ui?.preferredComponent || 'Any'}</span>
                      </button>
                    {/each}
                  {/each}
                {:else}
                  {#each visibleParameters as parameter}
                    <button
                      class:selected={selectedParameter?.id === parameter.id}
                      class="parameter-row"
                      draggable="true"
                      ondragstart={(event) => startParameterDrag(event, parameter)}
                      ondragend={endParameterDrag}
                      onclick={() => selectedParameterId = parameter.id}
                      title="Drag onto a panel component to bind"
                    >
                      <span>{parameter.name || parameter.id}</span>
                      <span>{parameter.id}</span>
                      <span>{parameter.type}</span>
                      <span>{accessLabel(parameter)}</span>
                      <span>{parameter?.ui?.preferredComponent || 'Any'}</span>
                    </button>
                  {/each}
                {/if}
                {#if visibleParameters.length === 0}
                  <div class="empty empty-action-card">
                    <strong>No parameters yet</strong>
                    <span>Add a single parameter, generate a small CC starter spine, or edit the source directly.</span>
                    <div class="empty-actions">
                      <button onclick={addParameter}>Add Parameter</button>
                      <button onclick={addStarterCcSpine}>Add Starter CC Spine</button>
                      <button disabled={!!editableProfileDoc || sourceLoadRequested} onclick={loadEditableSourceForEdit}>Edit Source</button>
                    </div>
                  </div>
                {/if}
              {/if}
              {#if hasMoreParameters || hasMoreBackendParameters}
                <div class="show-more-row">
                  <button onclick={showMoreParameters}>
                    Show {Math.min(parameterBatchSize, hasMoreBackendParameters ? Math.max(0, (backendParameterPage?.total ?? 0) - (backendParameterPage?.loaded ?? 0)) : hiddenParameterCount)} more
                  </button>
                  <span>{hasMoreBackendParameters ? 'More parameters available from profile engine' : `${hiddenParameterCount} hidden by performance window`}</span>
                </div>
              {/if}
            </div>
          </section>

          {#if selectedParameter}
            <section class="parameter-setup" class:source-locked={!usingEditableSource && !selectedParameterDetail?.parameter}>
              <div class="section-header compact">
                <div>
                  <span class="section-title">Parameter Setup</span>
                  <h2>{selectedParameter.name || selectedParameter.id}</h2>
                </div>
                <div class="mini-actions">
                  <div class="view-toggle" aria-label="Parameter editor density">
                    <button class:active={parameterEditorMode === 'compact'} onclick={() => parameterEditorMode = 'compact'}>Compact</button>
                    <button class:active={parameterEditorMode === 'expanded'} onclick={() => parameterEditorMode = 'expanded'}>Expanded</button>
                  </div>
                  <button title="Duplicate parameter" onclick={duplicateSelectedParameter}>Duplicate</button>
                  <button title="Delete parameter" onclick={deleteSelectedParameter}>Delete</button>
                </div>
              </div>
              {#if !usingEditableSource}
                <div class="edit-source-banner">
                  <span>
                    {selectedParameterDetail?.parameter
                      ? 'This setup was loaded lazily for the selected parameter. Edits save this parameter back into the profile file.'
                      : 'Loading selected parameter setup from profile JSON...'}
                  </span>
                  <button disabled={sourceLoadRequested} onclick={loadEditableSourceForEdit}>
                    {sourceLoadRequested ? 'Loading full source...' : 'Load Full Source'}
                  </button>
                </div>
              {/if}
              {#if parameterEditorMode === 'compact'}
                <div class="parameter-setup-summary">
                  <span><strong>Recipe</strong>{selectedParameter.messageRecipe || 'Choose recipe'}</span>
                  <span><strong>Range</strong>{parameterRangeLabel(selectedParameter)}</span>
                  <span><strong>UI</strong>{selectedParameter?.ui?.preferredComponent || 'Any'}</span>
                  <span><strong>Send</strong>{selectedParameter?.sendPolicy?.mode || 'continuous'}</span>
                  <span><strong>Status</strong>{parameterCardStatus(selectedParameter).label}</span>
                </div>
              {/if}
              <div class="parameter-form">
                <section class="setup-group identity">
                  <span class="section-title">Identity</span>
                  <div class="setup-grid identity-grid">
                    <label class="wide"><span>Name</span><input value={selectedParameter.name || ''} oninput={(event) => updateSelectedParameterField('name', event.target.value)} /></label>
                    <label><span>Id</span><input class:error={fieldIssue(selectedParameterFieldIssues, 'id')} value={selectedParameter.id || ''} oninput={(event) => updateSelectedParameterField('id', event.target.value)} />
                      {#if fieldIssue(selectedParameterFieldIssues, 'id')}<small class="field-issue">{fieldIssue(selectedParameterFieldIssues, 'id')}</small>{/if}
                    </label>
                    <label><span>Group</span><input value={selectedParameter.group || ''} oninput={(event) => updateSelectedParameterField('group', event.target.value)} /></label>
                    <label><span>Type</span>
                      <select value={selectedParameter.type || 'integer'} oninput={(event) => updateSelectedParameterField('type', event.target.value)}>
                        <option value="integer">Integer</option>
                        <option value="float">Float</option>
                        <option value="bipolar">Bipolar</option>
                        <option value="boolean">Boolean</option>
                        <option value="choice">Choice</option>
                        <option value="enum">Enum</option>
                        <option value="text">Text</option>
                        <option value="action">Action</option>
                        <option value="momentary">Momentary</option>
                        <option value="dumpRequest">Dump request</option>
                      </select>
                    </label>
                  </div>
                </section>

                <section class="setup-group midi">
                  <span class="section-title">MIDI Mapping</span>
                  <div class="setup-grid midi-grid">
                    <label class="wide"><span>Message Recipe</span>
                      <div class="recipe-link-row">
                        <select value={selectedParameter.messageRecipe || ''} oninput={(event) => updateSelectedParameterField('messageRecipe', event.target.value)}>
                          <option value="">Choose recipe</option>
                          {#each messageRecipeIds as recipeId}
                            <option value={recipeId}>{recipeId}</option>
                          {/each}
                        </select>
                        <button title="Edit recipes" onclick={() => setActiveView('recipes')}>Edit</button>
                      </div>
                      {#if fieldIssue(selectedParameterFieldIssues, 'messageRecipe')}<small class="field-issue">{fieldIssue(selectedParameterFieldIssues, 'messageRecipe')}</small>{/if}
                    </label>
                    <label class="wide"><span>Parameter Address</span><input class:error={fieldIssue(selectedParameterFieldIssues, 'address')} value={selectedParameter.address || ''} placeholder="20 or 10 00 20" oninput={(event) => updateSelectedParameterField('address', event.target.value)} />
                      {#if fieldIssue(selectedParameterFieldIssues, 'address')}<small class="field-issue">{fieldIssue(selectedParameterFieldIssues, 'address')}</small>{/if}
                    </label>
                    <label><span>Encoding</span>
                      <select class:error={fieldIssue(selectedParameterFieldIssues, 'encoding')} value={selectedParameter?.encoding?.type || ''} oninput={(event) => updateSelectedParameterEncoding('type', event.target.value)}>
                        <option value="">Unspecified</option>
                        <option value="u7">7-bit value</option>
                        <option value="u14">14-bit value</option>
                        <option value="u14-msb-lsb">14-bit MSB/LSB</option>
                        <option value="nibbled">Nibbled value</option>
                        <option value="enum">Enum / choice</option>
                        <option value="boolean-u7">Boolean 0/127</option>
                        <option value="text-ascii">ASCII text</option>
                      </select>
                      {#if fieldIssue(selectedParameterFieldIssues, 'encoding')}<small class="field-issue">{fieldIssue(selectedParameterFieldIssues, 'encoding')}</small>{/if}
                    </label>
                    <label><span>Default</span><input class:error={fieldIssue(selectedParameterFieldIssues, 'default')} value={defaultValueLabel(selectedParameter)} oninput={(event) => updateSelectedParameterField('default', parsePreviewValue(selectedParameter, event.target.value))} />
                      {#if fieldIssue(selectedParameterFieldIssues, 'default')}<small class="field-issue">{fieldIssue(selectedParameterFieldIssues, 'default')}</small>{/if}
                    </label>
                  </div>
                </section>

                <section class="setup-group values">
                  <span class="section-title">Values</span>
                  <div class="setup-grid values-grid">
                    <label><span>Range Min</span><input class:error={fieldIssue(selectedParameterFieldIssues, 'range')} value={selectedParameter?.range?.min ?? ''} oninput={(event) => updateSelectedParameterRange('min', event.target.value)} /></label>
                    <label><span>Range Max</span><input class:error={fieldIssue(selectedParameterFieldIssues, 'range')} value={selectedParameter?.range?.max ?? ''} oninput={(event) => updateSelectedParameterRange('max', event.target.value)} />
                      {#if fieldIssue(selectedParameterFieldIssues, 'range')}<small class="field-issue">{fieldIssue(selectedParameterFieldIssues, 'range')}</small>{/if}
                    </label>
                    <label><span>False Value</span><input value={selectedParameter.falseValue ?? ''} placeholder="0" oninput={(event) => updateSelectedParameterField('falseValue', numberOrString(event.target.value))} /></label>
                    <label><span>True Value</span><input value={selectedParameter.trueValue ?? ''} placeholder="127" oninput={(event) => updateSelectedParameterField('trueValue', numberOrString(event.target.value))} /></label>
                    <label><span>Trigger Value</span><input value={selectedParameter.triggerValue ?? ''} placeholder="0" oninput={(event) => updateSelectedParameterField('triggerValue', numberOrString(event.target.value))} /></label>
                  </div>
                </section>

                {#if parameterEditorMode === 'expanded'}
                  <section class="setup-group ui">
                    <span class="section-title">Display and UI</span>
                    <div class="setup-grid ui-grid">
                      <label><span>Short Label</span><input value={selectedParameter?.display?.shortLabel || ''} oninput={(event) => updateSelectedParameterDisplay('shortLabel', event.target.value)} /></label>
                      <label><span>Unit</span><input value={selectedParameter?.display?.unit || ''} placeholder="Hz, %, dB..." oninput={(event) => updateSelectedParameterDisplay('unit', event.target.value)} /></label>
                      <label><span>Preferred UI</span>
                        <select value={selectedParameter?.ui?.preferredComponent || ''} oninput={(event) => updateSelectedParameterUi('preferredComponent', event.target.value)}>
                          <option value="">Any</option>
                          <option value="Slider">Slider</option>
                          <option value="Range">Range</option>
                          <option value="Combobox">Combobox</option>
                          <option value="RadioButtonGroup">Radio group</option>
                          <option value="CyclicButton">Cyclic button</option>
                          <option value="ToggleButton">Toggle button</option>
                          <option value="Button">Button</option>
                          <option value="MomentaryButton">Momentary button</option>
                          <option value="TimedButton">Timed button</option>
                        </select>
                      </label>
                    </div>
                  </section>

                  <section class="setup-group policy">
                    <span class="section-title">Send Policy and Access</span>
                    <div class="setup-grid policy-grid">
                      <label><span>Send Mode</span>
                        <select value={selectedParameter?.sendPolicy?.mode || 'continuous'} oninput={(event) => updateSelectedParameterSendPolicy('mode', event.target.value)}>
                          <option value="continuous">Continuous</option>
                          <option value="onCommit">On commit</option>
                          <option value="momentary">Momentary</option>
                          <option value="explicitAction">Explicit action</option>
                        </select>
                      </label>
                      <label><span>Min Interval Ms</span><input value={selectedParameter?.sendPolicy?.minIntervalMs ?? ''} oninput={(event) => updateSelectedParameterSendPolicy('minIntervalMs', numberOrString(event.target.value))} /></label>
                      <label class="check-row"><input type="checkbox" checked={selectedParameter?.access?.canWrite !== false} onchange={(event) => updateSelectedParameterAccess('canWrite', event.target.checked)} /><span>Writable</span></label>
                      <label class="check-row"><input type="checkbox" checked={selectedParameter?.access?.canRead === true} onchange={(event) => updateSelectedParameterAccess('canRead', event.target.checked)} /><span>Readable</span></label>
                      <label class="check-row"><input type="checkbox" checked={selectedParameter?.access?.realtimeSafe !== false} onchange={(event) => updateSelectedParameterAccess('realtimeSafe', event.target.checked)} /><span>Realtime safe</span></label>
                    </div>
                  </section>
                {/if}
              </div>

              {#if selectedParameter.type === 'choice' || selectedParameter.type === 'enum'}
                <div class="choice-editor-wide">
                  <div class="section-header compact">
                    <div>
                      <span class="section-title">Choices</span>
                      <h2>{selectedParameter?.choices?.length ?? 0} options</h2>
                    </div>
                    <button onclick={addChoice}>Add Choice</button>
                  </div>
                  {#if fieldIssue(selectedParameterFieldIssues, 'choices')}<small class="field-issue block">{fieldIssue(selectedParameterFieldIssues, 'choices')}</small>{/if}
                  <div class="choice-list wide">
                    {#each selectedParameter?.choices ?? [] as choice, index}
                      <div class="choice-row">
                        <input value={choice.id || ''} placeholder="id" oninput={(event) => updateSelectedParameterChoice(index, 'id', event.target.value)} />
                        <input value={choice.label || ''} placeholder="label" oninput={(event) => updateSelectedParameterChoice(index, 'label', event.target.value)} />
                        <input value={choice.value ?? ''} placeholder="value" oninput={(event) => updateSelectedParameterChoice(index, 'value', event.target.value)} />
                        <button title="Remove choice" onclick={() => removeChoice(index)}>Remove</button>
                      </div>
                    {:else}
                      <div class="empty small">No choices yet.</div>
                    {/each}
                  </div>
                </div>
              {/if}
            </section>
          {:else}
            <section class="parameter-setup empty">Select a parameter to edit its MIDI setup.</section>
          {/if}
        </div>
      {/if}
    </section>

    {#if showInspectorPanel}
    <aside class:collapsed={!inspectorOpen} class="inspector">
      <button
        class="inspector-toggle"
        title={inspectorOpen ? 'Hide details' : 'Show details'}
        onclick={() => inspectorOpen = !inspectorOpen}
      >
        {inspectorOpen ? 'Hide Details' : 'Details'}
      </button>
      {#if inspectorOpen}
      {#if selectedParameter}
        <div class="section">
          <div class="section-header compact">
            <div>
              <span class="section-title">Selection</span>
              <h2>{selectedParameter.name || selectedParameter.id}</h2>
            </div>
          </div>
          <div class="selected-summary">
            <span>{selectedParameter.id}</span>
            <span>{selectedParameter.type || 'unknown'}</span>
            <span>{selectedParameter.messageRecipe || 'No recipe'}</span>
            {#if selectedParameter.address}<span>Address {selectedParameter.address}</span>{/if}
          </div>
        </div>

        <div class="section">
          <span class="section-title">Diagnostics</span>
          <div class="diagnostic-list">
            {#each selectedDiagnostics as item}
              <div class={['diagnostic-row', item.level]}>
                <span>{item.label}</span>
                <strong>{item.value}</strong>
              </div>
            {/each}
          </div>
        </div>

        {#if selectedParameterIssues.length > 0}
          <div class="section">
            <span class="section-title">Authoring Notes</span>
            <div class="quality-list compact">
              {#each selectedParameterIssues as issue}
                <div class={['quality-row', issue.level]}><span>{issue.text}</span></div>
              {/each}
            </div>
          </div>
        {/if}

        <div class="section">
          <span class="section-title">Selected Tests</span>
          <div class="quality-list compact">
            {#each selectedParameterTests as test}
              <div class={['quality-row', test.hasResult ? (test.passed ? 'ok' : 'error') : 'info']}>
                <strong>{test.name}</strong>
                <span>{test.hasResult ? (test.passed ? 'Passed' : test.error || 'Failed') : 'Not run'}{test.expectedHex ? ` / expected ${test.expectedHex}` : ''}</span>
                {#if test.actualHex}<code>{test.actualHex}</code>{/if}
              </div>
            {:else}
              <div class="empty small">No tests target this parameter.</div>
            {/each}
          </div>
        </div>

        <div class="section">
          <span class="section-title">Used By Panel Controls</span>
          <div class="quality-list compact">
            {#each selectedParameterUses as use}
              <div class="quality-row ok">
                <strong>{use.name}</strong>
                <span>{use.type} / {use.port}{use.dryRun ? ' / dry run' : ''}</span>
              </div>
            {:else}
              <div class="empty small">No controls in the active panel use this parameter.</div>
            {/each}
          </div>
        </div>

        <div class="section">
          <span class="section-title">Dry-run Preview</span>
          <div class="preview-form">
            <input
              value={previewValue}
              placeholder="Value"
              oninput={(event) => previewValue = event.target.value}
              onkeydown={(event) => { if (event.key === 'Enter') previewSelectedParameter(); }}
            />
            <button onclick={previewSelectedParameter}>Preview</button>
          </div>
          {#if selectedPreview}
            <div class={['preview-result', selectedPreview.ok === false ? 'error' : 'ok']}>
              <strong>{selectedPreview.ok === false ? 'Error' : 'Compiled'}</strong>
              <code>{selectedPreview?.transaction?.hex || selectedPreview?.hex || selectedPreview?.error || 'No bytes'}</code>
            </div>
          {:else}
            <div class="preview-result"><span>No preview for this parameter yet.</span></div>
          {/if}
        </div>

        <div class="section">
          <span class="section-title">Binding Compatibility</span>
          <div class="compat-grid">
            {#each ['Slider', 'Range', 'Combobox', 'RadioButtonGroup', 'CyclicButton', 'ToggleButton', 'Button', 'MomentaryButton', 'TimedButton', 'OneShotButton'] as type}
              {@const compatibility = getBindingCompatibility(type, selectedParameter)}
              <div class={['compat-row', compatibility.status]}>
                <span>{type}</span>
                <strong>{compatibility.status}</strong>
              </div>
            {/each}
          </div>
        </div>

        <div class="section json-section">
          <span class="section-title">Descriptor</span>
          <pre>{selectedParameterJson}</pre>
        </div>
      {:else}
        <div class="empty">Select a parameter to inspect it.</div>
      {/if}
      {/if}
    </aside>
    {/if}
  </main>
</div>

<style>
  .designer {
    height: 100%;
    display: flex;
    flex-direction: column;
    min-width: 0;
    background: #1E1E1E;
    color: #DDD;
    font-size: 12px;
  }

  .designer-header {
    flex: 0 0 auto;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    padding: 14px 16px 12px;
    border-bottom: 1px solid #303030;
    background: #202020;
  }

  .eyebrow,
  .section-title,
  .summary span,
  .editor-grid span {
    color: #888;
    text-transform: uppercase;
    font-size: 10px;
  }

  h1,
  h2 {
    margin: 0;
    color: #EEE;
    font-weight: 600;
  }

  h1 {
    font-size: 18px;
  }

  h2 {
    font-size: 15px;
    margin-top: 3px;
  }

  .header-actions {
    display: flex;
    gap: 8px;
    align-items: flex-start;
  }

  .header-action {
    display: grid;
    grid-template-rows: auto 14px;
    gap: 3px;
    min-width: 76px;
  }

  .header-action button {
    width: 100%;
  }

  .header-action span {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 10px;
    line-height: 14px;
    text-align: center;
  }

  button,
  input,
  select {
    min-width: 0;
    background: #252525;
    border: 1px solid #3A3A3A;
    border-radius: 3px;
    color: #DDD;
    font: inherit;
    padding: 5px 8px;
  }

  button {
    cursor: pointer;
  }

  button:hover {
    border-color: #5B9BD5;
  }

  button:disabled {
    cursor: not-allowed;
    opacity: 0.45;
    border-color: #333;
  }

  .summary {
    display: grid;
    grid-template-columns: repeat(5, minmax(0, 1fr));
    gap: 1px;
    border-bottom: 1px solid #303030;
    background: #303030;
  }

  .summary div {
    min-width: 0;
    padding: 8px 12px;
    background: #1B1B1B;
  }

  .summary strong {
    display: block;
    margin-top: 3px;
    font-size: 13px;
    color: #EEE;
  }

  .guided-flow {
    flex: 0 0 auto;
    display: grid;
    grid-template-columns: repeat(5, minmax(120px, 1fr)) auto;
    gap: 6px;
    align-items: stretch;
    padding: 8px;
    border-bottom: 1px solid #303030;
    background: #181818;
  }

  .flow-step {
    display: grid;
    grid-template-columns: 24px minmax(0, 1fr);
    grid-template-rows: auto auto;
    column-gap: 8px;
    row-gap: 1px;
    align-items: center;
    min-height: 46px;
    padding: 7px 8px;
    text-align: left;
    border-color: #343A3F;
    background: #202326;
  }

  .flow-step span {
    grid-row: 1 / span 2;
    display: grid;
    place-items: center;
    width: 22px;
    height: 22px;
    border: 1px solid #3F4B55;
    border-radius: 50%;
    color: #D7E7F5;
    font-size: 11px;
    font-weight: 800;
  }

  .flow-step strong,
  .flow-step small {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .flow-step strong {
    color: #EEF3F7;
    font-size: 12px;
  }

  .flow-step small {
    color: #9BA8B3;
    font-size: 10px;
  }

  .flow-step.active {
    border-color: #5B9BD5;
    background: #243140;
  }

  .flow-step.ok span {
    border-color: rgba(124, 193, 141, 0.6);
    color: #B8E3C0;
  }

  .flow-step.attention span,
  .flow-step.info span {
    border-color: rgba(213, 180, 91, 0.65);
    color: #E0C879;
  }

  .flow-step.error span {
    border-color: rgba(213, 107, 107, 0.7);
    color: #EAA0A0;
  }

  .designer-tabs {
    flex: 0 0 auto;
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 7px 8px;
    border-bottom: 1px solid #303030;
    background: #1A1A1A;
  }

  .designer-tabs.secondary {
    justify-content: flex-end;
    padding-top: 6px;
    padding-bottom: 6px;
  }

  .designer-tabs button {
    height: 26px;
    padding: 0 10px;
  }

  .designer-tabs button.active {
    border-color: #5B9BD5;
    background: #243140;
    color: #EEE;
  }

  .quality-pill {
    margin-left: auto;
    align-self: center;
    padding: 5px 8px;
    border: 1px solid #3A3A3A;
    border-radius: 3px;
    color: #AAA;
  }

  .quality-pill.ok {
    border-color: rgba(124, 193, 141, 0.45);
    color: #9FD4AA;
  }

  .quality-pill.warning {
    border-color: rgba(213, 180, 91, 0.55);
    color: #D7BE72;
  }

  .quality-pill.error {
    border-color: rgba(213, 107, 107, 0.55);
    color: #E18686;
  }

  .designer-body {
    min-height: 0;
    flex: 1;
    display: grid;
    grid-template-columns: minmax(360px, 1fr) minmax(300px, 360px);
  }

  .designer-body.without-inspector {
    grid-template-columns: minmax(360px, 1fr);
  }

  .designer-body:has(.inspector.collapsed) {
    grid-template-columns: minmax(360px, 1fr) 38px;
  }

  .workspace {
    min-width: 0;
    min-height: 0;
    overflow: hidden;
  }

  .parameter-workspace,
  .parameter-table,
  .parameter-setup,
  .inspector {
    min-width: 0;
    min-height: 0;
  }

  .parameter-workspace {
    height: 100%;
    display: grid;
    grid-template-rows: minmax(120px, 1fr) minmax(385px, 430px);
    overflow: hidden;
  }

  .parameter-table,
  .parameter-setup,
  .inspector {
    display: flex;
    flex-direction: column;
  }

  .parameter-table {
    border-right: 0;
    border-bottom: 1px solid #303030;
    height: 100%;
  }

  .parameter-setup {
    height: auto;
    overflow: auto;
    padding: 8px 10px;
    background: #1E1E1E;
    border-top: 1px solid #303030;
    box-shadow: 0 -8px 18px rgba(0, 0, 0, 0.16);
  }

  .table-scroll,
  .parameter-setup,
  .inspector,
  .choice-list,
  .source-validation {
    scrollbar-color: #1A1A1A #5B9BD5;
    scrollbar-width: auto;
  }

  .table-scroll::-webkit-scrollbar,
  .parameter-setup::-webkit-scrollbar,
  .inspector::-webkit-scrollbar,
  .choice-list::-webkit-scrollbar,
  .source-validation::-webkit-scrollbar {
    width: 12px;
    height: 12px;
  }

  .table-scroll::-webkit-scrollbar-track,
  .parameter-setup::-webkit-scrollbar-track,
  .inspector::-webkit-scrollbar-track,
  .choice-list::-webkit-scrollbar-track,
  .source-validation::-webkit-scrollbar-track {
    background: #5B9BD5;
  }

  .table-scroll::-webkit-scrollbar-thumb,
  .parameter-setup::-webkit-scrollbar-thumb,
  .inspector::-webkit-scrollbar-thumb,
  .choice-list::-webkit-scrollbar-thumb,
  .source-validation::-webkit-scrollbar-thumb {
    background: #1A1A1A;
    border-radius: 6px;
    border: 2px solid #5B9BD5;
  }

  .table-scroll::-webkit-scrollbar-corner,
  .parameter-setup::-webkit-scrollbar-corner,
  .inspector::-webkit-scrollbar-corner,
  .choice-list::-webkit-scrollbar-corner,
  .source-validation::-webkit-scrollbar-corner {
    background: #5B9BD5;
  }

  .dump-parse-panel,
  .dump-row {
    display: grid;
    gap: 10px;
    padding: 10px;
    border-bottom: 1px solid #303030;
    background: #202020;
  }

  .dump-parse-panel textarea {
    width: 100%;
    min-height: 74px;
    resize: vertical;
    box-sizing: border-box;
    background: #1B1B1B;
    border: 1px solid #3A3A3A;
    color: #DDD;
    font: inherit;
    padding: 8px;
  }

  .dump-list {
    min-height: 0;
    overflow: auto;
  }

  .dump-grid {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 8px;
  }

  .dump-grid label,
  .dump-mapping-row {
    min-width: 0;
  }

  .dump-grid label {
    display: grid;
    gap: 4px;
  }

  .dump-grid label.wide {
    grid-column: span 2;
  }

  .dump-grid input,
  .dump-grid select {
    width: 100%;
    box-sizing: border-box;
  }

  .dump-mappings {
    display: grid;
    gap: 6px;
    padding: 8px;
    border: 1px solid #303030;
    background: #1B1B1B;
  }

  .dump-mapping-row {
    display: grid;
    grid-template-columns: minmax(180px, 1fr) minmax(120px, 180px) auto;
    gap: 8px;
  }

  .parameter-form {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: 6px;
    margin-top: 8px;
  }

  .parameter-setup.source-locked .parameter-form,
  .parameter-setup.source-locked .mini-actions {
    opacity: 0.5;
    pointer-events: none;
  }

  .edit-source-banner {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    margin-top: 8px;
    padding: 8px;
    border: 1px solid rgba(91, 155, 213, 0.35);
    background: #1A2430;
    color: #B8C7D8;
    font-size: 11px;
  }

  .parameter-setup-summary {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin-top: 8px;
  }

  .parameter-setup-summary span {
    display: grid;
    gap: 2px;
    min-width: 112px;
    flex: 1 1 112px;
    padding: 7px 8px;
    border: 1px solid #30363B;
    border-radius: 3px;
    background: #1A1A1A;
    color: #C7D0D7;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .parameter-setup-summary strong {
    color: #8CA7BA;
    font-size: 10px;
    text-transform: uppercase;
  }

  .setup-group {
    min-width: 0;
    max-width: 100%;
    border: 1px solid #303030;
    background: #202020;
    display: grid;
    grid-template-columns: 132px repeat(5, minmax(0, 1fr));
    gap: 8px;
    align-items: stretch;
    box-sizing: border-box;
  }

  .setup-grid {
    display: grid;
    grid-column: 2 / -1;
    gap: 8px;
    padding: 8px 8px 8px 0;
    align-items: end;
    align-content: start;
  }

  .setup-group > .section-title {
    display: flex;
    align-items: center;
    min-width: 0;
    min-height: 58px;
    padding: 8px 10px;
    background: #26323A;
    border-right: 1px solid #3B4B55;
    color: #CFE6F3;
    font-size: 10px;
    line-height: 1.25;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    box-sizing: border-box;
  }

  .identity-grid,
  .midi-grid {
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }

  .values-grid,
  .ui-grid {
    grid-template-columns: repeat(5, minmax(0, 1fr));
  }

  .policy-grid {
    grid-template-columns: minmax(0, 1.4fr) minmax(0, 0.8fr) repeat(3, minmax(0, 0.85fr));
  }

  .setup-grid label {
    display: grid;
    gap: 4px;
    min-width: 0;
    max-width: 100%;
  }

  .setup-grid label.wide,
  .setup-grid input,
  .setup-grid select {
    min-width: 0;
    max-width: 100%;
    box-sizing: border-box;
  }

  .setup-grid input,
  .setup-grid select {
    width: 100%;
  }

  .setup-grid label > span {
    color: #888;
    text-transform: uppercase;
    font-size: 10px;
  }

  @media (max-width: 1280px) {
    .designer-header {
      align-items: stretch;
      flex-direction: column;
      gap: 10px;
    }

    .header-actions {
      flex-wrap: wrap;
    }

    .header-action {
      min-width: 112px;
    }

    .summary {
      grid-template-columns: repeat(3, minmax(0, 1fr));
    }

    .guided-flow {
      grid-template-columns: repeat(3, minmax(0, 1fr));
    }

    .guided-flow .quality-pill {
      justify-self: start;
      margin-left: 0;
    }

    .parameter-workspace {
      grid-template-rows: minmax(160px, 0.8fr) minmax(400px, 1fr);
    }

    .table-tools {
      grid-template-columns: repeat(4, minmax(120px, 1fr));
    }

    .table-tools > input {
      grid-column: 1 / -1;
    }

    .test-proof-grid,
    .source-proof-strip {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .source-proof-strip > button {
      grid-column: 1 / -1;
      justify-self: start;
    }
  }

  @media (max-width: 980px) {
    .guided-flow {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .guided-flow .quality-pill {
      grid-column: 1 / -1;
      justify-self: start;
      margin-left: 0;
    }

    .finish-workspace {
      grid-template-columns: minmax(0, 1fr);
    }

    .summary {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .parameter-workspace {
      grid-template-rows: minmax(110px, 1fr) minmax(370px, 420px);
    }

    .setup-group {
      grid-template-columns: 104px repeat(5, minmax(0, 1fr));
      gap: 6px;
    }

    .setup-grid {
      gap: 6px;
    }

    .setup-group > .section-title {
      padding: 7px 8px;
      font-size: 9px;
    }

    .mini-actions {
      flex-wrap: wrap;
      justify-content: flex-end;
    }

    .recipe-starter-strip,
    .test-proof-grid,
    .source-proof-strip {
      grid-template-columns: minmax(0, 1fr);
    }

    .proof-output {
      grid-template-columns: auto minmax(0, 1fr);
    }
  }

  .choice-editor-wide {
    margin-top: 16px;
    padding-top: 12px;
    border-top: 1px solid #303030;
  }

  .choice-list.wide {
    margin-top: 8px;
  }

  .selected-summary {
    display: grid;
    gap: 6px;
    margin-top: 8px;
    color: #AAA;
  }

  .selected-summary span {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .table-tools {
    flex: 0 0 auto;
    display: grid;
    grid-template-columns: minmax(180px, 1fr) repeat(4, minmax(108px, auto)) auto auto auto auto;
    gap: 8px;
    align-items: center;
    padding: 8px;
    border-bottom: 1px solid #2B2B2B;
    color: #888;
  }

  .view-toggle {
    display: inline-flex;
    align-items: center;
    gap: 2px;
    padding: 2px;
    border: 1px solid #333;
    border-radius: 4px;
    background: #181818;
  }

  .view-toggle button {
    min-height: 22px;
    padding: 2px 8px;
    border-color: transparent;
    background: transparent;
    color: #AAA;
    font-size: 10px;
  }

  .view-toggle button.active {
    border-color: #4E86B8;
    background: #26384A;
    color: #E9F4FF;
  }

  .parameter-count {
    white-space: nowrap;
  }

  .table-head,
  .parameter-row {
    display: grid;
    grid-template-columns: minmax(140px, 1fr) minmax(160px, 1fr) 78px 92px 96px;
    gap: 8px;
    align-items: center;
  }

  .table-head {
    flex: 0 0 auto;
    padding: 6px 10px;
    color: #777;
    text-transform: uppercase;
    font-size: 10px;
    border-bottom: 1px solid #2B2B2B;
  }

  .table-scroll {
    min-height: 0;
    overflow: auto;
    padding: 4px;
  }

  .show-more-row {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 10px;
    padding: 10px 4px 6px;
    color: #888;
    font-size: 11px;
  }

  .show-more-row button {
    min-width: 132px;
  }

  .group-heading {
    padding: 8px 7px 5px;
    color: #888;
    text-transform: uppercase;
    font-size: 10px;
  }

  .parameter-row {
    width: 100%;
    margin-bottom: 3px;
    text-align: left;
  }

  .parameter-card-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(245px, 1fr));
    gap: 8px;
    align-content: start;
    padding: 4px;
  }

  .parameter-card {
    min-width: 0;
    min-height: 132px;
    display: grid;
    align-content: start;
    gap: 8px;
    padding: 10px;
    text-align: left;
    border-color: #30363B;
    background: #1B1E21;
  }

  .parameter-card.selected {
    border-color: #5B9BD5;
    background: #233141;
  }

  .parameter-card.warning {
    border-color: rgba(213, 180, 91, 0.42);
  }

  .parameter-card.info {
    border-color: rgba(91, 155, 213, 0.38);
  }

  .parameter-card.ok {
    border-color: rgba(124, 193, 141, 0.36);
  }

  .parameter-card-top {
    display: flex;
    align-items: start;
    justify-content: space-between;
    gap: 8px;
    min-width: 0;
  }

  .parameter-card-top strong {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: #EEF3F7;
  }

  .parameter-card-top em {
    flex: 0 0 auto;
    color: #94BFD8;
    font-style: normal;
    font-size: 10px;
  }

  .parameter-card code {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: #AAC7DA;
    font: 11px Consolas, monospace;
  }

  .parameter-chip-row {
    display: flex;
    flex-wrap: wrap;
    gap: 5px;
  }

  .parameter-chip-row span {
    min-width: 0;
    max-width: 100%;
    padding: 3px 6px;
    border: 1px solid #343A3F;
    border-radius: 3px;
    background: #20252A;
    color: #AEB8C2;
    font-size: 10px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .parameter-card-status {
    display: grid;
    gap: 2px;
    padding-top: 6px;
    border-top: 1px solid #30363B;
  }

  .parameter-card-status strong {
    color: #EEE;
    font-size: 11px;
  }

  .parameter-card-status small {
    color: #9DA9B4;
    font-size: 10px;
  }

  .compatibility-parameter-row {
    display: grid;
    grid-template-columns: minmax(140px, 1fr) repeat(6, minmax(74px, auto));
    gap: 6px;
    align-items: center;
    width: 100%;
    margin-bottom: 3px;
    text-align: left;
  }

  .compatibility-parameter-row.selected {
    border-color: #5B9BD5;
    background: #243140;
  }

  .mini-compat {
    min-width: 0;
    border: 1px solid #333;
    border-radius: 3px;
    padding: 3px 5px;
    text-align: center;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 10px;
  }

  .mini-compat.compatible {
    border-color: rgba(124, 193, 141, 0.45);
    color: #9FD4AA;
  }

  .mini-compat.warning {
    border-color: rgba(213, 180, 91, 0.55);
    color: #D7BE72;
  }

  .mini-compat.incompatible {
    border-color: rgba(213, 107, 107, 0.5);
    color: #D98585;
  }

  .parameter-row.selected {
    border-color: #5B9BD5;
    background: #243140;
  }

  .parameter-row span,
  .table-head span {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .inspector {
    overflow: auto;
    padding: 10px;
    gap: 10px;
  }

  .inspector.collapsed {
    padding: 8px 5px;
    align-items: center;
    overflow: hidden;
  }

  .inspector-toggle {
    flex: 0 0 auto;
    width: 100%;
    min-height: 26px;
    padding: 4px 6px;
    font-size: 10px;
    line-height: 1.1;
  }

  .inspector.collapsed .inspector-toggle {
    writing-mode: vertical-rl;
    transform: rotate(180deg);
    height: 112px;
    width: 26px;
    padding: 6px 3px;
  }

  .section {
    border: 1px solid #303030;
    border-radius: 3px;
    background: #202020;
    padding: 10px;
  }

  .panel-section {
    border: 1px solid #303030;
    border-radius: 3px;
    background: #202020;
    padding: 12px;
    min-width: 0;
  }

  .panel-section.full-height {
    height: calc(100% - 24px);
    margin: 12px;
    display: flex;
    flex-direction: column;
  }

  .overview-grid {
    height: 100%;
    overflow: auto;
    padding: 12px;
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(360px, 1fr));
    align-content: start;
    gap: 12px;
  }

  .finish-workspace {
    height: 100%;
    overflow: auto;
    padding: 12px;
    display: grid;
    grid-template-columns: minmax(420px, 1.1fr) minmax(320px, 0.9fr);
    align-content: start;
    gap: 12px;
  }

  .finish-primary {
    grid-column: 1 / -1;
  }

  .finish-actions,
  .finish-status-grid {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    align-items: center;
  }

  .finish-actions {
    margin-top: 10px;
  }

  .finish-status-grid {
    margin-top: 12px;
  }

  .finish-status-grid div {
    min-width: 160px;
    flex: 1 1 160px;
    padding: 10px;
    border: 1px solid #303030;
    border-radius: 3px;
    background: #1A1A1A;
  }

  .finish-status-grid strong {
    display: block;
    min-width: 0;
    margin-top: 4px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: #EEE;
  }

  .profile-setup-card {
    min-height: 0;
  }

  .profile-grid.compact {
    grid-template-columns: repeat(auto-fit, minmax(130px, 1fr));
  }

  .section-header {
    display: flex;
    justify-content: space-between;
    gap: 12px;
    align-items: start;
    margin-bottom: 10px;
  }

  .section-header.compact {
    margin-bottom: 8px;
    align-items: center;
  }

  .mini-actions {
    display: flex;
    align-items: center;
    gap: 6px;
    flex-shrink: 0;
  }

  .editor-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(160px, 1fr));
    gap: 8px;
    margin-top: 10px;
  }

  .editor-grid.single {
    grid-template-columns: minmax(0, 1fr);
  }

  .editor-grid label {
    display: grid;
    gap: 4px;
    min-width: 0;
  }

  .editor-grid label > span,
  .check-row span {
    color: #888;
    text-transform: uppercase;
    font-size: 10px;
  }

  .check-row {
    display: flex !important;
    grid-template-columns: none !important;
    align-items: center;
    gap: 7px !important;
    padding: 6px 0;
  }

  .check-row input {
    width: 14px;
    height: 14px;
  }

  input.error,
  select.error,
  .sysex-token-strip.error {
    border-color: rgba(213, 107, 107, 0.8) !important;
    box-shadow: 0 0 0 1px rgba(213, 107, 107, 0.18);
  }

  .field-issue {
    display: block;
    min-width: 0;
    color: #E18686;
    font-size: 10px;
    line-height: 1.2;
    overflow-wrap: anywhere;
  }

  .field-issue.block {
    margin: 5px 0 0;
  }

  .recipe-link-row {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 5px;
    align-items: center;
    min-width: 0;
  }

  .quality-list,
  .test-list {
    display: grid;
    gap: 7px;
    margin-top: 10px;
  }

  .quality-list.compact {
    margin-top: 8px;
  }

  .quality-row {
    min-width: 0;
    padding: 8px;
    background: #1A1A1A;
    border: 1px solid #303030;
    border-radius: 3px;
  }

  .quality-row strong {
    display: block;
    color: #EEE;
    margin-bottom: 3px;
  }

  .quality-row span,
  .muted {
    color: #999;
  }

  .quality-row code {
    display: block;
    margin-top: 5px;
    color: #CCC;
    font: 11px Consolas, monospace;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .quality-row.ok {
    border-color: rgba(124, 193, 141, 0.35);
  }

  .quality-row.warning {
    border-color: rgba(213, 180, 91, 0.45);
  }

  .quality-row.error {
    border-color: rgba(213, 107, 107, 0.5);
  }

  .quality-row.info {
    border-color: rgba(91, 155, 213, 0.35);
  }

  .workflow-list,
  .diagnostic-list {
    display: grid;
    gap: 6px;
    margin-top: 10px;
  }

  .workflow-row,
  .diagnostic-row {
    min-width: 0;
    display: grid;
    grid-template-columns: minmax(92px, 0.75fr) minmax(0, 1.25fr);
    gap: 8px;
    align-items: center;
    padding: 7px 8px;
    background: #1A1A1A;
    border: 1px solid #303030;
    border-radius: 3px;
  }

  .workflow-row strong,
  .diagnostic-row strong {
    color: #EEE;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .workflow-row span,
  .diagnostic-row span {
    color: #AAA;
    min-width: 0;
  }

  .workflow-row.ok,
  .diagnostic-row.ok {
    border-color: rgba(124, 193, 141, 0.35);
  }

  .workflow-row.warning,
  .diagnostic-row.warning {
    border-color: rgba(213, 180, 91, 0.45);
  }

  .workflow-row.error,
  .diagnostic-row.error {
    border-color: rgba(213, 107, 107, 0.5);
  }

  .workflow-row.info,
  .diagnostic-row.info {
    border-color: rgba(91, 155, 213, 0.35);
  }

  .group-cloud {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin-top: 10px;
  }

  .test-list,
  .authored-test-list,
  .recipe-list,
  .choice-list {
    min-height: 0;
    overflow: auto;
  }

  .authored-test-list,
  .recipe-list,
  .choice-list {
    display: grid;
    gap: 6px;
  }

  .authored-test-row {
    display: grid;
    grid-template-columns: minmax(120px, 1fr) minmax(150px, 1fr) 80px minmax(120px, 1fr) auto;
    gap: 6px;
    align-items: center;
    padding: 7px;
    background: #1A1A1A;
    border: 1px solid #303030;
    border-radius: 3px;
  }

  .authored-test-row label {
    display: grid;
    gap: 3px;
    min-width: 0;
  }

  .authored-test-row.ok {
    border-color: rgba(124, 193, 141, 0.35);
  }

  .authored-test-row.error {
    border-color: rgba(213, 107, 107, 0.5);
  }

  .authored-test-row code {
    grid-column: 1 / -1;
    color: #CCC;
    font: 11px Consolas, monospace;
  }

  .test-proof-card {
    display: grid;
    gap: 10px;
    padding: 10px;
    background: #1A1A1A;
    border: 1px solid #303030;
    border-radius: 4px;
  }

  .test-proof-card.ok {
    border-color: rgba(124, 193, 141, 0.45);
  }

  .test-proof-card.error {
    border-color: rgba(213, 107, 107, 0.55);
  }

  .test-proof-card.info {
    border-color: rgba(91, 155, 213, 0.35);
  }

  .proof-card-header,
  .recipe-proof-header {
    display: flex;
    align-items: start;
    justify-content: space-between;
    gap: 10px;
    min-width: 0;
  }

  .proof-card-header > div,
  .recipe-proof-header {
    min-width: 0;
  }

  .proof-card-header strong,
  .recipe-proof-header strong {
    display: block;
    margin-top: 4px;
    color: #EEF3F7;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .proof-card-header small,
  .recipe-proof-header small {
    display: block;
    margin-top: 2px;
    color: #A4AFB8;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .proof-badge {
    display: inline-block;
    width: fit-content;
    padding: 3px 6px;
    border: 1px solid #3A3A3A;
    border-radius: 3px;
    background: #20252A;
    color: #C8D0D8;
    font-size: 10px;
    font-weight: 700;
    text-transform: uppercase;
  }

  .proof-badge.ok {
    border-color: rgba(124, 193, 141, 0.48);
    color: #B8E3C0;
  }

  .proof-badge.warning,
  .proof-badge.info {
    border-color: rgba(213, 180, 91, 0.52);
    color: #E0C879;
  }

  .proof-badge.error {
    border-color: rgba(213, 107, 107, 0.58);
    color: #EAA0A0;
  }

  .test-proof-grid {
    display: grid;
    grid-template-columns: minmax(150px, 1.1fr) minmax(170px, 1.2fr) 90px minmax(150px, 1fr);
    gap: 8px;
  }

  .test-proof-grid label {
    display: grid;
    gap: 4px;
    min-width: 0;
  }

  .test-proof-grid label > span {
    color: #888;
    text-transform: uppercase;
    font-size: 10px;
  }

  .proof-output {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto minmax(0, 1fr);
    gap: 6px;
    align-items: center;
    padding: 7px;
    border: 1px solid #2C343A;
    border-radius: 3px;
    background: #15191C;
  }

  .proof-output span {
    color: #8DA4B6;
    font-size: 10px;
    text-transform: uppercase;
  }

  .proof-output code {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: #D8E5EE;
    font: 11px Consolas, monospace;
  }

  .recipe-starter-strip {
    display: grid;
    grid-template-columns: repeat(3, minmax(150px, 1fr));
    gap: 8px;
    margin-bottom: 4px;
  }

  .recipe-type-card {
    display: grid;
    gap: 3px;
    min-height: 72px;
    padding: 9px;
    text-align: left;
    border-color: rgba(91, 155, 213, 0.32);
    background: #1B242C;
  }

  .recipe-type-card span {
    color: #94BFD8;
    font-size: 10px;
    font-weight: 800;
    text-transform: uppercase;
  }

  .recipe-type-card strong {
    color: #EEF3F7;
  }

  .recipe-type-card small {
    color: #9FAAB4;
    line-height: 1.3;
  }

  .recipe-row {
    display: grid;
    grid-template-columns: minmax(130px, 1.1fr) 92px repeat(5, minmax(90px, 1fr)) auto;
    gap: 6px;
    align-items: end;
    padding: 7px;
    background: #1A1A1A;
    border: 1px solid #303030;
    border-radius: 3px;
  }

  .recipe-row.sysex {
    grid-template-columns: minmax(130px, 0.8fr) 92px minmax(420px, 2.4fr) repeat(4, minmax(96px, 0.8fr)) auto;
    align-items: start;
  }

  .recipe-proof-header {
    grid-column: 1 / -1;
    display: block;
    padding-bottom: 8px;
    border-bottom: 1px solid #303030;
  }

  .recipe-row label,
  .sysex-token-editor {
    display: grid;
    gap: 3px;
    min-width: 0;
  }

  .recipe-row label span,
  .sysex-token-editor > span {
    color: #888;
    text-transform: uppercase;
    font-size: 10px;
  }

  .sysex-token-editor {
    grid-row: span 2;
  }

  .sysex-token-strip {
    min-height: 34px;
    display: flex;
    flex-wrap: wrap;
    gap: 5px;
    align-items: flex-start;
    padding: 5px;
    background: #222;
    border: 1px solid #383838;
    border-radius: 3px;
  }

  .sysex-token {
    display: flex;
    align-items: stretch;
    min-width: 78px;
    max-width: 178px;
    background: #181818;
    border: 1px solid #3A3A3A;
    border-radius: 3px;
    overflow: hidden;
  }

  .sysex-token input {
    min-width: 0;
    width: 92px;
    height: 24px;
    padding: 3px 5px;
    border: 0;
    border-right: 1px solid #333;
    background: #242424;
    color: #EEE;
    font: 11px Consolas, monospace;
  }

  .token-actions {
    display: flex;
    align-items: stretch;
  }

  .token-actions button {
    min-width: 20px;
    height: 24px;
    padding: 0 4px;
    border: 0;
    border-left: 1px solid #333;
    border-radius: 0;
    font-size: 10px;
  }

  .sysex-token-palette {
    display: flex;
    flex-wrap: wrap;
    gap: 5px;
    align-items: center;
  }

  .sysex-token-palette button {
    min-height: 24px;
    padding: 3px 7px;
    font: 11px Consolas, monospace;
  }

  .sysex-token-palette input {
    min-width: 150px;
    width: 180px;
    height: 24px;
    font: 11px Consolas, monospace;
  }

  .sysex-token-editor code {
    display: block;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: #BFD9EA;
    font: 11px Consolas, monospace;
  }

  @media (max-width: 1280px) {
    .recipe-row,
    .recipe-row.sysex {
      grid-template-columns: repeat(auto-fit, minmax(128px, 1fr));
    }

    .sysex-token-editor {
      grid-column: 1 / -1;
      grid-row: auto;
    }
  }

  .choice-row {
    display: grid;
    grid-template-columns: minmax(80px, 1fr) minmax(110px, 1fr) 70px auto;
    gap: 6px;
    align-items: center;
  }

  .empty.small {
    padding: 8px 0 0;
  }

  .source-editor {
    height: 100%;
    min-width: 0;
    min-height: 0;
    display: grid;
    grid-template-rows: auto auto minmax(220px, 1fr) auto minmax(90px, 0.35fr);
    border-right: 1px solid #303030;
  }

  .source-toolbar,
  .source-status {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 9px 10px;
    border-bottom: 1px solid #2B2B2B;
    background: #202020;
  }

  .source-toolbar strong {
    display: block;
    max-width: 520px;
    margin-top: 3px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: #DDD;
  }

  .source-actions {
    display: flex;
    align-items: center;
    gap: 6px;
    flex-shrink: 0;
  }

  .source-proof-strip {
    display: grid;
    grid-template-columns: repeat(3, minmax(120px, 1fr)) auto;
    gap: 8px;
    align-items: stretch;
    padding: 8px 10px;
    border-bottom: 1px solid #2B2B2B;
    background: #181B1E;
  }

  .source-proof-step {
    min-width: 0;
    padding: 7px 8px;
    border: 1px solid #30363B;
    border-radius: 3px;
    background: #202326;
  }

  .source-proof-step span {
    display: block;
    color: #8CA7BA;
    font-size: 10px;
    text-transform: uppercase;
  }

  .source-proof-step strong {
    display: block;
    min-width: 0;
    margin-top: 3px;
    color: #EEE;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .source-proof-step.ok,
  .source-proof-step.ok-text {
    border-color: rgba(124, 193, 141, 0.42);
  }

  .source-proof-step.error,
  .source-proof-step.error-text {
    border-color: rgba(213, 107, 107, 0.5);
  }

  .source-proof-step.muted-status,
  .source-proof-step.info {
    border-color: rgba(91, 155, 213, 0.35);
  }

  .dirty-label {
    color: #D7BE72;
  }

  .muted-status {
    color: #999;
  }

  .source-editor textarea {
    min-width: 0;
    min-height: 0;
    resize: none;
    padding: 12px;
    border: none;
    border-bottom: 1px solid #2B2B2B;
    outline: none;
    background: #151515;
    color: #DADADA;
    font: 12px Consolas, monospace;
    line-height: 1.45;
    tab-size: 2;
  }

  .source-status {
    justify-content: flex-start;
    color: #999;
  }

  .source-validation {
    min-height: 0;
    overflow: auto;
    padding: 8px;
    display: grid;
    align-content: start;
    gap: 7px;
  }

  .ok-text {
    color: #9FD4AA;
  }

  .error-text {
    color: #E18686;
  }

  .preview-form {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 6px;
    margin-top: 8px;
  }

  .preview-result {
    margin-top: 8px;
    padding: 8px;
    border: 1px solid #303030;
    border-radius: 3px;
    background: #1A1A1A;
  }

  .preview-result.ok {
    border-color: rgba(124, 193, 141, 0.35);
  }

  .preview-result.error {
    border-color: rgba(213, 107, 107, 0.5);
  }

  .preview-result strong {
    display: block;
    margin-bottom: 4px;
  }

  .preview-result code {
    display: block;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font: 11px Consolas, monospace;
    color: #EEE;
  }

  .compat-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 8px;
    margin-top: 10px;
  }

  .compat-row {
    min-width: 0;
    padding: 7px;
    background: #1A1A1A;
    border: 1px solid #2D2D2D;
    border-radius: 3px;
  }

  .compat-row strong {
    display: block;
    margin-top: 2px;
    color: #DDD;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .compat-row.compatible {
    border-color: rgba(124, 193, 141, 0.4);
  }

  .compat-row.warning {
    border-color: rgba(213, 180, 91, 0.5);
  }

  .compat-row.incompatible {
    border-color: rgba(213, 107, 107, 0.45);
  }

  .json-section pre {
    max-height: 280px;
    overflow: auto;
    margin: 8px 0 0;
    padding: 8px;
    background: #151515;
    border: 1px solid #2B2B2B;
    color: #CCC;
    font: 11px Consolas, monospace;
  }

  @media (max-width: 1280px) {
    .table-tools {
      grid-template-columns: repeat(4, minmax(120px, 1fr));
    }

    .table-tools > input {
      grid-column: 1 / -1;
    }

    .test-proof-grid,
    .source-proof-strip {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .source-proof-strip > button {
      grid-column: 1 / -1;
      justify-self: start;
    }
  }

  @media (max-width: 980px) {
    .recipe-starter-strip,
    .test-proof-grid,
    .source-proof-strip,
    .parameter-card-grid {
      grid-template-columns: minmax(0, 1fr);
    }

    .proof-output {
      grid-template-columns: auto minmax(0, 1fr);
    }

    .source-toolbar,
    .source-status {
      align-items: flex-start;
      flex-direction: column;
    }
  }

  .empty {
    padding: 16px;
    color: #777;
  }

  .empty-action-card {
    display: grid;
    justify-items: start;
    gap: 8px;
    margin: 10px;
    padding: 14px;
    border: 1px solid rgba(91, 155, 213, 0.32);
    border-radius: 5px;
    background: #202832;
    color: #AEBCC8;
  }

  .empty-action-card strong {
    color: #EEF3F7;
    font-size: 13px;
  }

  .empty-action-card span {
    color: #AEBCC8;
  }

  .empty-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
</style>
