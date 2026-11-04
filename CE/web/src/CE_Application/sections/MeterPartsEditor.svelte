<script>
  /**
   * The Meter tab's parts (models/meterDeviceParts.js), as the owner approved them in the mock-up,
   * laid out as the Button tab is: a row of part chips picks the part, a green dot on the ones
   * drawn, and one editor below shows it. Reading first, for how the part answers the meter's
   * reading (or its held peak): it fills, slides, swings, lights its cells, or lights as a clip
   * lamp, and takes the meter's colour zones by position or by level. Then Shape, Position and
   * Appearance; on the Scale part its marks (major and minor ticks, in the Knob tab's words, and
   * numerals); on the Legend part its text.
   *
   * Every field names its property, so it carries the override marks and Revert
   * (properties/PropertyCell.svelte `path`). Colours are a swatch, which opens the Colors dock, and
   * a code; a gradient fill opens the Gradient dock.
   */
  import PropertySection from '../properties/PropertySection.svelte';
  import PropertyCell from '../properties/PropertyCell.svelte';
  import PropertyToggle from '../properties/PropertyToggle.svelte';
  import PropertyColor from '../properties/PropertyColor.svelte';
  import NumberCell from '../properties/NumberCell.svelte';
  import Boxes from 'lucide-svelte/icons/boxes';
  import Activity from 'lucide-svelte/icons/activity';
  import Shapes from 'lucide-svelte/icons/shapes';
  import Move from 'lucide-svelte/icons/move';
  import Palette from 'lucide-svelte/icons/palette';
  import Ruler from 'lucide-svelte/icons/ruler';
  import Type from 'lucide-svelte/icons/type';
  import { getSection, updateControlProperty, updateSelectedProperty, applyControlPatch, applySelectedPatch } from '../stores/controls.js';
  import { selectedComponentIds } from '../stores/panels.js';
  import { activateInspectorColorTarget } from '../stores/colorTarget.js';
  import { openFillGradientEditor } from '../stores/gradientTarget.js';
  import { activeControlSet } from '../stores/controlSets.js';
  import { resolveColourLiteral } from '../models/controlSets.js';
  import { METER_DEVICE_PARTS, meterDeviceDrawn } from '../models/meterDeviceParts.js';
  import { DEVICE_SHADINGS } from '../models/buttonFormParts.js';
  import { anatomyForm, anatomyOptions, isIllustratedForm } from '../models/controlAnatomy.js';
  import IllustratedFormNote from './IllustratedFormNote.svelte';
  import { DEVICE_SHAPES } from '../utils/deviceShapes.js';
  import { MATERIAL_KINDS } from '../utils/materialFilter.js';
  import { RENDERED_BLOCK_TOPS, RENDERED_MATERIALS, RENDERED_TOPS } from '../utils/renderedLook.js';
  import { numberOr } from '../utils/primitives.js';

  let { control = null } = $props();

  const SHAPE_LABELS = {
    rect: 'Rectangle', ellipse: 'Ellipse', diamond: 'Diamond', hexagon: 'Hexagon', flap: 'Folded Sheet', corner: 'Fold',
    pillow: 'Cushion', bracket: 'Guard Bracket', crosshair: 'Crosshair', pair: 'Pair', ribbon: 'Ribbon', ring: 'Ring',
    arch: 'Arch', ticket: 'Paper Tally', pointer: 'Pointer', bow: 'Bow', bevel: 'Bevelled Key', octagon: 'Octagon',
  };
  const PATTERNS = [['solid', 'Solid'], ['lines', 'Lines'], ['grid', 'Grid'], ['columns', 'Columns'], ['digits', 'Figures']];
  const MOTIONS = [['none', 'None'], ['fill', 'Fill'], ['slide', 'Slide'], ['swing', 'Swing'], ['light', 'Light'], ['clip', 'Clip Lamp']];
  const DEFAULT_GRADIENT = {
    type: 'linear', angle: 90, centerX: 50, centerY: 50, radiusX: 50, radiusY: 50, edge: 0,
    stops: [{ color: '39D98A', position: 0 }, { color: 'EB5757', position: 100 }],
  };
  const word = (text) => text.charAt(0).toUpperCase() + text.slice(1);

  let core = $derived(getSection(control, 'Core'));
  let parts = $derived(getSection(control, 'Parts')?._children ?? {});
  let partName = $state('indicator');
  let part = $derived(parts[partName] ?? null);
  let prefix = $derived(`Parts.${partName}`);
  let layout = $derived(part?._children?.Layout ?? {});
  let fill = $derived(part?._children?.Background?._children?.Fill ?? {});
  let border = $derived(part?._children?.Background?._children?.Border ?? {});
  let corners = $derived(part?._children?.Background?._children?.Corners ?? {});
  let material = $derived(part?._children?.Background?._children?.Effects?._children?.Material ?? {});
  let motion = $derived(String(part?.motion ?? 'none'));
  let pattern = $derived(String(part?.pattern ?? 'solid'));
  let isScale = $derived(partName === 'scale');
  let isLegend = $derived(partName === 'legend');
  let form = $derived(anatomyForm(core?.controlType, core?.controlForm));
  let formName = $derived(anatomyOptions(core?.controlType).find(([id]) => id === form)?.[1] ?? form);
  // Iris's and Satellite's forms are drawn whole: the parts below do not apply (IllustratedFormNote).
  let illustrated = $derived(isIllustratedForm(form));
  let partsDrawn = $derived(!form && meterDeviceDrawn(control));
  // A housing or clip lamp can be rendered (utils/renderedLookCore.js renderedMeterPartSpec): the
  // housing a low block its box's size, a round lamp a turned body. In the meter's 160 by 100 frame.
  const RENDERABLE = new Set(['housing', 'lamp']);
  let renderable = $derived(RENDERABLE.has(partName));
  let rendered = $derived(renderable && String(part?.look ?? '') === 'rendered');
  let renderedRound = $derived.by(() => {
    const w = (Number(layout.width) || 0) * 1.6;
    const h = Number(layout.height) || 0;
    return String(part?.shape ?? 'rect') === 'ellipse' && w > 0 && h > 0 && Math.abs(w - h) / Math.max(w, h) < 0.08;
  });
  let renderedHeight = $derived(renderedRound ? 80 : partName === 'housing' ? 12 : 30);
  let zoned = $derived(String(part?.zoneColours ?? 'off') !== 'off');

  const partLabel = (name) => (name === 'lamp' ? 'Clip Lamp' : word(name));
  const shown = (colour, fallback = 'FF3A3A3A') => resolveColourLiteral(colour, $activeControlSet, fallback);
  const percent = (value, fallback = 1) => Math.round(numberOr(value, fallback) * 100);
  const fraction = (value) => Math.max(0, Math.min(100, Number(value) || 0)) / 100;

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

  // Fill Type: a solid colour (with the set's shading over it, if any), or a gradient alone, edited
  // in the Gradient dock as a layer's is.
  let fillType = $derived(fill.gradientEnabled === true && fill.solidEnabled === false ? 'gradient' : 'solid');
  function openGradient() {
    if (!core?.id) return;
    openFillGradientEditor({
      controlId: core.id,
      targetPath: `${prefix}.Background.Fill`,
      fill,
      defaultGradient: DEFAULT_GRADIENT,
      seedGradient: (seeded) => set(`${prefix}.Background.Fill.gradient`, seeded),
      inspector: true,
    });
  }
  function setFillType(kind) {
    if (kind === 'gradient') {
      setPatch({ [`${prefix}.Background.Fill.gradientEnabled`]: true, [`${prefix}.Background.Fill.solidEnabled`]: false });
      openGradient();
    } else {
      setPatch({ [`${prefix}.Background.Fill.solidEnabled`]: true, [`${prefix}.Background.Fill.gradientEnabled`]: false });
    }
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
        [`${prefix}.Background.Fill.solidEnabled`]: true,
        [`${prefix}.Background.Fill.gradient`]: DEVICE_SHADINGS[kind],
        [`${prefix}.Background.Fill.gradientOpacity`]: 100,
      });
    }
  }

  const litMotion = (m) => m === 'light' || m === 'clip';
