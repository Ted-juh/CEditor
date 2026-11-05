<script>
  /**
   * Edit on Panel (piece C, stores/setFromControl.js): while a family's control is placed on the
   * panel to style, a row above the status bar says so and offers Apply to Set (the Apply window,
   * which takes the placed control away once applied) or Cancel (which takes it away now). A row of
   * the window's layout, as the script trust banner is, so it never covers the canvas.
   */
  import { panels } from '../stores/panels.js';
  import { controlSetLibrary } from '../stores/controlSetLibrary.js';
  import { endSetEditSession, requestApplyToSet, setEditSession } from '../stores/setFromControl.js';
  import { getControlSet } from '../models/controlSets.js';
  import { findControlById } from '../utils/containment.js';

  const FAMILY = {
    Knob: 'Knob', Slider: 'Slider', Button: 'Button', MomentaryButton: 'Momentary Button', ToggleButton: 'Switch',
    TimedButton: 'Timed Button', OneShotButton: 'One-shot Button', Meter: 'Meter', ProgressBar: 'Progress Bar',
  };

  let session = $derived($setEditSession);
  let panel = $derived(session ? $panels.find((entry) => entry.id === session.panelId) ?? null : null);
  // Gone if the placed control is: deleted by hand, or its panel closed.
  let placed = $derived(panel ? findControlById(panel.controls, session.controlId) : null);
  let setName = $derived(session ? (getControlSet(session.setId, { document: panel?.controlSets, library: $controlSetLibrary })?.name ?? session.setId) : '');
  let family = $derived(session ? (FAMILY[session.type] ?? session.type.replace(/([a-z])([A-Z])/g, '$1 $2')) : '');

  $effect(() => {
    if (session && !placed) setEditSession.set(null);
  });
</script>

{#if session && placed}
  <aside class="set-edit" role="status" data-testid="set-edit-banner">
    <strong>Editing {setName}'s {family}.</strong>
    <span>Style it in the properties panel, then apply its look to the set.</span>
    <button class="primary" onclick={() => requestApplyToSet(session.controlId, null, session.panelId)}>Apply to Set</button>
    <button onclick={() => endSetEditSession({ remove: true })}>Cancel</button>
  </aside>
{/if}

<style>
  .set-edit { display: flex; align-items: center; gap: 12px; padding: 7px 16px; border-top: 1px solid #1477C0; background: #0E2A40; color: #D8ECFA; font: 12.5px/1.4 sans-serif; }
  span { flex: 1; color: #B8D2E6; }
  button { flex-shrink: 0; height: 26px; padding: 0 12px; border: 1px solid #3B4B57; border-radius: 4px; background: #16222A; color: #DDD; font: inherit; cursor: pointer; }
  button.primary { background: #0B5E99; border-color: #1477C0; color: #FFF; }
</style>
