<script>
  /**
   * The Mouse tab.
   *
   * The tab has existed since long before this editor did, and rendered
   * "Component: Mouse" the whole time because nothing was registered behind
   * it. The section it edits was equally inert — nine fields in the model that
   * no renderer read.
   *
   * So the rule this editor is built to is: every cell here changes something
   * observable. A field that nothing consumes does not get a control, however
   * tempting the symmetry — that is how the empty tab happened in the first
   * place. `Mouse.draggable` is the one field deliberately absent: moving a
   * control with the pointer at runtime is a feature, not a setting, and there
   * is no runtime behind it yet.
   *
   * Everything here applies to the preview surface and the finished plugin,
   * not to the editor canvas. See the comment in CanvasControl.
   */
  import { getSection, updateControlProperty } from '../stores/controls.js';
  import {
    CURSOR_OPTIONS,
    HIT_TEST_SHAPES,
    DRAG_MODE_OPTIONS,
    getCursor,
    getHitTestShape,
    getDragMode,
    getDragSensitivity,
    resolveTabIndex,
  } from '../utils/mouseBehavior.js';
  import PropertyCell from '../properties/PropertyCell.svelte';
  import PropertySection from '../properties/PropertySection.svelte';
  import PropertyToggle from '../properties/PropertyToggle.svelte';

  let { control = null } = $props();

  let core = $derived(getSection(control, 'Core'));
  let m = $derived(getSection(control, 'Mouse'));
  let behavior = $derived(getSection(control, 'Behavior'));

  function set(prop, value) {
    if (!core?.id) return;
    updateControlProperty(core.id, `Mouse.${prop}`, value);
  }

  // Wheel and mouse-direction already live on Behavior for range-family
  // controls, and the runtime reads them there. Writing a second copy under
  // Mouse would give the same switch two homes and let them disagree, so these
  // two cells edit the Behavior block directly and only appear on controls
  // that have one.
  function setBehavior(prop, value) {
    if (!core?.id) return;
    updateControlProperty(core.id, `Behavior.${prop}`, value);
  }
  let hasWheelBehavior = $derived(!!behavior);

  function num(value, fallback) {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
  }
  function clampInt(value, lo, hi, fallback) {
    const n = Math.round(num(value, fallback));
    return n < lo ? lo : n > hi ? hi : n;
  }

  let dragMode = $derived(getDragMode(m));
  let focusable = $derived(m?.focusable === true);
</script>

