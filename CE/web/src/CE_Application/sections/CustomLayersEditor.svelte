<script>
  import { applyControlPatchesById, getSection, updateControlProperty, removeControlNode } from '../stores/controls.js';
  import PropertyCell from '../properties/PropertyCell.svelte';
  import PropertySection from '../properties/PropertySection.svelte';
  import PropertyToggle from '../properties/PropertyToggle.svelte';
  import NumberInput from './NumberInput.svelte';
  import {
    createBackground,
    createPartNode,
    createText,
  } from '../utils/customComponentFactory.js';

  let { control = null } = $props();

  let core = $derived(getSection(control, 'Core'));
  let designer = $derived(getSection(control, 'Designer'));
  let parts = $derived(getSection(control, 'Parts'));
  let partEntries = $derived(
    Object.entries(parts?._children ?? {})
      .sort((left, right) => Number(left?.[1]?.zIndex ?? 0) - Number(right?.[1]?.zIndex ?? 0))
  );
  let sourceEntries = $derived(buildSourceEntries(partEntries));
  let partNames = $derived(partEntries.map(([name]) => name));
  let generatedPartCount = $derived(partEntries.filter(([, part]) => part?.generated === true || part?.meta?.generated === true).length);
  let detachedPartCount = $derived(partEntries.filter(([, part]) => part?.detachedFromGenerator || part?.meta?.detachedFromGenerator).length);
  let hiddenPartCount = $derived(partEntries.filter(([, part]) => part?.visible === false).length);
  let selectedName = $derived(
    partNames.includes(designer?.selectedLayer)
      ? designer.selectedLayer
      : (partNames[0] ?? '')
  );
  let selected = $derived(parts?._children?.[selectedName] ?? null);
  let layout = $derived(selected?._children?.Layout ?? null);
  let background = $derived(selected?._children?.Background ?? null);
  let text = $derived(selected?._children?.Text ?? null);
  let newName = $state('');

  const KIND_OPTIONS = [
    'rectangle',
    'roundedRectangle',
    'capsule',
    'circle',
    'ellipse',
    'ring',
    'arcTrack',
    'ringArc',
    'line',
    'arc',
    'pointer',
    'text',
    'image',
    'filmstrip',
    'viewport',
    'group',
  ];
  const UNIT_OPTIONS = ['px', 'percent'];
  const ANCHOR_X_OPTIONS = ['left', 'center', 'right'];
  const ANCHOR_Y_OPTIONS = ['top', 'center', 'bottom'];

  function set(path, value) {
    if (!core?.id || !selectedName) return;
    updateControlProperty(core.id, `Parts.${selectedName}.${path}`, value);
  }

  function setSelected(name) {
    if (!core?.id || !name) return;
    updateControlProperty(core.id, 'Designer.selectedLayer', name);
  }

  function nextPartName(base) {
    const safeBase = String(base || 'layer').replace(/[^a-zA-Z0-9_]/g, '') || 'layer';
    let name = safeBase;
    let index = 1;
    const existing = new Set(partNames);
    while (existing.has(name)) {
      index += 1;
      name = `${safeBase}_${index}`;
    }
    return name;
  }

  function addLayer(kind = 'roundedRectangle') {
    if (!core?.id) return;
    const name = nextPartName(newName || kind);
    const isCircularOutline = ['ring', 'arcTrack'].includes(kind);
    const sections = kind === 'text'
      ? { Text: createText('Text') }
      : { Background: createBackground(isCircularOutline ? '005B9BD5' : 'FF5B9BD5', {
        borderEnabled: true,
        borderColour: isCircularOutline ? 'FF5B9BD5' : '55FFFFFF',
        borderThickness: isCircularOutline ? 4 : 1,
        radius: ['circle', 'ellipse', 'ring', 'arcTrack', 'capsule'].includes(kind) ? 999 : 8,
      }) };
    const part = createPartNode(name, {
      kind,
      role: kind,
      zIndex: partNames.length,
      layout: {
        x: 50,
        y: 50,
        width: ['circle', 'ring', 'arcTrack'].includes(kind) ? 44 : 96,
        height: ['circle', 'ring', 'arcTrack'].includes(kind) ? 44 : 32,
        widthUnit: 'px',
        heightUnit: 'px',
      },
      sections,
      meta: kind === 'arcTrack'
        ? {
          renderer: 'arcTrack',
          arcTrack: {
            startAngle: -135,
            sweepAngle: 270,
            direction: 'cw',
            thickness: 4,
            colour: 'FF5B9BD5',
          },
        }
        : {},
    });
    updateControlProperty(core.id, `Parts.${name}`, part);
    updateControlProperty(core.id, 'Designer.selectedLayer', name);
    newName = '';
  }

  function duplicateLayer() {
    if (!core?.id || !selected) return;
    const name = nextPartName(`${selectedName}_copy`);
    const clone = JSON.parse(JSON.stringify(selected));
    clone.name = name;
    clone.zIndex = partNames.length;
    if (clone._children?.Layout) {
      clone._children.Layout.offsetX = Number(clone._children.Layout.offsetX ?? 0) + 8;
      clone._children.Layout.offsetY = Number(clone._children.Layout.offsetY ?? 0) + 8;
    }
    updateControlProperty(core.id, `Parts.${name}`, clone);
    updateControlProperty(core.id, 'Designer.selectedLayer', name);
  }

  function removeLayer() {
    if (!core?.id || !selectedName) return;
    removeControlNode(core.id, `Parts.${selectedName}`);
    const next = partNames.find((name) => name !== selectedName) ?? '';
    updateControlProperty(core.id, 'Designer.selectedLayer', next);
  }

  function moveZ(delta) {
    if (!core?.id || !selected) return;
    set('zIndex', Number(selected.zIndex ?? 0) + delta);
  }

  function partSource(part) {
    const detached = part?.detachedFromGenerator || part?.meta?.detachedFromGenerator;
    if (detached) return { id: `detached:${detached}`, label: detached, kind: 'detached' };
    const generated = part?.meta?.generatedBy;
    if (part?.generated === true || part?.meta?.generated === true || generated) {
      return { id: `generated:${generated || 'generator'}`, label: generated || 'generator', kind: 'generated' };
    }
    return { id: 'manual', label: 'Manual', kind: 'manual' };
  }

  function partSourceText(part) {
    const source = partSource(part);
    if (source.kind === 'detached') return `detached · ${source.label}`;
    if (source.kind === 'generated') return `generated · ${source.label}`;
    return 'manual';
  }

  function buildSourceEntries(entries = []) {
    const buckets = new Map();
    for (const [name, part] of entries) {
      const source = partSource(part);
      const current = buckets.get(source.id) ?? {
        ...source,
        count: 0,
        visible: 0,
        hidden: 0,
        names: [],
      };
      current.count += 1;
      if (part?.visible === false) current.hidden += 1;
      else current.visible += 1;
      current.names.push(name);
      buckets.set(source.id, current);
    }
    return [...buckets.values()].sort((left, right) => {
      const order = { detached: 0, generated: 1, manual: 2 };
      return (order[left.kind] ?? 9) - (order[right.kind] ?? 9)
        || String(left.label).localeCompare(String(right.label));
    });
  }

  function setSourceVisibility(source, visible) {
    if (!core?.id || !source?.names?.length) return;
    const patch = Object.fromEntries(
      source.names.map((name) => [`Parts.${name}.visible`, visible])
    );
    applyControlPatchesById(new Map([[core.id, patch]]));
  }

  function selectSource(source) {
    if (!source?.names?.length) return;
    setSelected(source.names[0]);
  }
