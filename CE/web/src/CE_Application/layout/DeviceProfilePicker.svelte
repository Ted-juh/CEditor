<script>
  /**
   * The device profile picker. One window for every place that chooses a profile: Settings ›
   * MIDI, the Device tool, the tab bar's Open Device Profile and File › New Panel from Device
   * Profile. Each opens it through openProfilePicker() with what choosing does there.
   *
   * Brands across the top, because a user looks for their own synth: the brand row narrows to
   * one maker, the search box to a model, and the panel's own profile and the recent ones sit
   * above the list. What a profile can do (read the synth back, recall presets, recognise the
   * synth) is in the pane on the right, about the one you are on, not on every row.
   */
  import { tick, untrack } from 'svelte';
  import { deviceProfiles, importDeviceProfile, refreshDeviceProfiles } from '../stores/deviceProfiles.js';
  import { openDeviceProfileEntry } from '../stores/recentFileActions.js';
  import { profilePickerRequest, closeProfilePicker, recentDeviceProfiles, recordProfileUse } from '../stores/deviceProfilePicker.js';
  import { brandChips, capabilities, catalogEntries, filterCatalog, groupCatalog } from '../utils/profileCatalog.js';

  let query = $state('');
  let brand = $state('');
  let showHidden = $state(false);
  let selectedId = $state('');
  let openMakers = $state({});
  let searchInput = $state(null);
  let listElement = $state(null);

  let request = $derived($profilePickerRequest);
  let entries = $derived(catalogEntries($deviceProfiles));
  let byId = $derived(new Map(entries.map((entry) => [entry.id, entry])));
  let searching = $derived(query.trim().length > 0);
  let chips = $derived(brandChips(entries, { showHidden }).map((chip) => ({
    ...chip,
    count: filterCatalog(entries, { query, brand: chip.id, showHidden }).length,
  })));
  let shown = $derived(filterCatalog(entries, { query, brand, showHidden }));
  let groups = $derived(groupCatalog(shown));
  let showPinned = $derived(!searching && !brand);
  let panelEntries = $derived((request?.panelProfileIds ?? []).map((id) => byId.get(id)).filter(Boolean));
  let recentEntries = $derived(
    ($recentDeviceProfiles ?? [])
      .filter((id) => !(request?.panelProfileIds ?? []).includes(id))
      .map((id) => byId.get(id))
      .filter((entry) => entry && (showHidden || !entry.hidden))
      .slice(0, 3)
  );
  let selected = $derived(byId.get(selectedId) ?? null);
  let selectedCaps = $derived(selected ? capabilities(selected) : []);
  let replacement = $derived(selected?.supersededBy ? byId.get(selected.supersededBy) : null);

  const isOpen = (maker) => searching || brand === maker || openMakers[maker] === true;

  /** Every row in the order it is drawn, each profile once: what the arrow keys walk. */
  let visibleIds = $derived.by(() => {
    const ids = [];
    const add = (entry) => { if (!ids.includes(entry.id)) ids.push(entry.id); };
    if (showPinned) { panelEntries.forEach(add); recentEntries.forEach(add); }
    for (const group of groups) if (isOpen(group.maker)) for (const family of group.families) family.entries.forEach(add);
    return ids;
  });

  $effect(() => {
    const opened = $profilePickerRequest;
    if (!opened) return;
    untrack(() => {
      refreshDeviceProfiles();
      query = '';
      brand = '';
      showHidden = false;
      const start = byId.get(opened.selectedId) ?? byId.get(opened.panelProfileIds?.[0]) ?? entries.find((entry) => !entry.hidden) ?? null;
      selectedId = start?.id ?? '';
      openMakers = start ? { [start.maker]: true } : {};
    });
    tick().then(() => searchInput?.focus());
  });

  function choose(entry) {
    if (!entry) return;
    selectedId = entry.id;
  }

  function pick(entry = selected) {
    if (!entry || !request) return;
    const onPick = request.onPick;
    recordProfileUse(entry.id);
    closeProfilePicker();
    onPick?.(entry.id, entry.profile);
  }

  function openInDesigner() {
    if (!selected) return;
    recordProfileUse(selected.id);
    closeProfilePicker();
    openDeviceProfileEntry({ id: selected.id, name: selected.name });
  }

  function toggleMaker(maker) {
    openMakers = { ...openMakers, [maker]: !isOpen(maker) };
  }

  async function move(step) {
    if (!visibleIds.length) return;
    const at = visibleIds.indexOf(selectedId);
    const next = at < 0 ? (step > 0 ? 0 : visibleIds.length - 1) : Math.min(visibleIds.length - 1, Math.max(0, at + step));
    selectedId = visibleIds[next];
    await tick();
    listElement?.querySelector(`[data-profile-id="${CSS.escape(selectedId)}"]`)?.scrollIntoView({ block: 'nearest' });
  }

  function handleKeydown(event) {
    if (event.key === 'Escape') { event.preventDefault(); closeProfilePicker(); return; }
    if (event.key === 'ArrowDown') { event.preventDefault(); move(1); return; }
    if (event.key === 'ArrowUp') { event.preventDefault(); move(-1); return; }
    if (event.key === 'Enter' && event.target?.tagName !== 'BUTTON') { event.preventDefault(); pick(); }
  }

  const formatCount = (n) => (Number.isInteger(n) ? n.toLocaleString('en-US') : '—');
  const familyLine = (entry, withMaker) => {
    if (!entry.family || entry.maker === 'Generic') return entry.maker === 'Generic' ? 'Any instrument that takes CCs' : entry.maker;
    return `${withMaker ? `${entry.maker} · ` : ''}${entry.family} family`;
  };
