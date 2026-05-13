<script>
  import { onMount } from 'svelte';
  import { get } from 'svelte/store';
  import { activePanel, openDeviceProfileTab, syncOpenDeviceProfileDesigner, updatePanel } from '../stores/panels.js';
  import { selectedControl, updateControlProperty } from '../stores/controls.js';
  import {
    deviceProfiles,
    deviceDiagnostics,
    deviceRoleMappings,
    importDeviceProfile,
    latestMidiPreview,
    latestProfileImport,
    latestProfileTestResult,
    mapDeviceRole,
    midiDestinations,
    midiMonitorEvents,
    profileParameters,
    refreshDeviceProfiles,
    refreshProfileParameters,
    runTestsForProfile,
    selectedDeviceProfileId,
    selectedMidiDestinationId,
  } from '../stores/deviceProfiles.js';
  import { getBindingCompatibility } from '../models/componentPorts.js';

  let query = $state('');
  let showAllIssues = $state(false);
  let showAllMonitorEvents = $state(false);
  let showProfileInspector = $state(false);
  let monitorCopyStatus = $state('');
  let selectedProfileId = $derived($selectedDeviceProfileId);
  let selectedDestinationId = $derived($selectedMidiDestinationId);

  let selectedProfileLoaded = $derived(
    ($deviceProfiles ?? []).some((profile) => profile.id === selectedProfileId)
  );
  let snapshotParameters = $derived(snapshotParameterList($activePanel));
  let loadedParameters = $derived($profileParameters?.[selectedProfileId] ?? []);
  let parameters = $derived(
    selectedProfileLoaded || loadedParameters.length > 0
      ? loadedParameters
      : snapshotParameters
  );
  let filteredParameters = $derived(parameters.filter((parameter) => {
    const needle = query.trim().toLowerCase();
    if (!needle) return true;
    return [
      parameter.id,
      parameter.name,
      parameter.group,
      parameter.type,
    ].some((value) => String(value ?? '').toLowerCase().includes(needle));
  }));

  let selectedControlType = $derived($selectedControl?._children?.Core?.controlType ?? '');
  let selectedProfile = $derived($deviceProfiles.find((profile) => profile.id === selectedProfileId) ?? null);
  let selectedProfileName = $derived(
    selectedProfile?.name || selectedProfileId
  );
  let panelProfileRequirement = $derived(getPanelRequiredProfile($activePanel, 'mainSynth'));
  let panelRequiredProfileId = $derived(panelProfileRequirement?.profileId ?? '');
  let panelRequiredProfileLoaded = $derived(
    !panelRequiredProfileId
      || ($deviceProfiles ?? []).some((profile) => profile.id === panelRequiredProfileId)
  );
  let parameterSourceLabel = $derived(
    selectedProfileLoaded || loadedParameters.length > 0
      ? 'Live profile'
      : snapshotParameters.length > 0
        ? 'Snapshot only'
        : 'No parameters'
  );
  let profileLinkStatus = $derived(getProfileLinkStatus({
    requiredProfileId: panelRequiredProfileId,
    currentProfileId: selectedProfileId,
    requiredProfileLoaded: panelRequiredProfileLoaded,
    currentProfileLoaded: selectedProfileLoaded,
    snapshotCount: snapshotParameters.length,
  }));
  let selectedProfileTestResult = $derived(
    $latestProfileTestResult?.profileId && $latestProfileTestResult.profileId !== selectedProfileId
      ? null
      : $latestProfileTestResult
  );
  let profileStats = $derived(computeProfileStats(parameters, selectedProfileTestResult));
  let profileQualityChecks = $derived(buildProfileQualityChecks({
    parameters,
    profile: selectedProfile,
    profileLoaded: selectedProfileLoaded,
    parameterSource: parameterSourceLabel,
    testResult: selectedProfileTestResult,
  }));
  let profileQualitySummary = $derived(summarizeProfileQuality(profileQualityChecks));
  let authorMilestones = $derived(buildAuthorMilestones({
    qualityChecks: profileQualityChecks,
    qualitySummary: profileQualitySummary,
    profileStats,
    profileLinkStatus,
  }));
  let latestMonitorEvent = $derived(($midiMonitorEvents ?? []).at(-1) ?? null);
  let latestMonitorDetail = $derived(
    latestMonitorEvent
      ? monitorEventTitle(latestMonitorEvent)
      : 'No MIDI events'
  );
  let visibleMonitorEvents = $derived(
    ($midiMonitorEvents ?? []).slice(showAllMonitorEvents ? -20 : -4).reverse()
  );
  let panelDeviceIssues = $derived(buildPanelDeviceIssues($activePanel));
  let combinedDeviceIssues = $derived([
    ...($deviceDiagnostics?.issues ?? []),
    ...panelDeviceIssues,
  ]);
  let visibleDeviceIssues = $derived(showAllIssues ? combinedDeviceIssues : combinedDeviceIssues.slice(0, 4));
  let lastParameterRefreshProfileId = '';

  onMount(() => {
    refreshDeviceProfiles();
    refreshProfileParameters(selectedProfileId);
  });

  $effect(() => {
    if (!selectedProfileId || selectedProfileId === lastParameterRefreshProfileId) return;
    lastParameterRefreshProfileId = selectedProfileId;
    refreshProfileParameters(selectedProfileId);
  });

  function handleProfileChange(profileId) {
    refreshProfileParameters(profileId);
    mapDeviceRole('mainSynth', profileId, {
      midiDestination: findDestination(selectedDestinationId),
    });
    const profile = $deviceProfiles.find((item) => item.id === profileId);
    syncOpenDeviceProfileDesigner({
      id: profileId,
      name: profile?.name || profileId,
    });
  }

  function handleDestinationChange(destinationId) {
    mapDeviceRole('mainSynth', selectedProfileId, {
      midiDestination: findDestination(destinationId),
    });
  }

  function handleRunTests() {
    runTestsForProfile(selectedProfileId);
  }

  function handleOpenDesigner() {
    openDeviceProfileTab({
      id: selectedProfileId,
      name: selectedProfileName,
    });
  }

  function monitorEventTitle(event) {
    return monitorEventLine(event);
  }

  function issueTitle(issue) {
    return [
      issue?.level,
      issue?.source,
      issue?.message,
    ].filter(Boolean).join('  ');
  }

  function issueAction(issue) {
    if (issue?.action) return issue.action;
    if (String(issue?.message ?? '').includes('preview-only')) return 'Select output';
    if (String(issue?.message ?? '').includes('missing profile')) return 'Import profile';
    return '';
  }

  function getPanelRequiredProfile(panel, role = 'mainSynth') {
    const requiredProfiles = Array.isArray(panel?.requiredProfiles) ? panel.requiredProfiles : [];
    return requiredProfiles.find((entry) => entry?.role === role) ?? null;
  }

  function getProfileLinkStatus({
    requiredProfileId,
    currentProfileId,
    requiredProfileLoaded,
    currentProfileLoaded,
    snapshotCount,
  }) {
    if (!requiredProfileId) {
      return {
        level: 'info',
        label: 'Unlinked',
        message: 'This panel has no required profile recorded yet.',
      };
    }

    if (!requiredProfileLoaded) {
      return {
        level: 'error',
        label: 'Missing',
        message: snapshotCount > 0
          ? `Requires ${requiredProfileId}; showing saved parameter snapshots.`
          : `Requires ${requiredProfileId}; import the profile to bind or send.`,
      };
    }

    if (requiredProfileId !== currentProfileId) {
      return {
        level: 'warning',
        label: 'Mismatch',
        message: `Panel expects ${requiredProfileId}; current role uses ${currentProfileId || 'none'}.`,
      };
    }

    if (!currentProfileLoaded) {
      return {
        level: 'error',
        label: 'Unavailable',
        message: `Current profile ${currentProfileId} is not loaded.`,
      };
    }

    return {
      level: 'ok',
      label: 'Linked',
      message: `Panel and role both use ${currentProfileId}.`,
    };
  }

  function computeProfileStats(profileParameterList, testResult) {
    const list = Array.isArray(profileParameterList) ? profileParameterList : [];
    const typeCounts = new Map();
    const groupSet = new Set();
    let writable = 0;
    let readOnly = 0;
    let realtimeUnsafe = 0;
    let continuous = 0;
    let onCommit = 0;
    let explicitAction = 0;
    let snapshotOnly = 0;

    for (const parameter of list) {
      const type = String(parameter?.type || 'unknown');
      typeCounts.set(type, (typeCounts.get(type) ?? 0) + 1);
      if (parameter?.group) groupSet.add(String(parameter.group));
      if (parameter?.snapshotOnly) snapshotOnly += 1;

      if (parameter?.access?.canWrite === false) readOnly += 1;
      else writable += 1;

      if (parameter?.access?.realtimeSafe === false) realtimeUnsafe += 1;

      const mode = String(parameter?.sendPolicy?.mode ?? '');
      if (mode === 'continuous') continuous += 1;
      else if (mode === 'onCommit' || mode === 'momentary') onCommit += 1;
      else if (mode === 'explicitAction') explicitAction += 1;
    }

    const testsRunning = testResult?.running === true;
    const testsTotal = Number(testResult?.total ?? 0);
    const testsPassed = Number(testResult?.passed ?? 0);
    const testLabel = testsRunning
      ? 'Running'
      : testsTotal > 0
        ? `${testsPassed}/${testsTotal}`
        : 'Not run';

    return {
      total: list.length,
      groups: groupSet.size,
      writable,
      readOnly,
      realtimeUnsafe,
      continuous,
      onCommit,
      explicitAction,
      snapshotOnly,
      testLabel,
      typeSummary: [...typeCounts.entries()]
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([type, count]) => `${type} ${count}`)
        .join(' / ') || 'none',
    };
  }

  function buildProfileQualityChecks({
    parameters: profileParameterList,
    profile,
    profileLoaded,
    parameterSource,
    testResult,
  }) {
    const list = Array.isArray(profileParameterList) ? profileParameterList : [];
    const checks = [];
    const missingGroup = list.filter((parameter) => !parameter?.group).length;
    const missingDisplay = list.filter((parameter) => !parameter?.display).length;
    const missingAccess = list.filter((parameter) => !parameter?.access).length;
    const missingSendPolicy = list.filter((parameter) => !parameter?.sendPolicy).length;
    const missingPreferredUi = list.filter((parameter) => !parameter?.ui?.preferredComponent).length;
    const readOnlyWritableShape = list.filter((parameter) => parameter?.access?.canWrite === false).length;
    const testsRunning = testResult?.running === true;
    const testsTotal = Number(testResult?.total ?? 0);
    const testsPassed = Number(testResult?.passed ?? 0);

    if (!profileLoaded) {
      checks.push({
        level: parameterSource === 'Snapshot only' ? 'warning' : 'error',
        label: 'Profile load',
        message: parameterSource === 'Snapshot only'
          ? 'Using panel snapshots because the live profile is not loaded.'
          : 'No live profile is loaded for the current role.',
      });
    } else {
      checks.push({
        level: 'ok',
        label: 'Profile load',
        message: `${profile?.name || selectedProfileId} is available.`,
      });
    }

    if (list.length === 0) {
      checks.push({
        level: 'error',
        label: 'Parameters',
        message: 'No parameters are visible for this profile.',
      });
    } else {
      checks.push({
        level: 'ok',
        label: 'Parameters',
        message: `${list.length} parameters available.`,
      });
    }

    if (testsRunning) {
      checks.push({ level: 'info', label: 'Tests', message: 'Profile tests are running.' });
    } else if (testsTotal === 0) {
      checks.push({
        level: 'warning',
        label: 'Tests',
        message: 'Tests have not been run in this session.',
      });
    } else if (testsPassed !== testsTotal) {
      checks.push({
        level: 'error',
        label: 'Tests',
        message: `${testsPassed}/${testsTotal} tests passed.`,
      });
    } else {
      checks.push({
        level: 'ok',
        label: 'Tests',
        message: `${testsPassed}/${testsTotal} tests passed.`,
      });
    }

    if (missingAccess > 0) {
      checks.push({
        level: 'warning',
        label: 'Access',
        message: `${missingAccess} parameters have no access flags.`,
      });
    } else if (list.length > 0) {
      checks.push({ level: 'ok', label: 'Access', message: 'All visible parameters describe access.' });
    }

    if (missingSendPolicy > 0) {
      checks.push({
        level: 'warning',
        label: 'Send policy',
        message: `${missingSendPolicy} parameters have no send policy.`,
      });
    } else if (list.length > 0) {
      checks.push({ level: 'ok', label: 'Send policy', message: 'All visible parameters describe send behavior.' });
    }

    if (missingDisplay > 0 || missingPreferredUi > 0 || missingGroup > 0) {
      checks.push({
        level: 'info',
        label: 'Authoring metadata',
        message: `${missingDisplay} display / ${missingPreferredUi} preferred UI / ${missingGroup} group gaps.`,
      });
    } else if (list.length > 0) {
      checks.push({ level: 'ok', label: 'Authoring metadata', message: 'Display, group, and preferred UI metadata are present.' });
    }

    if (readOnlyWritableShape > 0) {
      checks.push({
        level: 'info',
        label: 'Read-only',
        message: `${readOnlyWritableShape} read-only parameters will be blocked from write controls.`,
      });
    }

    return checks;
  }

  function summarizeProfileQuality(checks) {
    const list = Array.isArray(checks) ? checks : [];
    const errors = list.filter((check) => check.level === 'error').length;
    const warnings = list.filter((check) => check.level === 'warning').length;
    const info = list.filter((check) => check.level === 'info').length;

    if (errors > 0) return { level: 'error', label: `${errors} errors` };
    if (warnings > 0) return { level: 'warning', label: `${warnings} warnings` };
    if (info > 0) return { level: 'info', label: `${info} notes` };
    return { level: 'ok', label: 'Ready' };
  }

  function buildAuthorMilestones({ qualityChecks, qualitySummary, profileStats: stats, profileLinkStatus: linkStatus }) {
    const hasQualityError = qualityChecks.some((check) => check.level === 'error');
    const hasQualityWarning = qualityChecks.some((check) => check.level === 'warning');
    const testCheck = qualityChecks.find((check) => check.label === 'Tests');
    const testsReady = testCheck?.level === 'ok';

    return [
      {
        status: linkStatus.level === 'ok' ? 'done' : linkStatus.level,
        label: 'Panel Link',
        detail: linkStatus.message,
      },
      {
        status: stats.total > 0 ? 'done' : 'error',
        label: 'Parameter Model',
        detail: `${stats.total} parameters across ${stats.groups} groups.`,
      },
      {
        status: hasQualityError ? 'error' : hasQualityWarning ? 'warning' : 'done',
        label: 'Quality Gate',
        detail: qualitySummary.label,
      },
      {
        status: testsReady ? 'done' : 'warning',
        label: 'Test Vectors',
        detail: `Session result: ${stats.testLabel}.`,
      },
      {
        status: stats.continuous + stats.onCommit + stats.explicitAction > 0 ? 'done' : 'warning',
        label: 'Runtime Behavior',
        detail: `continuous ${stats.continuous}, commit ${stats.onCommit}, action ${stats.explicitAction}.`,
      },
    ];
  }

  function monitorEventLine(event) {
    return [
      event?.direction,
      event?.deviceRole,
      event?.messageType,
      event?.semantic,
      event?.hex,
      event?.status,
    ].filter(Boolean).join('  ');
  }

  async function copyMonitorDetail() {
    const text = latestMonitorEvent ? monitorEventLine(latestMonitorEvent) : '';
    if (!text) return;

    try {
      if (typeof navigator === 'undefined' || !navigator.clipboard?.writeText) {
        throw new Error('Clipboard API unavailable');
      }
      await navigator.clipboard.writeText(text);
      monitorCopyStatus = 'Copied';
    } catch {
      monitorCopyStatus = 'Copy failed';
    }

    setTimeout(() => {
      monitorCopyStatus = '';
    }, 1200);
  }

  function clearMonitorView() {
    midiMonitorEvents.set([]);
  }

  function usePanelRequiredProfile() {
    if (!panelRequiredProfileId || !panelRequiredProfileLoaded) return;
    refreshProfileParameters(panelRequiredProfileId);
    mapDeviceRole('mainSynth', panelRequiredProfileId, {
      midiDestination: findDestination(selectedDestinationId),
    });
  }

  function adoptCurrentProfileForPanel() {
    const panel = get(activePanel);
    if (!panel?.id || !selectedProfileId) return;

    const requiredProfiles = Array.isArray(panel.requiredProfiles) ? [...panel.requiredProfiles] : [];
    const existingIndex = requiredProfiles.findIndex((entry) => entry?.role === 'mainSynth');
    const requiredProfile = {
      role: 'mainSynth',
      profileId: selectedProfileId,
      version: '*',
    };

    if (existingIndex >= 0) requiredProfiles[existingIndex] = requiredProfile;
    else requiredProfiles.push(requiredProfile);

    updatePanel(panel.id, { requiredProfiles });
  }

  function snapshotParameterList(panel) {
    const snapshots = panel?.parameterSnapshots;
    if (!snapshots || typeof snapshots !== 'object') return [];

    return Object.entries(snapshots)
      .filter(([key]) => key.startsWith('mainSynth.'))
      .map(([key, snapshot]) => ({
        id: snapshot?.id ?? key.replace(/^mainSynth\./, ''),
        name: snapshot?.name ?? snapshot?.id ?? key.replace(/^mainSynth\./, ''),
        type: snapshot?.type ?? '',
        group: snapshot?.group || 'Snapshot',
        range: snapshot?.range ?? null,
        choices: Array.isArray(snapshot?.choices) ? snapshot.choices : [],
        display: snapshot?.display ?? null,
        snapshotOnly: true,
      }));
  }

  function buildPanelDeviceIssues(panel) {
    const issues = [];
    if (!panel) return issues;

    const loadedProfileIds = new Set(($deviceProfiles ?? []).map((profile) => profile.id));
    const requiredProfiles = Array.isArray(panel.requiredProfiles) ? panel.requiredProfiles : [];
    const parameterByRole = new Map();

    for (const required of requiredProfiles) {
      const role = String(required?.role ?? 'mainSynth');
      const profileId = String(required?.profileId ?? '');
      const mappedProfileId = String($deviceRoleMappings?.[role]?.profileId ?? selectedProfileId);

      if (!profileId) {
        issues.push({
          level: 'warning',
          source: role,
          message: 'Panel has a required profile entry without a profile id.',
        });
        continue;
      }

      if (!loadedProfileIds.has(profileId)) {
        issues.push({
          level: 'error',
          source: role,
          message: `Panel requires missing profile: ${profileId}`,
          action: 'Import profile',
        });
      } else if (mappedProfileId && mappedProfileId !== profileId) {
        issues.push({
          level: 'warning',
          source: role,
          message: `Panel was authored for ${profileId}, current role uses ${mappedProfileId}.`,
          action: 'Select profile',
        });
      }
    }

    for (const control of panel.controls ?? []) {
      const controlId = control?._children?.Core?.id ?? 'control';
      const controlName = control?._children?.Core?.name || controlId;
      const bindings = control?._children?.DeviceBindings?.bindings;
      if (!Array.isArray(bindings)) continue;

      for (const binding of bindings) {
        if (binding?.kind !== 'deviceParameter') continue;

        const role = String(binding.deviceRole ?? 'mainSynth');
        const parameterId = String(binding.parameterId ?? '');
        const mappedProfileId = String($deviceRoleMappings?.[role]?.profileId ?? selectedProfileId);

        if (!parameterId) {
          issues.push({
            level: 'error',
            source: controlName,
            message: 'Device binding has no parameter id.',
            action: 'Rebind',
          });
          continue;
        }

        if (!loadedProfileIds.has(mappedProfileId)) {
          issues.push({
            level: 'error',
            source: controlName,
            message: `Binding ${parameterId} uses missing profile ${mappedProfileId}.`,
            action: 'Import profile',
          });
          continue;
        }

        if (!parameterByRole.has(role)) {
          const roleParameters = $profileParameters?.[mappedProfileId] ?? [];
          parameterByRole.set(role, new Map(roleParameters.map((parameter) => [parameter.id, parameter])));
        }

        const parameter = parameterByRole.get(role)?.get(parameterId);
        if (!parameter) {
          issues.push({
            level: 'error',
            source: controlName,
            message: `Binding references missing parameter: ${parameterId}`,
            action: 'Rebind',
          });
          continue;
        }

        if (binding.parameterType && binding.parameterType !== parameter.type) {
          issues.push({
            level: 'warning',
            source: controlName,
            message: `${parameterId} changed type from ${binding.parameterType} to ${parameter.type}.`,
            action: 'Review',
          });
        }

        const compatibility = getBindingCompatibility(control, parameter);
        if (compatibility.status === 'incompatible') {
          issues.push({
            level: 'error',
            source: controlName,
            message: `${controlName} is not compatible with ${parameterId}.`,
            action: 'Rebind',
          });
        } else if (compatibility.status === 'warning') {
          issues.push({
            level: 'warning',
            source: controlName,
            message: compatibility.warning || `${parameterId} has a compatibility warning.`,
            action: 'Review',
          });
        }

        if (parameter?.access?.canWrite === false) {
          issues.push({
            level: 'error',
            source: controlName,
            message: `${parameterId} is read-only and cannot be controlled from this component.`,
            action: 'Rebind',
          });
        }

        if (binding.port === 'value' && parameter?.access?.realtimeSafe === false) {
          issues.push({
            level: 'warning',
            source: controlName,
            message: `${parameterId} is not marked realtime-safe for continuous control.`,
            action: 'Use commit',
          });
        }

        if (binding.port === 'value' && parameter?.sendPolicy?.mode && parameter.sendPolicy.mode !== 'continuous') {
          issues.push({
            level: 'warning',
            source: controlName,
            message: `${parameterId} send policy is ${parameter.sendPolicy.mode}, but the component sends continuous values.`,
            action: 'Use matching control',
          });
        }

        if (binding.port !== 'value' && parameter?.sendPolicy?.mode === 'continuous') {
          issues.push({
            level: 'info',
            source: controlName,
            message: `${parameterId} supports continuous sending, but this binding sends on commit.`,
            action: '',
          });
        }
      }
    }

    const mappedRoles = Object.values($deviceRoleMappings ?? {});
    const destinationKeys = new Map();
    for (const mapping of mappedRoles) {
      const destination = mapping?.midiDestination;
      if (!destination || destination.type !== 'hardwareOutput') continue;

      const key = `${destination.type}:${destination.id || destination.name || ''}`;
      const existing = destinationKeys.get(key);
      if (existing && existing !== mapping.role) {
        issues.push({
          level: 'warning',
          source: mapping.role,
          message: `${mapping.role} and ${existing} share MIDI destination ${destination.name || destination.id}.`,
          action: 'Review routing',
        });
      } else {
        destinationKeys.set(key, mapping.role);
      }
    }

    return issues;
  }

  function findDestination(destinationId) {
    return get(midiDestinations).find((destination) => destination.id === destinationId)
      ?? { type: 'previewOnly', id: 'previewOnly', name: 'Preview Only' };
  }

  function bindParameter(parameter) {
    if (parameter?.snapshotOnly) return;

    const control = get(selectedControl);
    const core = control?._children?.Core;
    if (!core?.id) return;

    const compatibility = getBindingCompatibility(control, parameter);
    if (compatibility.status === 'incompatible' || !compatibility.port) return;

    const existing = control?._children?.DeviceBindings?.bindings;
    const nextBindings = Array.isArray(existing) ? [...existing] : [];
    const bindingIndex = nextBindings.findIndex((binding) => binding.port === compatibility.port.id);
    const nextBinding = {
      kind: 'deviceParameter',
      port: compatibility.port.id,
      deviceRole: 'mainSynth',
      parameterId: parameter.id,
      parameterType: parameter.type,
      adoptMetadata: true,
      dryRun: true,
      feedback: {
        receiveUpdates: true,
        ignoreOwnEchoes: true,
        echoWindowMs: 250,
      },
    };

    if (bindingIndex >= 0) nextBindings[bindingIndex] = nextBinding;
    else nextBindings.push(nextBinding);

    if (control?._children?.DeviceBindings) {
      updateControlProperty(core.id, 'DeviceBindings.bindings', nextBindings);
    } else {
      updateControlProperty(core.id, 'DeviceBindings', {
        _type: 'DeviceBindings',
        enabled: true,
        debug: false,
        bindings: nextBindings,
      });
    }
    adoptParameterMetadata(core.id, core.controlType, parameter);
    persistPanelDeviceReference(parameter);
  }

  function persistPanelDeviceReference(parameter) {
    const panel = get(activePanel);
    if (!panel?.id || !parameter?.id) return;

    const requiredProfiles = Array.isArray(panel.requiredProfiles) ? [...panel.requiredProfiles] : [];
    const existingIndex = requiredProfiles.findIndex((entry) => entry?.role === 'mainSynth');
    const requiredProfile = {
      role: 'mainSynth',
      profileId: selectedProfileId,
      version: '*',
    };

    if (existingIndex >= 0) requiredProfiles[existingIndex] = requiredProfile;
    else requiredProfiles.push(requiredProfile);

    const snapshotKey = `mainSynth.${parameter.id}`;
    const parameterSnapshots = {
      ...(panel.parameterSnapshots ?? {}),
      [snapshotKey]: {
        id: parameter.id,
        name: parameter.name ?? parameter.id,
        type: parameter.type ?? '',
        group: parameter.group ?? '',
        range: parameter.range ?? null,
        choices: Array.isArray(parameter.choices)
          ? parameter.choices.map((choice) => ({
            id: choice.id,
            label: choice.label,
            value: choice.value,
          }))
          : undefined,
        display: parameter.display ?? null,
      },
    };

    updatePanel(panel.id, {
      requiredProfiles,
      parameterSnapshots,
    });
  }

  function adoptParameterMetadata(controlId, controlType, parameter) {
    const shortLabel = parameter?.display?.shortLabel || parameter?.name || parameter?.id;
    if (shortLabel && ['Button', 'MomentaryButton', 'TimedButton', 'OneShotButton', 'ToggleButton', 'RadioButtonGroup', 'CyclicButton', 'Combobox', 'Label'].includes(controlType)) {
      updateControlProperty(controlId, 'Text.content', shortLabel);
    }

    if (parameter?.type === 'integer' || parameter?.type === 'float' || parameter?.type === 'bipolar') {
      const min = Number(parameter?.range?.min ?? 0);
      const max = Number(parameter?.range?.max ?? 127);
      const value = Number(parameter?.default ?? min);
      updateControlProperty(controlId, 'Behavior.min', min);
      updateControlProperty(controlId, 'Behavior.max', max);
      updateControlProperty(controlId, 'Behavior.defaultCurrentValue', value);
      updateControlProperty(controlId, 'Behavior.valueType', parameter.type === 'float' ? 'float' : 'int');
    }

    if (parameter?.type === 'choice' && Array.isArray(parameter?.choices)) {
      updateControlProperty(controlId, 'Value.rows', parameter.choices.map((choice, index) => ({
        id: choice.id ?? `choice_${index + 1}`,
        displayText: choice.label ?? choice.id ?? String(choice.value ?? index),
        internalValue: choice.id ?? String(choice.value ?? index),
        sendValue: choice.value ?? index,
        receiveValue: choice.value ?? index,
        selectedByDefault: (choice.id ?? String(choice.value)) === parameter.default,
        enabled: true,
        visualOverrides: {},
      })));
      updateControlProperty(controlId, 'Behavior.valueType', 'enum');
      updateControlProperty(controlId, 'Behavior.defaultValue', parameter.default ?? parameter.choices[0]?.id ?? '');
    }

    if (parameter?.type === 'boolean') {
      updateControlProperty(controlId, 'Behavior.family', 'select');
      updateControlProperty(controlId, 'Behavior.role', 'toggle');
      updateControlProperty(controlId, 'Behavior.valueType', 'bool');
      updateControlProperty(controlId, 'Behavior.defaultValue', parameter.default === true);
      updateControlProperty(controlId, 'Behavior.allowMixed', false);
    }

    if (parameter?.type === 'action' || parameter?.type === 'momentary') {
      updateControlProperty(controlId, 'Behavior.family', 'trigger');
      updateControlProperty(controlId, 'Behavior.role', 'button');
      updateControlProperty(controlId, 'Behavior.valueType', 'none');
      if (controlType === 'TimedButton') {
        updateControlProperty(controlId, 'Behavior.buttonType', 'timed');
        updateControlProperty(controlId, 'Behavior.subtype', 'hold_to_confirm');
      } else if (controlType === 'OneShotButton') {
        updateControlProperty(controlId, 'Behavior.buttonType', 'one_shot');
        updateControlProperty(controlId, 'Behavior.subtype', 'single_use');
      } else {
        updateControlProperty(controlId, 'Behavior.buttonType', parameter.type === 'momentary' ? 'momentary' : 'one_shot');
        updateControlProperty(controlId, 'Behavior.subtype', parameter.type === 'momentary' ? 'momentary' : 'action');
      }
    }
  }
