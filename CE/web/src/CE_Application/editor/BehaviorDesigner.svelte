<script>
  // BehaviorDesigner — the stable single-frame scripting editor (replaces the 10-mode
  // ScriptWorkspace). Cloned from the DPD shell: fixed frame, nav-rail by lifecycle,
  // screens via display:none/.active, list -> detail. Spec: tools/docs/panel-api-spec.md.
  import './behaviorDesigner.css';
  import { onMount, untrack } from 'svelte';
  import ScriptPicker from './ScriptPicker.svelte';
  import CodeEditor from './CodeEditor.svelte';
  import ScriptConsole from './ScriptConsole.svelte';
  import { createScript, normalizeSourceScript, defaultSource } from '../scripting/scriptModel.js';
  import { validateScript } from '../scripting/scriptValidate.js';
  import { searchScripts } from '../scripting/scriptSearch.js';
  import { filenameForScript, scriptOverridesFromFile, inferEventFromSource } from '../scripting/scriptFileIo.js';
  import { recordVersion, getVersions, clearVersions } from '../utils/scriptHistory.js';
  import { addScriptTrace } from '../stores/scriptConsole.js';
  import { scriptLibrary, saveToLibrary, removeFromLibrary } from '../stores/scriptLibrary.js';
  import { runScript, initPanelRuntime, setLiveScripts, setLiveEnabled, readWatch } from '../scripting/panelRuntime.js';
  import { ensureTs, transpileTs } from '../scripting/tsService.js';
  import {
    SCRIPT_LANGUAGES,
    SCRIPT_SCOPES,
    LIFECYCLE_HOOKS,
    CONTROL_EVENTS,
    PANEL_EVENTS,
    DEVICE_EVENTS,
  } from '../scripting/panelApi.js';

  // controls = the live panel's component tree (for the path picker).
  // initialScripts = the panel's existing scripts (empty for a fresh panel; the debug route
  // passes a demo set). Real persistence back to the panel model is follow-on wiring.
  let { panelName = 'Untitled Panel', panelId = null, controls = [], initialScripts = [], onChange = null } = $props();

  let codeEditor = $state(null);   // the CodeEditor instance, for insert-at-cursor
  // Right-hand docked panel: one column with Insert / Library / History tabs (default open).
  let showDock = $state(true);
  let dockTab = $state('insert'); // 'insert' | 'library' | 'history'
  let narrow = $state(false);     // viewport too narrow to dock inline → float the dock as an overlay
  function openDock(tab) { if (showDock && dockTab === tab) { showDock = false; } else { showDock = true; dockTab = tab; } }
  let showConsole = $state(false); // inline output console under the editor
  let historyTick = $state(0);     // bump to refresh the version list after a save
  let versions = $derived.by(() => { historyTick; return selectedId ? getVersions(selectedId) : []; });

  function restoreVersion(source) {
    if (selected) { selected.source = source; }
  }
  function fmtTime(t) {
    try { return new Date(t).toLocaleString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit', month: 'short', day: 'numeric' }); }
    catch { return String(t); }
  }

  // --- line breakpoints (persisted per script across sessions) ---
  const BP_KEY = 'ce-breakpoints';
  function loadBreakpoints() { try { return JSON.parse(localStorage.getItem(BP_KEY) || '{}') || {}; } catch { return {}; } }
  let breakpointsByScript = $state(loadBreakpoints());
  function setBreakpoints(id, lines) {
    breakpointsByScript = { ...breakpointsByScript, [id]: lines };
    try { localStorage.setItem(BP_KEY, JSON.stringify(breakpointsByScript)); } catch { /* ignore */ }
  }

  // Run a script and reveal the console so its output is visible where it ran.
  function runAndShow(script) {
    showConsole = true;
    const bps = breakpointsByScript[script.id];
    if (bps && bps.length) {
      addScriptTrace('trace', script.id,
        `▣ Breakpoint${bps.length > 1 ? 's' : ''} on line ${bps.join(', ')} — the web runtime runs to completion; line-pause/step lands with the host debugger.`);
    }
    runScript(script);
  }

  async function insertAtCursor(text) {
    if (!selected) return;
    if (codeEditor) { await codeEditor.insert(text); return; }
    // Fallback (editor not mounted): append to the source.
    selected.source = selected.source + text;
  }

  // Which lifecycle group an event belongs to — drives nav grouping ONLY. This is a
  // display bucket; it has no effect on dispatch. The host fires each hook by name
  // (onPanelLoad/onPanelReady/onPanelClose/onDawSaveState/onDawRestoreState) regardless
  // of which group it's shown under, so DAW save/restore stay handled correctly here.
  // The four real moments are kept distinct, in runtime order: startup → ready → runtime → shutdown.
  const DAW_STATE = new Set(['onDawSaveState', 'onDawRestoreState']);
  function screenOf(event) {
    if (event === 'onPanelLoad') return 'startup';   // Phase 1 — before the GUI exists
    if (event === 'onPanelReady') return 'ready';    // Phase 2 — GUI built, fill controls
    if (event === 'onPanelClose') return 'shutdown'; // Phase 4 — really closing
    if (DAW_STATE.has(event)) return 'dawstate';     // host-driven save/restore (any time)
    return 'runtime';                                // Phase 3 — during use (events)
  }

  // Event options for the detail <select>, grouped.
  const EVENT_GROUPS = [
    { group: 'Lifecycle', items: LIFECYCLE_HOOKS.map((h) => h.id) },
    { group: 'Control', items: CONTROL_EVENTS.map((e) => e.fn) },
    { group: 'Panel', items: PANEL_EVENTS.map((e) => e.fn) },
    { group: 'Device', items: DEVICE_EVENTS.map((e) => e.fn) },
  ];

  // Seed once from the props/initial state; these are deliberately initial-only.
  let scripts = $state(untrack(() => (initialScripts ?? []).map((s) => normalizeSourceScript(s))));

  let mainView = $state('editor');   // what fills the stage: 'editor' | 'test'
  let expanded = $state(new Set(['startup', 'ready', 'runtime', 'shutdown', 'dawstate'])); // expanded tree groups
  function toggleExpand(id) { const n = new Set(expanded); n.has(id) ? n.delete(id) : n.add(id); expanded = n; }
  function expand(id) { if (!expanded.has(id)) { const n = new Set(expanded); n.add(id); expanded = n; } }
  let selectedId = $state(untrack(() => scripts[0]?.id ?? null));

  let selected = $derived(scripts.find((s) => s.id === selectedId) ?? null);
  let selectedLangMeta = $derived(selected ? SCRIPT_LANGUAGES.find((l) => l.id === selected.language) ?? null : null);
  // Real syntax errors from the editor's parser (acorn/luaparse), reported live.
  let liveDiagnostics = $state([]);
  let problems = $derived([
    ...liveDiagnostics.map((d) => ({ severity: 'error', message: `Line ${d.line}: ${d.message}` })),
    ...(selected ? validateScript(selected) : []),
  ]);

  // Target attachment: the panel's control names, plus the "Any control" wildcard. A legacy
  // 'self' target (the old component-scope default) reads as the wildcard here.
  let controlNames = $derived((controls ?? []).map((c) => c.name).filter(Boolean));
  let targetValue = $derived(selected ? (selected.target === 'self' || !selected.target ? '*' : selected.target) : '*');

  // --- cross-script search (spans every lifecycle group) ---
  let searchQuery = $state('');
  let searchResults = $derived(searchScripts(scripts, searchQuery));
  function openResult(id) {
    const s = scripts.find((x) => x.id === id);
    if (!s) return;
    selectedId = id;
    mainView = 'editor';
  }

  // --- inline rename ---
  let renamingId = $state(null);
  let renameValue = $state('');
  function startRename(s) { renamingId = s.id; renameValue = s.name; foldering = null; }
  function commitRename() {
    const s = scripts.find((x) => x.id === renamingId);
    if (s && renameValue.trim()) s.name = renameValue.trim();
    renamingId = null;
  }
  function cancelRename() { renamingId = null; }

  // --- folders (scoped per lifecycle) -------------------------------------------------
  // A folder is identified by (lifecycle, name). A script's lifecycle is DERIVED from its
  // event (screenOf), so a folder only ever sub-groups scripts already in that lifecycle —
  // you can't drag a Shutdown script into a Startup folder. Non-empty folders are implied
  // by each script's `group`; EMPTY folders are remembered in a per-panel registry so they
  // persist (kept in localStorage — empty folders are an editing convenience, so they don't
  // travel with the exported document the way `group` labels on real scripts do).
  const LIFECYCLES = ['startup', 'ready', 'runtime', 'dawstate', 'shutdown'];
  const panelKey = String(panelId ?? 'debug');
  const FOLDERS_KEY = 'ce-script-folders';
  function loadFolderReg() {
    const reg = {}; for (const lc of LIFECYCLES) reg[lc] = [];
    try {
      const mine = (JSON.parse(localStorage.getItem(FOLDERS_KEY) || '{}'))[panelKey] || {};
      for (const lc of LIFECYCLES) if (Array.isArray(mine[lc])) reg[lc] = mine[lc].map(String);
    } catch { /* defaults */ }
    return reg;
  }
  let folderReg = $state(loadFolderReg());
  function saveFolderReg() {
    try {
      const all = JSON.parse(localStorage.getItem(FOLDERS_KEY) || '{}');
      all[panelKey] = folderReg;
      localStorage.setItem(FOLDERS_KEY, JSON.stringify(all));
    } catch { /* best-effort */ }
  }

  // All folder names anywhere (for the detail-panel datalist).
  let folderNames = $derived.by(() => {
    const set = new Set();
    for (const lc of LIFECYCLES) for (const n of folderReg[lc] ?? []) set.add(n);
    for (const s of scripts) { const g = (s.group ?? '').trim(); if (g) set.add(g); }
    return [...set];
  });

  // Folders shown under a lifecycle = registry ∪ folders implied by its scripts.
  function foldersIn(lc, nodeScripts) {
    const names = new Set(folderReg[lc] ?? []);
    for (const s of nodeScripts) { const g = (s.group ?? '').trim(); if (g) names.add(g); }
    return [...names].sort((a, b) => a.localeCompare(b));
  }
  function ungroupedIn(nodeScripts) { return nodeScripts.filter((s) => !(s.group ?? '').trim()); }
  function scriptsInFolder(nodeScripts, name) { return nodeScripts.filter((s) => (s.group ?? '').trim() === name); }

  // Keep the registry in sync: any folder a script references is remembered, so it survives
  // (as an empty folder) if that script later leaves or is deleted. Single registration point.
  $effect(() => {
    let changed = false; const next = { ...folderReg };
    for (const s of scripts) {
      const g = (s.group ?? '').trim(); if (!g) continue;
      const lc = screenOf(s.event);
      if (!next[lc].includes(g)) { next[lc] = [...next[lc], g]; changed = true; }
    }
    if (changed) { folderReg = next; saveFolderReg(); }
  });

  // Folder collapse state (default = expanded; track only the collapsed ones).
  let collapsedFolders = $state(new Set());
  function folderKey(lc, name) { return lc + '::' + name; }
  function toggleFolder(lc, name) {
    const k = folderKey(lc, name); const n = new Set(collapsedFolders);
    n.has(k) ? n.delete(k) : n.add(k); collapsedFolders = n;
  }

  function addFolder(lc) {
    const taken = new Set(foldersIn(lc, scripts.filter((s) => screenOf(s.event) === lc)));
    let name = 'New folder', i = 2; while (taken.has(name)) name = 'New folder ' + i++;
    folderReg = { ...folderReg, [lc]: [...(folderReg[lc] ?? []), name] };
    saveFolderReg();
    expand(lc);
    startFolderRename(lc, name); // let the user name it immediately
  }
  function deleteFolder(lc, name) {
    if (!confirm('Delete folder “' + name + '”? Its scripts move to ungrouped (they are NOT deleted).')) return;
    folderReg = { ...folderReg, [lc]: (folderReg[lc] ?? []).filter((n) => n !== name) };
    for (const s of scripts) if (screenOf(s.event) === lc && (s.group ?? '').trim() === name) s.group = '';
    saveFolderReg();
  }

  // Inline rename of a folder header.
  let folderRenaming = $state(null); // { lc, name }
  let folderRenameValue = $state('');
  function startFolderRename(lc, name) { folderRenaming = { lc, name }; folderRenameValue = name; }
  function commitFolderRename() {
    if (!folderRenaming) return;
    const { lc, name } = folderRenaming; const next = folderRenameValue.trim();
    folderRenaming = null;
    if (!next || next === name) return;
    folderReg = { ...folderReg, [lc]: [...new Set((folderReg[lc] ?? []).map((n) => (n === name ? next : n)))] };
    for (const s of scripts) if (screenOf(s.event) === lc && (s.group ?? '').trim() === name) s.group = next;
    saveFolderReg();
  }
  function cancelFolderRename() { folderRenaming = null; }

  // Inline "move to folder" on a single script row (keyboard-friendly alternative to drag).
  let foldering = $state(null);
  let folderValue = $state('');
  function startFolder(s) { foldering = s.id; folderValue = s.group ?? ''; renamingId = null; }
  function commitFolder() {
    const s = scripts.find((x) => x.id === foldering);
    if (s) s.group = folderValue.trim(); // registry stays in sync via the $effect above
    foldering = null;
  }
  function cancelFolder() { foldering = null; }

  // --- drag a script into a folder (within its lifecycle only) ---
  let dragId = $state(null);     // script being dragged
  let dragLc = $state(null);     // its lifecycle — drops are only offered here
  let dropTarget = $state(null); // folderKey currently hovered (drives the highlight)
  function onDragStart(s, e) {
    dragId = s.id; dragLc = screenOf(s.event);
    try { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', s.id); } catch { /* ignore */ }
  }
  function onDragEnd() { dragId = null; dragLc = null; dropTarget = null; }
  function onDropZoneOver(lc, name, e) {
    if (dragId == null || lc !== dragLc) return; // cross-lifecycle drops are not allowed
    e.preventDefault(); e.stopPropagation();
    e.dataTransfer.dropEffect = 'move';
    dropTarget = folderKey(lc, name);
  }
  function onDropZoneLeave(lc, name) { if (dropTarget === folderKey(lc, name)) dropTarget = null; }
  function onDropZoneDrop(lc, name, e) {
    if (dragId == null || lc !== dragLc) return;
    e.preventDefault(); e.stopPropagation();
    const s = scripts.find((x) => x.id === dragId);
    if (s) s.group = name; // '' = ungrouped
    onDragEnd();
  }

  // Expand / collapse everything.
  function expandAll() { expanded = new Set(LIFECYCLES); collapsedFolders = new Set(); }
  function collapseAll() { expanded = new Set(); }

  // --- Test / Trace screen state ---
  let allProblems = $derived(scripts.flatMap((s) => validateScript(s).map((p) => ({ ...p, script: s.name }))));
  let breakpoints = $state([]);              // { path, op, value } — "run until"; runtime enforces (later)
  let bpPath = $state(''); let bpOp = $state('>'); let bpValue = $state('');
  let watchPaths = $state([]); let watchInput = $state('');
  function addBreakpoint() { if (bpPath.trim()) { breakpoints = [...breakpoints, { path: bpPath.trim(), op: bpOp, value: bpValue }]; bpPath = ''; bpValue = ''; } }
  function removeBreakpoint(i) { breakpoints = breakpoints.filter((_, n) => n !== i); }
  function addWatch() { if (watchInput.trim()) { watchPaths = [...watchPaths, watchInput.trim()]; watchInput = ''; } }
  function removeWatch(i) { watchPaths = watchPaths.filter((_, n) => n !== i); }

  // Live watch values — poll the runtime while the Test/Trace screen is open (variable inspection).
  let watchValues = $state({});
  function refreshWatches() {
    const next = {};
    for (const p of watchPaths) next[p] = readWatch(p);
    watchValues = next;
  }
  function fmtWatch(v) {
    if (v === undefined) return '—';
    if (typeof v === 'number') return Number.isInteger(v) ? String(v) : v.toFixed(3);
    if (typeof v === 'object') { try { return JSON.stringify(v); } catch { return String(v); } }
    return String(v);
  }
  $effect(() => {
    if (mainView !== 'test' || watchPaths.length === 0) return;
    refreshWatches();
    const id = setInterval(refreshWatches, 500);
    return () => clearInterval(id);
  });

  // TypeScript ships through the C++ host's JS engine (it has no TS compiler), so every saved
  // snapshot must carry the transpiled JS on each TS script's `compiledJs`. transpileTs is
  // synchronous once the compiler chunk is loaded; we kick the lazy load and re-run when ready.
  let tsLoadTick = $state(0);
  const tsCompiledFrom = new Map(); // scriptId -> source last transpiled (skip redundant work; off-snapshot)
  // Best-effort synchronous pass: writes compiledJs for any TS script whose source changed.
  // Returns true if at least one script still needs the (not-yet-loaded) compiler.
  function syncCompileTs() {
    let needsCompiler = false;
    for (const s of scripts) {
      if (s.language !== 'typescript') {
        if (s.compiledJs != null) s.compiledJs = undefined; // language switched away from TS
        tsCompiledFrom.delete(s.id);
        continue;
      }
      if (tsCompiledFrom.get(s.id) === s.source && typeof s.compiledJs === 'string') continue;
      const out = transpileTs(s.source);
      if (out == null) { needsCompiler = true; continue; } // compiler not loaded yet
      s.compiledJs = out;
      tsCompiledFrom.set(s.id, s.source);
    }
    return needsCompiler;
  }
  // Keep compiledJs current as TS sources change. untrack() so writing compiledJs here doesn't
  // re-fire THIS effect; the source/tick reads above are what re-run it.
  $effect(() => {
    tsLoadTick; // re-run after the compiler finishes loading
    for (const s of scripts) { s.language; s.source; } // track language + source of every script
    const needsCompiler = untrack(() => syncCompileTs());
    if (needsCompiler) ensureTs().then((m) => { if (m) tsLoadTick++; });
  });

  // Persist to the panel (debounced) whenever any script changes — add/edit/rename/folder/delete.
  // saveState drives the footer indicator: 'saved' (clean) | 'pending' (edited, not yet flushed).
  let saveTimer = null;
  let saveState = $state('saved');
  let firstSnapshot = true;
  let pendingSnap = null;
  $effect(() => {
    const snap = $state.snapshot(scripts); // deep-reads scripts so the effect tracks every change
    pendingSnap = snap;
    if (firstSnapshot) { firstSnapshot = false; return; } // initial seed isn't an edit
    saveState = 'pending';
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      onChange?.(pendingSnap);
      saveState = 'saved';
      const s = scripts.find((x) => x.id === selectedId);
      if (s) { recordVersion(s.id, s.source); historyTick++; } // coalesces internally
    }, 400);
  });
  function saveNow() {
    clearTimeout(saveTimer);
    syncCompileTs(); // make sure the manual save captures the latest transpiled TS, if compiler is loaded
    const snap = $state.snapshot(scripts);
    pendingSnap = snap;
    onChange?.(snap);
    saveState = 'saved';
  }

  // Cursor position reported by the code editor, shown in the footer.
  let caret = $state({ line: 1, col: 1 });

  // --- Live dispatch: scripts fire on their own (value change, preview interaction, lifecycle). ---
  // Dispatch is global/always-on; here we just push the in-edit scripts as a live override so
  // changes take effect instantly (before the debounced save), and clear it on unmount.
  let liveOn = $state(true);
  onMount(() => {
    initPanelRuntime();
    // Below this width the dock floats over the editor instead of squeezing it, and
    // starts collapsed so it never hides the code on a narrow window.
    const mq = window.matchMedia('(max-width: 1180px)');
    const applyNarrow = () => { narrow = mq.matches; if (narrow) showDock = false; };
    applyNarrow();
    mq.addEventListener('change', applyNarrow);
    return () => { setLiveScripts(null); mq.removeEventListener('change', applyNarrow); };
  });
  $effect(() => { setLiveScripts($state.snapshot(scripts), panelId); });
  $effect(() => { setLiveEnabled(liveOn); });

  let startupScripts = $derived(scripts.filter((s) => screenOf(s.event) === 'startup'));
  let readyScripts = $derived(scripts.filter((s) => screenOf(s.event) === 'ready'));
  let runtimeScripts = $derived(scripts.filter((s) => screenOf(s.event) === 'runtime'));
  let shutdownScripts = $derived(scripts.filter((s) => screenOf(s.event) === 'shutdown'));
  let dawStateScripts = $derived(scripts.filter((s) => screenOf(s.event) === 'dawstate'));
  let enabledCount = $derived(scripts.filter((s) => s.enabled).length);

  // Lifecycle groups for the Scripts tree — each expands to its scripts; "+ New" on a group
  // creates a script already set to that group's event/scope. Listed in runtime order.
  let startupNode = $derived({ id: 'startup', icon: '▸', label: 'Startup', event: 'onPanelLoad', scope: 'panel', scripts: startupScripts });
  let readyNode = $derived({ id: 'ready', icon: '◆', label: 'Ready', event: 'onPanelReady', scope: 'panel', scripts: readyScripts });
  let runtimeNode = $derived({ id: 'runtime', icon: '⚡', label: 'Runtime', event: 'onValueChanged', scope: 'component', scripts: runtimeScripts });
  let dawStateNode = $derived({ id: 'dawstate', icon: '▦', label: 'DAW state', event: 'onDawSaveState', scope: 'panel', scripts: dawStateScripts });
  let shutdownNode = $derived({ id: 'shutdown', icon: '◾', label: 'Shutdown', event: 'onPanelClose', scope: 'panel', scripts: shutdownScripts });

  // Per-language tag (short label + color class). Add new languages here as they land.
  function langClass(id) {
    if (id === 'javascript') return 'js';
    if (id === 'typescript') return 'ts';
    if (id === 'python') return 'py';
    if (id === 'cpp' || id === 'c++') return 'cpp';
    if (id === 'csharp' || id === 'cs') return 'cs';
    if (id === 'java') return 'java';
    return 'lua';
  }
  function langLabel(id) {
    if (id === 'javascript') return 'JS';
    if (id === 'typescript') return 'TS';
    if (id === 'python') return 'Py';
    if (id === 'cpp' || id === 'c++') return 'C++';
    if (id === 'csharp' || id === 'cs') return 'C#';
    if (id === 'java') return 'Java';
    return 'Lua';
  }

  function selectScript(id) { selectedId = id; mainView = 'editor'; }

  function addScript(event, scope) {
    const s = createScript({ event, scope, language: selected?.language ?? 'lua', name: 'New ' + event });
    scripts = [...scripts, s];
    selectedId = s.id;
    expand(screenOf(event));
    mainView = 'editor';
  }

  function updateField(key, value) {
    const s = scripts.find((x) => x.id === selectedId);
    if (s) s[key] = value;
  }

  // True when the source is still the untouched starter skeleton for (event, language).
  function isDefaultSource(s) {
    const src = (s.source ?? '').trim();
    return !src || src === defaultSource(s.event, s.language).trim();
  }

  // Changing language: migrate an untouched skeleton silently; otherwise offer to regenerate
  // (the old code is in another language, so the editor would mis-highlight / mis-run it).
  function updateLanguage(newLang) {
    const s = scripts.find((x) => x.id === selectedId);
    if (!s || newLang === s.language) return;
    const wasDefault = isDefaultSource(s);
    const old = s.language;
    s.language = newLang;
    if (wasDefault) { s.source = defaultSource(s.event, newLang); return; }
    if (confirm(`Switched to ${langLabel(newLang)}. Replace the body with a fresh ${langLabel(newLang)} skeleton? Your current code is written in ${langLabel(old)}.`)) {
      s.source = defaultSource(s.event, newLang);
    }
  }

  // Changing event: if the body is still the default skeleton, re-key it to the new handler.
  function updateEvent(newEvent) {
    const s = scripts.find((x) => x.id === selectedId);
    if (!s || newEvent === s.event) return;
    const wasDefault = isDefaultSource(s);
    s.event = newEvent;
    if (wasDefault) s.source = defaultSource(newEvent, s.language);
  }

  function regenerateSkeleton() {
    const s = scripts.find((x) => x.id === selectedId);
    if (s) s.source = defaultSource(s.event, s.language);
  }

  function duplicateSelected() {
    if (!selected) return;
    const copy = createScript({ ...$state.snapshot(selected), id: undefined, name: selected.name + ' copy' });
    const idx = scripts.findIndex((x) => x.id === selectedId);
    scripts = [...scripts.slice(0, idx + 1), copy, ...scripts.slice(idx + 1)];
    selectedId = copy.id;
  }

  function toggleEnabled(s) { s.enabled = !s.enabled; }

  function deleteScript(id) {
    const idx = scripts.findIndex((x) => x.id === id);
    if (idx === -1) return;
    scripts = scripts.filter((x) => x.id !== id);
    if (selectedId === id) selectedId = scripts[Math.max(0, idx - 1)]?.id ?? null;
  }
  function deleteSelected() { if (selected) deleteScript(selectedId); }

  // Worst problem severity per script, for the badge on each tree row.
  let problemSevByScript = $derived.by(() => {
    const m = {};
    for (const s of scripts) {
      const ps = validateScript(s);
      if (ps.some((p) => p.severity === 'error')) m[s.id] = 'error';
      else if (ps.some((p) => p.severity === 'warn')) m[s.id] = 'warn';
    }
    return m;
  });

  // --- Reusable script library (copy-on-import) ---
  function saveSelectedToLibrary() { if (selected) saveToLibrary($state.snapshot(selected)); }
  function importFromLibrary(entry) {
    // createScript mints a fresh id, so the imported script is an independent copy (portable).
    const s = createScript({
      name: entry.name, language: entry.language, event: entry.event,
      scope: entry.scope, source: entry.source, group: entry.group,
    });
    scripts = [...scripts, s];
    selectedId = s.id;
    expand(screenOf(entry.event));
    mainView = 'editor';
  }

  // --- File I/O: load/save a single script as a file on disk ---
  let fileInputEl = $state(null);
  // Every handler name the importer can recognise, so a loaded file opens on the right screen.
  const KNOWN_EVENT_NAMES = [
    ...LIFECYCLE_HOOKS.map((h) => h.id),
    ...CONTROL_EVENTS.map((e) => e.fn),
    ...PANEL_EVENTS.map((e) => e.fn),
    ...DEVICE_EVENTS.map((e) => e.fn),
  ];

  function exportScriptFile() {
    if (!selected) return;
    const blob = new Blob([selected.source ?? ''], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filenameForScript(selected);
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }

  async function importScriptFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    const overrides = scriptOverridesFromFile(file.name, text, selected?.language ?? 'lua');
    const event = inferEventFromSource(text, KNOWN_EVENT_NAMES) ?? 'onValueChanged';
    const s = createScript({ ...overrides, event });
    scripts = [...scripts, s];
    selectedId = s.id;
    expand(screenOf(event));
    mainView = 'editor';
    e.target.value = ''; // let the same file be re-imported
  }
