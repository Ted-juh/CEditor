<script>
  /**
   * The Knob tab's parts, in the order they are drawn: Housing, Skirt, Track and Value Arc, Cap,
   * Insert, Pointer (the owner approved the mock-up; the skirt and the insert are two more plates in
   * it, for the synth sets' knobs, models/directionKnobParts.js). The knob forms are these parts now (models/knobFormParts.js),
   * so every one of their shapes, sizes and colours is a field here. Each field names its property,
   * so it carries the override marks and Revert (properties/PropertyCell.svelte `path`). Colours are
   * a swatch, which opens the Colors dock, and a code.
   */
  import PropertySection from '../properties/PropertySection.svelte';
  import PropertyCell from '../properties/PropertyCell.svelte';
  import PropertyToggle from '../properties/PropertyToggle.svelte';
  import PropertyColor from '../properties/PropertyColor.svelte';
  import NumberCell from '../properties/NumberCell.svelte';
  import Circle from 'lucide-svelte/icons/circle';
  import CircleDot from 'lucide-svelte/icons/circle-dot';
  import Disc from 'lucide-svelte/icons/disc';
  import Navigation from 'lucide-svelte/icons/navigation-2';
  import { activateInspectorColorTarget } from '../stores/colorTarget.js';
  import { activeControlSet } from '../stores/controlSets.js';
  import { resolveColourLiteral } from '../models/controlSets.js';
  import { MATERIAL_KINDS } from '../utils/materialFilter.js';
  import { getSection } from '../stores/controls.js';
  import { numberOr } from '../utils/primitives.js';
  import { anatomyForm, anatomyOptions, isIllustratedForm } from '../models/controlAnatomy.js';
  import IllustratedFormNote from './IllustratedFormNote.svelte';

  let { control = null, set = () => {}, setPatch = () => {} } = $props();

  const OUTLINES = [['circle', 'Circle'], ['polygon', 'Polygon'], ['rounded', 'Rounded Square'], ['scallop', 'Scallop'], ['flutes', 'Flutes'], ['gear', 'Gear'], ['chicken', 'Chicken-head'], ['ring', 'Ring']];
  const POINTERS = [['line', 'Line'], ['bar', 'Bar'], ['needle', 'Needle'], ['chicken', 'Chicken-head'], ['capdot', 'Dot on Cap'], ['dot', 'Dot on Track']];
  const SIZES = { bodyHousing: 100, bodySkirt: 90, bodyCap: 72, bodyInsert: 45 };
  const word = (text) => text.charAt(0).toUpperCase() + text.slice(1);

  let core = $derived(getSection(control, 'Core'));
  // Iris's and Satellite's knobs are drawn whole: these parts do not apply to them (IllustratedFormNote).
  let illustratedForm = $derived(isIllustratedForm(anatomyForm(core?.controlType, core?.controlForm)) ? core.controlForm : '');
  let illustratedName = $derived(anatomyOptions(core?.controlType).find(([id]) => id === illustratedForm)?.[1] ?? illustratedForm);
  let parts = $derived(getSection(control, 'Parts')?._children ?? {});
  let housing = $derived(parts.bodyHousing ?? null);
  let skirt = $derived(parts.bodySkirt ?? null);
  let cap = $derived(parts.bodyCap ?? null);
  let insert = $derived(parts.bodyInsert ?? null);
  let trackBase = $derived(parts.bodyTrackBase ?? null);
  let trackFill = $derived(parts.bodyTrackFill ?? null);
  let pointer = $derived(parts.pointerCurrent ?? null);

  const fillOf = (part) => part?._children?.Background?._children?.Fill?.colour;
  const borderOf = (part) => part?._children?.Background?._children?.Border ?? {};
  const materialOf = (part) => part?._children?.Background?._children?.Effects?._children?.Material ?? {};
  const shown = (colour, fallback = 'FF3A3A3A') => resolveColourLiteral(colour, $activeControlSet, fallback);

  function pickColour(path, current) {
    if (!core?.id) return;
    // The value as it is, so a colour from the set opens at its role's colour (stores/colorTarget.js).
    activateInspectorColorTarget({ type: 'control', controlId: core.id, path }, current || shown(current));
  }
  function setFinish(prefix, kind) {
    if (kind === 'none') set(`${prefix}.Background.Effects.Material.enabled`, false);
    else setPatch({ [`${prefix}.Background.Effects.Material.enabled`]: true, [`${prefix}.Background.Effects.Material.kind`]: kind });
  }
  function setBorder(prefix, thickness) {
    const value = Math.max(0, Number(thickness) || 0);
    setPatch({ [`${prefix}.Background.Border.enabled`]: value > 0, [`${prefix}.Background.Border.thickness`]: value });
  }
  function setSize(prefix, value) {
    setPatch({ [`${prefix}.Layout.width`]: value, [`${prefix}.Layout.height`]: value });
  }
  // The outlines whose count or depth mean nothing.
  const NO_COUNT = ['circle', 'ring', 'rounded', 'chicken'];
  const NO_DEPTH = ['circle', 'polygon', 'chicken'];
