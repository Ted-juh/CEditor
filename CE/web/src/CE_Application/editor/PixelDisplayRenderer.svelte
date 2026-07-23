<script>
  // PixelDisplay — a free-pixel dot-matrix surface (OLED/GLCD style). Unlike the
  // LCD's character/segment grids, everything here is pixel-addressed: elements
  // live at (x, y, w, h) on a pixelsW × pixelsH grid. Text elements rasterise at
  // their position with a per-element font height; widget elements (bars,
  // sliders, needle) fill their rect; an animation layer plays behind.
  import { onDestroy } from 'svelte';
  import LcdGraphicCanvas from './LcdGraphicCanvas.svelte';
  import { resolveZoneContent, infoFraction, WIDGET_ZONE_KINDS, resolveActiveLayoutId, findLayout } from '../utils/lcdZones.js';
  import { lcdDesignLayoutIds } from '../stores/lcdDesignLayout.js';
  import { updateControlProperty } from '../stores/controls.js';

  let { control = null, allControls = [], width = 0, height = 0, editable = false, scale = 1 } = $props();

  let pixel = $derived(control?._children?.Pixel ?? null);
  let coreId = $derived(String(control?._children?.Core?.id ?? ''));

  function numberOr(value, fallback = 0) {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : fallback;
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  // AARRGGBB / RRGGBB hex → css rgba().
  function cssColour(value, fallback = 'transparent') {
    const raw = String(value ?? '').trim();
    if (/^[0-9a-f]{8}$/i.test(raw)) {
      const a = parseInt(raw.slice(0, 2), 16) / 255;
      const r = parseInt(raw.slice(2, 4), 16);
      const g = parseInt(raw.slice(4, 6), 16);
      const b = parseInt(raw.slice(6, 8), 16);
      return `rgba(${r}, ${g}, ${b}, ${a.toFixed(3)})`;
    }
    if (/^[0-9a-f]{6}$/i.test(raw)) return `#${raw}`;
    return raw || fallback;
  }

  let pixW = $derived(Math.max(8, Math.round(numberOr(pixel?.pixelsW, 128))));
  let pixH = $derived(Math.max(8, Math.round(numberOr(pixel?.pixelsH, 64))));
  let padding = $derived(Math.max(0, numberOr(pixel?.padding, 8)));
  let brightness = $derived(clamp(numberOr(pixel?.brightness, 100), 0, 100) / 100);
  let contrast = $derived(clamp(numberOr(pixel?.contrast, 55), 0, 100) / 100);

  let litCss = $derived(cssColour(pixel?.litColour ?? 'FFF2F2F2', '#F2F2F2'));
  let unlitCss = $derived(cssColour(pixel?.unlitColour ?? '14FFFFFF', 'rgba(255,255,255,0.08)'));
  let screenCss = $derived(cssColour(pixel?.screenColour ?? 'FF000000', '#000'));
  let backlightCss = $derived(cssColour(pixel?.backlightColour ?? '00000000', 'transparent'));
  let glassTintCss = $derived(cssColour(pixel?.glassTint ?? '14FFFFFF', 'rgba(255,255,255,0.08)'));

  let screenW = $derived(Math.max(1, numberOr(width, 0) - padding * 2));
  let screenH = $derived(Math.max(1, numberOr(height, 0) - padding * 2));

  let backlightOn = $derived(pixel?.backlightOn !== false);
  let showGhost = $derived(pixel?.showGhost !== false);
  let showScanlines = $derived(pixel?.showScanlines === true);
  let showGlass = $derived(pixel?.showGlass !== false);
  let dotShape = $derived(String(pixel?.dotShape ?? 'round').trim().toLowerCase());

  // Live info about a source: preview-injected (__live), else static defaults.
  function controlInfo(sourceId) {
    const id = String(sourceId ?? '');
    if (!id) return null;
    const live = pixel?.__live?.[id];
    const ctrl = (Array.isArray(allControls) ? allControls : [])
      .find((c) => String(c?._children?.Core?.id ?? '') === id);
    if (!live && !ctrl) return null;
    const behavior = ctrl?._children?.Behavior ?? null;
    const min = live?.min ?? numberOr(behavior?.min, 0);
    const max = live?.max ?? numberOr(behavior?.max, 127);
    const fallbackValue = numberOr(behavior?.defaultValue ?? behavior?.defaultStartValue, min);
    return {
      present: true,
      name: String(live?.name ?? ctrl?._children?.Core?.name ?? id),
      value: numberOr(live?.value, fallbackValue),
      min,
      max,
      text: String(live?.text ?? ctrl?._children?.Text?.content ?? ''),
      on: live?.on === true,
    };
  }

  // Layouts/pages: when layouts exist, the active layout's elements replace the
  // flat list. Active = preview-injected (__page), else the inspector's design
  // selection (transient store), else the Pages default.
  let layouts = $derived(Array.isArray(pixel?.layouts) ? pixel.layouts : []);
  let hasLayouts = $derived(layouts.length > 0);
  let activeLayoutId = $derived.by(() => {
    if (!hasLayouts) return '';
    const injected = pixel?.__page?.activeLayoutId;
    if (injected) return String(injected);
    const design = String($lcdDesignLayoutIds[coreId] ?? '');
    if (design && findLayout(layouts, design)) return design;
    return resolveActiveLayoutId(pixel?.pages ?? {}, layouts, {});
  });
  let elements = $derived.by(() => {
    if (hasLayouts) {
      const layout = findLayout(layouts, activeLayoutId);
      return Array.isArray(layout?.elements) ? layout.elements : [];
    }
    return Array.isArray(pixel?.elements) ? pixel.elements : [];
  });

  // Text elements → pixel-positioned strings for the canvas. Widget elements
  // with a label get a small caption drawn under the widget (above it when the
  // widget sits at the bottom edge).
  const WIDGET_LABEL_H = 7;
  let texts = $derived.by(() => {
    const out = [];
    for (const el of elements) {
      const kind = String(el?.kind ?? '');
      if (el?.visible === false || !kind) continue;
      if (WIDGET_ZONE_KINDS.has(kind)) {
        const label = String(el?.label ?? '').trim();
        if (!label) continue;
        const x = Math.round(numberOr(el?.x, 0));
        const y = Math.round(numberOr(el?.y, 0));
        const w = Math.max(1, Math.round(numberOr(el?.w, 10)));
        const h = Math.max(1, Math.round(numberOr(el?.h, 10)));
        const below = y + h + 1;
        out.push({
          x,
          y: below + WIDGET_LABEL_H <= pixH ? below : Math.max(0, y - WIDGET_LABEL_H - 1),
          w,
          h: WIDGET_LABEL_H,
          align: 'center',
          content: label,
          colour: el?.colour ? cssColour(el.colour) : '',
        });
        continue;
      }
      const info = controlInfo(String(el?.sourceId ?? ''));
      // Reuse the zone content engine (element kinds mirror zone show kinds).
      const content = resolveZoneContent({ ...el, show: kind }, info, 16);
      if (content === '') continue;
      out.push({
        x: Math.round(numberOr(el?.x, 0)),
        y: Math.round(numberOr(el?.y, 0)),
        w: Math.max(0, Math.round(numberOr(el?.w, 0))),
        h: Math.max(3, Math.round(numberOr(el?.h, 8))),
        align: String(el?.align ?? 'left'),
        content,
        colour: el?.colour ? cssColour(el.colour) : '',
      });
    }
    return out;
  });

  // Widget elements → pixel-rect widgets for the canvas.
  let pixelWidgets = $derived.by(() => {
    const out = [];
    for (const el of elements) {
      const kind = String(el?.kind ?? '');
      if (el?.visible === false || !WIDGET_ZONE_KINDS.has(kind)) continue;
      const info = controlInfo(String(el?.sourceId ?? ''));
      out.push({
        id: String(el?.id ?? ''),
        kind,
        px: true,
        x: Math.round(numberOr(el?.x, 0)),
        y: Math.round(numberOr(el?.y, 0)),
        w: Math.max(1, Math.round(numberOr(el?.w, 10))),
        h: Math.max(1, Math.round(numberOr(el?.h, 10))),
        frac: info ? infoFraction(info) : 0,
        frame: el?.frame === true,
        ticks: el?.ticks === true,
        peakHold: el?.peakHold === true,
        smooth: el?.smooth === true,
        colour: el?.colour ? cssColour(el.colour) : '',
        meterColours: el?.meterColours === true,
      });
    }
    return out;
  });

  // --- Design-mode element dragging ---
  // Handles overlay each element on the screen (when the control is selected in
  // design mode) and drag writes the element's x/y back in grid pixels.
  let dragEl = $state(null); // { i, cx, cy, x, y }

  function elementPathPrefix(i) {
    if (hasLayouts) {
      const li = layouts.findIndex((l) => String(l?.id ?? '') === String(activeLayoutId));
      if (li < 0) return '';
      return `Pixel.layouts.${li}.elements.${i}`;
    }
    return `Pixel.elements.${i}`;
  }

  let overlayBoxes = $derived.by(() => {
    if (!editable) return [];
    const sx = screenW / pixW;
    const sy = screenH / pixH;
    const out = [];
    elements.forEach((el, i) => {
      if (el?.visible === false) return;
      const kind = String(el?.kind ?? '');
      const h = Math.max(3, Math.round(numberOr(el?.h, 8)));
      let w = Math.max(0, Math.round(numberOr(el?.w, 0)));
      // Text without an alignment box: estimate the grab area from the content.
      if (!WIDGET_ZONE_KINDS.has(kind) && kind !== 'anim' && w <= 0) {
        const len = Math.max(2, String(el?.text ?? el?.kind ?? '').length);
        w = Math.ceil(h * 0.6 * len);
      }
      out.push({
        i,
        left: numberOr(el?.x, 0) * sx,
        top: numberOr(el?.y, 0) * sy,
        width: Math.max(6, w * sx),
        height: Math.max(6, h * sy),
      });
    });
    return out;
  });

  function startElementDrag(box, event) {
    if (event.button !== 0) return;
    event.stopPropagation();
    event.preventDefault();
    const el = elements[box.i];
    if (!el) return;
    dragEl = { i: box.i, cx: event.clientX, cy: event.clientY, x: numberOr(el.x, 0), y: numberOr(el.y, 0) };
    window.addEventListener('mousemove', onElementDragMove);
    window.addEventListener('mouseup', endElementDrag);
  }

  function onElementDragMove(event) {
    if (!dragEl) return;
    const s = Math.max(0.01, Number(scale) || 1);
    const gx = (event.clientX - dragEl.cx) / s / (screenW / pixW);
    const gy = (event.clientY - dragEl.cy) / s / (screenH / pixH);
    const el = elements[dragEl.i];
    const prefix = elementPathPrefix(dragEl.i);
    if (!el || !prefix || !coreId) return;
    const w = Math.min(pixW, Math.max(1, Math.round(numberOr(el.w, 1))));
    const h = Math.min(pixH, Math.max(1, Math.round(numberOr(el.h, 8))));
    const nx = Math.round(clamp(dragEl.x + gx, 0, Math.max(0, pixW - w)));
    const ny = Math.round(clamp(dragEl.y + gy, 0, Math.max(0, pixH - h)));
    if (nx !== numberOr(el.x, 0)) updateControlProperty(coreId, `${prefix}.x`, nx);
    if (ny !== numberOr(el.y, 0)) updateControlProperty(coreId, `${prefix}.y`, ny);
  }

  function endElementDrag() {
    dragEl = null;
    window.removeEventListener('mousemove', onElementDragMove);
    window.removeEventListener('mouseup', endElementDrag);
  }

  onDestroy(() => endElementDrag());

  // Placeable animation elements (kind 'anim'): their own rect + source, part
  // of the layout — so switching layouts switches animations.
  let animElements = $derived.by(() => {
    const out = [];
    for (const el of elements) {
      if (el?.visible === false || String(el?.kind ?? '') !== 'anim') continue;
      out.push({
        id: String(el?.id ?? ''),
        x: Math.round(numberOr(el?.x, 0)),
        y: Math.round(numberOr(el?.y, 0)),
        w: Math.max(4, Math.round(numberOr(el?.w, 32))),
        h: Math.max(4, Math.round(numberOr(el?.h, 16))),
        mode: String(el?.animMode ?? (el?.animSrc ? 'file' : 'preset')),
        src: String(el?.animSrc ?? ''),
        frames: Math.max(0, Math.round(numberOr(el?.animFrames, 0))),
        fps: Math.max(1, numberOr(el?.animFps, 12)),
        loop: el?.animLoop !== false,
        preset: String(el?.animPreset ?? 'wave'),
        speed: Math.max(0.05, numberOr(el?.animSpeed, 1)),
        colour: el?.colour ? cssColour(el.colour) : '',
        colourful: el?.animColour === true,
      });
    }
    return out;
  });

  // rAF clock for animations and widget ballistics.
  let frameTime = $state(0);
  let animMode = $derived(String(pixel?.animMode ?? 'off').trim().toLowerCase());
  let animActive = $derived(animMode !== 'off' || animElements.length > 0);
  let widgetMotion = $derived(pixelWidgets.some((w) => w.smooth || w.peakHold));
  let motionActive = $derived(animActive || widgetMotion);

  $effect(() => {
    if (!motionActive) {
      frameTime = 0;
      return;
    }
    let raf = 0;
    let origin = -1;
    const loop = (t) => {
      if (origin < 0) origin = t;
      frameTime = t - origin;
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  });

  // Surface layers (bezel inset, backlight wash, scanlines, glass) — same look
  // and feel as the LCD so the two displays sit together visually.
  let surfaceStyle = $derived(`inset:${padding}px; background:${screenCss}; border-radius:5px;`);
  let backlightStyle = $derived(
    `background: radial-gradient(120% 140% at 50% 42%, ${backlightCss}, transparent 78%); opacity:${(0.35 + contrast * 0.5).toFixed(3)};`
  );
  let scanlineStyle = $derived(
    `background: repeating-linear-gradient(0deg, rgba(0,0,0,0.28) 0px, rgba(0,0,0,0.28) 1px, transparent 1px, transparent 3px);`
  );
</script>

{#if pixel}
  <div class="pixel-surface" style={surfaceStyle}>
    {#if backlightOn}
      <div class="pixel-layer" style={backlightStyle}></div>
    {/if}

    <LcdGraphicCanvas
      lines={[]}
      cols={1}
      rows={1}
      {litCss}
      {unlitCss}
      {brightness}
      {contrast}
      {showGhost}
      blinkOn={true}
      dotShape={dotShape}
      imageSrc={pixel?.imageSrc ?? ''}
      dither={pixel?.imageDither !== false}
      imageColour={pixel?.imageColour === true}
      animColour={pixel?.animColour === true}
      pixelWidth={pixW}
      pixelHeight={pixH}
      widgets={pixelWidgets}
      {texts}
      anims={animElements}
      animMode={animMode}
      animSrc={pixel?.animSrc ?? ''}
      animFrames={numberOr(pixel?.animFrames, 0)}
      animFps={numberOr(pixel?.animFps, 12)}
      animLoop={pixel?.animLoop !== false}
      animPreset={pixel?.animPreset ?? 'wave'}
      animSpeed={numberOr(pixel?.animSpeed, 1)}
      animTick={frameTime}
      width={screenW}
      height={screenH}
    />

    {#if showScanlines}
      <div class="pixel-layer" style={scanlineStyle}></div>
    {/if}
    {#if showGlass}
      <div class="pixel-layer pixel-glass" style={`background:linear-gradient(155deg, ${glassTintCss}, transparent 55%);`}></div>
    {/if}

    {#if editable}
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      {#each overlayBoxes as box (box.i)}
        <div
          class="el-handle"
          class:dragging={dragEl?.i === box.i}
          style={`left:${box.left}px; top:${box.top}px; width:${box.width}px; height:${box.height}px;`}
          onmousedown={(event) => startElementDrag(box, event)}
          title="Drag to move element"
        ></div>
      {/each}
    {/if}
  </div>
{/if}

<style>
  .pixel-surface {
    position: absolute;
    inset: 0;
    overflow: hidden;
    box-sizing: border-box;
    pointer-events: none;
  }

  .pixel-layer {
    position: absolute;
    inset: 0;
    pointer-events: none;
  }

  .pixel-glass {
    mix-blend-mode: screen;
  }

  .el-handle {
    position: absolute;
    box-sizing: border-box;
    pointer-events: auto;
    cursor: move;
    border: 1px dashed transparent;
    border-radius: 2px;
    z-index: 5;
  }

  .el-handle:hover,
  .el-handle.dragging {
    border-color: rgba(91, 155, 213, 0.9);
    background: rgba(91, 155, 213, 0.12);
  }
</style>
