<script>
  import EffectSurface from './EffectSurface.svelte';
  import { gradientToCSS } from '../../CE_Application/utils/gradientCSS.js';
  import { normalizeCorner } from '../../CE_Application/utils/cornerNormalization.js';
  import { buildInsetFillClipPath } from '../../CE_Application/utils/cornerPaths.js';
  import { plainBorderCSS } from '../../CE_Application/utils/plainBorderCSS.js';
  import { fileCache, loadFile } from '../../CE_Application/stores/fileCache.js';
  import { resolveStroke } from '../../CE_Application/utils/strokeResolver.js';
  import { fillShapeCSS, imageLayerStyle } from '../../CE_Application/utils/plainFillCSS.js';
  import { outlineBorderDepth, outlineInsetKey } from '../../CE_Application/utils/outlineBorder.js';
  import SegmentedBorder from './SegmentedBorder.svelte';
  import OutlineBorder from './OutlineBorder.svelte';

  // `absorbFill` — the caller has already painted this fill as `background` on an element it was
  // going to render anyway (utils/plainFillCSS.js), so drawing it here as well would double it.
  // Only ever passed true when plainFillCSS returned a style, and that only happens when exactly
  // one layer is visible — which is why this drops the whole loop rather than skipping one entry.
  //
  // `outline` — draw for an arbitrary shape instead of a box: `{ d, fillRule, insets }`, SVG path data in
  // this box's px (a combined shape, a flattened path; utils/booleanGroups.js). Fill layers are clipped
  // to it and the border is drawn as bands along it (utils/outlineBorder.js); Corners do not apply, the
  // outline is the shape. `insets[depth]` is the outline pulled inward by `depth`, for dotted borders
  // and fills clipped inside the border.
  let { background = null, width = 0, height = 0, absorbFill = false, outline = null } = $props();

  // The two border drawings that need SVG, the segmented one and the one along an outline, are
  // components of their own (SegmentedBorder.svelte, OutlineBorder.svelte), made only for a
  // background that draws one. Their code was here, and with it fourteen deriveds and some twenty
  // helper closures in every BackgroundRenderer, of which a custom component has six or seven,
  // while nearly every border on a panel is the plain CSS one.
  let fill = $derived(background?._children?.Fill);
  let border = $derived(background?._children?.Border);
  let corners = $derived(background?._children?.Corners);

  // Shorthand for the current corners section — the normalization util is
  // pure, but every call site here reads from the same `corners` prop.
  const getCornerNorm = (pos) => normalizeCorner(corners, pos);
  const DEFAULT_FILL_ORDER = ['solid', 'gradient', 'image', 'overlay'];

  // ============ FILL ============

  function legacyFillMode() {
    return background?.mode === 'none' ? 'overlay' : (background?.mode || 'solid');
  }

  function fillLayerOrder() {
    return fill?.layerOrder?.length ? fill.layerOrder : DEFAULT_FILL_ORDER;
  }

  function fillLayerEnabled(layerId) {
    if (layerId === 'solid') {
      return fill?.solidEnabled !== undefined ? fill.solidEnabled !== false : legacyFillMode() === 'solid';
    }
    if (layerId === 'gradient') {
      return fill?.gradientEnabled !== undefined ? fill.gradientEnabled === true : legacyFillMode() === 'gradient';
    }
    if (layerId === 'image') {
      return fill?.imageEnabled !== undefined ? fill.imageEnabled === true : legacyFillMode() === 'image';
    }
    if (layerId === 'overlay') {
      return fill?.overlayEnabled !== undefined ? fill.overlayEnabled === true : legacyFillMode() === 'overlay';
    }
    return false;
  }

  function fillLayerVisible(layerId) {
    if (!fillLayerEnabled(layerId)) return false;
    if (fill?.soloLayer && fill.soloLayer !== layerId) return false;
    if (fill?.[`${layerId}Muted`] === true) return false;
    return true;
  }

  function buildSolidFillStyle() {
    const hex = String(fill?.colour || 'FF3A3A3A');
    const blend = fill?.solidBlend ?? 'normal';
    if (hex.length === 8) {
      const opacity = parseInt(hex.slice(0, 2), 16) / 255;
      return `background: #${hex.slice(2)}; opacity: ${opacity.toFixed(3)}; mix-blend-mode: ${blend};`;
    }
    return `background: #${hex.slice(-6)}; mix-blend-mode: ${blend};`;
  }

  // The pseudo-panel translation lives in utils/plainFillCSS.js so the layered path and the
  // absorbed one build the same style from the same fields — see fillShapeCSS for the same reason.
  const buildImageFillStyle = (layerId, src) => imageLayerStyle(fill, layerId, src, width, height);

  function resolvedFillSource(src) {
    if (!src) return null;
    if (String(src).startsWith('data:')) return src;
    return $fileCache[src] ?? null;
  }

  function getBorderSide(side) {
    if (!border?.enabled) return null;
    return border.linked ? border : (border?.[side] ?? null);
  }

  function borderInnerInset(side) {
    const sideData = getBorderSide(side);
    if (!sideData || sideData.style === 'none' || (sideData.thickness ?? 0) <= 0) return 0;
    const resolved = resolveStroke(sideData.style, sideData.thickness || 2, '#FFFFFF', side, sideData.dotRadius || 2);
    let inset = resolved.totalThick;
    if (sideData.style === 'double') inset += sideData.doubleGap ?? 2;
    return Math.max(0, inset);
  }

  const outlineClip = (d, rule = 'evenodd') => (d ? `clip-path: path(${rule}, '${d}');` : 'clip-path: inset(50%);');

  function fillLayerClipCSS(layerId) {
    const clipMode = fill?.[`${layerId}ClipMode`] ?? 'shape';
    if (clipMode === 'none') return '';
    if (outline) {
      if (clipMode === 'border-inner') {
        const depth = outlineBorderDepth(border);
        if (depth > 0) return outlineClip(outline.insets?.[outlineInsetKey(depth)] ?? '');
      }
      return outlineClip(outline.d, outline.fillRule ?? 'evenodd');
    }
    if (clipMode === 'border-inner') {
      return buildInsetFillClipPath(
        { tl: getCornerNorm('tl'), tr: getCornerNorm('tr'), br: getCornerNorm('br'), bl: getCornerNorm('bl') },
        width,
        height,
        {
          left: borderInnerInset('left'),
          top: borderInnerInset('top'),
          right: borderInnerInset('right'),
          bottom: borderInnerInset('bottom'),
        }
      );
    }
    return fillCornerCSS;
  }

  $effect(() => {
    if (fill?.imageEnabled && fill?.imageSrc && !String(fill.imageSrc).startsWith('data:')) {
      loadFile(fill.imageSrc);
    }
    if (fill?.overlayEnabled && fill?.overlaySrc && !String(fill.overlaySrc).startsWith('data:')) {
      loadFile(fill.overlaySrc);
    }
  });

  // Shared with the absorbed path rather than kept local, so a fill painted on a wrapper and one
  // drawn as a layer are shaped by the same function instead of by two meant to agree.
  let fillCornerCSS = $derived(fillShapeCSS(corners, width, height));

  let fillLayerStyles = $derived.by(() => {
    const styles = {};
    if (absorbFill) return styles;
    for (const layerId of fillLayerOrder()) {
      let layerStyle = null;
      if (layerId === 'solid' && fillLayerVisible('solid') && fill?.colour) {
        layerStyle = buildSolidFillStyle();
      } else if (layerId === 'gradient' && fillLayerVisible('gradient') && fill?.gradient) {
        layerStyle = `background: ${gradientToCSS(fill.gradient)}; opacity: ${((fill?.gradientOpacity ?? 100) / 100).toFixed(3)}; mix-blend-mode: ${fill?.gradientBlend ?? 'normal'};`;
      } else if (layerId === 'image' && fillLayerVisible('image') && fill?.imageSrc) {
        layerStyle = buildImageFillStyle('image', resolvedFillSource(fill.imageSrc));
      } else if (layerId === 'overlay' && fillLayerVisible('overlay') && fill?.overlaySrc) {
        layerStyle = buildImageFillStyle('overlay', resolvedFillSource(fill.overlaySrc));
      }

      if (layerStyle) {
        styles[layerId] = [layerStyle, fillLayerClipCSS(layerId)].filter(Boolean).join(' ');
      }
    }
    return styles;
  });

  // Only the layers that actually draw something, in paint order.
  //
  // The template used to walk all four layer slots and put an `{#if}` inside the loop, which meant
  // a control with one solid fill — or none at all, because the caller absorbed it onto its own
  // wrapper — still cost an each-block, four keyed items and four branch effects. Measured across
  // the GAIA panel: 826 BackgroundRenderer instances at nine effects each, ~7,400 effects to draw
  // nothing. Filtering here leaves one effect per layer that exists, and one for the loop.
  let visibleFillLayers = $derived(fillLayerOrder().filter((layerId) => fillLayerStyles[layerId]));

  // ============ BORDER (SVG) ============

  let hasBorder = $derived(border?.enabled && width > 0 && height > 0);

  // A uniform solid outline is one CSS declaration on one div. The eleven-element segment path
  // (SegmentedBorder.svelte) exists for the borders that genuinely need it — per-side, dashed,
  // gradient-filled, chamfered, double — and this short-circuits the overwhelming majority that do
  // not. See utils/plainBorderCSS.js for why the two draw the identical band of pixels.
  let cssBorder = $derived(hasBorder && !outline ? plainBorderCSS(border, corners, width, height) : null);