</script>

{#snippet plate(name, title, icon, part, { turns = false } = {})}
  {@const prefix = `Parts.${name}`}
  {@const outline = String(part?.outline ?? 'circle')}
  {@const material = materialOf(part)}
  {@const border = borderOf(part)}
  <PropertySection title={title} icon={icon}>
    <PropertyCell label="Visible" span={1} path={`${prefix}.visible`} hint={`Draw the ${title.toLowerCase()}.`}>
      <PropertyToggle value={part?.visible === true} onchange={(next) => set(`${prefix}.visible`, next)} />
    </PropertyCell>
    <PropertyCell label="Outline" span={1} path={`${prefix}.outline`} hint="The shape of its edge: a circle, a polygon, a rounded square, a scallop (a star), flutes (a round grip), a gear (a ribbed grip), a chicken-head or a ring.">
      <select class="val" value={outline} onchange={(e) => set(`${prefix}.outline`, e.target.value)}>
        {#each OUTLINES as [id, label] (id)}<option value={id}>{label}</option>{/each}
      </select>
    </PropertyCell>
    <PropertyCell label="Points" span={1} compact path={`${prefix}.outlineCount`} disabled={NO_COUNT.includes(outline)} hint="Corners of a polygon, points of a scallop, flutes or teeth of a grip.">
      <NumberCell label="Points" value={numberOr(part?.outlineCount, 8)} defaultValue={8} step={1} min={3} max={96} onchange={(v) => set(`${prefix}.outlineCount`, v)} />
    </PropertyCell>
    <PropertyCell label="Depth %" span={1} compact path={`${prefix}.outlineDepth`} disabled={NO_DEPTH.includes(outline)} hint="How deep the notches, flutes or teeth cut, how wide a ring is, or how round a square's corners are, as a percentage of the radius.">
      <NumberCell label="Depth" value={numberOr(part?.outlineDepth, 20)} defaultValue={20} step={1} min={0} max={95} onchange={(v) => set(`${prefix}.outlineDepth`, v)} />
    </PropertyCell>
    <PropertyCell label="Size %" span={1} compact path={`${prefix}.Layout.width`} hint="Its size, as a percentage of the track's radius.">
      <NumberCell label="Size" value={numberOr(part?._children?.Layout?.width, SIZES[name] ?? 100)} defaultValue={SIZES[name] ?? 100} step={1} min={1} max={200} onchange={(v) => setSize(prefix, v)} />
    </PropertyCell>
    {#if turns}
      <PropertyCell label="Turns" span={1} path={`${prefix}.turns`} hint="Turn the outline with the value, as a real cap turns.">
        <PropertyToggle value={part?.turns === true} onchange={(next) => set(`${prefix}.turns`, next)} />
      </PropertyCell>
    {:else}
      <PropertyCell label="Rotation" span={1} compact path={`${prefix}.outlineRotation`} hint="Turns the outline, in degrees: a flat side at the top instead of a corner.">
        <NumberCell label="Rotation" value={numberOr(part?.outlineRotation, 0)} defaultValue={0} step={1} min={-180} max={180} onchange={(v) => set(`${prefix}.outlineRotation`, v)} />
      </PropertyCell>
    {/if}
    <PropertyCell label="Border" span={1} compact path={`${prefix}.Background.Border.thickness`} hint="Its edge, in px. 0 for none.">
      <NumberCell label="Border" value={border.enabled === false ? 0 : numberOr(border.thickness, 0)} defaultValue={0} step={0.2} min={0} max={20} onchange={(v) => setBorder(prefix, v)} />
    </PropertyCell>
    <PropertyCell label="Finish" span={1} path={`${prefix}.Background.Effects.Material.kind`} hint="A surface finish lit by the set's lamp, as the set's materials are.">
      <select class="val" value={material.enabled === true ? String(material.kind ?? 'blast') : 'none'} onchange={(e) => setFinish(prefix, e.target.value)}>
        <option value="none">None</option>
        {#each MATERIAL_KINDS as kind (kind)}<option value={kind}>{word(kind)}</option>{/each}
      </select>
    </PropertyCell>
    <PropertyCell label="Fill" span={2} path={`${prefix}.Background.Fill.colour`} hint="Its colour. The swatch opens it in the Colors dock; the field takes AARRGGBB or RRGGBB.">
      <PropertyColor value={shown(fillOf(part))} onchange={(v) => set(`${prefix}.Background.Fill.colour`, v)} onswatchclick={() => pickColour(`${prefix}.Background.Fill.colour`, fillOf(part))} />
    </PropertyCell>
    <PropertyCell label="Border Colour" span={2} path={`${prefix}.Background.Border.colour`} hint="The colour of its edge.">
      <PropertyColor value={shown(border.colour, 'FF333333')} onchange={(v) => set(`${prefix}.Background.Border.colour`, v)} onswatchclick={() => pickColour(`${prefix}.Background.Border.colour`, border.colour)} />
    </PropertyCell>
    <PropertyCell label="Height %" span={1} compact path={`${prefix}.aspect`} hint="Its height as a percentage of its width: below 100 an oval, a round part seen at an angle. It turns with the part when the part turns.">
      <NumberCell label="Height" value={numberOr(part?.aspect, 100)} defaultValue={100} step={1} min={5} max={400} onchange={(v) => set(`${prefix}.aspect`, v)} />
    </PropertyCell>
    <PropertyCell label="Offset Y %" span={1} compact path={`${prefix}.shiftY`} hint="Moves it down, or up below 0, by this percentage of the track's radius: a side wall under a top, a cap lifted off it.">
      <NumberCell label="Offset Y" value={numberOr(part?.shiftY, 0)} defaultValue={0} step={1} min={-100} max={100} onchange={(v) => set(`${prefix}.shiftY`, v)} />
    </PropertyCell>
    <PropertyCell label="Shadow %" span={1} compact path={`${prefix}.shadowOffset`} hint="A shadow on the panel: its outline again, this percentage of its radius lower. 0 for none.">
      <NumberCell label="Shadow" value={numberOr(part?.shadowOffset, 0)} defaultValue={0} step={1} min={0} max={60} onchange={(v) => set(`${prefix}.shadowOffset`, v)} />
    </PropertyCell>
    <PropertyCell label="Softness %" span={1} compact path={`${prefix}.shadowBlur`} hint="How soft the shadow's edge is, as a percentage of the radius. 0 for a hard edge.">
      <NumberCell label="Softness" value={numberOr(part?.shadowBlur, 0)} defaultValue={0} step={1} min={0} max={60} onchange={(v) => set(`${prefix}.shadowBlur`, v)} />
    </PropertyCell>
    <PropertyCell label="Shadow Colour" span={2} path={`${prefix}.shadowColour`} hint="The shadow's colour; its alpha is how dark it falls.">
      <PropertyColor value={shown(part?.shadowColour, '99000000')} onchange={(v) => set(`${prefix}.shadowColour`, v)} onswatchclick={() => pickColour(`${prefix}.shadowColour`, part?.shadowColour)} />
    </PropertyCell>
  </PropertySection>
{/snippet}

<div class="knob-parts" class:dimmed={!!illustratedForm}>
{#if illustratedForm}<IllustratedFormNote name={illustratedName} />{/if}
{@render plate('bodyHousing', 'Housing', Disc, housing)}
{@render plate('bodySkirt', 'Skirt', Disc, skirt, { turns: true })}

<PropertySection title="Track and Value Arc" icon={CircleDot}>
  <PropertyCell label="Track" span={1} path="Parts.bodyTrackBase.visible" hint="Draw the track the value runs along.">
    <PropertyToggle value={trackBase?.visible !== false} onchange={(next) => set('Parts.bodyTrackBase.visible', next)} />
  </PropertyCell>
  <PropertyCell label="Arc" span={1} path="Parts.bodyTrackFill.visible" hint="Draw the value as an arc along the track.">
    <PropertyToggle value={trackFill?.visible !== false} onchange={(next) => setPatch({ 'Parts.bodyTrackFill.visible': next, 'Parts.bodySelectedRange.visible': next })} />
  </PropertyCell>
  <PropertyCell label="Thickness" span={1} compact path="Parts.bodyTrackBase.Layout.height" hint="Thickness of the track and the arc, in px. It also sets where the ticks start.">
    <NumberCell label="Thick" value={numberOr(trackBase?._children?.Layout?.height, 10)} defaultValue={10} step={1} min={1} max={40} onchange={(v) => setPatch({
      'Parts.bodyTrackBase.Layout.height': v, 'Parts.bodyTrackFill.Layout.height': v, 'Parts.bodySelectedRange.Layout.height': v,
    })} />
  </PropertyCell>
  <PropertyCell label="Opacity" span={1} compact path="Parts.bodyTrackBase.opacity" hint="Opacity of the track, 0 to 100. The arc keeps its own.">
    <NumberCell label="Opacity" value={Math.round(numberOr(trackBase?.opacity, 1) * 100)} defaultValue={100} step={5} min={0} max={100} onchange={(v) => set('Parts.bodyTrackBase.opacity', Math.max(0, Math.min(100, Number(v) || 0)) / 100)} />
  </PropertyCell>
</PropertySection>

{@render plate('bodyCap', 'Cap', Circle, cap, { turns: true })}
{@render plate('bodyInsert', 'Insert', CircleDot, insert, { turns: true })}

<PropertySection title="Pointer" icon={Navigation}>
  <PropertyCell label="Shape" span={2} path="Parts.pointerCurrent.kind" hint="A line, a painted bar or a needle from the centre, a chicken-head, a dot on the cap, or a dot riding the track.">
    <select class="val" value={String(pointer?.kind ?? 'dot')} onchange={(e) => set('Parts.pointerCurrent.kind', e.target.value)}>
      {#each POINTERS as [id, label] (id)}<option value={id}>{label}</option>{/each}
    </select>
  </PropertyCell>
  <PropertyCell label="Width" span={1} compact path="Parts.pointerCurrent.Layout.width" hint="Its width in px; for a bar, or a dot on the cap, a percentage of the cap's radius.">
    <NumberCell label="Width" value={numberOr(pointer?._children?.Layout?.width, 20)} defaultValue={20} step={0.5} min={0.5} max={200} onchange={(v) => set('Parts.pointerCurrent.Layout.width', v)} />
  </PropertyCell>
  <PropertyCell label="Length %" span={1} compact path="Parts.pointerCurrent.Layout.height" hint="How far it reaches, as a percentage of the cap's radius.">
    <NumberCell label="Length" value={numberOr(pointer?._children?.Layout?.height, 88)} defaultValue={88} step={1} min={1} max={1000} onchange={(v) => set('Parts.pointerCurrent.Layout.height', v)} />
  </PropertyCell>
  <PropertyCell label="Start %" span={1} compact path="Parts.pointerCurrent.Layout.offsetX" hint="Where a line or a bar starts, or how far a needle's tail reaches behind the centre, as a percentage of the cap's radius.">
    <NumberCell label="Start" value={numberOr(pointer?._children?.Layout?.offsetX, 30)} defaultValue={30} step={1} min={-100} max={1000} onchange={(v) => set('Parts.pointerCurrent.Layout.offsetX', v)} />
  </PropertyCell>
  {#if String(pointer?.kind ?? 'dot') === 'bar'}
    <PropertyCell label="Taper %" span={1} compact path="Parts.pointerCurrent.taper" hint="How much narrower the tip is than the base, as a percentage: a wedge. Below 0 the tip is the wider end.">
      <NumberCell label="Taper" value={numberOr(pointer?.taper, 0)} defaultValue={0} step={5} min={-300} max={100} onchange={(v) => set('Parts.pointerCurrent.taper', v)} />
    </PropertyCell>
    <PropertyCell label="Edge" span={1} compact path="Parts.pointerCurrent.Background.Border.thickness" hint="An edge round the bar, in px, outside its fill. 0 for none.">
      <NumberCell label="Edge" value={borderOf(pointer).enabled === false ? 0 : numberOr(borderOf(pointer).thickness, 0)} defaultValue={0} step={0.2} min={0} max={20} onchange={(v) => setBorder('Parts.pointerCurrent', v)} />
    </PropertyCell>
    <PropertyCell label="Edge Colour" span={2} path="Parts.pointerCurrent.Background.Border.colour" hint="The colour of the bar's edge.">
      <PropertyColor value={shown(borderOf(pointer).colour, 'FF202020')} onchange={(v) => set('Parts.pointerCurrent.Background.Border.colour', v)} onswatchclick={() => pickColour('Parts.pointerCurrent.Background.Border.colour', borderOf(pointer).colour)} />
    </PropertyCell>
  {/if}
  <PropertyCell label="Colour" span={2} path="Parts.pointerCurrent.Background.Fill.colour" hint="Its colour. The swatch opens it in the Colors dock.">
    <PropertyColor value={shown(fillOf(pointer), 'FFFFFFFF')} onchange={(v) => set('Parts.pointerCurrent.Background.Fill.colour', v)} onswatchclick={() => pickColour('Parts.pointerCurrent.Background.Fill.colour', fillOf(pointer))} />
  </PropertyCell>
</PropertySection>
</div>

<style>
  .knob-parts { min-width: 0; }
  .knob-parts.dimmed > :global(:not([data-illustrated-note])) { opacity: 0.4; }
  .val { box-sizing: border-box; width: 100%; min-width: 0; height: var(--pp-field-height, 26px); padding: var(--pp-field-padding, 0 6px); background: var(--pp-field-bg, #1A1A1A); border: 1px solid var(--pp-field-border, #333); border-radius: var(--pp-field-radius, 3px); color: var(--pp-field-fg, #DDD); font-size: var(--pp-field-font, 11px); font-family: inherit; outline: none; }
  .val:focus { border-color: var(--pp-field-focus, #5B9BD5); }
</style>