</script>

{#if parts}
  <PropertySection title="Layer Stack">
    <PropertyCell label="Summary" span={4} hint="Layer source breakdown, including generated and detached output.">
      <div class="layer-summary">
        <span><strong>{partEntries.length}</strong><em>layers</em></span>
        <span><strong>{generatedPartCount}</strong><em>generated</em></span>
        <span><strong>{detachedPartCount}</strong><em>detached</em></span>
        <span><strong>{hiddenPartCount}</strong><em>hidden</em></span>
      </div>
    </PropertyCell>
    {#if sourceEntries.length > 1 || detachedPartCount || generatedPartCount}
      <PropertyCell label="Sources" span={4} hint="Manage generated or detached layer groups without hunting through the stack.">
        <div class="source-list">
          {#each sourceEntries as source (source.id)}
            <button
              class={`source-card ${source.kind}`}
              type="button"
              onclick={() => selectSource(source)}
            >
              <strong>{source.label}</strong>
              <em>{source.kind}</em>
              <small>{source.count} layer{source.count === 1 ? '' : 's'} · {source.visible} shown</small>
            </button>
            <button class="source-action" type="button" onclick={() => setSourceVisibility(source, false)} disabled={source.visible === 0}>Hide</button>
            <button class="source-action" type="button" onclick={() => setSourceVisibility(source, true)} disabled={source.hidden === 0}>Show</button>
          {/each}
        </div>
      </PropertyCell>
    {/if}
    <PropertyCell label="Add Name" span={2} hint="Optional name for the next layer.">
      <input class="val" type="text" bind:value={newName} placeholder="layerName" />
    </PropertyCell>
    <PropertyCell label="Add Shape" span={2} hint="Create a new layer/part.">
      <select class="val" onchange={(event) => addLayer(event.target.value)}>
        <option value="">add...</option>
        {#each KIND_OPTIONS as kind}
          <option value={kind}>{kind}</option>
        {/each}
      </select>
    </PropertyCell>
    <PropertyCell label="Layers" span={4} hint="Select a layer to edit.">
      <div class="layer-list">
        {#each partEntries as [name, part] (name)}
          <button
            class:selected={selectedName === name}
            type="button"
            onclick={() => setSelected(name)}
          >
            <span class="layer-eye">{part.visible === false ? '-' : 'o'}</span>
            <strong>{name}</strong>
            <em>{part.kind ?? part.role ?? 'part'} · {partSourceText(part)}</em>
            <small>{part.zIndex ?? 0}</small>
          </button>
        {/each}
      </div>
    </PropertyCell>
  </PropertySection>

  {#if selected}
    <PropertySection title="Layer">
      <PropertyCell label="Visible" span={1} hint="Show or hide this layer.">
        <PropertyToggle value={selected.visible !== false} onchange={() => set('visible', !(selected.visible !== false))} />
      </PropertyCell>
      <PropertyCell label="Clip" span={1} hint="Clip child visuals inside this layer bounds.">
        <PropertyToggle value={selected.clipChildren === true} onchange={() => set('clipChildren', !(selected.clipChildren === true))} />
      </PropertyCell>
      <PropertyCell label="Kind" span={2} hint="Visual kind used by designer recipes and future specialized rendering.">
        <select class="val" value={selected.kind ?? 'rectangle'} onchange={(event) => set('kind', event.target.value)}>
          {#each KIND_OPTIONS as kind}
            <option value={kind}>{kind}</option>
          {/each}
        </select>
      </PropertyCell>
      <PropertyCell label="Role" span={2} hint="Semantic role such as background, track, handle, label, ring, viewport.">
        <input class="val" type="text" value={selected.role ?? ''} onchange={(event) => set('role', event.target.value)} />
      </PropertyCell>
      <PropertyCell label="Opacity" span={1} hint="Layer opacity.">
        <NumberInput value={selected.opacity ?? 1} step={0.01} min={0} max={1} onchange={(value) => set('opacity', value)} />
      </PropertyCell>
      <PropertyCell label="Z" span={1} hint="Layer order. Higher values render later.">
        <NumberInput value={selected.zIndex ?? 0} step={1} onchange={(value) => set('zIndex', Math.round(value))} />
      </PropertyCell>
      <PropertyCell label="Actions" span={4} hint="Duplicate, remove, or nudge layer order.">
        <div class="action-row">
          <button class="action-btn" type="button" onclick={duplicateLayer}>Duplicate</button>
          <button class="action-btn" type="button" onclick={() => moveZ(-1)}>Back</button>
          <button class="action-btn" type="button" onclick={() => moveZ(1)}>Front</button>
          <button class="action-btn danger" type="button" onclick={removeLayer}>Remove</button>
        </div>
      </PropertyCell>
      <PropertyCell label="Source" span={4} hint="Where this layer came from. Detached/generated layers are now normal editable layers, but keep their origin.">
        <div class={`source-detail ${partSource(selected).kind}`}>
          <strong>{partSourceText(selected)}</strong>
          <span>{selected.generated === true || selected.meta?.generated === true ? 'Runtime generated layer' : 'Editable layer'}</span>
        </div>
      </PropertyCell>
    </PropertySection>

    {#if layout}
      <PropertySection title="Layout">
        <PropertyCell label="X" span={1} hint="Layer X position.">
          <NumberInput value={layout.x ?? 0} step={1} onchange={(value) => set('Layout.x', value)} />
        </PropertyCell>
        <PropertyCell label="Y" span={1} hint="Layer Y position.">
          <NumberInput value={layout.y ?? 0} step={1} onchange={(value) => set('Layout.y', value)} />
        </PropertyCell>
        <PropertyCell label="W" span={1} hint="Layer width.">
          <NumberInput value={layout.width ?? 0} step={1} min={0} onchange={(value) => set('Layout.width', value)} />
        </PropertyCell>
        <PropertyCell label="H" span={1} hint="Layer height.">
          <NumberInput value={layout.height ?? 0} step={1} min={0} onchange={(value) => set('Layout.height', value)} />
        </PropertyCell>
        <PropertyCell label="X Unit" span={1} hint="X position unit.">
          <select class="val" value={layout.xUnit ?? 'percent'} onchange={(event) => set('Layout.xUnit', event.target.value)}>
            {#each UNIT_OPTIONS as unit}<option value={unit}>{unit}</option>{/each}
          </select>
        </PropertyCell>
        <PropertyCell label="Y Unit" span={1} hint="Y position unit.">
          <select class="val" value={layout.yUnit ?? 'percent'} onchange={(event) => set('Layout.yUnit', event.target.value)}>
            {#each UNIT_OPTIONS as unit}<option value={unit}>{unit}</option>{/each}
          </select>
        </PropertyCell>
        <PropertyCell label="W Unit" span={1} hint="Width unit.">
          <select class="val" value={layout.widthUnit ?? 'px'} onchange={(event) => set('Layout.widthUnit', event.target.value)}>
            {#each UNIT_OPTIONS as unit}<option value={unit}>{unit}</option>{/each}
          </select>
        </PropertyCell>
        <PropertyCell label="H Unit" span={1} hint="Height unit.">
          <select class="val" value={layout.heightUnit ?? 'px'} onchange={(event) => set('Layout.heightUnit', event.target.value)}>
            {#each UNIT_OPTIONS as unit}<option value={unit}>{unit}</option>{/each}
          </select>
        </PropertyCell>
        <PropertyCell label="Anchor X" span={1} hint="Horizontal anchor point.">
          <select class="val" value={layout.anchorX ?? 'center'} onchange={(event) => set('Layout.anchorX', event.target.value)}>
            {#each ANCHOR_X_OPTIONS as anchor}<option value={anchor}>{anchor}</option>{/each}
          </select>
        </PropertyCell>
        <PropertyCell label="Anchor Y" span={1} hint="Vertical anchor point.">
          <select class="val" value={layout.anchorY ?? 'center'} onchange={(event) => set('Layout.anchorY', event.target.value)}>
            {#each ANCHOR_Y_OPTIONS as anchor}<option value={anchor}>{anchor}</option>{/each}
          </select>
        </PropertyCell>
        <PropertyCell label="Rotate" span={1} hint="Layer rotation in degrees.">
          <NumberInput value={layout.rotation ?? 0} step={1} onchange={(value) => set('Layout.rotation', value)} />
        </PropertyCell>
        <PropertyCell label="Scale" span={1} hint="Layer scale.">
          <NumberInput value={layout.scale ?? 1} step={0.01} min={0.01} onchange={(value) => set('Layout.scale', value)} />
        </PropertyCell>
      </PropertySection>
    {/if}

    {#if background}
      <PropertySection title="Quick Fill">
        <PropertyCell label="Fill" span={2} hint="ARGB fill colour for the layer.">
          <input class="val mono" type="text" value={background._children?.Fill?.colour ?? ''} onchange={(event) => set('Background.Fill.colour', event.target.value)} />
        </PropertyCell>
        <PropertyCell label="Border" span={1} hint="Enable layer border.">
          <PropertyToggle value={background._children?.Border?.enabled !== false} onchange={() => set('Background.Border.enabled', !(background._children?.Border?.enabled !== false))} />
        </PropertyCell>
        <PropertyCell label="Radius" span={1} hint="Corner radius.">
          <NumberInput value={background._children?.Corners?.radius ?? 0} step={1} min={0} onchange={(value) => set('Background.Corners.radius', value)} />
        </PropertyCell>
      </PropertySection>
    {/if}

    {#if text}
      <PropertySection title="Quick Text">
        <PropertyCell label="Text" span={4} hint="Layer text content.">
          <input class="val" type="text" value={text.content ?? ''} onchange={(event) => set('Text.content', event.target.value)} />
        </PropertyCell>
        <PropertyCell label="Colour" span={2} hint="ARGB text colour.">
          <input class="val mono" type="text" value={text._children?.Fill?.colour ?? ''} onchange={(event) => set('Text.Fill.colour', event.target.value)} />
        </PropertyCell>
        <PropertyCell label="Size" span={1} hint="Font size.">
          <NumberInput value={text._children?.Font?.size ?? 12} step={1} min={1} onchange={(value) => set('Text.Font.size', value)} />
        </PropertyCell>
        <PropertyCell label="Weight" span={1} hint="Font weight.">
          <NumberInput value={text._children?.Font?.weightValue ?? 600} step={100} min={100} max={900} onchange={(value) => set('Text.Font.weightValue', value)} />
        </PropertyCell>
      </PropertySection>
    {/if}
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
  .val.mono {
    font-family: Consolas, 'Courier New', monospace;
  }
  .val:focus { border-color: #5B9BD5; }
  .layer-summary {
    width: 100%;
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 6px;
  }
  .layer-summary span {
    min-height: 42px;
    border: 1px solid #34424D;
    border-radius: 5px;
    background: #1A2228;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 3px;
  }
  .layer-summary strong {
    color: #F4F7FA;
    font-size: 13px;
  }
  .layer-summary em {
    color: #9FB0BC;
    font-size: 10px;
    font-style: normal;
  }
  .source-list {
    width: 100%;
    display: grid;
    grid-template-columns: minmax(0, 1fr) 52px 52px;
    gap: 5px;
    max-height: 128px;
    overflow: auto;
  }
  .source-card,
  .source-action {
    border: 1px solid #343D45;
    border-radius: 5px;
    background: #1B2025;
    color: #DDE6EC;
    font-family: inherit;
    cursor: pointer;
  }
  .source-card {
    min-width: 0;
    min-height: 42px;
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 2px 6px;
    align-items: center;
    text-align: left;
    padding: 6px 8px;
  }
  .source-card:hover,
  .source-action:hover:not(:disabled) {
    border-color: #5B9BD5;
  }
  .source-card.detached {
    border-color: #695837;
    background: #211E16;
  }
  .source-card.generated {
    border-color: #335B42;
    background: #16221B;
  }
  .source-card strong,
  .source-card small {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .source-card strong {
    color: #F4F7FA;
    font-size: 11px;
  }
  .source-card em {
    color: #7FAFCE;
    font-size: 9px;
    font-style: normal;
  }
  .source-card small {
    grid-column: 1 / 3;
    color: #9FB0BC;
    font-size: 10px;
  }
  .source-action {
    min-height: 42px;
    font-size: 10px;
  }
  .source-action:disabled {
    opacity: 0.42;
    cursor: default;
  }
  .layer-list {
    display: flex;
    flex-direction: column;
    gap: 4px;
    width: 100%;
    max-height: 180px;
    overflow: auto;
  }
  .layer-list button {
    display: grid;
    grid-template-columns: 18px minmax(0, 0.9fr) minmax(64px, 1.1fr) 28px;
    gap: 6px;
    align-items: center;
    min-height: 28px;
    border: 1px solid #333;
    border-radius: 4px;
    background: #1B1B1B;
    color: #DDD;
    cursor: pointer;
    font-family: inherit;
    font-size: 11px;
    text-align: left;
  }
  .layer-list button.selected,
  .layer-list button:hover {
    border-color: #5B9BD5;
    background: #172838;
  }
  .layer-list strong {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .layer-list em {
    color: #8EA3B2;
    font-style: normal;
    font-size: 10px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .layer-list small {
    color: #6FA8D8;
    text-align: right;
  }
  .layer-eye {
    color: #E5A029;
    text-align: center;
    font-size: 10px;
  }
  .action-row {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 6px;
    width: 100%;
  }
  .source-detail {
    width: 100%;
    min-height: 38px;
    border: 1px solid #34424D;
    border-radius: 5px;
    background: #1A2228;
    color: #CDE1EE;
    display: flex;
    flex-direction: column;
    justify-content: center;
    gap: 3px;
    padding: 6px 8px;
    box-sizing: border-box;
  }
  .source-detail.detached {
    border-color: #695837;
    background: #211E16;
  }
  .source-detail.generated {
    border-color: #335B42;
    background: #16221B;
  }
  .source-detail strong,
  .source-detail span {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .source-detail strong {
    color: #F4F7FA;
    font-size: 11px;
  }
  .source-detail span {
    color: #9FB0BC;
    font-size: 10px;
  }
  .action-btn {
    min-height: 28px;
    background: #252525;
    border: 1px solid #3B3B3B;
    border-radius: 3px;
    color: #DDD;
    font-size: 11px;
    cursor: pointer;
    font-family: inherit;
  }
  .action-btn:hover {
    border-color: #5B9BD5;
    color: #FFF;
  }
  .action-btn.danger:hover {
    border-color: #D56B6B;
  }
</style>
