<script>
  // ScriptPicker — the tree-picker that makes the WHOLE panel API discoverable (spec Q1/Q6).
  // Three tabs: Paths (this panel's controls/properties), Events (for on(...)), Commands
  // (the API, grouped BY MODULE). Clicking inserts the right text in the current language's
  // syntax via onInsert. Driven entirely by panelApi.js.
  //
  // Commands answers to the panel's module list: a panel that pins an explicit set gets the rest
  // moved into a collapsed tail rather than shown as if it would work. See the note by `filtering`
  // for why auto is deliberately exempt.
  import {
    membersByModule,
    CONTROL_EVENTS,
    PANEL_EVENTS,
    DEVICE_EVENTS,
    insertSnippet,
    namespacedSnippet,
    memberPath,
    isValidInScope,
    panelModules,
    language as languageOf,
  } from '../scripting/panelApi.js';
  import { moduleAppliesToType, describeType, isKnownType } from '../scripting/componentSchema.js';
  import { untrack } from 'svelte';

  let {
    language = 'lua', scope = 'component', controls = [], onInsert,
    // The control this script is attached to, by name. Given one, the picker narrows to what a
    // control of that KIND can actually do — an Arpeggiator's verbs stop appearing next to a
    // Slider. '*' (any control) and an unknown name narrow nothing, which is the honest answer
    // when the picker cannot tell what it is aiming at.
    target = '',
    // The panel being edited, for module filtering. Omit it and nothing is filtered — the picker
    // still works standalone (the debug route, a test) rather than showing an empty Commands tab.
    panel = null,
    // Called when the user turns a module on from here. Without it the "enable" affordance is
    // hidden rather than shown-and-inert.
    onEnableModule = null,
    // Opening text for the search box, so a caller can point the picker at something.
    initialQuery = '',
    // Which tab opens first. Commands is the one people want; the prop exists so a caller (or a
    // test) can point the picker straight at the panel's paths.
    initialTab = 'commands',
  } = $props();

  // Seed once from the props; these are deliberately initial-only. A caller points the picker at a
  // tab or a search term to OPEN on — after that the user owns both, so a later prop change must
  // not yank the tab out from under them. untrack() says that on purpose rather than tripping
  // Svelte's state_referenced_locally warning, which reads this shape as an accident.
  let tab = $state(untrack(() => initialTab));
  let query = $state(untrack(() => initialQuery));
  let expanded = $state(new Set());

  const COMMON_LEAVES = ['value', 'normalizedValue', 'midiValue', 'visible', 'x', 'y', 'background.fill.colour', 'text.text'];

  let q = $derived(query.trim().toLowerCase());

  // Which spelling to insert. Both work and will keep working; ce.* is the canonical one, so it is
  // the default — inserting the flat name while the rest of the system talks in modules would be
  // teaching the form that is on its way out.
  const SPELLING_KEY = 'ce-picker-spelling';
  let spelling = $state((() => {
    try { return localStorage.getItem(SPELLING_KEY) === 'flat' ? 'flat' : 'module'; } catch { return 'module'; }
  })());
  function setSpelling(next) {
    spelling = next;
    try { localStorage.setItem(SPELLING_KEY, next); } catch { /* ignore */ }
  }

  /* --- module filtering (slice 4) -----------------------------------------------------------
   * A panel on a MANUAL module list gets the picker narrowed to that list: the rest moves into a
   * collapsed "Not enabled" section rather than vanishing, because a verb you cannot find is a
   * worse problem than one you have to switch on.
   *
   * On AUTO the picker is NOT filtered, and that is deliberate. Auto derives the list from what the
   * scripts already reference, so filtering it would mean you cannot discover a verb until you have
   * used it — the picker would only ever show you what you already knew. Inserting the call is what
   * turns the module on. */
  let moduleState = $derived(panel ? panelModules(panel) : null);
  let filtering = $derived(moduleState?.mode === 'manual');
  const isEnabled = (module) => !filtering || !module || module.global || moduleState.enabled.includes(module.id);

  /* --- narrowing to the target control ------------------------------------------------------
   * The module list answers "what can ce.components.arp do". It never answered the question the
   * person editing a script actually has: *what of this applies to the control I am on?* With a
   * concrete target we can answer it — COMPONENT_TYPES says which sections a Slider has, and a
   * family whose section it hasn't got is not a thing you can do to it.
   *
   * The toggle is not decoration. Narrowing hides real API, and someone who wants to see the whole
   * surface (to learn it, or because they are about to retarget the script) must be able to. */
  let targetType = $derived((() => {
    const name = String(target ?? '').trim();
    if (!name || name === '*' || name === 'self') return '';
    const hit = (controls ?? []).find((c) => c.name === name);
    return isKnownType(hit?.type) ? String(hit.type) : '';
  })());
  let narrowable = $derived(targetType !== '');
  let narrowPref = $state(true);
  let narrowing = $derived(narrowable && narrowPref);
  const fitsTarget = (module) => !narrowing || !module || moduleAppliesToType(module.id, targetType);

  const matches = (m) => !q || m.id.toLowerCase().includes(q)
    || memberPath(m.id).toLowerCase().includes(q)
    || (m.summary ?? '').toLowerCase().includes(q);

  let allGroups = $derived(
    membersByModule()
      .map((g) => ({ ...g, on: isEnabled(g.module), fits: fitsTarget(g.module), items: g.members.filter(matches) }))
      .filter((g) => g.items.length),
  );
  // "Does not apply" beats "not enabled": enabling ce.components.arp would still not give a Slider
  // an Arp section, so the weaker complaint is not the one to show.
  let fittingGroups = $derived(allGroups.filter((g) => g.fits));
  let unfitGroups = $derived(allGroups.filter((g) => !g.fits));
  let commandGroups = $derived(fittingGroups.filter((g) => g.on));
  let offGroups = $derived(fittingGroups.filter((g) => !g.on));
  let showOff = $state(false);
  // Searching opens the off section, the same way the Paths tab auto-opens matching controls.
  // Someone who types "sendCC" and gets "Not enabled — 1 module" with no way to see what matched
  // has been told less than nothing.
  let offOpen = $derived(showOff || q.length > 0);

  function snippetFor(member) {
    return spelling === 'module' ? namespacedSnippet(member, language) : insertSnippet(member, language);
  }
  function groupLabel(g) { return g.module ? g.module.id : 'Lifecycle'; }

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
  // Narrowing drops it to the one control the script is attached to — but only while the search
  // box is empty. Typing is an explicit act of looking further afield, and a search that silently
  // refused to leave the target would look broken.
  let pathSource = $derived(
    narrowing && !q ? controls.filter((c) => c.name === target) : controls,
  );
  let pathControls = $derived(
    pathSource
      .map((c) => {
        const leaves = c.leaves ?? COMMON_LEAVES;
        const nameHit = c.name.toLowerCase().includes(q);
        const filtered = q && !nameHit ? leaves.filter((l) => `${c.name}.${l}`.toLowerCase().includes(q)) : leaves;
        return { name: c.name, leaves: filtered, show: !q || nameHit || filtered.length > 0 };
      })
      .filter((c) => c.show),
  );
  // While searching, auto-open every matching control so the hits are visible. Narrowed to a
  // single target, open it too — one collapsed row is not a tree, it is a dead end.
  function isOpen(name) { return q || (narrowing && name === target) ? true : expanded.has(name); }

  // Turn a snippet template into plain text for a <textarea> (no tab-stops).
  function plain(snippet) {
    return String(snippet)
      .replace(/\$\{\d+:([^}]*)\}/g, '$1')
      .replace(/\$\{\d+\}/g, '')
      .replace(/\$0/g, '');
  }

  function insert(text) { onInsert?.(text); }

  function insertCommand(member) { insert(plain(snippetFor(member))); }

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
  {#if narrowable}
    <div class="pnarrow" data-testid="picker-narrow">
      <span class="pd" title={describeType(targetType)}>{target} · {targetType}</span>
      <div class="pseg">
        <button class={['pseg-btn', narrowing && 'pseg-on']} onclick={() => narrowPref = true}
                title={`Show only what applies to a ${targetType}`}>this control</button>
        <button class={['pseg-btn', !narrowing && 'pseg-on']} onclick={() => narrowPref = false}
                title="Show the whole API, including what this control has no section for">all</button>
      </div>
    </div>
  {/if}
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
    <div class="pspell">
      <span class="pd">Insert as</span>
      <div class="pseg">
        <button class={['pseg-btn', spelling === 'module' && 'pseg-on']} onclick={() => setSpelling('module')}
                title="The canonical spelling — ce.midi.sendCC(…). ce.core stays unprefixed.">ce.*</button>
        <button class={['pseg-btn', spelling === 'flat' && 'pseg-on']} onclick={() => setSpelling('flat')}
                title="The flat alias — sendCC(…). Still supported; ce.* is the form to prefer.">flat</button>
      </div>
    </div>

    {#each commandGroups as g (groupLabel(g))}
      <div class="pcat">
        {groupLabel(g)}
        {#if g.module?.summary}<span class="pcat-sub">{g.module.summary}</span>{/if}
      </div>
      {#each g.items as m (m.id)}
        {@const invalid = !isValidInScope(m, scope)}
        <div class={['pitem', invalid && 'invalid']} role="button" tabindex="0"
          title={invalid ? `Only in ${(m.scopes || []).join('/')} scripts` : m.signature}
          onclick={() => insertCommand(m)}
          onkeydown={(e) => (e.key === 'Enter' || e.key === ' ') && insertCommand(m)}>
          <div class="pn">{spelling === 'module' ? memberPath(m.id) : m.id}<span class="pd">{(m.signature ?? '').slice((m.id ?? '').length)}</span></div>
          <div class="pd">{m.summary}{invalid ? `  ·  ${(m.scopes || []).join('/')} only` : ''}</div>
        </div>
      {/each}
    {/each}

    {#if offGroups.length}
      <div class="poff-head" role="button" tabindex="0" onclick={() => showOff = !showOff}
           onkeydown={(e) => (e.key === 'Enter' || e.key === ' ') && (showOff = !showOff)}>
        {offOpen ? '▾' : '▸'} Not enabled — {offGroups.length} module{offGroups.length === 1 ? '' : 's'}
        <span class="pd">this panel pins its modules on the Export tab</span>
      </div>
      {#if offOpen}
        {#each offGroups as g (groupLabel(g))}
          <div class="pcat pcat-off">
            {groupLabel(g)}
            {#if onEnableModule}
              <button class="penable" onclick={() => onEnableModule(g.module.id)}
                      title={`Add ${g.module.id} to this panel's modules`}>enable</button>
            {/if}
          </div>
          {#each g.items as m (m.id)}
            <div class="pitem pitem-off" title="This module is not enabled — the call would log a notice instead of acting.">
              <div class="pn">{memberPath(m.id)}<span class="pd">{(m.signature ?? '').slice((m.id ?? '').length)}</span></div>
              <div class="pd">{m.summary}</div>
            </div>
          {/each}
        {/each}
      {/if}
    {/if}

    {#if unfitGroups.length}
      <div class="poff-head" data-testid="picker-unfit" role="button" tabindex="0" onclick={() => narrowPref = false}
           onkeydown={(e) => (e.key === 'Enter' || e.key === ' ') && (narrowPref = false)}>
        ▸ Not for a {targetType} — {unfitGroups.length} module{unfitGroups.length === 1 ? '' : 's'}
        <span class="pd">this control has no such section · show anyway</span>
      </div>
    {/if}

    {#if commandGroups.length === 0 && offGroups.length === 0 && unfitGroups.length === 0}
      <div class="pcat">Nothing matches “{query}”.</div>
    {/if}
  {/if}
</div>
