<script>
  // PanelFileView — the script editor's "Panel file" screen: the panel's document, one item at a time,
  // as text to read and edit. stores/panelFileText.js says what the text is, what it leaves out and
  // what Apply checks; stores/panelFileActions.js writes an applied item, as one undo step.
  //
  // An edit not yet applied is a draft, kept per item for as long as the screen is open, so moving to
  // another item (or following the selection to one) loses nothing; the outline marks the items that
  // have one.
  //
  // The selection is the editor's own, and every tab switch clears it. So the screen opens on the
  // control selected when the script tab took over (selectionBeforeScriptTab); "Show on the panel"
  // goes back to the panel with the control selected; and while the panel is visible beside this
  // tab (a split), picking a control in either selects it in both.
  import { onMount, untrack } from 'svelte';
  import { get } from 'svelte/store';
  import CodeEditor from './CodeEditor.svelte';
  import { panels, selectedComponentId, selectComponent, selectionBeforeScriptTab, setActivePanel } from '../stores/panels.js';
  import {
    PANEL_SETTINGS_ITEM, panelFileOutline, controlFileText, controlFullText, panelSettingsFileText, panelSettingsFullText,
  } from '../stores/panelFileText.js';
  import { applyControlFileEdit, applyPanelSettingsFileEdit } from '../stores/panelFileActions.js';
  import { findControlById } from '../utils/containment.js';

  let { panelId = null } = $props();

  let panel = $derived($panels.find((p) => p.id === panelId) ?? null);
  let outline = $derived(panel ? panelFileOutline(panel) : []);
  let rowsByKey = $derived(new Map(outline.map((row) => [row.key, row])));

  let selectedKey = $state(PANEL_SETTINGS_ITEM);
  let expanded = $state(new Set());
  let search = $state('');
  let showAll = $state(false);
  let drafts = $state(new Map());     // key -> { text, base }: an unapplied edit, and the text it began from
  let messages = $state({ errors: [], warnings: [], note: '' });
  let editor = $state(null);

  // The item, and its text as the panel has it now. Recomputed when the item's own object changes,
  // not on every write to the panel, so a busy panel does not re-lay a text nobody touched.
  let item = $derived.by(() => {
    if (!panel) return null;
    if (selectedKey === PANEL_SETTINGS_ITEM) return { kind: 'panel', node: panel };
    const control = findControlById(panel.controls, selectedKey);
    return control ? { kind: 'control', node: control } : null;
  });
  let current = $derived.by(() => {
    if (!item) return null;
    return item.kind === 'panel' ? panelSettingsFileText(item.node) : controlFileText(item.node);
  });
  let fullText = $derived(showAll && item ? (item.kind === 'panel' ? panelSettingsFullText(item.node) : controlFullText(item.node)) : '');
  let draft = $derived(drafts.get(selectedKey) ?? null);
  let text = $derived(draft?.text ?? current?.text ?? '');
  let dirty = $derived(Boolean(draft && current && draft.text !== current.text));
  let stale = $derived(Boolean(draft && current && draft.base !== current.text));

  // Start on the control selected when the script tab opened, and follow the selection after.
  onMount(() => {
    const remembered = get(selectionBeforeScriptTab);
    if (remembered && remembered.panelId === panelId && rowsByKey.has(remembered.id)) openItem(remembered.id, { fromCanvas: true });
  });
  $effect(() => {
    const id = $selectedComponentId;
    untrack(() => {
      if (id != null && rowsByKey.has(id) && id !== selectedKey) openItem(id, { fromCanvas: true });
    });
  });

  function openItem(key, { fromCanvas = false } = {}) {
    selectedKey = key;
    messages = { errors: [], warnings: [], note: '' };
    const next = new Set(expanded);
    for (let row = rowsByKey.get(key); row?.parentId != null; row = rowsByKey.get(row.parentId)) next.add(row.parentId);
    expanded = next;
    if (!fromCanvas && key !== PANEL_SETTINGS_ITEM) selectComponent(key);
  }

  function toggle(key) {
    const next = new Set(expanded);
    next.has(key) ? next.delete(key) : next.add(key);
    expanded = next;
  }

  // The outline as shown: a search lists every match; otherwise a container shows its controls only
  // while it is open.
  let visibleRows = $derived.by(() => {
    const query = search.trim().toLowerCase();
    if (query) {
      return outline.filter((row) => row.kind === 'control'
        && `${row.name} ${row.type} ${row.id}`.toLowerCase().includes(query));
    }
    const out = [];
    const closed = new Set();
    for (const row of outline) {
      if (row.parentId != null && (closed.has(row.parentId) || !expanded.has(row.parentId))) {
        closed.add(row.key);
        continue;
      }
      out.push(row);
    }
    return out;
  });

  function onInput(value) {
    if (!current) return;
    const next = new Map(drafts);
    if (value === current.text) next.delete(selectedKey);
    else next.set(selectedKey, { text: value, base: drafts.get(selectedKey)?.base ?? current.text });
    drafts = next;
    if (messages.note) messages = { ...messages, note: '' };
  }

  function revert() {
    const next = new Map(drafts);
    next.delete(selectedKey);
    drafts = next;
    messages = { errors: [], warnings: [], note: '' };
  }

  function apply() {
    if (!panel || !item || showAll) return;
    const key = selectedKey;
    const result = key === PANEL_SETTINGS_ITEM
      ? applyPanelSettingsFileEdit(panel.id, text)
      : applyControlFileEdit(panel.id, key, text);
    if (!result.ok) {
      messages = { errors: result.errors, warnings: result.warnings, note: '' };
      const at = result.errors.find((e) => e.line);
      if (at) editor?.revealLine(at.line, at.col);
      return;
    }
    const next = new Map(drafts);
    next.delete(key);
    drafts = next;
    messages = {
      errors: [],
      warnings: result.warnings,
      note: result.changed
        ? `Applied. It is one step in the panel's undo history ("${undoName(key)}"): on the panel, Undo takes it back.`
        : 'Nothing changed: the text says what the panel already has.',
    };
  }

  function showOnPanel() {
    if (!panel || selectedKey === PANEL_SETTINGS_ITEM) return;
    const id = selectedKey;
    setActivePanel(panel.id);
    selectComponent(id);
  }

  function undoName(key) {
    if (key === PANEL_SETTINGS_ITEM) return 'Edit panel settings as text';
    const control = panel ? findControlById(panel.controls, key) : null;
    return `Edit ${control?._children?.Core?.name || key} as text`;
  }

  function title() {
    if (!item) return '';
    if (item.kind === 'panel') return 'Panel settings';
    const core = item.node._children.Core;
    return `${core.name || core.id} · ${core.controlType}`;
  }

  function heldBackLine() {
    const held = current?.heldBack;
    if (!held) return '';
    const parts = [];
    const count = (n, one, many) => `${n} ${n === 1 ? one : many}`;
    if (held.children) parts.push(`${count(held.children, 'control', 'controls')} inside it (items of their own, in the outline)`);
    if (held.scripts) parts.push(`${count(held.scripts, 'script', 'scripts')} (the script screens)`);
    if (held.exportParameters) parts.push(`${count(held.exportParameters, 'host parameter', 'host parameters')} (made from the controls on every save)`);
    if (held.notes) parts.push(`${count(held.notes, 'note', 'notes')} (the notepad)`);
    if (held.capture) parts.push('an in-progress capture (the capture tool)');
    if (held.data) parts.push(`${count(held.data, 'embedded image', 'embedded images')} (a placeholder, kept as it is)`);
    return parts.length ? `Not in this text, and kept as it is: ${parts.join(' · ')}.` : '';
  }

  function hint() {
    if (showAll) return 'Every field, defaults included: a reference to read, not to edit.';
    if (item?.kind === 'panel') return 'Only what differs from a new panel. Delete a line to put that setting back to a new panel\'s value.';
    return `Only what differs from a new ${item?.node._children.Core.controlType ?? 'control'}. Delete a line to put that property back to its default.`;
  }