{#if m}
  <PropertySection title="Pointer">
    <PropertyCell label="Cursor" span={2} hint="Pointer shape over this control in preview and in the plugin. 'default' leaves the surface's own cursor alone.">
      <select class="val" value={getCursor(m)} onchange={(event) => set('cursor', event.target.value)}>
        {#each CURSOR_OPTIONS as option (option)}<option value={option}>{option}</option>{/each}
      </select>
    </PropertyCell>
    <PropertyCell label="Hit Shape" span={2} hint="rectangle uses the full box. ellipse inscribes an oval, so the corners of a round knob stop swallowing clicks meant for what is behind it — the artwork is clipped to match.">
      <select class="val" value={getHitTestShape(m)} onchange={(event) => set('hitTestShape', event.target.value)}>
        {#each HIT_TEST_SHAPES as option (option)}<option value={option}>{option}</option>{/each}
      </select>
    </PropertyCell>
    <PropertyCell label="Take Clicks" span={2} hint="Off makes the control transparent to the pointer: clicks land on whatever sits behind it. Controls nested inside keep working.">
      <PropertyToggle value={m.interceptClicks !== false} onchange={() => set('interceptClicks', !(m.interceptClicks !== false))} />
    </PropertyCell>
    <PropertyCell label="Child Clicks" span={2} hint="On lets the parts inside become click targets in their own right, instead of the control being one opaque hit area.">
      <PropertyToggle value={m.interceptChildClicks === true} onchange={() => set('interceptChildClicks', !(m.interceptChildClicks === true))} />
    </PropertyCell>
    <PropertyCell label="Raise On Click" span={2} hint="Bring the control in front of overlapping ones when pressed. Lasts for the preview session only — the authored order comes back when preview stops.">
      <PropertyToggle value={m.bringToFrontOnClick === true} onchange={() => set('bringToFrontOnClick', !(m.bringToFrontOnClick === true))} />
    </PropertyCell>
  </PropertySection>

  <PropertySection title="Focus">
    <PropertyCell label="Focusable" span={2} hint="Let the control take keyboard focus in preview and in the plugin. Off keeps it out of the tab order entirely.">
      <PropertyToggle value={focusable} onchange={() => set('focusable', !focusable)} />
    </PropertyCell>
    <PropertyCell label="Tab Index" span={2} hint="Position in the tab order. -1 means reachable by click but skipped by Tab; 0 means natural order. Controls with a role of their own keep the order the surface assigns.">
      <input class="val" type="number" min="-1" max="999" step="1" value={resolveTabIndex(m)} onchange={(event) => set('tabIndex', clampInt(event.target.value, -1, 999, -1))} />
    </PropertyCell>
    <PropertyCell label="Focus Ring" span={2} hint="Draw a ring when focus arrives by keyboard. Clicking never draws it, which is what a plugin UI wants.">
      <PropertyToggle value={m.focusOutline === true} onchange={() => set('focusOutline', !(m.focusOutline === true))} />
    </PropertyCell>
  </PropertySection>

  <PropertySection title="Drag">
    <PropertyCell label="Drag Mode" span={2} hint="How pointer motion becomes value. auto follows the control's own geometry — the behaviour it had before this setting existed. vertical is the plugin-standard knob drag; circular follows rotation about the centre; free counts motion in every direction.">
      <select class="val" value={dragMode} onchange={(event) => set('dragMode', event.target.value)}>
        {#each DRAG_MODE_OPTIONS as option (option)}<option value={option}>{option}</option>{/each}
      </select>
    </PropertyCell>
    <PropertyCell label="Sensitivity" span={2} hint="Multiplier on the control's own drag rate. 1 leaves it exactly as it is; 2 makes the same travel cover twice the range; 0.5 halves it for fine work.">
      <input class="val" type="number" min="0.01" max="10" step="0.05" value={getDragSensitivity(m)} onchange={(event) => set('dragSensitivity', Math.max(0.01, Math.min(10, num(event.target.value, 1))))} />
    </PropertyCell>
    <PropertyCell label="Invert X" span={1} hint="Flip whatever this control already does horizontally — on a right-to-left slider it reverses that, rather than forcing one absolute direction.">
      <PropertyToggle value={m.invertX === true} onchange={() => set('invertX', !(m.invertX === true))} />
    </PropertyCell>
    <PropertyCell label="Invert Y" span={1} hint="Flip whatever this control already does vertically.">
      <PropertyToggle value={m.invertY === true} onchange={() => set('invertY', !(m.invertY === true))} />
    </PropertyCell>
  </PropertySection>

  {#if hasWheelBehavior}
    <PropertySection title="Wheel">
      <PropertyCell label="Wheel" span={2} hint="Allow mouse-wheel scrubbing while the control is focused or hovered. Shared with the Slider tab — one setting, two places to reach it.">
        <PropertyToggle value={behavior.wheelEnabled === true} onchange={() => setBehavior('wheelEnabled', !(behavior.wheelEnabled === true))} />
      </PropertyCell>
      <PropertyCell label="Reverse Mouse" span={2} hint="Invert wheel and drag value direction without changing the visual track direction. Shared with the Slider tab.">
        <PropertyToggle value={behavior.reverseMouseDirection === true} onchange={() => setBehavior('reverseMouseDirection', !(behavior.reverseMouseDirection === true))} />
      </PropertyCell>
    </PropertySection>
  {/if}
{/if}

<style>
  .val {
    width: 100%;
    min-width: 0;
    background: #1A1A1A;
    border: 1px solid #333;
    border-radius: 3px;
    color: #DDD;
    font-size: 11px;
    padding: 4px 6px;
    font-family: inherit;
    outline: none;
    box-sizing: border-box;
  }

  .val:focus {
    border-color: #5B9BD5;
  }
</style>
