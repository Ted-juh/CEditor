<script>
  import { getSection, updateControlProperty } from '../stores/controls.js';
  import { activePanel } from '../stores/panels.js';
  import { LCD_PALETTES } from '../editor/LcdDisplayRenderer.svelte';
  import { setLcdDesignLayout } from '../stores/lcdDesignLayout.js';
  import PropertyCell from '../properties/PropertyCell.svelte';
  import PropertySection from '../properties/PropertySection.svelte';
  import PropertyToggle from '../properties/PropertyToggle.svelte';
  import NumberInput from './NumberInput.svelte';

  // Element kinds: text-ish (drawn at x,y with font height h) and pixel widgets
  // (fill the x,y,w,h rect). Mirrors the LCD zone kinds minus char-only ones.
  const TEXT_KINDS = ['static', 'name', 'value', 'pct', 'midiValue', 'note', 'text', 'state'];
  const WIDGET_KINDS = ['hbar', 'vbar', 'hslider', 'vslider', 'needle'];
  const ELEMENT_KINDS = [...TEXT_KINDS, ...WIDGET_KINDS];

  let { control = null } = $props();

  let core = $derived(getSection(control, 'Core'));
  let pixel = $derived(getSection(control, 'Pixel'));
  let paletteEntries = $derived(Object.entries(LCD_PALETTES));

  // Any control on the panel (for element linking).
  let allSources = $derived(
    ($activePanel?.controls ?? [])
      .filter((c) => String(c?._children?.Core?.id ?? '') !== String(core?.id ?? ''))
      .map((c) => ({ id: String(c._children.Core.id), name: String(c._children.Core.name ?? c._children.Core.id) }))
  );

  // Range-valued controls (for the brightness source).
  let valueSources = $derived(
    ($activePanel?.controls ?? [])
      .filter((c) => String(c?._children?.Behavior?.family ?? '').trim().toLowerCase() === 'range'
        && String(c?._children?.Core?.id ?? '') !== String(core?.id ?? ''))
      .map((c) => ({ id: String(c._children.Core.id), name: String(c._children.Core.name ?? c._children.Core.id) }))
  );

  function set(prop, value) {
    if (!core?.id) return;
    updateControlProperty(core.id, `Pixel.${prop}`, value);
  }

  function toggle(prop, defaultOn = true) {
    const current = pixel?.[prop];
    const isOn = current === undefined ? defaultOn : current !== false;
    set(prop, !isOn);
  }

  function applyPalette(id) {
    const p = LCD_PALETTES[id];
    if (!p) return;
    set('palette', id);
    set('litColour', p.lit);
    set('unlitColour', p.unlit);
    set('screenColour', p.screen);
    set('backlightColour', p.backlight);
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

  // --- Layouts / pages (same engine as the LCD) ---
  let layouts = $derived(Array.isArray(pixel?.layouts) ? pixel.layouts : []);
  let editLayoutId = $state('');
  let editLayout = $derived(layouts.find((l) => String(l?.id) === String(editLayoutId)) ?? layouts[0] ?? null);
  let pages = $derived(pixel?.pages ?? {});
  let pixelsW = $derived(Math.max(8, Math.round(Number(pixel?.pixelsW ?? 128))));
  let pixelsH = $derived(Math.max(8, Math.round(Number(pixel?.pixelsH ?? 64))));

  function genId(prefix) {
    return `${prefix}${Math.random().toString(36).slice(2, 8)}${Date.now().toString(36).slice(-3)}`;
  }
  function cloneLayouts() { return JSON.parse(JSON.stringify(layouts)); }
  function commitLayouts(next) { set('layouts', next); }
  function clonePages() { return JSON.parse(JSON.stringify(pages ?? {})); }
  function commitPages(next) { set('pages', next); }
  function setPageProp(prop, value) { const p = clonePages(); p[prop] = value; commitPages(p); }

  function selectEditLayout(id) {
    editLayoutId = id;
    setLcdDesignLayout(core?.id, id);
  }
  function addLayout() {
    const next = cloneLayouts();
    const id = genId('lay_');
    // The first layout adopts the current flat elements so nothing is lost.
    next.push({ id, name: `Layout ${next.length + 1}`, elements: next.length === 0 ? JSON.parse(JSON.stringify(flatElements)) : [] });
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
  function renameLayout(id, name) {
    const next = cloneLayouts();
    const l = next.find((x) => String(x.id) === String(id));
    if (l) { l.name = String(name ?? ''); commitLayouts(next); }
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

  // Known values of the Pages selector control (pick-list for "When").
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

  // --- Elements (of the edited layout, or the flat list when no layouts) ---
  let flatElements = $derived(Array.isArray(pixel?.elements) ? pixel.elements : []);
  let elements = $derived(layouts.length ? (Array.isArray(editLayout?.elements) ? editLayout.elements : []) : flatElements);

  function cloneElements() { return JSON.parse(JSON.stringify(elements)); }
  function commitElements(next) {
    if (!layouts.length) { set('elements', next); return; }
    const all = cloneLayouts();
    const l = all.find((x) => String(x.id) === String(editLayout?.id));
    if (!l) return;
    l.elements = next;
    commitLayouts(all);
  }

  function addElement() {
    const next = cloneElements();
    next.push({
      id: genId('el_'), kind: 'vbar', x: 4, y: 4,
      w: 12, h: Math.max(8, pixelsH - 8),
      sourceId: '', align: 'left', precision: 0, prefix: '', suffix: '', label: '',
      frame: false, ticks: false, peakHold: false, smooth: false, visible: true,
    });
    commitElements(next);
  }
  function removeElement(i) {
    const next = cloneElements();
    next.splice(i, 1);
    commitElements(next);
  }
  function setElement(i, prop, value) {
    const next = cloneElements();
    if (next[i]) { next[i][prop] = value; commitElements(next); }
  }
  function moveElement(i, dir) {
    const next = cloneElements();
    const j = i + dir;
    if (j < 0 || j >= next.length) return;
    const [moved] = next.splice(i, 1);
    next.splice(j, 0, moved);
    commitElements(next);
  }
  let expandedElementId = $state('');
  function toggleElementExtras(key) { expandedElementId = expandedElementId === key ? '' : key; }

  // Which controls count as "@active" (empty = any control).
  let activeScope = $derived(Array.isArray(pixel?.activeScope) ? pixel.activeScope : []);
  function addScope() { set('activeScope', [...activeScope, '']); }
  function setScope(i, id) { const next = [...activeScope]; next[i] = id; set('activeScope', next); }
  function removeScope(i) { const next = [...activeScope]; next.splice(i, 1); set('activeScope', next); }
</script>

{#if pixel}
  <div class="lcd-inspector">
  <PropertySection title="Screen">
    <PropertyCell label="Pixels W" span={2} hint="Grid resolution: pixel columns. All element coordinates refer to this grid.">
      <NumberInput value={pixel.pixelsW ?? 128} step={1} min={8} max={1024} onchange={(value) => set('pixelsW', Math.round(value))} />
    </PropertyCell>
    <PropertyCell label="Pixels H" span={2} hint="Grid resolution: pixel rows.">
      <NumberInput value={pixel.pixelsH ?? 64} step={1} min={8} max={1024} onchange={(value) => set('pixelsH', Math.round(value))} />
    </PropertyCell>
    <PropertyCell label="Grid" span={2} hint="The working resolution all X/Y/W/H values refer to.">
      <span class="hint-note">{pixelsW} × {pixelsH} px</span>
    </PropertyCell>
    <PropertyCell label="Palette" span={2} hint="Ready-made lit/unlit/backlight colour set. Colours stay editable below.">
      <select class="val" value={pixel.palette ?? 'oledWhite'} onchange={(event) => applyPalette(event.target.value)}>
        {#each paletteEntries as [id, entry]}
          <option value={id}>{entry.label}</option>
        {/each}
      </select>
    </PropertyCell>
    <PropertyCell label="Image" span={3} hint="Static image dithered onto the grid (drawn behind the elements). Clear to remove.">
      <input class="val" type="file" accept="image/*" onchange={onPickImage} />
    </PropertyCell>
    <PropertyCell label="Dither" span={1} hint="Floyd–Steinberg dither vs hard threshold.">
      <PropertyToggle value={pixel.imageDither !== false} onchange={() => toggle('imageDither', true)} />
    </PropertyCell>
    {#if pixel.imageSrc}
      <PropertyCell label="Clear Image" span={4} hint="Remove the image.">
        <button class="val add-field" type="button" onclick={() => set('imageSrc', '')}>Clear image</button>
      </PropertyCell>
    {/if}
  </PropertySection>

  <PropertySection title="Layouts">
    {#if layouts.length === 0}
      <PropertyCell label="Layouts" span={4} hint="Multiple element scenes for the same screen, switched by the Pages rules. Enabling moves the current elements into Layout 1.">
        <button class="val add-field" type="button" onclick={() => addLayout()}>+ Enable layouts</button>
      </PropertyCell>
    {:else}
      <PropertyCell label="Edit / Preview Layout" span={4} hint="Which layout the Elements table edits AND previews on the canvas. Runtime switching follows the Pages rules.">
        <div class="field-row">
          <select class="val" value={String(editLayout?.id ?? '')} onchange={(event) => selectEditLayout(event.target.value)}>
            {#each layouts as l}
              <option value={String(l.id)}>{l.name ?? l.id}</option>
            {/each}
          </select>
          <button class="val erm" type="button" onclick={() => addLayout()} title="Add layout">＋</button>
          <button class="val erm" type="button" onclick={() => removeLayout(editLayout?.id)} title="Remove layout">✕</button>
        </div>
      </PropertyCell>
      <PropertyCell label="Name" span={4} hint="Layout name (used by the Pages rules).">
        <input class="val" type="text" value={editLayout?.name ?? ''} oninput={(event) => renameLayout(editLayout?.id, event.target.value)} />
      </PropertyCell>
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
        <PropertyCell label={`When = ${m.when ?? ''}`} span={4} hint="Selector value → layout to show.">
          <div class="field-row">
            {#if selectorOptions}
              <select class="val" title="Selector value" value={String(m.when ?? '')} onchange={(event) => setSelectorRow(i, 'when', event.target.value)}>
                <option value="">(value)</option>
                {#each selectorOptions as opt}
                  <option value={opt.value}>{opt.label}</option>
                {/each}
              </select>
            {:else}
              <input class="val en" type="text" title="Selector value" placeholder="value" value={m.when ?? ''} oninput={(event) => setSelectorRow(i, 'when', event.target.value)} />
            {/if}
            <select class="val" title="Layout" value={String(m.layoutId ?? '')} onchange={(event) => setSelectorRow(i, 'layoutId', event.target.value)}>
              {#each layouts as l}
                <option value={String(l.id)}>{l.name ?? l.id}</option>
              {/each}
            </select>
            <button class="val erm" type="button" onclick={() => removeSelectorRow(i)} title="Remove">✕</button>
          </div>
        </PropertyCell>
      {/each}
      <PropertyCell label="Map" span={4} hint="Add a selector value → layout mapping.">
        <button class="val add-field" type="button" onclick={() => addSelectorRow()}>+ Add page mapping</button>
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
            <select class="val en2" title="Dismiss" value={ov.dismiss ?? 'timer'} onchange={(event) => setOverlay(i, 'dismiss', event.target.value)}>
              <option value="timer">for</option>
              <option value="untilChange">until</option>
            </select>
            {#if (ov.dismiss ?? 'timer') === 'timer'}
              <input class="val en" type="number" min="0" title="Duration ms" value={ov.duration ?? 800} onchange={(event) => setOverlay(i, 'duration', Math.round(Number(event.target.value)))} />
            {/if}
            <button class="val erm" type="button" onclick={() => removeOverlay(i)} title="Remove">✕</button>
          </div>
        </PropertyCell>
      {/each}
      <PropertyCell label="Overlays" span={4} hint="Add a transient page shown on a control change (for N ms, or until a change).">
        <button class="val add-field" type="button" onclick={() => addOverlay()}>+ Add overlay page</button>
      </PropertyCell>
    </PropertySection>
  {/if}

  <PropertySection title="Elements">
    {#if elements.length > 0}
      <div class="el-head">
        <span class="el-num">#</span>
        <span class="esel">Kind</span>
        <span class="en">X</span>
        <span class="en">Y</span>
        <span class="en">W</span>
        <span class="en">H</span>
        <span class="esel">Source</span>
        <span class="erm"></span>
        <span class="erm"></span>
      </div>
    {/if}
    {#each elements as el, i (el.id ?? i)}
      <div class="el-row">
        <span class="el-num" title="Element">#{i + 1}</span>
        <select class="val esel" title="Element kind" value={el.kind ?? 'vbar'} onchange={(event) => setElement(i, 'kind', event.target.value)}>
          {#each ELEMENT_KINDS as kind}
            <option value={kind}>{kind}</option>
          {/each}
        </select>
        <input class="val en" type="number" title="X (px)" value={el.x ?? 0} onchange={(event) => setElement(i, 'x', Math.round(Number(event.target.value)))} />
        <input class="val en" type="number" title="Y (px)" value={el.y ?? 0} onchange={(event) => setElement(i, 'y', Math.round(Number(event.target.value)))} />
        <input class="val en" type="number" title="Width (px); for text: alignment/clip box (0 = none)" value={el.w ?? 0} onchange={(event) => setElement(i, 'w', Math.round(Number(event.target.value)))} />
        <input class="val en" type="number" title="Height (px); for text: font height" value={el.h ?? 8} onchange={(event) => setElement(i, 'h', Math.round(Number(event.target.value)))} />
        {#if el.kind === 'static'}
          <input class="val etext" type="text" placeholder="caption text" value={el.text ?? ''} oninput={(event) => setElement(i, 'text', event.target.value)} />
        {:else}
          <select class="val esel" title="Source component" value={el.sourceId ?? ''} onchange={(event) => setElement(i, 'sourceId', event.target.value)}>
            <option value="">(source)</option>
            <option value="@active">★ Active</option>
            {#each allSources as src}
              <option value={src.id}>{src.name}</option>
            {/each}
          </select>
        {/if}
        <button class="val erm" type="button" class:eopen={expandedElementId === String(el.id ?? i)} onclick={() => toggleElementExtras(String(el.id ?? i))} title="More element settings">…</button>
        <button class="val erm" type="button" onclick={() => removeElement(i)} title="Remove element">✕</button>
      </div>
      {#if expandedElementId === String(el.id ?? i)}
        <div class="el-extra">
          <span class="ex-lab">Align</span>
          <select class="val en2" title="Text alignment within the W box" value={el.align ?? 'left'} onchange={(event) => setElement(i, 'align', event.target.value)}>
            <option value="left">L</option>
            <option value="center">C</option>
            <option value="right">R</option>
          </select>
          <span class="ex-lab">Pre</span>
          <input class="val en2" type="text" title="Prefix text" value={el.prefix ?? ''} oninput={(event) => setElement(i, 'prefix', event.target.value)} />
          <span class="ex-lab">Suf</span>
          <input class="val en2" type="text" title="Suffix text" value={el.suffix ?? ''} oninput={(event) => setElement(i, 'suffix', event.target.value)} />
          <span class="ex-lab">Dec</span>
          <input class="val en" type="number" min="0" max="6" title="Decimal places (value kind)" value={el.precision ?? 0} onchange={(event) => setElement(i, 'precision', Math.max(0, Math.round(Number(event.target.value))))} />
          <span class="ex-lab">Lbl</span>
          <input class="val etext" type="text" title="Widgets: caption drawn under the widget (above it at the bottom edge). Name kind: overrides the source name." placeholder="(caption)" value={el.label ?? ''} oninput={(event) => setElement(i, 'label', event.target.value)} />
          <span class="ex-lab">Vis</span>
          <select class="val en2" title="Element visible" value={el.visible === false ? 'off' : 'on'} onchange={(event) => setElement(i, 'visible', event.target.value !== 'off')}>
            <option value="on">on</option>
            <option value="off">off</option>
          </select>
          {#if WIDGET_KINDS.includes(el.kind)}
            <span class="ex-lab">Frame</span>
            <select class="val en2" title="Outline frame" value={el.frame === true ? 'on' : 'off'} onchange={(event) => setElement(i, 'frame', event.target.value === 'on')}>
              <option value="off">off</option>
              <option value="on">on</option>
            </select>
            <span class="ex-lab">Ticks</span>
            <select class="val en2" title="Tick marks" value={el.ticks === true ? 'on' : 'off'} onchange={(event) => setElement(i, 'ticks', event.target.value === 'on')}>
              <option value="off">off</option>
              <option value="on">on</option>
            </select>
            <span class="ex-lab">Peak</span>
            <select class="val en2" title="Peak-hold marker (bars)" value={el.peakHold === true ? 'on' : 'off'} onchange={(event) => setElement(i, 'peakHold', event.target.value === 'on')}>
              <option value="off">off</option>
              <option value="on">on</option>
            </select>
            <span class="ex-lab">Smooth</span>
            <select class="val en2" title="Meter ballistics (smoothed movement)" value={el.smooth === true ? 'on' : 'off'} onchange={(event) => setElement(i, 'smooth', event.target.value === 'on')}>
              <option value="off">off</option>
              <option value="on">on</option>
            </select>
          {/if}
          <button class="val erm" type="button" onclick={() => moveElement(i, -1)} title="Move up (paints earlier)" disabled={i === 0}>▲</button>
          <button class="val erm" type="button" onclick={() => moveElement(i, 1)} title="Move down (paints later, wins overlaps)" disabled={i === elements.length - 1}>▼</button>
        </div>
      {/if}
    {/each}
    <PropertyCell label="Elements" span={4} hint="Add a pixel-addressed element: text kinds draw at X/Y with font height H; widget kinds (bars/sliders/needle) fill the X/Y/W/H rect.">
      <button class="val add-field" type="button" onclick={() => addElement()}>+ Add element</button>
    </PropertyCell>

    <PropertyCell label="@active scope" span={4} hint="Restrict the ★ Active source to these controls. Empty = any control counts.">
      <span class="hint-note">{activeScope.length === 0 ? 'Any control' : `${activeScope.length} control(s)`}</span>
    </PropertyCell>
    {#each activeScope as sid, i (i)}
      <PropertyCell label={`In scope ${i + 1}`} span={4} hint="A control that counts toward ★ Active.">
        <div class="field-row">
          <select class="val" value={sid ?? ''} onchange={(event) => setScope(i, event.target.value)}>
            <option value="">(control)</option>
            {#each allSources as src}
              <option value={src.id}>{src.name}</option>
            {/each}
          </select>
          <button class="val erm" type="button" onclick={() => removeScope(i)} title="Remove">✕</button>
        </div>
      </PropertyCell>
    {/each}
    <PropertyCell label="Scope" span={4} hint="Add a control that ★ Active may follow.">
      <button class="val add-field" type="button" onclick={() => addScope()}>+ Add to @active scope</button>
    </PropertyCell>
  </PropertySection>

  <PropertySection title="Animation">
    <PropertyCell label="Mode" span={4} hint="Dot-matrix animation played behind the elements. File = GIF/APNG or a sprite sheet; Preset = built-in effects.">
      <select class="val" value={pixel.animMode ?? 'off'} onchange={(event) => set('animMode', event.target.value)}>
        <option value="off">Off</option>
        <option value="file">File (GIF / sprite sheet)</option>
        <option value="preset">Preset</option>
      </select>
    </PropertyCell>
    {#if String(pixel.animMode ?? 'off') === 'file'}
      <PropertyCell label="File" span={4} hint="Animated GIF/APNG/WebP (decoded frame-by-frame), or one image holding sprite frames side-by-side.">
        <input class="val" type="file" accept="image/*" onchange={onPickAnim} />
      </PropertyCell>
      <PropertyCell label="Frames" span={2} hint="Sprite-sheet frame count. 0 = the file is an animated GIF/APNG.">
        <NumberInput value={pixel.animFrames ?? 0} step={1} min={0} max={180} onchange={(value) => set('animFrames', Math.round(value))} />
      </PropertyCell>
      <PropertyCell label="FPS" span={1} hint="Sprite-sheet playback rate.">
        <NumberInput value={pixel.animFps ?? 12} step={1} min={1} max={60} onchange={(value) => set('animFps', Math.round(value))} />
      </PropertyCell>
      <PropertyCell label="Loop" span={1} hint="Loop forever, or hold the last frame.">
        <PropertyToggle value={pixel.animLoop !== false} onchange={() => toggle('animLoop', true)} />
      </PropertyCell>
      {#if pixel.animSrc}
        <PropertyCell label="Clear" span={4} hint="Remove the animation file.">
          <button class="val add-field" type="button" onclick={() => set('animSrc', '')}>Clear animation</button>
        </PropertyCell>
      {/if}
    {/if}
    {#if String(pixel.animMode ?? 'off') === 'preset'}
      <PropertyCell label="Preset" span={2} hint="Built-in dot-matrix effect.">
        <select class="val" value={pixel.animPreset ?? 'wave'} onchange={(event) => set('animPreset', event.target.value)}>
          <option value="wave">Wave</option>
          <option value="scanner">Scanner</option>
          <option value="rain">Rain</option>
          <option value="starfield">Starfield</option>
          <option value="spinner">Spinner</option>
          <option value="plasma">Plasma</option>
        </select>
      </PropertyCell>
      <PropertyCell label="Speed" span={2} hint="Preset speed multiplier.">
        <NumberInput value={pixel.animSpeed ?? 1} step={0.1} min={0.1} max={5} onchange={(value) => set('animSpeed', value)} />
      </PropertyCell>
    {/if}
  </PropertySection>

  <PropertySection title="Colour">
    <PropertyCell label="Lit" span={2} hint="Lit dot colour, AARRGGBB.">
      <input class="val" type="text" value={pixel.litColour ?? 'FFF2F2F2'} onchange={(event) => set('litColour', event.target.value.trim())} />
    </PropertyCell>
    <PropertyCell label="Unlit" span={2} hint="Faint unlit 'ghost' dot colour, AARRGGBB.">
      <input class="val" type="text" value={pixel.unlitColour ?? '14FFFFFF'} onchange={(event) => set('unlitColour', event.target.value.trim())} />
    </PropertyCell>
    <PropertyCell label="Screen" span={2} hint="Screen substrate behind the dots, AARRGGBB.">
      <input class="val" type="text" value={pixel.screenColour ?? 'FF000000'} onchange={(event) => set('screenColour', event.target.value.trim())} />
    </PropertyCell>
    <PropertyCell label="Backlight" span={2} hint="Backlight wash colour, AARRGGBB.">
      <input class="val" type="text" value={pixel.backlightColour ?? '00000000'} onchange={(event) => set('backlightColour', event.target.value.trim())} />
    </PropertyCell>
    <PropertyCell label="Glass" span={2} hint="Glass sheen overlay colour, AARRGGBB.">
      <input class="val" type="text" value={pixel.glassTint ?? '14FFFFFF'} onchange={(event) => set('glassTint', event.target.value.trim())} />
    </PropertyCell>
  </PropertySection>

  <PropertySection title="Lighting">
    <PropertyCell label="Backlight" span={2} hint="Turn the backlight wash on or off.">
      <PropertyToggle value={pixel.backlightOn !== false} onchange={() => toggle('backlightOn', true)} />
    </PropertyCell>
    <PropertyCell label="Brightness" span={2} hint="Dot intensity (0–100).">
      <NumberInput value={pixel.brightness ?? 100} step={5} min={0} max={100} onchange={(value) => set('brightness', value)} />
    </PropertyCell>
    <PropertyCell label="Contrast" span={2} hint="Ghost/backlight strength (0–100).">
      <NumberInput value={pixel.contrast ?? 55} step={5} min={0} max={100} onchange={(value) => set('contrast', value)} />
    </PropertyCell>
    <PropertyCell label="Ghost dots" span={2} hint="Faint unlit dots (realism cue).">
      <PropertyToggle value={pixel.showGhost !== false} onchange={() => toggle('showGhost', true)} />
    </PropertyCell>
    <PropertyCell label="Bright Src" span={2} hint="Drive Brightness live from a slider/knob/number in preview.">
      <select class="val" value={pixel.brightnessSourceId ?? ''} onchange={(event) => set('brightnessSourceId', event.target.value)}>
        <option value="">None</option>
        {#each valueSources as src}
          <option value={src.id}>{src.name}</option>
        {/each}
      </select>
    </PropertyCell>
    <PropertyCell label="Backlt Src" span={2} hint="Drive the backlight on/off live from a toggle/button in preview.">
      <select class="val" value={pixel.backlightSourceId ?? ''} onchange={(event) => set('backlightSourceId', event.target.value)}>
        <option value="">None</option>
        {#each allSources as src}
          <option value={src.id}>{src.name}</option>
        {/each}
      </select>
    </PropertyCell>
    <PropertyCell label="Scanlines" span={2} hint="Horizontal scanline overlay.">
      <PropertyToggle value={pixel.showScanlines === true} onchange={() => toggle('showScanlines', false)} />
    </PropertyCell>
    <PropertyCell label="Glass sheen" span={2} hint="Diagonal glass reflection overlay.">
      <PropertyToggle value={pixel.showGlass !== false} onchange={() => toggle('showGlass', true)} />
    </PropertyCell>
    <PropertyCell label="Dot Shape" span={2} hint="Round (LCD/OLED) or square (blockier) dots.">
      <select class="val" value={pixel.dotShape ?? 'round'} onchange={(event) => set('dotShape', event.target.value)}>
        <option value="round">Round</option>
        <option value="square">Square</option>
      </select>
    </PropertyCell>
    <PropertyCell label="Padding" span={2} hint="Inset from the bezel to the screen (px).">
      <NumberInput value={pixel.padding ?? 8} step={1} min={0} onchange={(value) => set('padding', value)} />
    </PropertyCell>
  </PropertySection>
  </div>
{/if}

<style>
  .val {
    width: 100%;
    box-sizing: border-box;
    background: #1A1A1A;
    border: 1px solid #333;
    color: #DDD;
    border-radius: 4px;
    padding: 3px 6px;
    font-size: 12px;
  }

  .field-row {
    display: flex;
    gap: 4px;
    align-items: center;
  }

  .add-field {
    cursor: pointer;
    text-align: center;
  }

  .hint-note {
    font-size: 11px;
    color: #8a8a8a;
  }

  .el-head,
  .el-row {
    grid-column: span 4;
    display: flex;
    flex-wrap: nowrap;
    gap: 3px;
    align-items: center;
  }

  .el-head {
    padding-bottom: 2px;
    border-bottom: 1px solid #333;
  }

  .el-head span {
    font-size: 10px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.03em;
    color: #8a8a8a;
    text-align: center;
    box-sizing: border-box;
  }

  .el-head .esel { text-align: left; }

  .el-num {
    flex: 0 0 auto;
    min-width: 24px;
    text-align: center;
    font-size: 11px;
    font-weight: 600;
    color: #8a8a8a;
  }

  .el-head .en,
  .el-row .en {
    width: 44px;
    flex: 0 0 auto;
    text-align: center;
  }

  .el-extra .en {
    width: 44px;
    flex: 0 0 auto;
    text-align: center;
  }

  .el-extra .en2 {
    width: 48px;
    flex: 0 0 auto;
  }

  .el-head .esel,
  .el-row .esel {
    flex: 1 1 70px;
    min-width: 56px;
    max-width: 120px;
  }

  .el-row .etext {
    flex: 1 1 80px;
    min-width: 60px;
  }

  .el-extra .etext {
    flex: 1 1 70px;
    min-width: 50px;
    max-width: 180px;
  }

  .el-head .erm,
  .el-row .erm,
  .el-extra .erm {
    width: 26px;
    flex: 0 0 auto;
    margin-left: 0;
    padding-left: 0;
    padding-right: 0;
    text-align: center;
    cursor: pointer;
  }

  .el-row .erm:first-of-type { margin-left: auto; }

  .el-row .eopen {
    background: #094771;
    color: #ddd;
  }

  .el-extra {
    grid-column: span 4;
    display: flex;
    flex-wrap: wrap;
    gap: 3px;
    align-items: center;
    padding: 3px 0 5px 24px;
    border-bottom: 1px solid #2a2a2a;
  }

  .ex-lab {
    flex: 0 0 auto;
    font-size: 10px;
    text-transform: uppercase;
    color: #8a8a8a;
  }

  .el-extra .erm:disabled {
    opacity: 0.4;
    cursor: default;
  }
</style>
