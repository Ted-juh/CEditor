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
  let showPicker = $state(false); // when true, the RIGHT pane shows the Insert picker instead of the script list
  let showLibrary = $state(false); // when true, the RIGHT pane shows the reusable-script library
  let showConsole = $state(false); // inline output console under the editor
  let showHistory = $state(false); // right pane shows version history of the selected script
  let historyTick = $state(0);     // bump to refresh the version list after a save
  let versions = $derived.by(() => { historyTick; return selectedId ? getVersions(selectedId) : []; });

  function restoreVersion(source) {
    if (selected) { selected.source = source; }
    showHistory = false;
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

  // Which lifecycle group an event belongs to — drives nav grouping.
  const SETUP = new Set(['onPanelLoad', 'onPanelReady']);
  const TEARDOWN = new Set(['onPanelClose', 'onDawSaveState', 'onDawRestoreState']);
  function screenOf(event) {
    if (SETUP.has(event)) return 'setup';
    if (TEARDOWN.has(event)) return 'teardown';
    return 'behaviors';
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
  let expanded = $state(new Set(['setup', 'teardown', 'behaviors'])); // expanded tree groups
  function toggleExpand(id) { const n = new Set(expanded); n.has(id) ? n.delete(id) : n.add(id); expanded = n; }
  function expand(id) { if (!expanded.has(id)) { const n = new Set(expanded); n.add(id); expanded = n; } }
  let selectedId = $state(untrack(() => scripts[0]?.id ?? null));

  let selected = $derived(scripts.find((s) => s.id === selectedId) ?? null);
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

  // --- cross-script search (spans Setup / Behaviors / Teardown) ---
  let searchQuery = $state('');
  let searchResults = $derived(searchScripts(scripts, searchQuery));
  function openResult(id) {
    const s = scripts.find((x) => x.id === id);
    if (!s) return;
    selectedId = id;
    mainView = 'editor';
  }

  // --- list grouping + inline rename ---
  let groupMode = $state('flat'); // 'flat' | 'control' | 'folder'
  let renamingId = $state(null);
  let renameValue = $state('');
  let folderNames = $derived([...new Set(scripts.map((s) => (s.group ?? '').trim()).filter(Boolean))]);

  function controlGroupOf(s) { return (s.target && s.target !== '*' && s.target !== 'self') ? s.target : 'Any control'; }
  function groupKeyOf(s) {
    if (groupMode === 'folder') return (s.group ?? '').trim() || 'Ungrouped';
    if (groupMode === 'control') return controlGroupOf(s);
    return '';
  }
  function groupsOf(items) {
    if (groupMode === 'flat') return [{ key: '', items }];
    const map = new Map();
    for (const s of items) { const k = groupKeyOf(s); if (!map.has(k)) map.set(k, []); map.get(k).push(s); }
    return [...map.entries()].map(([key, list]) => ({ key, items: list }));
  }

  function startRename(s) { renamingId = s.id; renameValue = s.name; }
  function commitRename() {
    const s = scripts.find((x) => x.id === renamingId);
    if (s && renameValue.trim()) s.name = renameValue.trim();
    renamingId = null;
  }
  function cancelRename() { renamingId = null; }

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
    if (pendingSnap) onChange?.(pendingSnap);
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
    return () => setLiveScripts(null);
  });
  $effect(() => { setLiveScripts($state.snapshot(scripts), panelId); });
  $effect(() => { setLiveEnabled(liveOn); });

  let setupScripts = $derived(scripts.filter((s) => screenOf(s.event) === 'setup'));
  let behaviorScripts = $derived(scripts.filter((s) => screenOf(s.event) === 'behaviors'));
  let teardownScripts = $derived(scripts.filter((s) => screenOf(s.event) === 'teardown'));
  let enabledCount = $derived(scripts.filter((s) => s.enabled).length);

  // Lifecycle groups for the Scripts tree — each expands to its scripts; "+ New" on a group
  // creates a script already set to that group's event/scope.
  let setupNode = $derived({ id: 'setup', icon: '▸', label: 'Setup', event: 'onPanelReady', scope: 'panel', scripts: setupScripts });
  let teardownNode = $derived({ id: 'teardown', icon: '◾', label: 'Teardown', event: 'onPanelClose', scope: 'panel', scripts: teardownScripts });
  let behaviorsNode = $derived({ id: 'behaviors', icon: '⚡', label: 'Behaviors', event: 'onValueChanged', scope: 'component', scripts: behaviorScripts });

  function langClass(id) { return id === 'javascript' ? 'js' : 'lua'; }
  function langLabel(id) { return id === 'javascript' ? 'JavaScript' : 'Lua'; }

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

  function regenerateSkeleton() {
    const s = scripts.find((x) => x.id === selectedId);
    if (s) s.source = defaultSource(s.event, s.language);
  }

  function deleteSelected() {
    if (!selected) return;
    const idx = scripts.findIndex((x) => x.id === selectedId);
    scripts = scripts.filter((x) => x.id !== selectedId);
    selectedId = scripts[Math.max(0, idx - 1)]?.id ?? null;
  }

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
    showLibrary = false;
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
      <div class="field">
        <label for="bd-name">Name</label>
        <input id="bd-name" value={selected.name} onfocus={(e) => e.target.select()}
          oninput={(e) => updateField('name', e.target.value)} />
      </div>
      <div class="row2">
        <div class="field">
          <label for="bd-lang">Language</label>
          <select id="bd-lang" value={selected.language} onchange={(e) => updateField('language', e.target.value)}>
            {#each SCRIPT_LANGUAGES as l (l.id)}<option value={l.id}>{l.label} {l.version}</option>{/each}
          </select>
        </div>
        <div class="field">
          <label for="bd-scope">Scope</label>
          <select id="bd-scope" value={selected.scope} onchange={(e) => updateField('scope', e.target.value)}>
            {#each SCRIPT_SCOPES as sc (sc)}<option value={sc}>{sc}</option>{/each}
          </select>
        </div>
      </div>
      <div class="row2">
        <div class="field">
          <label for="bd-event">Runs on (event / lifecycle)</label>
          <select id="bd-event" value={selected.event} onchange={(e) => updateField('event', e.target.value)}>
            {#each EVENT_GROUPS as g (g.group)}
              <optgroup label={g.group}>
                {#each g.items as ev (ev)}<option value={ev}>{ev}</option>{/each}
              </optgroup>
            {/each}
          </select>
        </div>
        <div class="field">
          <label for="bd-target">Attached control</label>
          <select id="bd-target" value={targetValue} onchange={(e) => updateField('target', e.target.value)}
            title="Which control this script reacts to. 'self' inside the script resolves to it.">
            <option value="*">Any control</option>
            {#each controlNames as name (name)}<option value={name}>{name}</option>{/each}
          </select>
        </div>
      </div>
      <div class="field">
        <label for="bd-folder">Folder (optional)</label>
        <input id="bd-folder" value={selected.group ?? ''} list="bd-folders" placeholder="e.g. Filter section"
          onfocus={(e) => e.target.select()} oninput={(e) => updateField('group', e.target.value)} />
        <datalist id="bd-folders">
          {#each folderNames as f (f)}<option value={f}></option>{/each}
        </datalist>
      </div>
      <div class="codehead">
        <span class="lang">{langLabel(selected.language)} source</span>
        <span style="display:flex;gap:6px">
          <button class="btn primary" onclick={() => runAndShow(selected)} title="Run this script now against the live panel">▶ Run</button>
          <button class={['btn', 'ghost', showPicker && 'primary']} onclick={() => { showPicker = !showPicker; if (showPicker) showLibrary = false; }} title="Browse & insert API in the right pane">+ Insert</button>
          <button class={['btn', 'ghost', showLibrary && 'primary']} onclick={() => { showLibrary = !showLibrary; if (showLibrary) { showPicker = false; showHistory = false; } }} title="Reusable script library">📚 Library</button>
          <button class={['btn', 'ghost', showHistory && 'primary']} onclick={() => { showHistory = !showHistory; if (showHistory) { showPicker = false; showLibrary = false; } }} title="Version history (restorable across sessions)">🕘 History</button>
          <button class="btn ghost" onclick={regenerateSkeleton} title="Replace with a fresh skeleton">↺ skeleton</button>
        </span>
      </div>
      <!-- Keyed by script id: switching functions auto-saves (debounced persist) and
           presents the next function in a fresh editor. No unsaved-changes prompt is
           needed because every edit is already captured in `scripts`. -->
      {#key selectedId}
        <CodeEditor bind:this={codeEditor} language={selected.language} value={selected.source}
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

{#snippet treeGroup(node)}
  <div class="treegroup">
    <div class={['tghead', expanded.has(node.id) && 'open']}>
      <button class="tgtoggle" title={node.label}
        onclick={() => toggleExpand(node.id)}>
        <span class="tgcaret">{expanded.has(node.id) ? '▾' : '▸'}</span>
        <span class="ti">{node.icon}</span>
        <span class="tglabel">{node.label}</span>
        {#if node.scripts.length}<span class="ct">{node.scripts.length}</span>{/if}
      </button>
      <button class="tgnew" title={'New ' + node.label + ' script (' + node.event + ')'}
        onclick={() => addScript(node.event, node.scope)}>+</button>
    </div>
    {#if expanded.has(node.id)}
      {#if node.scripts.length === 0}
        <div class="tgempty">No scripts — click <b>+</b> to add one.</div>
      {:else}
        {#each groupsOf(node.scripts) as g (g.key)}
          {#if groupMode !== 'flat'}<div class="tgsub">{g.key} <span class="gc">{g.items.length}</span></div>{/if}
          {#each g.items as s (s.id)}
            <div class={['titem', selectedId === s.id && mainView === 'editor' && 'sel', !s.enabled && 'off']}
              role="button" tabindex="0"
              onclick={() => selectScript(s.id)}
              onkeydown={(e) => (e.key === 'Enter' || e.key === ' ') && selectScript(s.id)}>
              {#if renamingId === s.id}
                <input class="renameinput" value={renameValue}
                  oninput={(e) => renameValue = e.target.value}
                  onblur={commitRename}
                  onclick={(e) => e.stopPropagation()}
                  onkeydown={(e) => { if (e.key === 'Enter') { e.preventDefault(); commitRename(); } else if (e.key === 'Escape') cancelRename(); }}
                  {@attach (el) => { el.focus(); el.select(); }} />
              {:else}
                <span class="sname" role="button" tabindex="0"
                  ondblclick={(e) => { e.stopPropagation(); startRename(s); }}
                  onkeydown={(e) => { if (e.key === 'F2') { e.stopPropagation(); e.preventDefault(); startRename(s); } }}
                  title="Double-click (or F2) to rename">{s.name}</span>
                <span class={['pill', langClass(s.language)]}>{langLabel(s.language)}</span>
              {/if}
            </div>
          {/each}
        {/each}
      {/if}
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

{#snippet toolsDrawer()}
  {#if showHistory}
    <div class="pickerpane">
      <div class="pickerhead">
        <span>History <b>{versions.length}</b></span>
        <span style="display:flex;gap:6px">
          {#if versions.length}<button class="btn ghost" onclick={() => { if (selectedId) { clearVersions(selectedId); historyTick++; } }} style="color:var(--red)" title="Forget this script's history">Clear</button>{/if}
          <button class="btn ghost" onclick={() => showHistory = false}>Done</button>
        </span>
      </div>
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
    </div>
  {:else if showLibrary}
    <div class="pickerpane">
      <div class="pickerhead"><span>Library <b>{$scriptLibrary.length}</b></span><button class="btn ghost" onclick={() => showLibrary = false}>Done</button></div>
      <div class="liblist">
        {#if $scriptLibrary.length === 0}
          <div class="pcat" style="padding:12px">No saved scripts yet. Select a script and click <b>★ Save to library</b> to reuse it on any panel.</div>
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
    </div>
  {:else if showPicker && selected}
    <div class="pickerpane">
      <div class="pickerhead"><span>Insert into <b>{selected.name}</b></span><button class="btn ghost" onclick={() => showPicker = false}>Done</button></div>
      <ScriptPicker language={selected.language} scope={selected.scope} {controls} onInsert={insertAtCursor} />
    </div>
  {/if}
{/snippet}

<div class="bd-app">
  <!-- Hidden picker backing the "Import file" buttons. -->
  <input type="file" bind:this={fileInputEl} accept=".lua,.js,.mjs,.cjs,.py,.txt,text/plain"
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
          <div class="groupby" title="Group scripts within each section">
            <button class={['gb', groupMode === 'flat' && 'active']} onclick={() => groupMode = 'flat'}>Flat</button>
            <button class={['gb', groupMode === 'control' && 'active']} onclick={() => groupMode = 'control'}>Control</button>
            <button class={['gb', groupMode === 'folder' && 'active']} onclick={() => groupMode = 'folder'}>Folder</button>
          </div>
          <button class="btn ghost tiny" onclick={() => fileInputEl?.click()} title="Load a script file from disk (.lua / .js / .py)">⬆ Import</button>
        </div>

        <div class="treebody">
          <div class="treelbl">Panel lifecycle</div>
          {@render treeGroup(setupNode)}
          {@render treeGroup(teardownNode)}
          <div class="treelbl">During use</div>
          {@render treeGroup(behaviorsNode)}
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
      {#if mainView === 'test'}
        {@render testView()}
      {:else}
        {@render detailPanel()}
      {/if}

      <!-- Tools drawer: Insert / Library / History slide over the editor on demand -->
      {#if showHistory || showLibrary || (showPicker && selected)}
        <div class="drawer">{@render toolsDrawer()}</div>
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
