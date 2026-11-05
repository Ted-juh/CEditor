<script>
  /**
   * The Button tab, called Switch on a toggle: a button's or a switch's own parts
   * (models/buttonDeviceParts.js), as the owner approved them in the mock-up. Six parts with about
   * fifteen fields each would be a very long page as a section per part, so a row of part chips
   * picks the part and one editor below shows it: Shape, Position, Appearance, When On (When Pressed
   * on a button) and, on the Legend, its text. A green dot on a chip marks a part that is drawn.
   *
   * Every field names its property, so it carries the override marks and Revert
   * (properties/PropertyCell.svelte `path`). Colours are a swatch, which opens the Colors dock, and
   * a code; none of them opens a picker of its own.
   */
  import PropertySection from '../properties/PropertySection.svelte';
  import PropertyCell from '../properties/PropertyCell.svelte';
  import PropertyToggle from '../properties/PropertyToggle.svelte';
  import PropertyColor from '../properties/PropertyColor.svelte';
  import NumberCell from '../properties/NumberCell.svelte';
  import Boxes from 'lucide-svelte/icons/boxes';
  import Shapes from 'lucide-svelte/icons/shapes';
  import Move from 'lucide-svelte/icons/move';
  import Palette from 'lucide-svelte/icons/palette';
  import Zap from 'lucide-svelte/icons/zap';
  import Type from 'lucide-svelte/icons/type';
  import { getSection, updateControlProperty, updateSelectedProperty, applyControlPatch, applySelectedPatch } from '../stores/controls.js';
  import { selectedComponentIds } from '../stores/panels.js';
  import { activateInspectorColorTarget } from '../stores/colorTarget.js';
  import { activeControlSet } from '../stores/controlSets.js';
  import { resolveColourLiteral } from '../models/controlSets.js';
  import { BUTTON_DEVICE_PARTS } from '../models/buttonDeviceParts.js';
  import { DEVICE_SHADINGS } from '../models/buttonFormParts.js';
  import { RENDERED_BLOCK_TOPS, RENDERED_MATERIALS, RENDERED_TOPS } from '../utils/renderedLook.js';
  import { anatomyForm, anatomyOptions, isIllustratedForm } from '../models/controlAnatomy.js';
  import IllustratedFormNote from './IllustratedFormNote.svelte';
  import { DEVICE_SHAPES, DEVICE_PATTERNS } from '../utils/deviceShapes.js';
  import { MATERIAL_KINDS } from '../utils/materialFilter.js';
  import { numberOr } from '../utils/primitives.js';

  let { control = null } = $props();

  const SHAPE_LABELS = {
    rect: 'Rectangle', ellipse: 'Ellipse', diamond: 'Diamond', hexagon: 'Hexagon', flap: 'Folded Sheet', corner: 'Fold',
    pillow: 'Cushion', bracket: 'Guard Bracket', crosshair: 'Crosshair', pair: 'Pair', ribbon: 'Ribbon', ring: 'Ring',
    arch: 'Arch', ticket: 'Paper Tally', pointer: 'Pointer', bow: 'Bow', bevel: 'Bevelled Key', octagon: 'Octagon', path: 'Drawn Outline',
  };
  const PATTERN_LABELS = { solid: 'Solid', lines: 'Lines', grid: 'Grid' };
  const word = (text) => text.charAt(0).toUpperCase() + text.slice(1);

  let core = $derived(getSection(control, 'Core'));
  let isSwitch = $derived(String(core?.controlType ?? '') === 'ToggleButton');
  let noun = $derived(isSwitch ? 'switch' : 'button');
  let whenLabel = $derived(isSwitch ? 'Colour When On' : 'Colour When Pressed');
  let parts = $derived(getSection(control, 'Parts')?._children ?? {});
  let partName = $state('key');
  let part = $derived(parts[partName] ?? null);
  let prefix = $derived(`Parts.${partName}`);
  let layout = $derived(part?._children?.Layout ?? {});
  let fill = $derived(part?._children?.Background?._children?.Fill ?? {});
  let border = $derived(part?._children?.Background?._children?.Border ?? {});
  let corners = $derived(part?._children?.Background?._children?.Corners ?? {});
  let material = $derived(part?._children?.Background?._children?.Effects?._children?.Material ?? {});
  let shapeKind = $derived(String(part?.shape ?? 'rect'));
  let pattern = $derived(String(part?.pattern ?? 'solid'));
  // A housing, guard, key or indicator can be rendered (utils/renderedLookCore.js): a block its box's
  // size, or a turned body when it is a circle.
  const RENDERABLE = new Set(['housing', 'guard', 'key', 'indicator']);
  let renderable = $derived(RENDERABLE.has(partName));
  let rendered = $derived(renderable && String(part?.look ?? '') === 'rendered');
  let renderedRound = $derived.by(() => {
    const w = (Number(layout.width) || 0) * 1.6;
    const h = (Number(layout.height) || 0) * 0.8;
    return shapeKind === 'ellipse' && w > 0 && h > 0 && Math.abs(w - h) / Math.max(w, h) < 0.08;
  });
  let form = $derived(anatomyForm(core?.controlType, core?.controlForm));
  let formName = $derived(anatomyOptions(core?.controlType).find(([id]) => id === form)?.[1] ?? form);
  // Iris's and Satellite's forms are drawn whole: the parts below do not apply (IllustratedFormNote).
  let illustrated = $derived(isIllustratedForm(form));
  let partsDrawn = $derived(String(core?.controlForm ?? '') !== 'original' && !form && parts.key?.visible === true);

  const partLabel = (name) => (name === 'key' ? (isSwitch ? 'Actuator' : 'Key') : word(name));
  const shown = (colour, fallback = 'FF3A3A3A') => resolveColourLiteral(colour, $activeControlSet, fallback);

  function set(path, value) {
    if (!core?.id) return;
    if ($selectedComponentIds.size > 1) updateSelectedProperty(path, value);
    else updateControlProperty(core.id, path, value);
  }

  function setPatch(patch) {
    if (!core?.id) return;
    if ($selectedComponentIds.size > 1) applySelectedPatch(patch, { pin: true });
    else applyControlPatch(core.id, patch, { pin: true });
  }

  function pickColour(path, current, fallback, what) {
    if (!core?.id) return;
    // The value as it is, so a colour from the set opens at its role's colour (stores/colorTarget.js),
    // named as this tab names it rather than by its path.
    const label = `${core.name || core.controlType} — ${partLabel(partName)} › ${what}`;
    activateInspectorColorTarget({ type: 'control', controlId: core.id, path, label }, current || shown(fallback));
  }

  function setBorder(value) {
    const thickness = Math.max(0, Number(value) || 0);
    setPatch({ [`${prefix}.Background.Border.enabled`]: thickness > 0, [`${prefix}.Background.Border.thickness`]: thickness });
  }

  function setFinish(kind) {
    if (kind === 'none') set(`${prefix}.Background.Effects.Material.enabled`, false);
    else setPatch({ [`${prefix}.Background.Effects.Material.enabled`]: true, [`${prefix}.Background.Effects.Material.kind`]: kind });
  }

  // Shading: the set's metal or dome laid over the part's own colour (models/buttonFormParts.js).
  const sameGradient = (a, b) => !!a && !!b && a.type === b.type && JSON.stringify(a.stops) === JSON.stringify(b.stops);
  let shading = $derived(fill.gradientEnabled !== true || !fill.gradient ? 'none'
    : sameGradient(fill.gradient, DEVICE_SHADINGS.metal) ? 'metal'
      : sameGradient(fill.gradient, DEVICE_SHADINGS.dome) ? 'dome' : 'custom');
  function setShading(kind) {
    if (kind === 'none') set(`${prefix}.Background.Fill.gradientEnabled`, false);
    else if (DEVICE_SHADINGS[kind]) {
      setPatch({
        [`${prefix}.Background.Fill.gradientEnabled`]: true,
        [`${prefix}.Background.Fill.gradient`]: DEVICE_SHADINGS[kind],
        [`${prefix}.Background.Fill.gradientOpacity`]: 100,
      });
    }
  }

  const percent = (value, fallback = 1) => Math.round(numberOr(value, fallback) * 100);
  const fraction = (value) => Math.max(0, Math.min(100, Number(value) || 0)) / 100;
