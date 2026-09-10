<script>
  /**
   * Size, spacing, lines, placement, OpenType features and ONE decoration editor.
   *
   * The decoration group is the point. `Font` carries 24 of its 40 properties as the same seven
   * fields three times over — underline, strikethrough, overline — and the renderer already reads
   * them by kind (`lineColourFor(kind, …)`). So this is one editor and a three-way picker, not
   * three blocks.
   */
  import TypeFieldRow from './TypeFieldRow.svelte';
  import Segmented from '../../properties/Segmented.svelte';
  import {
    TYPE_GROUPS,
    DECORATION_KINDS,
    decorationFieldsFor,
    decorationEnabledKey,
    TYPOGRAPHY_FEATURE_OPTIONS,
    FONT_ROOT,
  } from '../../utils/typographyModel.js';

  let {
    sections = {},
    supportedFeatures = null,
    onset = () => {},
  } = $props();

  let kind = $state('underline');

  let font = $derived(sections[FONT_ROOT] ?? {});
  let decorationOn = $derived(font?.[decorationEnabledKey(kind)] === true);
  let decorationFields = $derived(decorationFieldsFor(kind));

  /** A feature the loaded face does not have is shown disabled rather than hidden: the setting is
   *  still stored and still exports, and hiding it would make it look lost. */
  function featureSupported(key) {
    if (!Array.isArray(supportedFeatures)) return true;
    const tags = TYPOGRAPHY_FEATURE_OPTIONS.find((option) => option.key === key)?.tags ?? [];
    return tags.some((tag) => supportedFeatures.includes(tag));
  }
</script>

<div class="setbox">
  {#each TYPE_GROUPS as group (group.key)}
    <div class="grp">{group.label}</div>
    {#each group.fields as field (field.key)}
      <TypeFieldRow
        {field}
        value={sections[group.root]?.[field.key]}
        onset={(key, value) => onset(group.root, key, value)}
      />
    {/each}
  {/each}

  <div class="grp">Features</div>
  <div class="chips">
    {#each TYPOGRAPHY_FEATURE_OPTIONS as feature (feature.key)}
      <button
        type="button"
        class:on={font?.[feature.key] === true}
        class:unsupported={!featureSupported(feature.key)}
        title={featureSupported(feature.key)
          ? `${feature.label} (${feature.tags.join(', ')})`
          : `${feature.label} — this face does not report ${feature.tags.join('/')}`}
        onclick={() => onset(FONT_ROOT, feature.key, !(font?.[feature.key] === true))}
      >{feature.label}</button>
    {/each}
  </div>

  <div class="grp">
    Decoration
    <span class="grpnote">one editor, three lines</span>
  </div>
  <div class="r">
    <span class="rl">Line</span>
    <Segmented
      options={DECORATION_KINDS.map((entry) => ({ value: entry.key, label: entry.label }))}
      value={kind}
      ariaLabel="Which decoration line"
      onchange={(next) => { kind = next; }}
    />
  </div>
  <div class="r">
    <span class="rl">Show</span>
    <Segmented
      options={[{ value: false, label: 'Off' }, { value: true, label: 'On' }]}
      value={decorationOn}
      ariaLabel={`${kind} on or off`}
      onchange={(next) => onset(FONT_ROOT, decorationEnabledKey(kind), next)}
    />
  </div>
  {#if decorationOn}
    {#each decorationFields as field (field.key)}
      <TypeFieldRow
        {field}
        value={font?.[field.key]}
        onset={(key, value) => onset(FONT_ROOT, key, value)}
      />
    {/each}
  {:else}
    <p class="note">Switch it on to set colour, offset, thickness and inset.</p>
  {/if}
</div>

<style>
  .setbox {
    background: #1E1E1E;
    border: 1px solid #333;
    border-radius: 4px;
    padding: 8px;
  }

  .grp {
    display: flex;
    align-items: baseline;
    gap: 6px;
    font: 600 8.5px/1 'IBM Plex Mono', ui-monospace, monospace;
    letter-spacing: 0.13em;
    text-transform: uppercase;
    color: #616C75;
    margin: 12px 0 4px;
    padding-top: 8px;
    border-top: 1px solid #242424;
  }
  .grp:first-child { margin-top: 0; padding-top: 0; border-top: 0; }
  .grpnote {
    font: 400 8.5px/1 'IBM Plex Sans', system-ui, sans-serif;
    letter-spacing: 0;
    text-transform: none;
    color: #14B8A6;
  }

  .chips { display: grid; grid-template-columns: repeat(3, 1fr); gap: 4px; }
  .chips button {
    height: 22px;
    border: 1px solid #333;
    border-radius: 3px;
    background: #1A1A1A;
    font: 600 8.5px/20px 'IBM Plex Sans', system-ui, sans-serif;
    color: #616C75;
    cursor: pointer;
    white-space: nowrap;
    overflow: hidden;
  }
  .chips button:hover { border-color: #4A555E; color: #9AA6AE; }
  .chips button.on { border-color: #0E7C70; background: #0B2320; color: #8FEDE3; }
  .chips button.unsupported { opacity: 0.45; }

  .r {
    display: grid;
    grid-template-columns: 62px minmax(0, 1fr);
    gap: 7px;
    align-items: center;
    margin-top: 6px;
  }
  .rl {
    font: 400 9.5px/1.15 'IBM Plex Sans', system-ui, sans-serif;
    color: #616C75;
    text-align: right;
  }

  .note {
    margin: 6px 0 0;
    font: 400 9.5px/1.5 'IBM Plex Sans', system-ui, sans-serif;
    color: #616C75;
  }
</style>
