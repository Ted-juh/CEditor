<script>
  /**
   * Apply to Set (docs/design/changeable-control-sets.md, piece C): a control's overrides given to
   * its set's family for its type, as the owner approved in the mock-up. Each override is a tick,
   * with what the set gives there now; the window says what changes: how many of the panel's
   * controls of that type follow the set and change, how many keep a look of their own, and that
   * this one follows the set again. A built-in set is never changed: its copy, named here, takes
   * the change and the panel moves to it. Opened through stores/setFromControl.js
   * `requestApplyToSet`, from Core › Control design and the Edit on Panel banner.
   */
  import { panels } from '../stores/panels.js';
  import { controlSetLibrary } from '../stores/controlSetLibrary.js';
  import { applyLookToSet, applyToSetPreview, applyToSetRequest, endSetEditSession, setEditSession } from '../stores/setFromControl.js';
  import { describeLookValue } from '../models/setFromControl.js';

  const FAMILY_NAMES = {
    Knob: 'Knobs', Slider: 'Sliders', Button: 'Buttons', MomentaryButton: 'Momentary Buttons', ToggleButton: 'Switches',
    TimedButton: 'Timed Buttons', OneShotButton: 'One-shot Buttons', Meter: 'Meters', ProgressBar: 'Progress Bars', Label: 'Labels',
  };

  let request = $derived($applyToSetRequest);
  // Read again whenever the panel or the library changes while it is open.
  let preview = $derived(request && $panels && $controlSetLibrary ? applyToSetPreview(request.controlId, request.panelId) : null);
  let ticked = $state(new Set());
  let copyName = $state('');
  let openedFor = $state('');

  $effect(() => {
    const key = request ? `${request.panelId}:${request.controlId}` : '';
    if (key === openedFor) return;
    openedFor = key;
    if (!request || !preview) return;
    // Everything ticked, or only what was asked for (a row's own Apply).
    ticked = new Set(request.paths ?? preview.entries.map((entry) => entry.path));
    copyName = preview.copyName;
  });

  let chosen = $derived(preview ? preview.entries.filter((entry) => ticked.has(entry.path)).map((entry) => entry.path) : []);
  let reach = $derived(preview && chosen.length ? preview.reach(chosen) : { follow: 0, keep: 0 });
  const SINGULAR = { ToggleButton: 'switch', MomentaryButton: 'momentary button', TimedButton: 'timed button', OneShotButton: 'one-shot button', ProgressBar: 'progress bar' };
  let familyName = $derived(preview ? (FAMILY_NAMES[preview.type] ?? `${preview.type}s`) : '');
  let one = $derived(preview ? (SINGULAR[preview.type] ?? preview.type.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase()) : '');
  let many = $derived(familyName.toLowerCase());

  function toggle(path) {
    const next = new Set(ticked);
    if (next.has(path)) next.delete(path); else next.add(path);
    ticked = next;
  }

  function close() {
    applyToSetRequest.set(null);
  }

  function apply() {
    if (!preview || !chosen.length) return;
    applyLookToSet(request.controlId, chosen, { panelId: request.panelId, copyName });
    // Applied from Edit on Panel: the placed control has done its job.
    if ($setEditSession?.controlId === request.controlId) endSetEditSession({ remove: true });
    close();
  }

  function onKeydown(event) {
    if (!request) return;
    if (event.key === 'Escape') { event.preventDefault(); close(); }
  }
</script>

<svelte:window onkeydown={onKeydown} />

