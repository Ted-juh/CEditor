<script>
  /**
   * The selected sound: where it came from, what it measured like, what is yours about it
   * (rating, tags, collections, notes, all editable here), what it sounds like and where it
   * could go ("more like this, but brighter"), its saves and its family.
   *
   * The dock shows it as a narrow column beside the list; the Sounds page gives it the full
   * height of the window.
   */
  import HostConfirmButton from '../HostConfirmButton.svelte';
  import ParamBar from '../../components/controls/ParamBar.svelte';
  import {
    hostLibrary, setLibraryUserMetadata, removeLibraryRecord, loadLibraryRecord,
    hostVersionDiff, commitVersion, applyVersion, diffVersions, morphVersions,
    setMorph, clearMorph, setParameter,
    hostSimilar, hostRecordFamily, hostSubstitutes, rackSubstitutes, rememberSubstitute,
    emptyLibraryQuery, cycleLibraryFacet, measuredLabel,
  } from '../../stores/instrumentHost.js';
  import { TAG_FAMILIES, canonicalTag, suggestTags, tagFamily } from '../../utils/tagVocabulary.js';
  import { NUDGES, nudgedNeighbours } from '../../utils/soundNudges.js';
  import { agreedAxes, detailLine, envelopeLine, gaveUp, sourceLabel, whenSaved } from './soundsText.js';
  import { sounds } from './soundsBrowser.svelte.js';

  let {
    focusedPart = null, partTitle = () => '', layout = 'dock', revealedNote = '',
    onreveal = () => {}, onaudition = () => {},
  } = $props();

  const selected = $derived(sounds.selected);
  const page = $derived(layout === 'page');

  // Tags: yours to add and remove, spelled the vocabulary's way when it is one of its words, and
  // a few suggestions from the name that apply only when clicked.
  let tagDraft = $state('');
  const tagSuggestions = $derived(selected ? suggestTags(selected) : []);
  const knownTags = $derived([...new Set([...TAG_FAMILIES.flatMap((f) => f.tags),
    ...sounds.records.flatMap((r) => r.tags ?? [])])].sort((a, b) => a.localeCompare(b)));
  const tagGroups = $derived.by(() => {
    if (!selected) return [];
    const groups = [...TAG_FAMILIES.map((f) => ({ id: f.id, label: f.label, tags: [] })), { id: 'other', label: 'Other', tags: [] }];
    for (const tag of selected.tags) groups.find((g) => g.id === tagFamily(tag)).tags.push(tag);
    return groups.filter((g) => g.tags.length > 0);
  });
  function writeTags(record, tags) {
    setLibraryUserMetadata(record.recordId, { tags: [...new Set(tags.map(canonicalTag).filter(Boolean))] });
  }
  function addTag(record, tag) {
    const text = canonicalTag(tag);
    if (!record || !text) return;
    if (!(record.tags ?? []).some((t) => t.toLowerCase() === text.toLowerCase()))
      writeTags(record, [...(record.tags ?? []), text]);
    tagDraft = '';
  }
  const removeTag = (record, tag) => writeTags(record, (record.tags ?? []).filter((t) => t !== tag));

  // Collections: every one the library knows, and whether this sound is in it.
  const collectionNames = $derived([...new Set([...$hostLibrary.collections.map((c) => c.name), ...(selected?.collections ?? [])])]
    .sort((a, b) => a.localeCompare(b)));
  function toggleCollection(record, name) {
    const inIt = record.collections.includes(name);
    setLibraryUserMetadata(record.recordId, {
      collections: inIt ? record.collections.filter((c) => c !== name) : [...record.collections, name] });
  }

  // Notes: typed here, kept when you leave the box.
  let notesDraft = $state(null);
  $effect(() => { selected?.recordId; notesDraft = null; });
  function keepNotes() {
    if (!selected || notesDraft === null || notesDraft === selected.notes) return;
    setLibraryUserMetadata(selected.recordId, { notes: notesDraft });
  }

  // Two sounds of the focused part's plug-in become the ends of its morph: the selected one is A,
  // a neighbour is B, and the part's "@morph" address rides the line between them.
  const canMorph = $derived(Boolean(focusedPart?.hasInstrument && selected && selected.type === 'preset'));
  function morphWith(recordIdB) {
    if (!canMorph || !recordIdB || recordIdB === selected.recordId) return;
    setMorph(focusedPart.partId, selected.recordId, recordIdB);
  }

  const nudged = $derived(sounds.nudge && selected ? nudgedNeighbours(selected, sounds.records, sounds.nudge) : []);
  const nudge = $derived(NUDGES.find((n) => n.id === sounds.nudge) ?? null);

  let versionLabel = $state('');
  let namingVersion = $state(false);
  let blendAmount = $state(100);
  function saveVersion() {
    if (!selected) return;
    commitVersion(selected.recordId, versionLabel.trim() || undefined);
    versionLabel = '';
    namingVersion = false;
  }
