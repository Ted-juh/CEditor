<script>
  import { getSection, updateControlProperty, updateSelectedProperty, applyControlPatch, applySelectedPatch } from '../stores/controls.js';
  import { selectedComponentIds } from '../stores/panels.js';
  import PropertyCell from '../properties/PropertyCell.svelte';
  import PropertySection from '../properties/PropertySection.svelte';
  import PropertyToggle from '../properties/PropertyToggle.svelte';
  import NumberCell from '../properties/NumberCell.svelte';
  import PropertyScrub from '../properties/PropertyScrub.svelte';
  import FlagStrip from '../properties/FlagStrip.svelte';
  import Magnet from 'lucide-svelte/icons/magnet';
  import Ruler from 'lucide-svelte/icons/ruler';
  import Shuffle from 'lucide-svelte/icons/shuffle';
  import MoveHorizontal from 'lucide-svelte/icons/move-horizontal';
  import Tags from 'lucide-svelte/icons/tags';
  import AlignCenterVertical from 'lucide-svelte/icons/align-center-vertical';
  import Keyboard from 'lucide-svelte/icons/keyboard';
  import Mouse from 'lucide-svelte/icons/mouse';
  import CheckCheck from 'lucide-svelte/icons/check-check';
  import Hand from 'lucide-svelte/icons/hand';
  import Type from 'lucide-svelte/icons/type';
  import Bookmark from 'lucide-svelte/icons/bookmark';
  import Shapes from 'lucide-svelte/icons/shapes';
  import Hash from 'lucide-svelte/icons/hash';
  import MousePointer from 'lucide-svelte/icons/mouse-pointer';
  import Palette from 'lucide-svelte/icons/palette';
  import BackgroundEditor from './BackgroundEditor.svelte';
  import { createSliderSemanticParts } from '../utils/sliderEntityFactory.js';
  import { numberOr } from '../utils/primitives.js';

  let { control = null } = $props();

  const STYLE_TARGETS = [
    { id: 'bodyTrackBase', path: 'Parts.bodyTrackBase.Background', label: 'Track Base' },
    { id: 'bodyTrackFill', path: 'Parts.bodyTrackFill.Background', label: 'Value Fill' },
    { id: 'bodySelectedRange', path: 'Parts.bodySelectedRange.Background', label: 'Range Fill' },
    { id: 'pointerStart', path: 'Parts.pointerStart.Background', label: 'Start Handle' },
    { id: 'pointerCurrent', path: 'Parts.pointerCurrent.Background', label: 'Current Handle' },
    { id: 'pointerEnd', path: 'Parts.pointerEnd.Background', label: 'End Handle' },
  ];

  let selectedStyleTarget = $state('bodyTrackBase');
  let labelPositionTarget = $state('');

  const READOUT_POSITION_OPTIONS = [
    { value: 'auto', label: 'auto' },
    { value: 'top', label: 'top' },
    { value: 'center', label: 'center' },
    { value: 'bottom', label: 'bottom' },
  ];

  function set(path, value) {
    const controlId = getSection(control, 'Core')?.id;
    if (!controlId) return;
    if ($selectedComponentIds.size > 1) {
      updateSelectedProperty(path, value);
    } else {
      updateControlProperty(controlId, path, value);
    }
  }

  function setPatch(patch = {}) {
    const controlId = getSection(control, 'Core')?.id;
    if (!controlId) return;
    if ($selectedComponentIds.size > 1) {
      applySelectedPatch(patch);
    } else {
      applyControlPatch(controlId, patch);
    }
  }

  function regenerateSliderParts() {
    setPatch({
      Parts: createSliderSemanticParts(),
    });
  }

  function midpoint(min, max) {
    return min + ((max - min) * 0.5);
  }

  function clampSweep(value) {
    return Math.max(1, Math.min(360, Math.abs(numberOr(value, 270))));
  }

  function circularEndAngle() {
    const start = numberOr(behavior?.startAngle, 135);
    const sweep = numberOr(behavior?.sweepAngle, 270);
    return String(behavior?.direction ?? 'cw') === 'ccw'
      ? start - sweep
      : start + sweep;
  }

  function setCircularEndAngle(value) {
    const start = numberOr(behavior?.startAngle, 135);
    set('Behavior.sweepAngle', clampSweep(numberOr(value, start) - start));
  }

  function showLabelPositionEditor(target, event) {
    event?.preventDefault?.();
    labelPositionTarget = labelPositionTarget === target ? '' : target;
  }

  function minMaxPositionOptions() {
    if (geometry === 'circular') {
      return [
        { value: 'auto', label: 'auto' },
        { value: 'outside', label: 'outside' },
        { value: 'inside', label: 'inside' },
        { value: 'center', label: 'center' },
      ];
    }

    if (String(behavior?.orientation ?? 'horizontal') === 'vertical') {
      return [
        { value: 'auto', label: 'auto' },
        { value: 'right', label: 'right' },
        { value: 'left', label: 'left' },
        { value: 'center', label: 'center' },
      ];
    }

    return [
      { value: 'auto', label: 'auto' },
      { value: 'below', label: 'below' },
      { value: 'above', label: 'above' },
      { value: 'center', label: 'center' },
    ];
  }

  function applyPreset(preset) {
    const min = preset.bipolar === true ? -1 : numberOr(behavior?.min, 0);
    const max = preset.bipolar === true ? 1 : numberOr(behavior?.max, 1);
    const center = preset.bipolar === true ? 0 : midpoint(min, max);
    const basePatch = {
      'Behavior.geometry': preset.geometry,
      'Behavior.valueMode': preset.valueMode,
      'Behavior.orientation': preset.orientation ?? 'horizontal',
      'Behavior.direction': preset.direction,
      'Behavior.startAngle': preset.startAngle ?? 135,
      'Behavior.sweepAngle': preset.sweepAngle ?? 270,
      'Behavior.circularDiameter': preset.circularDiameter ?? 0,
      'Behavior.allowWrapAround': preset.allowWrapAround ?? false,
      'Behavior.min': min,
      'Behavior.max': max,
      'Behavior.step': preset.bipolar === true ? 0.01 : numberOr(behavior?.step, 0.01),
      'Behavior.precision': preset.bipolar === true ? 2 : numberOr(behavior?.precision, 2),
      'Behavior.centerValue': center,
      'Behavior.fillOrigin': preset.bipolar === true ? 'center' : 'min',
      'Behavior.showHandleLabels': preset.valueMode !== 'single',
      'Behavior.showValueReadout': true,
      'Behavior.showTicks': true,
      'Behavior.showMinMaxLabels': true,
      'Behavior.showCenterMarker': preset.bipolar === true,
      'Behavior.showSign': preset.bipolar === true,
      'Behavior.defaultStartValue': min + ((max - min) * 0.25),
      'Behavior.defaultCurrentValue': preset.bipolar === true ? center : midpoint(min, max),
      'Behavior.defaultEndValue': min + ((max - min) * 0.75),
      Parts: createSliderSemanticParts(),
      'Transform.width': preset.width,
      'Transform.height': preset.height,
    };
    setPatch(basePatch);
  }

  let behavior = $derived(getSection(control, 'Behavior'));
  // Absent, not zero: the readout range is off until someone sets it, and `null` is how the model
  // says so — the same tri-state the section padding uses, for the same reason.
  let displayScaleOff = $derived(behavior?.displayMin == null && behavior?.displayMax == null);
  let parts = $derived(getSection(control, 'Parts'));
  let geometry = $derived(String(behavior?.geometry ?? 'linear'));
  let valueMode = $derived(String(behavior?.valueMode ?? 'single'));
  let selectedStyleTargetMeta = $derived(STYLE_TARGETS.find((target) => target.id === selectedStyleTarget) ?? STYLE_TARGETS[0]);
  let selectedStyleBackground = $derived(parts?._children?.[selectedStyleTargetMeta?.id]?._children?.Background ?? null);
