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
  import NumberCell from '../properties/NumberCell.svelte';
  import FlagStrip from '../properties/FlagStrip.svelte';
  import HeaderPill from '../properties/HeaderPill.svelte';
  import MousePointerClick from 'lucide-svelte/icons/mouse-pointer-click';
  import Layers from 'lucide-svelte/icons/layers';
  import BringToFront from 'lucide-svelte/icons/bring-to-front';
  import FlipHorizontal from 'lucide-svelte/icons/flip-horizontal-2';
  import FlipVertical from 'lucide-svelte/icons/flip-vertical-2';
  import Mouse from 'lucide-svelte/icons/mouse';
  import MoveHorizontal from 'lucide-svelte/icons/move-horizontal';
  import MousePointer from 'lucide-svelte/icons/mouse-pointer';
  import Focus from 'lucide-svelte/icons/focus';
  import Hand from 'lucide-svelte/icons/hand';
  import ChevronsUpDown from 'lucide-svelte/icons/chevrons-up-down';

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
  <PropertySection title="Pointer" icon={MousePointer}>
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
    <PropertyCell label="Clicks" span={2} hint="Take clicks, child part clicks, raise on click. Hover a chip for its name.">
      <FlagStrip
        flags={[
          { key: 'take', title: 'Take Clicks — off makes the control transparent to the pointer: clicks land on whatever sits behind it; controls nested inside keep working', on: m.interceptClicks !== false, icon: MousePointerClick },
          { key: 'child', title: 'Child Clicks — let the parts inside become click targets in their own right, instead of the control being one opaque hit area', on: m.interceptChildClicks === true, icon: Layers },
          { key: 'raise', title: 'Raise On Click — bring the control in front of overlapping ones when pressed, for the preview session only', on: m.bringToFrontOnClick === true, icon: BringToFront },
        ]}
        ontoggle={(key) => {
          if (key === 'take') set('interceptClicks', !(m.interceptClicks !== false));
          else if (key === 'child') set('interceptChildClicks', !(m.interceptChildClicks === true));
          else if (key === 'raise') set('bringToFrontOnClick', !(m.bringToFrontOnClick === true));
        }}
      />
    </PropertyCell>
  </PropertySection>

  <PropertySection title="Focus" icon={Focus}>
    {#snippet tools()}
      <HeaderPill value={focusable}
                  title="Let the control take keyboard focus in preview and in the plugin. Off keeps it out of the tab order entirely."
                  onchange={() => set('focusable', !focusable)} />
    {/snippet}
    {#if focusable}
      <PropertyCell label="Tab Index" span={2} compact hint="Position in the tab order. -1 means reachable by click but skipped by Tab; 0 means natural order. Controls with a role of their own keep the order the surface assigns.">
        <NumberCell label="Tab" min={-1} max={999} step={1} value={resolveTabIndex(m)} onchange={(v) => set('tabIndex', clampInt(v, -1, 999, -1))} />
      </PropertyCell>
      <PropertyCell label="Focus Ring" span={2} hint="Draw a ring when focus arrives by keyboard. Clicking never draws it, which is what a plugin UI wants.">
        <PropertyToggle value={m.focusOutline === true} onchange={() => set('focusOutline', !(m.focusOutline === true))} />
      </PropertyCell>
    {/if}
  </PropertySection>

  <PropertySection title="Drag" icon={Hand}>
    <PropertyCell label="Drag Mode" span={2} hint="How pointer motion becomes value. auto follows the control's own geometry — the behaviour it had before this setting existed. vertical is the plugin-standard knob drag; circular follows rotation about the centre; free counts motion in every direction.">
      <select class="val" value={dragMode} onchange={(event) => set('dragMode', event.target.value)}>
        {#each DRAG_MODE_OPTIONS as option (option)}<option value={option}>{option}</option>{/each}
      </select>
    </PropertyCell>
    <PropertyCell label="Sensitivity" span={2} compact hint="Multiplier on the control's own drag rate. 1 leaves it exactly as it is; 2 makes the same travel cover twice the range; 0.5 halves it for fine work.">
      <NumberCell label="Sens" min={0.01} max={10} step={0.05} value={getDragSensitivity(m)} onchange={(v) => set('dragSensitivity', Math.max(0.01, Math.min(10, v)))} />
    </PropertyCell>
    <PropertyCell label="Invert" span={2} hint="Invert X, invert Y. Hover a chip for its name.">
      <FlagStrip
        flags={[
          { key: 'x', title: 'Invert X — flip whatever this control already does horizontally; on a right-to-left slider it reverses that, rather than forcing one absolute direction', on: m.invertX === true, icon: FlipHorizontal },
          { key: 'y', title: 'Invert Y — flip whatever this control already does vertically', on: m.invertY === true, icon: FlipVertical },
        ]}
        ontoggle={(key) => {
          if (key === 'x') set('invertX', !(m.invertX === true));
          else if (key === 'y') set('invertY', !(m.invertY === true));
        }}
      />
    </PropertyCell>
  </PropertySection>

  {#if hasWheelBehavior}
    <PropertySection title="Wheel" icon={ChevronsUpDown}>
      <PropertyCell label="Wheel" span={2} hint="Wheel scrubbing, reversed mouse direction — shared with the Slider tab. Hover a chip for its name.">
        <FlagStrip
          flags={[
            { key: 'wheel', title: 'Wheel — allow mouse-wheel scrubbing while the control is focused or hovered', on: behavior.wheelEnabled === true, icon: Mouse },
            { key: 'reverse', title: 'Reverse Mouse — invert wheel and drag value direction without changing the visual track direction', on: behavior.reverseMouseDirection === true, icon: MoveHorizontal },
          ]}
          ontoggle={(key) => {
            if (key === 'wheel') setBehavior('wheelEnabled', !(behavior.wheelEnabled === true));
            else if (key === 'reverse') setBehavior('reverseMouseDirection', !(behavior.reverseMouseDirection === true));
          }}
        />
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