</script>

<div class="inspector" class:page data-testid="browser-inspector">
  {#if focusedPart?.morph}
    <!-- Two sounds of one plug-in and the line between them. The bar is the part's "@morph"
         address, the same one a macro or a knob rides; nothing here is a save. -->
    <div class="insp-head">Morph</div>
    <div class="morph" data-testid="host-morph">
      <div class="morph-ends">
        <span class="morph-end" title={focusedPart.morph.nameA}>{focusedPart.morph.nameA}</span>
        <span class="morph-arrow">↔</span>
        <span class="morph-end b" title={focusedPart.morph.nameB}>{focusedPart.morph.nameB}</span>
      </div>
      {#if focusedPart.morph.live}
        <ParamBar value={focusedPart.morph.amount} text={`${Math.round(focusedPart.morph.amount * 100)}%`}
                  label={`Morph ${partTitle(focusedPart)} between ${focusedPart.morph.nameA} and ${focusedPart.morph.nameB}`}
                  testid="morph-ride" onchange={(v) => setParameter(focusedPart.partId, '@morph', v)}
                  ontype={(t) => setParameter(focusedPart.partId, '@morph', Math.max(0, Math.min(1, Number(String(t).replace(/[^0-9.]/g, '')) / 100)))}
                  onreset={() => setParameter(focusedPart.partId, '@morph', 0.5)} />
      {/if}
      {#if focusedPart.morph.refusal}
        <div class="notes bad" data-testid="morph-refusal">{focusedPart.morph.refusal}</div>
      {:else if !focusedPart.morph.live}
        <div class="notes">Load the instrument to ride it.</div>
      {:else}
        <div class="notes">On a macro: it is <b>Morph</b> in {partTitle(focusedPart)}'s parameter list — M+ puts it on the selected macro, ⚡ on a knob.</div>
      {/if}
      <HostConfirmButton identity={JSON.stringify([focusedPart.partId])} aria-label="Clear morph" type="button" class="ghost morph-clear" data-testid="morph-clear"
              title="Forget the pair. The sound stays where the ride left it."
              onclick={() => clearMorph(focusedPart.partId)}>Clear the morph</HostConfirmButton>
    </div>
  {/if}

  {#if selected}
    <div class="insp-name">{selected.name}</div>
    <div class="insp-sub">{detailLine(selected)}{#if selected.loadCount > 0} · loaded {selected.loadCount}×{/if}</div>

    {#if page && selected.sonic && !selected.sonic.silent}
      <svg class="big-env" viewBox="0 0 300 70" preserveAspectRatio="none" aria-hidden="true" data-testid="inspector-envelope">
        <path d={`${envelopeLine(selected.sonic.envelope, 300, 70, 3)} L300,70 L0,70 Z`} />
      </svg>
    {/if}

    <div class="insp-block">
      <div class="insp-head">Where it came from</div>
      <div class="kv">
        <span class="k">Source</span><span class="v">{sourceLabel(selected.sourceType)}</span>
        {#if selected.instrument}<span class="k">Instrument</span><span class="v">{selected.instrument}</span>{/if}
        {#if selected.manufacturer}<span class="k">Maker</span><span class="v">{selected.manufacturer}</span>{/if}
        <span class="k">Status</span>
        <span class="v" class:ok={selected.available} class:bad={!selected.available}>
          {selected.available ? 'playable now' : selected.reason || 'not playable here'}
        </span>
      </div>
    </div>

    {#if !selected.sonic && selected.sonicRefusal}
      <div class="insp-block">
        <div class="insp-head">Why it has no measurement</div>
        <!-- "Tried and it did not work" is a different thing to be told from "not heard yet". -->
        <div class="notes" data-testid="inspector-refusal">{selected.sonicRefusal}
          It will not be asked again on its own — <em>Measure everything again</em>, beside
          the listen button, is the way back to it.</div>
      </div>
    {/if}

    {#if selected.sonic}
      <div class="insp-block">
        <div class="insp-head">What it measured like</div>
        {#if selected.sonic.silent}
          <div class="notes">The probe played a note and nothing came out. That is worth
            knowing rather than hiding — it usually means the sound needs a pedal, or the
            plug-in refused the state.</div>
        {:else}
          <div class="kv">
            <span class="k">Brightness</span><span class="v">{measuredLabel('brightness', selected.sonic.brightness)} centroid</span>
            <span class="k">Attack</span><span class="v">{measuredLabel('attack', selected.sonic.attack)}</span>
            <span class="k">Tail</span><span class="v">{measuredLabel('tail', selected.sonic.tail)}</span>
            <span class="k">Width</span><span class="v">{selected.sonic.width < 0.05 ? 'mono' : `${selected.sonic.width.toFixed(2)} stereo`}</span>
            <span class="k">Noise</span><span class="v">{Math.round(selected.sonic.noisiness * 100)}%</span>
            <span class="k">Touch</span><span class="v">{selected.sonic.dynamics < 0.05 ? 'ignores velocity' : selected.sonic.dynamics.toFixed(2)}</span>
            <span class="k">Cost</span><span class="v">{selected.sonic.costPercent.toFixed(1)}% of one core</span>
          </div>
        {/if}
      </div>
    {/if}

    <div class="insp-block">
      <div class="insp-head">Yours</div>
      <div class="rating" role="group" aria-label="Rating">
        {#each [1, 2, 3, 4, 5] as star (star)}
          <button type="button" class="ctl star" class:on={selected.rating >= star} title={`Rate ${star}`}
                  onclick={() => setLibraryUserMetadata(selected.recordId, { rating: selected.rating === star ? 0 : star })}
          >{selected.rating >= star ? '★' : '☆'}</button>
        {/each}
      </div>
      <div class="tags" data-testid="record-tags">
        {#each tagGroups as group (group.id)}
          <span class="tag-family">{group.label}</span>
          {#each group.tags as tag (tag)}
            <span class="tag-chip">
              <button type="button" class="chip small" title={`Show everything tagged ${tag}`}
                      onclick={() => sounds.ask(cycleLibraryFacet(emptyLibraryQuery(), 'tags', tag))}>{tag}</button>
              <button type="button" class="ghost tag-remove" aria-label={`Remove tag ${tag}`}
                      title={`Remove ${tag}`} onclick={() => removeTag(selected, tag)}>×</button>
            </span>
          {/each}
        {/each}
        {#each tagSuggestions as suggestion (suggestion.tag)}
          <button type="button" class="chip small suggested" data-testid="tag-suggestion"
                  title={`Suggested from the name — click to add ${suggestion.tag}`}
                  onclick={() => addTag(selected, suggestion.tag)}>+ {suggestion.tag}</button>
        {/each}
      </div>
      <input type="text" class="tag-input" list="library-tag-words" placeholder="Add a tag…"
             aria-label="Add a tag" data-testid="tag-input" bind:value={tagDraft}
             onkeydown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addTag(selected, tagDraft); } }} />
      <datalist id="library-tag-words">
        {#each knownTags as word (word)}<option value={word}></option>{/each}
      </datalist>
      {#if collectionNames.length > 0}
        <div class="insp-sub-head">Collections</div>
        <div class="tags" data-testid="record-collections">
          {#each collectionNames as name (name)}
            <button type="button" class="chip small" class:on={selected.collections.includes(name)}
                    aria-pressed={selected.collections.includes(name)} data-testid="record-collection"
                    title={selected.collections.includes(name) ? `Take it out of ${name}` : `Put it in ${name}`}
                    onclick={() => toggleCollection(selected, name)}>{name}</button>
          {/each}
        </div>
      {/if}
      <div class="insp-sub-head">Notes</div>
      <textarea class="notes-edit" rows="3" placeholder="Where it works, what to change…" aria-label="Notes"
                data-testid="record-notes" value={notesDraft ?? selected.notes}
                oninput={(e) => (notesDraft = e.currentTarget.value)} onblur={keepNotes}></textarea>
    </div>

    <div class="insp-block">
      <div class="insp-head">{nudge ? `More like this, but ${nudge.label.toLowerCase()}` : 'Sounds like'}</div>
      {#if selected.sonic && !selected.sonic.silent}
        <div class="nudges" role="group" aria-label="More like this, but…">
          {#each NUDGES as n (n.id)}
            <button type="button" class="chip small" class:on={sounds.nudge === n.id} aria-pressed={sounds.nudge === n.id}
                    data-testid={`nudge-${n.id}`}
                    onclick={() => (sounds.nudge = sounds.nudge === n.id ? '' : n.id)}>{n.label}</button>
          {/each}
        </div>
      {/if}
      {#if nudge}
        {#each nudged as match (match.record.recordId)}
          <div class="subrow">
            <button type="button" class="ghost simrow" data-testid="nudge-row"
                    title={`${match.percent}% alike otherwise; ${nudge.label.toLowerCase()} by ${Math.round(match.step * 100)}`}
                    onclick={() => { onreveal(match.record.recordId, match.record.name); onaudition(match.record); }}>
              <span class="simname">{match.record.name}</span>
              <span class="simpct">+{Math.round(match.step * 100)}</span>
            </button>
          </div>
        {:else}
          <div class="notes">Nothing among the sounds in view goes further that way. Clear a filter to look wider.</div>
        {/each}
      {:else if $hostSimilar.recordId === selected.recordId && $hostSimilar.matches.length > 0}
        {#each $hostSimilar.matches as match (match.recordId)}
          <div class="subrow">
            <button type="button" class="ghost simrow" data-testid="similar-row"
                    title={`${agreedAxes(match).join(', ')} agree${gaveUp(match) ? ` — but ${gaveUp(match)}` : ''}`}
                    onclick={() => onreveal(match.recordId, match.name)}>
              <span class="simname">{match.name}</span>
              <span class="simpct">{match.percent}%</span>
            </button>
            <!-- A neighbour is a sound you could be halfway to. The pair goes on the focused part. -->
            <button type="button" class="ghost keep morph-with" data-testid="morph-with" disabled={!canMorph}
                    title={canMorph ? `Morph ${partTitle(focusedPart)} between ${selected.name} and ${match.name}`
                                    : 'Focus a part with an instrument first'}
                    onclick={() => morphWith(match.recordId)}>MORPH</button>
          </div>
        {/each}
        <div class="notes simwhy">
          Closest on {agreedAxes($hostSimilar.matches[0]).join(', ')}.
          {#if gaveUp($hostSimilar.matches[0])}What you give up: {gaveUp($hostSimilar.matches[0])}.{/if}
        </div>
      {/if}
    </div>

    {#if selected.type === 'rack'}
      <div class="insp-block">
        <div class="insp-head">
          Will it play here?
          <button type="button" class="ghost more" data-testid="check-rack"
                  onclick={() => rackSubstitutes(selected.recordId)}>CHECK</button>
        </div>
        {#if $hostSubstitutes && $hostSubstitutes.recordId === selected.recordId}
          {#if $hostSubstitutes.needing === 0}
            <div class="notes">Every plug-in this rack wants is installed.</div>
          {:else}
            <div class="subneed" data-testid="substitute-need">
              {$hostSubstitutes.needing} of {$hostSubstitutes.parts.length} parts need a substitute.
            </div>
            {#each $hostSubstitutes.parts.filter((p) => !p.installed) as part (part.partId)}
              <div class="subpart">
                <div class="subwant">wants <b>{part.pluginName}</b>{#if part.presetName} · {part.presetName}{/if}</div>
                {#if part.candidates.length === 0}
                  <div class="notes">
                    {part.measured ? 'Nothing you own measures close enough to offer.'
                                   : 'This part was never listened to, so there is nothing to match against.'}
                  </div>
                {:else}
                  {#each part.candidates as candidate, index (candidate.recordId)}
                    {@const chosen = part.remembered === candidate.recordId}
                    <div class="subrow" class:chosen>
                      <button type="button" class="ghost simrow" class:best={index === 0} data-testid="substitute-candidate"
                              title={`Load ${candidate.name} onto this part instead`}
                              onclick={() => loadLibraryRecord(candidate.recordId, 'replace', part.partId)}>
                        <span class="simname">{candidate.name}</span><span class="simpct">{candidate.percent}%</span>
                      </button>
                      <!-- Choosing is explicit and reversible. -->
                      <button type="button" class="ghost keep" class:on={chosen} data-testid="substitute-keep"
                              title={chosen ? 'Forget this choice — the list goes back to nearest-first'
                                            : 'Offer this one first next time, on this computer'}
                              onclick={() => rememberSubstitute(part.pluginCeId, part.presetName,
                                                               chosen ? '' : candidate.recordId, selected.recordId)}>
                        {chosen ? 'CHOSEN' : 'KEEP'}
                      </button>
                    </div>
                  {/each}
                  <div class="notes simwhy">
                    {agreedAxes(part.candidates[0]).join(', ')} agree{gaveUp(part.candidates[0]) ? ` — ${gaveUp(part.candidates[0])}` : ''}.
                    The rack keeps naming {part.pluginName}, so it plays properly again the day that comes back.
                  </div>
                  {#if part.remembered}
                    <div class="notes simwhy" data-testid="substitute-chosen-note">
                      Your choice, kept on this computer only — a Sound Pack you hand somebody does not carry it.
                    </div>
                  {/if}
                {/if}
              </div>
            {/each}
          {/if}
        {:else}
          <div class="notes">A captured rack names the plug-ins it wants. Check what this machine has.</div>
        {/if}
      </div>
    {/if}

    {#if selected.type !== 'rack'}
      <div class="insp-block">
        <div class="insp-head">
          Saves
          {#if selected.versions.length > 1 || selected.branchedFrom}
            <button type="button" class="ghost more" data-testid="show-diff"
                    title="What changed between the first of these and now"
                    onclick={() => diffVersions(selected.recordId)}>WHAT CHANGED?</button>
          {/if}
        </div>
        {#if selected.versions.length === 0}
          <div class="notes">
            {selected.factory
              ? 'A vendor preset. Saving over it makes a sound of your own instead — the vendor keeps theirs.'
              : 'No saves yet. Saving keeps a version rather than writing over this one.'}
          </div>
        {:else}
          <div class="vrail" data-testid="version-rail">
            {#each [...selected.versions].reverse() as version, index (version.versionId)}
              <div class="vrow" class:now={index === 0}>
                <i class="pip" class:origin={version.origin}></i>
                <button type="button" class="ghost vlabel" data-testid="version-row" title="Put this one back on the part"
                        onclick={() => applyVersion(selected.recordId, version.versionId)}>
                  {version.label || (index === 0 ? 'the current sound' : 'an unnamed save')}
                </button>
                <span class="vwhen">{whenSaved(version.savedAtMs)}</span>
              </div>
            {/each}
          </div>
        {/if}
        {#if selected.versions.length > 1}
          <!-- Everything between the first save and the last is a sound too. Nothing is written
               until you save the result. -->
          <div class="vblend">
            <span>first</span>
            <ParamBar value={blendAmount / 100} text={`${blendAmount}%`} label="Blend the first save with the last"
                      testid="version-blend"
                      onchange={(v) => { blendAmount = Math.round(v * 100);
                        morphVersions(selected.recordId, selected.versions[0].versionId,
                                      selected.versions[selected.versions.length - 1].versionId, v); }}
                      onreset={() => { blendAmount = 100; }} />
            <span>now</span>
          </div>
        {/if}
        {#if selected.branchedFromName && $hostRecordFamily.nodes.length < 2}
          <div class="branched">branched from <b>{selected.branchedFromName}</b></div>
        {/if}
        {#if $hostRecordFamily.recordId === selected.recordId && $hostRecordFamily.nodes.length > 1}
          <div class="family" data-testid="record-family">
            <div class="insp-head">
              Its line
              {#if $hostRecordFamily.truncated}<span class="fmore" data-testid="family-truncated">and more than fits here</span>{/if}
            </div>
            {#each $hostRecordFamily.nodes as node (node.recordId)}
              <button type="button" class="fnode" class:here={node.recordId === selected.recordId}
                      data-testid={node.recordId === selected.recordId ? 'family-here' : 'family-node'}
                      style={`padding-left:${6 + node.depth * 12}px`}
                      title={node.recordId === selected.recordId ? 'The sound you are looking at' : 'Show this one'}
                      onclick={() => onreveal(node.recordId, node.name)}>{node.name || 'an unnamed sound'}</button>
            {/each}
            {#if revealedNote}<div class="fnote" data-testid="family-note">{revealedNote}</div>{/if}
          </div>
        {/if}
        <div class="vsave">
          {#if namingVersion}
            <input class="name-field" placeholder="Name this save…" bind:value={versionLabel} data-testid="version-name"
                   onkeydown={(e) => e.key === 'Enter' && saveVersion()} />
            <button type="button" data-testid="save-version" onclick={saveVersion}>Save</button>
            <button type="button" class="ghost" onclick={() => (namingVersion = false)}>Cancel</button>
          {:else}
            <button type="button" data-testid="commit-version"
                    title="Keep the part's current sound as another save of this record"
                    onclick={() => commitVersion(selected.recordId)}>Save this state</button>
            <button type="button" class="ghost" onclick={() => (namingVersion = true)}>Name it…</button>
          {/if}
        </div>
      </div>
    {/if}

    {#if !selected.factory}
      <HostConfirmButton identity={JSON.stringify([selected.recordId])} title="Remove library record" aria-label="Remove library record" type="button" class="ghost danger insp-remove"
              onclick={() => removeLibraryRecord(selected.recordId)}>Remove this record</HostConfirmButton>
    {/if}
  {:else}
    <div class="empty-hint">No preset selected.</div>
  {/if}
</div>

<style>
  .inspector { width: 240px; flex: 0 0 240px; min-height: 0; overflow-y: auto; display: flex; flex-direction: column; gap: 8px;
               padding: 10px; border-left: 1px solid var(--host-line, #3b4652); background: var(--host-surface, #1d232b); box-sizing: border-box; }
  .inspector.page { width: auto; flex: 1; border-left: 0; background: transparent; }
  .insp-name { font-weight: 600; font-size: 14px; color: var(--host-text); }
  .page .insp-name { font-size: 18px; }
  .insp-sub { color: var(--host-text-dim); font-size: 11px; }
  .big-env { width: 100%; height: 70px; display: block; background: var(--host-bg-deep); border-radius: 4px; }
  .big-env path { fill: #6fb0c955; stroke: #7fb4e0; stroke-width: 1.5; vector-effect: non-scaling-stroke; }
  .insp-block { border-top: 1px solid var(--host-line-soft); padding-top: 7px; }
  .insp-head { color: var(--host-text-dim); font-size: 10px; letter-spacing: 0.08em; text-transform: uppercase;
               margin-bottom: 5px; display: flex; align-items: center; gap: 6px; }
  .insp-sub-head { color: var(--host-text-dim); font-size: 9.5px; letter-spacing: 0.08em; text-transform: uppercase; margin: 8px 0 3px; }
  .kv { display: grid; grid-template-columns: 72px 1fr; gap: 3px 8px; font-size: 11px; }
  .kv .k { color: var(--host-text-dim); }
  .kv .v { color: var(--host-text-soft); overflow-wrap: anywhere; }
  .kv .v.ok { color: #35c46f; }
  .kv .v.bad { color: #d6a3a3; }
  .rating { display: flex; gap: 1px; }
  .tags { display: flex; flex-wrap: wrap; align-items: center; gap: 3px; margin-top: 6px; }
  .tag-family { flex-basis: 100%; color: var(--host-text-dim); font-size: 9.5px; margin-top: 2px; }
  .tag-chip { display: inline-flex; align-items: center; }
  .tag-remove { padding: 0 4px; min-height: 0; font-size: 12px; line-height: 1; opacity: .55; }
  .tag-remove:hover { opacity: 1; }
  .tag-input { margin-top: 6px; width: 100%; box-sizing: border-box; font-size: 11px; }
  .notes-edit { width: 100%; box-sizing: border-box; min-height: 48px; resize: vertical; font: 12px var(--host-font, sans-serif);
                color: var(--host-text); background: var(--host-field); border: 1px solid var(--host-line); border-radius: 4px; padding: 5px 7px; }
  .nudges { display: flex; flex-wrap: wrap; gap: 3px; margin-bottom: 6px; }
  .morph { display: flex; flex-direction: column; gap: 5px; padding: 0 2px; }
  .morph-ends { display: flex; align-items: baseline; gap: 6px; font-size: 11px; min-width: 0; }
  .morph-end { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .morph-end.b { text-align: right; }
  .morph-arrow { flex: 0 0 auto; color: var(--host-text-dim); }
  .notes.bad { color: #e0725c; }
  .morph :global(button.morph-clear) { align-self: flex-start; font-size: 10px; padding: 2px 6px; color: var(--host-text-dim); }
  .inspector :global(button.insp-remove) { align-self: flex-start; font-size: 11px; padding: 3px 6px; }
  button.simrow { display: flex; align-items: baseline; gap: 6px; width: 100%; text-align: left; padding: 3px 4px; border-radius: 3px; font-size: 11px; }
  button.simrow:hover:not(:disabled) { background: var(--host-surface-raised); border-color: transparent; }
  button.simrow.best { border-color: #35c46f66; background: #35c46f0d; }
  .subrow { display: flex; align-items: stretch; gap: 4px; }
  .subrow button.simrow { flex: 1; min-width: 0; }
  button.morph-with:disabled { opacity: 0.35; }
  button.keep { flex: 0 0 auto; font-size: 9px; letter-spacing: 0.06em; padding: 0 6px; color: var(--host-text-dim); }
  button.keep.on { color: #d9d3c4; border-color: #6b5426; background: #d9a13c14; }
  .simname { color: var(--host-text-soft); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; flex: 1; }
  .simpct { color: #35c46f; font-size: 10.5px; font-variant-numeric: tabular-nums; }
  .simwhy { font-size: 10px; margin-top: 4px; }
  .subneed { color: #d9a13c; font-size: 11px; margin-bottom: 6px; }
  .subpart { border-top: 1px solid var(--host-surface-raised); padding-top: 6px; margin-top: 6px; }
  .subwant { color: var(--host-text-dim); font-size: 10.5px; margin-bottom: 4px; }
  .subwant b { color: var(--host-text); font-weight: 600; }
  button.more { margin-left: auto; color: #7fb4e0; font-size: 9px; letter-spacing: 0.06em; padding: 0 2px; }
  .vrail { display: flex; flex-direction: column; gap: 0; }
  .vrow { display: grid; grid-template-columns: 10px minmax(0, 1fr) auto; gap: 6px; align-items: center; position: relative; padding: 2px 0; }
  .vrow .pip { width: 6px; height: 6px; border-radius: 50%; background: var(--host-line); margin-left: 2px; z-index: 1; }
  .vrow.now .pip { background: #7fb4e0; box-shadow: 0 0 0 3px #7fb4e026; }
  .vrow .pip.origin { background: var(--host-text-dim); }
  .vrow::before { content: ''; position: absolute; left: 4.5px; top: 0; bottom: 0; width: 1px; background: var(--host-line-soft); }
  .vrow:first-child::before { top: 50%; }
  .vrow:last-child::before { bottom: 50%; }
  button.vlabel { text-align: left; padding: 1px 3px; font-size: 11px; color: var(--host-text-soft); min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .vrow.now button.vlabel { color: var(--host-text); font-weight: 600; }
  .vwhen { color: var(--host-text-dim); font-size: 10px; white-space: nowrap; }
  .branched { color: var(--host-text-dim); font-size: 10.5px; margin-top: 6px; }
  .branched b { color: var(--host-text-soft); font-weight: 600; }
  .vblend { display: flex; align-items: center; gap: 8px; margin-top: 6px; font-size: 10px; color: var(--host-text-dim); }
  .vsave { display: flex; gap: 4px; margin-top: 8px; flex-wrap: wrap; }
  .vsave .name-field { width: 130px; }
  .family { display: flex; flex-direction: column; gap: 1px; margin-top: 6px; }
  .family .fmore { color: #b08a3d; font-size: 9.5px; margin-left: 6px; font-style: italic; }
  .fnode { text-align: left; background: none; border: 0; color: var(--host-text-soft); font-size: 10.5px; padding: 2px 6px; border-radius: 3px; cursor: pointer; }
  .fnode:hover { background: var(--host-surface-raised); color: var(--host-text); }
  .fnode.here { color: var(--host-text); background: var(--host-surface-hover); }
  .fnote { color: var(--host-text-dim); font-size: 9.5px; font-style: italic; padding: 2px 6px; }
  .empty-hint { color: var(--host-text-dim); font-size: 12px; padding: 12px 0; }
</style>
