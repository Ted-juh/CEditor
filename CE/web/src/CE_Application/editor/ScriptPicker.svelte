<script>
  // ScriptPicker — the tree-picker that makes the WHOLE panel API discoverable (spec Q1/Q6).
  // Three tabs: Paths (this panel's controls/properties), Events (for on(...)), Commands
  // (categorized API verbs + helpers). Clicking inserts the right text in the current
  // language's syntax via onInsert. Driven entirely by panelApi.js.
  import {
    membersByCategory,
    CONTROL_EVENTS,
    PANEL_EVENTS,
    DEVICE_EVENTS,
    insertSnippet,
    isValidInScope,
    language as languageOf,
  } from '../scripting/panelApi.js';

  let { language = 'lua', scope = 'component', controls = [], onInsert } = $props();

  let tab = $state('commands');
  let query = $state('');
  let expanded = $state(new Set());

  const COMMON_LEAVES = ['value', 'normalizedValue', 'midiValue', 'visible', 'x', 'y', 'background.fill.colour', 'text.text'];

  let q = $derived(query.trim().toLowerCase());

  let commandCats = $derived(
    membersByCategory()
      .map((c) => ({
        category: c.category,
        items: c.items.filter((m) =>
          !q || m.id.toLowerCase().includes(q) || (m.summary ?? '').toLowerCase().includes(q)),
      }))
      .filter((c) => c.items.length),
  );

  const EVENT_GROUPS = [
    { group: 'Control', items: CONTROL_EVENTS },
    { group: 'Panel', items: PANEL_EVENTS },
    { group: 'Device', items: DEVICE_EVENTS },
  ];
  let eventGroups = $derived(
    EVENT_GROUPS.map((g) => ({
      group: g.group,
      items: g.items.filter((e) => !q || e.id.toLowerCase().includes(q) || (e.summary ?? '').toLowerCase().includes(q)),
    })).filter((g) => g.items.length),
  );

  // Paths tab: each control's real leaves (full property set), filtered by the search query.
  let pathControls = $derived(
    controls
      .map((c) => {
        const leaves = c.leaves ?? COMMON_LEAVES;
        const nameHit = c.name.toLowerCase().includes(q);
        const filtered = q && !nameHit ? leaves.filter((l) => `${c.name}.${l}`.toLowerCase().includes(q)) : leaves;
        return { name: c.name, leaves: filtered, show: !q || nameHit || filtered.length > 0 };
      })
      .filter((c) => c.show),
  );
  // While searching, auto-open every matching control so the hits are visible.
  function isOpen(name) { return q ? true : expanded.has(name); }

  // Turn a snippet template into plain text for a <textarea> (no tab-stops).
  function plain(snippet) {
    return String(snippet)
      .replace(/\$\{\d+:([^}]*)\}/g, '$1')
      .replace(/\$\{\d+\}/g, '')
      .replace(/\$0/g, '');
  }

  function insert(text) { onInsert?.(text); }

  function insertCommand(member) { insert(plain(insertSnippet(member, language))); }

  function insertEvent(ev) {
    const lang = languageOf(language);
    const block = lang.block.replace('${e}', ev.payload ?? 'e');
    insert(`on("${'target'}", "${ev.id}", ${block.replace('$0', '')})`);
  }

  // A sensible, fillable value placeholder for a property, inferred from its name.
  function valuePlaceholderFor(path) {
    const leaf = String(path).split('.').pop().toLowerCase();
    if (leaf.includes('colour') || leaf.includes('color')) return '"#ffffff"';
    if (leaf === 'visible' || leaf === 'enabled' || leaf === 'locked') return 'true';
    if (leaf === 'text' || leaf === 'name' || leaf === 'label') return '""';
    return '0';
  }
  // Click a property → insert a ready-to-use set(...) call with a fillable value (colour hex for colours).
  function insertPath(path) { insert(`set("${path}", ${valuePlaceholderFor(path)})\n`); }

  function toggle(name) {
    const next = new Set(expanded);
    next.has(name) ? next.delete(name) : next.add(name);
    expanded = next;
  }
</script>

<div class="picker">
  <div class="ptabs">
    <button class={['ptab', tab === 'paths' && 'active']} onclick={() => tab = 'paths'}>Paths</button>
    <button class={['ptab', tab === 'events' && 'active']} onclick={() => tab = 'events'}>Events</button>
    <button class={['ptab', tab === 'commands' && 'active']} onclick={() => tab = 'commands'}>Commands</button>
  </div>
  <div class="psearch">
    <input placeholder="Search the API…" value={query} oninput={(e) => query = e.target.value} onfocus={(e) => e.target.select()} />
  </div>

  {#if tab === 'paths'}
    <div class="ptree">
      {#if controls.length === 0}
        <div class="pcat">No panel context here — open inside a panel to browse its controls. (You can still type paths.)</div>
      {:else if pathControls.length === 0}
        <div class="pcat">No paths match “{query}”.</div>
      {/if}
      {#each pathControls as c (c.name)}
        <div class="pctrl" role="button" tabindex="0" onclick={() => toggle(c.name)}
          onkeydown={(e) => (e.key === 'Enter' || e.key === ' ') && toggle(c.name)}>
          {isOpen(c.name) ? '▾' : '▸'} {c.name} <span class="pd">{c.leaves.length}</span>
        </div>
        {#if isOpen(c.name)}
          {#each c.leaves as leaf (leaf)}
            <div class="pleaf" role="button" tabindex="0" onclick={() => insertPath(`${c.name}.${leaf}`)}
              onkeydown={(e) => (e.key === 'Enter' || e.key === ' ') && insertPath(`${c.name}.${leaf}`)}>
              {c.name}.{leaf}
            </div>
          {/each}
        {/if}
      {/each}
    </div>
  {:else if tab === 'events'}
    {#each eventGroups as g (g.group)}
      <div class="pcat">{g.group}</div>
      {#each g.items as ev (ev.id)}
        <div class="pitem" role="button" tabindex="0" onclick={() => insertEvent(ev)}
          onkeydown={(e) => (e.key === 'Enter' || e.key === ' ') && insertEvent(ev)}>
          <div class="pn">{ev.fn} <span class="pd">({ev.payload ?? ''})</span></div>
          <div class="pd">{ev.summary}</div>
        </div>
      {/each}
    {/each}
  {:else}
    {#each commandCats as c (c.category)}
      <div class="pcat">{c.category}</div>
      {#each c.items as m (m.id)}
        {@const invalid = !isValidInScope(m, scope)}
        <div class={['pitem', invalid && 'invalid']} role="button" tabindex="0"
          title={invalid ? `Only in ${(m.scopes || []).join('/')} scripts` : m.signature}
          onclick={() => insertCommand(m)}
          onkeydown={(e) => (e.key === 'Enter' || e.key === ' ') && insertCommand(m)}>
          <div class="pn">{m.signature ?? m.id}</div>
          <div class="pd">{m.summary}{invalid ? `  ·  ${(m.scopes || []).join('/')} only` : ''}</div>
        </div>
      {/each}
    {/each}
  {/if}
</div>
