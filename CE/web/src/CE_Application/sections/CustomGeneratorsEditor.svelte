<script>
  import { applyControlPatchesById, getSection, updateControlProperty, removeControlNode } from '../stores/controls.js';
  import {
    extractDetachedGeneratedHitZones,
    extractDetachedGeneratedParts,
    materializedCustomComponentSnapshot,
  } from '../utils/customComponentMaterializer.js';
  import PropertyCell from '../properties/PropertyCell.svelte';
  import PropertySection from '../properties/PropertySection.svelte';
  import PropertyToggle from '../properties/PropertyToggle.svelte';
  import NumberInput from './NumberInput.svelte';

  let { control = null } = $props();

  let core = $derived(getSection(control, 'Core'));
  let designer = $derived(getSection(control, 'Designer'));
  let generators = $derived(getSection(control, 'Generators'));
  let behaviors = $derived(getSection(control, 'Behaviors'));
  let names = $derived(Object.keys(generators?._children ?? {}));
  let behaviorNames = $derived(Object.keys(behaviors?._children ?? {}));
  let selectedName = $state('');
  let newName = $state('');
  let selected = $derived(generators?._children?.[selectedName] ?? null);
  let materialized = $derived(materializedCustomComponentSnapshot(control));
  let materializedParts = $derived(materialized?._children?.Parts?._children ?? {});
  let materializedHitZones = $derived(materialized?._children?.HitZones?._children ?? {});
  let generatedPartEntries = $derived(Object.entries(materializedParts).filter(([, part]) => part?.meta?.generatedBy === selectedName));
  let generatedZoneEntries = $derived(Object.entries(materializedHitZones).filter(([, zone]) => zone?.meta?.generatedBy === selectedName));
  let outputEstimate = $derived(estimateOutput(selected));
  let previewClass = $derived(generatorPreviewClass(selected));
  let gridPreviewRows = $derived(Math.max(1, Math.round(Number(selected?.rows ?? 4))));
  let gridPreviewColumns = $derived(Math.max(1, Math.round(Number(selected?.columns ?? 4))));

  const TYPES = ['ticks', 'grid', 'piano-keys', 'repeated-buttons', 'repeated-leds', 'step-bars', 'radial-markers', 'segmented-ring', 'labels', 'meter-bars', 'scrollable-content', 'filmstrip-frames'];
  const GEOMETRIES = ['linear', 'vertical', 'circular', 'grid', 'piano', 'free'];
  const TYPE_LABELS = {
    ticks: 'Scale marks',
    grid: 'Grid cells',
    'piano-keys': 'Piano keys',
    'repeated-buttons': 'Button bank',
    'repeated-leds': 'LED row',
    'step-bars': 'Step bars (array channel)',
    'radial-markers': 'Radial marks',
    'segmented-ring': 'Segmented ring',
    labels: 'Value labels',
    'meter-bars': 'Meter bars',
    'scrollable-content': 'Scroll list (windowed)',
    'filmstrip-frames': 'Filmstrip frames',
  };

  $effect(() => {
    if (designer?.selectedGenerator && names.includes(designer.selectedGenerator)) {
      selectedName = designer.selectedGenerator;
      return;
    }
    if (!names.length) {
      selectedName = '';
      return;
    }
    if (!selectedName || !names.includes(selectedName)) selectedName = names[0];
  });

  function set(path, value) {
    if (!core?.id || !selectedName) return;
    updateControlProperty(core.id, `Generators.${selectedName}.${path}`, value);
  }

  function setBoundsPreset(preset) {
    if (!core?.id || !selectedName) return;
    const bounds = preset === 'inset'
      ? { x: 8, y: 8, width: 84, height: 84, unit: 'percent' }
      : { x: 0, y: 0, width: 100, height: 100, unit: 'percent' };
    applyControlPatchesById(new Map([[core.id, Object.fromEntries(
      Object.entries(bounds).map(([key, value]) => [`Generators.${selectedName}.bounds.${key}`, value])
    )]]));
  }

  function estimateOutput(generator) {
    if (!generator) return { parts: 0, zones: 0, label: 'No generator selected' };
    const type = String(generator.type ?? 'ticks');
    const typeDefaultCount = type === 'piano-keys' ? 24 : (type === 'filmstrip-frames' ? 1 : 11);
    const count = Math.max(0, Math.round(Number(generator.count ?? typeDefaultCount)));
    const minor = Math.max(0, Math.round(Number(generator.minorCount ?? 0)));
    const rows = Math.max(1, Math.round(Number(generator.rows ?? 4)));
    const columns = Math.max(1, Math.round(Number(generator.columns ?? 4)));
    let parts = count;
    let label = `${count} item${count === 1 ? '' : 's'}`;

    if (type === 'ticks') {
      parts = count + Math.max(0, count - 1) * minor;
      label = `${count} major + ${Math.max(0, count - 1) * minor} minor`;
    } else if (type === 'grid') {
      parts = rows * columns;
      label = `${columns} x ${rows} cells`;
    } else if (type === 'piano-keys') {
      parts = count;
      label = `${count} keys from MIDI ${generator.baseNote ?? 60}`;
    } else if (type === 'segmented-ring' || type === 'radial-markers' || type === 'meter-bars' || type === 'repeated-leds') {
      parts = count;
      label = `${count} segments`;
    } else if (type === 'step-bars') {
      parts = count * 2; // bar + well per step
      label = `${count} step bars from '${generator.valueSource ?? generator.targetValueChannel ?? 'array channel'}'`;
    } else if (type === 'filmstrip-frames') {
      parts = 1;
      label = generator.assetName ? `asset ${generator.assetName}` : 'choose filmstrip asset';
    } else if (type === 'scrollable-content') {
      parts = Math.min(count, rows);
      label = `${count} virtual items, ${Math.min(count, rows)} visible (scroll: ${generator.valueSource || 'set a scroll channel'})`;
    }

    return {
      parts,
      zones: generator.generatedHitZones === true ? parts : 0,
      label,
    };
  }

  function generatorPreviewClass(generator) {
    const type = String(generator?.type ?? 'ticks');
    if (type === 'piano-keys') return 'piano';
    if (type === 'segmented-ring' || type === 'radial-markers') return 'ring';
    if (type === 'repeated-leds') return 'leds';
    if (type === 'step-bars') return 'meter';
    if (type === 'repeated-buttons') return 'buttons';
    if (type === 'meter-bars') return 'meter';
    if (type === 'scrollable-content') return 'scroll';
    if (type === 'filmstrip-frames') return 'filmstrip';
    return type;
  }

  function addGenerator() {
    const name = String(newName ?? '').trim();
    if (!core?.id || !name || generators?._children?.[name]) return;
    updateControlProperty(core.id, `Generators.${name}`, {
      _type: 'Generator',
      name,
      type: 'ticks',
      enabled: true,
      targetBehavior: behaviorNames[0] ?? '',
      geometry: 'linear',
      count: 11,
      minorCount: 3,
      rows: 4,
      columns: 4,
      placement: 'outside',
      generatedPartPrefix: name,
      generatedHitZones: true,
      hitZoneAction: 'setValue',
      detachable: true,
    });
    newName = '';
    selectedName = name;
  }

  function removeGenerator() {
    if (!core?.id || !selectedName) return;
    removeControlNode(core.id, `Generators.${selectedName}`);
    selectedName = '';
  }

  function detachGenerator() {
    if (!core?.id || !selectedName || selected?.detachable === false) return;
    const parts = extractDetachedGeneratedParts(control, selectedName);
    const hitZones = extractDetachedGeneratedHitZones(control, selectedName);
    const partEntries = Object.entries(parts);
    const zoneEntries = Object.entries(hitZones);
    if (!partEntries.length && !zoneEntries.length) return;

    const patch = partEntries.reduce((nextPatch, [partName, part]) => {
      nextPatch[`Parts.${partName}`] = part;
      return nextPatch;
    }, {
      [`Generators.${selectedName}.enabled`]: false,
    });
    for (const [zoneName, zone] of zoneEntries) {
      patch[`HitZones.${zoneName}`] = zone;
    }
    applyControlPatchesById(new Map([[core.id, patch]]));
  }
