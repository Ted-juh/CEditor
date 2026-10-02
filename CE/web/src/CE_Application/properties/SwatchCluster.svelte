<script>
  import { colorTarget, activateInspectorColorTarget } from '../stores/colorTarget.js';
  import { displayTabRequest } from '../stores/displayTab.js';
  import { selectedControls } from '../stores/controls.js';
  import { activeControlSet } from '../stores/controlSets.js';
  import { effectiveSwatchColour } from '../utils/setSwatchValue.js';

  // A control's colours as one row of captioned mini-swatches — the panel's
  // W5 widget. Clicking a swatch makes it the live target of the display
  // panel's Colors tab (the dock does the actual picking, per the house
  // colour rule) and opens that tab; the live swatch wears the ring so you
  // always know what the dock is editing.
  //
  //   swatches: [{ key, label, value, target }]
  //     value:  AARRGGBB or RRGGBB hex string (no leading #)
  //     target: a colorTarget descriptor — { type: 'control', controlId, path }
  //             or { type: 'panel', prop }
  let { swatches = [] } = $props();

  // A control's swatch shows the colour the canvas draws, which is the control set's wherever the
  // control still holds its factory value (utils/setSwatchValue.js), and says so.
  let shown = $derived(swatches.map((s) => {
    if (s.target?.type !== 'control') return { ...s, fromSet: false };
    const control = $selectedControls.find((c) => c?._children?.Core?.id === s.target.controlId);
    const effective = effectiveSwatchColour(control, $activeControlSet, s.target.path, s.value);
    return effective ? { ...s, value: effective.value, fromSet: effective.fromSet } : { ...s, fromSet: false };
  }));

  function pick(s) {
    // The swatch key rides along so callback targets (dynamic collections
    // with no stable path) can still be matched for the live ring. The dock
    // starts from the colour shown, so a set's colour can be nudged from.
    activateInspectorColorTarget({ ...s.target, _swatchKey: s.key }, s.value);
    displayTabRequest.set({ tab: 'colors' });
  }

  function isLive(s, t) {
    if (!t || !s.target) return false;
    if (s.target.type === 'control') {
      return t.type === 'control' && t.controlId === s.target.controlId && t.path === s.target.path;
    }
    if (s.target.type === 'panel') {
      return t.type === 'panel' && t.prop === s.target.prop;
    }
    if (s.target.type === 'callback') {
      return t.type === 'callback' && t._swatchKey === s.key;
    }
    return false;
  }

  function rgb(value) {
    const hex = String(value ?? '333333').replace(/^#/, '');
    return hex.length >= 6 ? hex.slice(-6) : '333333';
  }
</script>

<div class="swatchcluster" role="group">
  {#each shown as s (s.key)}
    <span class="swx">
      <button type="button"
              class:live={isLive(s, $colorTarget)}
              class:from-set={s.fromSet}
              style="background:#{rgb(s.value)}"
              title={s.fromSet
                ? `${s.label} — from the control set. Click to edit in the Colors tab; a colour you pick is this control's own.`
                : `${s.label} — click to edit in the Colors tab`}
              aria-label={s.fromSet ? `${s.label} colour, from the control set` : `${s.label} colour`}
              onclick={() => pick(s)}></button>
      <i>{s.label}</i>
    </span>
  {/each}
</div>

<style>
  .swatchcluster {
    display: flex;
    gap: 4px;
    flex: 1;
    min-width: 0;
  }

  .swx {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
    flex: 1;
    min-width: 0;
  }

  .swx button {
    width: 100%;
    height: 20px;
    border-radius: 3px;
    border: 1px solid #444;
    cursor: pointer;
    padding: 0;
  }

  .swx button:hover {
    border-color: #5B9BD5;
  }

  /* From the set: a small corner notch, so a set's colour reads as the set's, not the author's. */
  .swx button.from-set {
    position: relative;
  }
  .swx button.from-set::after {
    content: '';
    position: absolute;
    right: 1px;
    bottom: 1px;
    width: 0;
    height: 0;
    border-style: solid;
    border-width: 0 0 6px 6px;
    border-color: transparent transparent #E8E8EE transparent;
    filter: drop-shadow(0 0 1px rgba(0, 0, 0, 0.8));
    pointer-events: none;
  }

  .swx button.live {
    outline: 2px solid #5B9BD5;
    outline-offset: 1px;
  }

  .swx button:focus-visible {
    outline: 2px solid #5B9BD5;
    outline-offset: 1px;
  }

  .swx i {
    font-size: 8px;
    font-style: normal;
    color: #777;
    text-transform: uppercase;
    letter-spacing: 0.02em;
    white-space: nowrap;
    overflow: hidden;
    max-width: 100%;
    text-overflow: ellipsis;
    user-select: none;
  }
</style>