</script>

{#snippet colourCell(label, path, value, fallback, what, hint, span = 2)}
  <PropertyCell {label} {span} {path} {hint}>
    <PropertyColor value={shown(value, fallback)} onchange={(v) => set(path, v)} onswatchclick={() => pickColour(path, value, fallback, what)} />
  </PropertyCell>
{/snippet}

<div class="meter-parts" class:dimmed={illustrated}>
  {#if illustrated}
    <IllustratedFormNote name={formName} />
  {:else if !partsDrawn}
    <p class="note">
      {#if String(core?.controlForm ?? '') === 'original'}
        Core › Control design is Original parts, so this meter draws as a plain meter and these parts are not drawn.
      {:else if form}
        The {formName} form draws this meter. Core › Control design › Convert to Parts makes it these parts.
      {:else}
        These parts are hidden, so this meter draws as a plain meter. Choose a form in Core › Control design to start from one, or make a part visible.
      {/if}
    </p>
  {/if}

  <PropertySection title="Parts" icon={Boxes}>
    <div class="chips" role="tablist" aria-label="Meter parts">
      {#each METER_DEVICE_PARTS as name (name)}
        <button type="button" role="tab" class="chip" class:on={partName === name} aria-selected={partName === name}
          title={`${partLabel(name)}${parts[name]?.visible === true ? '' : ' (hidden)'}`} onclick={() => { partName = name; }}>
          <span class="dot" class:drawn={parts[name]?.visible === true} aria-hidden="true"></span>{partLabel(name)}
        </button>
      {/each}
    </div>
  </PropertySection>

  {#if part}
    {#if !isScale}
      <PropertySection title="Reading" icon={Activity}>
        <PropertyCell label="Motion" span={2} path={`${prefix}.motion`} hint="How it answers the reading: it fills, slides, swings, lights its cells, or lights as a clip lamp.">
          <select class="val" aria-label="Motion" value={motion} onchange={(e) => set(`${prefix}.motion`, e.target.value)}>
            {#each MOTIONS as [id, label] (id)}<option value={id}>{label}</option>{/each}
          </select>
        </PropertyCell>
        <PropertyCell label="Shows" span={2} path={`${prefix}.source`} disabled={motion === 'none' || motion === 'clip'} hint="The reading, or the peak the meter holds (its Peak Hold time and fall).">
          <select class="val" aria-label="Shows" value={String(part.source ?? 'reading')} disabled={motion === 'none' || motion === 'clip'} onchange={(e) => set(`${prefix}.source`, e.target.value)}>
            <option value="reading">The Reading</option>
            <option value="peak">The Held Peak</option>
          </select>
        </PropertyCell>
        <PropertyCell label="Rest Angle" compact path={`${prefix}.Layout.rotation`} hint="Its angle at rest, in degrees, about its pivot: where a needle starts.">
          <NumberCell label="Rest Angle" value={numberOr(layout.rotation, 0)} defaultValue={0} step={0.5} min={-360} max={360} onchange={(v) => set(`${prefix}.Layout.rotation`, v)} />
        </PropertyCell>
        <PropertyCell label="Swing" compact path={`${prefix}.swing`} disabled={motion !== 'swing'} hint="How far it turns at full scale, in degrees.">
          <NumberCell label="Swing" value={numberOr(part.swing, 0)} defaultValue={0} step={0.5} min={-360} max={360} disabled={motion !== 'swing'} onchange={(v) => set(`${prefix}.swing`, v)} />
        </PropertyCell>
        <PropertyCell label="Fill From" path={`${prefix}.fillFrom`} disabled={motion !== 'fill'} hint="The edge it fills from.">
          <select class="val" aria-label="Fill from" value={String(part.fillFrom ?? 'left')} disabled={motion !== 'fill'} onchange={(e) => set(`${prefix}.fillFrom`, e.target.value)}>
            {#each ['left', 'right', 'bottom', 'top'] as edge (edge)}<option value={edge}>{word(edge)}</option>{/each}
          </select>
        </PropertyCell>
        <PropertyCell label="Light From" path={`${prefix}.lightFrom`} disabled={motion !== 'light'} hint="Count the cells from the left, or up from the foot, as a ladder lights.">
          <select class="val" aria-label="Light from" value={String(part.lightFrom ?? 'left')} disabled={motion !== 'light'} onchange={(e) => set(`${prefix}.lightFrom`, e.target.value)}>
            <option value="left">Left</option>
            <option value="bottom">Bottom</option>
          </select>
        </PropertyCell>
        <PropertyCell label="Move X %" compact path={`${prefix}.travelX`} disabled={motion !== 'slide' && motion !== 'light'} hint="How far it moves across at full scale, or a lit cell moves, in % of the meter.">
          <NumberCell label="Move X %" value={numberOr(part.travelX, 0)} defaultValue={0} step={0.5} min={-100} max={100} disabled={motion !== 'slide' && motion !== 'light'} onchange={(v) => set(`${prefix}.travelX`, v)} />
        </PropertyCell>
        <PropertyCell label="Move Y %" compact path={`${prefix}.travelY`} disabled={motion !== 'slide' && motion !== 'light'} hint="How far it moves down at full scale, or a lit cell moves, in % of the meter.">
          <NumberCell label="Move Y %" value={numberOr(part.travelY, 0)} defaultValue={0} step={0.5} min={-100} max={100} disabled={motion !== 'slide' && motion !== 'light'} onchange={(v) => set(`${prefix}.travelY`, v)} />
        </PropertyCell>
        <PropertyCell label="Clip At %" compact path={`${prefix}.clipFrom`} disabled={motion !== 'clip'} hint="The level it lights at; it stays lit while the meter's held peak is above it.">
          <NumberCell label="Clip At %" value={percent(part.clipFrom, 0.9)} defaultValue={90} step={1} min={0} max={100} disabled={motion !== 'clip'} onchange={(v) => set(`${prefix}.clipFrom`, fraction(v))} />
        </PropertyCell>
        <PropertyCell label="Lit Opacity" compact path={`${prefix}.activeOpacity`} disabled={!litMotion(motion)} hint="How much a lit cell or a lit lamp shows, 0 to 100. Empty keeps its own opacity.">
          <NumberCell label="Lit Opacity" value={part.activeOpacity == null ? '' : percent(part.activeOpacity)} allowEmpty step={5} min={0} max={100} disabled={!litMotion(motion)}
            onchange={(v) => set(`${prefix}.activeOpacity`, v === '' || v == null ? null : fraction(v))} />
        </PropertyCell>
        <PropertyCell label="Lit Colour" span={2} path={`${prefix}.activeColour`} disabled={!litMotion(motion)} hint="The colour of a lit cell or a lit lamp. Unchanged keeps its fill; the swatch opens the Colors dock.">
          {#if String(part.activeColour ?? '').trim()}
            <div class="active-colour">
              <PropertyColor value={shown(part.activeColour)} onchange={(v) => set(`${prefix}.activeColour`, v)} onswatchclick={() => pickColour(`${prefix}.activeColour`, part.activeColour, part.activeColour, 'Lit Colour')} />
              <button type="button" class="clear" title="Back to Unchanged: keep its fill" aria-label="Clear the lit colour" onclick={() => set(`${prefix}.activeColour`, '')}>×</button>
            </div>
          {:else}
            <button type="button" class="unchanged" title="Give it a colour of its own when lit: opens the Colors dock" onclick={() => pickColour(`${prefix}.activeColour`, '', fill.colour, 'Lit Colour')}>
              <span class="hatch" aria-hidden="true"></span>Unchanged
            </button>
          {/if}
        </PropertyCell>
        <PropertyCell label="Pivot X %" compact path={`${prefix}.pivotX`} hint="The point it turns about, across its own box: 50 is the middle.">
          <NumberCell label="Pivot X %" value={numberOr(part.pivotX, 50)} defaultValue={50} step={1} min={-100} max={200} onchange={(v) => set(`${prefix}.pivotX`, v)} />
        </PropertyCell>
        <PropertyCell label="Pivot Y %" compact path={`${prefix}.pivotY`} hint="The point it turns about, down its own box: 100 is its foot.">
          <NumberCell label="Pivot Y %" value={numberOr(part.pivotY, 50)} defaultValue={50} step={1} min={-100} max={200} onchange={(v) => set(`${prefix}.pivotY`, v)} />
        </PropertyCell>
        <PropertyCell label="Zone Colours" span={2} path={`${prefix}.zoneColours`} hint="Colour it from the meter's Colour Zones: each part by where it sits, or all of it by the reading.">
          <select class="val" aria-label="Zone colours" value={String(part.zoneColours ?? 'off')} onchange={(e) => set(`${prefix}.zoneColours`, e.target.value)}>
            <option value="off">Off</option>
            <option value="position">By Position</option>
            <option value="level">By Level</option>
          </select>
        </PropertyCell>
      </PropertySection>
    {/if}

    <PropertySection title="Shape" icon={Shapes}>
      <PropertyCell label="Visible" path={`${prefix}.visible`} hint={`Draw the ${partLabel(partName).toLowerCase()}.`}>
        <PropertyToggle value={part.visible === true} ariaLabel={`${partLabel(partName)} visible`} onchange={(next) => set(`${prefix}.visible`, next)} />
      </PropertyCell>
      {#if !isScale && !isLegend}
        <PropertyCell label="Shape" path={`${prefix}.shape`} hint="Its outline: a rectangle, an ellipse, an arch, a paper tally, a pointer and more.">
          <select class="val" aria-label="Shape" value={String(part.shape ?? 'rect')} onchange={(e) => set(`${prefix}.shape`, e.target.value)}>
            {#each DEVICE_SHAPES as id (id)}<option value={id}>{SHAPE_LABELS[id] ?? word(id)}</option>{/each}
          </select>
        </PropertyCell>
        <PropertyCell label="Depth %" compact path={`${prefix}.shapeDepth`} hint="How deep a fold, an arch's shoulders, a tally's teeth or a ring is, as a percentage of the part.">
          <NumberCell label="Depth %" value={numberOr(part.shapeDepth, 20)} defaultValue={20} step={0.5} min={0} max={100} onchange={(v) => set(`${prefix}.shapeDepth`, v)} />
        </PropertyCell>
        <PropertyCell label="Corner" compact path={`${prefix}.Background.Corners.radius`} hint="How round its corners are, in the meter's units.">
          <NumberCell label="Corner" value={numberOr(corners.radius, 0)} defaultValue={0} step={1} min={0} max={80} onchange={(v) => set(`${prefix}.Background.Corners.radius`, v)} />
        </PropertyCell>
        <PropertyCell label="Pattern" span={2} path={`${prefix}.pattern`} hint="Repeat the shape: in lines, a grid, columns, or one cell per figure of the reading.">
          <select class="val" aria-label="Pattern" value={pattern} onchange={(e) => set(`${prefix}.pattern`, e.target.value)}>
            {#each PATTERNS as [id, label] (id)}<option value={id}>{label}</option>{/each}
          </select>
        </PropertyCell>
        <PropertyCell label="Count" compact path={`${prefix}.patternCount`} disabled={pattern === 'solid' || pattern === 'digits'} hint="How many across, or down in lines.">
          <NumberCell label="Count" value={numberOr(part.patternCount, 4)} defaultValue={4} step={1} min={1} max={64} onchange={(v) => set(`${prefix}.patternCount`, v)} />
        </PropertyCell>
        <PropertyCell label="Rows" compact path={`${prefix}.patternRows`} disabled={pattern !== 'grid'} hint="How many down, in a grid.">
          <NumberCell label="Rows" value={numberOr(part.patternRows, 3)} defaultValue={3} step={1} min={1} max={64} onchange={(v) => set(`${prefix}.patternRows`, v)} />
        </PropertyCell>
        <PropertyCell label="Cell W %" compact path={`${prefix}.cellWidth`} disabled={!['grid', 'columns', 'digits'].includes(pattern)} hint="How much of its pitch a cell fills across, in %; the rest is the gap.">
          <NumberCell label="Cell W %" value={part.cellWidth == null ? '' : numberOr(part.cellWidth, 50)} allowEmpty step={1} min={1} max={100} onchange={(v) => set(`${prefix}.cellWidth`, v === '' ? null : v)} />
        </PropertyCell>
        <PropertyCell label="Cell H %" compact path={`${prefix}.cellHeight`} disabled={!['grid', 'lines'].includes(pattern)} hint="How much of its pitch a cell fills down, in %; the rest is the gap.">
          <NumberCell label="Cell H %" value={part.cellHeight == null ? '' : numberOr(part.cellHeight, 50)} allowEmpty step={1} min={1} max={100} onchange={(v) => set(`${prefix}.cellHeight`, v === '' ? null : v)} />
        </PropertyCell>
      {/if}
    </PropertySection>

    {#if isScale}
      <PropertySection title="Scale" icon={Ruler}>
        <PropertyCell label="Marks" span={2} path={`${prefix}.pattern`} hint="Ticks along a line, or round an arc.">
          <select class="val" aria-label="Marks" value={pattern === 'arc' ? 'arc' : 'ticks'} onchange={(e) => set(`${prefix}.pattern`, e.target.value)}>
            <option value="ticks">Along a Line</option>
            <option value="arc">Round an Arc</option>
          </select>
        </PropertyCell>
        <PropertyCell label="Major Count" compact path={`${prefix}.majorCount`} hint="How many long ticks, the two ends included.">
          <NumberCell label="Major" value={numberOr(part.majorCount, 5)} defaultValue={5} step={1} min={2} max={97} onchange={(v) => set(`${prefix}.majorCount`, Math.max(2, Math.round(Number(v) || 2)))} />
        </PropertyCell>
        <PropertyCell label="Minor / Gap" compact path={`${prefix}.minorCount`} hint="Short ticks between each pair of long ticks.">
          <NumberCell label="Minor" value={numberOr(part.minorCount, 0)} defaultValue={0} step={1} min={0} max={20} onchange={(v) => set(`${prefix}.minorCount`, Math.max(0, Math.round(Number(v) || 0)))} />
        </PropertyCell>
        <PropertyCell label="Major Len %" compact path={`${prefix}.majorLength`} hint="A long tick's length, in % of the part's height, or of the arc's radius.">
          <NumberCell label="Major Len %" value={numberOr(part.majorLength, 100)} defaultValue={100} step={1} min={0} max={100} onchange={(v) => set(`${prefix}.majorLength`, v)} />
        </PropertyCell>
        <PropertyCell label="Minor Len %" compact path={`${prefix}.minorLength`} hint="A short tick's length, in % of the part's height, or of the arc's radius.">
          <NumberCell label="Minor Len %" value={numberOr(part.minorLength, 50)} defaultValue={50} step={1} min={0} max={100} onchange={(v) => set(`${prefix}.minorLength`, v)} />
        </PropertyCell>
        <PropertyCell label="Major Width" compact path={`${prefix}.majorWidth`} hint="A long tick's width, in the meter's units.">
          <NumberCell label="Major Width" value={numberOr(part.majorWidth, 1)} defaultValue={1} step={0.25} min={0.1} max={20} onchange={(v) => set(`${prefix}.majorWidth`, v)} />
        </PropertyCell>
        <PropertyCell label="Minor Width" compact path={`${prefix}.minorWidth`} hint="A short tick's width, in the meter's units.">
          <NumberCell label="Minor Width" value={numberOr(part.minorWidth, 1)} defaultValue={1} step={0.25} min={0.1} max={20} onchange={(v) => set(`${prefix}.minorWidth`, v)} />
        </PropertyCell>
        <PropertyCell label="Sweep" compact path={`${prefix}.swing`} disabled={pattern !== 'arc'} hint="How far round the arc runs, in degrees.">
          <NumberCell label="Sweep" value={numberOr(part.swing, 270)} defaultValue={270} step={1} min={1} max={360} disabled={pattern !== 'arc'} onchange={(v) => set(`${prefix}.swing`, v)} />
        </PropertyCell>
        <PropertyCell label="Start Angle" compact path={`${prefix}.Layout.rotation`} hint="Where the scale starts, in degrees from straight up; the whole scale turns with it.">
          <NumberCell label="Start" value={numberOr(layout.rotation, 0)} defaultValue={0} step={0.5} min={-360} max={360} onchange={(v) => set(`${prefix}.Layout.rotation`, v)} />
        </PropertyCell>
        <PropertyCell label="Zone From %" compact path={`${prefix}.zoneFrom`} disabled={String(part.zoneColours ?? 'off') === 'position'} hint="Ticks past this point take the zone colour, as a VU meter's red end. Empty for none.">
          <NumberCell label="Zone From %" value={part.zoneFrom == null ? '' : percent(part.zoneFrom, 1)} allowEmpty step={1} min={0} max={100}
            onchange={(v) => set(`${prefix}.zoneFrom`, v === '' || v == null ? null : fraction(v))} />
        </PropertyCell>
        {@render colourCell('Zone Colour', `${prefix}.activeColour`, part.activeColour, 'FFEB5757', 'Zone Colour', 'The colour of the ticks past Zone From.', 1)}
        <PropertyCell label="Zone Colours" span={2} path={`${prefix}.zoneColours`} hint="Colour every tick from the meter's Colour Zones, by where it sits; this replaces the zone above.">
          <select class="val" aria-label="Scale zone colours" value={String(part.zoneColours ?? 'off') === 'position' ? 'position' : 'off'} onchange={(e) => set(`${prefix}.zoneColours`, e.target.value)}>
            <option value="off">Off</option>
            <option value="position">By Position</option>
          </select>
        </PropertyCell>
        <PropertyCell label="Numerals" path={`${prefix}.numerals`} hint="Print the value at each long tick.">
          <PropertyToggle value={part.numerals === true} ariaLabel="Numerals" onchange={(next) => set(`${prefix}.numerals`, next)} />
        </PropertyCell>
        <PropertyCell label="Size" compact path={`${prefix}.numeralSize`} disabled={part.numerals !== true} hint="The numerals' size, in the meter's units.">
          <NumberCell label="Size" value={numberOr(part.numeralSize, 7)} defaultValue={7} step={0.5} min={2} max={40} disabled={part.numerals !== true} onchange={(v) => set(`${prefix}.numeralSize`, v)} />
        </PropertyCell>
        <PropertyCell label="Placement" path={`${prefix}.numeralPlacement`} disabled={part.numerals !== true} hint="Outside the ticks, or inside them.">
          <select class="val" aria-label="Numeral placement" value={String(part.numeralPlacement ?? 'outside')} disabled={part.numerals !== true} onchange={(e) => set(`${prefix}.numeralPlacement`, e.target.value)}>
            <option value="outside">Outside</option>
            <option value="inside">Inside</option>
          </select>
        </PropertyCell>
        <PropertyCell label="Units" path={`${prefix}.numeralUnits`} disabled={part.numerals !== true} hint="The reading in the meter's range, in decibels, or as a percentage.">
          <select class="val" aria-label="Numeral units" value={String(part.numeralUnits ?? 'reading')} disabled={part.numerals !== true} onchange={(e) => set(`${prefix}.numeralUnits`, e.target.value)}>
            <option value="reading">Reading</option>
            <option value="db">dB</option>
            <option value="percent">Percent</option>
          </select>
        </PropertyCell>
      </PropertySection>
    {/if}

    <PropertySection title="Position" icon={Move}>
      <PropertyCell label="X %" compact path={`${prefix}.Layout.x`} hint="Its left edge, in % of the meter, which keeps its place over the readout.">
        <NumberCell label="X %" value={numberOr(layout.x, 10)} step={0.5} min={-50} max={150} onchange={(v) => set(`${prefix}.Layout.x`, v)} />
      </PropertyCell>
      <PropertyCell label="Y %" compact path={`${prefix}.Layout.y`} hint="Its top edge, in % of the meter.">
        <NumberCell label="Y %" value={numberOr(layout.y, 10)} step={0.5} min={-50} max={150} onchange={(v) => set(`${prefix}.Layout.y`, v)} />
      </PropertyCell>
      <PropertyCell label="W %" compact path={`${prefix}.Layout.width`} hint="Its width, in % of the meter.">
        <NumberCell label="W %" value={numberOr(layout.width, 80)} step={0.5} min={0} max={200} onchange={(v) => set(`${prefix}.Layout.width`, v)} />
      </PropertyCell>
      <PropertyCell label="H %" compact path={`${prefix}.Layout.height`} hint="Its height, in % of the meter.">
        <NumberCell label="H %" value={numberOr(layout.height, 80)} step={0.5} min={0} max={200} onchange={(v) => set(`${prefix}.Layout.height`, v)} />
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
        <!-- A rendered housing or lamp (utils/renderedLookCore.js): only what the render draws. Its
             corners are the Shape section's Corner, a lamp's lit colour the Reading section's. -->
        {#if zoned}
          <p class="note span">Drawn flat while Zone Colours is on: its colour moves with the reading, which a rendered image cannot follow.</p>
        {/if}
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
          <NumberCell label="Height" value={numberOr(part?.renderHeight, renderedHeight)} defaultValue={renderedHeight} step={1} min={4} max={200} onchange={(v) => set(`${prefix}.renderHeight`, v)} />
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
        {@render colourCell('Body Colour', `${prefix}.Background.Fill.colour`, fill.colour, 'FF3A3A3A', 'Body Colour', "Its body's colour; a lamp's lit colour is the Reading section's Lit Colour. The swatch opens it in the Colors dock.")}
        {@render colourCell('Top Colour', `${prefix}.renderTopColour`, part?.renderTopColour || fill.colour, 'FF3A3A3A', 'Top Colour', "Its top's colour; empty, the body's.")}
      {:else}
      {@render colourCell('Fill', `${prefix}.Background.Fill.colour`, fill.colour, 'FF3A3A3A', 'Fill', 'Its colour. The swatch opens it in the Colors dock; the field takes AARRGGBB or RRGGBB.')}
      <PropertyCell label="Fill Type" path={`${prefix}.Background.Fill.solidEnabled`} hint="A solid colour, or a gradient alone, edited in the Gradient dock.">
        <div class="fill-type">
          <select class="val" aria-label="Fill type" value={fillType} onchange={(e) => setFillType(e.target.value)}>
            <option value="solid">Solid</option>
            <option value="gradient">Gradient</option>
          </select>
          {#if fillType === 'gradient'}<button type="button" class="edit" title="Edit the gradient in the Gradient dock" aria-label="Edit the gradient" onclick={openGradient}>…</button>{/if}
        </div>
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
      <PropertyCell label="Border" compact path={`${prefix}.Background.Border.thickness`} hint="Its edge, in the meter's units. 0 for none.">
        <NumberCell label="Border" value={border.enabled === true ? numberOr(border.thickness, 0) : 0} defaultValue={0} step={0.5} min={0} max={20} onchange={(v) => setBorder(v)} />
      </PropertyCell>
      <PropertyCell label="Shading" path={`${prefix}.Background.Fill.gradientEnabled`} disabled={fillType === 'gradient'} hint="Lays the set's turned-metal or dome shading over its own colour.">
        <select class="val" aria-label="Shading" value={fillType === 'gradient' ? 'custom' : shading} disabled={fillType === 'gradient'} onchange={(e) => setShading(e.target.value)}>
          <option value="none">None</option>
          <option value="metal">Metal</option>
          <option value="dome">Dome</option>
          {#if shading === 'custom' || fillType === 'gradient'}<option value="custom" disabled>Custom gradient</option>{/if}
        </select>
      </PropertyCell>
      {@render colourCell('Border Colour', `${prefix}.Background.Border.colour`, border.colour, 'FF333333', 'Border Colour', 'The colour of its edge.')}
      <PropertyCell label="Shadow %" compact path={`${prefix}.shadowOffset`} hint="A drop shadow under it: its outline again, this percentage of the meter's height lower. 0 for none.">
        <NumberCell label="Shadow" value={numberOr(part.shadowOffset, 0)} defaultValue={0} step={0.5} min={0} max={50} onchange={(v) => set(`${prefix}.shadowOffset`, v)} />
      </PropertyCell>
      <PropertyCell label="Softness %" compact path={`${prefix}.shadowBlur`} hint="How soft the shadow's edge is, as a percentage of the meter's height. 0 for a hard edge.">
        <NumberCell label="Softness" value={numberOr(part.shadowBlur, 0)} defaultValue={0} step={0.5} min={0} max={50} onchange={(v) => set(`${prefix}.shadowBlur`, v)} />
      </PropertyCell>
      {@render colourCell('Shadow Colour', `${prefix}.shadowColour`, part.shadowColour, '99000000', 'Shadow Colour', "The shadow's colour; its alpha is how dark it falls.")}
      {/if}
    </PropertySection>

    {#if isLegend}
      <PropertySection title="Legend Text" icon={Type}>
        <PropertyCell label="Shows" span={2} path={`${prefix}.textSource`} hint="Its own words, the reading, or the reading as a percentage.">
          <select class="val" aria-label="Legend shows" value={String(part.textSource ?? 'fixed')} onchange={(e) => set(`${prefix}.textSource`, e.target.value)}>
            <option value="fixed">Its Text</option>
            <option value="value">The Reading</option>
            <option value="percent">Percentage</option>
          </select>
        </PropertyCell>
        <PropertyCell label="Text" span={2} path={`${prefix}.legendText`} disabled={String(part.textSource ?? 'fixed') !== 'fixed'} hint="Its words: VU, SIGNAL, LEVEL.">
          <input class="val" type="text" aria-label="Legend text" value={String(part.legendText ?? '')} disabled={String(part.textSource ?? 'fixed') !== 'fixed'} onchange={(e) => set(`${prefix}.legendText`, e.currentTarget.value)} />
        </PropertyCell>
        <PropertyCell label="Size" compact path={`${prefix}.fontSize`} hint="Its size, in the meter's units.">
          <NumberCell label="Size" value={numberOr(part.fontSize, 10)} defaultValue={10} step={0.5} min={2} max={80} onchange={(v) => set(`${prefix}.fontSize`, v)} />
        </PropertyCell>
        <PropertyCell label="Figures" path={`${prefix}.pattern`} hint="Each figure in a cell of its own, as a counter's wheels.">
          <PropertyToggle value={pattern === 'digits'} ariaLabel="Figures in cells" onchange={(next) => set(`${prefix}.pattern`, next ? 'digits' : 'solid')} />
        </PropertyCell>
        <PropertyCell label="Typeface" span={2} path={`${prefix}.fontFamily`} hint="The panel's lettering, or figures of one width.">
          <select class="val" aria-label="Typeface" value={String(part.fontFamily ?? '') === 'monospace' ? 'monospace' : ''} onchange={(e) => set(`${prefix}.fontFamily`, e.target.value)}>
            <option value="">The Panel's</option>
            <option value="monospace">Monospace</option>
          </select>
        </PropertyCell>
      </PropertySection>
    {/if}
  {/if}
</div>

<style>
  .meter-parts { min-width: 0; }
  .meter-parts.dimmed > :global(:not([data-illustrated-note])) { opacity: 0.4; }
  .val { box-sizing: border-box; width: 100%; min-width: 0; height: var(--pp-field-height, 26px); padding: var(--pp-field-padding, 0 6px); background: var(--pp-field-bg, #1A1A1A); border: 1px solid var(--pp-field-border, #333); border-radius: var(--pp-field-radius, 3px); color: var(--pp-field-fg, #DDD); font-size: var(--pp-field-font, 11px); font-family: inherit; outline: none; }
  .val:focus { border-color: var(--pp-field-focus, #5B9BD5); }
  .val:disabled { opacity: .45; }
  .note.span { grid-column: 1 / -1; margin: 0 0 4px; }
  .note { margin: 6px 8px; padding: 6px 8px; border: 1px solid #3A4A56; border-radius: 4px; background: #16222A; color: #B8C7D2; font-size: 11px; line-height: 1.4; }
  .chips { grid-column: 1 / -1; display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 4px; }
  .chip { display: flex; flex-direction: column; align-items: center; gap: 3px; min-width: 0; padding: 5px 2px; border: 1px solid #333; border-radius: 4px;
    background: #1A1A1A; color: #BBB; font: inherit; font-size: 11px; cursor: pointer; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .chip:hover { border-color: #5B9BD5; color: #FFF; }
  .chip.on { background: #0B3E61; border-color: #0B6EB5; color: #FFF; }
  .dot { width: 6px; height: 6px; border-radius: 50%; background: #555; }
  .dot.drawn { background: #4CAF50; }
  .active-colour, .fill-type { display: flex; align-items: center; gap: 4px; min-width: 0; }
  .active-colour :global(.property-color) { flex: 1; }
  .clear, .edit { width: 22px; height: 22px; flex: none; padding: 0; border: 1px solid #333; border-radius: 3px; background: #1A1A1A; color: #AAA; cursor: pointer; }
  .clear:hover { border-color: #C0504D; color: #FFF; }
  .edit:hover { border-color: #5B9BD5; color: #FFF; }
  .unchanged { display: flex; align-items: center; gap: 6px; width: 100%; height: var(--pp-field-height, 26px); padding: 0 6px; border: 1px solid var(--pp-field-border, #333);
    border-radius: var(--pp-field-radius, 3px); background: var(--pp-field-bg, #1A1A1A); color: #999; font: inherit; font-size: var(--pp-field-font, 11px); cursor: pointer; text-align: left; }
  .unchanged:hover { border-color: #5B9BD5; color: #DDD; }
  .hatch { width: 16px; height: 16px; flex: none; border: 1px solid #555; border-radius: 3px;
    background: repeating-linear-gradient(45deg, #2A2A2A 0 3px, #555 3px 4px); }
</style>
