<script>
  // The Text dock's Style bar, in the dock's header row: which named text style this text uses
  // (utils/textStyles.js), and the commands around it (stores/textStyles.js). It shares that row
  // with the control's name and Follow selection, so the fields below keep their height.
  //
  //   Style        choosing one gives the text its values and keeps it following the style;
  //                with several controls selected, all of them.
  //   Changed      shown when this text was changed by hand after: Update style makes the style
  //                this text (and every other text using it follows), Reset puts this one back.
  //   New…         a style from the text as it is now, under a name, used by this control.
  //   Rename, Delete, and None in the list (detach) — Delete and None leave every text looking as
  //   it does.

  import {
    applyTextStyle, createTextStyleFrom, deleteTextStyle, detachTextStyle, renameTextStyle, resetToTextStyle,
    textStyleUsers, updateTextStyleFrom,
  } from '../../stores/textStyles.js';
  import { differencesFromStyle, styleOf } from '../../utils/textStyles.js';

  /** control: the document's control (not the drawn one); ids: the controls a choice applies to. */
  let { control = null, panel = null, ids = [] } = $props();

  let styles = $derived(panel?.textStyles ?? []);
  let style = $derived(styleOf(control, styles));
  let changed = $derived(style ? differencesFromStyle(control, style).length > 0 : false);
  let users = $derived(new Map(styles.map((entry) => [entry.id, textStyleUsers(panel, entry.id).length])));
  let naming = $state('');
  let draft = $state('');
  const id = $derived(String(control?._children?.Core?.id ?? ''));
  const targets = $derived(ids.length > 1 ? ids : [id]);

  function choose(value) {
    if (value) applyTextStyle(value, targets);
    else detachTextStyle(targets);
  }
  function startNaming(kind) {
    naming = kind;
    draft = kind === 'rename' ? style?.name ?? '' : '';
  }
  function finishNaming() {
    const name = draft.trim();
    if (name && naming === 'new') createTextStyleFrom(id, name);
    if (name && naming === 'rename' && style) renameTextStyle(style.id, name);
    naming = '';
  }
</script>

<div class="style-bar" data-testid="text-style-bar">
  <label class="pick">
    <span>Style</span>
    <select value={style?.id ?? ''} onchange={(event) => choose(event.currentTarget.value)} data-testid="text-style-select">
      <option value="">None</option>
      {#each styles as entry (entry.id)}
        <option value={entry.id}>{entry.name} ({users.get(entry.id) ?? 0})</option>
      {/each}
    </select>
  </label>
  {#if naming}
    <!-- svelte-ignore a11y_autofocus -->
    <input class="name" type="text" bind:value={draft} autofocus placeholder={naming === 'new' ? 'Name, e.g. Section heading' : 'New name'}
           aria-label={naming === 'new' ? 'Name of the new text style' : 'New name of the text style'}
           onkeydown={(event) => { if (event.key === 'Enter') finishNaming(); if (event.key === 'Escape') naming = ''; }} />
    <button type="button" onclick={finishNaming} disabled={!draft.trim()} data-testid="text-style-name-ok">{naming === 'new' ? 'Create' : 'Rename'}</button>
    <button type="button" onclick={() => { naming = ''; }}>Cancel</button>
  {:else}
    {#if style && changed}
      <span class="changed" title="This text was changed by hand after the style was given to it">Changed</span>
      <button type="button" onclick={() => updateTextStyleFrom(id)} title="Make the style this text, for every text using it" data-testid="text-style-update">Update style</button>
      <button type="button" onclick={() => resetToTextStyle([id])} title="Put this text back to the style">Reset</button>
    {/if}
    <button type="button" onclick={() => startNaming('new')} title="A new style from this text as it is now" data-testid="text-style-new">New…</button>
    {#if style}
      <button type="button" onclick={() => startNaming('rename')} title="Rename the style; the texts using it stay linked">Rename…</button>
      <button type="button" class="quiet" onclick={() => deleteTextStyle(style.id)} title="Delete the style; every text using it keeps its look">Delete</button>
    {/if}
  {/if}
</div>

<style>
  .style-bar { display: flex; flex-wrap: wrap; align-items: center; gap: 5px; margin-left: 8px; font-size: 11px; color: #bbb; }
  .pick { display: flex; align-items: center; gap: 6px; }
  .pick span { color: #6FA8C7; font-size: 10px; text-transform: uppercase; letter-spacing: 0.04em; }
  select, .name { height: 22px; border: 1px solid #3A3A3A; border-radius: 3px; background: #151515; color: #ddd; font: inherit; }
  select { min-width: 140px; }
  .name { width: 180px; padding: 0 6px; }
  button { height: 22px; padding: 0 8px; border: 1px solid #3A3A3A; border-radius: 3px; background: #2A2A2A; color: #ddd; font: inherit; cursor: pointer; }
  button:disabled { opacity: 0.5; cursor: default; }
  button.quiet { color: #aaa; }
  .changed { color: #E8B95A; }
</style>
