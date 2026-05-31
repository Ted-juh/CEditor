<script>
  import { SCRIPT_TARGETS, commandDescriptor, commandsByCategory, portabilityForScript } from '../scripting/scriptCommandRegistry.js';
  import { emitScript, exportWarningsForScript } from '../scripting/scriptEmitters.js';
  import { createDebugSession } from '../scripting/scriptDebugger.js';
  import { compilePanelScripts, compileScriptWorkspace } from '../scripting/scriptPanelExport.js';
  import { validateScriptForProject } from '../scripting/scriptProjectValidation.js';
  import { createScriptContext, executeScript, validateScript } from '../scripting/scriptRuntime.js';
  import {
    deviceProfiles,
    createDeviceProfileDraft,
    importDeviceProfile,
    latestDumpParseResult,
    latestMidiPreview,
    latestProfileTestResult,
    midiMonitorEvents,
    previewParameterMessage,
    profileParameters,
    refreshDeviceProfiles,
    runTestsForProfile,
    selectedDeviceProfileId,
  } from '../stores/deviceProfiles.js';
  import { activePanel, openStandaloneDeviceProfileTab, updatePanel } from '../stores/panels.js';
  import { selectedControl, updateControlProperty } from '../stores/controls.js';
  import { activeComponentControl } from '../stores/componentWorkspace.js';
  import {
    addScriptStep,
    addScriptToDocument,
    duplicateScriptInDocument,
    moveScriptStep,
    openScriptWorkspaceFromFile,
    removeScriptStep,
    removeScriptFromDocument,
    saveActiveScriptWorkspace,
    saveActiveScriptWorkspaceAs,
    scriptDocuments,
    updateScriptDocument,
    updateScriptInDocument,
    updateScriptStep,
  } from '../stores/scriptWorkspace.js';

  let { documentId = '' } = $props();

  const modes = [
    { id: 'workspace', label: 'Workspace', title: '1. Dedicated Script Workspace', detail: 'Project-wide script navigation, command editing, validation, trace, and export review' },
    { id: 'embedded', label: 'Embedded', title: '2. Embedded Scripts Tab', detail: 'Scripts live beside Design, Parameters, Groups, States, and Preview inside the editor shell' },
    { id: 'inspector', label: 'Inspector', title: '3. Right Inspector Scripts Drawer', detail: 'Selecting a control exposes script events directly inside the familiar right-side inspector' },
    { id: 'command', label: 'Command Builder', title: '4. Command Builder', detail: 'Primary authoring mode: event, condition, ordered actions, command library, and CE Script preview' },
    { id: 'flow', label: 'Flow Canvas', title: '5. Visual Event-Flow Canvas', detail: 'Node view of the same command graph: event nodes, math nodes, action nodes, trace' },
    { id: 'routing', label: 'Routing', title: '6. Scope Matrix / Routing Board', detail: 'Panel-level behavior as a readable table: source event, condition, actions, row details, trace' },
    { id: 'device', label: 'Device', title: '7. Device Scripting Workbench', detail: 'Specialized device script surface for MIDI, SysEx, NRPN, checksums, parsers, and tests' },
    { id: 'preview', label: 'Preview Debugger', title: '8. Preview-First Debugger Layout', detail: 'Live preview plus event injector, trace, selected command step, patches, MIDI out, and generated code view' },
    { id: 'export', label: 'Export Review', title: '9. Advanced Export / Source Review', detail: 'Review CE Script, JSON graph, JavaScript, TypeScript, Lua, C++, Python, C#, Swift, Go, Kotlin, Rust, HTML, and CSS projections' },
    { id: 'diehard', label: 'Diehard Coder', title: 'Scripting / Diehard Coder Mode', detail: 'Code-first workspace: CE Script, generated IR, runtime trace, tests, breakpoints, and export targets in one shell' },
  ];

  let mode = $state('diehard');
  let selectedScriptId = $state('macroRouting');
  let exportTarget = $state('javascript');
  let codeTarget = $state('ce');
  let eventValue = $state(0.72);
  let eventFireCount = $state(0);
  let selectedFlowNodeId = $state('event');
  let flowDrag = $state(null);
  let flowZoom = $state(1);
  let flowConnectionSourceId = $state('');
  let commandSearch = $state('');
  let wizardSource = $state('macroControl');
  let wizardEvent = $state('onValueChanged');
  let wizardTarget = $state('cutoff.value');
  let wizardToMin = $state(80);
  let wizardToMax = $state(12000);
  let wizardSendMidi = $state(true);
  let wizardMidiChannel = $state(1);
  let wizardMidiCc = $state(74);
  let watchInput = $state('event.value');
  let debuggerPausedStepId = $state('');
  let debuggerStepLimit = $state(0);
  let debuggerForcePaused = $state(false);

  let document = $derived($scriptDocuments.find((item) => item.id === documentId) ?? $scriptDocuments[0] ?? null);
  let scripts = $derived(document?.scripts ?? []);
  let selectedScript = $derived(scripts.find((script) => script.id === selectedScriptId) ?? scripts[0] ?? null);
  let context = $derived(createScriptContext({ event: { value: eventValue, phase: 'preview', target: selectedScript?.target ?? 'macroControl', name: selectedScript?.event ?? 'onValueChanged', fireCount: eventFireCount } }));
  let traceResult = $derived(selectedScript ? executeScript(selectedScript, context) : null);
  let debuggerSession = $derived(selectedScript ? createDebugSession(selectedScript, context, {
    resumePastStepId: debuggerPausedStepId,
    stepLimit: debuggerStepLimit > 0 ? debuggerStepLimit : Math.max(1, selectedScript.steps?.length ?? 1),
    selectedStepId: debuggerStepLimit > 0 ? selectedScript.steps?.[debuggerStepLimit - 1]?.id : '',
    forcePaused: debuggerForcePaused,
  }) : null);
  let validationIssues = $derived(selectedScript ? validateScriptForProject(selectedScript, { panel: $activePanel }) : []);
  let exportWarnings = $derived(selectedScript ? exportWarningsForScript(selectedScript) : []);
  let portability = $derived(selectedScript ? portabilityForScript(selectedScript) : null);
  let activeTarget = $derived(mode === 'export' ? exportTarget : mode === 'diehard' ? codeTarget : 'ce');
  let generatedCode = $derived(selectedScript ? emitScript(selectedScript, activeTarget) : '');
  let categories = $derived(commandsByCategory());
  let filteredCategories = $derived(filterCommandCategories(categories, commandSearch));
  let activeMode = $derived(modes.find((item) => item.id === mode) ?? modes[0]);
  let groupedScripts = $derived(groupScripts(scripts));
  let attachmentSummary = $derived(collectAttachments());
  let validationGroups = $derived(groupValidationIssues(validationIssues));
  let selectedDeviceProfile = $derived(($deviceProfiles ?? []).find((profile) => String(profile.id) === String($selectedDeviceProfileId)) ?? null);
  let selectedProfileParameters = $derived($profileParameters?.[$selectedDeviceProfileId] ?? []);
  let panelExportSummary = $derived($activePanel ? compilePanelScripts($activePanel, exportTarget) : null);
  let workspaceExportSummary = $derived(document ? compileScriptWorkspace(document) : null);
  let flowNodes = $derived(buildFlowNodes(selectedScript));
  let selectedFlowNode = $derived(flowNodes.find((node) => node.id === selectedFlowNodeId) ?? flowNodes[0] ?? null);
  let flowConnectionIssues = $derived(validateFlowConnections(selectedScript, flowNodes));

  $effect(() => {
    if (selectedScript || scripts.length === 0) return;
    selectedScriptId = document?.activeScriptId || scripts[0].id;
  });

  $effect(() => {
    if (document?.mode && document.mode !== mode) mode = document.mode;
  });

  function groupScripts(items) {
    const groups = [
      { scope: 'panel', label: 'Panel Scripts', scripts: [] },
      { scope: 'component', label: 'Component Scripts', scripts: [] },
      { scope: 'device', label: 'Device Scripts', scripts: [] },
      { scope: 'project', label: 'Project Scripts', scripts: [] },
    ];
    for (const script of items) {
      const group = groups.find((item) => item.scope === script.scope) ?? groups[0];
      group.scripts.push(script);
    }
    return groups;
  }

  function collectAttachments() {
    const panelScripts = ($activePanel?.scripts ?? []).map((script) => ({
      kind: 'panel',
      ownerId: $activePanel.id,
      ownerLabel: $activePanel.name ?? 'Active panel',
      script,
    }));
    const selected = $selectedControl ?? $activeComponentControl;
    const selectedId = selected?._children?.Core?.id;
    const selectedScripts = (selected?._children?.Scripts?.scripts ?? []).map((script) => ({
      kind: $selectedControl ? 'control' : 'component',
      ownerId: selectedId,
      ownerLabel: selected?._children?.Core?.name ?? selectedId ?? 'Selected component',
      script,
    }));
    const items = [...panelScripts, ...selectedScripts];
    const counts = new Map();
    for (const item of items) {
      const key = `${item.kind}:${item.ownerId}:${item.script.event}:${item.script.target}`;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return items.map((item) => {
      const key = `${item.kind}:${item.ownerId}:${item.script.event}:${item.script.target}`;
      return {
        ...item,
        key,
        conflict: (counts.get(key) ?? 0) > 1,
      };
    });
  }

  function filterCommandCategories(items, query) {
    const needle = String(query ?? '').trim().toLowerCase();
    if (!needle) return items;
    return items
      .map((category) => ({
        ...category,
        commands: category.commands.filter((command) =>
          `${command.label} ${command.category} ${command.description}`.toLowerCase().includes(needle)
        ),
      }))
      .filter((category) => category.commands.length);
  }

  function groupValidationIssues(issues = []) {
    const buckets = [
      { id: 'blocking', label: 'Blocking Errors', match: (issue) => issue.level === 'error' },
      { id: 'routing', label: 'Routing / Targets', match: (issue) => ['dead-target', 'duplicate-route', 'circular-route'].includes(issue.code) },
      { id: 'device', label: 'MIDI / Device', match: (issue) => String(issue.code ?? '').includes('midi') || String(issue.code ?? '').includes('sysex') || String(issue.code ?? '').includes('device') },
      { id: 'sandbox', label: 'Sandbox / Raw Code', match: (issue) => String(issue.code ?? '').includes('raw') },
      { id: 'other', label: 'Other Warnings', match: () => true },
    ];
    const used = new Set();
    return buckets.map((bucket) => {
      const bucketIssues = issues.filter((issue, index) => !used.has(index) && bucket.match(issue));
      issues.forEach((issue, index) => {
        if (!used.has(index) && bucketIssues.includes(issue)) used.add(index);
      });
      return { ...bucket, issues: bucketIssues };
    }).filter((bucket) => bucket.issues.length);
  }

  function commandExample(command) {
    if (command.id === 'setValue') return 'Example: set cutoff.value from event.value';
    if (command.id === 'routeValue') return 'Example: route macro.value to resonance.value';
    if (command.id === 'sendCC') return 'Example: send channel 1, CC 74 on commit';
    if (command.id === 'sendNRPN') return 'Example: send a 14-bit synth parameter';
    if (command.id === 'buildSysex') return 'Example: F0 41 ... checksum ... F7';
    if (command.id === 'setAnimation') return 'Example: start hoverScroll while hovered';
    if (command.id === 'emitEvent') return 'Example: trigger another script route';
    return command.scopes?.length ? `Scopes: ${command.scopes.join(', ')}` : 'Portable command graph step';
  }

  function buildFlowNodes(script) {
    if (!script) return [];
    const positions = script.graph?.positions ?? {};
    const nodes = [
      {
        id: 'event',
        tone: 'event',
        title: script.event ?? 'event',
        subtitle: script.target ?? '*',
        x: positions.event?.x ?? 360,
        y: positions.event?.y ?? 90,
      },
    ];
    (script.steps ?? []).forEach((step, index) => {
      nodes.push({
        id: step.id,
        tone: actionTone(step.command),
        title: step.command,
        subtitle: ceStepLabel(step),
        x: positions[step.id]?.x ?? (220 + (index % 3) * 220),
        y: positions[step.id]?.y ?? (220 + Math.floor(index / 3) * 145),
        step,
      });
    });
    return nodes;
  }

  function flowNodeStyle(node) {
    return `left:${node.x}px;top:${node.y}px;`;
  }

  function flowLines(nodes) {
    return normalizedFlowConnections(selectedScript, nodes).map((connection) => {
      const from = nodes.find((node) => node.id === connection.from);
      const node = nodes.find((item) => item.id === connection.to);
      if (!from || !node) return null;
      return {
        id: connection.id,
        from: from.id,
        to: node.id,
        auto: connection.auto === true,
        x1: from.x + 84,
        y1: from.y + 58,
        x2: node.x + 84,
        y2: node.y,
      };
    }).filter(Boolean);
  }

  function normalizedFlowConnections(script, nodes) {
    const ids = new Set(nodes.map((node) => node.id));
    const stored = (script?.graph?.connections ?? [])
      .filter((connection) => ids.has(connection.from) && ids.has(connection.to) && connection.from !== connection.to);
    if (stored.length) return stored;
    return nodes.slice(1).map((node, index) => ({
      id: `auto:${index}:${node.id}`,
      from: index === 0 ? nodes[0]?.id : nodes[index]?.id,
      to: node.id,
      auto: true,
    })).filter((connection) => connection.from && connection.to);
  }

  function setFlowConnections(connections) {
    updateSelectedScript({ graph: { ...(selectedScript?.graph ?? {}), connections } });
  }

  function startFlowConnection(nodeId) {
    flowConnectionSourceId = nodeId;
  }

  function connectFlowTo(nodeId) {
    const from = String(flowConnectionSourceId || selectedFlowNodeId || '');
    const to = String(nodeId || selectedFlowNodeId || '');
    if (!from || !to || from === to) return;
    const connections = normalizedFlowConnections(selectedScript, flowNodes).filter((connection) => connection.auto !== true);
    if (!connections.some((connection) => connection.from === from && connection.to === to)) {
      connections.push({ id: `wire_${Date.now().toString(36)}`, from, to });
      setFlowConnections(connections);
    }
    flowConnectionSourceId = '';
  }

  function removeFlowConnection(connectionId) {
    const connections = normalizedFlowConnections(selectedScript, flowNodes)
      .filter((connection) => connection.auto !== true && connection.id !== connectionId);
    setFlowConnections(connections);
  }

  function autoWireFlow() {
    const connections = flowNodes.slice(1).map((node, index) => ({
      id: `wire_${Date.now().toString(36)}_${index}`,
      from: index === 0 ? 'event' : flowNodes[index]?.id,
      to: node.id,
    })).filter((connection) => connection.from && connection.to);
    setFlowConnections(connections);
  }

  function clearFlowConnections() {
    setFlowConnections([]);
    flowConnectionSourceId = '';
  }

  function validateFlowConnections(script, nodes) {
    if (!script || nodes.length === 0) return [];
    const ids = new Set(nodes.map((node) => node.id));
    const issues = [];
    const stored = script.graph?.connections ?? [];
    for (const connection of stored) {
      if (!ids.has(connection.from) || !ids.has(connection.to)) {
        issues.push(`Broken wire ${connection.from} -> ${connection.to}`);
      }
      if (connection.from === connection.to) issues.push(`Self-wire on ${connection.from}`);
    }
    const inbound = new Set(stored.map((connection) => connection.to));
    for (const step of script.steps ?? []) {
      if (stored.length && !inbound.has(step.id)) issues.push(`${step.command} has no incoming wire`);
    }
    return issues;
  }

  function updateFlowNodePosition(nodeId, x, y) {
    if (!document?.id || !selectedScript?.id) return;
    updateScriptInDocument(document.id, selectedScript.id, (script) => ({
      graph: {
        ...(script.graph ?? {}),
        zoom: flowZoom,
        positions: {
          ...(script.graph?.positions ?? {}),
          [nodeId]: { x: Math.round(Math.max(16, x)), y: Math.round(Math.max(16, y)) },
        },
      },
    }));
  }

  function startFlowDrag(event, node) {
    selectedFlowNodeId = node.id;
    flowDrag = {
      id: node.id,
      startX: event.clientX,
      startY: event.clientY,
      x: node.x,
      y: node.y,
    };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  }

  function moveFlowDrag(event) {
    if (!flowDrag) return;
    const scale = Math.max(0.2, flowZoom);
    updateFlowNodePosition(
      flowDrag.id,
      flowDrag.x + ((event.clientX - flowDrag.startX) / scale),
      flowDrag.y + ((event.clientY - flowDrag.startY) / scale)
    );
  }

  function endFlowDrag() {
    flowDrag = null;
  }

  function setFlowZoom(nextZoom) {
    flowZoom = Math.max(0.4, Math.min(1.6, Math.round(nextZoom * 100) / 100));
    updateSelectedScript({ graph: { ...(selectedScript?.graph ?? {}), zoom: flowZoom } });
  }

  function fitFlow() {
    flowZoom = 1;
    const positions = {};
    flowNodes.forEach((node, index) => {
      positions[node.id] = node.id === 'event'
        ? { x: 360, y: 80 }
        : { x: 170 + (index % 3) * 230, y: 230 + Math.floor(index / 3) * 140 };
    });
    updateSelectedScript({ graph: { ...(selectedScript?.graph ?? {}), zoom: 1, positions } });
  }

  function addNewScript(scope = 'panel') {
    if (!document?.id) return;
    const script = addScriptToDocument(document.id, {
      id: `script_${Date.now().toString(36)}`,
      name: scope === 'device' ? 'deviceScript' : scope === 'component' ? 'componentScript' : 'panelScript',
      scope,
      event: scope === 'device' ? 'onParameterCommitted' : 'onValueChanged',
      target: scope === 'device' ? 'cutoff' : '*',
      steps: [],
    });
    selectedScriptId = script.id;
  }

  function duplicateSelectedScript() {
    if (!document?.id || !selectedScript?.id) return;
    const copy = duplicateScriptInDocument(document.id, selectedScript.id);
    if (copy) selectedScriptId = copy.id;
  }

  function removeSelectedScript() {
    if (!document?.id || !selectedScript?.id) return;
    const currentId = selectedScript.id;
    removeScriptFromDocument(document.id, currentId);
    selectedScriptId = (scripts.find((script) => script.id !== currentId) ?? scripts[0])?.id ?? '';
  }

  function detachAttachment(item) {
    if (!item?.script?.id) return;
    if (item.kind === 'panel' && $activePanel?.id) {
      updatePanel($activePanel.id, {
        scripts: ($activePanel.scripts ?? []).filter((script) => script.id !== item.script.id),
      });
      return;
    }
    if ((item.kind === 'control' || item.kind === 'component') && item.ownerId) {
      const owner = $selectedControl ?? $activeComponentControl;
      const scripts = (owner?._children?.Scripts?.scripts ?? []).filter((script) => script.id !== item.script.id);
      updateControlProperty(item.ownerId, 'Scripts.scripts', scripts);
    }
  }

  function updateAttachment(item, updater) {
    if (!item?.script?.id) return;
    const updateScript = (script) => script.id === item.script.id
      ? { ...script, ...(typeof updater === 'function' ? updater(script) : updater) }
      : script;
    if (item.kind === 'panel' && $activePanel?.id) {
      updatePanel($activePanel.id, {
        scripts: ($activePanel.scripts ?? []).map(updateScript),
      });
      return;
    }
    if ((item.kind === 'control' || item.kind === 'component') && item.ownerId) {
      const owner = $selectedControl ?? $activeComponentControl;
      updateControlProperty(item.ownerId, 'Scripts.scripts', (owner?._children?.Scripts?.scripts ?? []).map(updateScript));
    }
  }

  function renameAttachment(item, name) {
    updateAttachment(item, { name: String(name ?? '').trim() || item.script.id });
  }

  function duplicateAttachment(item) {
    if (!item?.script?.id) return;
    const copy = {
      ...JSON.parse(JSON.stringify(item.script)),
      id: `${item.script.id}_copy_${Date.now().toString(36)}`,
      name: `${item.script.name ?? item.script.id} Copy`,
    };
    if (item.kind === 'panel' && $activePanel?.id) {
      updatePanel($activePanel.id, { scripts: [...($activePanel.scripts ?? []), copy] });
      return;
    }
    if ((item.kind === 'control' || item.kind === 'component') && item.ownerId) {
      const owner = $selectedControl ?? $activeComponentControl;
      updateControlProperty(item.ownerId, 'Scripts.scripts', [...(owner?._children?.Scripts?.scripts ?? []), copy]);
    }
  }

  function copyAttachmentToWorkspace(item) {
    if (!document?.id || !item?.script) return;
    const copy = addScriptToDocument(document.id, {
      ...JSON.parse(JSON.stringify(item.script)),
      id: `${item.script.id}_workspace_${Date.now().toString(36)}`,
      name: item.script.name ?? item.script.id,
    });
    selectedScriptId = copy.id;
  }

  function addCommandFromLibrary(command) {
    const step = addAction(command.id);
    if (step?.id) {
      const from = selectedFlowNodeId || 'event';
      const connections = normalizedFlowConnections(selectedScript, flowNodes)
        .filter((connection) => connection.auto !== true);
      connections.push({ id: `wire_${Date.now().toString(36)}`, from, to: step.id });
      updateSelectedScript({ graph: { ...(selectedScript.graph ?? {}), connections } });
      selectedFlowNodeId = step.id;
    }
  }

  function applyBeginnerRecipe() {
    if (!document?.id || !selectedScript?.id) return;
    const stamp = Date.now().toString(36);
    const steps = [
      {
        id: `recipe-value-${stamp}`,
        command: 'setValue',
        args: {
          target: wizardTarget,
          value: {
            op: 'scale',
            args: [{ ref: 'event.value' }, 0, 1, Number(wizardToMin), Number(wizardToMax)],
          },
        },
      },
    ];
    if (wizardSendMidi) {
      steps.push({
        id: `recipe-midi-${stamp}`,
        command: 'sendCC',
        args: {
          channel: Number(wizardMidiChannel) || 1,
          cc: Number(wizardMidiCc) || 0,
          value: { op: 'round', args: [{ op: '*', args: [{ ref: 'event.value' }, 127] }] },
          phase: 'commit',
        },
      });
    }
    updateSelectedScript({
      event: wizardEvent,
      target: wizardSource,
      runPolicy: 'During drag: Preview',
      commitPolicy: wizardSendMidi ? 'Send MIDI' : 'Preview only',
      steps,
      graph: {
        ...(selectedScript.graph ?? {}),
        connections: steps.map((step, index) => ({
          id: `recipe-wire-${stamp}-${index}`,
          from: index === 0 ? 'event' : steps[index - 1].id,
          to: step.id,
        })),
      },
    });
    selectedFlowNodeId = steps[0]?.id ?? 'event';
  }

  function addWatchPath(path = watchInput) {
    const nextPath = String(path ?? '').trim();
    if (!nextPath || !selectedScript?.id) return;
    const current = new Set((selectedScript.debug?.watchPaths ?? []).map(String));
    current.add(nextPath);
    updateSelectedScript({ debug: { ...(selectedScript.debug ?? {}), watchPaths: [...current] } });
    watchInput = '';
  }

  function removeWatchPath(path) {
    const current = new Set((selectedScript.debug?.watchPaths ?? []).map(String));
    current.delete(String(path));
    updateSelectedScript({ debug: { ...(selectedScript.debug ?? {}), watchPaths: [...current] } });
  }

  function setRawLanguage(language) {
    const value = String(language ?? '');
    updateSelectedScript({
      rawLanguage: value,
      rawPolicy: {
        ...(selectedScript?.rawPolicy ?? {}),
        portable: !value,
        allowInPreview: false,
        allowInExport: false,
      },
    });
  }

  function createScriptDeviceProfile() {
    const profile = createDeviceProfileDraft({ name: `${selectedScript?.name ?? 'Script'} Device Profile` });
    openStandaloneDeviceProfileTab(profile);
  }

  function openScriptDeviceProfile() {
    if (selectedDeviceProfile) openStandaloneDeviceProfileTab(selectedDeviceProfile);
    else createScriptDeviceProfile();
  }

  function toggleBreakpoint(stepId) {
    if (!document?.id || !selectedScript?.id) return;
    const current = new Set((selectedScript.debug?.breakpoints ?? []).map(String));
    if (current.has(stepId)) current.delete(stepId);
    else current.add(stepId);
    updateSelectedScript({ debug: { ...(selectedScript.debug ?? {}), breakpoints: [...current] } });
  }

  function stepDebugger() {
    const max = Math.max(1, selectedScript?.steps?.length ?? 1);
    debuggerStepLimit = Math.min(max, Math.max(0, debuggerStepLimit) + 1);
    debuggerForcePaused = debuggerStepLimit < max;
    debuggerPausedStepId = '';
  }

  function runDebugger() {
    debuggerStepLimit = 0;
    debuggerForcePaused = false;
    debuggerPausedStepId = '';
  }

  function pauseDebugger() {
    debuggerForcePaused = true;
    if (debuggerStepLimit <= 0) debuggerStepLimit = Math.max(1, debuggerSession?.frames?.length ?? 1);
  }

  function resumeDebugger() {
    debuggerForcePaused = false;
    debuggerPausedStepId = debuggerSession?.pausedAt ?? debuggerPausedStepId;
    debuggerStepLimit = 0;
  }

  function firePreviewEvent() {
    eventFireCount += 1;
    runDebugger();
  }

  function runDevicePreview() {
    const firstParameter = selectedProfileParameters[0]?.id ?? selectedScript?.target ?? '';
    previewParameterMessage({
      requestId: `script_workspace_${Date.now()}`,
      profileId: $selectedDeviceProfileId,
      parameterId: firstParameter,
      value: eventValue,
    });
  }

  function selectScript(script) {
    selectedScriptId = script.id;
    debuggerPausedStepId = '';
    debuggerStepLimit = 0;
    debuggerForcePaused = false;
    if (document?.id) updateScriptDocument(document.id, { activeScriptId: script.id });
  }

  function updateSelectedScript(patch) {
    if (!document?.id || !selectedScript?.id) return;
    updateScriptInDocument(document.id, selectedScript.id, patch);
  }

  function updateStepArg(step, key, value) {
    if (!document?.id || !selectedScript?.id) return;
    updateScriptStep(document.id, selectedScript.id, step.id, (currentStep) => ({
      args: {
        ...(currentStep.args ?? {}),
        [key]: parseEditableValue(value),
      },
    }));
  }

  function updateStepArgFromDescriptor(step, arg, value, checked = false) {
    const type = String(arg?.type ?? '');
    let nextValue = value;
    if (type === 'boolean') nextValue = checked;
    else if (type === 'number') {
      const number = Number(value);
      nextValue = Number.isFinite(number) ? number : 0;
    } else if (type === 'byteArray') {
      nextValue = parseByteArray(value);
    } else {
      nextValue = parseEditableValue(value);
    }
    updateStepArg(step, arg.name, nextValue);
  }

  function updateStepCommand(step, command) {
    if (!document?.id || !selectedScript?.id) return;
    const nextCommand = String(command ?? '').trim() || 'setValue';
    const descriptor = commandDescriptor(nextCommand);
    const nextArgs = {};
    for (const arg of descriptor?.args ?? []) {
      nextArgs[arg.name] = step.args?.[arg.name] ?? defaultArgValue(arg);
    }
    updateScriptStep(document.id, selectedScript.id, step.id, {
      command: nextCommand,
      ...(descriptor ? { args: nextArgs } : {}),
    });
  }

  function defaultArgValue(arg) {
    if (Object.prototype.hasOwnProperty.call(arg, 'default')) return arg.default;
    if (arg.type === 'boolean') return false;
    if (arg.type === 'number') return 0;
    if (arg.type === 'byteArray') return [];
    if (arg.type === 'expression') return { ref: 'event.value' };
    if (arg.type === 'targetRef') return 'target.value';
    if (arg.type === 'color') return '#22B9F3';
    return '';
  }

  function parseEditableValue(value) {
    const text = String(value ?? '').trim();
    if (!text) return '';
    if (text === 'true') return true;
    if (text === 'false') return false;
    const number = Number(text);
    if (Number.isFinite(number) && /^-?\d+(\.\d+)?$/.test(text)) return number;
    if ((text.startsWith('{') && text.endsWith('}')) || (text.startsWith('[') && text.endsWith(']'))) {
      try {
        return JSON.parse(text);
      } catch {
        return text;
      }
    }
    return text;
  }

  function parseByteArray(value) {
    const text = String(value ?? '').trim();
    if (!text) return [];
    return text
      .split(/[\s,]+/)
      .map((item) => item.trim())
      .filter(Boolean)
      .map((item) => Number(item.startsWith('0x') || item.startsWith('0X') ? item : `0x${item}`))
      .filter((number) => Number.isFinite(number))
      .map((number) => Math.max(0, Math.min(255, Math.round(number))));
  }

  function editableValue(value) {
    if (Array.isArray(value)) return value.map((item) => Number(item).toString(16).padStart(2, '0').toUpperCase()).join(' ');
    if (value && typeof value === 'object') return JSON.stringify(value);
    return value ?? '';
  }

  function stepDescriptor(step) {
    return commandDescriptor(step?.command ?? step?.cmd);
  }

  function addAction(command = 'setValue') {
    if (!document?.id || !selectedScript?.id) return;
    return addScriptStep(document.id, selectedScript.id, command);
  }

  function removeAction(stepId) {
    if (!document?.id || !selectedScript?.id) return;
    removeScriptStep(document.id, selectedScript.id, stepId);
    const connections = (selectedScript.graph?.connections ?? []).filter((connection) => connection.from !== stepId && connection.to !== stepId);
    updateSelectedScript({ graph: { ...(selectedScript.graph ?? {}), connections } });
    if (selectedFlowNodeId === stepId) selectedFlowNodeId = 'event';
  }

  function moveAction(stepId, direction) {
    if (!document?.id || !selectedScript?.id) return;
    moveScriptStep(document.id, selectedScript.id, stepId, direction);
  }

  function attachSelectedScriptToPanel() {
    if (!$activePanel?.id || !selectedScript) return;
    const scripts = [
      ...($activePanel.scripts ?? []).filter((script) => script.id !== selectedScript.id),
      { ...selectedScript, scope: 'panel' },
    ];
    updatePanel($activePanel.id, { scripts, scripting: { ...($activePanel.scripting ?? {}), enabled: true, runInPreview: true } });
  }

  function attachSelectedScriptToSelectedControl() {
    const control = $selectedControl ?? $activeComponentControl;
    const controlId = control?._children?.Core?.id;
    if (!controlId || !selectedScript) return;
    const scripts = [
      ...(control?._children?.Scripts?.scripts ?? []).filter((script) => script.id !== selectedScript.id),
      { ...selectedScript, scope: 'component', target: controlId },
    ];
    if (!control?._children?.Scripts) {
      updateControlProperty(controlId, 'Scripts', { _type: 'Scripts', enabled: true, runInPreview: true, scripts: [] });
    }
    updateControlProperty(controlId, 'Scripts.scripts', scripts);
    updateControlProperty(controlId, 'Scripts.enabled', true);
    updateControlProperty(controlId, 'Scripts.runInPreview', true);
  }

  function setMode(nextMode) {
    mode = nextMode;
    if (document?.id) updateScriptDocument(document.id, { mode: nextMode });
  }

  function formatNumber(value) {
    const number = Number(value);
    if (!Number.isFinite(number)) return String(value ?? '');
    return Math.abs(number) >= 10 ? String(Math.round(number)) : String(Math.round(number * 100) / 100);
  }

  function stepSummary(step) {
    const args = step.args ?? {};
    if (step.command === 'setValue') return `${args.target} = ${emitScript({ target: 'x', event: 'x', steps: [step] }, 'ce').split('=').slice(1).join('=').trim()}`;
    if (step.command === 'sendCC') return `ch${args.channel} cc${args.cc} value ${emitScript({ target: 'x', event: 'x', steps: [step] }, 'ce').match(/value=(.*)$/)?.[1] ?? ''}`;
    if (step.command === 'sendSysex') return (args.bytes ?? []).map((byte) => Number(byte).toString(16).padStart(2, '0').toUpperCase()).join(' ');
    if (step.command === 'setState') return `${args.target} -> ${args.state}`;
    return JSON.stringify(args);
  }

  function actionTone(command) {
    if (command === 'sendCC' || command === 'sendSysex') return 'midi';
    if (command === 'setValue' || command === 'setPartColor' || command === 'setState') return 'patch';
    if (command === 'scale' || command === 'clamp' || command === 'round') return 'math';
    return 'normal';
  }

  function ceStepLabel(step) {
    const args = step.args ?? {};
    if (step.command === 'setValue') return `setValue ${args.target}`;
    if (step.command === 'sendCC') return `sendCC ch${args.channel} cc${args.cc}`;
    if (step.command === 'setState') return `setState ${args.target}`;
    if (step.command === 'sendSysex') return 'sendSysex bytes';
    return step.command;
  }
</script>

<section class="script-workspace" class:diehard={mode === 'diehard'}>
  <header class="script-header">
    <div>
      <h1>{activeMode.title}</h1>
      <p>{activeMode.detail}</p>
      <p class="workspace-path">{document?.filePath || 'Local script workspace'}{document?.modified ? ' *' : ''}</p>
    </div>
    <div class="header-actions">
      <div class="file-actions">
        <button type="button" aria-label="Save script workspace" onclick={saveActiveScriptWorkspace} disabled={!document}>Save</button>
        <button type="button" aria-label="Save script workspace as" onclick={saveActiveScriptWorkspaceAs} disabled={!document}>Save As</button>
        <button type="button" aria-label="Open script workspace file" onclick={openScriptWorkspaceFromFile}>Open</button>
        <button type="button" aria-label="Create panel script in workspace" onclick={() => addNewScript('panel')} disabled={!document}>+ Script</button>
      </div>
      <nav aria-label="Script workspace views">
        {#each modes as item (item.id)}
          <button type="button" aria-label={`Open ${item.title}`} class:active={mode === item.id} onclick={() => setMode(item.id)}>{item.label}</button>
        {/each}
      </nav>
    </div>
  </header>

  {#if !document || !selectedScript}
    <div class="script-empty">No script workspace is open.</div>
  {:else if mode === 'diehard'}
    <div class="diehard-shell">
      <aside class="project-tree panel-box">
        <div class="panel-title">Script Project</div>
        <input aria-label="Search symbols" placeholder="Search symbols, scripts, commands..." />
        {#each groupedScripts as group (group.scope)}
          <div class="tree-group">
            <div class="tree-heading">{group.scope}: {group.scope === 'panel' ? 'editor2testpanel' : group.scope === 'component' ? 'envelope' : group.scope === 'device' ? 'synthProfile' : 'workspace'}</div>
            {#each group.scripts as script (script.id)}
              <button class:active={selectedScript.id === script.id} type="button" onclick={() => selectScript(script)}>
                <span>{script.name}.ce</span>
              </button>
            {/each}
          </div>
        {/each}
        <div class="outline">
          <strong>Symbol Outline</strong>
          <span>@scope("{selectedScript.scope}")</span>
          <span>on {selectedScript.target}.changed</span>
          <span>const v: float</span>
          <span>tx.atomic(...)</span>
          <span>midi.sendCC(...)</span>
        </div>
      </aside>

      <main class="code-shell panel-box">
        <div class="code-tabs">
          {#each ['ce', 'json', 'javascript', 'lua', 'cpp', 'typescript', 'rust'] as target}
            <button class:active={codeTarget === target} type="button" onclick={() => { codeTarget = target; }}>
              {SCRIPT_TARGETS.find((item) => item.id === target)?.label ?? target}
            </button>
          {/each}
          <button type="button" class="status-pill ok" onclick={runDebugger}>Run</button>
          <button type="button" class="status-pill info" onclick={stepDebugger}>Step</button>
          <button type="button" class="status-pill warn" onclick={() => toggleBreakpoint(debuggerSession?.selectedStepId || selectedScript.steps?.[0]?.id)}>Breakpoint</button>
          <button type="button" class="status-pill hot" onclick={() => updateSelectedScript({ hotReloadedAt: Date.now() })}>Hot Reload</button>
        </div>
        <pre class="code-editor"><code>{generatedCode}</code></pre>
      </main>

      <aside class="api-panel panel-box">
        <div class="panel-title">Runtime + API Inspector</div>
        <div class="info-grid">
          <span>event</span><strong>ValueEvent&lt;float&gt;</strong>
          <span>target</span><strong>{selectedScript.target}.value</strong>
          <span>phase</span><strong>preview | commit</strong>
          <span>origin</span><strong>pointer.drag</strong>
          <span>return</span><strong>Effects</strong>
        </div>
        <div class="api-list">
          <strong>Context API Surface</strong>
          <span>ctx.value(id) -> Value</span>
          <span>ctx.setValue(target, value, opts)</span>
          <span>ctx.tx.atomic(label, opts)</span>
          <span>ctx.midi.send(message)</span>
          <span>ctx.device.sysex(address, payload)</span>
          <span>ctx.trace(label, object)</span>
        </div>
        <div class="guardrails">
          <strong>Sandbox / Guardrails</strong>
          <span>Settings write access <em>DENIED</em></span>
          <span>Direct control-tree mutation <em>DENIED</em></span>
          <span>Filesystem / network <em>DENIED</em></span>
          <span>Max commands per event <em>512</em></span>
        </div>
        <div class="matrix-small">
          <strong>Export / Portability Matrix</strong>
          {#each SCRIPT_TARGETS.slice(2, 12) as target (target.id)}
            <span>{target.label}</span><em>OK</em>
          {/each}
        </div>
      </aside>

      <footer class="debug-bottom">
        {@render TracePanel(traceResult, true)}
        <div class="panel-box test-runner">
          <div class="panel-title">Test Runner</div>
          <span>PASS macro clamps values outside range</span>
          <span>PASS preview phase does not emit MIDI</span>
          <span>PASS commit phase emits CC74 once</span>
          <span>PASS IR round-trip preserves graph ids</span>
          <strong>PASS 18 tests, 0 failed, 93 ms</strong>
        </div>
        <div class="panel-box generated-graph">
          <div class="panel-title">Generated Command Graph</div>
          <pre><code>{emitScript(selectedScript, 'json')}</code></pre>
        </div>
      </footer>
    </div>
  {:else}
    <div class="workspace-grid" class:preview-grid={mode === 'preview'} class:flow-grid={mode === 'flow'} class:export-grid={mode === 'export'}>
      {#if mode !== 'inspector' && mode !== 'preview' && mode !== 'flow'}
        <aside class="script-list panel-box">
          <div class="panel-title">Scripts</div>
          <div class="mini-toolbar">
            <button type="button" aria-label="Create panel script" onclick={() => addNewScript('panel')}>Panel Script</button>
            <button type="button" aria-label="Create component script" onclick={() => addNewScript('component')}>Component Script</button>
            <button type="button" aria-label="Create device script" onclick={() => addNewScript('device')}>Device Script</button>
          </div>
          <input aria-label="Search scripts" placeholder="Search scripts..." />
          {#each groupedScripts as group (group.scope)}
            {#if group.scripts.length}
              <strong>{group.label}</strong>
              {#each group.scripts as script (script.id)}
                <button type="button" class:active={selectedScript.id === script.id} onclick={() => selectScript(script)}>
                  <span>{script.name}</span>
                  <em>{script.event}</em>
                </button>
              {/each}
            {/if}
          {/each}
          <section class="attachment-list">
            <div class="attachment-head">
              <strong>Attachment Manager</strong>
              <em>{attachmentSummary.length} active</em>
            </div>
            <div class="attachment-actions">
              <button type="button" onclick={attachSelectedScriptToPanel} disabled={!$activePanel}>Attach Panel</button>
              <button type="button" onclick={attachSelectedScriptToSelectedControl} disabled={!$selectedControl && !$activeComponentControl}>Attach Selected</button>
            </div>
            {#if attachmentSummary.length === 0}
              <span class="empty-hint">No scripts attached to the active panel or selection.</span>
            {:else}
              {#each attachmentSummary as item (`${item.kind}:${item.ownerId}:${item.script.id}`)}
                <div class="attachment-row">
                  <strong>{item.kind}</strong>
                  <span>{item.ownerLabel}</span>
                  <input value={item.script.name ?? item.script.id} oninput={(event) => renameAttachment(item, event.currentTarget.value)} />
                  {#if item.conflict}<em class="conflict">Conflict</em>{:else}<em>Attached</em>{/if}
                  <button type="button" onclick={() => copyAttachmentToWorkspace(item)}>Edit Copy</button>
                  <button type="button" onclick={() => duplicateAttachment(item)}>Duplicate</button>
                  <button type="button" onclick={() => detachAttachment(item)}>Detach</button>
                </div>
              {/each}
            {/if}
          </section>
        </aside>
      {/if}

      {#if mode === 'workspace' || mode === 'embedded' || mode === 'command'}
        <main class="command-builder panel-box">
          {#if mode === 'embedded'}
            <div class="embedded-tabs">
              {#each ['Design', 'Parameters', 'Groups', 'States', 'Scripts', 'Preview'] as tab}
                <button type="button" class:active={tab === 'Scripts'}>{tab}</button>
              {/each}
            </div>
          {/if}
          <div class="script-toolbar">
            <label class="inline-field">Script<input value={selectedScript.name} oninput={(event) => updateSelectedScript({ name: event.currentTarget.value })} /></label>
            <label class="inline-field">Scope<input value={selectedScript.scope} oninput={(event) => updateSelectedScript({ scope: event.currentTarget.value })} /></label>
            <span class="status-pill ok">{selectedScript.enabled ? 'Enabled' : 'Disabled'}</span>
            <button type="button" onclick={attachSelectedScriptToPanel} disabled={!$activePanel}>Attach Panel</button>
            <button type="button" onclick={attachSelectedScriptToSelectedControl} disabled={!$selectedControl && !$activeComponentControl}>Attach Selected</button>
            <button type="button" onclick={duplicateSelectedScript}>Duplicate</button>
            <button type="button" onclick={removeSelectedScript}>Delete</button>
            <button type="button" onclick={() => setMode('preview')}>Trace</button>
          </div>
          <section class="recipe-builder">
            <header>
              <strong>Beginner Recipe</strong>
              <span>When this control changes, set that value, then optionally send MIDI.</span>
            </header>
            <label>When
              <select value={wizardEvent} onchange={(event) => { wizardEvent = event.currentTarget.value; }}>
                {#each ['onValueChanged', 'onControlChanged', 'onPointerDown', 'onPointerUp', 'onHoverStart', 'onHoverEnd', 'onPresetLoad'] as eventName}
                  <option value={eventName}>{eventName}</option>
                {/each}
              </select>
            </label>
            <label>Source<input value={wizardSource} oninput={(event) => { wizardSource = event.currentTarget.value; }} /></label>
            <label>Set<input value={wizardTarget} oninput={(event) => { wizardTarget = event.currentTarget.value; }} /></label>
            <label>Min<input type="number" value={wizardToMin} oninput={(event) => { wizardToMin = Number(event.currentTarget.value); }} /></label>
            <label>Max<input type="number" value={wizardToMax} oninput={(event) => { wizardToMax = Number(event.currentTarget.value); }} /></label>
            <label class="check-field"><input type="checkbox" checked={wizardSendMidi} onchange={(event) => { wizardSendMidi = event.currentTarget.checked; }} />Send CC on commit</label>
            <label>Ch<input type="number" min="1" max="16" value={wizardMidiChannel} oninput={(event) => { wizardMidiChannel = Number(event.currentTarget.value); }} /></label>
            <label>CC<input type="number" min="0" max="127" value={wizardMidiCc} oninput={(event) => { wizardMidiCc = Number(event.currentTarget.value); }} /></label>
            <button type="button" onclick={applyBeginnerRecipe}>Build Recipe</button>
          </section>
          <div class="builder-layout">
            <section class="when-box">
              <h2>When</h2>
              <label>Event<input value={selectedScript.event} oninput={(event) => updateSelectedScript({ event: event.currentTarget.value })} /></label>
              <label>Target<input value={selectedScript.target} oninput={(event) => updateSelectedScript({ target: event.currentTarget.value })} /></label>
              <label>Run during drag<input value={selectedScript.runPolicy ?? 'Preview'} oninput={(event) => updateSelectedScript({ runPolicy: event.currentTarget.value })} /></label>
              <label>On commit<input value={selectedScript.commitPolicy ?? 'Send MIDI'} oninput={(event) => updateSelectedScript({ commitPolicy: event.currentTarget.value })} /></label>
              <label>Condition<input value={selectedScript.condition ?? ''} placeholder="(optional)" oninput={(event) => updateSelectedScript({ condition: event.currentTarget.value })} /></label>
              <button type="button">+ Add Condition</button>
              <div class="raw-policy">
                <strong>Raw Code Policy</strong>
                <label>Mode
                  <select value={selectedScript.rawLanguage ?? ''} onchange={(event) => setRawLanguage(event.currentTarget.value)}>
                    <option value="">Portable command graph</option>
                    <option value="javascript">Raw JavaScript (blocked)</option>
                    <option value="lua">Raw Lua (blocked)</option>
                    <option value="cpp">Raw C++ (export-only)</option>
                  </select>
                </label>
                {#if selectedScript.rawLanguage}
                  <span class="policy-warning">Raw {selectedScript.rawLanguage} is marked non-portable and blocked by default sandbox guardrails.</span>
                {:else}
                  <span class="policy-ok">Portable graph: export-safe where commands allow it.</span>
                {/if}
              </div>
            </section>
            <section class="actions-box">
              <h2>Actions ({selectedScript.steps.length})</h2>
              {#each selectedScript.steps as step, index (step.id)}
                <article class={['action-card', actionTone(step.command)]}>
                  <header>
                    <span>{index + 1}</span>
                    <select class="command-input" value={step.command} onchange={(event) => updateStepCommand(step, event.currentTarget.value)}>
                      {#each categories as category (category.category)}
                        <optgroup label={category.category}>
                          {#each category.commands as command (command.id)}
                            <option value={command.id}>{command.label}</option>
                          {/each}
                        </optgroup>
                      {/each}
                    </select>
                    <button type="button" title="Move action up" onclick={() => moveAction(step.id, -1)}>Up</button>
                    <button type="button" title="Move action down" onclick={() => moveAction(step.id, 1)}>Down</button>
                    <button type="button" aria-label={`Remove ${step.command} action`} onclick={() => removeAction(step.id)}>Remove</button>
                  </header>
                  {#if stepDescriptor(step)}
                    <p class="command-description">{stepDescriptor(step).description}</p>
                    {#each stepDescriptor(step).args as arg (`${step.id}:${arg.name}`)}
                      {@render ArgEditor(step, arg)}
                    {/each}
                  {:else}
                    {#each Object.entries(step.args ?? {}) as [key, value] (`${step.id}:${key}`)}
                      <label>{key}<input value={editableValue(value)} oninput={(event) => updateStepArg(step, key, event.currentTarget.value)} /></label>
                    {/each}
                  {/if}
                </article>
              {/each}
              <button type="button" class="add-action" onclick={() => addAction('setValue')}>+ Add Action</button>
            </section>
          </div>
          {@render CodePreview(selectedScript, 'ce')}
        </main>
        {@render CommandLibrary(categories)}
      {:else if mode === 'inspector'}
        <main class="canvas-mock panel-box">
          <span>Panel Designer Canvas</span>
          <div class="selected-knob">
            <div class="knob-ring"></div>
            <strong>Filter Cutoff</strong>
            <em>8701 Hz</em>
          </div>
          <div class="selection-pill">Selected: cutoffKnob</div>
        </main>
        <aside class="inspector panel-box">
          <div class="panel-title">Inspector</div>
          <div class="two-cols">
            <label>ID<input value="cutoffKnob" readonly /></label>
            <label>Type<input value="Knob" readonly /></label>
          </div>
          <h2>onValueChanged</h2>
          <label>Event<input value="onValueChanged" readonly /></label>
          <label>Target<input value="value" readonly /></label>
          <label>Condition<input value="current.value < min or > max" readonly /></label>
          {@render ActionSummary(selectedScript)}
          <button type="button">Validate</button>
          <button type="button">Trace</button>
        </aside>
      {:else if mode === 'flow'}
        <aside class="palette panel-box">
          <div class="panel-title">Palette</div>
          <input placeholder="Search commands..." bind:value={commandSearch} />
          {#each filteredCategories as category (category.category)}
            <strong>{category.category}</strong>
            {#each category.commands.slice(0, 7) as command (command.id)}
              <button type="button" onclick={() => addCommandFromLibrary(command)}>
                <span>{command.label}</span>
                <em>{commandExample(command)}</em>
              </button>
            {/each}
          {/each}
        </aside>
        <main class="flow-canvas panel-box">
          <div class="flow-controls">
            <button type="button" onclick={fitFlow}>Fit</button>
            <button type="button" onclick={() => setFlowZoom(1)}>100%</button>
            <button type="button" onclick={() => setFlowZoom(flowZoom + 0.1)}>+</button>
            <button type="button" onclick={() => setFlowZoom(flowZoom - 0.1)}>-</button>
            <button type="button" onclick={autoWireFlow}>Auto Wire</button>
            <button type="button" onclick={clearFlowConnections}>Clear Wires</button>
          </div>
          <div class="flow-stage" style={`transform:scale(${flowZoom});`}>
            <svg class="flow-wires" aria-hidden="true">
              {#each flowLines(flowNodes) as line (line.id)}
                <line class:auto={line.auto} x1={line.x1} y1={line.y1} x2={line.x2} y2={line.y2} />
              {/each}
            </svg>
            {#each flowNodes as node (node.id)}
              <button
                type="button"
                class={['node', `${node.tone}-node`]}
                class:active={selectedFlowNodeId === node.id}
                style={flowNodeStyle(node)}
                onpointerdown={(event) => startFlowDrag(event, node)}
                onpointermove={moveFlowDrag}
                onpointerup={endFlowDrag}
                onpointercancel={endFlowDrag}
              >
                {node.title}<span>{node.subtitle}</span>
              </button>
            {/each}
          </div>
        </main>
        <aside class="node-inspector panel-box">
          <div class="panel-title">Node Inspector</div>
          <label>Node<input value={selectedFlowNode?.id ?? ''} readonly /></label>
          {#if selectedFlowNode?.step}
            <label>Command
              <select value={selectedFlowNode.step.command} onchange={(event) => updateStepCommand(selectedFlowNode.step, event.currentTarget.value)}>
                {#each categories as category (category.category)}
                  <optgroup label={category.category}>
                    {#each category.commands as command (command.id)}
                      <option value={command.id}>{command.label}</option>
                    {/each}
                  </optgroup>
                {/each}
              </select>
            </label>
            {#if stepDescriptor(selectedFlowNode.step)}
              {#each stepDescriptor(selectedFlowNode.step).args as arg (`flow:${selectedFlowNode.step.id}:${arg.name}`)}
                {@render ArgEditor(selectedFlowNode.step, arg)}
              {/each}
            {/if}
            <button type="button" onclick={() => toggleBreakpoint(selectedFlowNode.step.id)}>
              {(selectedScript.debug?.breakpoints ?? []).includes(selectedFlowNode.step.id) ? 'Remove Breakpoint' : 'Add Breakpoint'}
            </button>
            <button type="button" onclick={() => removeAction(selectedFlowNode.step.id)}>Remove Node</button>
          {:else}
            <label>Event<input value={selectedScript.event} oninput={(event) => updateSelectedScript({ event: event.currentTarget.value })} /></label>
            <label>Target<input value={selectedScript.target} oninput={(event) => updateSelectedScript({ target: event.currentTarget.value })} /></label>
          {/if}
          <div class="wire-editor">
            <strong>Wire Editor</strong>
            <button type="button" onclick={() => startFlowConnection(selectedFlowNode?.id ?? 'event')}>Start Wire Here</button>
            <button type="button" disabled={!flowConnectionSourceId || flowConnectionSourceId === selectedFlowNode?.id} onclick={() => connectFlowTo(selectedFlowNode?.id)}>
              Connect {flowConnectionSourceId ? `${flowConnectionSourceId} -> here` : 'to Selected'}
            </button>
            {#each normalizedFlowConnections(selectedScript, flowNodes).filter((connection) => connection.auto !== true) as connection (connection.id)}
              <div class="wire-row">
                <span>{connection.from} -> {connection.to}</span>
                <button type="button" onclick={() => removeFlowConnection(connection.id)}>Remove</button>
              </div>
            {/each}
            {#if flowConnectionIssues.length}
              {#each flowConnectionIssues as issue}
                <span class="policy-warning">{issue}</span>
              {/each}
            {:else}
              <span class="policy-ok">Connections valid.</span>
            {/if}
          </div>
          <strong class="green">Portable</strong>
          {#if validationIssues.length}
            {#each validationIssues.slice(0, 5) as issue}
              <span>{issue.code}: {issue.message}</span>
            {/each}
          {:else}
            <span>No issues</span>
          {/if}
        </aside>
      {:else if mode === 'routing'}
        <main class="routing-board panel-box">
          <div class="panel-title">Panel Script Routing Board</div>
          <table>
            <thead><tr><th>Source / Event</th><th>Condition</th><th>Actions</th></tr></thead>
            <tbody>
              {#each scripts.slice(0, 4) as script (script.id)}
                <tr class:active={selectedScript.id === script.id} onclick={() => selectScript(script)}>
                  <td><strong>{script.target}</strong><span>{script.event}</span></td>
                  <td>{script.id === 'modeVisibility' ? 'mode == "advanced"' : script.id === 'ccSwitch' ? 'event.value == true' : 'always'}</td>
                  <td>
                    {#each script.steps.slice(0, 4) as step (step.id)}
                      <span class="dot-line">- {ceStepLabel(step)}</span>
                    {/each}
                  </td>
                </tr>
              {/each}
            </tbody>
          </table>
        </main>
        <aside class="row-details panel-box">
          <div class="panel-title">Row Details</div>
          <label>Event<input value={selectedScript.event} readonly /></label>
          <label>Source<input value={selectedScript.target} readonly /></label>
          <label>Condition<input value="always" readonly /></label>
          <label>Run Policy<input value={selectedScript.runPolicy ?? 'During drag: Preview'} readonly /></label>
          <strong class="green">{portability?.label}</strong>
          <button type="button">Open in Editor</button>
        </aside>
      {:else if mode === 'device'}
        <aside class="device-list panel-box">
          <div class="panel-title">Device Events</div>
          <button type="button" onclick={refreshDeviceProfiles}>Refresh Devices</button>
          {#each ['onParameterCommitted', 'onMidiIn', 'onSysexIn', 'onDeviceConnected', 'onPatchDumpReceived'] as event}
            <button type="button" class:active={event === selectedScript.event} onclick={() => updateSelectedScript({ event })}>{event}</button>
          {/each}
          <div class="panel-title spaced">Profiles</div>
          <div class="device-empty-actions">
            <button type="button" onclick={openScriptDeviceProfile}>Open Profile Designer</button>
            <button type="button" onclick={createScriptDeviceProfile}>New Test Profile</button>
          </div>
          {#if ($deviceProfiles ?? []).length === 0}
            <span class="empty-hint">No profile list loaded yet.</span>
            <button type="button" onclick={importDeviceProfile}>Import Profile</button>
          {:else}
            {#each $deviceProfiles as profile (profile.id)}
              <button type="button" class:active={String(profile.id) === String($selectedDeviceProfileId)}>{profile.name ?? profile.id}</button>
            {/each}
          {/if}
          <div class="panel-title spaced">Parameters</div>
          {#each selectedProfileParameters.slice(0, 24) as parameter (parameter.id ?? parameter.name)}
            <button type="button" class:active={String(parameter.id ?? parameter.name) === selectedScript.target} onclick={() => updateSelectedScript({ target: String(parameter.id ?? parameter.name) })}>
              {parameter.name ?? parameter.id}
            </button>
          {/each}
        </aside>
        <main class="device-builder panel-box">
          <div class="script-toolbar">
            <strong>Device Script: {selectedScript.name}</strong>
            <button type="button" onclick={() => addAction('buildSysex')}>+ SysEx Builder</button>
            <button type="button" onclick={() => addAction('checksum')}>+ Checksum</button>
            <button type="button" onclick={() => addAction('sendCC')}>+ CC</button>
            <button type="button" onclick={() => addAction('sendNRPN')}>+ NRPN</button>
            <button type="button" onclick={runDevicePreview}>Preview Bytes</button>
            <button type="button" onclick={() => runTestsForProfile($selectedDeviceProfileId)}>Run Profile Tests</button>
          </div>
          {#each selectedScript.steps as step, index (step.id)}
            <article class={['action-card', actionTone(step.command)]}>
              <header>
                <span>{index + 1}</span>
                <select class="command-input" value={step.command} onchange={(event) => updateStepCommand(step, event.currentTarget.value)}>
                  {#each categories as category (category.category)}
                    <optgroup label={category.category}>
                      {#each category.commands as command (command.id)}
                        <option value={command.id}>{command.label}</option>
                      {/each}
                    </optgroup>
                  {/each}
                </select>
                <button type="button" aria-label={`Remove ${step.command} action`} onclick={() => removeAction(step.id)}>Remove</button>
              </header>
              {#if stepDescriptor(step)}
                <p class="command-description">{stepDescriptor(step).description}</p>
                {#each stepDescriptor(step).args as arg (`device:${step.id}:${arg.name}`)}
                  {@render ArgEditor(step, arg)}
                {/each}
              {/if}
            </article>
          {/each}
          <button class="add-action" type="button" onclick={() => addAction('sendSysex')}>+ Add Action</button>
        </main>
        <aside class="byte-preview panel-box">
          <div class="panel-title">Byte Preview</div>
          <strong>{selectedDeviceProfile?.name ?? 'Selected device profile'}</strong>
          {#if $latestMidiPreview?.message?.bytes}
            <div class="bytes">{#each $latestMidiPreview.message.bytes as byte}<span>{Number(byte).toString(16).padStart(2, '0').toUpperCase()}</span>{/each}</div>
          {:else if $latestMidiPreview?.bytes}
            <div class="bytes">{#each $latestMidiPreview.bytes as byte}<span>{Number(byte).toString(16).padStart(2, '0').toUpperCase()}</span>{/each}</div>
          {:else}
            <span class="empty-hint">Run Preview Bytes or execute a device script to see output.</span>
          {/if}
          {#if $latestProfileTestResult}
            <h2>{$latestProfileTestResult.running ? 'Tests running' : `Tests: ${$latestProfileTestResult.ok === false ? 'Issues' : 'OK'}`}</h2>
          {/if}
          {#if $latestDumpParseResult?.fields}
            <div class="panel-title spaced">Parsed Fields</div>
            {#each Object.entries($latestDumpParseResult.fields) as [key, value]}
              <span class="patch-line">{key}<strong>{value}</strong></span>
            {/each}
          {/if}
          <div class="panel-title spaced">MIDI Monitor</div>
          {#each ($midiMonitorEvents ?? []).slice(-5) as item, index (`midi:${index}`)}
            <span class="patch-line">{item.type ?? 'MIDI'}<strong>{item.message ?? item.hex ?? ''}</strong></span>
          {/each}
          {@render CodePreview(selectedScript, 'ce')}
        </aside>
      {:else if mode === 'preview'}
        <main class="preview-panel panel-box">
          <div class="panel-title">Live Preview</div>
          <div class="synth-preview">
            {#each ['Cutoff', 'Resonance', 'Drive'] as label, index}
              <div class="macro-knob">
                <strong>{label}</strong>
                <div class="dial" style={`--value:${index === 0 ? 0.72 : index === 1 ? 0.61 : eventValue};`}></div>
                <em>{index === 0 ? '8701 Hz' : index === 1 ? '0.61' : formatNumber(eventValue)}</em>
              </div>
            {/each}
            <label class="macro-slider">Macro<input type="range" min="0" max="1" step="0.01" bind:value={eventValue} /><span>{formatNumber(eventValue)}</span></label>
          </div>
          <div class="event-injector">
            <div class="panel-title">Event Injector</div>
            <label>Event<input value="onValueChanged" readonly /></label>
            <label>Target<input value={selectedScript.target} readonly /></label>
            <label>Value<input bind:value={eventValue} /></label>
            <button type="button" onclick={firePreviewEvent}>Fire Event</button>
            <span class="fire-count">#{eventFireCount}</span>
          </div>
        </main>
        <section class="preview-debug">
          <div class="debugger-toolbar panel-box">
            <button type="button" onclick={runDebugger}>Run</button>
            <button type="button" onclick={stepDebugger}>Step Over</button>
            <button type="button" onclick={pauseDebugger}>Pause</button>
            <button type="button" onclick={resumeDebugger}>Resume</button>
            <span>{debuggerSession?.paused ? `Paused at ${debuggerSession.pausedAt}` : 'Running preview event'}</span>
          </div>
          {@render TracePanel(debuggerSession)}
          <div class="preview-details">
            <div class="panel-box">
              <div class="panel-title">Selected Step</div>
              {#each selectedScript.steps as step, index (step.id)}
                <div class:active={debuggerSession?.selectedStepId === step.id} class="debug-step">
                  <button type="button" onclick={() => toggleBreakpoint(step.id)}>
                    {(selectedScript.debug?.breakpoints ?? []).includes(step.id) ? 'B' : index + 1}
                  </button>
                  <strong>{step.command}</strong>
                  <em>{stepSummary(step)}</em>
                </div>
              {/each}
            </div>
            <div class="panel-box">
              <div class="panel-title">Patches</div>
              {#each debuggerSession?.patches ?? [] as patch}
                <span class="patch-line">{patch.target}<strong>{formatNumber(patch.value)} (changed)</strong></span>
              {/each}
              <div class="panel-title spaced">MIDI Out</div>
              {#each debuggerSession?.deviceMessages ?? [] as message}
                <span class="patch-line">{message.type} ch{message.channel ?? '-'}<strong>value {message.value ?? formatNumber(message.bytes?.length ?? 0)}</strong></span>
              {/each}
              <div class="panel-title spaced">Watch Values</div>
              <div class="watch-editor">
                <input placeholder="event.value or cutoff.value" bind:value={watchInput} />
                <button type="button" onclick={() => addWatchPath()}>Add Watch</button>
              </div>
              {#each debuggerSession?.watches ?? [] as watch}
                <span class="patch-line">{watch.path}<strong>{formatNumber(watch.value)}</strong><button type="button" onclick={() => removeWatchPath(watch.path)}>Remove</button></span>
              {/each}
              {#if debuggerSession?.reasonNotRun}
                <div class="panel-title spaced">Why Did It Not Run?</div>
                <span class="patch-line">Reason<strong>{debuggerSession.reasonNotRun}</strong></span>
              {/if}
            </div>
          </div>
          {@render CodePreview(selectedScript, 'ce')}
        </section>
      {:else if mode === 'export'}
        <main class="export-review panel-box">
          <div class="target-tabs">
            {#each SCRIPT_TARGETS as target (target.id)}
              <button type="button" class:active={exportTarget === target.id} onclick={() => { exportTarget = target.id; }}>{target.label}</button>
            {/each}
          </div>
          <div class="export-layout">
            <aside>
              <div class="panel-title">Scripts</div>
              {#each scripts as script (script.id)}
                <button type="button" class:active={selectedScript.id === script.id} onclick={() => selectScript(script)}>
                  {script.name}<span>{portabilityForScript(script).exportSafe ? 'Portable' : 'Device only'}</span>
                </button>
              {/each}
              <div class="panel-title spaced">Build Integration</div>
              <span>Workspace projections: {workspaceExportSummary?.scripts?.length ?? 0}</span>
              <span>Active panel exports: {panelExportSummary?.scripts?.length ?? 0}</span>
              <span>Panel issues: {panelExportSummary?.issues?.length ?? 0}</span>
            </aside>
            <section>
              <div class="panel-title">Generated {SCRIPT_TARGETS.find((target) => target.id === exportTarget)?.label}</div>
              <div class="export-meta">
                <span>{['html', 'css'].includes(exportTarget) ? 'Projection metadata, not a runtime script.' : 'Runtime projection from the portable command graph.'}</span>
                <span>{['cpp', 'csharp', 'swift', 'go', 'kotlin', 'rust'].includes(exportTarget) ? 'Run npm run test:script-exports to compile/check installed target toolchains; missing SDKs are reported as skipped.' : 'Portable graph remains the source of truth.'}</span>
              </div>
              <pre><code>{generatedCode}</code></pre>
            </section>
          </div>
          <div class="export-warnings">
            <div class="panel-title">Export Warnings</div>
            {#if exportWarnings.length === 0 && (panelExportSummary?.issues?.length ?? 0) === 0}
              <span>No warnings for this target graph.</span>
            {:else}
              {#each exportWarnings as warning}
                <span>Warning: {warning}</span>
              {/each}
              {#each panelExportSummary?.issues ?? [] as issue}
                <span>{issue.level}: {issue.scriptId} {issue.message}</span>
              {/each}
            {/if}
          </div>
        </main>
      {/if}

      {#if mode !== 'preview' && mode !== 'export' && mode !== 'diehard'}
        {@render TraceFooter(traceResult, validationIssues)}
      {/if}
    </div>
  {/if}
</section>

{#snippet CommandLibrary(categories)}
  <aside class="command-library panel-box">
    <div class="panel-title">Command Library</div>
    <input placeholder="Search commands, MIDI, animation..." bind:value={commandSearch} />
    {#each filteredCategories as category (category.category)}
      <strong>{category.category}</strong>
      {#each category.commands as command (command.id)}
        <button type="button" onclick={() => addCommandFromLibrary(command)}>
          <span>{command.label}</span>
          <em>{command.description}</em>
          <small>{commandExample(command)}</small>
        </button>
      {/each}
    {/each}
  </aside>
{/snippet}

{#snippet ArgEditor(step, arg)}
  <label class={['typed-arg', arg.type]}>
    <span>{arg.name}{arg.required ? ' *' : ''}</span>
    {#if arg.type === 'boolean'}
      <input
        type="checkbox"
        checked={Boolean(step.args?.[arg.name])}
        onchange={(event) => updateStepArgFromDescriptor(step, arg, event.currentTarget.value, event.currentTarget.checked)}
      />
    {:else if arg.type === 'number'}
      <input
        type="number"
        value={step.args?.[arg.name] ?? arg.default ?? 0}
        oninput={(event) => updateStepArgFromDescriptor(step, arg, event.currentTarget.value)}
      />
    {:else if arg.type === 'color'}
      <input
        type="color"
        value={step.args?.[arg.name] ?? arg.default ?? '#22B9F3'}
        oninput={(event) => updateStepArgFromDescriptor(step, arg, event.currentTarget.value)}
      />
    {:else if arg.type === 'byteArray'}
      <input
        value={editableValue(step.args?.[arg.name] ?? [])}
        placeholder="F0 41 10 00 F7"
        oninput={(event) => updateStepArgFromDescriptor(step, arg, event.currentTarget.value)}
      />
    {:else}
      <input
        value={editableValue(step.args?.[arg.name] ?? arg.default ?? '')}
        placeholder={arg.type === 'expression' ? 'event.value, 0.5, or {\"op\":\"scale\",...}' : arg.type}
        oninput={(event) => updateStepArgFromDescriptor(step, arg, event.currentTarget.value)}
      />
    {/if}
  </label>
{/snippet}

{#snippet CodePreview(script, target)}
  <section class="code-preview panel-box">
    <div class="panel-title">{SCRIPT_TARGETS.find((item) => item.id === target)?.label ?? target} Preview</div>
    <pre><code>{emitScript(script, target)}</code></pre>
  </section>
{/snippet}

{#snippet ActionSummary(script)}
  <div class="action-summary">
    {#each script.steps.slice(0, 4) as step, index (step.id)}
      <div>
        <span>{index + 1}</span>
        <strong>{step.command}</strong>
        <em>{stepSummary(step)}</em>
      </div>
    {/each}
  </div>
{/snippet}

{#snippet TracePanel(traceResult, compact = false)}
  <section class={['trace-panel', 'panel-box', compact ? 'compact' : '']}>
    <div class="panel-title">Trace</div>
    {#each traceResult?.trace ?? [] as item}
      <div class="trace-line">
        <span>{item.time}</span>
        <strong>{item.type}</strong>
        <em>{item.message}</em>
      </div>
    {/each}
  </section>
{/snippet}

{#snippet TraceFooter(traceResult, validationIssues)}
  <footer class="trace-footer panel-box">
    <div class="footer-tabs"><button class="active">Trace</button><button>Validation</button><button>Events</button><button>Patches</button><button>MIDI Out</button><button>Console</button></div>
    {#if validationIssues.length}
      {#each validationGroups as group (group.id)}
        <strong>{group.label}</strong>
        {#each group.issues as issue}
          <span>{issue.level}: {issue.code} - {issue.message} {issue.quickFix ? `Fix: ${issue.quickFix}` : ''}</span>
        {/each}
      {/each}
    {:else}
      {#each traceResult.trace as item}
        <span>{item.time} {item.type} {item.message}</span>
      {/each}
    {/if}
  </footer>
{/snippet}

<style>
  .script-workspace {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    min-width: 0;
    min-height: 0;
    background: #071017;
    color: #DCE8F0;
    font-family: Inter, Segoe UI, sans-serif;
    overflow: hidden;
  }

  .script-header {
    flex: 0 0 58px;
    display: grid;
    grid-template-columns: minmax(260px, 1fr) auto;
    align-items: center;
    gap: 12px;
    padding: 8px 14px;
    border-bottom: 1px solid #274252;
    background: #0A151D;
    box-sizing: border-box;
  }

  h1, h2, p { margin: 0; }

  h1 {
    color: #E6F0F7;
    font-size: 19px;
    line-height: 1.05;
    font-weight: 900;
  }

  p {
    overflow: hidden;
    color: #8AA0AE;
    font-size: 11px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .workspace-path {
    margin-top: 2px;
    color: #5F7483;
    font-family: Consolas, monospace;
  }

  .header-actions {
    display: grid;
    gap: 5px;
    justify-items: end;
  }

  .file-actions,
  .mini-toolbar,
  .debugger-toolbar {
    display: flex;
    gap: 5px;
    align-items: center;
  }

  .script-header nav {
    display: flex;
    flex-wrap: wrap;
    justify-content: flex-end;
    gap: 4px;
    max-width: 980px;
  }

  button {
    min-width: 0;
    border: 1px solid #294254;
    border-radius: 5px;
    background: #0C1720;
    color: #A8B8C4;
    font: inherit;
    font-size: 11px;
    font-weight: 800;
    cursor: pointer;
  }

  button:hover,
  button.active {
    border-color: #10A8E8;
    background: #123047;
    color: #EAF7FF;
  }

  button:disabled {
    cursor: not-allowed;
    opacity: 0.45;
  }

  input,
  select {
    width: 100%;
    height: 24px;
    min-width: 0;
    padding: 0 8px;
    border: 1px solid #294254;
    border-radius: 4px;
    background: #071017;
    color: #DCE8F0;
    box-sizing: border-box;
    font: inherit;
    font-size: 11px;
  }

  select {
    appearance: none;
    padding-right: 22px;
    background-image: linear-gradient(45deg, transparent 50%, #8AA0AE 50%), linear-gradient(135deg, #8AA0AE 50%, transparent 50%);
    background-position: calc(100% - 12px) 9px, calc(100% - 7px) 9px;
    background-size: 5px 5px, 5px 5px;
    background-repeat: no-repeat;
  }

  input[type="checkbox"] {
    width: 18px;
    height: 18px;
    padding: 0;
  }

  input[type="color"] {
    padding: 2px;
  }

  label {
    display: grid;
    gap: 4px;
    color: #8BA0AD;
    font-size: 10px;
    font-weight: 700;
  }

  .panel-box {
    min-width: 0;
    min-height: 0;
    border: 1px solid #294254;
    border-radius: 6px;
    background: #101D26;
    box-sizing: border-box;
    overflow: hidden;
  }

  .panel-title {
    min-height: 26px;
    padding: 8px 10px 6px;
    border-bottom: 1px solid #294254;
    background: #142635;
    color: #DCE8F0;
    box-sizing: border-box;
    font-size: 12px;
    font-weight: 900;
    text-transform: uppercase;
  }

  .spaced { margin-top: 12px; }

  .workspace-grid {
    flex: 1;
    display: grid;
    grid-template-columns: 270px minmax(0, 1fr) 300px;
    grid-template-rows: minmax(0, 1fr) 124px;
    gap: 10px;
    padding: 10px;
    min-height: 0;
    box-sizing: border-box;
  }

  .workspace-grid.preview-grid {
    grid-template-columns: 39% minmax(0, 1fr);
    grid-template-rows: minmax(0, 1fr);
  }

  .workspace-grid.flow-grid {
    grid-template-columns: 260px minmax(620px, 1fr) 300px;
    grid-template-rows: minmax(0, 1fr) 124px;
  }

  .workspace-grid.export-grid {
    grid-template-columns: minmax(0, 1fr);
    grid-template-rows: minmax(0, 1fr);
  }

  .script-list,
  .project-tree,
  .palette,
  .device-list {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 10px;
  }

  .script-list .panel-title,
  .project-tree .panel-title,
  .palette .panel-title,
  .device-list .panel-title {
    margin: -10px -10px 6px;
  }

  .script-list strong,
  .palette strong,
  .command-library strong {
    margin-top: 8px;
    color: #DDE8F0;
    font-size: 11px;
    text-transform: uppercase;
  }

  .script-list button,
  .project-tree button,
  .device-list button,
  .export-layout aside button {
    display: grid;
    gap: 2px;
    justify-items: start;
    min-height: 32px;
    padding: 6px 8px;
    text-align: left;
  }

  .attachment-list {
    display: grid;
    gap: 6px;
    margin-top: auto;
    padding-top: 8px;
    border-top: 1px solid #294254;
  }

  .attachment-head,
  .attachment-actions {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 6px;
  }

  .attachment-head em {
    color: #5FBFEA;
    font-size: 10px;
    font-style: normal;
    font-weight: 800;
  }

  .attachment-actions button {
    flex: 1;
    height: 24px;
  }

  .attachment-row {
    display: grid;
    grid-template-columns: 58px minmax(0, 1fr) minmax(0, 0.9fr) 62px repeat(3, auto);
    gap: 5px;
    align-items: center;
    padding: 5px;
    border: 1px solid #233B4E;
    border-radius: 5px;
    background: #0B151D;
    font-size: 10px;
  }

  .attachment-row strong {
    color: #21D2FF;
    text-transform: uppercase;
  }

  .attachment-row span,
  .attachment-row em,
  .empty-hint {
    overflow: hidden;
    color: #8AA0AE;
    font-style: normal;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .attachment-row .conflict {
    color: #FF6B75;
    font-weight: 800;
  }

  .attachment-row input,
  .attachment-row select {
    min-width: 0;
    height: 24px;
    border: 1px solid #2D495F;
    border-radius: 4px;
    background: #08141C;
    color: #DCE7EF;
    font-size: 10px;
    font-weight: 700;
  }

  .attachment-row button {
    height: 22px;
    padding: 0 6px;
  }

  .script-list em,
  .export-layout aside span {
    overflow: hidden;
    color: #8AA0AE;
    font-size: 10px;
    font-style: normal;
    text-overflow: ellipsis;
  }

  .command-builder {
    display: flex;
    flex-direction: column;
    padding: 10px;
    gap: 10px;
  }

  .embedded-tabs,
  .target-tabs,
  .code-tabs,
  .footer-tabs {
    display: flex;
    gap: 5px;
    flex-wrap: wrap;
  }

  .embedded-tabs button,
  .target-tabs button,
  .code-tabs button,
  .footer-tabs button {
    height: 24px;
    padding: 0 12px;
  }

  .script-toolbar {
    display: flex;
    align-items: center;
    gap: 8px;
    min-height: 28px;
  }

  .script-toolbar strong {
    flex: 1;
    font-size: 12px;
  }

  .recipe-builder {
    display: grid;
    grid-template-columns: repeat(8, minmax(0, 1fr));
    gap: 8px;
    padding: 10px;
    border: 1px solid #284354;
    border-radius: 6px;
    background: #0B151D;
  }

  .recipe-builder header {
    grid-column: 1 / -1;
    display: flex;
    align-items: baseline;
    gap: 10px;
  }

  .recipe-builder header strong {
    color: #DDEAF2;
    text-transform: uppercase;
  }

  .recipe-builder header span,
  .raw-policy span {
    color: #8FA5B4;
    font-size: 11px;
  }

  .recipe-builder label {
    min-width: 0;
  }

  .recipe-builder .check-field {
    display: flex;
    flex-direction: row;
    align-items: center;
    gap: 6px;
    padding-top: 16px;
    color: #DCE8F0;
    font-size: 11px;
    font-weight: 800;
  }

  .recipe-builder .check-field input {
    width: auto;
    height: auto;
  }

  .recipe-builder button {
    align-self: end;
    height: 28px;
  }

  .raw-policy {
    display: grid;
    gap: 6px;
    padding-top: 6px;
  }

  .raw-policy .policy-warning,
  .policy-warning {
    color: #FFB74D;
  }

  .policy-ok {
    color: #5AE27D;
  }

  .inline-field {
    grid-template-columns: 48px minmax(110px, 170px);
    align-items: center;
  }

  .status-pill {
    display: inline-flex;
    align-items: center;
    height: 18px;
    padding: 0 6px;
    border: 1px solid #2E4D62;
    border-radius: 999px;
    font-size: 10px;
    font-weight: 900;
  }

  .status-pill.ok,
  .green { color: #5AE27D; border-color: #238B45; background: rgba(35, 139, 69, 0.18); }
  .status-pill.info { color: #29C9FF; border-color: #1385AE; background: rgba(19, 133, 174, 0.18); }
  .status-pill.warn { color: #FFC547; border-color: #A76D00; background: rgba(167, 109, 0, 0.16); }
  .status-pill.hot { color: #C08BFF; border-color: #7B4DD8; background: rgba(123, 77, 216, 0.16); }

  .builder-layout {
    flex: 1;
    min-height: 0;
    display: grid;
    grid-template-columns: 250px minmax(0, 1fr);
    gap: 10px;
  }

  .when-box,
  .actions-box {
    display: flex;
    flex-direction: column;
    gap: 8px;
    min-width: 0;
    min-height: 0;
    padding: 10px;
    border: 1px solid #233B4E;
    border-radius: 6px;
    background: #0C1821;
  }

  h2 {
    color: #DCE8F0;
    font-size: 14px;
    font-weight: 900;
  }

  .actions-box {
    overflow: auto;
  }

  .action-card {
    display: grid;
    gap: 7px;
    padding: 9px;
    border: 1px solid #294254;
    border-radius: 6px;
    background: #132534;
  }

  .action-card header {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .action-card header span {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 18px;
    height: 18px;
    border: 1px solid #15B4EC;
    border-radius: 4px;
    color: #CFF4FF;
    font-size: 11px;
    font-weight: 900;
  }

  .action-card .command-input {
    flex: 1;
    min-width: 120px;
    font-weight: 900;
  }
  .action-card header button { min-width: 52px; height: 22px; border: 1px solid #294254; background: #0C1720; font-size: 10px; }
  .action-card header button[title] {
    width: auto;
    padding: 0 6px;
    border: 1px solid #294254;
    font-size: 10px;
  }
  .action-card.patch header span { border-color: #52E07A; }
  .action-card.midi header span { border-color: #FF9F2E; }
  .action-card.math header span { border-color: #9D6CFF; }

  .command-description {
    color: #8AA0AE;
    font-size: 11px;
    line-height: 1.35;
    white-space: normal;
  }

  .typed-arg {
    grid-template-columns: 128px minmax(0, 1fr);
    align-items: center;
  }

  .typed-arg span {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .add-action {
    align-self: start;
    height: 28px;
    padding: 0 10px;
  }

  .command-library {
    grid-column: 3;
    display: flex;
    flex-direction: column;
    gap: 5px;
    padding: 10px;
    overflow: auto;
  }

  .command-library .panel-title { margin: -10px -10px 6px; }
  .command-library span,
  .palette span {
    color: #9FB0BC;
    font-size: 11px;
  }

  .flow-grid .palette {
    grid-column: 1;
    grid-row: 1;
    overflow: auto;
  }

  .flow-grid .flow-canvas {
    grid-column: 2;
    grid-row: 1;
  }

  .flow-grid .node-inspector {
    grid-column: 3;
    grid-row: 1;
    overflow: auto;
  }

  .command-library button,
  .palette button {
    display: grid;
    gap: 2px;
    padding: 6px;
    text-align: left;
  }

  .command-library button span,
  .palette button span {
    color: #DDE8F0;
    font-weight: 900;
  }

  .command-library button em,
  .command-library button small,
  .palette button em {
    overflow: hidden;
    color: #7E92A0;
    font-size: 10px;
    font-style: normal;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .code-preview {
    max-height: 220px;
  }

  pre {
    margin: 0;
    padding: 12px;
    overflow: auto;
    color: #F4C443;
    font: 12px/1.55 Consolas, monospace;
  }

  .trace-footer {
    grid-column: 1 / -1;
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 8px 10px;
    overflow: auto;
  }

  .trace-footer span {
    color: #9FB0BC;
    font: 11px/1.35 Consolas, monospace;
  }

  .trace-footer strong {
    color: #DCE8F0;
    font-size: 11px;
    text-transform: uppercase;
  }

  .canvas-mock {
    grid-column: 1 / 3;
    position: relative;
    background-color: #071017;
    background-image: linear-gradient(#16303C 1px, transparent 1px), linear-gradient(90deg, #16303C 1px, transparent 1px);
    background-size: 64px 64px, 64px 64px;
  }

  .canvas-mock > span {
    position: absolute;
    top: 32px;
    left: 32px;
    color: #9FB0BC;
    font-weight: 800;
  }

  .selected-knob {
    position: absolute;
    top: 128px;
    left: 48%;
    width: 250px;
    height: 260px;
    transform: translateX(-50%);
    border: 2px solid #0FB2E8;
    display: grid;
    place-items: center;
  }

  .knob-ring {
    width: 180px;
    height: 180px;
    border: 18px solid #182D3D;
    border-top-color: #26B7F2;
    border-left-color: #26B7F2;
    border-radius: 50%;
  }

  .selected-knob strong { position: absolute; top: -34px; }
  .selected-knob em { position: absolute; bottom: -10px; color: #E6F0F7; font-size: 18px; font-weight: 900; }
  .selection-pill { position: absolute; top: 430px; left: 45%; padding: 10px 70px; border: 2px solid #0FB2E8; border-radius: 8px; color: #21D2FF; font-weight: 900; }

  .inspector,
  .node-inspector,
  .row-details,
  .byte-preview {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 10px;
  }

  .inspector .panel-title,
  .node-inspector .panel-title,
  .row-details .panel-title,
  .byte-preview .panel-title { margin: -10px -10px 4px; }

  .two-cols {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
  }

  .action-summary {
    display: grid;
    gap: 6px;
  }

  .action-summary div,
  .patch-line {
    display: grid;
    grid-template-columns: 24px 110px minmax(0, 1fr);
    gap: 6px;
    align-items: center;
    padding: 6px;
    border: 1px solid #294254;
    border-radius: 5px;
    background: #0C1821;
    font-size: 11px;
  }

  .patch-line {
    grid-template-columns: minmax(0, 1fr) auto auto;
  }

  .patch-line button {
    height: 22px;
    padding: 0 6px;
  }

  .action-summary span {
    display: inline-grid;
    place-items: center;
    width: 18px;
    height: 18px;
    border-radius: 4px;
    background: #1E5470;
    color: #DFF7FF;
  }

  .action-summary em {
    overflow: hidden;
    color: #95A9B5;
    font-style: normal;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .flow-canvas {
    position: relative;
    background-color: #071017;
    background-image: linear-gradient(#17313D 1px, transparent 1px), linear-gradient(90deg, #17313D 1px, transparent 1px);
    background-size: 72px 72px, 72px 72px;
    overflow: hidden;
  }

  .flow-controls {
    position: absolute;
    top: 14px;
    right: 16px;
    display: flex;
    gap: 5px;
    z-index: 5;
  }

  .flow-stage {
    position: absolute;
    inset: 0;
    transform-origin: 0 0;
  }

  .flow-wires {
    position: absolute;
    inset: 0;
    width: 2000px;
    height: 1400px;
    pointer-events: none;
  }

  .flow-wires line {
    stroke: #19BDF4;
    stroke-width: 3;
    stroke-linecap: round;
    opacity: 0.85;
  }

  .flow-wires line.auto {
    stroke-dasharray: 8 7;
    opacity: 0.45;
  }

  .node {
    position: absolute;
    display: grid;
    place-items: center;
    width: 168px;
    height: 58px;
    border: 2px solid #16AEF0;
    border-radius: 6px;
    background: #123D5B;
    color: #E8F4FA;
    font-weight: 900;
    user-select: none;
    touch-action: none;
    text-align: center;
  }

  .node.active {
    box-shadow: 0 0 0 3px rgba(33, 210, 255, 0.28);
  }

  .node span {
    color: #A6B8C4;
    font-size: 11px;
    font-weight: 700;
  }

  .event-node { top: 80px; left: 43%; }
  .math-node { background: #2B174F; border-color: #8756FF; }
  .patch-node { background: #103D22; border-color: #3DDC68; }
  .midi-node { background: #4D2A08; border-color: #F59A2E; }
  .normal-node { background: #182B38; border-color: #49687D; }
  .n1 { top: 210px; left: 30%; }
  .n2 { top: 210px; left: 58%; }
  .n3 { top: 350px; left: 30%; }
  .n4 { top: 350px; left: 58%; }
  .n5 { top: 490px; left: 44%; }

  .wire-editor,
  .device-empty-actions,
  .watch-editor {
    display: grid;
    gap: 6px;
  }

  .wire-editor {
    padding: 8px;
    border: 1px solid #294254;
    border-radius: 6px;
    background: #0B151D;
  }

  .wire-editor header,
  .watch-editor {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .wire-editor header button,
  .wire-row button,
  .watch-editor button {
    height: 24px;
    padding: 0 8px;
  }

  .wire-row {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 6px;
    align-items: center;
    color: #8FA5B4;
    font-size: 11px;
  }

  .watch-editor input {
    flex: 1;
  }

  .device-empty-actions {
    grid-template-columns: 1fr 1fr;
  }

  .routing-board {
    grid-column: 1 / 3;
    padding: 12px;
  }

  .routing-board .panel-title { margin: -12px -12px 12px; }
  table { width: 100%; border-collapse: collapse; font-size: 12px; }
  th, td { border: 1px solid #294254; padding: 16px; text-align: left; vertical-align: top; }
  th { background: #142635; color: #E0ECF3; text-transform: uppercase; }
  tr.active, tr:hover { background: rgba(16, 168, 232, 0.08); }
  td span, .dot-line { display: block; color: #9FB0BC; margin-top: 4px; }
  .dot-line { color: #C7D5DF; }

  .device-builder {
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 12px;
  }

  .bytes {
    display: flex;
    flex-wrap: wrap;
    gap: 5px;
  }

  .bytes span {
    padding: 5px 8px;
    border: 1px solid #416478;
    border-radius: 4px;
    background: #142B3A;
    color: #DDECF4;
    font-family: Consolas, monospace;
  }

  .byte-preview h2 { color: #5AE27D; font-size: 16px; }

  .preview-panel {
    display: flex;
    flex-direction: column;
    padding: 10px;
    gap: 12px;
  }

  .preview-panel .panel-title { margin: -10px -10px 0; }

  .synth-preview {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    grid-template-rows: 1fr 64px;
    gap: 14px;
    padding: 40px 24px 16px;
    border: 1px solid #294254;
    border-radius: 6px;
    background: #071017;
  }

  .macro-knob {
    display: grid;
    justify-items: center;
    gap: 8px;
  }

  .macro-knob strong { font-size: 14px; }
  .macro-knob em { color: #E6F0F7; font-size: 18px; font-style: normal; font-weight: 900; }

  .dial {
    width: 128px;
    height: 128px;
    border-radius: 50%;
    background: conic-gradient(from 220deg, #22B9F3 calc(var(--value) * 270deg), #263846 0 270deg, transparent 0);
    box-shadow: inset 0 0 0 12px #071017, 0 0 0 4px #020A0E, 0 0 0 8px #233A4A;
  }

  .macro-slider {
    grid-column: 1 / -1;
    display: grid;
    grid-template-columns: 80px 1fr 42px;
    align-items: center;
    gap: 8px;
    color: #DCE8F0;
  }

  .macro-slider input { height: auto; padding: 0; }

  .event-injector {
    display: grid;
    grid-template-columns: repeat(4, minmax(90px, 1fr)) auto auto;
    gap: 10px;
    align-items: end;
    padding: 10px;
    border: 1px solid #294254;
    border-radius: 6px;
  }

  .fire-count {
    align-self: center;
    color: #5FBFEA;
    font: 11px/1 Consolas, monospace;
    font-weight: 900;
  }

  .event-injector .panel-title {
    grid-column: 1 / -1;
    margin: -10px -10px 0;
  }

  .preview-debug {
    display: grid;
    grid-template-rows: 34px 260px 230px minmax(0, 1fr);
    gap: 10px;
    min-height: 0;
  }

  .debugger-toolbar {
    padding: 5px 8px;
  }

  .debugger-toolbar span {
    color: #9FB0BC;
    font-size: 11px;
    font-weight: 800;
  }

  .debug-step {
    display: grid;
    grid-template-columns: 26px 90px minmax(0, 1fr);
    gap: 6px;
    align-items: center;
    padding: 6px 8px;
    border-bottom: 1px solid #233B4E;
    color: #A9BBC7;
    font-size: 11px;
  }

  .debug-step.active {
    background: rgba(16, 168, 232, 0.16);
    color: #EAF7FF;
  }

  .debug-step button {
    width: 22px;
    height: 22px;
    padding: 0;
    color: #FFC547;
  }

  .debug-step em {
    overflow: hidden;
    font-style: normal;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .preview-details {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 10px;
    min-height: 0;
  }

  .trace-panel {
    padding: 0 0 8px;
    overflow: auto;
  }

  .trace-line {
    display: grid;
    grid-template-columns: 94px 62px minmax(0, 1fr);
    gap: 10px;
    padding: 6px 10px;
    color: #9FB0BC;
    font: 11px/1.35 Consolas, monospace;
  }

  .trace-line strong { color: #22D2FF; }
  .trace-line em { color: #DCE8F0; font-style: normal; }

  .export-review {
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 12px;
  }

  .export-layout {
    flex: 1;
    display: grid;
    grid-template-columns: 320px minmax(0, 1fr);
    gap: 10px;
    min-height: 0;
  }

  .export-layout aside,
  .export-layout section,
  .export-warnings {
    border: 1px solid #294254;
    border-radius: 6px;
    overflow: auto;
  }

  .export-layout aside {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 10px;
  }

  .export-layout aside .panel-title,
  .export-layout section .panel-title,
  .export-warnings .panel-title { margin: 0; }

  .export-layout section {
    display: flex;
    flex-direction: column;
  }

  .export-meta {
    display: grid;
    gap: 4px;
    padding: 8px 12px;
    border-bottom: 1px solid #294254;
    color: #93A8B8;
    font-size: 11px;
  }

  .export-layout pre {
    flex: 1;
    color: #E2E8F0;
  }

  .export-warnings {
    min-height: 90px;
    display: grid;
    align-content: start;
    gap: 6px;
    padding-bottom: 8px;
  }

  .export-warnings span {
    padding: 0 12px;
    color: #EAC35A;
    font-size: 12px;
  }

  .diehard-shell {
    flex: 1;
    display: grid;
    grid-template-columns: 280px minmax(0, 1fr) 460px;
    grid-template-rows: minmax(0, 1fr) 230px;
    gap: 10px;
    padding: 10px;
    min-height: 0;
    box-sizing: border-box;
    background: #050B11;
  }

  .code-shell {
    display: flex;
    flex-direction: column;
  }

  .code-tabs {
    flex: 0 0 34px;
    align-items: center;
    padding: 4px 8px;
    border-bottom: 1px solid #1B3445;
    background: #0C1720;
  }

  .code-editor {
    flex: 1;
    padding-left: 42px;
    color: #D5E2EA;
    background:
      linear-gradient(90deg, #0A1119 0 38px, #163043 38px 39px, transparent 39px),
      repeating-linear-gradient(#0B141D 0 28px, #0F1A25 28px 56px);
    font-size: 13px;
  }

  .api-panel {
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 10px;
  }

  .api-panel .panel-title { margin: -10px -10px 0; }

  .info-grid,
  .api-list,
  .guardrails,
  .matrix-small,
  .outline {
    display: grid;
    gap: 5px;
    padding: 10px;
    border: 1px solid #172C3B;
    border-radius: 5px;
    background: #0B151E;
    color: #91A4B1;
    font: 11px/1.35 Consolas, monospace;
  }

  .info-grid {
    grid-template-columns: 70px 1fr;
  }

  .api-list strong,
  .guardrails strong,
  .matrix-small strong,
  .outline strong { color: #DCE8F0; font-family: Inter, sans-serif; text-transform: uppercase; }

  .guardrails span,
  .matrix-small {
    grid-template-columns: 1fr auto;
  }

  .guardrails em,
  .matrix-small em {
    padding: 1px 5px;
    border: 1px solid #248F4A;
    border-radius: 999px;
    color: #5AE27D;
    font-style: normal;
  }

  .tree-group {
    display: grid;
    gap: 4px;
  }

  .tree-heading {
    color: #B7C8D3;
    font-size: 11px;
    font-weight: 800;
  }

  .outline {
    margin-top: auto;
  }

  .debug-bottom {
    grid-column: 1 / -1;
    display: grid;
    grid-template-columns: 1fr 1fr 1.3fr;
    gap: 10px;
    min-height: 0;
  }

  .test-runner,
  .generated-graph {
    display: flex;
    flex-direction: column;
  }

  .test-runner span {
    padding: 3px 10px;
    color: #68E58B;
    font: 11px/1.35 Consolas, monospace;
  }

  .test-runner strong {
    margin-top: 8px;
    padding: 0 10px;
    color: #91FFC1;
    font: 11px/1.35 Consolas, monospace;
  }

  .generated-graph pre {
    flex: 1;
    color: #D8E7EF;
    font-size: 10px;
  }

  .script-empty {
    display: grid;
    place-items: center;
    flex: 1;
    color: #91A4B1;
  }
</style>