{#if request && preview}
  <div class="backdrop" role="presentation" onclick={(event) => { if (event.target === event.currentTarget) close(); }}>
    <div class="dialog" role="dialog" aria-modal="true" aria-label="Apply to Set" data-testid="apply-to-set">
      <div class="title">Apply to {preview.set?.name ?? 'the set'}'s {familyName}</div>
      {#if !preview.entries.length}
        <p class="muted">This {one} has no overrides: it already looks as the set draws it.</p>
      {:else}
        <div class="group">The overrides this {one} has</div>
        {#each preview.entries as entry (entry.path)}
          <label class="choice">
            <input type="checkbox" checked={ticked.has(entry.path)} onchange={() => toggle(entry.path)} />
            <span class="what">{#if entry.part}<span class="part">{`${entry.part} · `}</span>{/if}{entry.property} <b>{describeLookValue(entry.value)}</b></span>
            <em>was {describeLookValue(entry.was)}</em>
          </label>
        {/each}
        {#if preview.builtIn}
          <div class="info">{preview.set?.name} is built in, so its copy takes the change: <b>{copyName || preview.copyName}</b>, saved in your library. This panel uses the copy from now on.</div>
          <label class="field"><span>Copy's name</span><input type="text" aria-label="Copy's name" bind:value={copyName} /></label>
        {/if}
        <div class="group">What changes</div>
        <p class="summary">
          The set's {familyName} family takes the {chosen.length} override{chosen.length === 1 ? '' : 's'} ticked.
          {#if reach.follow === 1}<b>1 other {one}</b> on this panel follows the set and changes with it.{:else if reach.follow}<b>{reach.follow} other {many}</b> on this panel follow the set and change with it.{/if}
          {#if reach.keep === 1}1 has an override of its own there and keeps it.{:else if reach.keep}{reach.keep} have overrides of their own there and keep them.{/if}
          This {one} follows the set again{chosen.length < preview.entries.length ? ' for what is applied' : ''}.
        </p>
        <p class="muted">Colours keep what they are: a role stays a role, a colour you picked stays that colour. One undo step on the panel; the set itself is saved in your library.</p>
      {/if}
      <div class="actions">
        <button class="btn" onclick={close}>Cancel</button>
        <button class="btn primary" disabled={!chosen.length} onclick={apply}>Apply to Set</button>
      </div>
    </div>
  </div>
{/if}

<style>
  .backdrop { position: fixed; inset: 0; z-index: 1250; background: rgba(0, 0, 0, 0.55); display: flex; align-items: center; justify-content: center; }
  .dialog {
    width: 520px; max-width: calc(100vw - 48px); max-height: calc(100vh - 64px); overflow-y: auto; box-sizing: border-box;
    background: #252526; border: 1px solid #3A3A3A; border-radius: 8px; box-shadow: 0 18px 50px rgba(0, 0, 0, 0.6);
    padding: 16px 18px; display: flex; flex-direction: column; gap: 6px; color: #DDD; font-size: 12px;
  }
  .title { font-size: 15px; font-weight: 600; color: #EEE; }
  .muted { margin: 2px 0; color: #8F8F8F; font-size: 11px; }
  .group { margin-top: 8px; color: #6FA8C7; font-size: 10px; font-weight: 700; letter-spacing: 0.05em; text-transform: uppercase; }
  .choice { display: grid; grid-template-columns: 16px minmax(0, 1fr) auto; gap: 8px; align-items: center; padding: 3px 0; cursor: pointer; }
  .choice .part { color: #9FB6C8; }
  .choice b { color: #F0F0F0; font-weight: 600; }
  .choice em { color: #8F8F8F; font-style: normal; font-size: 11px; white-space: nowrap; }
  .info { margin-top: 8px; padding: 7px 9px; border: 1px solid #3A4A56; border-radius: 5px; background: #16222A; color: #B8C7D2; font-size: 11px; }
  .field { display: flex; flex-direction: column; gap: 4px; margin-top: 4px; }
  .field span { color: #6FA8C7; font-size: 10px; text-transform: uppercase; letter-spacing: 0.04em; }
  .field input { height: 26px; padding: 0 8px; border: 1px solid #3A3A3A; border-radius: 3px; background: #1A1A1A; color: #DDD; font: inherit; }
  .summary { margin: 2px 0; color: #C8C8C8; font-size: 11.5px; line-height: 1.45; }
  .summary b { color: #FFF; }
  .actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 12px; }
  .btn { height: 28px; padding: 0 14px; border: 1px solid #3A3A3A; border-radius: 4px; background: #2C2C2C; color: #DDD; font: inherit; font-weight: 600; cursor: pointer; }
  .btn.primary { background: #094771; border-color: #0B6EB5; color: #fff; }
  .btn:disabled { opacity: 0.45; cursor: default; }
</style>
