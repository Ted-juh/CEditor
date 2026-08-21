<script>
  import { colorTarget, activateColorTarget } from '../stores/colorTarget.js';
  import { displayTabRequest } from '../stores/displayTab.js';

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

  function pick(s) {
    // The swatch key rides along so callback targets (dynamic collections
    // with no stable path) can still be matched for the live ring.
    activateColorTarget({ ...s.target, _swatchKey: s.key }, s.value);
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
  {#each swatches as s (s.key)}
    <span class="swx">
      <button type="button"
              class:live={isLive(s, $colorTarget)}
              style="background:#{rgb(s.value)}"
              title="{s.label} — click to edit in the Colors tab"
              aria-label="{s.label} colour"
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