</script>

{#if behavior}
  <PropertySection title="Slider Presets" icon={Bookmark}>
    <PropertyCell label="Linear" span={4} hint="Insert a ready-made starting point and refresh the semantic slider style parts.">
      <div class="preset-grid">
        <button class="preset-btn" type="button" onclick={() => applyPreset({ geometry: 'linear', valueMode: 'single', direction: 'ltr', width: 220, height: 48 })}>Single</button>
        <button class="preset-btn" type="button" onclick={() => applyPreset({ geometry: 'linear', valueMode: 'single', direction: 'ltr', width: 240, height: 56, bipolar: true })}>Bipolar</button>
        <button class="preset-btn" type="button" onclick={() => applyPreset({ geometry: 'linear', valueMode: 'range', direction: 'ltr', width: 240, height: 56 })}>Range</button>
        <button class="preset-btn" type="button" onclick={() => applyPreset({ geometry: 'linear', valueMode: 'band', direction: 'ltr', width: 260, height: 64 })}>Band</button>
      </div>
    </PropertyCell>
    <PropertyCell label="Circular" span={4} hint="Circular presets keep the same slider family and just change geometry/value mode defaults.">
      <div class="preset-grid">
        <button class="preset-btn" type="button" onclick={() => applyPreset({ geometry: 'circular', valueMode: 'single', direction: 'cw', startAngle: 135, sweepAngle: 270, width: 180, height: 180 })}>Single</button>
        <button class="preset-btn" type="button" onclick={() => applyPreset({ geometry: 'circular', valueMode: 'single', direction: 'cw', startAngle: 135, sweepAngle: 270, width: 200, height: 200, bipolar: true })}>Bipolar</button>
        <button class="preset-btn" type="button" onclick={() => applyPreset({ geometry: 'circular', valueMode: 'range', direction: 'cw', startAngle: 135, sweepAngle: 270, width: 200, height: 200 })}>Range</button>
        <button class="preset-btn" type="button" onclick={() => applyPreset({ geometry: 'circular', valueMode: 'band', direction: 'cw', startAngle: 135, sweepAngle: 270, width: 220, height: 220 })}>Band</button>
      </div>
    </PropertyCell>
    <PropertyCell label="Refresh Parts" span={4} hint="Rebuild the semantic ready-made slider style parts if they were removed or drifted too far.">
      <button class="preset-btn wide" type="button" onclick={regenerateSliderParts}>Regenerate parts</button>
    </PropertyCell>
  </PropertySection>

  <PropertySection title="Type" icon={Shapes}>
    <PropertyCell label="Geometry" span={2} hint="Linear uses a track axis, circular uses a dial arc.">
      <select class="val" value={geometry} onchange={(event) => set('Behavior.geometry', event.target.value)}>
        <option value="linear">linear</option>
        <option value="circular">circular</option>
      </select>
    </PropertyCell>
    <PropertyCell label="Mode" span={2} hint="Single uses one handle, range uses two, band uses three.">
      <select class="val" value={valueMode} onchange={(event) => set('Behavior.valueMode', event.target.value)}>
        <option value="single">single</option>
        <option value="range">range</option>
        <option value="band">band</option>
      </select>
    </PropertyCell>

    {#if geometry === 'linear'}
      <PropertyCell label="Orientation" span={2} hint="Horizontal and vertical stay within the same linear slider family.">
        <select class="val" value={behavior.orientation ?? 'horizontal'} onchange={(event) => set('Behavior.orientation', event.target.value)}>
          <option value="horizontal">horizontal</option>
          <option value="vertical">vertical</option>
        </select>
      </PropertyCell>
      <PropertyCell label="Direction" span={2} hint="Choose the authored value direction.">
        <select class="val" value={behavior.direction ?? 'ltr'} onchange={(event) => set('Behavior.direction', event.target.value)}>
          {#if String(behavior.orientation ?? 'horizontal') === 'vertical'}
            <option value="btt">btt</option>
            <option value="ttb">ttb</option>
          {:else}
            <option value="ltr">ltr</option>
            <option value="rtl">rtl</option>
          {/if}
        </select>
      </PropertyCell>
    {:else}
      <PropertyCell label="Direction" span={2} hint="Dial travel can run clockwise or counterclockwise.">
        <select class="val" value={behavior.direction ?? 'cw'} onchange={(event) => set('Behavior.direction', event.target.value)}>
          <option value="cw">cw</option>
          <option value="ccw">ccw</option>
        </select>
      </PropertyCell>
      <PropertyCell label="Wrap" span={1} hint="Allow circular range/band spans to cross the seam.">
        <PropertyToggle value={behavior.allowWrapAround === true} onchange={() => set('Behavior.allowWrapAround', !(behavior.allowWrapAround === true))} />
      </PropertyCell>
      <PropertyCell label="Start Angle" span={1} compact hint="Angle where the circular slider begins.">
        <NumberCell label="Start" value={behavior.startAngle ?? 135} defaultValue={135} step={1} min={-720} max={720} onchange={(value) => set('Behavior.startAngle', value)} />
      </PropertyCell>
      <PropertyCell label="End Angle" span={1} compact hint="Angle where the circular slider ends; changing it updates the sweep.">
        <NumberCell label="End" value={circularEndAngle()} step={1} min={-720} max={720} onchange={setCircularEndAngle} />
      </PropertyCell>
      <PropertyCell label="Sweep" span={2} hint="How much of the circle is active.">
        <PropertyScrub value={behavior.sweepAngle ?? 270} step={1} min={1} max={360} defaultValue={270} onchange={(value) => set('Behavior.sweepAngle', clampSweep(value))} />
      </PropertyCell>
      <PropertyCell label="Diameter" span={1} compact hint="Circular track diameter in pixels. Set to 0 for automatic fitting.">
        <NumberCell label="Diam" value={behavior.circularDiameter ?? 0} defaultValue={0} step={1} min={0} onchange={(value) => set('Behavior.circularDiameter', Math.max(0, value))} />
      </PropertyCell>
      <PropertyCell label="Drag" span={2} hint="absolute jumps to the clicked angle; knob is the plugin-standard vertical drag from the current value; rotary follows actual rotation about the dial.">
        <select class="val" value={behavior.circularDragMode ?? 'absolute'} onchange={(event) => set('Behavior.circularDragMode', event.target.value)}>
          <option value="absolute">absolute</option>
          <option value="knob">knob</option>
          <option value="rotary">rotary</option>
        </select>
      </PropertyCell>
      {#if (behavior.circularDragMode === 'knob' || behavior.circularDragMode === 'rotary')}
        <PropertyCell label="Drag Speed" span={2} hint="Sensitivity multiplier for the relative drag. 1 means 250px of travel (knob) or one full turn (rotary) covers the whole range.">
          <PropertyScrub value={behavior.circularDragSensitivity ?? 1} step={0.1} min={0.1} max={10} defaultValue={1} onchange={(value) => set('Behavior.circularDragSensitivity', Math.max(0.1, Math.min(10, value)))} />
        </PropertyCell>
      {/if}
    {/if}
  </PropertySection>

  <PropertySection title="Values" icon={Hash}>
    <PropertyCell label="Min" span={1} compact hint="Numeric minimum for the slider domain.">
      <NumberCell label="Min" value={behavior.min ?? 0} defaultValue={0} step={1} onchange={(value) => set('Behavior.min', value)} />
    </PropertyCell>
    <PropertyCell label="Max" span={1} compact hint="Numeric maximum for the slider domain.">
      <NumberCell label="Max" value={behavior.max ?? 1} defaultValue={1} step={1} onchange={(value) => set('Behavior.max', value)} />
    </PropertyCell>
    <PropertyCell label="Step" span={1} compact hint="Primary legal increment for keyboard, wheel, and snapping.">
      <NumberCell label="Step" value={behavior.step ?? 0.01} defaultValue={0.01} step={0.01} min={0.001} onchange={(value) => set('Behavior.step', value)} />
    </PropertyCell>
    <PropertyCell label="Precision" span={1} compact hint="Readout precision for labels and preview text.">
      <NumberCell label="Prec" value={behavior.precision ?? 2} defaultValue={2} step={1} min={0} max={6} onchange={(value) => set('Behavior.precision', Math.max(0, Math.round(value)))} />
    </PropertyCell>
    <PropertyCell label="Centre" span={1} compact hint="Optional centre reference value for bipolar sliders and centre markers.">
      <NumberCell label="Centre" value={behavior.centerValue ?? ((numberOr(behavior.min, 0) + numberOr(behavior.max, 1)) / 2)} defaultValue={(numberOr(behavior.min, 0) + numberOr(behavior.max, 1)) / 2} step={numberOr(behavior.step, 0.01)} onchange={(value) => set('Behavior.centerValue', value)} />
    </PropertyCell>
    <PropertyCell label="Fill Origin" span={1} hint="Choose where single-value fill starts.">
      <select class="val" value={behavior.fillOrigin ?? 'min'} onchange={(event) => set('Behavior.fillOrigin', event.target.value)}>
        <option value="min">min</option>
        <option value="center">center</option>
      </select>
    </PropertyCell>

    {#if valueMode !== 'single'}
      <PropertyCell label="Default Start" span={1} compact hint="Authored default for the start handle.">
        <NumberCell label="Start" value={behavior.defaultStartValue ?? behavior.min ?? 0} defaultValue={behavior.min ?? 0} step={numberOr(behavior.step, 0.01)} onchange={(value) => set('Behavior.defaultStartValue', value)} />
      </PropertyCell>
    {/if}
    <PropertyCell label="Default Current" span={valueMode === 'single' ? 2 : 1} compact hint="Authored default for the current handle/value.">
      <NumberCell label="Cur" value={behavior.defaultCurrentValue ?? 0} defaultValue={0} step={numberOr(behavior.step, 0.01)} onchange={(value) => set('Behavior.defaultCurrentValue', value)} />
    </PropertyCell>
    {#if valueMode !== 'single'}
      <PropertyCell label="Default End" span={1} compact hint="Authored default for the end handle.">
        <NumberCell label="End" value={behavior.defaultEndValue ?? behavior.max ?? 1} defaultValue={behavior.max ?? 1} step={numberOr(behavior.step, 0.01)} onchange={(value) => set('Behavior.defaultEndValue', value)} />
      </PropertyCell>
    {/if}

    <PropertyCell label="Snap / Cross" span={2} hint="Snap to step, snap to ticks, allow handle crossing. Hover a chip for its name.">
      <FlagStrip
        flags={[
          { key: 'Behavior.snapToStep', title: 'Snap to step progression', on: behavior.snapToStep !== false, icon: Magnet },
          { key: 'Behavior.snapToTicks', title: 'Snap to ticks when they differ from step spacing', on: behavior.snapToTicks === true, icon: Ruler },
          { key: 'Behavior.allowHandleCross', title: 'Allow handles to cross each other', on: behavior.allowHandleCross === true, icon: Shuffle },
        ]}
        ontoggle={(key, next) => set(key, next)}
      />
    </PropertyCell>
    <PropertyCell label="Active" span={2} hint="Default policy for choosing the active handle in multi-value sliders.">
      <select class="val" value={behavior.activeHandlePolicy ?? 'currentFirst'} onchange={(event) => set('Behavior.activeHandlePolicy', event.target.value)}>
        <option value="nearest">nearest</option>
        <option value="lastUsed">lastUsed</option>
        <option value="currentFirst">currentFirst</option>
        <option value="startFirst">startFirst</option>
        <option value="endFirst">endFirst</option>
      </select>
    </PropertyCell>
  </PropertySection>

  <PropertySection title="Ticks & Labels" icon={Ruler}>
    <PropertyCell label="Show" span={4} hint="Ticks, min/max labels, handle labels, readout, centre marker. Right-click min/max or readout to place them.">
      <FlagStrip
        flags={[
          { key: 'ticks', title: 'Ticks — generated major/minor ticks', on: behavior.showTicks !== false, icon: Ruler },
          { key: 'minMax', title: 'Min / max labels (right-click to position)', on: behavior.showMinMaxLabels !== false, active: labelPositionTarget === 'minMax', icon: MoveHorizontal },
          { key: 'handleLabels', title: 'Handle labels beside the active handles', on: behavior.showHandleLabels === true, icon: Tags },
          { key: 'readout', title: 'Primary value readout (right-click to position)', on: behavior.showValueReadout !== false, active: labelPositionTarget === 'readout', icon: Type },
          { key: 'centerMarker', title: 'Centre marker at the authored centre value', on: behavior.showCenterMarker === true, icon: AlignCenterVertical },
        ]}
        ontoggle={(key) => {
          if (key === 'ticks') set('Behavior.showTicks', !(behavior.showTicks !== false));
          else if (key === 'minMax') set('Behavior.showMinMaxLabels', !(behavior.showMinMaxLabels !== false));
          else if (key === 'handleLabels') set('Behavior.showHandleLabels', !(behavior.showHandleLabels === true));
          else if (key === 'readout') set('Behavior.showValueReadout', !(behavior.showValueReadout !== false));
          else if (key === 'centerMarker') set('Behavior.showCenterMarker', !(behavior.showCenterMarker === true));
        }}
        oncontextmenu={(key, event) => {
          if (key === 'minMax' || key === 'readout') showLabelPositionEditor(key, event);
        }}
      />
    </PropertyCell>

    {#if labelPositionTarget === 'minMax'}
      <PropertyCell label="MinMax Pos" span={1} hint="Position for generated min and max labels.">
        <select class="val" value={behavior.labelMinMaxPlacement ?? 'auto'} onchange={(event) => set('Behavior.labelMinMaxPlacement', event.target.value)}>
          {#each minMaxPositionOptions() as option (option.value)}
            <option value={option.value}>{option.label}</option>
          {/each}
        </select>
      </PropertyCell>
      <PropertyCell label="Gap" span={1} compact hint="Distance from the track for generated min and max labels.">
        <NumberCell label="Gap" value={behavior.labelMinMaxGap ?? 22} defaultValue={22} step={1} onchange={(value) => set('Behavior.labelMinMaxGap', value)} />
      </PropertyCell>
      <PropertyCell label="Offset X" span={1} compact hint="Horizontal offset for generated min and max labels.">
        <NumberCell label="X" value={behavior.labelMinMaxOffsetX ?? 0} defaultValue={0} step={1} onchange={(value) => set('Behavior.labelMinMaxOffsetX', value)} />
      </PropertyCell>
      <PropertyCell label="Offset Y" span={1} compact hint="Vertical offset for generated min and max labels.">
        <NumberCell label="Y" value={behavior.labelMinMaxOffsetY ?? 0} defaultValue={0} step={1} onchange={(value) => set('Behavior.labelMinMaxOffsetY', value)} />
      </PropertyCell>
    {:else if labelPositionTarget === 'readout'}
      <PropertyCell label="Readout Pos" span={1} hint="Position for the generated value readout.">
        <select class="val" value={behavior.labelReadoutPlacement ?? 'auto'} onchange={(event) => set('Behavior.labelReadoutPlacement', event.target.value)}>
          {#each READOUT_POSITION_OPTIONS as option (option.value)}
            <option value={option.value}>{option.label}</option>
          {/each}
        </select>
      </PropertyCell>
      <PropertyCell label="Gap" span={1} compact hint="Distance from the component edge for top or bottom readout placement.">
        <NumberCell label="Gap" value={behavior.labelReadoutGap ?? 14} defaultValue={14} step={1} onchange={(value) => set('Behavior.labelReadoutGap', value)} />
      </PropertyCell>
      <PropertyCell label="Offset X" span={1} compact hint="Horizontal offset for the generated value readout.">
        <NumberCell label="X" value={behavior.labelReadoutOffsetX ?? 0} defaultValue={0} step={1} onchange={(value) => set('Behavior.labelReadoutOffsetX', value)} />
      </PropertyCell>
      <PropertyCell label="Offset Y" span={1} compact hint="Vertical offset for the generated value readout.">
        <NumberCell label="Y" value={behavior.labelReadoutOffsetY ?? 0} defaultValue={0} step={1} onchange={(value) => set('Behavior.labelReadoutOffsetY', value)} />
      </PropertyCell>
    {/if}

    <PropertyCell label="Major Count" span={1} compact hint="Generated major tick stops across the slider domain.">
      <NumberCell label="Major" value={behavior.majorTickCount ?? 11} defaultValue={11} step={1} min={2} onchange={(value) => set('Behavior.majorTickCount', Math.max(2, Math.round(value)))} />
    </PropertyCell>
    <PropertyCell label="Minor / Gap" span={1} compact hint="Minor ticks inserted between each pair of major ticks.">
      <NumberCell label="Minor" value={behavior.minorTickCount ?? 3} defaultValue={3} step={1} min={0} onchange={(value) => set('Behavior.minorTickCount', Math.max(0, Math.round(value)))} />
    </PropertyCell>
    <PropertyCell label="Tick Placement" span={2} hint="Place ticks inside or outside the body track.">
      <select class="val" value={behavior.tickPlacement ?? 'outside'} onchange={(event) => set('Behavior.tickPlacement', event.target.value)}>
        <option value="outside">outside</option>
        <option value="inside">inside</option>
        <option value="cross">cross</option>
      </select>
    </PropertyCell>
  </PropertySection>

  <PropertySection title="Interaction" icon={MousePointer}>
    <PropertyCell label="Track Click" span={2} hint="Choose whether a click grabs the nearest handle or keeps using the active one.">
      <select class="val" value={behavior.trackClickMode ?? 'moveNearestHandle'} onchange={(event) => set('Behavior.trackClickMode', event.target.value)}>
        <option value="moveNearestHandle">moveNearestHandle</option>
        <option value="moveActiveHandle">moveActiveHandle</option>
      </select>
    </PropertyCell>
    <PropertyCell label="Input" span={1} hint="Keyboard input, wheel scrubbing, reversed mouse direction. Hover a chip for its name.">
      <FlagStrip
        flags={[
          { key: 'keyboard', title: 'Keyboard — arrows, Home and End in preview/runtime', on: behavior.keyboardEnabled !== false, icon: Keyboard },
          { key: 'wheel', title: 'Mouse wheel scrubbing while focused or hovered', on: behavior.wheelEnabled === true, icon: Mouse },
          { key: 'reverse', title: 'Reverse mouse — invert wheel/drag value direction', on: behavior.reverseMouseDirection === true, icon: MoveHorizontal },
        ]}
        ontoggle={(key) => {
          if (key === 'keyboard') set('Behavior.keyboardEnabled', !(behavior.keyboardEnabled !== false));
          else if (key === 'wheel') set('Behavior.wheelEnabled', !(behavior.wheelEnabled === true));
          else if (key === 'reverse') set('Behavior.reverseMouseDirection', !(behavior.reverseMouseDirection === true));
        }}
      />
    </PropertyCell>
    <PropertyCell label="Emit" span={1} hint="Emit value-commit and active-handle-change metadata. Hover a chip for its name.">
      <FlagStrip
        flags={[
          { key: 'commit', title: 'Commit emission on pointer release and confirmed edits', on: behavior.emitValueCommit !== false, icon: CheckCheck },
          { key: 'handle', title: 'Active-handle change metadata when focus moves', on: behavior.emitActiveHandleChange !== false, icon: Hand },
        ]}
        ontoggle={(key) => {
          if (key === 'commit') set('Behavior.emitValueCommit', !(behavior.emitValueCommit !== false));
          else if (key === 'handle') set('Behavior.emitActiveHandleChange', !(behavior.emitActiveHandleChange !== false));
        }}
      />
    </PropertyCell>
  </PropertySection>

  <PropertySection title="Formatting" icon={Type}>
    <PropertyCell label="Prefix" span={1} hint="Shown before numeric values in handle labels and the readout.">
      <input class="val" type="text" value={behavior.prefix ?? ''} onchange={(event) => set('Behavior.prefix', event.target.value)} />
    </PropertyCell>
    <PropertyCell label="Suffix" span={1} hint="Shown after numeric values.">
      <input class="val" type="text" value={behavior.suffix ?? ''} onchange={(event) => set('Behavior.suffix', event.target.value)} />
    </PropertyCell>
    <PropertyCell label="Unit" span={1} hint="Optional unit added after the value text.">
      <input class="val" type="text" value={behavior.unit ?? ''} onchange={(event) => set('Behavior.unit', event.target.value)} />
    </PropertyCell>
    <PropertyCell label="Show Sign" span={1} hint="Show a plus sign for positive values.">
      <PropertyToggle value={behavior.showSign === true} onchange={() => set('Behavior.showSign', !(behavior.showSign === true))} />
    </PropertyCell>

    <!-- The readout's own range, when it differs from the wire's. A synth parameter stored 61..67
         and printed -3..+3 is the case this exists for; typing into the readout maps back, so the
         two directions agree. Both blank means no mapping at all. -->
    <PropertyCell label="Reads as" span={1} disabled={displayScaleOff}
                  hint="Low end of the range shown to the user, when it differs from the value range.">
      <NumberCell value={behavior.displayMin ?? behavior.min ?? 0} step={1}
                   onchange={(value) => set('Behavior.displayMin', value)} />
    </PropertyCell>
    <PropertyCell label="…to" span={1} disabled={displayScaleOff}
                  hint="High end of the range shown to the user.">
      <NumberCell value={behavior.displayMax ?? behavior.max ?? 1} step={1}
                   onchange={(value) => set('Behavior.displayMax', value)} />
    </PropertyCell>
    <PropertyCell label="Remap readout" span={4}
                  hint="Show a different range than the value range — for a parameter whose wire values are not what the instrument prints.">
      <PropertyToggle
        value={!displayScaleOff}
        onchange={(on) => {
          set('Behavior.displayMin', on ? numberOr(behavior.min, 0) : null);
          set('Behavior.displayMax', on ? numberOr(behavior.max, 1) : null);
        }}
      />
    </PropertyCell>
  </PropertySection>

  <PropertySection title="Style" icon={Palette}>
    <PropertyCell label="Edit Part" span={4} hint="Choose which slider element gets the full layered fill editor with solid, gradient, image, and overlay support.">
      <div class="style-target-grid">
        {#each STYLE_TARGETS as target (target.id)}
          <button
            class="style-target-btn"
            class:active={selectedStyleTarget === target.id}
            type="button"
            onclick={() => selectedStyleTarget = target.id}
          >
            {target.label}
          </button>
        {/each}
      </div>
    </PropertyCell>

    <PropertyCell label="Track Size" span={1} compact hint="Thickness used by the ready-made slider body.">
      <NumberCell label="Track" value={parts?._children?.bodyTrackBase?._children?.Layout?.height ?? 10} defaultValue={10} step={1} min={2} onchange={(value) => setPatch({
        'Parts.bodyTrackBase.Layout.height': value,
        'Parts.bodyTrackFill.Layout.height': value,
        'Parts.bodySelectedRange.Layout.height': value,
      })} />
    </PropertyCell>

    <PropertyCell label="Pointer Size" span={1} compact hint="Primary current-handle size.">
      <NumberCell label="Ptr" value={parts?._children?.pointerCurrent?._children?.Layout?.width ?? 20} defaultValue={20} step={1} min={8} onchange={(value) => setPatch({
        'Parts.pointerStart.Layout.width': value,
        'Parts.pointerStart.Layout.height': value,
        'Parts.pointerCurrent.Layout.width': value,
        'Parts.pointerCurrent.Layout.height': value,
        'Parts.pointerEnd.Layout.width': value,
        'Parts.pointerEnd.Layout.height': value,
      })} />
    </PropertyCell>
    <PropertyCell label="Tick Major" span={1} compact hint="Generated major tick length.">
      <NumberCell label="Major" value={parts?._children?.tickMajor?._children?.Layout?.height ?? 12} defaultValue={12} step={1} min={2} onchange={(value) => set('Parts.tickMajor.Layout.height', value)} />
    </PropertyCell>
    <PropertyCell label="Tick Minor" span={1} compact hint="Generated minor tick length.">
      <NumberCell label="Minor" value={parts?._children?.tickMinor?._children?.Layout?.height ?? 7} defaultValue={7} step={1} min={1} onchange={(value) => set('Parts.tickMinor.Layout.height', value)} />
    </PropertyCell>

  </PropertySection>

  {#if selectedStyleBackground}
    <BackgroundEditor
      {control}
      background={selectedStyleBackground}
      pathPrefix={selectedStyleTargetMeta?.path ?? 'Parts.bodyTrackBase.Background'}
      sectionTitle={`${selectedStyleTargetMeta?.label ?? 'Slider Part'} Fill`}
      editorId={`slider-part:${selectedStyleTargetMeta?.id ?? 'bodyTrackBase'}`}
      imageRequestPrefix="sliderPartBackground"
    />
  {/if}
{/if}

<style>
  .val { box-sizing: border-box; width: 100%; min-width: 0; height: var(--pp-field-height, 26px); padding: var(--pp-field-padding, 0 6px); background: var(--pp-field-bg, #1A1A1A); border: 1px solid var(--pp-field-border, #333); border-radius: var(--pp-field-radius, 3px); color: var(--pp-field-fg, #DDD); font-size: var(--pp-field-font, 11px); font-family: inherit; outline: none; }

  .val:focus {
    border-color: var(--pp-field-focus, #5B9BD5);
  }

  .preset-grid {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 6px;
    width: 100%;
  }

  .preset-btn {
    border: 1px solid #3B3B3B;
    background: #1E1E1E;
    color: #E4E4E4;
    border-radius: 5px;
    padding: 6px 8px;
    font-size: 11px;
    cursor: pointer;
    font-family: inherit;
  }

  .preset-btn:hover {
    border-color: #5B9BD5;
    background: #232323;
  }

  .preset-btn.wide {
    width: 100%;
  }

  .style-target-grid {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 6px;
    width: 100%;
  }

  .style-target-btn {
    border: 1px solid #3B3B3B;
    background: #1E1E1E;
    color: #D6D6D6;
    border-radius: 5px;
    padding: 7px 8px;
    font-size: 11px;
    cursor: pointer;
    font-family: inherit;
  }

  .style-target-btn:hover {
    border-color: #5B9BD5;
    background: #232323;
  }

  .style-target-btn.active {
    border-color: #5B9BD5;
    background: #0D2A3E;
    color: #FFFFFF;
  }

</style>