</script>

<div class="button-parts" class:dimmed={illustrated}>
  {#if illustrated}
    <IllustratedFormNote name={formName} />
  {:else if !partsDrawn}
    <p class="note">
      {#if String(core?.controlForm ?? '') === 'original'}
        Core › Control design is Original parts, so this {noun} draws as a plain box and these parts are not drawn.
      {:else if form}
        The {formName} form draws this {noun}. Core › Control design › Convert to Parts makes it these parts.
      {:else}
        These parts are hidden, so this {noun} draws as a plain box. Choose a form in Core › Control design to start from one, or make the {partLabel('key')} visible.
      {/if}
    </p>
  {/if}

  <PropertySection title="Parts" icon={Boxes}>
    <div class="chips" role="tablist" aria-label={`${word(noun)} parts`}>
      {#each BUTTON_DEVICE_PARTS as name (name)}
        <button type="button" role="tab" class="chip" class:on={partName === name} aria-selected={partName === name}
          title={`${partLabel(name)}${parts[name]?.visible === true ? '' : ' (hidden)'}`} onclick={() => { partName = name; }}>
          <span class="dot" class:drawn={parts[name]?.visible === true} aria-hidden="true"></span>{partLabel(name)}
        </button>
      {/each}
    </div>
  </PropertySection>

  {#if part}
    <PropertySection title="Shape" icon={Shapes}>
      <PropertyCell label="Visible" path={`${prefix}.visible`} hint={`Draw the ${partLabel(partName).toLowerCase()}.`}>
        <PropertyToggle value={part.visible === true} ariaLabel={`${partLabel(partName)} visible`} onchange={(next) => set(`${prefix}.visible`, next)} />
      </PropertyCell>
      {#if partName !== 'legend'}
        <PropertyCell label="Shape" path={`${prefix}.shape`} hint="Its outline: a rectangle, an ellipse, a diamond, a hexagon, a folded sheet and more.">
          <select class="val" aria-label="Shape" value={shapeKind} onchange={(e) => set(`${prefix}.shape`, e.target.value)}>
            {#each DEVICE_SHAPES as id (id)}<option value={id}>{SHAPE_LABELS[id] ?? word(id)}</option>{/each}
          </select>
        </PropertyCell>
        <PropertyCell label="Depth %" compact path={`${prefix}.shapeDepth`} disabled={['rect', 'ellipse', 'diamond', 'path'].includes(shapeKind)} hint="How deep a fold, a bracket or a ring is, as a percentage of the part.">
          <NumberCell label="Depth %" value={numberOr(part.shapeDepth, 20)} defaultValue={20} step={1} min={0} max={100} onchange={(v) => set(`${prefix}.shapeDepth`, v)} />
        </PropertyCell>
        <PropertyCell label="Corner" compact path={`${prefix}.Background.Corners.radius`} disabled={!['rect', 'pillow'].includes(shapeKind)} hint="How round its corners are, in the device's units.">
          <NumberCell label="Corner" value={numberOr(corners.radius, 0)} defaultValue={0} step={1} min={0} max={80} onchange={(v) => set(`${prefix}.Background.Corners.radius`, v)} />
        </PropertyCell>
        <PropertyCell label="Pattern" span={2} path={`${prefix}.pattern`} hint="Repeat the shape in its box: in lines (grooves, ribs) or a grid (pixel cells).">
          <select class="val" aria-label="Pattern" value={pattern} onchange={(e) => set(`${prefix}.pattern`, e.target.value)}>
            {#each DEVICE_PATTERNS as id (id)}<option value={id}>{PATTERN_LABELS[id] ?? word(id)}</option>{/each}
          </select>
        </PropertyCell>
        <PropertyCell label="Count" compact path={`${prefix}.patternCount`} disabled={pattern === 'solid'} hint="How many across.">
          <NumberCell label="Count" value={numberOr(part.patternCount, 4)} defaultValue={4} step={1} min={1} max={64} onchange={(v) => set(`${prefix}.patternCount`, v)} />
        </PropertyCell>
        <PropertyCell label="Rows" compact path={`${prefix}.patternRows`} disabled={pattern !== 'grid'} hint="How many down, in a grid.">
          <NumberCell label="Rows" value={numberOr(part.patternRows, 3)} defaultValue={3} step={1} min={1} max={64} onchange={(v) => set(`${prefix}.patternRows`, v)} />
        </PropertyCell>
      {/if}
    </PropertySection>

    <PropertySection title="Position" icon={Move}>
      <PropertyCell label="X %" compact path={`${prefix}.Layout.x`} hint="Its left edge, in % of the device area, which keeps its place beside or under the caption.">
        <NumberCell label="X %" value={numberOr(layout.x, 10)} step={0.5} min={-50} max={150} onchange={(v) => set(`${prefix}.Layout.x`, v)} />
      </PropertyCell>
      <PropertyCell label="Y %" compact path={`${prefix}.Layout.y`} hint="Its top edge, in % of the device area.">
        <NumberCell label="Y %" value={numberOr(layout.y, 10)} step={0.5} min={-50} max={150} onchange={(v) => set(`${prefix}.Layout.y`, v)} />
      </PropertyCell>
      <PropertyCell label="W %" compact path={`${prefix}.Layout.width`} hint="Its width, in % of the device area.">
        <NumberCell label="W %" value={numberOr(layout.width, 80)} step={0.5} min={0} max={200} onchange={(v) => set(`${prefix}.Layout.width`, v)} />
      </PropertyCell>
      <PropertyCell label="H %" compact path={`${prefix}.Layout.height`} hint="Its height, in % of the device area.">
        <NumberCell label="H %" value={numberOr(layout.height, 80)} step={0.5} min={0} max={200} onchange={(v) => set(`${prefix}.Layout.height`, v)} />
      </PropertyCell>
      <PropertyCell label="Rotation" compact path={`${prefix}.Layout.rotation`} hint="Its angle at rest, in degrees, about its pivot.">
        <NumberCell label="Rotation" value={numberOr(layout.rotation, 0)} defaultValue={0} step={0.5} min={-360} max={360} onchange={(v) => set(`${prefix}.Layout.rotation`, v)} />
      </PropertyCell>
      <PropertyCell label="Pivot X %" compact path={`${prefix}.pivotX`} hint="The point it turns about, across its own box: 50 is the middle.">
        <NumberCell label="Pivot X %" value={numberOr(part.pivotX, 50)} defaultValue={50} step={1} min={-100} max={200} onchange={(v) => set(`${prefix}.pivotX`, v)} />
      </PropertyCell>
      <PropertyCell label="Pivot Y %" compact path={`${prefix}.pivotY`} hint="The point it turns about, down its own box: 100 is its foot.">
        <NumberCell label="Pivot Y %" value={numberOr(part.pivotY, 50)} defaultValue={50} step={1} min={-100} max={200} onchange={(v) => set(`${prefix}.pivotY`, v)} />
      </PropertyCell>
      <PropertyCell label="Layer" compact path={`${prefix}.zIndex`} hint="Its place in the stack: higher draws in front.">
        <NumberCell label="Layer" value={numberOr(part.zIndex, 0)} step={1} min={-10} max={50} onchange={(v) => set(`${prefix}.zIndex`, v)} />
      </PropertyCell>
    </PropertySection>

    <PropertySection title="Appearance" icon={Palette}>
      {#if renderable}
        <PropertyCell label="Look" path={`${prefix}.look`} hint="Flat: drawn from its shape, fill, border, finish and shading. Rendered: drawn as a lit object its box's size (a turned body if it is a circle), lit by the set's lamp; the fields below are its own.">
          <select class="val" aria-label="Look" value={rendered ? 'rendered' : 'flat'} onchange={(e) => set(`${prefix}.look`, e.target.value === 'rendered' ? 'rendered' : '')}>
            <option value="flat">Flat</option><option value="rendered">Rendered</option>
          </select>
        </PropertyCell>
      {/if}
      {#if rendered}
        <!-- A rendered part (utils/renderedLookCore.js): only what the render draws. Its corners are
             the Shape section's Corner; its border, finish, shading and shadow are the flat look's. -->
        <PropertyCell label="Top" path={`${prefix}.renderTop`} hint="Its top: flat, with an insert set into it, ridged, a dome or a dish.">
          <select class="val" aria-label="Top" value={part?.renderTop ?? 'flat'} onchange={(e) => set(`${prefix}.renderTop`, e.target.value)}>
            {#each (renderedRound ? RENDERED_TOPS : RENDERED_BLOCK_TOPS) as [id, label] (id)}<option value={id}>{label}</option>{/each}
          </select>
        </PropertyCell>
        <PropertyCell label="Ridges" compact path={`${prefix}.renderCount`} disabled={renderedRound || part?.renderTop !== 'ridged'} hint="How many ridges across its top.">
          <NumberCell label="Ridges" value={numberOr(part?.renderCount, 5)} defaultValue={5} step={1} min={1} max={40} onchange={(v) => set(`${prefix}.renderCount`, Math.round(Number(v) || 0))} />
        </PropertyCell>
        <PropertyCell label="Depth %" compact path={`${prefix}.renderDepth`} disabled={renderedRound} hint="How deep its ridges or dish go, or how high its dome stands, as a percentage of half its narrower side.">
          <NumberCell label="Depth" value={numberOr(part?.renderDepth, 12)} defaultValue={12} step={1} min={0} max={60} onchange={(v) => set(`${prefix}.renderDepth`, v)} />
        </PropertyCell>
        <PropertyCell label="Height %" compact path={`${prefix}.renderHeight`} hint={renderedRound ? 'How tall it stands, as a percentage of its radius.' : 'How tall it stands, as a percentage of its narrower side.'}>
          <NumberCell label="Height" value={numberOr(part?.renderHeight, renderedRound ? 80 : 30)} defaultValue={renderedRound ? 80 : 30} step={1} min={10} max={200} onchange={(v) => set(`${prefix}.renderHeight`, v)} />
        </PropertyCell>
        <PropertyCell label="Taper %" compact path={`${prefix}.renderTaper`} hint="How much narrower its top is than its foot.">
          <NumberCell label="Taper" value={numberOr(part?.renderTaper, renderedRound ? 8 : 6)} defaultValue={renderedRound ? 8 : 6} step={1} min={0} max={40} onchange={(v) => set(`${prefix}.renderTaper`, v)} />
        </PropertyCell>
        <PropertyCell label="Opacity" compact path={`${prefix}.opacity`} hint="How much it shows, 0 to 100.">
          <NumberCell label="Opacity" value={percent(part.opacity)} defaultValue={100} step={5} min={0} max={100} onchange={(v) => set(`${prefix}.opacity`, fraction(v))} />
        </PropertyCell>
        <PropertyCell label="Material" span={2} path={`${prefix}.renderMaterial`} hint="What its body is made of.">
          <select class="val" aria-label="Material" value={part?.renderMaterial ?? (renderedRound ? 'metal' : 'satin')} onchange={(e) => set(`${prefix}.renderMaterial`, e.target.value)}>
            {#each RENDERED_MATERIALS as [id, label] (id)}<option value={id}>{label}</option>{/each}
          </select>
        </PropertyCell>
        <PropertyCell label="Top Material" span={2} path={`${prefix}.renderTopMaterial`} hint="What its top is made of.">
          <select class="val" aria-label="Top Material" value={part?.renderTopMaterial ?? (renderedRound ? 'spun' : 'satin')} onchange={(e) => set(`${prefix}.renderTopMaterial`, e.target.value)}>
            {#each RENDERED_MATERIALS as [id, label] (id)}<option value={id}>{label}</option>{/each}
          </select>
        </PropertyCell>
        <PropertyCell label="Body Colour" span={2} path={`${prefix}.Background.Fill.colour`} hint="Its body's colour. The swatch opens it in the Colors dock.">
          <PropertyColor value={shown(fill.colour)} onchange={(v) => set(`${prefix}.Background.Fill.colour`, v)} onswatchclick={() => pickColour(`${prefix}.Background.Fill.colour`, fill.colour, fill.colour, 'Body Colour')} />
        </PropertyCell>
        <PropertyCell label="Top Colour" span={2} path={`${prefix}.renderTopColour`} hint="Its top's colour; empty, the body's.">
          <PropertyColor value={shown(part?.renderTopColour || fill.colour)} onchange={(v) => set(`${prefix}.renderTopColour`, v)} onswatchclick={() => pickColour(`${prefix}.renderTopColour`, part?.renderTopColour, fill.colour, 'Top Colour')} />
        </PropertyCell>
      {:else}
      <PropertyCell label="Fill" span={2} path={`${prefix}.Background.Fill.colour`} hint="Its colour. The swatch opens it in the Colors dock; the field takes AARRGGBB or RRGGBB.">
        <PropertyColor value={shown(fill.colour)} onchange={(v) => set(`${prefix}.Background.Fill.colour`, v)} onswatchclick={() => pickColour(`${prefix}.Background.Fill.colour`, fill.colour, fill.colour, 'Fill')} />
      </PropertyCell>
      <PropertyCell label="Opacity" compact path={`${prefix}.opacity`} hint="How much it shows, 0 to 100.">
        <NumberCell label="Opacity" value={percent(part.opacity)} defaultValue={100} step={5} min={0} max={100} onchange={(v) => set(`${prefix}.opacity`, fraction(v))} />
      </PropertyCell>
      <PropertyCell label="Finish" path={`${prefix}.Background.Effects.Material.kind`} hint="A surface finish lit by the set's lamp, as the set's materials are.">
        <select class="val" aria-label="Finish" value={material.enabled === true ? String(material.kind ?? 'blast') : 'none'} onchange={(e) => setFinish(e.target.value)}>
          <option value="none">None</option>
          {#each MATERIAL_KINDS as kind (kind)}<option value={kind}>{word(kind)}</option>{/each}
        </select>
      </PropertyCell>
      <PropertyCell label="Border" compact path={`${prefix}.Background.Border.thickness`} hint="Its edge, in the device's units. 0 for none.">
        <NumberCell label="Border" value={border.enabled === true ? numberOr(border.thickness, 0) : 0} defaultValue={0} step={0.5} min={0} max={20} onchange={(v) => setBorder(v)} />
      </PropertyCell>
      <PropertyCell label="Shading" path={`${prefix}.Background.Fill.gradientEnabled`} hint="Lays the set's turned-metal or dome shading over its own colour.">
        <select class="val" aria-label="Shading" value={shading} onchange={(e) => setShading(e.target.value)}>
          <option value="none">None</option>
          <option value="metal">Metal</option>
          <option value="dome">Dome</option>
          {#if shading === 'custom'}<option value="custom" disabled>Custom gradient</option>{/if}
        </select>
      </PropertyCell>
      <PropertyCell label="Border Colour" span={2} path={`${prefix}.Background.Border.colour`} hint="The colour of its edge.">
        <PropertyColor value={shown(border.colour, 'FF333333')} onchange={(v) => set(`${prefix}.Background.Border.colour`, v)} onswatchclick={() => pickColour(`${prefix}.Background.Border.colour`, border.colour, 'FF333333', 'Border Colour')} />
      </PropertyCell>
      <PropertyCell label="Shadow %" compact path={`${prefix}.shadowOffset`} hint="A drop shadow under it: its outline again, this percentage of the device's height lower. 0 for none.">
        <NumberCell label="Shadow" value={numberOr(part.shadowOffset, 0)} defaultValue={0} step={0.5} min={0} max={50} onchange={(v) => set(`${prefix}.shadowOffset`, v)} />
      </PropertyCell>
      <PropertyCell label="Softness %" compact path={`${prefix}.shadowBlur`} hint="How soft the shadow's edge is, as a percentage of the device's height. 0 for a hard edge.">
        <NumberCell label="Softness" value={numberOr(part.shadowBlur, 0)} defaultValue={0} step={0.5} min={0} max={50} onchange={(v) => set(`${prefix}.shadowBlur`, v)} />
      </PropertyCell>
      <PropertyCell label="Shadow Colour" span={2} path={`${prefix}.shadowColour`} hint="The shadow's colour; its alpha is how dark it falls.">
        <PropertyColor value={shown(part.shadowColour, '99000000')} onchange={(v) => set(`${prefix}.shadowColour`, v)} onswatchclick={() => pickColour(`${prefix}.shadowColour`, part.shadowColour, '99000000', 'Shadow Colour')} />
      </PropertyCell>
      {/if}
    </PropertySection>

    <PropertySection title={isSwitch ? 'When On' : 'When Pressed'} icon={Zap}>
      <PropertyCell label="Move X %" compact path={`${prefix}.travelX`} hint={`How far it moves across, in % of the device area, ${isSwitch ? 'when on' : 'while pressed'}.`}>
        <NumberCell label="Move X %" value={numberOr(part.travelX, 0)} defaultValue={0} step={0.5} min={-100} max={100} onchange={(v) => set(`${prefix}.travelX`, v)} />
      </PropertyCell>
      <PropertyCell label="Move Y %" compact path={`${prefix}.travelY`} hint={`How far it moves down, in % of the device area, ${isSwitch ? 'when on' : 'while pressed'}.`}>
        <NumberCell label="Move Y %" value={numberOr(part.travelY, 0)} defaultValue={0} step={0.5} min={-100} max={100} onchange={(v) => set(`${prefix}.travelY`, v)} />
      </PropertyCell>
      <PropertyCell label="Swing" compact path={`${prefix}.swing`} hint="How far it turns about its pivot, in degrees: a lever's throw.">
        <NumberCell label="Swing" value={numberOr(part.swing, 0)} defaultValue={0} step={0.5} min={-360} max={360} onchange={(v) => set(`${prefix}.swing`, v)} />
      </PropertyCell>
      <PropertyCell label="Opacity" compact path={`${prefix}.activeOpacity`} hint="How much it shows then, 0 to 100. Empty keeps its own opacity.">
        <NumberCell label="Opacity" value={part.activeOpacity == null ? '' : percent(part.activeOpacity)} allowEmpty step={5} min={0} max={100}
          onchange={(v) => set(`${prefix}.activeOpacity`, v === '' || v == null ? null : fraction(v))} />
      </PropertyCell>
      <PropertyCell label="Colour" span={2} path={`${prefix}.activeColour`} hint="Its colour then. Unchanged keeps its fill; the swatch opens the Colors dock.">
        {#if String(part.activeColour ?? '').trim()}
          <div class="active-colour">
            <PropertyColor value={shown(part.activeColour)} onchange={(v) => set(`${prefix}.activeColour`, v)} onswatchclick={() => pickColour(`${prefix}.activeColour`, part.activeColour, part.activeColour, whenLabel)} />
            <button type="button" class="clear" title="Back to Unchanged: keep its fill" aria-label="Clear the colour" onclick={() => set(`${prefix}.activeColour`, '')}>×</button>
          </div>
        {:else}
          <button type="button" class="unchanged" title="Give it a colour of its own then: opens the Colors dock" onclick={() => pickColour(`${prefix}.activeColour`, '', fill.colour, whenLabel)}>
            <span class="hatch" aria-hidden="true"></span>Unchanged
          </button>
        {/if}
      </PropertyCell>
      {#if partName !== 'key'}
        <PropertyCell label="Follows" span={2} path={`${prefix}.follows`} hint={`Ride on the ${partLabel('key').toLowerCase()}: move and turn as it does, as a ball on a lever or a bar on a key.`}>
          <select class="val" aria-label="Follows" value={String(part.follows ?? '')} onchange={(e) => set(`${prefix}.follows`, e.target.value)}>
            <option value="">Nothing</option>
            <option value="key">{partLabel('key')}</option>
          </select>
        </PropertyCell>
      {/if}
    </PropertySection>

    {#if partName === 'legend'}
      <PropertySection title="Legend Text" icon={Type}>
        <PropertyCell label={isSwitch ? 'Off Text' : 'Text'} span={2} path={`${prefix}.offText`} hint={isSwitch ? 'What it says when off.' : 'What it says at rest.'}>
          <input class="val" type="text" aria-label="Off text" value={String(part.offText ?? '')} onchange={(e) => set(`${prefix}.offText`, e.currentTarget.value)} />
        </PropertyCell>
        <PropertyCell label={isSwitch ? 'On Text' : 'Pressed Text'} span={2} path={`${prefix}.onText`} hint={isSwitch ? 'What it says when on.' : 'What it says while pressed.'}>
          <input class="val" type="text" aria-label="On text" value={String(part.onText ?? '')} onchange={(e) => set(`${prefix}.onText`, e.currentTarget.value)} />
        </PropertyCell>
        <PropertyCell label="Size" compact path={`${prefix}.fontSize`} hint="Its size, in the device's units.">
          <NumberCell label="Size" value={numberOr(part.fontSize, 11)} defaultValue={11} step={0.5} min={4} max={60} onchange={(v) => set(`${prefix}.fontSize`, v)} />
        </PropertyCell>
      </PropertySection>
    {/if}
  {/if}
</div>

<style>
  .button-parts { min-width: 0; }
  .button-parts.dimmed > :global(:not([data-illustrated-note])) { opacity: 0.4; }
  .val { box-sizing: border-box; width: 100%; min-width: 0; height: var(--pp-field-height, 26px); padding: var(--pp-field-padding, 0 6px); background: var(--pp-field-bg, #1A1A1A); border: 1px solid var(--pp-field-border, #333); border-radius: var(--pp-field-radius, 3px); color: var(--pp-field-fg, #DDD); font-size: var(--pp-field-font, 11px); font-family: inherit; outline: none; }
  .val:focus { border-color: var(--pp-field-focus, #5B9BD5); }
  .note { margin: 6px 8px; padding: 6px 8px; border: 1px solid #3A4A56; border-radius: 4px; background: #16222A; color: #B8C7D2; font-size: 11px; line-height: 1.4; }
  .chips { grid-column: 1 / -1; display: grid; grid-template-columns: repeat(6, minmax(0, 1fr)); gap: 4px; }
  .chip { display: flex; flex-direction: column; align-items: center; gap: 3px; min-width: 0; padding: 5px 2px; border: 1px solid #333; border-radius: 4px;
    background: #1A1A1A; color: #BBB; font: inherit; font-size: 11px; cursor: pointer; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .chip:hover { border-color: #5B9BD5; color: #FFF; }
  .chip.on { background: #0B3E61; border-color: #0B6EB5; color: #FFF; }
  .dot { width: 6px; height: 6px; border-radius: 50%; background: #555; }
  .dot.drawn { background: #4CAF50; }
  .active-colour { display: flex; align-items: center; gap: 4px; min-width: 0; }
  .active-colour :global(.property-color) { flex: 1; }
  .clear { width: 22px; height: 22px; flex: none; padding: 0; border: 1px solid #333; border-radius: 3px; background: #1A1A1A; color: #AAA; cursor: pointer; }
  .clear:hover { border-color: #C0504D; color: #FFF; }
  .unchanged { display: flex; align-items: center; gap: 6px; width: 100%; height: var(--pp-field-height, 26px); padding: 0 6px; border: 1px solid var(--pp-field-border, #333);
    border-radius: var(--pp-field-radius, 3px); background: var(--pp-field-bg, #1A1A1A); color: #999; font: inherit; font-size: var(--pp-field-font, 11px); cursor: pointer; text-align: left; }
  .unchanged:hover { border-color: #5B9BD5; color: #DDD; }
  .hatch { width: 16px; height: 16px; flex: none; border: 1px solid #555; border-radius: 3px;
    background: repeating-linear-gradient(45deg, #2A2A2A 0 3px, #555 3px 4px); }
</style>