</script>

{#snippet row(entry, pinned)}
  <button
    type="button"
    class="row"
    class:pinned
    class:current={entry.id === selectedId}
    aria-current={entry.id === selectedId ? 'true' : undefined}
    data-profile-id={entry.id}
    onclick={() => choose(entry)}
    ondblclick={() => pick(entry)}
  >
    <span class="row-text">
      <span class="row-name">{pinned ? entry.name : entry.shortName}</span>
      <!-- Under its family's heading a row needs no second line; pinned rows have no heading. -->
      {#if pinned || entry.hidden}
        <span class="row-sub">{entry.hidden ? 'Older version' : familyLine(entry, true)}</span>
      {/if}
    </span>
    <span class="row-count">{formatCount(entry.parameterCount)}</span>
    {#if entry.kind}<span class="kind kind-{entry.kind.toLowerCase()}">{entry.kind}</span>{/if}
  </button>
{/snippet}

{#if request}
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="backdrop" onmousedown={(event) => { if (event.target === event.currentTarget) closeProfilePicker(); }} onkeydown={handleKeydown}>
    <div class="picker" role="dialog" aria-modal="true" aria-labelledby="profile-picker-title">
      <div class="head">
        <div class="title-row">
          <div class="title">
            <span id="profile-picker-title">{request.title}</span>
            {#if request.subtitle}<span class="subtitle">{request.subtitle}</span>{/if}
          </div>
          <button type="button" class="icon-button" aria-label="Close" onclick={closeProfilePicker}>
            <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><path d="M3 3l8 8M11 3l-8 8" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" /></svg>
          </button>
        </div>

        <div class="search">
          <svg width="15" height="15" viewBox="0 0 16 16" aria-hidden="true"><circle cx="7" cy="7" r="4.6" fill="none" stroke="currentColor" stroke-width="1.5" /><path d="M10.6 10.6l3.2 3.2" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" /></svg>
          <input
            bind:this={searchInput}
            bind:value={query}
            type="text"
            aria-label="Search profiles"
            autocomplete="off"
            spellcheck="false"
            placeholder={`Search ${entries.filter((entry) => !entry.hidden).length} profiles: model, brand or family`}
          />
          {#if searching}
            <span class="match-count">{shown.length} {shown.length === 1 ? 'match' : 'matches'}</span>
            <button type="button" class="clear" aria-label="Clear search" onclick={() => { query = ''; searchInput?.focus(); }}>
              <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true"><path d="M2 2l6 6M8 2l-6 6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" /></svg>
            </button>
          {/if}
        </div>

        <div class="brands" role="group" aria-label="Brand">
          {#each chips as chip (chip.id)}
            <button
              type="button"
              class="chip"
              class:on={brand === chip.id}
              class:none={chip.count === 0}
              aria-pressed={brand === chip.id}
              aria-label={`${chip.label}, ${chip.count} ${chip.count === 1 ? 'profile' : 'profiles'}`}
              onclick={() => { brand = chip.id; }}
            >
              {chip.label}<span class="chip-count">{chip.count}</span>
            </button>
          {/each}
        </div>
      </div>

      <div class="body">
        <div class="list" bind:this={listElement}>
          {#if entries.length === 0}
            <div class="empty">
              <strong>No device profiles are loaded.</strong>
              <span>The desktop app lists the profiles it comes with. You can also import a profile file.</span>
            </div>
          {:else}
            {#if showPinned && panelEntries.length}
              <div class="section">This panel</div>
              {#each panelEntries as entry (entry.id)}{@render row(entry, true)}{/each}
            {/if}
            {#if showPinned && recentEntries.length}
              <div class="section">Recent</div>
              {#each recentEntries as entry (entry.id)}{@render row(entry, true)}{/each}
            {/if}
            {#if showPinned && (panelEntries.length || recentEntries.length)}
              <div class="section">All profiles, by brand</div>
            {/if}
            {#each groups as group (group.maker)}
              <button type="button" class="maker" aria-expanded={isOpen(group.maker)} onclick={() => toggleMaker(group.maker)}>
                <svg class="chevron" class:open={isOpen(group.maker)} width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path d="M4 2.5L7.5 6 4 9.5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" /></svg>
                <span class="maker-name">{group.maker}</span>
                <span class="maker-count">{group.count} {group.count === 1 ? 'profile' : 'profiles'}</span>
              </button>
              {#if isOpen(group.maker)}
                {#each group.families as family (family.family)}
                  <div class="family">{family.family}</div>
                  {#each family.entries as entry (entry.id)}{@render row(entry, false)}{/each}
                {/each}
              {/if}
            {/each}
            {#if shown.length === 0}
              <div class="empty">
                <strong>No profile matches “{query}”{brand ? ` from ${brand}` : ''}.</strong>
                <span>Try a model number, another brand, or import a profile file.</span>
              </div>
            {/if}
          {/if}
        </div>

        <aside class="detail" aria-label="About this profile">
          {#if selected}
            <div class="detail-head">
              <span class="detail-name">{selected.name}</span>
              <span class="detail-sub">{familyLine(selected, true)}</span>
            </div>
            <div class="stats">
              <div class="stat"><span>Parameters</span><strong>{formatCount(selected.parameterCount)}</strong></div>
              <div class="stat"><span>Speaks</span><strong class="small">{selected.speaks}</strong></div>
            </div>
            <ul class="caps">
              {#each selectedCaps as cap (cap.text)}
                <li class:no={!cap.yes}>
                  {#if cap.yes}
                    <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><path d="M2.5 7.4l2.8 2.8 6-6.4" fill="none" stroke="#7FC8A0" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" /></svg>
                  {:else}
                    <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><path d="M3.5 7h7" stroke="#6E7C87" stroke-width="1.7" stroke-linecap="round" /></svg>
                  {/if}
                  <span>{cap.text}</span>
                </li>
              {/each}
            </ul>
            <div class="source">
              <span>Read from</span>
              <p>{selected.source || 'Made in the Device Profile Designer'}</p>
            </div>
            {#if selected.hidden}
              <div class="notice">
                {selected.hiddenReason}{replacement ? ` Replaced by ${replacement.name}.` : ''}
              </div>
            {/if}
            {#if !selected.verified}
              <div class="notice">Not tried on a real instrument yet.</div>
            {/if}
            <div class="spacer"></div>
            <div class="actions">
              <button type="button" class="primary" onclick={() => pick()}>{request.actionLabel}</button>
              {#if request.actionLabel !== 'Open in Designer'}
                <button type="button" class="secondary" onclick={openInDesigner}>Open in Designer</button>
              {/if}
            </div>
          {:else}
            <p class="detail-empty">Choose a profile to see what it covers.</p>
          {/if}
        </aside>
      </div>

      <div class="foot">
        <button type="button" class="link" onclick={importDeviceProfile}>Import profile file…</button>
        <label class="toggle">
          <input type="checkbox" bind:checked={showHidden} />
          Show older and internal profiles
        </label>
        <span class="keys">↑ ↓ move · Enter use · Esc close</span>
      </div>
    </div>
  </div>
{/if}

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    z-index: 2400;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(0, 0, 0, 0.45);
  }

  .picker {
    width: min(880px, calc(100vw - 48px));
    height: min(620px, calc(100vh - 64px));
    display: flex;
    flex-direction: column;
    background: #171a1d;
    border: 1px solid #3b4652;
    border-radius: 8px;
    box-shadow: 0 16px 48px rgba(0, 0, 0, 0.55);
    color: #d8e0e8;
    overflow: hidden;
    font-size: 13px;
  }

  .head { padding: 14px 16px 12px; display: flex; flex-direction: column; gap: 10px; }
  .title-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
  .title { display: flex; align-items: baseline; gap: 8px; font-size: 14px; font-weight: 600; color: #e8eef3; }
  .subtitle { font-size: 12px; font-weight: 400; color: #93a3af; }

  .icon-button, .clear {
    display: flex; align-items: center; justify-content: center;
    border: none; border-radius: 4px; background: transparent; color: #93a3af; cursor: pointer;
  }
  .icon-button { width: 28px; height: 28px; }
  .icon-button:hover { background: #2a3038; color: #fff; }

  .search {
    display: flex; align-items: center; gap: 8px; height: 36px; padding: 0 10px;
    background: #0f1215; border: 1px solid #3b4652; border-radius: 6px; color: #93a3af;
  }
  .search:focus-within { border-color: #5b9bd5; }
  .search input {
    flex: 1; min-width: 0; height: 100%; border: none; outline: none; background: transparent;
    color: #e8eef3; font: inherit; font-size: 13px;
  }
  .match-count { font-size: 12px; white-space: nowrap; }
  .clear { width: 22px; height: 22px; background: #262c33; color: #c5d0d8; }

  .brands { display: flex; flex-wrap: wrap; gap: 6px; }
  .chip {
    height: 28px; padding: 0 10px; border: 1px solid #30343a; border-radius: 14px;
    background: #202326; color: #c5d0d8; font: inherit; font-size: 12px; cursor: pointer;
  }
  .chip:hover { border-color: #4a5a6a; }
  .chip.on { border-color: #5b9bd5; background: #243241; color: #e8eef3; }
  .chip.none { color: #6e7c87; border-color: #262b31; }
  .chip-count { margin-left: 5px; color: #93a3af; }

  .body { flex: 1; min-height: 0; display: flex; border-top: 1px solid #262b31; }
  .list { flex: 1; min-width: 0; overflow-y: auto; padding: 8px 8px 14px; }
  .section {
    padding: 10px 10px 4px; font-size: 11px; font-weight: 600; letter-spacing: 0.06em;
    text-transform: uppercase; color: #93a3af;
  }
  .section:first-child { padding-top: 6px; }

  .maker {
    display: flex; align-items: center; gap: 8px; width: 100%; padding: 7px 10px;
    border: none; border-radius: 5px; background: transparent; color: #e3eaf0;
    font: inherit; font-size: 13px; font-weight: 600; text-align: left; cursor: pointer;
  }
  .maker:hover { background: #1e2227; }
  .maker-name { flex: 1; }
  .maker-count { font-size: 11px; font-weight: 400; color: #93a3af; }
  .chevron { flex: none; color: #93a3af; transition: transform 120ms; }
  .chevron.open { transform: rotate(90deg); }
  .family { padding: 6px 10px 2px 30px; font-size: 11px; color: #93a3af; }

  .row {
    display: flex; align-items: center; gap: 10px; width: 100%; box-sizing: border-box;
    padding: 6px 10px 6px 30px; border: 1px solid transparent; border-radius: 5px;
    background: transparent; color: inherit; font: inherit; text-align: left; cursor: pointer;
  }
  .row.pinned { padding-left: 10px; }
  .row:hover { background: #1f2b37; }
  .row.current { border-color: #5b9bd5; background: #243241; }
  .row-text { display: flex; flex-direction: column; gap: 2px; min-width: 0; flex: 1; }
  .row-name { font-size: 13px; color: #e3eaf0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .row-sub { font-size: 11px; color: #93a3af; }
  .row-count { font-size: 11px; color: #93a3af; font-variant-numeric: tabular-nums; }

  .kind {
    font-size: 10.5px; font-weight: 600; padding: 2px 6px; border-radius: 4px;
    min-width: 40px; text-align: center; box-sizing: border-box;
  }
  .kind-sysex { background: #1f2e3d; color: #8fc1ec; }
  .kind-nrpn, .kind-rpn { background: #2e2a1f; color: #e2be7a; }
  .kind-cc { background: #2a2633; color: #c2b3ea; }

  .empty { padding: 28px 16px; display: flex; flex-direction: column; gap: 6px; align-items: center; text-align: center; }
  .empty strong { font-weight: 400; color: #d8e0e8; }
  .empty span { font-size: 12px; color: #93a3af; }

  .detail {
    width: 300px; flex: none; box-sizing: border-box; border-left: 1px solid #262b31;
    background: #1a1d21; padding: 16px; display: flex; flex-direction: column; gap: 14px; overflow-y: auto;
  }
  .detail-head { display: flex; flex-direction: column; gap: 3px; }
  .detail-name { font-size: 16px; font-weight: 600; color: #eef3f7; }
  .detail-sub { font-size: 12px; color: #93a3af; }
  .stats { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
  .stat { background: #20252a; border-radius: 6px; padding: 8px 10px; display: flex; flex-direction: column; gap: 2px; }
  .stat span { font-size: 11px; color: #93a3af; }
  .stat strong { font-size: 16px; color: #e3eaf0; font-variant-numeric: tabular-nums; }
  .stat strong.small { font-size: 13px; padding-top: 2px; }
  .caps { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 7px; }
  .caps li { display: flex; align-items: flex-start; gap: 8px; font-size: 12px; line-height: 16px; }
  .caps li svg { flex: none; margin-top: 1px; }
  .caps li.no span { color: #93a3af; }
  .source span { font-size: 11px; color: #93a3af; }
  .source p { margin: 3px 0 0; font-size: 12px; line-height: 16px; color: #c9d3db; }
  .notice {
    background: #23211a; border: 1px solid #3d3626; border-radius: 6px; padding: 8px 10px;
    font-size: 12px; line-height: 16px; color: #d9cba6;
  }
  .spacer { flex: 1; }
  .actions { display: flex; flex-direction: column; gap: 8px; }
  .primary {
    height: 34px; border: none; border-radius: 6px; background: #5b9bd5; color: #0b1621;
    font: inherit; font-size: 13px; font-weight: 600; cursor: pointer;
  }
  .primary:hover { background: #74acdf; }
  .secondary {
    height: 32px; border: 1px solid #3b4652; border-radius: 6px; background: transparent;
    color: #d8e0e8; font: inherit; font-size: 12px; cursor: pointer;
  }
  .secondary:hover { border-color: #5b9bd5; }
  .detail-empty { margin: 0; font-size: 12px; color: #93a3af; }

  .foot {
    height: 42px; flex: none; display: flex; align-items: center; justify-content: space-between;
    gap: 12px; padding: 0 16px; border-top: 1px solid #262b31; font-size: 12px;
  }
  .link { border: none; background: transparent; color: #7fb4e3; font: inherit; font-size: 12px; cursor: pointer; padding: 0; }
  .link:hover { color: #a9cdee; }
  .toggle { display: flex; align-items: center; gap: 6px; color: #93a3af; cursor: pointer; }
  .toggle input { margin: 0; accent-color: #5b9bd5; }
  .keys { color: #93a3af; }

  @media (max-width: 720px) {
    .detail { display: none; }
    .keys { display: none; }
  }
</style>
