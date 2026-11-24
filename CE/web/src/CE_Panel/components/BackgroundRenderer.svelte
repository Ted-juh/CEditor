<script>
  import EffectSurface from './EffectSurface.svelte';
  import { gradientBackgroundCSS } from '../../CE_Application/utils/gradientPaint.js';
  import { normalizeCorner } from '../../CE_Application/utils/cornerNormalization.js';
  import { buildInsetFillClipPath } from '../../CE_Application/utils/cornerPaths.js';
  import { plainBorderCSS } from '../../CE_Application/utils/plainBorderCSS.js';
  import { fileCache, loadFile } from '../../CE_Application/stores/fileCache.js';
  import { resolveStroke } from '../../CE_Application/utils/strokeResolver.js';
  import { fillShapeCSS, imageLayerStyleParts } from '../../CE_Application/utils/plainFillCSS.js';
  import { outlineBorderDepth, outlineInsetKey } from '../../CE_Application/utils/outlineBorder.js';
  import SegmentedBorder from './SegmentedBorder.svelte';
  import OutlineBorder from './OutlineBorder.svelte';
  import PatternLayers from './PatternLayers.svelte';
  import { hasPatterns } from '../../CE_Application/utils/patternLayers.js';

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
  //
  // `reducedMotion` — the Preview's own Reduced motion switch, for the patterns behind the content
  // (PatternLayers.svelte), which read the operating system's setting themselves.
  let { background = null, width = 0, height = 0, absorbFill = false, outline = null, reducedMotion = false } = $props();

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
  const buildImageFillParts = (layerId, src) => imageLayerStyleParts(fill, layerId, src, width, height);

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
    // Through a constant: the compiler moves the comment above fillCornerCSS's declaration in after
    // a bare `return fillCornerCSS`, and in the server build that return then returned nothing.
    const shape = fillCornerCSS;
    return shape;
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

  // Each drawn layer's style, keyed by layer. A layer is one element, except an image or overlay
  // that is rotated, flipped or offset: that is two — this style on the outer one, and its picture
  // (`fillLayerPaints`) on an inner one that alone carries the transform. CSS transforms an
  // element after clipping it, so with one element the clip turned with the picture and at 90° its
  // corners left the component entirely (utils/backgroundCSS.js, buildLayerStyleParts).
  let fillLayerDraw = $derived.by(() => {
    const styles = {};
    const paints = {};
    if (absorbFill) return { styles, paints };
    for (const layerId of fillLayerOrder()) {
      let layerStyle = null;
      let image = null;
      if (layerId === 'solid' && fillLayerVisible('solid') && fill?.colour) {
        layerStyle = buildSolidFillStyle();
      } else if (layerId === 'gradient' && fillLayerVisible('gradient') && fill?.gradient) {
        // Written to ease (utils/gradientPaint.js): a state that turns it or moves a stop glides.
        layerStyle = `${gradientBackgroundCSS(fill.gradient)} opacity: ${((fill?.gradientOpacity ?? 100) / 100).toFixed(3)}; mix-blend-mode: ${fill?.gradientBlend ?? 'normal'};`;
      } else if (layerId === 'image' && fillLayerVisible('image') && fill?.imageSrc) {
        image = buildImageFillParts('image', resolvedFillSource(fill.imageSrc));
      } else if (layerId === 'overlay' && fillLayerVisible('overlay') && fill?.overlaySrc) {
        image = buildImageFillParts('overlay', resolvedFillSource(fill.overlaySrc));
      }

      if (image?.transformed) {
        // The outer element keeps the clip in the component's frame, and `overflow: hidden` holds
        // the cover-scaled picture to the component's box when the clip mode is "none".
        styles[layerId] = [image.compositing, fillLayerClipCSS(layerId), 'overflow: hidden;'].filter(Boolean).join(' ');
        paints[layerId] = image.paint;
      } else {
        if (image) layerStyle = `${image.head} ${image.compositing}${image.tail}`;
        if (layerStyle) styles[layerId] = [layerStyle, fillLayerClipCSS(layerId)].filter(Boolean).join(' ');
      }
    }
    return { styles, paints };
  });
  let fillLayerStyles = $derived(fillLayerDraw.styles);
  let fillLayerPaints = $derived(fillLayerDraw.paints);

  // Only the layers that actually draw something, in paint order.
  //
  // The template used to walk all four layer slots and put an `{#if}` inside the loop, which meant
  // a control with one solid fill — or none at all, because the caller absorbed it onto its own
  // wrapper — still cost an each-block, four keyed items and four branch effects. Measured across
  // the GAIA panel: 826 BackgroundRenderer instances at nine effects each, ~7,400 effects to draw
  // nothing. Filtering here leaves one effect per layer that exists, and one for the loop.
  let visibleFillLayers = $derived(fillLayerOrder().filter((layerId) => fillLayerStyles[layerId]));

  // Patterns behind the content (utils/patternLayers.js): over the fill, under the border, clipped to
  // the control's shape. Only a background that has one mounts the component.
  let drawsPatterns = $derived(hasPatterns(background));
  let patternClip = $derived(outline ? outlineClip(outline.d, outline.fillRule ?? 'evenodd') : fillCornerCSS);

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
  <EffectSurface effects={fill?._children?.[`${layerId[0].toUpperCase()}${layerId.slice(1)}Effects`]} {width} {height} target={layerId}
    blend={fill?.[`${layerId}Blend`] ?? 'normal'}>
    <div class="bg-fill-layer" class:solid={layerId === 'solid'} class:gradient={layerId === 'gradient'} style={fillLayerStyles[layerId]}>
      {#if fillLayerPaints[layerId]}<div class="bg-fill-paint" style={fillLayerPaints[layerId]}></div>{/if}
    </div>
  </EffectSurface>
{/each}

<!-- Patterns behind the content: tinted, tiled, moving (PatternLayers.svelte). -->
{#if drawsPatterns}
  <PatternLayers {background} place="behind" {width} {height} clip={patternClip} {reducedMotion} />
{/if}

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
  /* …and its gradient's turn and shift frames (the `gradient` channel; utils/gradientPaint.js). */
  .bg-fill-layer.gradient { animation: var(--ce-kf-gradient, none); }

  /* A transformed image layer's picture, inside the element that clips it (see fillLayerDraw). */
  .bg-fill-paint {
    position: absolute;
    inset: 0;
    pointer-events: none;
  }
</style>