</script>

<!-- Fill. Only the layers that draw — see `visibleFillLayers`. -->
<EffectSurface effects={background?._children?.Effects} {width} {height} target="background">
{#each visibleFillLayers as layerId (layerId)}
  <EffectSurface effects={fill?._children?.[`${layerId[0].toUpperCase()}${layerId.slice(1)}Effects`]} {width} {height} target={layerId}>
    <div class="bg-fill-layer" class:solid={layerId === 'solid'} style={fillLayerStyles[layerId]}></div>
  </EffectSurface>
{/each}

<!-- Border (CSS) — the plain case, one element instead of eleven -->
<EffectSurface effects={border?._children?.Effects} {width} {height} target="border">
{#if cssBorder}
  <div class="bg-border-css" style={cssBorder}></div>
{/if}

<!-- Border (SVG): per side, dashed, gradient-filled, chamfered, double. -->
{#if hasBorder && !cssBorder && !outline}
  <SegmentedBorder {border} {corners} {width} {height} />
{/if}

<!-- Border along an outline (a combined shape): bands measured inward from the outline. -->
{#if hasBorder && outline}
  <OutlineBorder {border} {outline} {width} {height} />
{/if}

</EffectSurface>
</EffectSurface>

<style>
  /* A colour animation on the control or part this background belongs to reaches the layers that
     actually paint through an inherited custom property; see utils/transitionCss.js. */
  .bg-fill-layer,
  .bg-border-css {
    transition: var(--ce-colour-transition, none);
  }

  .bg-fill-layer {
    position: absolute;
    inset: 0;
    pointer-events: none;
    box-sizing: border-box;
  }

  /* A keyframe animation's fill colour, handed down by the control or part it belongs to
     (CE_Application/utils/keyframeAnimation.js). Unset — the player window, any control without
     colour frames — it is none. */
  .bg-fill-layer.solid { animation: var(--ce-kf-paint, none); }
</style>