</script>

{#if generators}
  <PropertySection title="Generators">
    <PropertyCell label="Add" span={3} hint="Create rule-driven layers such as ticks, grids, piano keys, repeated LEDs, or segmented rings.">
      <input class="val" type="text" bind:value={newName} placeholder="generatorName" />
    </PropertyCell>
    <PropertyCell label="" span={1} hint="Add a generator.">
      <button class="action-btn" type="button" onclick={addGenerator}>Add</button>
    </PropertyCell>
    <PropertyCell label="Selected" span={3} hint="Choose which generator to edit.">
      <select class="val" bind:value={selectedName}>
        {#each names as name}
          <option value={name}>{name}</option>
        {/each}
      </select>
    </PropertyCell>
    <PropertyCell label="" span={1} hint="Remove the selected generator.">
      <button class="action-btn danger" type="button" onclick={removeGenerator} disabled={!selectedName}>Remove</button>
    </PropertyCell>
  </PropertySection>

  {#if selected}
    <PropertySection title="Generator Preview">
      <PropertyCell label="Preview" span={2} hint="Visual sketch of the selected generator family.">
        <div class={`generator-preview ${previewClass}`} class:disabled={selected?.enabled === false} style={`--preview-rows:${gridPreviewRows}; --preview-columns:${gridPreviewColumns};`}>
          <span class="preview-stage">
            {#each Array(16) as _, index}
              <span class="preview-node n{index}"></span>
            {/each}
          </span>
        </div>
      </PropertyCell>
      <PropertyCell label="Output" span={2} hint="Estimated output before materialization plus actual generated runtime output when available.">
        <div class="output-card">
          <strong>{TYPE_LABELS[selected.type ?? 'ticks'] ?? selected.type ?? 'Generator'}</strong>
          <span>{outputEstimate.label}</span>
          <div class="output-metrics">
            <em>{outputEstimate.parts} est parts</em>
            <em>{outputEstimate.zones} est zones</em>
            <em>{generatedPartEntries.length} live parts</em>
            <em>{generatedZoneEntries.length} live zones</em>
          </div>
        </div>
      </PropertyCell>
      <PropertyCell label="Detach Plan" span={4} hint="What will be converted to editable custom component structure when this generator is detached.">
        <div class="detach-plan">
          <span><strong>{generatedPartEntries.length}</strong><em>editable layers</em></span>
          <span><strong>{generatedZoneEntries.length}</strong><em>editable hit zones</em></span>
          <span><strong>{selected.detachable === false ? 'Off' : 'On'}</strong><em>detach allowed</em></span>
        </div>
      </PropertyCell>
      <PropertyCell label="Live Parts" span={2} hint="Runtime parts currently generated from this rule.">
        <div class="pill-list">
          {#each generatedPartEntries.slice(0, 12) as [name]}
            <span>{name}</span>
          {/each}
          {#if generatedPartEntries.length > 12}<em>+{generatedPartEntries.length - 12}</em>{/if}
          {#if generatedPartEntries.length === 0}<em>none</em>{/if}
        </div>
      </PropertyCell>
      <PropertyCell label="Live Zones" span={2} hint="Runtime hit zones currently generated from this rule.">
        <div class="pill-list">
          {#each generatedZoneEntries.slice(0, 12) as [name]}
            <span>{name}</span>
          {/each}
          {#if generatedZoneEntries.length > 12}<em>+{generatedZoneEntries.length - 12}</em>{/if}
          {#if generatedZoneEntries.length === 0}<em>none</em>{/if}
        </div>
      </PropertyCell>
    </PropertySection>

    <PropertySection title="Definition">
      <PropertyCell label="Enabled" span={1} hint="Enable this generator.">
        <PropertyToggle value={selected.enabled !== false} onchange={() => set('enabled', !(selected.enabled !== false))} />
      </PropertyCell>
      <PropertyCell label="Type" span={2} hint="Generator family.">
        <select class="val" value={selected.type ?? 'ticks'} onchange={(event) => set('type', event.target.value)}>
          {#each TYPES as type}
            <option value={type}>{TYPE_LABELS[type] ?? type}</option>
          {/each}
        </select>
      </PropertyCell>
      <PropertyCell label="Geometry" span={1} hint="Layout geometry for the generated structure.">
        <select class="val" value={selected.geometry ?? 'linear'} onchange={(event) => set('geometry', event.target.value)}>
          {#each GEOMETRIES as geometry}
            <option value={geometry}>{geometry}</option>
          {/each}
        </select>
      </PropertyCell>
      <PropertyCell label="Behavior" span={2} hint="Optional behavior module this generator follows.">
        <select class="val" value={selected.targetBehavior ?? ''} onchange={(event) => set('targetBehavior', event.target.value)}>
          <option value="">none</option>
          {#each behaviorNames as name}
            <option value={name}>{name}</option>
          {/each}
        </select>
      </PropertyCell>
      <PropertyCell label="Prefix" span={2} hint="Prefix used for generated part names.">
        <input class="val" type="text" value={selected.generatedPartPrefix ?? ''} onchange={(event) => set('generatedPartPrefix', event.target.value)} />
      </PropertyCell>
      <PropertyCell label="Value" span={2} hint="Value channel for generated hit zones.">
        <input class="val" type="text" value={selected.targetValueChannel ?? 'mainValue'} onchange={(event) => set('targetValueChannel', event.target.value)} />
      </PropertyCell>
      <PropertyCell label="Source" span={2} hint="Value source that drives generated visual output, for example mainValue or channel.mainValue.normalized.">
        <input class="val" type="text" value={selected.valueSource ?? selected.targetValueChannel ?? 'mainValue'} onchange={(event) => set('valueSource', event.target.value)} />
      </PropertyCell>
      <PropertyCell label="Y Value" span={2} hint="Optional second value channel for grid or XY-style generated hit zones.">
        <input class="val" type="text" value={selected.targetValueChannelY ?? ''} onchange={(event) => set('targetValueChannelY', event.target.value)} />
      </PropertyCell>
      <PropertyCell label="Action" span={2} hint="Interaction action used by generated hit zones.">
        <select class="val" value={selected.hitZoneAction ?? 'setValue'} onchange={(event) => set('hitZoneAction', event.target.value)}>
          <option value="setValue">setValue</option>
          <option value="cellValue">cellValue</option>
          <option value="noteValue">noteValue</option>
          <option value="dragValue">dragValue</option>
          <option value="cycleValue">cycleValue</option>
          <option value="toggleValue">toggleValue</option>
        </select>
      </PropertyCell>
    </PropertySection>

    <PropertySection title="Bounds">
      <PropertyCell label="Mode" span={2} hint="Most generators can be scoped to a rectangular percentage area inside the component.">
        <select class="val" value={selected.bounds?.unit ?? 'percent'} onchange={(event) => set('bounds.unit', event.target.value)}>
          <option value="percent">percent</option>
          <option value="px">px</option>
        </select>
      </PropertyCell>
      <PropertyCell label="Preset" span={2} hint="Quickly fill the whole component or leave a useful inset.">
        <div class="bounds-presets">
          <button type="button" onclick={() => setBoundsPreset('full')}>Full</button>
          <button type="button" onclick={() => setBoundsPreset('inset')}>Inset</button>
        </div>
      </PropertyCell>
      <PropertyCell label="X" span={1} hint="Left edge of the generated area.">
        <NumberInput value={selected.bounds?.x ?? 0} step={1} onchange={(value) => set('bounds.x', value)} />
      </PropertyCell>
      <PropertyCell label="Y" span={1} hint="Top edge of the generated area.">
        <NumberInput value={selected.bounds?.y ?? 0} step={1} onchange={(value) => set('bounds.y', value)} />
      </PropertyCell>
      <PropertyCell label="Width" span={1} hint="Generated area width.">
        <NumberInput value={selected.bounds?.width ?? 100} step={1} min={1} onchange={(value) => set('bounds.width', Math.max(1, value))} />
      </PropertyCell>
      <PropertyCell label="Height" span={1} hint="Generated area height.">
        <NumberInput value={selected.bounds?.height ?? 100} step={1} min={1} onchange={(value) => set('bounds.height', Math.max(1, value))} />
      </PropertyCell>
    </PropertySection>

    <PropertySection title="Rules">
      <PropertyCell label="Count" span={1} hint="Primary generated item count.">
        <NumberInput value={selected.count ?? 11} step={1} min={0} onchange={(value) => set('count', Math.max(0, Math.round(value)))} />
      </PropertyCell>
      <PropertyCell label="Minor" span={1} hint="Minor items between primary items, useful for ticks.">
        <NumberInput value={selected.minorCount ?? 0} step={1} min={0} onchange={(value) => set('minorCount', Math.max(0, Math.round(value)))} />
      </PropertyCell>
      <PropertyCell label="Rows" span={1} hint="Rows for grid-like generators.">
        <NumberInput value={selected.rows ?? 4} step={1} min={1} onchange={(value) => set('rows', Math.max(1, Math.round(value)))} />
      </PropertyCell>
      <PropertyCell label="Columns" span={1} hint="Columns for grid-like generators.">
        <NumberInput value={selected.columns ?? 4} step={1} min={1} onchange={(value) => set('columns', Math.max(1, Math.round(value)))} />
      </PropertyCell>
      <PropertyCell label="Base Note" span={1} hint="First MIDI note for piano key generators.">
        <NumberInput value={selected.baseNote ?? 60} step={1} min={0} max={127} onchange={(value) => set('baseNote', Math.max(0, Math.min(127, Math.round(value))))} />
      </PropertyCell>
      <PropertyCell label="Radius" span={1} hint="Circular generator radius as a percentage from the centre.">
        <NumberInput value={selected.radius ?? 38} step={1} min={0} max={80} onchange={(value) => set('radius', Math.max(0, Math.min(80, value)))} />
      </PropertyCell>
      <PropertyCell label="Start" span={1} hint="Circular generator start angle in degrees.">
        <NumberInput value={selected.startAngle ?? -135} step={1} min={-360} max={360} onchange={(value) => set('startAngle', Math.max(-360, Math.min(360, value)))} />
      </PropertyCell>
      <PropertyCell label="End" span={1} hint="Circular generator end angle in degrees.">
        <NumberInput value={selected.endAngle ?? 135} step={1} min={-360} max={360} onchange={(value) => set('endAngle', Math.max(-360, Math.min(360, value)))} />
      </PropertyCell>
      <PropertyCell label="LED Size" span={1} hint="Generated LED diameter in pixels.">
        <NumberInput value={selected.ledSize ?? selected.size ?? 9} step={1} min={1} max={48} onchange={(value) => set('ledSize', Math.max(1, Math.min(48, value)))} />
      </PropertyCell>
      <PropertyCell label="Active" span={1} hint="Colour used when an LED threshold is passed.">
        <input class="val" type="text" value={selected.activeColour ?? selected.colour ?? 'FF5B9BD5'} onchange={(event) => set('activeColour', event.target.value)} />
      </PropertyCell>
      <PropertyCell label="Inactive" span={1} hint="Colour used before an LED threshold is reached.">
        <input class="val" type="text" value={selected.inactiveColour ?? '332C3840'} onchange={(event) => set('inactiveColour', event.target.value)} />
      </PropertyCell>
      <PropertyCell label="Mode" span={1} hint="Cumulative lights every LED below the value; single lights only the nearest LED.">
        <select class="val" value={selected.activationMode ?? 'cumulative'} onchange={(event) => set('activationMode', event.target.value)}>
          <option value="cumulative">cumulative</option>
          <option value="single">single</option>
        </select>
      </PropertyCell>
      <PropertyCell label="Hit Zones" span={2} hint="Generate matching hit zones where useful.">
        <PropertyToggle value={selected.generatedHitZones === true} onchange={() => set('generatedHitZones', !(selected.generatedHitZones === true))} />
      </PropertyCell>
      <PropertyCell label="Detach" span={2} hint="Allow future detach-to-layers conversion.">
        <PropertyToggle value={selected.detachable !== false} onchange={() => set('detachable', !(selected.detachable !== false))} />
      </PropertyCell>
      <PropertyCell label="Commit" span={2} hint="Convert generated output into normal editable layers and disable this generator.">
        <button class="action-btn" type="button" onclick={detachGenerator} disabled={selected.detachable === false}>Detach output</button>
      </PropertyCell>
    </PropertySection>
  {/if}
{/if}

<style>
  .val { width: 100%; min-width: 0; background: #1A1A1A; border: 1px solid #333; border-radius: 3px; color: #DDD; font-size: 11px; padding: 4px 6px; font-family: inherit; outline: none; box-sizing: border-box; }
  .val:focus { border-color: #5B9BD5; }
  .bounds-presets {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 5px;
  }
  .bounds-presets button {
    min-height: 26px;
    border: 1px solid #34424D;
    border-radius: 4px;
    background: #22282D;
    color: #DDE6EC;
    cursor: pointer;
    font: inherit;
    font-size: 10px;
  }
  .bounds-presets button:hover {
    border-color: #5B9BD5;
    color: #FFF;
  }
  .generator-preview {
    position: relative;
    width: 100%;
    min-height: 112px;
    border: 1px solid #34424D;
    border-radius: 6px;
    background: #101418;
    overflow: hidden;
  }
  .generator-preview.disabled {
    opacity: 0.48;
  }
  .preview-stage,
  .preview-node {
    position: absolute;
    display: block;
  }
  .preview-stage {
    inset: 10px;
  }
  .preview-node {
    background: #5B9BD5;
    border: 1px solid rgba(255, 255, 255, 0.22);
  }
  .generator-preview.ticks .preview-stage::before,
  .generator-preview.grid .preview-stage::before,
  .generator-preview.scroll .preview-stage::before {
    content: '';
    position: absolute;
    inset: 0;
    border: 1px solid #34424D;
    border-radius: 4px;
  }
  .generator-preview.ticks .preview-stage::before {
    top: 52px;
    bottom: auto;
    height: 2px;
    border: 0;
    background: #34424D;
  }
  .generator-preview.ticks .preview-node {
    top: 34px;
    width: 2px;
    height: 28px;
    border: 0;
    background: #C9D5DD;
  }
  .generator-preview.ticks .n0 { left: 2%; height: 34px; top: 28px; }
  .generator-preview.ticks .n1 { left: 12%; }
  .generator-preview.ticks .n2 { left: 22%; }
  .generator-preview.ticks .n3 { left: 32%; height: 34px; top: 28px; }
  .generator-preview.ticks .n4 { left: 42%; }
  .generator-preview.ticks .n5 { left: 52%; }
  .generator-preview.ticks .n6 { left: 62%; height: 34px; top: 28px; }
  .generator-preview.ticks .n7 { left: 72%; }
  .generator-preview.ticks .n8 { left: 82%; }
  .generator-preview.ticks .n9 { left: 92%; height: 34px; top: 28px; }
  .generator-preview.grid .preview-stage::before,
  .generator-preview.scroll .preview-stage::before {
    background:
      repeating-linear-gradient(90deg, rgba(255,255,255,0.2) 0 1px, transparent 1px calc(100% / var(--preview-columns, 4))),
      repeating-linear-gradient(180deg, rgba(255,255,255,0.2) 0 1px, transparent 1px calc(100% / var(--preview-rows, 4))),
      #182029;
  }
  .generator-preview.grid .n0,
  .generator-preview.scroll .n0 {
    left: 58%;
    top: 28%;
    width: 18px;
    height: 18px;
    border-radius: 50%;
    background: #E5C06B;
  }
  .generator-preview.scroll .preview-stage::after {
    content: '';
    position: absolute;
    right: 4px;
    top: 8px;
    width: 5px;
    height: 52px;
    border-radius: 999px;
    background: #5B9BD5;
  }
  .generator-preview.piano .n0 {
    left: 4px;
    right: 4px;
    bottom: 2px;
    height: 52px;
    border: 0;
    background: repeating-linear-gradient(90deg, #EDEDE8 0 15px, #B8C0C7 15px 16px);
  }
  .generator-preview.piano .n1 {
    left: 22px;
    top: 8px;
    width: 9px;
    height: 42px;
    background: #111;
    box-shadow: 32px 0 #111, 48px 0 #111, 96px 0 #111, 112px 0 #111;
  }
  .generator-preview.ring .preview-node {
    left: 50%;
    top: 50%;
    width: 8px;
    height: 28px;
    border-radius: 999px;
    transform-origin: 4px 44px;
  }
  .generator-preview.ring .n0 { transform: translate(-50%, -44px) rotate(0deg); }
  .generator-preview.ring .n1 { transform: translate(-50%, -44px) rotate(30deg); }
  .generator-preview.ring .n2 { transform: translate(-50%, -44px) rotate(60deg); }
  .generator-preview.ring .n3 { transform: translate(-50%, -44px) rotate(90deg); }
  .generator-preview.ring .n4 { transform: translate(-50%, -44px) rotate(120deg); }
  .generator-preview.ring .n5 { transform: translate(-50%, -44px) rotate(150deg); }
  .generator-preview.ring .n6 { transform: translate(-50%, -44px) rotate(180deg); }
  .generator-preview.ring .n7 { transform: translate(-50%, -44px) rotate(210deg); }
  .generator-preview.ring .n8 { transform: translate(-50%, -44px) rotate(240deg); }
  .generator-preview.ring .n9 { transform: translate(-50%, -44px) rotate(270deg); }
  .generator-preview.ring .n10 { transform: translate(-50%, -44px) rotate(300deg); }
  .generator-preview.ring .n11 { transform: translate(-50%, -44px) rotate(330deg); }
  .generator-preview.buttons .preview-node,
  .generator-preview.leds .preview-node,
  .generator-preview.meter .preview-node {
    top: 34px;
    width: 18px;
    height: 18px;
    border-radius: 5px;
  }
  .generator-preview.leds .preview-node {
    border-radius: 50%;
    background: #70C08F;
    box-shadow: 0 0 10px rgba(112, 192, 143, 0.35);
  }
  .generator-preview.meter .preview-node {
    bottom: 12px;
    top: auto;
    width: 12px;
    border-radius: 3px 3px 0 0;
  }
  .generator-preview.buttons .n0,
  .generator-preview.leds .n0,
  .generator-preview.meter .n0 { left: 12%; height: 20px; }
  .generator-preview.buttons .n1,
  .generator-preview.leds .n1,
  .generator-preview.meter .n1 { left: 27%; height: 34px; }
  .generator-preview.buttons .n2,
  .generator-preview.leds .n2,
  .generator-preview.meter .n2 { left: 42%; height: 46px; }
  .generator-preview.buttons .n3,
  .generator-preview.leds .n3,
  .generator-preview.meter .n3 { left: 57%; height: 28px; }
  .generator-preview.buttons .n4,
  .generator-preview.leds .n4,
  .generator-preview.meter .n4 { left: 72%; height: 54px; }
  .generator-preview.filmstrip .n0 {
    left: calc(50% - 20px);
    top: 10px;
    width: 40px;
    height: 72px;
    border-radius: 5px;
    background: repeating-linear-gradient(180deg, #5B9BD5 0 8px, #192633 8px 14px);
  }
  .output-card {
    width: 100%;
    min-height: 112px;
    display: flex;
    flex-direction: column;
    gap: 6px;
    border: 1px solid #303A42;
    border-radius: 6px;
    background: #171C20;
    color: #C9D5DD;
    padding: 9px;
    box-sizing: border-box;
    font-size: 11px;
  }
  .output-card strong {
    color: #F4F7FA;
    font-size: 12px;
  }
  .output-card span {
    color: #9EADB7;
  }
  .detach-plan {
    width: 100%;
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 6px;
  }
  .detach-plan span {
    min-height: 44px;
    border: 1px solid #34424D;
    border-radius: 5px;
    background: #1A2228;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 3px;
  }
  .detach-plan strong {
    color: #F4F7FA;
    font-size: 13px;
  }
  .detach-plan em {
    color: #9FB0BC;
    font-size: 10px;
    font-style: normal;
  }
  .output-metrics {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 5px;
    margin-top: auto;
  }
  .output-metrics em {
    min-height: 24px;
    display: flex;
    align-items: center;
    justify-content: center;
    border: 1px solid #34424D;
    border-radius: 4px;
    background: #1C252C;
    color: #CDE1EE;
    font-size: 10px;
    font-style: normal;
  }
  .pill-list {
    width: 100%;
    min-height: 54px;
    max-height: 112px;
    display: flex;
    flex-wrap: wrap;
    align-content: flex-start;
    gap: 5px;
    overflow: auto;
  }
  .pill-list span,
  .pill-list em {
    border: 1px solid #34424D;
    background: #1C252C;
    color: #CDE1EE;
    border-radius: 5px;
    padding: 3px 6px;
    font-size: 9px;
    font-style: normal;
  }
  .pill-list em {
    color: #777;
    background: #1A1A1A;
  }
  .action-btn { width: 100%; background: #252525; border: 1px solid #3B3B3B; border-radius: 3px; color: #DDD; font-size: 11px; padding: 4px 8px; cursor: pointer; font-family: inherit; }
  .action-btn:hover:not(:disabled) { border-color: #5B9BD5; color: #FFF; }
  .action-btn.danger:hover:not(:disabled) { border-color: #D56B6B; }
  .action-btn:disabled { opacity: 0.4; cursor: default; }
</style>
