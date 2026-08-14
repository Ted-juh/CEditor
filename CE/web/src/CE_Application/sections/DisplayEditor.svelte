<script>
  import { controlSources } from '../utils/controlSources.js';
  import { getSection, updateControlProperty } from '../stores/controls.js';
  import { activePanel } from '../stores/panels.js';
  import { LCD_PALETTES } from '../editor/LcdDisplayRenderer.svelte';
  import { ZONE_SHOW_KINDS, WIDGET_ZONE_KINDS, isActiveSource, activeFilterOf } from '../utils/lcdZones.js';
  import { aarrggbbToHex, mergeHexKeepAlpha } from '../utils/colourHex.js';
  import { SECTION_DEFAULTS } from '../models/sectionDefaults.js';
  import { setLcdDesignLayout } from '../stores/lcdDesignLayout.js';
  // Reset only appearance (never content: layouts/zones/text/sources).
  const APPEARANCE_KEYS = ['litColour', 'unlitColour', 'screenColour', 'backlightColour', 'glassTint',
    'backlightOn', 'brightness', 'contrast', 'showGhost'];
  function resetAppearance() {
    const d = SECTION_DEFAULTS.Display ?? {};
    for (const k of APPEARANCE_KEYS) if (k in d) set(k, d[k]);
  }
  import PropertyCell from '../properties/PropertyCell.svelte';
  import PropertySection from '../properties/PropertySection.svelte';
  import PropertyToggle from '../properties/PropertyToggle.svelte';
  import PropertyScrub from '../properties/PropertyScrub.svelte';
  import NumberInput from './NumberInput.svelte';

  let { control = null } = $props();

  let editLayoutId = $state('');

  let core = $derived(getSection(control, 'Core'));
  let display = $derived(getSection(control, 'Display'));
  let rows = $derived(Math.max(1, Math.round(Number(display?.rows ?? 2))));
  let lines = $derived(Array.isArray(display?.lines) ? display.lines : []);
  let paletteEntries = $derived(Object.entries(LCD_PALETTES));

  // Any control on the panel (for zone/page linking — buttons, comboboxes, etc.).
  let allSources = $derived(
    controlSources($activePanel?.controls, 'any', core?.id)
  );

  // Value-producing controls on the panel (slider / knob / range / number) that
  // can drive this display's value.
  let valueSources = $derived(
    controlSources($activePanel?.controls, 'range', core?.id)
  );

  function set(prop, value) {
    if (!core?.id) return;
    updateControlProperty(core.id, `Display.${prop}`, value);
  }

  // On picking a source, adopt its value range so pct/bar tokens scale correctly.
  function setValueSource(id) {
    set('valueSourceId', id);
    if (!id) return;
    const src = ($activePanel?.controls ?? []).find((c) => String(c?._children?.Core?.id ?? '') === id);
    const b = src?._children?.Behavior;
    if (b) {
      if (Number.isFinite(Number(b.min))) set('valueMin', Number(b.min));
      if (Number.isFinite(Number(b.max))) set('valueMax', Number(b.max));
    }
  }

  // --- Extra value fields (addressed as v2/p2/b2, v3/...) ---
  let extraFields = $derived(Array.isArray(display?.fields) ? display.fields : []);

  function addField() {
    set('fields', [...extraFields, { sourceId: '', value: 0, min: 0, max: 127, precision: 0, prefix: '', suffix: '' }]);
  }
  function removeField(index) {
    const next = [...extraFields];
    next.splice(index, 1);
    set('fields', next);
  }
  function setField(index, prop, value) {
    if (!core?.id) return;
    updateControlProperty(core.id, `Display.fields.${index}.${prop}`, value);
  }
  function setFieldSource(index, id) {
    setField(index, 'sourceId', id);
    if (!id) return;
    const src = ($activePanel?.controls ?? []).find((c) => String(c?._children?.Core?.id ?? '') === id);
    const b = src?._children?.Behavior;
    if (b) {
      if (Number.isFinite(Number(b.min))) setField(index, 'min', Number(b.min));
      if (Number.isFinite(Number(b.max))) setField(index, 'max', Number(b.max));
    }
  }

  function toggle(prop, defaultOn = true) {
    const current = display?.[prop];
    const isOn = current === undefined ? defaultOn : current !== false;
    set(prop, !isOn);
  }

  // Applying a palette writes its colours into the Display section; individual
  // colours stay editable afterwards.
  function applyPalette(id) {
    const p = LCD_PALETTES[id];
    if (!p) return;
    set('palette', id);
    set('litColour', p.lit);
    set('unlitColour', p.unlit);
    set('screenColour', p.screen);
    set('backlightColour', p.backlight);
  }

  function setLine(index, value) {
    set(`lines.${index}`, String(value ?? ''));
  }

  function onPickImage(event) {
    const file = event?.target?.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => set('imageSrc', String(reader.result ?? ''));
    reader.readAsDataURL(file);
  }

  function onPickAnim(event) {
    const file = event?.target?.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => set('animSrc', String(reader.result ?? ''));
    reader.readAsDataURL(file);
  }

  // --- Zones / layouts / pages ---
  let layouts = $derived(Array.isArray(display?.layouts) ? display.layouts : []);
  // The layout the zone table edits; the canvas mirrors it via the transient
  // design-layout store (set in selectEditLayout), so edit and preview agree.
  let editLayout = $derived(
    layouts.find((l) => String(l?.id) === String(editLayoutId))
    ?? layouts[0] ?? null
  );
  let pages = $derived(display?.pages ?? {});
  // Known values of the Pages selector control, so the "When" field can be a
  // pick-list instead of a guessing game. null = free numeric/text entry.
  let selectorOptions = $derived.by(() => {
    const src = ($activePanel?.controls ?? [])
      .find((c) => String(c?._children?.Core?.id ?? '') === String(pages?.selectorSourceId ?? ''));
    if (!src) return null;
    const b = src._children?.Behavior ?? {};
    const bt = String(b.buttonType ?? '').trim().toLowerCase();
    if (bt === 'combobox' || bt === 'radio' || bt === 'cyclic') {
      const rows = Array.isArray(src._children?.Value?.rows) ? src._children.Value.rows : [];
      const opts = rows.filter((r) => r?.enabled !== false)
        .map((r) => ({ value: String(r.internalValue ?? r.id ?? ''), label: String(r.displayText ?? r.internalValue ?? r.id ?? '') }));
      if (opts.length) return opts;
    }
    if (String(b.family ?? '') === 'select' || String(b.valueType ?? '') === 'bool' || String(b.family ?? '') === 'trigger') {
      return [{ value: '0', label: '0 (Off)' }, { value: '1', label: '1 (On)' }];
    }
    return null;
  });
  let cols = $derived(Math.max(1, Math.round(Number(display?.cols ?? 16))));

  function genId(prefix) {
    return `${prefix}${Math.random().toString(36).slice(2, 8)}${Date.now().toString(36).slice(-3)}`;
  }
  function commitLayouts(next) { set('layouts', next); }
  function cloneLayouts() { return $state.snapshot(layouts); }
  function commitPages(next) { set('pages', next); }
  function clonePages() { return $state.snapshot(pages ?? {}); }

  // Select which layout the zone table edits, and preview it on the canvas via
  // the transient design-layout store (view state only — never saved).
  function selectEditLayout(id) {
    editLayoutId = id;
    setLcdDesignLayout(core?.id, id);
  }
  function addLayout() {
    const next = cloneLayouts();
    const id = genId('lay_');
    next.push({ id, name: `Layout ${next.length + 1}`, zones: [] });
    commitLayouts(next);
    editLayoutId = id;
    setLcdDesignLayout(core?.id, id);
    if (next.length === 1) {
      const p = clonePages();
      p.defaultLayoutId = id;
      commitPages(p);
    }
  }
  function removeLayout(id) {
    commitLayouts(cloneLayouts().filter((l) => String(l.id) !== String(id)));
  }
  function duplicateLayout(id) {
    const next = cloneLayouts();
    const src = next.find((x) => String(x.id) === String(id));
    if (!src) return;
    const copy = $state.snapshot(src);
    copy.id = genId('lay_');
    copy.name = `${src.name ?? 'Layout'} copy`;
    for (const z of (Array.isArray(copy.zones) ? copy.zones : [])) z.id = genId('z_');
    next.splice(next.indexOf(src) + 1, 0, copy);
    commitLayouts(next);
    editLayoutId = copy.id;
    setLcdDesignLayout(core?.id, copy.id);
  }
  function renameLayout(id, name) {
    const next = cloneLayouts();
    const l = next.find((x) => String(x.id) === String(id));
    if (l) { l.name = String(name ?? ''); commitLayouts(next); }
  }
  function withEditLayout(mutate) {
    if (!editLayout) return;
    const next = cloneLayouts();
    const l = next.find((x) => String(x.id) === String(editLayout.id));
    if (!l) return;
    l.zones = Array.isArray(l.zones) ? l.zones : [];
    mutate(l);
    commitLayouts(next);
  }
  function addZone() {
    withEditLayout((l) => l.zones.push({
      id: genId('z_'), row: 1, colStart: 1, colEnd: Math.min(cols, 8),
      show: 'static', sourceId: '', text: 'TEXT', align: 'left', radix: 'dec',
    }));
  }
  function removeZone(i) { withEditLayout((l) => l.zones.splice(i, 1)); }
  function duplicateZone(i) {
    withEditLayout((l) => {
      const src = l.zones[i];
      if (!src) return;
      const copy = $state.snapshot(src);
      copy.id = genId('z_');
      l.zones.splice(i + 1, 0, copy);
    });
  }
  // Reorder zones: later zones paint over earlier ones, so ▲▼ controls stacking.
  function moveZone(i, dir) {
    withEditLayout((l) => {
      const j = i + dir;
      if (j < 0 || j >= l.zones.length) return;
      const [moved] = l.zones.splice(i, 1);
      l.zones.splice(j, 0, moved);
    });
  }
  // Which zone's extra settings (prefix/suffix/…) are expanded ('' = none).
  let expandedZoneId = $state('');
  function toggleZoneExtras(key) { expandedZoneId = expandedZoneId === key ? '' : key; }
  function setZone(i, prop, value) { withEditLayout((l) => { if (l.zones[i]) l.zones[i][prop] = value; }); }
  // The Source dropdown value: any "@active#kind" collapses to "@active".
  function zoneSourceValue(z) { return isActiveSource(z?.sourceId) ? '@active' : (z?.sourceId ?? ''); }
  // Set the "@active" kind filter (''=any) by rewriting the compound source id.
  function setZoneActiveKind(i, kind) { setZone(i, 'sourceId', kind ? `@active#${kind}` : '@active'); }

  function setPageProp(prop, value) {
    const p = clonePages();
    p[prop] = value;
    commitPages(p);
  }
  function addSelectorRow() {
    const p = clonePages();
    p.selectorMap = Array.isArray(p.selectorMap) ? p.selectorMap : [];
    p.selectorMap.push({ when: '', layoutId: editLayout?.id ?? '' });
    commitPages(p);
  }
  function setSelectorRow(i, prop, value) {
    const p = clonePages();
    if (Array.isArray(p.selectorMap) && p.selectorMap[i]) { p.selectorMap[i][prop] = value; commitPages(p); }
  }
  function removeSelectorRow(i) {
    const p = clonePages();
    if (Array.isArray(p.selectorMap)) { p.selectorMap.splice(i, 1); commitPages(p); }
  }
  function addOverlay() {
    const p = clonePages();
    p.overlays = Array.isArray(p.overlays) ? p.overlays : [];
    p.overlays.push({ id: genId('ov_'), layoutId: editLayout?.id ?? '', sourceId: '', duration: 800, dismiss: 'timer' });
    commitPages(p);
  }
  function setOverlay(i, prop, value) {
    const p = clonePages();
    if (Array.isArray(p.overlays) && p.overlays[i]) { p.overlays[i][prop] = value; commitPages(p); }
  }
  function removeOverlay(i) {
    const p = clonePages();
    if (Array.isArray(p.overlays)) { p.overlays.splice(i, 1); commitPages(p); }
  }

  // Which controls count as "@active" (empty = any control).
  let activeScope = $derived(Array.isArray(display?.activeScope) ? display.activeScope : []);
  function addScope() { set('activeScope', [...activeScope, '']); }
  function setScope(i, id) { const next = [...activeScope]; next[i] = id; set('activeScope', next); }
  function removeScope(i) { const next = [...activeScope]; next.splice(i, 1); set('activeScope', next); }