</script>

<div class="parameter-browser">
  <div class="toolbar">
    <select value={selectedProfileId} onchange={(e) => handleProfileChange(e.target.value)}>
      {#each $deviceProfiles as profile}
        <option value={profile.id}>{profile.name || profile.id}</option>
      {/each}
    </select>
    <select value={selectedDestinationId} onchange={(e) => handleDestinationChange(e.target.value)}>
      {#each $midiDestinations as destination}
        <option value={destination.id}>{destination.name || destination.id}</option>
      {/each}
    </select>
    <input value={query} placeholder="Search parameters" oninput={(e) => query = e.target.value} />
    <button onclick={handleOpenDesigner}>Designer</button>
    <button onclick={handleRunTests}>Run Tests</button>
    <button onclick={() => refreshDeviceProfiles()}>Refresh</button>
    <button onclick={() => importDeviceProfile()}>Import</button>
  </div>

  <div class="target">
    Target: {selectedControlType || 'select a component'} / {$deviceRoleMappings.mainSynth?.midiDestination?.name || 'Preview Only'}
  </div>

  <div class={['profile-link', profileLinkStatus.level]}>
    <div class="profile-link-main">
      <span class="profile-link-label">{profileLinkStatus.label}</span>
      <span class="profile-link-message">{profileLinkStatus.message}</span>
    </div>
    <div class="profile-link-meta">
      <span>{parameterSourceLabel}</span>
      {#if panelRequiredProfileId && panelRequiredProfileId !== selectedProfileId && panelRequiredProfileLoaded}
        <button onclick={usePanelRequiredProfile}>Use Required</button>
      {/if}
      {#if selectedProfileId && panelRequiredProfileId !== selectedProfileId}
        <button onclick={adoptCurrentProfileForPanel}>Adopt Current</button>
      {/if}
      {#if panelRequiredProfileId && !panelRequiredProfileLoaded}
        <button onclick={() => importDeviceProfile()}>Import</button>
      {/if}
    </div>
  </div>

  <div class="profile-inspector">
    <button class="profile-inspector-toggle" onclick={() => showProfileInspector = !showProfileInspector}>
      {showProfileInspector ? 'Hide Summary' : 'Profile Summary'}
    </button>
    <span>Params {profileStats.total}</span>
    <span>Groups {profileStats.groups}</span>
    <span>Write {profileStats.writable}</span>
    <span>Read-only {profileStats.readOnly}</span>
    <span>Realtime warnings {profileStats.realtimeUnsafe}</span>
    <span>Tests {profileStats.testLabel}</span>
  </div>

  {#if showProfileInspector}
    <div class="profile-inspector-detail">
      <div class="profile-inspector-cell">
        <span>Profile</span>
        <strong title={selectedProfile?.filePath || selectedProfileId}>{selectedProfileName}</strong>
      </div>
      <div class="profile-inspector-cell">
        <span>Types</span>
        <strong>{profileStats.typeSummary}</strong>
      </div>
      <div class="profile-inspector-cell">
        <span>Send</span>
        <strong>continuous {profileStats.continuous} / commit {profileStats.onCommit} / action {profileStats.explicitAction}</strong>
      </div>
      <div class="profile-inspector-cell">
        <span>Source</span>
        <strong>{parameterSourceLabel}{profileStats.snapshotOnly ? ` / snapshots ${profileStats.snapshotOnly}` : ''}</strong>
      </div>
    </div>
    <div class="profile-quality">
      <div class="profile-quality-header">
        <span>Quality Gate</span>
        <strong class={profileQualitySummary.level}>{profileQualitySummary.label}</strong>
      </div>
      <div class="profile-quality-grid">
        {#each profileQualityChecks as check}
          <div class={['profile-quality-row', check.level]} title={check.message}>
            <span>{check.level}</span>
            <strong>{check.label}</strong>
            <span>{check.message}</span>
          </div>
        {/each}
      </div>
    </div>
    <div class="profile-author">
      <div class="profile-quality-header">
        <span>Author Scaffold</span>
        <strong>read-only preview</strong>
      </div>
      <div class="profile-author-grid">
        {#each authorMilestones as milestone}
          <div class={['profile-author-row', milestone.status]} title={milestone.detail}>
            <span>{milestone.status}</span>
            <strong>{milestone.label}</strong>
            <span>{milestone.detail}</span>
          </div>
        {/each}
      </div>
    </div>
  {/if}

  <div class="list">
    {#each filteredParameters as parameter}
      {@const compatibility = getBindingCompatibility($selectedControl, parameter)}
      <button
        class={['parameter-row', compatibility.status, parameter.snapshotOnly ? 'snapshot' : '']}
        disabled={parameter.snapshotOnly || !selectedControlType || compatibility.status === 'incompatible'}
        onclick={() => bindParameter(parameter)}
        title={parameter.snapshotOnly ? 'Snapshot only: load the required profile before binding or sending.' : compatibility.warning}
      >
        <span class="name">{parameter.name || parameter.id}</span>
        <span class="meta">{parameter.group || 'Ungrouped'} / {parameter.type}</span>
        <span class="status">{parameter.snapshotOnly ? 'snapshot' : compatibility.status}</span>
      </button>
    {/each}
  </div>

  <div class="diagnostics">
    <div class="diagnostic-panel">
      <div class="diagnostic-title">Preview</div>
      <div class="hex">{$latestMidiPreview?.transaction?.hex || 'No transaction yet'}</div>
      {#if $latestMidiPreview?.transaction?.policy}
        <div class="policy">
          {$latestMidiPreview.transaction.policy.mode}
          / {$latestMidiPreview.transaction.policy.coalesce ? 'coalesce' : 'no coalesce'}
          / {$latestMidiPreview.transaction.policy.minIntervalMs ?? 0} ms
        </div>
      {/if}
      {#if $latestMidiPreview?.error}
        <div class="error">{$latestMidiPreview.error}</div>
      {/if}
      {#if $latestProfileImport?.ok === false}
        <div class="error">{$latestProfileImport.error}</div>
      {:else if $latestProfileImport?.ok === true}
        <div class="policy">Imported {$latestProfileImport.name || $latestProfileImport.id}</div>
      {/if}
    </div>
    <div class="diagnostic-panel">
      <div class="diagnostic-header">
        <div class="diagnostic-title">Tests</div>
        <button class="diagnostic-action" onclick={handleRunTests}>Run Tests</button>
      </div>
      <div class="test-profile" title={selectedProfileName}>{selectedProfileName}</div>
      <div class="hex">
        {#if selectedProfileTestResult?.running}
          Running...
        {:else if selectedProfileTestResult}
          {selectedProfileTestResult.passed ?? 0}/{selectedProfileTestResult.total ?? 0} passed
        {:else}
          Not run
        {/if}
      </div>
    </div>
    <div class="diagnostic-panel monitor">
      <div class="diagnostic-header">
        <div class="diagnostic-title">Monitor</div>
        <div class="diagnostic-actions">
          {#if ($midiMonitorEvents ?? []).length > 4}
            <button class="diagnostic-action" onclick={() => showAllMonitorEvents = !showAllMonitorEvents}>
              {showAllMonitorEvents ? 'Less' : '20'}
            </button>
          {/if}
          <button class="diagnostic-action" onclick={clearMonitorView}>Clear</button>
        </div>
      </div>
      {#each visibleMonitorEvents as event}
        <div class="monitor-row" title={monitorEventTitle(event)}>
          <span>{event.direction}</span>
          <span>{event.semantic}</span>
          <span class="monitor-hex">{event.hex || ''}</span>
          <span>{event.status}</span>
        </div>
      {:else}
        <div class="hex">No MIDI events</div>
      {/each}
    </div>
    <div class="diagnostic-panel issues">
      <div class="diagnostic-header">
        <div class="diagnostic-title">Issues</div>
        {#if combinedDeviceIssues.length > 4}
          <button class="diagnostic-action" onclick={() => showAllIssues = !showAllIssues}>
            {showAllIssues ? 'Less' : `${combinedDeviceIssues.length} total`}
          </button>
        {/if}
      </div>
      {#each visibleDeviceIssues as issue}
        <div class={['issue-row', issue.level]} title={issueTitle(issue)}>
          <span>{issue.level}</span>
          <span>{issue.source || 'device'}</span>
          <span>{issue.message}</span>
          <span>{issueAction(issue)}</span>
        </div>
      {:else}
        <div class="hex">No device issues</div>
      {/each}
    </div>
  </div>

  <div class="monitor-detail-bar" title={latestMonitorDetail}>
    <span class="detail-label">Monitor</span>
    <span class="detail-text">{latestMonitorDetail}</span>
    <button class="detail-copy" disabled={!latestMonitorEvent} onclick={copyMonitorDetail}>
      {monitorCopyStatus || 'Copy'}
    </button>
  </div>
</div>

<style>
  .parameter-browser {
    height: 100%;
    display: flex;
    flex-direction: column;
    background: #1E1E1E;
    color: #DDD;
    font-size: 11px;
  }

  .toolbar {
    display: grid;
    grid-template-columns: minmax(120px, 0.9fr) minmax(120px, 0.9fr) minmax(100px, 1fr) 76px 82px 68px 64px;
    gap: 6px;
    padding: 8px;
    border-bottom: 1px solid #333;
  }

  select,
  input,
  button {
    min-width: 0;
    background: #252525;
    border: 1px solid #3A3A3A;
    border-radius: 3px;
    color: #DDD;
    font: inherit;
    padding: 4px 6px;
  }

  .target {
    padding: 6px 8px;
    color: #999;
    border-bottom: 1px solid #2B2B2B;
  }

  .profile-link {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 8px;
    align-items: center;
    padding: 6px 8px;
    border-bottom: 1px solid #2B2B2B;
    background: #1B1B1B;
  }

  .profile-link.ok {
    border-left: 3px solid #5A9C6E;
  }

  .profile-link.info {
    border-left: 3px solid #8FAAD5;
  }

  .profile-link.warning {
    border-left: 3px solid #D5B45B;
  }

  .profile-link.error {
    border-left: 3px solid #D56B6B;
  }

  .profile-link-main,
  .profile-link-meta {
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .profile-link-main {
    overflow: hidden;
  }

  .profile-link-meta {
    justify-content: flex-end;
    color: #888;
    white-space: nowrap;
  }

  .profile-link-label {
    flex: 0 0 auto;
    color: #DDD;
    font-weight: 600;
  }

  .profile-link-message {
    min-width: 0;
    color: #AAA;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .profile-link button {
    padding: 2px 6px;
    border-color: #4A4A4A;
    font-size: 10px;
    line-height: 1.2;
  }

  .profile-inspector {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 5px 8px;
    border-bottom: 1px solid #2B2B2B;
    background: #191919;
    color: #999;
    overflow: hidden;
    white-space: nowrap;
  }

  .profile-inspector span {
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .profile-inspector-toggle {
    flex: 0 0 auto;
    padding: 2px 6px;
    border-color: #4A4A4A;
    color: #DDD;
    font-size: 10px;
    line-height: 1.2;
  }

  .profile-inspector-detail {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 6px;
    padding: 6px 8px;
    border-bottom: 1px solid #2B2B2B;
    background: #171717;
  }

  .profile-inspector-cell {
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .profile-inspector-detail span {
    color: #777;
    text-transform: uppercase;
    font-size: 10px;
  }

  .profile-inspector-detail strong {
    color: #CCC;
    font-weight: 500;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .profile-quality,
  .profile-author {
    padding: 6px 8px;
    border-bottom: 1px solid #2B2B2B;
    background: #181818;
  }

  .profile-author {
    background: #171717;
  }

  .profile-quality-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    margin-bottom: 5px;
    color: #777;
    text-transform: uppercase;
    font-size: 10px;
  }

  .profile-quality-header strong {
    color: #CCC;
    font-weight: 600;
    text-transform: none;
  }

  .profile-quality-header strong.ok {
    color: #7CC18D;
  }

  .profile-quality-header strong.info {
    color: #8FAAD5;
  }

  .profile-quality-header strong.warning {
    color: #D5B45B;
  }

  .profile-quality-header strong.error {
    color: #D56B6B;
  }

  .profile-quality-grid,
  .profile-author-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 4px 8px;
  }

  .profile-quality-row,
  .profile-author-row {
    min-width: 0;
    display: grid;
    grid-template-columns: 54px minmax(86px, 0.5fr) minmax(120px, 1fr);
    gap: 5px;
    align-items: center;
    color: #AAA;
    font-family: Consolas, monospace;
  }

  .profile-quality-row span,
  .profile-quality-row strong,
  .profile-author-row span,
  .profile-author-row strong {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .profile-quality-row strong,
  .profile-author-row strong {
    color: #CCC;
    font-weight: 500;
  }

  .profile-quality-row.ok,
  .profile-author-row.done {
    color: #7CC18D;
  }

  .profile-quality-row.info,
  .profile-author-row.info {
    color: #8FAAD5;
  }

  .profile-quality-row.warning,
  .profile-author-row.warning {
    color: #D5B45B;
  }

  .profile-quality-row.error,
  .profile-author-row.error {
    color: #D56B6B;
  }

  .list {
    overflow: auto;
    padding: 4px;
    min-height: 0;
    flex: 1;
  }

  .parameter-row {
    width: 100%;
    display: grid;
    grid-template-columns: minmax(120px, 1fr) minmax(120px, 0.8fr) 92px;
    gap: 8px;
    align-items: center;
    text-align: left;
    margin-bottom: 3px;
    cursor: pointer;
  }

  .parameter-row:hover:not(:disabled) {
    border-color: #5B9BD5;
  }

  .parameter-row:disabled {
    opacity: 0.45;
    cursor: default;
  }

  .name {
    color: #EEE;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .meta {
    color: #999;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .status {
    color: #888;
    text-align: right;
  }

  .parameter-row.warning .status {
    color: #D5B45B;
  }

  .parameter-row.snapshot .status {
    color: #9CA3AF;
  }

  .diagnostics {
    display: grid;
    grid-template-columns: minmax(140px, 1fr) 150px minmax(190px, 1.4fr) minmax(190px, 1.4fr);
    gap: 6px;
    padding: 6px 8px 4px;
    border-top: 1px solid #333;
    background: #1A1A1A;
  }

  .monitor-detail-bar {
    display: grid;
    grid-template-columns: 58px minmax(0, 1fr) 58px;
    gap: 8px;
    align-items: center;
    padding: 4px 8px 6px;
    border-top: 1px solid #2B2B2B;
    background: #181818;
    font-family: Consolas, monospace;
    font-size: 11px;
    min-height: 22px;
  }

  .detail-label {
    color: #888;
    text-transform: uppercase;
    font-family: inherit;
    font-size: 10px;
  }

  .detail-text {
    color: #D8D8D8;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .detail-copy {
    padding: 2px 6px;
    border-color: #4A4A4A;
    font-size: 10px;
    line-height: 1.2;
  }

  .detail-copy:disabled {
    opacity: 0.45;
  }

  .diagnostic-panel {
    min-width: 0;
    border: 1px solid #303030;
    border-radius: 3px;
    padding: 5px 6px;
    background: #202020;
  }

  .diagnostic-title {
    color: #888;
    font-size: 10px;
    text-transform: uppercase;
  }

  .diagnostic-panel > .diagnostic-title {
    margin-bottom: 3px;
  }

  .diagnostic-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 6px;
    margin-bottom: 3px;
  }

  .diagnostic-action {
    flex: 0 0 auto;
    padding: 2px 6px;
    border-color: #4A4A4A;
    font-size: 10px;
    line-height: 1.2;
  }

  .diagnostic-action:hover {
    border-color: #5B9BD5;
  }

  .diagnostic-actions {
    display: flex;
    gap: 4px;
    align-items: center;
  }

  .test-profile {
    color: #888;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    margin-bottom: 2px;
  }

  .hex,
  .error,
  .policy,
  .monitor-row {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .hex {
    color: #CCC;
    font-family: Consolas, monospace;
  }

  .error {
    color: #D56B6B;
    margin-top: 3px;
  }

  .policy {
    color: #888;
    margin-top: 3px;
  }

  .monitor-row,
  .issue-row {
    display: grid;
    grid-template-columns: 54px minmax(120px, 1fr) minmax(90px, 0.7fr) minmax(92px, 0.55fr);
    gap: 5px;
    color: #AAA;
    font-family: Consolas, monospace;
    margin-top: 2px;
  }

  .monitor-row span,
  .issue-row span {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .monitor-hex {
    color: #D8D8D8;
  }

  .issue-row {
    grid-template-columns: 54px minmax(70px, 0.6fr) minmax(100px, 1fr) minmax(84px, 0.5fr);
  }

  .issue-row.error {
    color: #D56B6B;
  }

  .issue-row.warning {
    color: #D5B45B;
  }

  .issue-row.info {
    color: #8FAAD5;
  }
</style>
