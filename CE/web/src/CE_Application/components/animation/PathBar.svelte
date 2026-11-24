<script>
  /**
   * PathBar — pick what an animation changes as a path: Knob01 › Body › Cap › Scale.
   *
   * It replaces two flat dropdowns, "On" (every part by its internal name, bodyCap, labelTitle…,
   * twenty-two of them on a knob, then "The control itself") and "Change". The owner asked for it
   * to be easy to pick the control or any part of it (2026-11-24, docs/design/animation-designer.md).
   *
   * Three ways to the same choice, all writing the target exactly as the tab always has
   * (utils/targetPaths.js builds every entry with animationModel.buildTarget):
   *   - the steps: each one a list of its neighbours — the place (Whole control, Background, Text,
   *     a knob's Body, Pointer, Ticks or Labels, or a part by its own name), the part in a group,
   *     and the property;
   *   - typing: "text col", "cap scale", or a short dotted path, "Text.colour";
   *   - Browse: the same three levels side by side, for looking rather than knowing.
   *
   * A keyframe animation plays on a place, not a property, so for one there is no property step.
   * `compact` leaves out the typing field, for a pane header with no room for it; Browse stays.
   */
  import Columns3 from 'lucide-svelte/icons/columns-3';
  import PropertySelect from '../../properties/PropertySelect.svelte';
  import {
    controlLabel,
    flattenTargets,
    searchTargets,
    targetTree,
  } from '../../utils/targetPaths.js';

  let {
    control = null,
    kind = 'transition',
    value = null,
    compact = false,
    onchange = () => {},
  } = $props();

  let tree = $derived(targetTree(control, kind));
  let items = $derived(flattenTargets(tree));
  let name = $derived(controlLabel(control));

  function locate(places, target) {
    const path = target?.path;
    if (!path) return null;
    for (const place of places) {
      if (place.target?.path === path) return { place, part: null, property: null };
      const own = place.properties.find((entry) => entry.target.path === path);
      if (own) return { place, part: null, property: own };
      for (const part of place.parts) {
        if (part.target?.path === path) return { place, part, property: null };
        const inPart = part.properties.find((entry) => entry.target.path === path);
        if (inPart) return { place, part, property: inPart };
      }
    }
    return null;
  }

  function first(place) {
    const part = place?.parts?.[0] ?? null;
    const holder = part ?? place;
    return { place, part, property: holder?.properties?.[0] ?? null };
  }

  let here = $derived(locate(tree, value) ?? first(tree[0]));
  let holder = $derived(here.part ?? here.place);

  /** Choose where, keeping the property of the same name when the new place has one. */
  function land(place, part) {
    const into = part ?? place;
    const keep = into?.properties?.find((entry) => entry.label === here.property?.label);
    const property = keep ?? into?.properties?.[0] ?? null;
    const target = property?.target ?? into?.target ?? null;
    if (target) onchange({ ...target, properties: target.properties ? [...target.properties] : undefined });
  }

  function pickPlace(id) {
    const place = tree.find((entry) => entry.id === id);
    if (place) land(place, place.parts[0] ?? null);
  }

  function pickPart(id) {
    const part = here.place?.parts.find((entry) => entry.id === id);
    if (part) land(here.place, part);
  }

  function pickProperty(path) {
    const property = holder?.properties.find((entry) => entry.target.path === path);
    if (property) onchange({ ...property.target, properties: [...property.target.properties] });
  }

  // --- typing -------------------------------------------------------------------------------
  let query = $state('');
  let cursor = $state(0);
  let results = $derived(query.trim() ? searchTargets(items, query, { controlName: name }).slice(0, 8) : []);

  function choose(item) {
    if (!item) return;
    onchange({ ...item.target, properties: item.target.properties ? [...item.target.properties] : undefined });
    query = '';
    cursor = 0;
  }

  function onKey(event) {
    if (event.key === 'ArrowDown') { event.preventDefault(); cursor = Math.min(results.length - 1, cursor + 1); }
    else if (event.key === 'ArrowUp') { event.preventDefault(); cursor = Math.max(0, cursor - 1); }
    else if (event.key === 'Enter') { event.preventDefault(); choose(results[cursor]); }
    else if (event.key === 'Escape') { query = ''; cursor = 0; browsing = false; }
    else if (browsing) browsing = false;
  }

  // --- browsing -----------------------------------------------------------------------------
  let browsing = $state(false);
  let browsePlace = $state('');
  let browsePart = $state('');
  let shownPlace = $derived(tree.find((entry) => entry.id === browsePlace) ?? here.place);
  let shownPart = $derived(shownPlace?.parts.find((entry) => entry.id === browsePart) ?? (shownPlace === here.place ? here.part : shownPlace?.parts[0]) ?? null);
  let shownProperties = $derived((shownPart ?? shownPlace)?.properties ?? []);

  function openBrowser() {
    query = '';
    browsePlace = here.place?.id ?? '';
    browsePart = here.part?.id ?? '';
    browsing = !browsing;
  }

  function browseTo(entry) {
    if (entry?.target) { choose({ target: entry.target }); browsing = false; }
  }
