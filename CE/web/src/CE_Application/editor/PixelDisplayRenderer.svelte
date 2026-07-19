<script>
  // PixelDisplay — a free-pixel dot-matrix surface (OLED/GLCD style). Unlike the
  // LCD's character/segment grids, everything here is pixel-addressed: elements
  // live at (x, y, w, h) on a pixelsW × pixelsH grid. Text elements rasterise at
  // their position with a per-element font height; widget elements (bars,
  // sliders, needle) fill their rect; an animation layer plays behind.
  import LcdGraphicCanvas from './LcdGraphicCanvas.svelte';
  import { resolveZoneContent, infoFraction, WIDGET_ZONE_KINDS, resolveActiveLayoutId, findLayout } from '../utils/lcdZones.js';
  import { lcdDesignLayoutIds } from '../stores/lcdDesignLayout.js';

  let { control = null, allControls = [], width = 0, height = 0 } = $props();

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

  // Text elements → pixel-positioned strings for the canvas.
  let texts = $derived.by(() => {
    const out = [];
    for (const el of elements) {
      const kind = String(el?.kind ?? '');
      if (el?.visible === false || WIDGET_ZONE_KINDS.has(kind) || !kind) continue;
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
      });
    }
    return out;
  });

  // rAF clock for animations and widget ballistics.
  let frameTime = $state(0);
  let animMode = $derived(String(pixel?.animMode ?? 'off').trim().toLowerCase());
  let animActive = $derived(animMode !== 'off');
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
      pixelWidth={pixW}
      pixelHeight={pixH}
      widgets={pixelWidgets}
      {texts}
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
</style>
