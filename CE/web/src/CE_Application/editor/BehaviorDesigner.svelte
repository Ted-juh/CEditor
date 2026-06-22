<script>
  // BehaviorDesigner — the stable single-frame scripting editor (replaces the 10-mode
  // ScriptWorkspace). Cloned from the DPD shell: fixed frame, nav-rail by lifecycle,
  // screens via display:none/.active, list -> detail. Spec: tools/docs/panel-api-spec.md.
  import './behaviorDesigner.css';
  import { tick, onMount, untrack } from 'svelte';
  import ScriptPicker from './ScriptPicker.svelte';
  import { createScript, normalizeSourceScript, defaultSource } from '../scripting/scriptModel.js';
  import { validateScript } from '../scripting/scriptValidate.js';
  import { scriptTrace, clearScriptTrace } from '../stores/scriptConsole.js';
  import { scriptLibrary, saveToLibrary, removeFromLibrary } from '../stores/scriptLibrary.js';
  import { runScript, initPanelRuntime, setLiveScripts, setLiveEnabled } from '../scripting/panelRuntime.js';
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

  let codeEl = $state(null);   // the <textarea>, for insert-at-cursor
  let showPicker = $state(false); // when true, the RIGHT pane shows the Insert picker instead of the script list
  let showLibrary = $state(false); // when true, the RIGHT pane shows the reusable-script library

  async function insertAtCursor(text) {
    const s = scripts.find((x) => x.id === selectedId);
    if (!s) return;
    const el = codeEl;
    const start = el ? el.selectionStart : s.source.length;
    const end = el ? el.selectionEnd : s.source.length;
    s.source = s.source.slice(0, start) + text + s.source.slice(end);
    await tick();
    if (el) { const pos = start + text.length; el.focus(); el.setSelectionRange(pos, pos); }
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

  let activeScreen = $state('behaviors');
  let selectedId = $state(untrack(() => scripts[0]?.id ?? null));

  let selected = $derived(scripts.find((s) => s.id === selectedId) ?? null);
  let problems = $derived(selected ? validateScript(selected) : []);

  // Target attachment: the panel's control names, plus the "Any control" wildcard. A legacy
  // 'self' target (the old component-scope default) reads as the wildcard here.
  let controlNames = $derived((controls ?? []).map((c) => c.name).filter(Boolean));
  let targetValue = $derived(selected ? (selected.target === 'self' || !selected.target ? '*' : selected.target) : '*');

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

  // Persist to the panel (debounced) whenever any script changes — add/edit/rename/folder/delete.
  let saveTimer = null;
  $effect(() => {
    const snap = $state.snapshot(scripts); // deep-reads scripts so the effect tracks every change
    if (onChange) { clearTimeout(saveTimer); saveTimer = setTimeout(() => onChange(snap), 400); }
  });

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

  let nav = $derived([
    { group: 'Panel lifecycle', items: [
      { id: 'setup', icon: '▸', label: 'Setup', count: setupScripts.length || undefined },
      { id: 'teardown', icon: '◾', label: 'Teardown', count: teardownScripts.length || undefined },
    ] },
    { group: 'During use', items: [
      { id: 'behaviors', icon: '⚡', label: 'Behaviors', count: behaviorScripts.length || undefined },
    ] },
    { group: 'Tools', items: [
      { id: 'test', icon: '◉', label: 'Test / Trace' },
    ] },
  ]);

  function langClass(id) { return id === 'javascript' ? 'js' : 'lua'; }
  function langLabel(id) { return id === 'javascript' ? 'JavaScript' : 'Lua'; }

  function selectScript(id) { selectedId = id; }

  function addScript(event, scope) {
    const s = createScript({ event, scope, language: selected?.language ?? 'lua', name: 'New ' + event });
    scripts = [...scripts, s];
    selectedId = s.id;
    activeScreen = screenOf(event);
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
    activeScreen = screenOf(entry.event);
    showLibrary = false;
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
          <button class="btn primary" onclick={() => runScript(selected)} title="Run this script now against the live panel">▶ Run</button>
          <button class={['btn', 'ghost', showPicker && 'primary']} onclick={() => { showPicker = !showPicker; if (showPicker) showLibrary = false; }} title="Browse & insert API in the right pane">+ Insert</button>
          <button class={['btn', 'ghost', showLibrary && 'primary']} onclick={() => { showLibrary = !showLibrary; if (showLibrary) showPicker = false; }} title="Reusable script library">📚 Library</button>
          <button class="btn ghost" onclick={regenerateSkeleton} title="Replace with a fresh skeleton">↺ skeleton</button>
        </span>
      </div>
      <textarea class="code" bind:this={codeEl} spellcheck="false" value={selected.source}
        oninput={(e) => updateField('source', e.target.value)}></textarea>

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
        <button class="btn ghost" onclick={saveSelectedToLibrary} title="Save a reusable copy to the library">★ Save to library</button>
        <button class="btn ghost" onclick={deleteSelected} style="color:var(--red)">Delete</button>
      </div>
    {:else}
      <p class="sub" style="margin:0">Select a script on the left, or add one.</p>
    {/if}
  </div>
{/snippet}

{#snippet tableScreen(title, sub, items, addEvent, addScope)}
  <div class="shead"><h1>{title}</h1></div>
  <p class="sub">{sub}</p>
  <div class="toolbar">
    <button class="btn primary" onclick={() => addScript(addEvent, addScope)}>+ New</button>
    <span class="spacer"></span>
    <div class="groupby" title="Group the list">
      <button class={['gb', groupMode === 'flat' && 'active']} onclick={() => groupMode = 'flat'}>Flat</button>
      <button class={['gb', groupMode === 'control' && 'active']} onclick={() => groupMode = 'control'}>Control</button>
      <button class={['gb', groupMode === 'folder' && 'active']} onclick={() => groupMode = 'folder'}>Folder</button>
    </div>
  </div>
  <div class="tablewrap">
    <table>
      <thead><tr>
        <th style="width:56%">Script</th>
        <th style="width:16%">Lang</th>
        <th style="width:28%">Runs on</th>
      </tr></thead>
      <tbody>
        {#each groupsOf(items) as g (g.key)}
          {#if groupMode !== 'flat'}
            <tr class="grouphead"><td colspan="3">{g.key} <span class="gc">{g.items.length}</span></td></tr>
          {/if}
          {#each g.items as s (s.id)}
            <tr class={[selectedId === s.id && 'sel', !s.enabled && 'off']}
              role="button" tabindex="0"
              onclick={() => selectScript(s.id)}
              onkeydown={(e) => (e.key === 'Enter' || e.key === ' ') && selectScript(s.id)}>
              <td>
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
                    onkeydown={(e) => { if (e.key === 'F2' || e.key === 'Enter') { e.stopPropagation(); e.preventDefault(); startRename(s); } }}
                    title="Double-click (or F2) to rename">{s.name}</span>
                {/if}
              </td>
              <td><span class={['pill', langClass(s.language)]}>{langLabel(s.language)}</span></td>
              <td><span class="ev">{s.event}</span></td>
            </tr>
          {/each}
        {/each}
        {#if items.length === 0}
          <tr><td colspan="3" style="color:var(--txt-faint);text-align:center;padding:22px">No scripts here yet.</td></tr>
        {/if}
      </tbody>
    </table>
  </div>
{/snippet}

<div class="bd-app">
  <div class="titlebar">
    <div class="dots"><span></span><span></span><span></span></div>
    <div class="brand">CEditor</div>
    <div class="crumb">Behavior Designer · <b>{panelName}</b></div>
  </div>

  <div class="body">
    <div class="side">
      <div class="profilecard">
        <div class="pn"><span class="led"></span>Scripting</div>
        <div class="pm">{scripts.length} scripts · {enabledCount} enabled</div>
      </div>
      {#each nav as section (section.group)}
        <div class="treelbl">{section.group}</div>
        {#each section.items as item (item.id)}
          <div class={['tnode', activeScreen === item.id && 'active']}
            role="button" tabindex="0"
            onclick={() => activeScreen = item.id}
            onkeydown={(e) => (e.key === 'Enter' || e.key === ' ') && (activeScreen = item.id)}>
            <span class="ti">{item.icon}</span> {item.label}
            {#if item.count != null}<span class="ct">{item.count}</span>{/if}
          </div>
        {/each}
      {/each}
      <div class="sidehint">One stable frame — screens swap in place, nothing jumps. Scripts run in the language you write them in.</div>
    </div>

    <div class="stage">
      <div class="split" style="display:{activeScreen === 'test' ? 'none' : 'flex'}">
        <!-- MIDDLE: the scripting area (code editor + picker + problems) — the main work surface -->
        <div class="editorcol">
          {@render detailPanel()}
        </div>
        <!-- RIGHT: the script list — or the Insert picker / Library while inserting -->
        <div class="listcol">
          {#if showLibrary}
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
          {:else}
            <div class={['screen', activeScreen === 'setup' && 'active']}>
              {@render tableScreen('Setup', 'Runs once as the panel starts — open MIDI, read the synth, fill controls.', setupScripts, 'onPanelReady', 'panel')}
            </div>
            <div class={['screen', activeScreen === 'behaviors' && 'active']}>
              {@render tableScreen('Behaviors', 'The live, event-driven scripts — what happens while the panel is in use.', behaviorScripts, 'onValueChanged', 'component')}
            </div>
            <div class={['screen', activeScreen === 'teardown' && 'active']}>
              {@render tableScreen('Teardown', 'Runs as the panel closes or the DAW saves/restores the project.', teardownScripts, 'onPanelClose', 'panel')}
            </div>
          {/if}
        </div>
      </div>
      <!-- Test screen is full-width (no list/editor split) -->
      <div class={['screen', activeScreen === 'test' && 'active']}>
        <div class="shead"><h1>Test / Trace</h1></div>
        <p class="sub">Problems across every script (live), plus the trace from the running panel and "run until…" breakpoints.</p>

        <!-- Problems — edit-time validation across ALL scripts (real, now) -->
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

        <!-- Trace console — runtime log/trace/errors (Model 2; fills when scripts run) -->
        <div class="tsection">
          <div class="tshead">Trace<span style="flex:1"></span><button class="btn ghost" onclick={clearScriptTrace}>Clear</button></div>
          {#if $scriptTrace.length === 0}
            <div class="placeholder">No trace yet — scripts run in the C++ host. Output (log / errors / MIDI) appears here once the runtime is live.</div>
          {:else}
            <div class="tracelist">
              {#each $scriptTrace as e (e.id)}
                <div class={['traceline', e.kind]}><span class="tt">{e.time}</span><span class="tk">{e.kind}</span><span class="tm">{e.message}</span></div>
              {/each}
            </div>
          {/if}
        </div>

        <!-- Watch & "run until" — config now, enforced by the runtime later -->
        <div class="tsection">
          <div class="tshead">Watch &amp; "run until"</div>
          <p class="sub" style="margin:0 0 10px">Pause the run when a value crosses a threshold, or watch values live. Activates when the runtime is wired.</p>
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
            <div class="chip"><b>{w}</b> <span style="color:var(--txt-faint)">= —</span> <button onclick={() => removeWatch(i)}>×</button></div>
          {/each}
        </div>
      </div>
    </div>
  </div>

  <div class="stagefoot">
    <span>{scripts.length} scripts</span>
    <span class="ok">● {enabledCount} enabled</span>
    <span class="spacer" style="flex:1"></span>
    <label class="livetoggle" title="When on, onValueChanged scripts fire automatically as control values change">
      <input type="checkbox" checked={liveOn} onchange={(e) => liveOn = e.target.checked} />
      <span class={['liveled', liveOn && 'on']}></span> Live
    </label>
    <button class="btn">Save</button>
  </div>
</div>