</script>

{#snippet browseButton()}
    <button type="button" class="browse" class:on={browsing} aria-expanded={browsing}
            title="Browse every place, part and property side by side" onclick={openBrowser}>
      <Columns3 size={13} aria-hidden="true" /> Browse
    </button>
{/snippet}

<div class="pathbar" data-pathbar>
  <div class="steps" role="group" aria-label="What to change, as a path">
    <span class="ctl" title="The control this tab is on">{name}</span>
    <span class="sep" aria-hidden="true">›</span>
    <span class="step" data-step="place">
      <PropertySelect ariaLabel="Where" value={here.place?.id ?? ''}
                      options={tree.map((place) => ({ value: place.id, label: place.label }))}
                      onchange={pickPlace} />
    </span>
    {#if here.place?.parts.length}
      <span class="sep" aria-hidden="true">›</span>
      <span class="step" data-step="part">
        <PropertySelect ariaLabel="Part" value={here.part?.id ?? ''}
                        options={here.place.parts.map((part) => ({ value: part.id, label: part.label }))}
                        onchange={pickPart} />
      </span>
    {/if}
    {#if holder?.properties.length}
      <span class="sep" aria-hidden="true">›</span>
      <span class="step" data-step="property">
        <PropertySelect ariaLabel="What to change" value={here.property?.target.path ?? ''}
                        options={holder.properties.map((entry) => ({ value: entry.target.path, label: entry.label }))}
                        onchange={pickProperty} />
      </span>
    {/if}
    {#if compact}{@render browseButton()}{/if}
  </div>

  {#if !compact}
  <div class="find">
    <div class="findrow">
    <input type="text" role="combobox" aria-autocomplete="list" class="query" bind:value={query} onkeydown={onKey}
           aria-label="Type a path" placeholder="Type a path: text col, cap scale, Text.colour"
           aria-controls="pathbar-results" aria-expanded={results.length > 0}
           oninput={() => { cursor = 0; }} />
    {@render browseButton()}
    </div>
    {#if results.length}
      <div class="results" id="pathbar-results" role="listbox" aria-label="Paths that match">
        {#each results as item, index (item.target.path)}
          <button type="button" role="option" class="hit" class:on={index === cursor} aria-selected={index === cursor}
                  onclick={() => choose(item)}>
            {item.steps.join(' › ')}
          </button>
        {/each}
      </div>
    {:else if query.trim()}
      <p class="none">Nothing on {name} matches “{query.trim()}”.</p>
    {/if}
  </div>
  {/if}

  {#if browsing}
    <div class="browser" role="group" aria-label="Browse places, parts and properties">
      <div class="col" role="listbox" aria-label="Places">
        {#each tree as place (place.id)}
          <button type="button" role="option" class="it" class:on={place === shownPlace} aria-selected={place === shownPlace}
                  onclick={() => { browsePlace = place.id; browsePart = ''; if (!place.parts.length && !place.properties.length) browseTo(place); }}>
            {place.label}{#if place.parts.length || place.properties.length}<span class="gt" aria-hidden="true">›</span>{/if}
          </button>
        {/each}
      </div>
      {#if shownPlace?.parts.length}
        <div class="col" role="listbox" aria-label="Parts">
          {#each shownPlace.parts as part (part.id)}
            <button type="button" role="option" class="it" class:on={part === shownPart} aria-selected={part === shownPart}
                    onclick={() => { browsePart = part.id; if (!part.properties.length) browseTo(part); }}>
              {part.label}{#if part.properties.length}<span class="gt" aria-hidden="true">›</span>{/if}
            </button>
          {/each}
        </div>
      {/if}
      {#if shownProperties.length}
        <div class="col" role="listbox" aria-label="Properties">
          {#each shownProperties as property (property.target.path)}
            <button type="button" role="option" class="it" class:on={property.target.path === value?.path}
                    aria-selected={property.target.path === value?.path} onclick={() => browseTo(property)}>
              {property.label}
            </button>
          {/each}
        </div>
      {/if}
    </div>
  {/if}
</div>

<style>
  /* The dock is short: the results and the browser float over what is below them, not push it. */
  .pathbar { position: relative; display: flex; flex-direction: column; gap: 6px; min-width: 0; }
  .steps { display: flex; align-items: center; gap: 5px; flex-wrap: wrap; min-width: 0; }
  .ctl { font-weight: 600; color: var(--ce-text, #E8EEF5); white-space: nowrap; }
  .sep { color: var(--ce-text-muted, #8A949C); }
  .step { min-width: 110px; max-width: 200px; flex: 0 1 auto; }
  .browse {
    display: inline-flex; align-items: center; gap: 5px; height: var(--pp-field-height, 26px);
    padding: 0 9px; border: 1px solid var(--ce-border, #333); border-radius: 4px;
    background: var(--ce-field-bg, #1A1A1A); color: inherit; font: inherit; cursor: pointer;
  }
  .browse.on { border-color: #0E7C70; background: #0B2320; color: #8FEDE3; }
  .find { position: relative; }
  .findrow { display: flex; gap: 6px; align-items: center; }
  .query {
    flex: 1; min-width: 0; box-sizing: border-box; height: var(--pp-field-height, 26px); padding: 0 8px;
    border: 1px solid var(--ce-border, #333); border-radius: 4px; background: var(--ce-field-bg, #1A1A1A);
    color: inherit; font: inherit;
  }
  .results {
    position: absolute; z-index: 30; left: 0; right: 0; top: 100%;
    display: flex; flex-direction: column; margin-top: 4px; box-shadow: 0 8px 20px rgba(0, 0, 0, 0.45); border: 1px solid var(--ce-border, #333);
    border-radius: 4px; background: var(--ce-panel-bg, #15181B); max-height: 200px; overflow: auto;
  }
  .hit { text-align: left; padding: 6px 9px; border: 0; background: transparent; color: inherit; font: inherit; cursor: pointer; }
  .hit.on, .hit:hover { background: #0B2320; color: #8FEDE3; }
  .none { position: absolute; z-index: 30; top: 100%; left: 0; margin: 4px 0 0; padding: 4px 8px; border-radius: 4px; background: var(--ce-panel-bg, #15181B); color: var(--ce-text-muted, #8A949C); }
  .browser {
    position: absolute; z-index: 30; left: 0; right: 0; top: 100%; margin-top: 4px;
    background: var(--ce-panel-bg, #15181B); box-shadow: 0 8px 20px rgba(0, 0, 0, 0.45);
    display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); border: 1px solid var(--ce-border, #333);
    border-radius: 6px; overflow: hidden; max-height: 220px;
  }
  .col { display: flex; flex-direction: column; overflow: auto; border-right: 1px solid var(--ce-border, #333); }
  .col:last-child { border-right: 0; }
  .it {
    display: flex; align-items: center; gap: 6px; text-align: left; padding: 6px 9px; border: 0;
    background: transparent; color: inherit; font: inherit; cursor: pointer;
  }
  .it.on { background: #0B2320; color: #8FEDE3; }
  .gt { margin-left: auto; color: var(--ce-text-muted, #8A949C); }
</style>