</script>

{#if display}
  <div class="lcd-inspector">
  <PropertySection title="Screen">
    <PropertyCell label="Panel Type" span={String(display.panelType ?? '') === 'graphic' ? 4 : 2} hint="Character cells, a 7/14/16-segment display, or a graphic (free-pixel) dot-matrix.">
      <select class="val" value={display.panelType ?? 'character'} onchange={(event) => set('panelType', event.target.value)}>
        <option value="character">Character</option>
        <option value="segment">Segment</option>
        <option value="graphic">Graphic (dot-matrix)</option>
      </select>
    </PropertyCell>
    {#if String(display.panelType ?? '') === 'segment'}
      <PropertyCell label="Segment Type" span={2} hint="7-segment (numeric), or 14/16-segment starburst (alphanumeric).">
        <select class="val" value={String(display.segmentType ?? '16')} onchange={(event) => set('segmentType', event.target.value)}>
          <option value="7">7-segment</option>
          <option value="9">9-segment</option>
          <option value="curved9">9-segment curved (VFD)</option>
          <option value="14">14-segment</option>
          <option value="16">16-segment</option>
        </select>
      </PropertyCell>
    {/if}
    {#if String(display.panelType ?? '') === 'graphic'}
      <PropertyCell label="Pixels W" span={2} hint="Graphic pixel columns (0 = auto from Columns).">
        <NumberInput value={display.pixelWidth ?? 0} step={1} min={0} max={512} onchange={(value) => set('pixelWidth', Math.round(value))} />
      </PropertyCell>
      <PropertyCell label="Pixels H" span={2} hint="Graphic pixel rows (0 = auto from Rows).">
        <NumberInput value={display.pixelHeight ?? 0} step={1} min={0} max={512} onchange={(value) => set('pixelHeight', Math.round(value))} />
      </PropertyCell>
      <PropertyCell label="Image" span={3} hint="Optional image dithered onto the grid (overrides text). Clear to show text.">
        <input class="val" type="file" accept="image/*" onchange={onPickImage} />
      </PropertyCell>
      <PropertyCell label="Dither" span={1} hint="Floyd–Steinberg dither vs hard threshold.">
        <PropertyToggle value={display.imageDither !== false} onchange={() => toggle('imageDither', true)} />
      </PropertyCell>
      {#if display.imageSrc}
        <PropertyCell label="Clear Image" span={4} hint="Remove the image and go back to showing text.">
          <button class="val add-field" type="button" onclick={() => set('imageSrc', '')}>Clear image</button>
        </PropertyCell>
      {/if}
    {/if}
    <PropertyCell label="Palette" span={4} hint="Ready-made lit/unlit/backlight colour set. You can still tweak colours below.">
      <select class="val" value={display.palette ?? 'greenStn'} onchange={(event) => applyPalette(event.target.value)}>
        {#each paletteEntries as [id, entry]}
          <option value={id}>{entry.label}</option>
        {/each}
      </select>
    </PropertyCell>
    <PropertyCell label="Columns" span={2} hint="Characters per line.">
      <NumberInput value={display.cols ?? 16} step={1} min={1} max={64} onchange={(value) => set('cols', Math.round(value))} />
    </PropertyCell>
    <PropertyCell label="Rows" span={2} hint="Number of text lines.">
      <NumberInput value={display.rows ?? 2} step={1} min={1} max={16} onchange={(value) => set('rows', Math.round(value))} />
    </PropertyCell>
  </PropertySection>

  <PropertySection title="Text">
    {#each Array.from({ length: rows }) as _, index}
      <PropertyCell label={`Line ${index + 1}`} span={4} hint="Text for this row, padded or truncated to the column count. Value tokens in braces: value, pct, bar, bar:N.">
        <input class="val" type="text" value={lines[index] ?? ''} oninput={(event) => setLine(index, event.target.value)} />
      </PropertyCell>
    {/each}
  </PropertySection>

  <PropertySection title="Value">
    <PropertyCell label="Source" span={4} hint="Drive the value live from another control (slider / knob / number) in preview. None = use the static value below.">
      <select class="val" value={display.valueSourceId ?? ''} onchange={(event) => setValueSource(event.target.value)}>
        <option value="">None (static value)</option>
        {#each valueSources as src}
          <option value={src.id}>{src.name}</option>
        {/each}
      </select>
    </PropertyCell>
    <PropertyCell label="Value" span={4} hint="Static value that drives the tokens (ignored in preview when a Source is set).">
      <NumberInput value={display.value ?? 0} step={1} min={display.valueMin ?? 0} max={display.valueMax ?? 127} onchange={(value) => set('value', value)} />
    </PropertyCell>
    <PropertyCell label="Min" span={2} hint="Value range minimum (for the pct and bar tokens).">
      <NumberInput value={display.valueMin ?? 0} step={1} onchange={(value) => set('valueMin', value)} />
    </PropertyCell>
    <PropertyCell label="Max" span={2} hint="Value range maximum (for the pct and bar tokens).">
      <NumberInput value={display.valueMax ?? 127} step={1} onchange={(value) => set('valueMax', value)} />
    </PropertyCell>
    <PropertyCell label="Precision" span={2} hint="Decimal places for the value token.">
      <NumberInput value={display.valuePrecision ?? 0} step={1} min={0} max={6} onchange={(value) => set('valuePrecision', Math.round(value))} />
    </PropertyCell>
    <PropertyCell label="Prefix" span={1} hint="Text before the value token.">
      <input class="val" type="text" value={display.valuePrefix ?? ''} oninput={(event) => set('valuePrefix', event.target.value)} />
    </PropertyCell>
    <PropertyCell label="Suffix" span={1} hint="Text after the value token (e.g. dB, %).">
      <input class="val" type="text" value={display.valueSuffix ?? ''} oninput={(event) => set('valueSuffix', event.target.value)} />
    </PropertyCell>

    {#each extraFields as f, i}
      <PropertyCell label={`Field ${i + 2}`} span={4} hint={`Drives tokens v${i + 2} / p${i + 2} / b${i + 2}. Source control, min, max.`}>
        <div class="field-row">
          <select class="val" value={f.sourceId ?? ''} onchange={(event) => setFieldSource(i, event.target.value)}>
            <option value="">None</option>
            {#each valueSources as src}
              <option value={src.id}>{src.name}</option>
            {/each}
          </select>
          <input class="val num" type="number" value={f.min ?? 0} onchange={(event) => setField(i, 'min', Number(event.target.value))} title="Min" />
          <input class="val num" type="number" value={f.max ?? 127} onchange={(event) => setField(i, 'max', Number(event.target.value))} title="Max" />
          <button class="val rm" type="button" onclick={() => removeField(i)} title="Remove field">✕</button>
        </div>
      </PropertyCell>
    {/each}
    <PropertyCell label="Fields" span={4} hint="Add an extra value field, addressed as v2/p2/b2, v3/... in the lines.">
      <button class="val add-field" type="button" onclick={() => addField()}>+ Add value field</button>
    </PropertyCell>
  </PropertySection>

  <PropertySection title="Edit Field">
    <PropertyCell label="Text" span={4} hint="Editable text such as a preset name. Bind a zone with Show = edit to '✎ This screen's text'.">
      <input class="val" type="text" value={display.editText ?? ''} oninput={(event) => set('editText', event.target.value)} />
    </PropertyCell>
    <PropertyCell label="Charset" span={2} hint="Allowed characters. 'upper' auto-uppercases typed letters (classic patch-name set).">
      <select class="val" value={display.editCharset ?? 'upper'} onchange={(event) => set('editCharset', event.target.value)}>
        <option value="upper">A–Z 0–9 (upper)</option>
        <option value="alnum">A–z 0–9 (alnum)</option>
        <option value="ascii">ASCII</option>
        <option value="digits">Digits</option>
      </select>
    </PropertyCell>
    <PropertyCell label="Max Length" span={2} hint="Maximum characters (0 = unbounded). Usually match the zone width.">
      <NumberInput value={display.editMaxLength ?? 16} step={1} min={0} max={64} onchange={(value) => set('editMaxLength', Math.round(value))} />
    </PropertyCell>
  </PropertySection>

  <PropertySection title="Layouts">
    {#if layouts.length === 0}
      <PropertyCell label="Layouts" span={4} hint="Compose the display from bound regions instead of the lines above. Add a layout to switch modes.">
        <button class="val add-field" type="button" onclick={() => addLayout()}>+ Enable layouts</button>
      </PropertyCell>
    {:else}
      <PropertyCell label="Edit / Preview Layout" span={4} hint="Which layout the Zones table edits and previews. Runtime switching is set by the Pages rules.">
        <div class="field-row">
          <select class="val" value={String(editLayout?.id ?? '')} onchange={(event) => selectEditLayout(event.target.value)}>
            {#each layouts as l}
              <option value={String(l.id)}>{l.name ?? l.id}</option>
            {/each}
          </select>
          <button class="val rm" type="button" onclick={() => addLayout()} title="Add layout">＋</button>
          <button class="val rm" type="button" onclick={() => duplicateLayout(editLayout?.id)} title="Duplicate layout">⧉</button>
          <button class="val rm" type="button" onclick={() => removeLayout(editLayout?.id)} title="Remove layout">✕</button>
        </div>
      </PropertyCell>
      <PropertyCell label="Name" span={4} hint="Layout name (used by the Pages rules).">
        <input class="val" type="text" value={editLayout?.name ?? ''} oninput={(event) => renameLayout(editLayout?.id, event.target.value)} />
      </PropertyCell>

      {#if editLayout && (editLayout.zones ?? []).length > 0}
        <div class="zone-head">
          <span class="zone-num">#</span>
          <span class="zn">Row</span>
          <span class="zn">Start</span>
          <span class="zn">End</span>
          <span class="zsel">Show</span>
          <span class="zsel">Source</span>
          <span class="zn2">Kind</span>
          <span class="zn2">Al</span>
          <span class="zn2">Rdx</span>
          <span class="zn2">Ovf</span>
          <span class="rm"></span>
          <span class="rm"></span>
        </div>
      {/if}
      {#if editLayout}
        {#each (editLayout.zones ?? []) as z, i (z.id ?? i)}
          <div class="zone-cell">
            <span class="zone-num" title="Zone">#{i + 1}</span>
            <input class="val zn" type="number" min="1" title="Row" value={z.row ?? 1} onchange={(event) => setZone(i, 'row', Math.round(Number(event.target.value)))} />
            <input class="val zn" type="number" min="1" title="Col start" value={z.colStart ?? 1} onchange={(event) => setZone(i, 'colStart', Math.round(Number(event.target.value)))} />
            <input class="val zn" type="number" min="1" title="Col end" value={z.colEnd ?? cols} onchange={(event) => setZone(i, 'colEnd', Math.round(Number(event.target.value)))} />
            <select class="val zsel" title="Show" value={z.show ?? 'static'} onchange={(event) => setZone(i, 'show', event.target.value)}>
              {#each ZONE_SHOW_KINDS as kind}
                <option value={kind}>{kind}</option>
              {/each}
            </select>
            {#if z.show === 'static'}
              <input class="val ztext" type="text" placeholder="caption text" value={z.text ?? ''} oninput={(event) => setZone(i, 'text', event.target.value)} />
              <select class="val zn2" title="Overflow: cut off or scroll (marquee)" value={z.scroll === true ? 'scroll' : 'cut'} onchange={(event) => setZone(i, 'scroll', event.target.value === 'scroll')}>
                <option value="cut">cut</option>
                <option value="scroll">scrl</option>
              </select>
            {:else}
              <select class="val zsel" title="Source component" value={zoneSourceValue(z)} onchange={(event) => setZone(i, 'sourceId', event.target.value)}>
                <option value="">(source)</option>
                <option value="@active">★ Active</option>
                <option value="@edit">✎ This screen's text</option>
                {#each allSources as src}
                  <option value={src.id}>{src.name}</option>
                {/each}
              </select>
              {#if isActiveSource(z.sourceId)}
                <select class="val zn2" title="Active kind filter" value={activeFilterOf(z.sourceId)} onchange={(event) => setZoneActiveKind(i, event.target.value)}>
                  <option value="">any</option>
                  <option value="value">slid</option>
                  <option value="switch">btn</option>
                  <option value="choice">sel</option>
                </select>
              {:else}
                <span class="zn2 zspacer" aria-hidden="true"></span>
              {/if}
              <select class="val zn2" title="Align" value={z.align ?? 'left'} onchange={(event) => setZone(i, 'align', event.target.value)}>
                <option value="left">L</option>
                <option value="center">C</option>
                <option value="right">R</option>
              </select>
              {#if z.show === 'midiValue'}
                <select class="val zn2" title="Radix" value={z.radix ?? 'dec'} onchange={(event) => setZone(i, 'radix', event.target.value)}>
                  <option value="dec">dec</option>
                  <option value="hex">hex</option>
                </select>
              {:else}
                <span class="zn2 zspacer" aria-hidden="true"></span>
              {/if}
              <select class="val zn2" title="Overflow: cut off or scroll (marquee)" value={z.scroll === true ? 'scroll' : 'cut'} onchange={(event) => setZone(i, 'scroll', event.target.value === 'scroll')}>
                <option value="cut">cut</option>
                <option value="scroll">scrl</option>
              </select>
            {/if}
            <button class="val rm" type="button" class:zopen={expandedZoneId === String(z.id ?? i)} onclick={() => toggleZoneExtras(String(z.id ?? i))} title="More zone settings (prefix/suffix, order, …)">…</button>
            <button class="val rm" type="button" onclick={() => removeZone(i)} title="Remove zone">✕</button>
          </div>
          {#if expandedZoneId === String(z.id ?? i)}
            <div class="zone-extra">
              <span class="zx-lab">Pre</span>
              <input class="val zn2" type="text" title="Prefix text" value={z.prefix ?? ''} oninput={(event) => setZone(i, 'prefix', event.target.value)} />
              <span class="zx-lab">Suf</span>
              <input class="val zn2" type="text" title="Suffix text" value={z.suffix ?? ''} oninput={(event) => setZone(i, 'suffix', event.target.value)} />
              <span class="zx-lab">Dec</span>
              <input class="val zn" type="number" min="0" max="6" title="Decimal places (value kind)" value={z.precision ?? 0} onchange={(event) => setZone(i, 'precision', Math.max(0, Math.round(Number(event.target.value))))} />
              <span class="zx-lab">Lbl</span>
              <input class="val ztext" type="text" title="Custom label (name kind; empty = source name)" placeholder="(source name)" value={z.label ?? ''} oninput={(event) => setZone(i, 'label', event.target.value)} />
              <span class="zx-lab">Vis</span>
              <select class="val zn2" title="Zone visible" value={z.visible === false ? 'off' : 'on'} onchange={(event) => setZone(i, 'visible', event.target.value !== 'off')}>
                <option value="on">on</option>
                <option value="off">off</option>
              </select>
              {#if WIDGET_ZONE_KINDS.has(z.show)}
                <span class="zx-lab">Rows</span>
                <input class="val zn" type="number" min="1" max="16" title="Rows tall (graphic panels)" value={z.rowSpan ?? 1} onchange={(event) => setZone(i, 'rowSpan', Math.max(1, Math.round(Number(event.target.value))))} />
                <span class="zx-lab">Frame</span>
                <select class="val zn2" title="Outline frame" value={z.frame === true ? 'on' : 'off'} onchange={(event) => setZone(i, 'frame', event.target.value === 'on')}>
                  <option value="off">off</option>
                  <option value="on">on</option>
                </select>
                <span class="zx-lab">Ticks</span>
                <select class="val zn2" title="Tick marks" value={z.ticks === true ? 'on' : 'off'} onchange={(event) => setZone(i, 'ticks', event.target.value === 'on')}>
                  <option value="off">off</option>
                  <option value="on">on</option>
                </select>
                <span class="zx-lab">Peak</span>
                <select class="val zn2" title="Peak-hold marker (bars)" value={z.peakHold === true ? 'on' : 'off'} onchange={(event) => setZone(i, 'peakHold', event.target.value === 'on')}>
                  <option value="off">off</option>
                  <option value="on">on</option>
                </select>
                <span class="zx-lab">Smooth</span>
                <select class="val zn2" title="Meter ballistics (smoothed movement)" value={z.smooth === true ? 'on' : 'off'} onchange={(event) => setZone(i, 'smooth', event.target.value === 'on')}>
                  <option value="off">off</option>
                  <option value="on">on</option>
                </select>
              {/if}
              <button class="val rm" type="button" onclick={() => moveZone(i, -1)} title="Move up (paints earlier)" disabled={i === 0}>▲</button>
              <button class="val rm" type="button" onclick={() => moveZone(i, 1)} title="Move down (paints later, wins overlaps)" disabled={i === (editLayout.zones ?? []).length - 1}>▼</button>
              <button class="val rm" type="button" onclick={() => duplicateZone(i)} title="Duplicate zone">⧉</button>
            </div>
          {/if}
        {/each}
        <PropertyCell label="Zones" span={4} hint="Add a region to this layout.">
          <button class="val add-field" type="button" onclick={() => addZone()}>+ Add zone</button>
        </PropertyCell>
      {/if}
    {/if}
  </PropertySection>

  {#if layouts.length > 0}
    <PropertySection title="Pages">
      <PropertyCell label="Selector" span={4} hint="A control whose value selects the resting layout (e.g. a mode/preset combobox).">
        <select class="val" value={pages.selectorSourceId ?? ''} onchange={(event) => setPageProp('selectorSourceId', event.target.value)}>
          <option value="">None (always default)</option>
          {#each allSources as src}
            <option value={src.id}>{src.name}</option>
          {/each}
        </select>
      </PropertyCell>
      <PropertyCell label="Default" span={4} hint="Resting layout when no selector value matches.">
        <select class="val" value={pages.defaultLayoutId ?? ''} onchange={(event) => setPageProp('defaultLayoutId', event.target.value)}>
          {#each layouts as l}
            <option value={String(l.id)}>{l.name ?? l.id}</option>
          {/each}
        </select>
      </PropertyCell>
      {#each (pages.selectorMap ?? []) as m, i (i)}
        {@const op = String(m.op ?? 'eq')}
        <PropertyCell label={`When ${op}`} span={4} hint="Selector value (or range) → layout to show. Numeric operators compare against a range control's value.">
          <div class="field-row">
            <select class="val zn2" title="Match operator" value={op} onchange={(event) => setSelectorRow(i, 'op', event.target.value)}>
              <option value="eq">=</option>
              <option value="ne">≠</option>
              <option value="lt">&lt;</option>
              <option value="le">≤</option>
              <option value="gt">&gt;</option>
              <option value="ge">≥</option>
              <option value="between">a–b</option>
            </select>
            {#if (op === 'eq' || op === 'ne') && selectorOptions}
              <select class="val zsel" title="Selector value" value={String(m.when ?? '')} onchange={(event) => setSelectorRow(i, 'when', event.target.value)}>
                <option value="">(value)</option>
                {#each selectorOptions as opt}
                  <option value={opt.value}>{opt.label}</option>
                {/each}
              </select>
            {:else if op === 'eq' || op === 'ne'}
              <input class="val zn" type="text" title="Selector value" placeholder="value" value={m.when ?? ''} oninput={(event) => setSelectorRow(i, 'when', event.target.value)} />
            {:else}
              <input class="val zn" type="number" title="Threshold" placeholder="a" value={m.when ?? ''} oninput={(event) => setSelectorRow(i, 'when', event.target.value)} />
              {#if op === 'between'}
                <input class="val zn" type="number" title="Upper bound" placeholder="b" value={m.when2 ?? ''} oninput={(event) => setSelectorRow(i, 'when2', event.target.value)} />
              {/if}
            {/if}
            <select class="val" title="Layout" value={String(m.layoutId ?? '')} onchange={(event) => setSelectorRow(i, 'layoutId', event.target.value)}>
              {#each layouts as l}
                <option value={String(l.id)}>{l.name ?? l.id}</option>
              {/each}
            </select>
            <button class="val rm" type="button" onclick={() => removeSelectorRow(i)} title="Remove">✕</button>
          </div>
        </PropertyCell>
      {/each}
      <PropertyCell label="Map" span={4} hint="Add a selector value/range → layout rule. Rules match top-to-bottom; put specific ones first.">
        <button class="val add-field" type="button" onclick={() => addSelectorRow()}>+ Add page rule</button>
      </PropertyCell>

      {#each (pages.overlays ?? []) as ov, i (ov.id ?? i)}
        <PropertyCell label={`Overlay ${i + 1}`} span={4} hint="Transiently show a layout when a control changes.">
          <div class="field-row">
            <select class="val" title="Layout" value={String(ov.layoutId ?? '')} onchange={(event) => setOverlay(i, 'layoutId', event.target.value)}>
              {#each layouts as l}
                <option value={String(l.id)}>{l.name ?? l.id}</option>
              {/each}
            </select>
            <select class="val" title="On change of" value={ov.sourceId ?? ''} onchange={(event) => setOverlay(i, 'sourceId', event.target.value)}>
              <option value="">(trigger)</option>
              {#each allSources as src}
                <option value={src.id}>{src.name}</option>
              {/each}
            </select>
            <select class="val zn2" title="Dismiss" value={ov.dismiss ?? 'timer'} onchange={(event) => setOverlay(i, 'dismiss', event.target.value)}>
              <option value="timer">for</option>
              <option value="untilChange">until</option>
            </select>
            {#if (ov.dismiss ?? 'timer') === 'timer'}
              <input class="val zn" type="number" min="0" title="Duration ms" value={ov.duration ?? 800} onchange={(event) => setOverlay(i, 'duration', Math.round(Number(event.target.value)))} />
            {/if}
            <button class="val rm" type="button" onclick={() => removeOverlay(i)} title="Remove">✕</button>
          </div>
        </PropertyCell>
      {/each}
      <PropertyCell label="Overlays" span={4} hint="Add a transient page shown on a control change (for N ms, or until a change).">
        <button class="val add-field" type="button" onclick={() => addOverlay()}>+ Add overlay page</button>
      </PropertyCell>

      <PropertyCell label="@active scope" span={4} hint="Restrict the @active source to these controls only. Empty = any control counts as active.">
        <span class="hint-note">{activeScope.length === 0 ? 'Any control' : `${activeScope.length} control(s)`}</span>
      </PropertyCell>
      {#each activeScope as sid, i (i)}
        <PropertyCell label={`In scope ${i + 1}`} span={4} hint="A control that counts toward @active.">
          <div class="field-row">
            <select class="val" value={sid ?? ''} onchange={(event) => setScope(i, event.target.value)}>
              <option value="">(control)</option>
              {#each allSources as src}
                <option value={src.id}>{src.name}</option>
              {/each}
            </select>
            <button class="val rm" type="button" onclick={() => removeScope(i)} title="Remove">✕</button>
          </div>
        </PropertyCell>
      {/each}
      <PropertyCell label="Scope" span={4} hint="Add a control that @active is allowed to follow.">
        <button class="val add-field" type="button" onclick={() => addScope()}>+ Add to @active scope</button>
      </PropertyCell>
    </PropertySection>
  {/if}

  {#if String(display.panelType ?? '') === 'graphic'}
    <PropertySection title="Animation">
      <PropertyCell label="Mode" span={4} hint="Dot-matrix animation played behind the zones/text. File = GIF/APNG or a sprite sheet; Preset = built-in effects.">
        <select class="val" value={display.animMode ?? 'off'} onchange={(event) => set('animMode', event.target.value)}>
          <option value="off">Off</option>
          <option value="file">File (GIF / sprite sheet)</option>
          <option value="preset">Preset</option>
        </select>
      </PropertyCell>
      {#if String(display.animMode ?? 'off') === 'file'}
        <PropertyCell label="File" span={4} hint="Animated GIF/APNG/WebP (decoded frame-by-frame), or one image holding sprite frames side-by-side.">
          <input class="val" type="file" accept="image/*" onchange={onPickAnim} />
        </PropertyCell>
        <PropertyCell label="Frames" span={2} hint="Sprite-sheet frame count (frames laid out horizontally). 0 = the file is an animated GIF/APNG.">
          <NumberInput value={display.animFrames ?? 0} step={1} min={0} max={180} onchange={(value) => set('animFrames', Math.round(value))} />
        </PropertyCell>
        <PropertyCell label="FPS" span={1} hint="Sprite-sheet playback rate (animated files use their own frame timing).">
          <NumberInput value={display.animFps ?? 12} step={1} min={1} max={60} onchange={(value) => set('animFps', Math.round(value))} />
        </PropertyCell>
        <PropertyCell label="Loop" span={1} hint="Loop forever, or hold the last frame.">
          <PropertyToggle value={display.animLoop !== false} onchange={() => toggle('animLoop', true)} />
        </PropertyCell>
        {#if display.animSrc}
          <PropertyCell label="Clear" span={4} hint="Remove the animation file.">
            <button class="val add-field" type="button" onclick={() => set('animSrc', '')}>Clear animation</button>
          </PropertyCell>
        {/if}
      {/if}
      {#if String(display.animMode ?? 'off') === 'preset'}
        <PropertyCell label="Preset" span={2} hint="Built-in dot-matrix effect.">
          <select class="val" value={display.animPreset ?? 'wave'} onchange={(event) => set('animPreset', event.target.value)}>
            <option value="wave">Wave</option>
            <option value="scanner">Scanner</option>
            <option value="rain">Rain</option>
            <option value="starfield">Starfield</option>
            <option value="spinner">Spinner</option>
            <option value="plasma">Plasma</option>
          </select>
        </PropertyCell>
        <PropertyCell label="Speed" span={2} hint="Preset speed multiplier.">
          <PropertyScrub value={display.animSpeed ?? 1} step={0.1} min={0.1} max={5} defaultValue={1} onchange={(value) => set('animSpeed', value)} />
        </PropertyCell>
      {/if}
    </PropertySection>
  {/if}

  {#snippet colourField(prop, current, fallback)}
    <div class="field-row">
      <input class="val cswatch" type="color" title="Pick RGB (keeps the current alpha)" value={aarrggbbToHex(current ?? fallback)} oninput={(event) => set(prop, mergeHexKeepAlpha(current ?? fallback, event.target.value))} />
      <input class="val" type="text" title="AARRGGBB (alpha + RGB)" value={current ?? fallback} onchange={(event) => set(prop, event.target.value.trim())} />
    </div>
  {/snippet}
  <PropertySection title="Colour">
    <PropertyCell label="Lit" span={2} hint="Foreground (lit segment) colour, AARRGGBB.">
      {@render colourField('litColour', display.litColour, 'FF2BE86A')}
    </PropertyCell>
    <PropertyCell label="Unlit" span={2} hint="Faint unlit 'ghost' segment colour, AARRGGBB.">
      {@render colourField('unlitColour', display.unlitColour, '242BE86A')}
    </PropertyCell>
    <PropertyCell label="Screen" span={2} hint="Screen substrate behind the pixels, AARRGGBB.">
      {@render colourField('screenColour', display.screenColour, 'FF06371C')}
    </PropertyCell>
    <PropertyCell label="Backlight" span={2} hint="Backlight wash colour, AARRGGBB.">
      {@render colourField('backlightColour', display.backlightColour, 'FF0E5A2E')}
    </PropertyCell>
    <PropertyCell label="Glass" span={2} hint="Glass sheen overlay colour, AARRGGBB (low alpha = subtle).">
      {@render colourField('glassTint', display.glassTint, '14FFFFFF')}
    </PropertyCell>
    <PropertyCell label="Reset" span={4} hint="Restore the default look (colours, brightness, ghost). Leaves layouts, zones and text untouched.">
      <button class="val add-field" type="button" onclick={() => resetAppearance()}>↺ Reset appearance</button>
    </PropertyCell>
  </PropertySection>

  <PropertySection title="Lighting">
    <PropertyCell label="Backlight" span={2} hint="Turn the backlight wash on or off.">
      <PropertyToggle value={display.backlightOn !== false} onchange={() => toggle('backlightOn', true)} />
    </PropertyCell>
    <PropertyCell label="Brightness" span={2} hint="Foreground intensity (0–100). Drag the track, type a value, or step with ▴▾.">
      <PropertyScrub value={display.brightness ?? 100} step={1} min={0} max={100} defaultValue={100} onchange={(value) => set('brightness', value)} />
    </PropertyCell>
    <PropertyCell label="Contrast" span={2} hint="LCD trim-pot feel — ghost/backlight strength (0–100). Drag, type, or step.">
      <PropertyScrub value={display.contrast ?? 55} step={1} min={0} max={100} defaultValue={55} onchange={(value) => set('contrast', value)} />
    </PropertyCell>
    <PropertyCell label="Bright Src" span={2} hint="Drive Brightness live from a slider/knob/number in preview (its range maps to 0–100).">
      <select class="val" value={display.brightnessSourceId ?? ''} onchange={(event) => set('brightnessSourceId', event.target.value)}>
        <option value="">None</option>
        {#each valueSources as src}
          <option value={src.id}>{src.name}</option>
        {/each}
      </select>
    </PropertyCell>
    <PropertyCell label="Backlt Src" span={2} hint="Drive the backlight on/off live from a toggle/button in preview.">
      <select class="val" value={display.backlightSourceId ?? ''} onchange={(event) => set('backlightSourceId', event.target.value)}>
        <option value="">None</option>
        {#each allSources as src}
          <option value={src.id}>{src.name}</option>
        {/each}
      </select>
    </PropertyCell>
    <PropertyCell label="Ghost dots" span={2} hint="Faint unlit cells behind the text (realism cue).">
      <PropertyToggle value={display.showGhost !== false} onchange={() => toggle('showGhost', true)} />
    </PropertyCell>
    <PropertyCell label="Scanlines" span={2} hint="Horizontal scanline overlay.">
      <PropertyToggle value={display.showScanlines === true} onchange={() => toggle('showScanlines', false)} />
    </PropertyCell>
    <PropertyCell label="Cell grid" span={2} hint="Faint pixel/cell grid lines.">
      <PropertyToggle value={display.showGrid === true} onchange={() => toggle('showGrid', false)} />
    </PropertyCell>
    <PropertyCell label="Glass sheen" span={2} hint="Diagonal glass reflection overlay (colour set under Colour ▸ Glass).">
      <PropertyToggle value={display.showGlass !== false} onchange={() => toggle('showGlass', true)} />
    </PropertyCell>
    {#if String(display.panelType ?? '') === 'character'}
      <PropertyCell label="Dot Matrix" span={2} hint="Render character glyphs as a dot grid for a dot-matrix LCD look.">
        <PropertyToggle value={display.dotMatrix === true} onchange={() => toggle('dotMatrix', false)} />
      </PropertyCell>
      <PropertyCell label="Dot Pitch" span={2} hint="Dot spacing in px (0 = auto from cell size).">
        <NumberInput value={display.dotPitch ?? 0} step={1} min={0} max={20} onchange={(value) => set('dotPitch', Math.round(value))} />
      </PropertyCell>
    {/if}
    {#if String(display.panelType ?? '') !== 'segment'}
      <PropertyCell label="Dot Shape" span={2} hint="Round (LCD/OLED) or square (blockier) dots. Applies to dot-matrix and graphic mode.">
        <select class="val" value={display.dotShape ?? 'round'} onchange={(event) => set('dotShape', event.target.value)}>
          <option value="round">Round</option>
          <option value="square">Square</option>
        </select>
      </PropertyCell>
    {/if}
  </PropertySection>

  <PropertySection title="Motion">
    <PropertyCell label="Scroll" span={2} hint="Marquee a line that's longer than the column count.">
      <select class="val" value={display.scroll ?? 'off'} onchange={(event) => set('scroll', event.target.value)}>
        <option value="off">Off</option>
        <option value="left">Left</option>
        <option value="right">Right</option>
      </select>
    </PropertyCell>
    <PropertyCell label="Scroll Mode" span={2} hint="Loop wraps around; bounce ping-pongs back and forth.">
      <select class="val" value={display.scrollMode ?? 'loop'} onchange={(event) => set('scrollMode', event.target.value)}>
        <option value="loop">Loop</option>
        <option value="bounce">Bounce</option>
      </select>
    </PropertyCell>
    <PropertyCell label="Speed" span={2} hint="Scroll speed in characters per second.">
      <PropertyScrub value={display.scrollSpeed ?? 4} step={1} min={0} max={60} defaultValue={4} onchange={(value) => set('scrollSpeed', value)} />
    </PropertyCell>
    <PropertyCell label="Gap" span={2} hint="Blank characters between loop repeats.">
      <NumberInput value={display.scrollGap ?? 3} step={1} min={0} onchange={(value) => set('scrollGap', Math.round(value))} />
    </PropertyCell>
    <PropertyCell label="Repeat" span={2} hint="Number of times to scroll, then settle. 0 = loop forever.">
      <NumberInput value={display.scrollRepeat ?? 0} step={1} min={0} onchange={(value) => set('scrollRepeat', Math.round(value))} />
    </PropertyCell>
    <PropertyCell label="Blink" span={2} hint="Blink the lit text on and off.">
      <PropertyToggle value={display.blink === true} onchange={() => toggle('blink', false)} />
    </PropertyCell>
    <PropertyCell label="Blink Rate" span={2} hint="Milliseconds per blink half-cycle.">
      <NumberInput value={display.blinkRate ?? 500} step={50} min={60} onchange={(value) => set('blinkRate', value)} />
    </PropertyCell>
    <PropertyCell label="Cursor" span={2} hint="Show a cursor cell.">
      <select class="val" value={display.cursor ?? 'off'} onchange={(event) => set('cursor', event.target.value)}>
        <option value="off">Off</option>
        <option value="block">Block</option>
        <option value="underline">Underline</option>
      </select>
    </PropertyCell>
    <PropertyCell label="Cursor Blink" span={2} hint="Blink the cursor.">
      <PropertyToggle value={display.cursorBlink !== false} onchange={() => toggle('cursorBlink', true)} />
    </PropertyCell>
    <PropertyCell label="Cursor Row" span={2} hint="Cursor row (0-based).">
      <NumberInput value={display.cursorRow ?? 0} step={1} min={0} onchange={(value) => set('cursorRow', Math.round(value))} />
    </PropertyCell>
    <PropertyCell label="Cursor Col" span={2} hint="Cursor column (0-based).">
      <NumberInput value={display.cursorCol ?? 0} step={1} min={0} onchange={(value) => set('cursorCol', Math.round(value))} />
    </PropertyCell>
  </PropertySection>

  <PropertySection title="Layout">
    <PropertyCell label="Padding" span={2} hint="Inset from the bezel to the screen (px).">
      <NumberInput value={display.padding ?? 10} step={1} min={0} onchange={(value) => set('padding', value)} />
    </PropertyCell>
    <PropertyCell label="Font Scale" span={2} hint="Relative glyph size.">
      <PropertyScrub value={display.fontScale ?? 1} step={0.05} min={0.3} max={3} defaultValue={1} onchange={(value) => set('fontScale', value)} />
    </PropertyCell>
    <PropertyCell label="Char Gap" span={2} hint="Extra spacing between characters (px).">
      <NumberInput value={display.charSpacing ?? 1} step={1} min={0} onchange={(value) => set('charSpacing', value)} />
    </PropertyCell>
    <PropertyCell label="Line Gap" span={2} hint="Extra spacing between rows (px).">
      <NumberInput value={display.lineSpacing ?? 3} step={1} min={0} onchange={(value) => set('lineSpacing', value)} />
    </PropertyCell>
  </PropertySection>
  </div>
{/if}

<style>
  /* The inputs live inside PropertyCell (slotted content), so target them with a
     :global descendant selector under the hashed wrapper. color-scheme keeps the
     native select/number controls dark. !important guards against any inherited
     UA/theme rule so the fields never fall back to a white background. */
  .lcd-inspector {
    color-scheme: dark;
  }

  /* Fully global (neither part hash-scoped) so it matches every .val descendant
     regardless of whether Svelte hashed the element — including bare
     <input class="val"> / <select class="val"> that no scoped rule touches. */
  :global(.lcd-inspector .val) {
    width: 100%;
    box-sizing: border-box;
    background: #1A1A1A !important;
    border: 1px solid #333 !important;
    color: #DDD !important;
    border-radius: 4px;
    padding: 3px 6px;
    font-size: 12px;
  }

  :global(.lcd-inspector .val:focus-visible) {
    outline: 2px solid #5B9BD5;
    outline-offset: 1px;
    border-color: #5B9BD5 !important;
  }

  :global(.lcd-inspector .val option) {
    background: #1A1A1A;
    color: #DDD;
  }

  .field-row {
    display: flex;
    gap: 4px;
    align-items: center;
  }

  .field-row .num {
    width: 58px;
    flex: 0 0 auto;
  }

  .field-row .rm {
    width: 30px;
    flex: 0 0 auto;
    cursor: pointer;
  }

  .field-row .cswatch {
    width: 30px;
    flex: 0 0 auto;
    padding: 1px;
    height: 24px;
    cursor: pointer;
  }

  .add-field {
    cursor: pointer;
    text-align: center;
  }

  .hint-note {
    font-size: 11px;
    color: #8a8a8a;
  }

  .zone-head,
  .zone-cell {
    grid-column: span 4;
    display: flex;
    flex-wrap: nowrap;
    gap: 3px;
    align-items: center;
  }

  .zone-head {
    padding-bottom: 2px;
    border-bottom: 1px solid #333;
  }

  .zone-head span {
    font-size: 10px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.03em;
    color: #8a8a8a;
    text-align: center;
    box-sizing: border-box;
  }

  .zone-head .zsel { text-align: left; }

  .zone-num {
    flex: 0 0 auto;
    min-width: 26px;
    text-align: center;
    font-size: 11px;
    font-weight: 600;
    color: #8a8a8a;
  }

  .zone-head .zn,
  .zone-cell .zn {
    width: 42px;
    flex: 0 0 auto;
    text-align: center;
  }

  .zone-head .zn2,
  .zone-cell .zn2 {
    width: 44px;
    flex: 0 0 auto;
  }

  /* Reserved empty slot so the Kind/Radix boxes appearing don't reflow the row. */
  .zone-cell .zspacer {
    visibility: hidden;
  }

  /* Expanded per-zone extras (prefix/suffix/precision/label/visible/order). */
  .zone-extra {
    grid-column: span 4;
    display: flex;
    flex-wrap: wrap;
    gap: 3px;
    align-items: center;
    padding: 3px 0 5px 26px;
    border-bottom: 1px solid #2a2a2a;
  }

  .zx-lab {
    flex: 0 0 auto;
    font-size: 10px;
    text-transform: uppercase;
    color: #8a8a8a;
  }

  .zone-extra .zn {
    width: 42px;
    flex: 0 0 auto;
    text-align: center;
  }

  .zone-extra .zn2 {
    width: 54px;
    flex: 0 0 auto;
  }

  .zone-extra .ztext {
    flex: 1 1 70px;
    min-width: 50px;
    max-width: 180px;
  }

  .zone-extra .rm,
  .zone-cell .zopen {
    flex: 0 0 auto;
    width: 26px;
    padding-left: 0;
    padding-right: 0;
    text-align: center;
    cursor: pointer;
  }

  .zone-extra .rm:disabled {
    opacity: 0.4;
    cursor: default;
  }

  .zone-cell .zopen {
    background: #094771;
    color: #ddd;
  }

  .zone-head .zsel,
  .zone-cell .zsel {
    flex: 1 1 78px;
    min-width: 60px;
    max-width: 130px;
  }

  .zone-cell .ztext {
    flex: 1 1 90px;
    min-width: 70px;
  }

  .zone-head .rm,
  .zone-cell .rm {
    width: 26px;
    flex: 0 0 auto;
    margin-left: auto;
    padding-left: 0;
    padding-right: 0;
    text-align: center;
  }

  .zone-cell .rm {
    cursor: pointer;
  }
</style>
