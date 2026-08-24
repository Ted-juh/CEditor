<script>
  // PanelKeyCell — "follow the panel's key", shown in every note component's editor.
  //
  // One component rather than six copies, and it does more than toggle a flag: it also SETS the
  // panel key, right there. The alternative was a panel key that lives somewhere else in the app
  // and a checkbox here that appears to do nothing until you find it — which is how a shared setting
  // ends up unused.
  //
  // Turning it on brings the control into line immediately (see setFollowsPanelKey), because a
  // checkbox that waits for the next key change to do anything reads as broken.

  import Link2 from 'lucide-svelte/icons/link-2';
  import PropertyCell from './PropertyCell.svelte';
  import PropertyToggle from './PropertyToggle.svelte';
  import { activePanel } from '../stores/panels.js';
  import {
    currentPanelContext, setFollowsPanelKey, setPanelKey, suggestedPanelContext,
  } from '../stores/panelKeyActions.js';
  import { NOTE_NAMES, SCALE_LABELS, SCALES } from '../utils/musicalContext.js';
  import { componentScaleName, contextForControl } from '../utils/panelKey.js';

  let { control = null, section = '' } = $props();

  let controlId = $derived(String(control?._children?.Core?.id ?? ''));
  let follows = $derived(control?._children?.[section]?.followPanelKey === true);
  // Recomputed from the panel so it tracks a key set from another component's editor.
  let context = $derived($activePanel ? currentPanelContext() : { root: 0, scale: 'major', enabled: true });
  let resolved = $derived($activePanel && control ? contextForControl($activePanel, control) : null);
  // A panel scale the note components have no name for. Reported rather than rounded to major:
  // a chord pad quietly playing the wrong mode is the kind of bug somebody blames on their ears.
  let unsupported = $derived(componentScaleName(context.scale) === null ? String(context.scale) : '');

  function toggle(next) {
    if (!controlId) return;
    // The first control to follow decides the starting key, from what is already on the panel —
    // writing C major over a panel that is in F minor throughout would be a poor first impression.
    if (next && !$activePanel?.musicalContext) setPanelKey(suggestedPanelContext());
    setFollowsPanelKey(controlId, section, next);
  }

  function setRoot(value) { setPanelKey({ ...context, root: Number(value) }); }
  function setScale(value) { setPanelKey({ ...context, scale: value }); }
</script>

<PropertyCell
  label="Panel key"
  span={2}
  hint="Follow one key and scale shared by every note component on this panel, so changing it re-harmonises them together. Off by default; this control keeps its own key until you turn it on."
>
  <div class="panel-key">
    <PropertyToggle value={follows} onchange={toggle} />
    {#if follows}
      <select class="val small" value={context.root} onchange={(event) => setRoot(event.target.value)} aria-label="Panel root">
        {#each NOTE_NAMES as name, index}<option value={index}>{name}</option>{/each}
      </select>
      <select class="val" value={context.scale} onchange={(event) => setScale(event.target.value)} aria-label="Panel scale">
        <!-- Chromatic and whole tone are marked rather than removed. They are legitimate panel keys
             — the arpeggiator and the quantiser both use one — and they are the two the note
             components have no name for, so every follower keeps its own. Saying so in the list
             beats saying it in a warning after the author has already picked one. -->
        {#each Object.keys(SCALES) as name}
          <option value={name}>
            {SCALE_LABELS[name] ?? name}{componentScaleName(name) === null ? ' — followers keep their own' : ''}
          </option>
        {/each}
      </select>
    {:else}
      <span class="note"><Link2 size={11} /> using its own key</span>
    {/if}
  </div>
  {#if follows && unsupported}
    <p class="warn">The note components have no {unsupported} scale, so this control has kept its own —
      pick another panel scale, or leave this one unlinked.</p>
  {:else if follows && resolved && !resolved.following}
    <p class="warn">Not following: the panel key is switched off.</p>
  {/if}
</PropertyCell>

<style>
  .panel-key { display: flex; align-items: center; gap: 6px; min-width: 0; }
  .panel-key :global(.val) { flex: 1; min-width: 0; }
  .panel-key :global(.val.small) { flex: 0 0 56px; }
  .note { display: inline-flex; align-items: center; gap: 4px; color: #777; font-size: 11px; }
  .warn { color: #F2C94C; font-size: 10px; line-height: 1.4; margin: 4px 0 0; }
</style>