</script>

{#snippet detailPanel()}
  <div class="detail">
    {#if selected}
      <div class="row2">
        <div class="field">
          <label for="bd-name">Name</label>
          <input id="bd-name" value={selected.name} onfocus={(e) => e.target.select()}
            oninput={(e) => updateField('name', e.target.value)} />
        </div>
        <div class="field">
          <label for="bd-event">Runs on (event / lifecycle)</label>
          <select id="bd-event" value={selected.event} onchange={(e) => updateEvent(e.target.value)}>
            {#each EVENT_GROUPS as g (g.group)}
              <optgroup label={g.group}>
                {#each g.items as ev (ev)}<option value={ev}>{ev}</option>{/each}
              </optgroup>
            {/each}
          </select>
        </div>
      </div>
      <div class="row2">
        {#if selected.scope === 'component'}
          <div class="field">
            <label for="bd-target">Attached control</label>
            <select id="bd-target" value={targetValue} onchange={(e) => updateField('target', e.target.value)}
              title="Which control this script reacts to. 'self' inside the script resolves to it.">
              <option value="*">Any control</option>
              {#each controlNames as name (name)}<option value={name}>{name}</option>{/each}
            </select>
          </div>
        {/if}
        <div class="field">
          <label for="bd-scope">Scope</label>
          <select id="bd-scope" value={selected.scope} onchange={(e) => updateField('scope', e.target.value)}>
            {#each SCRIPT_SCOPES as sc (sc)}<option value={sc}>{sc}</option>{/each}
          </select>
        </div>
        <div class="field">
          <label for="bd-lang">Language</label>
          <select id="bd-lang" value={selected.language} onchange={(e) => updateLanguage(e.target.value)}>
            {#each SCRIPT_LANGUAGES as l (l.id)}<option value={l.id}>{l.label} {l.version}{l.live ? '' : ' — preview'}</option>{/each}
          </select>
        </div>
      </div>
      <div class="codehead">
        <span class="lang">
          {langLabel(selected.language)} source
          {#if selectedLangMeta && !selectedLangMeta.live}
            <span class="previewtag" title="This language runs in the WebView preview only — it does not execute live yet, and won't run in the shipped C++ runtime.">preview · not live</span>
          {:else if selectedLangMeta?.subset}
            <span class="previewtag" title="C++ runs live here through an interpreted subset (the panel-API surface). The full C++ source is compiled into the exported plugin.">interpreted subset</span>
          {/if}
        </span>
        <span style="display:flex;gap:6px">
          <button class="btn primary" onclick={() => runAndShow(selected)} title="Run this script now against the live panel">▶ Run</button>
          <button class={['btn', 'ghost', showDock && dockTab === 'insert' && 'primary']} onclick={() => openDock('insert')} title="Insert · API reference (docked right)">+ Insert</button>
          <button class={['btn', 'ghost', showDock && dockTab === 'library' && 'primary']} onclick={() => openDock('library')} title="Reusable script library (docked right)">📚 Library</button>
          <button class={['btn', 'ghost', showDock && dockTab === 'history' && 'primary']} onclick={() => openDock('history')} title="Version history (docked right)">🕘 History</button>
          <button class="btn ghost" onclick={regenerateSkeleton} title="Replace with a fresh skeleton">↺ skeleton</button>
        </span>
      </div>
      <!-- Keyed by script id: switching functions auto-saves (debounced persist) and
           presents the next function in a fresh editor. No unsaved-changes prompt is
           needed because every edit is already captured in `scripts`. -->
      {#key selectedId}
        <CodeEditor bind:this={codeEditor} minHeight={140} language={selected.language} value={selected.source}
          oninput={(v) => updateField('source', v)} onrun={() => runAndShow(selected)}
          oncaret={(line, col) => caret = { line, col }}
          ondiagnostics={(d) => liveDiagnostics = d}
          breakpoints={breakpointsByScript[selectedId] ?? []}
          onbreakpoints={(lines) => setBreakpoints(selectedId, lines)} />
      {/key}

      {#if problems.length === 0}
        <div class="problems"><div class="problem ok">✓ No problems</div></div>
      {:else}
        <div class="problems">
          {#each problems as p (p.message)}
            <div class={['problem', p.severity]}>
              <span>{p.severity === 'error' ? '✕' : '!'}</span><span>{p.message}</span>
            </div>
          {/each}
        </div>
      {/if}

      <div class="toolbar" style="margin-top:12px">
        <label style="display:flex;align-items:center;gap:7px;font-size:12px;color:var(--txt-dim)">
          <input type="checkbox" checked={selected.enabled} onchange={(e) => updateField('enabled', e.target.checked)} /> Enabled
        </label>
        <span class="spacer"></span>
        <button class="btn ghost" onclick={duplicateSelected} title="Create a copy of this script">⧉ Duplicate</button>
        <button class="btn ghost" onclick={exportScriptFile} title="Save this script's source to a file on disk">⬇ Export file</button>
        <button class="btn ghost" onclick={saveSelectedToLibrary} title="Save a reusable copy to the library">★ Save to library</button>
        <button class="btn ghost" onclick={deleteSelected} style="color:var(--red)">Delete</button>
      </div>

      <div class="consolewrap">
        <button class="consoletoggle" onclick={() => showConsole = !showConsole}>
          <span class="caret">{showConsole ? '▾' : '▸'}</span> Output console
        </button>
        {#if showConsole}<div class="consolebox"><ScriptConsole compact /></div>{/if}
      </div>
    {:else}
      <p class="sub" style="margin:0">Select a script on the left, or add one.</p>
    {/if}
  </div>
{/snippet}

{#snippet scriptRow(s)}
  <div class={['titem', selectedId === s.id && mainView === 'editor' && 'sel', !s.enabled && 'off']}
    role="button" tabindex="0"
    draggable={renamingId !== s.id && foldering !== s.id}
    ondragstart={(e) => onDragStart(s, e)} ondragend={onDragEnd}
    onclick={() => selectScript(s.id)}
    onkeydown={(e) => (e.key === 'Enter' || e.key === ' ') && selectScript(s.id)}>
    {#if renamingId === s.id}
      <input class="renameinput" value={renameValue}
        oninput={(e) => renameValue = e.target.value}
        onblur={commitRename}
        onclick={(e) => e.stopPropagation()}
        onkeydown={(e) => { if (e.key === 'Enter') { e.preventDefault(); commitRename(); } else if (e.key === 'Escape') cancelRename(); }}
        {@attach (el) => { el.focus(); el.select(); }} />
    {:else if foldering === s.id}
      <input class="renameinput" value={folderValue} list="bd-folders-tree"
        placeholder="Folder name (blank = none)…"
        oninput={(e) => folderValue = e.target.value}
        onblur={commitFolder}
        onclick={(e) => e.stopPropagation()}
        onkeydown={(e) => { if (e.key === 'Enter') { e.preventDefault(); commitFolder(); } else if (e.key === 'Escape') cancelFolder(); }}
        {@attach (el) => { el.focus(); el.select(); }} />
    {:else}
      {#if problemSevByScript[s.id]}
        <span class={['sbadge', problemSevByScript[s.id]]}
          title={problemSevByScript[s.id] === 'error' ? 'Has an error' : 'Has a warning'}>{problemSevByScript[s.id] === 'error' ? '✕' : '!'}</span>
      {/if}
      <span class="sname" role="button" tabindex="0"
        ondblclick={(e) => { e.stopPropagation(); startRename(s); }}
        onkeydown={(e) => { if (e.key === 'F2') { e.stopPropagation(); e.preventDefault(); startRename(s); } }}
        title="Drag to a folder · double-click (or F2) to rename">{s.name}</span>
      <span class={['pill', langClass(s.language)]}>{langLabel(s.language)}</span>
      <button class="titembtn" title={s.enabled ? 'Enabled — click to disable' : 'Disabled — click to enable'}
        onclick={(e) => { e.stopPropagation(); toggleEnabled(s); }}>{s.enabled ? '◉' : '○'}</button>
      <button class="titembtn" title={s.group ? 'Folder: ' + s.group + ' — click to change' : 'Move to a folder…'}
        onclick={(e) => { e.stopPropagation(); startFolder(s); }}>🗀</button>
      <button class="titembtn del" title="Delete script"
        onclick={(e) => { e.stopPropagation(); if (confirm('Delete script “' + s.name + '”?')) deleteScript(s.id); }}>✕</button>
    {/if}
  </div>
{/snippet}

{#snippet treeGroup(node)}
  {@const folders = foldersIn(node.id, node.scripts)}
  {@const ungrouped = ungroupedIn(node.scripts)}
  <div class="treegroup">
    <div class={['tghead', expanded.has(node.id) && 'open']}>
      <button class="tgtoggle" title={node.label}
        onclick={() => toggleExpand(node.id)}>
        <span class="tgcaret">{expanded.has(node.id) ? '▾' : '▸'}</span>
        <span class="ti">{node.icon}</span>
        <span class="tglabel">{node.label}</span>
        {#if node.scripts.length}<span class="ct">{node.scripts.length}</span>{/if}
      </button>
      <button class="tgnew folder" title={'New folder in ' + node.label}
        onclick={() => addFolder(node.id)}>🗀+</button>
      <button class="tgnew" title={'New ' + node.label + ' script (' + node.event + ')'}
        onclick={() => addScript(node.event, node.scope)}>+</button>
    </div>
    {#if expanded.has(node.id)}
      <div class={['tgkids', dropTarget === folderKey(node.id, '') && 'drop']}
        ondragover={(e) => onDropZoneOver(node.id, '', e)}
        ondragleave={() => onDropZoneLeave(node.id, '')}
        ondrop={(e) => onDropZoneDrop(node.id, '', e)}>
        {#if node.scripts.length === 0 && folders.length === 0}
          <div class="tgempty">No scripts — click <b>+</b> to add one, or <b>🗀+</b> for a folder.</div>
        {:else}
          {#each folders as fname (fname)}
            {@const fscripts = scriptsInFolder(node.scripts, fname)}
            {@const open = !collapsedFolders.has(folderKey(node.id, fname))}
            <div class={['tgfolderwrap', dropTarget === folderKey(node.id, fname) && 'drop']}
              ondragover={(e) => onDropZoneOver(node.id, fname, e)}
              ondragleave={() => onDropZoneLeave(node.id, fname)}
              ondrop={(e) => onDropZoneDrop(node.id, fname, e)}>
              <div class="tgfolder">
                {#if folderRenaming && folderRenaming.lc === node.id && folderRenaming.name === fname}
                  <input class="renameinput" value={folderRenameValue} list="bd-folders-tree"
                    oninput={(e) => folderRenameValue = e.target.value}
                    onblur={commitFolderRename}
                    onclick={(e) => e.stopPropagation()}
                    onkeydown={(e) => { if (e.key === 'Enter') { e.preventDefault(); commitFolderRename(); } else if (e.key === 'Escape') cancelFolderRename(); }}
                    {@attach (el) => { el.focus(); el.select(); }} />
                {:else}
                  <button class="tgftoggle" onclick={() => toggleFolder(node.id, fname)}>
                    <span class="tgcaret">{open ? '▾' : '▸'}</span>
                    <span class="fi">🗀</span>
                    <span class="tglabel">{fname}</span>
                    <span class="ct">{fscripts.length}</span>
                  </button>
                  <button class="titembtn" title="Rename folder"
                    onclick={(e) => { e.stopPropagation(); startFolderRename(node.id, fname); }}>✎</button>
                  <button class="titembtn del" title="Delete folder (keeps its scripts)"
                    onclick={(e) => { e.stopPropagation(); deleteFolder(node.id, fname); }}>✕</button>
                {/if}
              </div>
              {#if open}
                <div class="tgfkids">
                  {#each fscripts as s (s.id)}{@render scriptRow(s)}{/each}
                  {#if fscripts.length === 0}<div class="tgempty">Empty — drag scripts here.</div>{/if}
                </div>
              {/if}
            </div>
          {/each}
          {#each ungrouped as s (s.id)}{@render scriptRow(s)}{/each}
        {/if}
      </div>
    {/if}
  </div>
{/snippet}

{#snippet testView()}
  <div class="testview">
    <div class="shead"><h1>Test / Trace</h1></div>
    <p class="sub">Problems across every script (live), plus the trace from the running panel and "run until…" breakpoints.</p>

    <div class="tsection">
      <div class="tshead">Problems <span class="tcount">{allProblems.length}</span></div>
      {#if allProblems.length === 0}
        <div class="problem ok">✓ No problems in {scripts.length} script{scripts.length === 1 ? '' : 's'}</div>
      {:else}
        {#each allProblems as p (p.script + p.message)}
          <div class={['problem', p.severity]}><span>{p.severity === 'error' ? '✕' : '!'}</span><span><b>{p.script}</b> — {p.message}</span></div>
        {/each}
      {/if}
    </div>

    <div class="tsection" style="height:260px;display:flex;flex-direction:column">
      <div class="consolebox" style="flex:1;margin-top:0"><ScriptConsole /></div>
    </div>

    <div class="tsection">
      <div class="tshead">Watch &amp; "run until"</div>
      <p class="sub" style="margin:0 0 10px">Watch control values live (updates ~2×/sec while this screen is open). The "run until" thresholds are honored by the host runtime.</p>
      <div class="bprow">
        <input placeholder="path e.g. cutoff.value" value={bpPath} oninput={(e) => bpPath = e.target.value} onfocus={(e) => e.target.select()} />
        <select value={bpOp} onchange={(e) => bpOp = e.target.value}>
          <option>&gt;</option><option>&lt;</option><option>=</option><option>!=</option>
        </select>
        <input placeholder="value" style="max-width:90px" value={bpValue} oninput={(e) => bpValue = e.target.value} onfocus={(e) => e.target.select()} />
        <button class="btn" onclick={addBreakpoint}>+ Run until</button>
      </div>
      {#each breakpoints as b, i (b.path + b.op + b.value + i)}
        <div class="chip">run until <b>{b.path}</b> {b.op} {b.value} <button onclick={() => removeBreakpoint(i)}>×</button></div>
      {/each}
      <div class="bprow" style="margin-top:10px">
        <input placeholder="watch a path e.g. resonance.value" value={watchInput} oninput={(e) => watchInput = e.target.value} onfocus={(e) => e.target.select()} />
        <button class="btn" onclick={addWatch}>+ Watch</button>
      </div>
      {#each watchPaths as w, i (w + i)}
        <div class="chip"><b>{w}</b> <span style="color:var(--accent)">= {fmtWatch(watchValues[w])}</span> <button onclick={() => removeWatch(i)}>×</button></div>
      {/each}
    </div>
  </div>
{/snippet}

{#snippet dockBody()}
  {#if dockTab === 'insert'}
    <ScriptPicker language={selected.language} scope={selected.scope} {controls} onInsert={insertAtCursor} />
  {:else if dockTab === 'library'}
    <div class="liblist">
      {#if $scriptLibrary.length === 0}
        <div class="pcat" style="padding:12px">No saved scripts yet. Select a script and click <b>★ Save to library</b> (below the editor) to reuse it on any panel.</div>
      {:else}
        {#each $scriptLibrary as e (e.id)}
          <div class="librow">
            <div class="libmeta">
              <span class="sname">{e.name}</span>
              <span class="pd"><span class={['pill', langClass(e.language)]}>{langLabel(e.language)}</span> {e.event}</span>
            </div>
            <span style="display:flex;gap:6px;flex-shrink:0">
              <button class="btn primary" onclick={() => importFromLibrary(e)} title="Add an independent copy to this panel">Import</button>
              <button class="btn ghost" onclick={() => removeFromLibrary(e.id)} title="Remove from library" style="color:var(--red)">✕</button>
            </span>
          </div>
        {/each}
      {/if}
    </div>
  {:else if dockTab === 'history'}
    <div class="liblist">
      {#if versions.length === 0}
        <div class="pcat" style="padding:12px">No saved versions yet. Snapshots are captured automatically as you edit (and persist across sessions). Restore any of them here.</div>
      {:else}
        {#each versions as v, i (v.t)}
          <div class="librow">
            <div class="libmeta">
              <span class="sname">{i === 0 ? 'Latest' : fmtTime(v.t)}</span>
              <span class="pd">{v.source.split('\n').length} lines · {v.source.length} chars</span>
            </div>
            <button class="btn primary" onclick={() => restoreVersion(v.source)} title="Replace the current source with this version">Restore</button>
          </div>
        {/each}
      {/if}
    </div>
  {/if}
{/snippet}

<div class="bd-app">
  <!-- Hidden picker backing the "Import file" buttons. -->
  <input type="file" bind:this={fileInputEl} accept=".lua,.js,.mjs,.cjs,.ts,.tsx,.mts,.py,.cpp,.cc,.cxx,.hpp,.h,.cs,.java,.txt,text/plain"
    style="display:none" onchange={importScriptFile} />
  <div class="titlebar">
    <div class="dots"><span></span><span></span><span></span></div>
    <div class="brand">CEditor</div>
    <div class="crumb">Behavior Designer · <b>{panelName}</b></div>
  </div>

  <div class="body">
    <!-- LEFT: the Scripts tree — lifecycle groups expand to their scripts -->
    <div class="side">
      <div class="profilecard">
        <div class="pn"><span class="led"></span>Scripting</div>
        <div class="pm">{scripts.length} scripts · {enabledCount} enabled</div>
      </div>

      <div class="treesearch">
        <span class="si">⌕</span>
        <input class="searchinput" placeholder="Search scripts…" value={searchQuery}
          oninput={(e) => searchQuery = e.target.value}
          onkeydown={(e) => { if (e.key === 'Escape') searchQuery = ''; }} />
        {#if searchQuery}<button class="searchclear" title="Clear (Esc)" onclick={() => searchQuery = ''}>✕</button>{/if}
      </div>

      {#if searchQuery}
        <div class="treebody">
          {#if searchResults.length === 0}
            <div class="noresults">No scripts match “{searchQuery}”.</div>
          {:else}
            <div class="scount">{searchResults.length} match{searchResults.length === 1 ? '' : 'es'}</div>
            {#each searchResults as r (r.id)}
              <div class={['resrow', selectedId === r.id && 'sel']} role="button" tabindex="0"
                onclick={() => openResult(r.id)}
                onkeydown={(e) => (e.key === 'Enter' || e.key === ' ') && openResult(r.id)}>
                <div class="resmeta">
                  <span class="sname">{r.name}</span>
                  <span class="pd"><span class={['pill', langClass(r.language)]}>{langLabel(r.language)}</span> {r.event}<span class="rfield"> · {r.field}</span></span>
                </div>
                {#if r.snippet}<div class="ressnip"><span class="rline">{r.line}</span><code>{r.snippet}</code></div>{/if}
              </div>
            {/each}
          {/if}
        </div>
      {:else}
        <div class="treetools">
          <div class="groupby">
            <button class="gb" onclick={expandAll} title="Expand every lifecycle group and folder">⊞ Expand all</button>
            <button class="gb" onclick={collapseAll} title="Collapse every lifecycle group">⊟ Collapse</button>
          </div>
          <button class="btn ghost tiny" onclick={() => fileInputEl?.click()} title="Load a script file from disk (.lua / .js / .py / .cpp)">⬆ Import</button>
        </div>

        <datalist id="bd-folders-tree">
          {#each folderNames as f (f)}<option value={f}></option>{/each}
        </datalist>
        <div class="treebody">
          <div class="treelbl">Panel lifecycle</div>
          {@render treeGroup(startupNode)}
          {@render treeGroup(readyNode)}
          {@render treeGroup(runtimeNode)}
          {@render treeGroup(dawStateNode)}
          {@render treeGroup(shutdownNode)}
          <div class="treelbl">Tools</div>
          <div class={['tnode', mainView === 'test' && 'active']} role="button" tabindex="0"
            onclick={() => mainView = 'test'}
            onkeydown={(e) => (e.key === 'Enter' || e.key === ' ') && (mainView = 'test')}>
            <span class="ti">◉</span> Test / Trace
          </div>
        </div>
      {/if}
    </div>

    <div class="stage">
      <div class="stagemain">
        {#if mainView === 'test'}
          {@render testView()}
        {:else}
          {@render detailPanel()}
        {/if}
      </div>

      <!-- Right dock: Insert / Library / History tabs. Docked column by default; floats over
           the editor on narrow viewports so it never squeezes the code. -->
      {#if showDock && selected && mainView !== 'test'}
        <aside class={['dock', narrow && 'float']}>
          <div class="pickerpane">
            <div class="pickerhead docktabs">
              <span class="dtabs">
                <button class={['dtab', dockTab === 'insert' && 'active']} onclick={() => dockTab = 'insert'}>Insert</button>
                <button class={['dtab', dockTab === 'library' && 'active']} onclick={() => dockTab = 'library'}>Library <b>{$scriptLibrary.length}</b></button>
                <button class={['dtab', dockTab === 'history' && 'active']} onclick={() => dockTab = 'history'}>History <b>{versions.length}</b></button>
              </span>
              <span style="display:flex;gap:6px;flex-shrink:0">
                {#if dockTab === 'history' && versions.length}
                  <button class="btn ghost" onclick={() => { if (selectedId) { clearVersions(selectedId); historyTick++; } }} style="color:var(--red)" title="Forget this script's history">Clear</button>
                {/if}
                <button class="btn ghost" onclick={() => showDock = false} title="Hide this panel">⟩ Hide</button>
              </span>
            </div>
            {@render dockBody()}
          </div>
        </aside>
      {/if}
    </div>
  </div>

  <div class="stagefoot">
    <span>{scripts.length} scripts</span>
    <span class="ok">● {enabledCount} enabled</span>
    {#if selected && mainView !== 'test'}
      <span class="caretpos" title="Cursor position">Ln {caret.line}, Col {caret.col}</span>
    {/if}
    <span class="spacer" style="flex:1"></span>
    <span class={['savestate', saveState]} title={saveState === 'saved' ? 'All changes saved' : 'Saving…'}>
      {saveState === 'saved' ? '✓ Saved' : '● Unsaved'}
    </span>
    <label class="livetoggle" title="When on, onValueChanged scripts fire automatically as control values change">
      <input type="checkbox" checked={liveOn} onchange={(e) => liveOn = e.target.checked} />
      <span class={['liveled', liveOn && 'on']}></span> Live
    </label>
    <button class="btn" onclick={saveNow} disabled={saveState === 'saved'}>Save</button>
  </div>
</div>