</script>

{#if !panel}
  <div class="pf-empty">
    <p class="sub">This script document is not bound to an open panel, so there is no panel file to show.</p>
  </div>
{:else}
  <div class="pf" data-testid="panel-file-view">
    <div class="pf-outline" role="navigation" aria-label="Panel file outline">
      <div class="treesearch pf-search">
        <span class="si">⌕</span>
        <input class="searchinput" placeholder="Find a control…" value={search}
          oninput={(e) => search = e.target.value}
          onkeydown={(e) => { if (e.key === 'Escape') search = ''; }} />
        {#if search}<button class="searchclear" title="Clear (Esc)" onclick={() => search = ''}>✕</button>{/if}
      </div>
      <div class="pf-rows" role="tree">
        {#if !search.trim()}
          <div class={['pf-row', 'pf-panel', selectedKey === PANEL_SETTINGS_ITEM && 'sel']} role="treeitem" tabindex="0"
            aria-selected={selectedKey === PANEL_SETTINGS_ITEM}
            onclick={() => openItem(PANEL_SETTINGS_ITEM)}
            onkeydown={(e) => (e.key === 'Enter' || e.key === ' ') && openItem(PANEL_SETTINGS_ITEM)}>
            <span class="pf-twist"></span>
            <span class="pf-name">Panel settings</span>
            {#if drafts.has(PANEL_SETTINGS_ITEM)}<span class="pf-draft" title="An edit not applied yet">●</span>{/if}
          </div>
        {/if}
        {#each visibleRows as row (row.key)}
          {#if row.kind === 'control'}
            <div class={['pf-row', selectedKey === row.key && 'sel']} role="treeitem" tabindex="0"
              aria-selected={selectedKey === row.key}
              style="padding-left:{8 + (search.trim() ? 0 : row.depth * 14)}px"
              data-key={row.key}
              onclick={() => openItem(row.key)}
              onkeydown={(e) => (e.key === 'Enter' || e.key === ' ') && openItem(row.key)}>
              {#if row.childCount && !search.trim()}
                <button class="pf-twist" aria-label={expanded.has(row.key) ? 'Close' : 'Open'}
                  onclick={(e) => { e.stopPropagation(); toggle(row.key); }}>{expanded.has(row.key) ? '▾' : '▸'}</button>
              {:else}
                <span class="pf-twist"></span>
              {/if}
              <span class="pf-name">{row.name || row.id}</span>
              <span class="pf-type">{row.type}</span>
              {#if drafts.has(row.key)}<span class="pf-draft" title="An edit not applied yet">●</span>{/if}
            </div>
          {/if}
        {/each}
        {#if search.trim() && visibleRows.length === 0}
          <div class="noresults">No control matches “{search}”.</div>
        {/if}
      </div>
    </div>

    <section class="pf-main">
      {#if item && current}
        <div class="codehead pf-head">
          <span class="lang">{title()}</span>
          <span class="pf-actions">
            <label class="pf-toggle" title="Show every field, defaults included, to read">
              <input type="checkbox" checked={showAll} onchange={(e) => showAll = e.target.checked} /> Every field
            </label>
            {#if item.kind === 'control'}
              <button class="btn ghost" onclick={showOnPanel} title="Switch to the panel with this control selected">Show on the panel</button>
            {/if}
            <button class="btn ghost" onclick={revert} disabled={!draft || showAll} title="Back to what the panel has">Revert</button>
            <button class="btn primary" onclick={apply} disabled={!dirty || showAll} title="Apply to the panel (Ctrl+Enter)">Apply</button>
          </span>
        </div>
        <p class="pf-hint">{hint()}</p>
        {#if heldBackLine()}<p class="pf-hint">{heldBackLine()}</p>{/if}
        {#if stale && !showAll}
          <div class="problem warn pf-stale">
            <span>!</span>
            <span>This item has changed since you started editing it (an undo, or an edit elsewhere). Applying replaces it with your text.
              <button class="btn ghost tiny" onclick={revert}>Discard my edit</button></span>
          </div>
        {/if}

        <div class="pf-editor">
          {#key `${selectedKey}:${showAll}`}
            <CodeEditor bind:this={editor} language="json" minHeight={320}
              value={showAll ? fullText : text}
              readOnly={showAll}
              oninput={onInput}
              onrun={apply} />
          {/key}
        </div>

        {#if messages.errors.length || messages.warnings.length || messages.note}
          <div class="problems">
            {#each messages.errors as e, i (i)}
              <div class="problem error" role="button" tabindex="0"
                onclick={() => e.line && editor?.revealLine(e.line, e.col)}
                onkeydown={(ev) => ev.key === 'Enter' && e.line && editor?.revealLine(e.line, e.col)}>
                <span>✕</span><span>{e.line ? `Line ${e.line}: ` : ''}{e.message}</span>
              </div>
            {/each}
            {#each messages.warnings as w, i (i)}
              <div class="problem warn"><span>!</span><span>{w}</span></div>
            {/each}
            {#if messages.note}<div class="problem ok"><span>✓</span><span>{messages.note}</span></div>{/if}
          </div>
        {/if}
      {:else}
        <p class="sub">Pick the panel settings or a control on the left.</p>
      {/if}
    </section>
  </div>
{/if}

<style>
  .pf { display: flex; gap: 14px; flex: 1; min-height: 0; }
  .pf-outline {
    width: 260px; flex-shrink: 0; display: flex; flex-direction: column; gap: 6px; min-height: 0;
    border-right: 1px solid var(--line); padding-right: 10px;
  }
  .pf-search { flex: none; margin: 0; }
  .pf-rows { overflow: auto; flex: 1; min-height: 0; display: flex; flex-direction: column; gap: 1px; }
  .pf-row {
    display: flex; align-items: center; gap: 6px; padding: 3px 8px; border-radius: 5px; cursor: pointer;
    font-size: 12px; color: var(--txt-dim); white-space: nowrap;
  }
  .pf-row:hover { background: var(--panel); }
  .pf-row.sel { background: var(--panel-2); color: var(--txt); }
  .pf-panel { font-weight: 600; margin-bottom: 4px; }
  .pf-twist {
    width: 14px; flex-shrink: 0; text-align: center; background: none; border: none; padding: 0;
    color: var(--txt-faint); cursor: pointer; font-size: 11px;
  }
  .pf-name { overflow: hidden; text-overflow: ellipsis; }
  .pf-type { margin-left: auto; font-size: 10.5px; color: var(--txt-faint); font-family: var(--mono); }
  .pf-draft { color: var(--accent); font-size: 10px; }
  .pf-main { flex: 1; min-width: 0; min-height: 0; display: flex; flex-direction: column; gap: 6px; }
  /* The text fills what the screen has; the messages under it stay in view. */
  .pf-editor { flex: 1; min-height: 0; display: flex; flex-direction: column; }
  .pf-editor :global(.ce) { flex: 1; }
  .pf-head { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
  .pf-actions { display: flex; gap: 6px; align-items: center; }
  .pf-toggle { display: flex; align-items: center; gap: 5px; font-size: 12px; color: var(--txt-dim); margin-right: 6px; }
  .pf-hint { margin: 0; font-size: 12px; color: var(--txt-dim); }
  .pf-stale { align-items: center; }
  .pf-empty { padding: 20px; }
</style>
