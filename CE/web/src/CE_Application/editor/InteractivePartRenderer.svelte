<script module>
  import { polygonToSvgPoints } from '../utils/shapeGeometry.js';
  import { partShape } from '../utils/partShape.js';
</script>

<script>
  import { untrack } from 'svelte';
  import BackgroundRenderer from '../../CE_Panel/components/BackgroundRenderer.svelte';
  import { parseTiming } from '../utils/easing.js';
  import { buildShadowCSS, buildBlendCSS, buildFilterCSS } from '../utils/effectsCSS.js';
  import { numberOr } from '../utils/primitives.js';
  import { plainFillCSS } from '../utils/plainFillCSS.js';
  import { gradientToCSS } from '../utils/gradientCSS.js';
  import { buildIconTintStyle, buildTextShadowValue, lineColourFor, lineGeometry, lineLayerFor, textAlignFor, textEffectColor, usesIconTint } from './canvasControlStyles.js';
  import { iconImageStyle } from './iconLook.js';
  import { storedIcons } from '../stores/appSettings.js';
  import { documentIcons, resolveIcon } from '../utils/documentIcons.js';
  import EffectSurface from '../../CE_Panel/components/EffectSurface.svelte';
  import { layerRenderedPlacement } from '../utils/layerRenderedLook.js';
  import { renderedLooks, requestRenderedLook } from '../utils/renderedLook.js';
  import { activeControlSet } from '../stores/controlSets.js';
  import { isTokenReference, resolveColourLiteral } from '../models/controlSets.js';
  import { materialActive } from '../utils/materialFilter.js';
  import { isPictureLayer, maskActive, maskLinked, partMaskCSS, pictureShadowFilters } from '../utils/partMask.js';
  import MaterialFilter from '../../CE_Panel/components/MaterialFilter.svelte';
  import SliderFamilyRenderer from './SliderFamilyRenderer.svelte';
  import ControlAnatomy from './ControlAnatomy.svelte';
  import { anatomyForm } from '../models/controlAnatomy.js';
  import { resolveInteractiveControl } from '../utils/interactionRuntime.js';
  import { isSliderControlPart, sliderControlSession } from '../utils/sliderControlPart.js';
  import { booleanShapeFor, booleanShapeRevision, compoundShapeFor } from '../utils/booleanGroups.js';
  import { outlineInsetDepths } from '../utils/outlineBorder.js';
  import { outlineShadows } from '../utils/outlineShadows.js';
  import { rotatePathData } from '../utils/svgPathScale.js';
  import { transitionDeclaration, colourTransitionVar, rootTransitionDeclaration } from '../utils/transitionCss.js';
  import { createTransitionTracker } from '../utils/transitionSelection.js';
  import { systemReducedMotion } from '../stores/reducedMotion.js';
  import { animationDeclaration, colourVariables } from '../utils/keyframeAnimation.js';
  import { isFramesImage, imageFrameLayers, imageFrameLayerStyle } from '../utils/imageFrames.js';
  import { pictureColour, recolourPicture, withRecolouredPicture } from '../utils/pictureRecolour.js';

  let {
    part = null,
    partName = '',
    parentWidth = 0,
    parentHeight = 0,
    transitionBucket = null,
    animationList = null,
    // This part's colour channels ({ paint, shape, stroke, text }), {} for none, or null when the
    // control has no colour frames at all — and then nothing is set (utils/keyframeAnimation.js).
    colourChannels = null,
    /** Draw a hidden part as invisible rather than not at all, so showing and hiding can fade. */
    fadeHidden = false,
    debug = false,
    editableInput = null,
    oneditableinput = null,
    oneditablekeydown = null,
    oneditablefocus = null,
    oneditableblur = null,
  } = $props();

  const partUid = $props.id();

  function clampNumber(value, min, max) {
    return Math.max(min, Math.min(max, numberOr(value, min)));
  }

  function cssColour(value, fallback = '#5B9BD5') {
    const raw = String(value ?? '').trim();
    if (/^[0-9a-f]{8}$/i.test(raw)) {
      const alpha = parseInt(raw.slice(0, 2), 16) / 255;
      const red = parseInt(raw.slice(2, 4), 16);
      const green = parseInt(raw.slice(4, 6), 16);
      const blue = parseInt(raw.slice(6, 8), 16);
      return `rgba(${red}, ${green}, ${blue}, ${alpha.toFixed(3)})`;
    }
    if (/^[0-9a-f]{6}$/i.test(raw)) return `#${raw}`;
    return raw || fallback;
  }

  function resolveUnit(value, unit, total) {
    const numeric = numberOr(value, 0);
    return String(unit ?? 'px') === 'percent'
      ? (total * numeric) / 100
      : numeric;
  }

  function anchorOffset(anchor, size) {
    switch (String(anchor ?? 'center')) {
      case 'left':
      case 'top':
        return 0;
      case 'right':
      case 'bottom':
        return size;
      default:
        return size / 2;
    }
  }

  // The part's own transition, plus the colour timing its painting children read (see
  // utils/transitionCss.js). Always set, so a part never borrows its control's colour timing.
  function buildTransitionStyle(bucket) {
    return `${transitionDeclaration(bucket, { target: 'part' })} ${colourTransitionVar(bucket?.colour ?? null)}`.trim();
  }

  // A picture in a colour of its own (utils/pictureRecolour.js) that reaches here not yet recoloured
  // (the Component Designer, the state sheets; on the canvas CanvasControl does it first): drawn as it
  // is until its pixels are worked out, then in its colour.
  let wantedColour = $derived(pictureColour(part));
  let madeColour = $state(null);
  $effect(() => {
    const wanted = wantedColour;
    if (!wanted) {
      madeColour = null;
      return undefined;
    }
    let live = true;
    recolourPicture(wanted).then((made) => { if (live) madeColour = made; });
    return () => { live = false; };
  });
  let colouredPart = $derived(madeColour ? withRecolouredPicture(part, madeColour) : part);

  let layout = $derived(part?._children?.Layout ?? null);
  let background = $derived(colouredPart?._children?.Background ?? null);
  // From the recoloured part: the panel's shadow, recoloured, is a multiply (withRecolouredPicture).
  let effects = $derived(colouredPart?._children?.Effects ?? null);
  let text = $derived(part?._children?.Text ?? null);
  let image = $derived(colouredPart?._children?.Image ?? null);
  // A panel knob or slider carried by a component (utils/sliderControlPart.js): the panel's own
  // pipeline, fed the session the panel would hold for it, so it draws and animates the same way.
  let sliderControl = $derived(isSliderControlPart(part) ? part?.meta?.sliderControl ?? null : null);
  let sliderResolved = $derived(sliderControl?.control
    ? resolveInteractiveControl(sliderControl.control, sliderControlSession(sliderControl))
    : null);
  // The knob's transitions as the panel times them: CanvasControl runs every control's runtime
  // through a tracker that picks which transitions apply at each change of state, and this part
  // passed the runtime's whole catalogue instead. A converted knob's colours then snapped where the
  // panel knob's eased (knobsFromSelection caught it three pixels into a fade).
  const sliderTracker = createTransitionTracker();
  let sliderTransitions = $derived(sliderResolved?.runtime
    ? sliderTracker.next(sliderResolved.runtime, { reducedMotion: $systemReducedMotion })
    : null);
  // A knob or slider with a form (Core.controlForm, often the control set's) is drawn by
  // ControlAnatomy on the panel, not by SliderFamilyRenderer; CanvasControl picks between them the
  // same way. The part always used SliderFamilyRenderer, so a converted knob with a form came out a
  // different knob: smaller, with a larger readout.
  let sliderAnatomy = $derived(sliderResolved
    ? anatomyForm(sliderResolved.control?._children?.Core?.controlType, sliderResolved.control?._children?.Core?.controlForm)
    : '');
  // What the part draws, worked out once per part. These were fourteen deriveds of their own, each
  // a node in the reactive graph with its dependency and reader lists, for every part of every
  // control on a panel; GAIA's custom components carry five or six parts each. See partShape.
  let shape = $derived(partShape(part));

  let outlineDepths = $derived(shape.rendersOutline ? outlineInsetDepths(background) : []);
  // The group's outline: computed from its operands as they are now, synchronously when that is
  // already known, otherwise the previous outline until Paper.js has the new one.
  let groupShape = $derived.by(() => {
    if (!shape.rendersBooleanGroup) return null;
    $booleanShapeRevision;
    return booleanShapeFor(part, parentWidth, parentHeight, { insetDepths: outlineDepths, identity: partUid });
  });

  let layoutFrame = $derived.by(() => {
    if (!layout) {
      return {
        left: 0,
        top: 0,
        width: 0,
        height: 0,
      };
    }

    if (String(layout.mode ?? 'absolute') === 'fill') {
      return {
        left: 0,
        top: 0,
        width: parentWidth,
        height: parentHeight,
      };
    }

    const width = resolveUnit(layout.width, layout.widthUnit, parentWidth);
    const height = resolveUnit(layout.height, layout.heightUnit, parentHeight);
    const x = resolveUnit(layout.x, layout.xUnit, parentWidth);
    const y = resolveUnit(layout.y, layout.yUnit, parentHeight);
    const offsetX = numberOr(layout.offsetX, 0);
    const offsetY = numberOr(layout.offsetY, 0);

    return {
      left: x - anchorOffset(layout.anchorX, width) + offsetX,
      top: y - anchorOffset(layout.anchorY, height) + offsetY,
      width,
      height,
    };
  });

  // A group sits where its outline is; its Layout box only records that for the designer.
  let frame = $derived.by(() => {
    const bounds = groupShape?.shape?.bounds;
    if (shape.rendersBooleanGroup && bounds) return { left: bounds.x, top: bounds.y, width: bounds.width, height: bounds.height };
    return layoutFrame;
  });

  let outlineState = $derived.by(() => {
    if (!shape.rendersOutline) return null;
    if (shape.rendersBooleanGroup) return groupShape;
    $booleanShapeRevision;
    return compoundShapeFor(part, frame.width, frame.height, { insetDepths: outlineDepths, identity: partUid });
  });

  let partScale = $derived(Math.max(0.01, numberOr(layout?.scale, 1)));
  let partRotation = $derived(numberOr(layout?.rotation, 0));
  // A path whose light stays put (`meta.fixedLight`): turned, only its outline turns, about its pivot,
  // and its fill, gradient, finish and shadows are drawn upright under it, as a knob's plate is drawn
  // on the panel: a gear turns under a fixed lamp, and its shadow still falls downward.
  // A rendered look (utils/layerRenderedLook.js): the image the panel draws for a part with the same
  // properties, made from the layer's own and lit by the set's lamp, in place of its fill; its plain
  // fill until the image is made, or where it cannot be. A round body whose light stays put picks the
  // image of its turn rather than turning as a picture.
  const setColour = (value, fallback) => (isTokenReference(value) ? resolveColourLiteral(value, $activeControlSet, fallback) : value);
  let renderedPlacement = $derived(String(part?.look ?? '') === 'rendered'
    ? layerRenderedPlacement(part, {
      width: frame.width, height: frame.height, rotation: partRotation,
      colour: setColour(part?._children?.Background?._children?.Fill?.colour, 'FFC9CCD0'),
      topColour: part?.renderTopColour ? setColour(part.renderTopColour, null) : null,
      lamp: $activeControlSet?.lamp,
    })
    : null);
  let renderedImage = $derived.by(() => {
    if (!renderedPlacement) return null;
    const scale = typeof window !== 'undefined' ? Math.min(3, (window.devicePixelRatio || 1) * 1.5) : 1.5;
    const url = requestRenderedLook($renderedLooks, renderedPlacement.spec, Math.max(renderedPlacement.w, renderedPlacement.h) * scale, renderedPlacement.angle);
    return url ? { ...renderedPlacement, url } : null;
  });
  let fixedLight = $derived((shape.rendersOutline || !!renderedPlacement) && part?.meta?.fixedLight === true);
  let outlineTurn = $derived(fixedLight && Math.abs(partRotation) > 0.001 ? partRotation : 0);

  let outline = $derived.by(() => {
    const traced = outlineState?.shape;
    if (!traced || traced.empty || !traced.pathData) return null;
    if (!outlineTurn) return { d: traced.pathData, fillRule: 'evenodd', insets: traced.insets ?? {} };
    const px = (frame.width * numberOr(layout?.pivotX, 50)) / 100;
    const py = (frame.height * numberOr(layout?.pivotY, 50)) / 100;
    const turn = (d) => (d ? rotatePathData(d, outlineTurn, px, py) : d);
    const insets = Object.fromEntries(Object.entries(traced.insets ?? {}).map(([depth, d]) => [depth, turn(d)]));
    return { d: turn(traced.pathData), fillRule: 'evenodd', insets };
  });

  // A layer that draws a control's own shadows and bevel (`meta.surfaceEffects`, made from a panel
  // control by Create Component from Selection): cast through its pixels by the same surface the
  // canvas wraps a control's content in (EffectSurface), not as a box shadow, so the layer is the
  // same picture.
  let surfaceEffects = $derived(part?.meta?.surfaceEffects === true && !!effects);
  let shadowLayers = $derived(shape.rendersOutline && !surfaceEffects ? outlineShadows(effects) : null);

  // On an outline the shadows are drawn from the outline (utils/outlineShadows.js), not the box; on a
  // picture, from its pixels (utils/partMask.js), as filters below.
  let pictureLayer = $derived(!shape.rendersOutline && !shape.rendersVectorShape && isPictureLayer(background));
  let shadowCSS = $derived(shape.rendersOutline || pictureLayer || surfaceEffects ? '' : buildShadowCSS(effects));
  let pictureShadows = $derived(surfaceEffects ? '' : (pictureLayer ? pictureShadowFilters(effects) : ''));
  // An icon, drawn as a control draws its own (CanvasControl): the picture fitted in the layer's
  // box, tinted, turned, flipped, with its shadow, glow and blur.
  let partIcon = $derived(part?._children?.Icon ?? null);
  let partIconUrl = $derived(partIcon && partIcon.source !== 'none' ? (resolveIcon(partIcon, $storedIcons, $documentIcons)?.dataUrl ?? '') : '');
  // The layer's mask, from its own picture (utils/partMask.js). Linked, it is the part's own and
  // moves, turns and scales with it. Not linked, it is placed on the artboard and drawn by a wrapper
  // the artboard's size, untransformed, so the part moves under it: a CSS mask on the part itself
  // would turn with the part.
  let maskFixed = $derived(maskActive(part?.mask) && !maskLinked(part?.mask));
  let maskCSS = $derived(maskFixed ? '' : partMaskCSS(part?.mask, frame.width, frame.height));
  let fixedMaskStyle = $derived(maskFixed
    ? `width:${parentWidth}px; height:${parentHeight}px; z-index:${numberOr(part?.zIndex, 0)}; ${partMaskCSS(part?.mask, parentWidth, parentHeight)}`
    : '');
  let blendCSS = $derived(buildBlendCSS(effects));
  // A lit material (utils/materialFilter.js) is an SVG filter this part owns; it goes first in the
  // filter list so the CSS blur / brightness that follow act on the lit surface.
  let material = $derived(effects?._children?.Material ?? null);
  let materialLit = $derived(materialActive(material));
  const materialId = `part-material-${partUid}`;
  let filterCSS = $derived.by(() => {
    const css = buildFilterCSS(effects);
    const rest = css.replace(/^filter:\s*/, '').replace(/;$/, '');
    // One filter list: the lit material first, the CSS filters, then a picture's shadows, cast by
    // what the filters made of it.
    const list = [materialLit ? `url(#${materialId})` : '', rest, pictureShadows].filter(Boolean).join(' ');
    return list ? `filter: ${list};` : '';
  });
  let hiddenForFade = $derived(fadeHidden && part?.visible === false);
  // A layer that orbits (`meta.orbit`): turned, it goes round its pivot and stays upright, as the
  // panel moves a knob's dot or a label that rides its pointer round the knob without turning them.
  let orbits = $derived(part?.meta?.orbit === true);
  let partStyle = $derived.by(() => {
    const transforms = [];
    if (Math.abs(partRotation) > 0.001 && orbits) {
      const px = (frame.width * numberOr(layout?.pivotX, 50)) / 100;
      const py = (frame.height * numberOr(layout?.pivotY, 50)) / 100;
      const vx = frame.width / 2 - px;
      const vy = frame.height / 2 - py;
      const a = (partRotation * Math.PI) / 180;
      const dx = px + vx * Math.cos(a) - vy * Math.sin(a) - frame.width / 2;
      const dy = py + vx * Math.sin(a) + vy * Math.cos(a) - frame.height / 2;
      transforms.push(`translate(${Math.round(dx * 1000) / 1000}px, ${Math.round(dy * 1000) / 1000}px)`);
    } else if (Math.abs(partRotation) > 0.001 && !fixedLight) transforms.push(`rotate(${partRotation}deg)`);
    if (Math.abs(partScale - 1) > 0.001) transforms.push(`scale(${partScale})`);

    return [
      `left:${frame.left}px`,
      `top:${frame.top}px`,
      `width:${frame.width}px`,
      `height:${frame.height}px`,
      // A hidden part kept for a fade: transparent, invisible, and out of the way of the pointer.
      hiddenForFade ? 'opacity:0; visibility:hidden; pointer-events:none' : `opacity:${numberOr(part?.opacity, 1)}`,
      `z-index:${numberOr(part?.zIndex, 0)}`,
      `overflow:${part?.clipChildren === true || editableInput ? 'hidden' : 'visible'}`,
      transforms.length ? `transform:${transforms.join(' ')}; transform-origin:${numberOr(layout?.pivotX, 50)}% ${numberOr(layout?.pivotY, 50)}%` : '',
      // A knob part times itself as the panel knob's root does, unless the component gives it a timing.
      !transitionBucket && sliderTransitions
        ? `${rootTransitionDeclaration(sliderTransitions.rootTransitions)} ${colourTransitionVar(sliderTransitions.rootTransitions?.get?.('colour') ?? null)}`.trim()
        : buildTransitionStyle(transitionBucket),
      // Keyframe animations on this part (the control's player decides which are playing). A fill
      // absorbed onto this element is painted here, so its colour channel plays here too; the rest
      // travel to the layers inside as custom properties.
      animationDeclaration(animationList, { extra: colourChannels && absorbedFillCSS ? colourChannels.paint : [] }),
      colourChannels ? colourVariables(colourChannels, { skip: absorbedFillCSS ? ['paint'] : [] }) : '',
      shadowCSS,
      blendCSS,
      filterCSS,
      maskCSS,
      // A flat colour or a single gradient paints here rather than on a child of its own. This
      // element exists either way; the div it replaces did not. `.interactive-part` has no
      // overflow clip unless a part asks for one, so a border-radius here shapes the background
      // and touches nothing else.
      absorbedFillCSS ?? '',
    ].filter(Boolean).join('; ');
  });

  // 2,821 of the GAIA panel's parts are static art already folded into one image per component,
  // and the 474 that are left over still wanted a div each just to hold a colour.
  // Not on a layer that casts a control's shadows: its fill must be inside the surface that casts
  // them, or only its border would.
  let absorbedFillCSS = $derived(
    background && !surfaceEffects && !renderedImage && !shape.usesSimpleBackground && !shape.rendersVectorShape && !shape.rendersOutline && !shape.rendersArcTrack
      ? plainFillCSS(background, frame.width, frame.height)
      : null,
  );

  function justifyContentFor(value) {
    switch (String(value ?? 'centred').toLowerCase()) {
      case 'left':
      case 'topleft':
      case 'bottomleft':
      case 'near':
        return 'flex-start';
      case 'right':
      case 'topright':
      case 'bottomright':
      case 'far':
        return 'flex-end';
      default:
        return 'center';
    }
  }

  // How the panel's label places its text block (CanvasControl's textPlacement): left, centred or
  // right, and at the top, the middle or the bottom of its box, nine ways; and the block's line
  // height, a share of the font size (Multiline.lineHeight, 1.2 unless the text says).
  function textVertical(justification) {
    const value = String(justification ?? 'centred');
    if (value === 'top' || value === 'topLeft' || value === 'topRight') return 'top';
    if (value === 'bottom' || value === 'bottomLeft' || value === 'bottomRight') return 'bottom';
    return 'middle';
  }
  let textLines = $derived(Math.max(1, String(text?.content ?? '').split('\n').length));
  let textLineHeight = $derived(Math.max(0.5, numberOr(text?._children?.Multiline?.lineHeight, 1.2)));

  // Its underline, strikethrough and overline, as the panel draws them (canvasControlStyles'
  // lineGeometry): across the text's whole width, about the block's centre, under or over the
  // glyphs (their `Layer`), in their own colour or the text's.
  let textDecorations = $derived.by(() => {
    const font = text?._children?.Font ?? null;
    if (!font || (!font.underline && !font.strikethrough && !font.overline)) return [];
    const size = numberOr(font.size, 12);
    const block = Math.round(size * textLineHeight * textLines);
    const vertical = textVertical(text?._children?.Position?.justification);
    const centreY = (vertical === 'top' ? block / 2 : vertical === 'bottom' ? frame.height - block / 2 : frame.height / 2) - numberOr(font.baselineShift, 0);
    return ['underline', 'strikethrough', 'overline'].filter((kind) => font[kind] === true).map((kind) => {
      const g = lineGeometry(kind, font, text?._children?.Fill, { inlineExtent: Math.max(0, frame.width - 16), centerX: frame.width / 2, centerY: centreY });
      return { kind, left: g.left, top: g.top, width: Math.max(0, g.right - g.left), height: g.thickness, colour: lineColourFor(kind, font, text?._children?.Fill), front: lineLayerFor(kind, font) === 'front' };
    });
  });

  let textStyle = $derived.by(() => {
    if (!text) return '';
    const textFill = text._children?.Fill ?? null;
    const textFont = text._children?.Font ?? null;
    const textPosition = text._children?.Position ?? null;
    const multiline = Number(text._children?.Multiline?.maxLines) > 1;
    const vertical = textVertical(textPosition?.justification);
    // Lines of their own, or a block set to the top or the bottom, take the panel's line height: the
    // block's height then decides where its glyphs sit. A single line in the middle is centred
    // whatever its line box, as it always was.
    const lineHeight = multiline || textLines > 1 || vertical !== 'middle' ? textLineHeight : 1;
    const shift = numberOr(textFont?.baselineShift, 0);

    return [
      // AARRGGBB keeps its alpha: semi-transparent text draws as the panel's.
      `color:${cssColour(textFill?.colour ?? 'FFFFFFFF', '#FFFFFF')}`,
      `font-family:${textFont?.family ?? 'Arial'}`,
      `font-size:${numberOr(textFont?.size, 12)}px`,
      `font-weight:${numberOr(textFont?.weightValue, 400)}`,
      `font-style:${String(textFont?.style ?? 'Normal').toLowerCase() === 'italic' ? 'italic' : 'normal'}`,
      // Read like the label renderer does (CanvasControl), so a label turned into a part keeps its
      // spacing — control sets give labels some. Every text part in the QA sheets is at 0 here.
      `letter-spacing:${numberOr(textFont?.letterSpacing, 0)}px`,
      `word-spacing:${numberOr(textFont?.wordSpacing, 0)}px`,
      `justify-content:${justifyContentFor(textPosition?.justification)}`,
      `align-items:${vertical === 'top' ? 'flex-start' : (vertical === 'bottom' ? 'flex-end' : 'center')}`,
      'display:flex',
      // The part Background renders as position:absolute fill layers, which are
      // positioned descendants. A non-positioned text block would be painted
      // *under* them (CSS paint order), hiding the glyphs. Promote the text to
      // its own positioned level so it always draws above the fill.
      'position:relative',
      'z-index:2',
      'height:100%',
      `line-height:${multiline ? numberOr(text._children.Multiline.lineHeight, 1.1) : lineHeight}`,
      // Font.baselineShift raises the text by that many pixels, as the panel's does.
      shift ? `transform:translateY(${-shift}px)` : '',
      `padding:0 ${multiline ? 2 : 8}px`,
      // Lines of their own line up as the panel's do (its textAlignFor): left, centred or right.
      `text-align:${textAlignFor(String(textPosition?.justification ?? 'centred'))}`,
      // Single-line text keeps its spaces, as the label renderer's does (white-space:pre there too):
      // "A  ·  B" is spaced on purpose. No text part in the QA sheets has a run of spaces to change.
      `white-space:${multiline ? 'normal' : 'pre'}`,
      ...(multiline ? ['overflow-wrap:anywhere'] : []),
      'width:100%',
      'box-sizing:border-box',
      'overflow:hidden',
      'text-overflow:ellipsis',
      'pointer-events:none',
      `text-transform:${String(textFont?.caseMode ?? 'normal').toLowerCase() === 'uppercase' ? 'uppercase' : (String(textFont?.caseMode ?? 'normal').toLowerCase() === 'lowercase' ? 'lowercase' : 'none')}`,
      ...textEffectRules(text._children?.Effects),
    ].filter(Boolean).join('; ');
  });

  // A text layer's soft shadow and glow, and an outline outside its glyphs, as the panel's text draws
  // them (editor/canvasControlStyles.js). A meter made into layers needs them: its readout and scale
  // labels have a shadow, an arc meter's labels an outline. The rest of the text effects are the
  // panel's alone.
  function textEffectRules(effects) {
    if (!effects) return [];
    const rules = [];
    const shadow = buildTextShadowValue(effects);
    if (shadow) rules.push(`text-shadow:${shadow}`);
    if (effects.outlineEnabled === true && String(effects.outlinePlacement ?? 'outer') === 'outer') {
      // Centred on the edge and drawn under the fill: twice as wide, so its outer half shows.
      const width = Math.max(0, numberOr(effects.outlineThickness, 1)) * 2;
      if (width > 0) rules.push(`-webkit-text-stroke:${width}px ${textEffectColor(effects.outlineColour, 'FF000000')}`, 'paint-order:stroke fill');
    }
    return rules;
  }

  let inputStyle = $derived.by(() => {
    if (!editableInput) return '';
    const textFill = text?._children?.Fill ?? null;
    const textFont = text?._children?.Font ?? null;
    const textPosition = text?._children?.Position ?? null;

    return [
      'position:absolute',
      'inset:0',
      'width:100%',
      'height:100%',
      'border:none',
      'outline:none',
      'background:transparent',
      'box-sizing:border-box',
      'padding:0 8px',
      `color:#${String(textFill?.colour ?? 'FFFFFFFF').slice(-6)}`,
      `font-family:${textFont?.family ?? 'Arial'}`,
      `font-size:${numberOr(textFont?.size, 12)}px`,
      `font-weight:${numberOr(textFont?.weightValue, 400)}`,
      `font-style:${String(textFont?.style ?? 'Normal').toLowerCase() === 'italic' ? 'italic' : 'normal'}`,
      `text-align:${justifyContentFor(textPosition?.justification) === 'flex-start' ? 'left' : (justifyContentFor(textPosition?.justification) === 'flex-end' ? 'right' : 'center')}`,
      'line-height:1',
      'pointer-events:auto',
    ].join('; ');
  });

  // A part that is one of several pictures (utils/imageFrames.js): the one the value chooses, or the
  // two it falls between, mixed inside the part before the part is laid on what is under it.
  let frameLayers = $derived(image ? imageFrameLayers(image) : []);
  let frameStyles = $derived(frameLayers.map((layer) => imageFrameLayerStyle(layer, {
    mixed: frameLayers.length > 1,
    smooth: String(image?.interpolation ?? 'nearest') !== 'nearest',
  })));

  let imageStyle = $derived.by(() => {
    if (!image) return '';
    const source = String(image?.source ?? '');
    const mode = String(image?.mode ?? 'image');
    const orientation = String(image?.orientation ?? 'vertical');
    const frameCount = Math.max(1, Math.round(numberOr(image?.frameCount, 1)));
    const frameIndex = Math.max(0, Math.min(frameCount - 1, Math.round(numberOr(image?.frameIndex, 0))));
    const rendering = String(image?.interpolation ?? 'nearest') === 'nearest' ? 'pixelated' : 'auto';

    const rules = [
      'position:absolute',
      'inset:0',
      source ? `background-image:url("${source.replaceAll('"', '\\"')}")` : '',
      'background-repeat:no-repeat',
      `image-rendering:${rendering}`,
    ];

    if (mode === 'filmstrip') {
      if (orientation === 'horizontal') {
        rules.push(`background-size:${frameCount * 100}% 100%`);
        rules.push(`background-position:${frameCount <= 1 ? 0 : (frameIndex / (frameCount - 1)) * 100}% 0%`);
      } else {
        rules.push(`background-size:100% ${frameCount * 100}%`);
        rules.push(`background-position:0% ${frameCount <= 1 ? 0 : (frameIndex / (frameCount - 1)) * 100}%`);
      }
    } else {
      rules.push(`background-size:${String(image?.fit ?? 'cover')}`);
      rules.push('background-position:center center');
    }

    return rules.filter(Boolean).join('; ');
  });

  let valueArcStyle = $derived.by(() => {
    if (!shape.rendersValueArc) return '';
    const valueArc = part?.meta?.valueArc ?? null;

    const size = Math.max(1, Math.min(frame.width, frame.height));
    const thickness = clampNumber(valueArc?.thickness, 1, size / 2);
    const value = clampNumber(valueArc?.value, 0, 1);
    const sweepAngle = clampNumber(valueArc?.sweepAngle, 0, 360);
    const startAngle = numberOr(valueArc?.startAngle, -135);
    const hasRange = valueArc?.startValue !== undefined || valueArc?.endValue !== undefined;
    const rangeStartValue = hasRange ? clampNumber(valueArc?.startValue, 0, 1) : 0;
    const rangeEndValue = hasRange ? clampNumber(valueArc?.endValue, rangeStartValue, 1) : value;
    const renderedStartAngle = startAngle + (sweepAngle * rangeStartValue);
    const filledAngle = Math.max(0.001, sweepAngle * Math.max(0, rangeEndValue - rangeStartValue));
    const colour = cssColour(valueArc?.colour ?? background?._children?.Border?.colour, '#5B9BD5');

    return [
      `background:conic-gradient(from ${renderedStartAngle}deg, ${colour} 0deg ${filledAngle}deg, transparent ${filledAngle}deg 360deg)`,
      `-webkit-mask:radial-gradient(circle at center, transparent 0 calc(50% - ${thickness}px), #000 calc(50% - ${thickness}px) calc(50% + 1px), transparent calc(50% + 1px) 100%)`,
      `mask:radial-gradient(circle at center, transparent 0 calc(50% - ${thickness}px), #000 calc(50% - ${thickness}px) calc(50% + 1px), transparent calc(50% + 1px) 100%)`,
    ].join('; ');
  });

  // --- An arc's glide -------------------------------------------------------------------------
  // An arc's sweep and start are SVG attributes (a dash length, a rotation), which CSS cannot ease.
  // When a value-change animation gives this part a size timing for this change (a knob or meter
  // made into layers carries its value glide as one: utils/customComponentFromControls.js), the
  // drawn angles move along that curve in JS, as SliderFamilyRenderer moves a knob's value. The
  // tracker gives no timing during a drag, so a dragged arc still follows the pointer.
  let arcTarget = $derived.by(() => {
    if (!shape.rendersArcTrack) return null;
    const arcTrack = part?.meta?.arcTrack ?? part?.meta?.ringArc ?? null;
    return { start: numberOr(arcTrack?.startAngle, -135), sweep: clampNumber(arcTrack?.sweepAngle, 0, 360) };
  });
  let arcTiming = $derived(transitionBucket?.size ? parseTiming(transitionBucket.size) : null);
  let arcGlide = $state(null);
  let arcGlideFrame = 0;
  let arcGlideFrom = null;
  const sameAngles = (a, b) => !!a && !!b && Math.abs(a.start - b.start) < 1e-6 && Math.abs(a.sweep - b.sweep) < 1e-6;
  $effect.pre(() => {
    const next = arcTarget;
    const timing = arcTiming;
    untrack(() => {
      if (arcGlideFrame && sameAngles(arcGlideFrom, next)) return;
      const from = arcGlide ?? arcGlideFrom;
      arcGlideFrom = next;
      if (arcGlideFrame) { cancelAnimationFrame(arcGlideFrame); arcGlideFrame = 0; }
      if (!next || !timing || timing.duration + timing.delay <= 0 || !from || sameAngles(from, next)
          || typeof requestAnimationFrame !== 'function') {
        arcGlide = null;
        return;
      }
      const startedAt = performance.now();
      arcGlide = from;
      const step = (now) => {
        const progress = Math.min(1, Math.max(0, (now - startedAt - timing.delay) / Math.max(1, timing.duration)));
        if (progress >= 1) { arcGlide = null; arcGlideFrame = 0; return; }
        const t = timing.ease(progress);
        arcGlide = { start: from.start + (next.start - from.start) * t, sweep: from.sweep + (next.sweep - from.sweep) * t };
        arcGlideFrame = requestAnimationFrame(step);
      };
      arcGlideFrame = requestAnimationFrame(step);
    });
  });
  $effect(() => () => { if (arcGlideFrame) cancelAnimationFrame(arcGlideFrame); arcGlideFrame = 0; });

  let arcSvgData = $derived.by(() => {
    if (!shape.rendersArcTrack) return null;
    const arcTrack = part?.meta?.arcTrack ?? part?.meta?.ringArc ?? null;
    const angles = arcGlide ?? arcTarget;
    const backgroundFill = background?._children?.Fill ?? null;
    const backgroundBorder = background?._children?.Border ?? null;
    const size = Math.max(1, Math.min(frame.width, frame.height));
    const thickness = clampNumber(arcTrack?.thickness ?? backgroundBorder?.thickness, 1, size / 2);
    const r = Math.max(0.5, size / 2 - thickness / 2);
    const sweepAngle = clampNumber(angles?.sweep, 0, 360);
    const direction = String(arcTrack?.direction ?? 'cw').trim().toLowerCase() === 'ccw' ? 'ccw' : 'cw';
    const startAngle = numberOr(angles?.start, -135);
    const renderedStartAngle = direction === 'ccw' ? startAngle - sweepAngle : startAngle;
    const cap = arcTrack?.cap === 'round' ? 'round' : 'butt';
    const colour = cssColour(arcTrack?.colour ?? backgroundBorder?.colour ?? backgroundFill?.colour, '#2B3742');
    const circumference = 2 * Math.PI * r;
    const arcLength = circumference * Math.min(sweepAngle, 359.99) / 360;
    // SVG 0° = 3-o'clock; CSS conic 0° = 12-o'clock → subtract 90 to align
    const rotation = renderedStartAngle - 90;
    // Zone colours along the arc (a meter's green, yellow, red: utils/valueControlLayers.js
    // plainMeterLayers), fixed to the arc's full travel (`zoneSweep`) while `sweepAngle`, which the
    // value moves, decides how much of it shows. One SVG stroke cannot change colour along a curve,
    // so these draw as a conic gradient on a ring, below.
    const zones = Array.isArray(arcTrack?.zones) ? arcTrack.zones.filter((zone) => zone && zone.colour) : [];
    const zoneSweep = clampNumber(arcTrack?.zoneSweep ?? sweepAngle, 0, 360);
    return { size, r, thickness, arcLength, circumference, rotation, cap, colour, zones, zoneSweep, sweepAngle, direction, renderedStartAngle, blend: arcTrack?.blend !== false };
  });

  // An arc that paints its own background (`meta.arcTrack.paint: 'background'`: a gradient, a picture,
  // a finish) through its stroke, as the panel paints a knob's track and value arc: the background
  // over the arc's box grown by `paintPad` each side, masked to the arc.
  let arcPaintPad = $derived(Math.max(0, numberOr(part?.meta?.arcTrack?.paintPad, 0)));
  let arcPaintStyle = $derived.by(() => {
    const arc = arcSvgData;
    if (!arc || part?.meta?.arcTrack?.paint !== 'background' || !background || arc.sweepAngle <= 0) return '';
    const pad = arcPaintPad;
    const side = arc.size + 2 * pad;
    const c = side / 2;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${side}" height="${side}" viewBox="0 0 ${side} ${side}">`
      + `<circle cx="${c}" cy="${c}" r="${arc.r}" fill="none" stroke="#fff" stroke-width="${arc.thickness}" stroke-linecap="${arc.cap}" `
      + `stroke-dasharray="${arc.arcLength} ${arc.circumference}" transform="rotate(${arc.rotation} ${c} ${c})"/></svg>`;
    const url = `url("data:image/svg+xml;utf8,${encodeURIComponent(svg)}")`;
    return [
      'position:absolute', `left:${-pad}px`, `top:${-pad}px`, `width:${side}px`, `height:${side}px`,
      `-webkit-mask-image:${url}`, `mask-image:${url}`, '-webkit-mask-size:100% 100%', 'mask-size:100% 100%',
      '-webkit-mask-repeat:no-repeat', 'mask-repeat:no-repeat', 'pointer-events:none',
    ].join('; ');
  });

  let arcZoneStyle = $derived.by(() => {
    const arc = arcSvgData;
    if (!arc || arc.zones.length === 0 || arc.sweepAngle <= 0) return '';
    const visible = Math.min(arc.sweepAngle, 360);
    // Degrees from where the conic starts (the visible part's first end): along the travel for a
    // clockwise arc, back from its far end for an anticlockwise one.
    const at = (fraction) => {
      const along = clampNumber(fraction, 0, 1) * arc.zoneSweep;
      return arc.direction === 'ccw' ? visible - along : along;
    };
    let list = arc.zones.map((zone) => ({ deg: at(zone.from), colour: cssColour(zone.colour, '#5B9BD5') }));
    if (arc.direction === 'ccw') list = list.reverse();
    const stops = arc.blend
      ? list.map((stop) => `${stop.colour} ${stop.deg.toFixed(3)}deg`)
      // Hard edges: clockwise, a zone runs from its own start to the next one's; anticlockwise, the
      // list is reversed, and a zone runs from the one before it to its own start.
      : list.map((stop, i) => (arc.direction === 'ccw'
        ? `${stop.colour} ${(i === 0 ? 0 : list[i - 1].deg).toFixed(3)}deg ${(i === list.length - 1 ? 360 : stop.deg).toFixed(3)}deg`
        : `${stop.colour} ${(i === 0 ? 0 : stop.deg).toFixed(3)}deg ${(list[i + 1]?.deg ?? 360).toFixed(3)}deg`));
    const inner = Math.max(0, arc.size / 2 - arc.thickness);
    return [
      `width:${arc.size}px`, `height:${arc.size}px`,
      `background:conic-gradient(from ${arc.renderedStartAngle}deg, ${stops.join(', ')})`,
      // The ring, and the part of the turn that shows: both masks at once.
      `-webkit-mask:conic-gradient(from ${arc.renderedStartAngle}deg, #000 0deg ${visible}deg, transparent ${visible}deg 360deg), radial-gradient(circle closest-side, transparent ${Math.max(0, inner - 0.5)}px, #000 ${inner + 0.5}px, #000 calc(100% - 0.5px), transparent 100%)`,
      '-webkit-mask-composite:source-in',
      `mask:conic-gradient(from ${arc.renderedStartAngle}deg, #000 0deg ${visible}deg, transparent ${visible}deg 360deg), radial-gradient(circle closest-side, transparent ${Math.max(0, inner - 0.5)}px, #000 ${inner + 0.5}px, #000 calc(100% - 0.5px), transparent 100%)`,
      'mask-composite:intersect',
    ].join('; ');
  });

  // The gradient of a round shape or a polygon, which used to draw one solid colour (the designer
  // review, item 14, hid the option; it draws now): the box's gradient layer as BackgroundRenderer
  // draws it, over the solid colour, its opacity and blend mode kept.
  let gradientLayerStyle = $derived.by(() => {
    if (!shape.usesSimpleBackground && !(shape.rendersVectorShape && shape.polygonVerts && !shape.rendersOpenPath)) return '';
    const fill = background?._children?.Fill ?? null;
    if (fill?.gradientEnabled !== true || !(fill?.gradient?.stops?.length >= 2)) return '';
    return `background: ${gradientToCSS(fill.gradient)}; opacity: ${(numberOr(fill.gradientOpacity, 100) / 100).toFixed(3)}; mix-blend-mode: ${fill.gradientBlend ?? 'normal'};`;
  });

  let simpleBackgroundStyle = $derived.by(() => {
    if (!shape.usesSimpleBackground) return '';
    const backgroundFill = background?._children?.Fill ?? null;
    const backgroundBorder = background?._children?.Border ?? null;

    const fillEnabled = backgroundFill?.solidEnabled !== false;
    const borderEnabled = backgroundBorder?.enabled === true && numberOr(backgroundBorder?.thickness, 0) > 0;
    const fillColour = fillEnabled ? cssColour(backgroundFill?.colour ?? '00000000', 'transparent') : 'transparent';
    const borderColour = borderEnabled ? cssColour(backgroundBorder?.colour ?? 'FFFFFFFF', '#FFFFFF') : 'transparent';
    const borderWidth = borderEnabled ? Math.max(0, numberOr(backgroundBorder?.thickness, 1)) : 0;

    return [
      'position:absolute',
      'inset:0',
      'box-sizing:border-box',
      'border-radius:9999px',
      `background:${fillColour}`,
      borderWidth > 0 ? `border:${borderWidth}px solid ${borderColour}` : 'border:none',
    ].join('; ');
  });

  let vectorShapeSvg = $derived.by(() => {
    if (!shape.rendersVectorShape) return null;
    const backgroundFill = background?._children?.Fill ?? null;
    const backgroundBorder = background?._children?.Border ?? null;
    const width = Math.max(1, frame.width);
    const height = Math.max(1, frame.height);
    const fillEnabled = backgroundFill?.solidEnabled !== false;
    const borderEnabled = backgroundBorder?.enabled === true && numberOr(backgroundBorder?.thickness, 0) > 0;
    const strokeWidth = borderEnabled ? Math.max(1, numberOr(backgroundBorder?.thickness, 1)) : 0;
    const fill = fillEnabled ? cssColour(backgroundFill?.colour ?? '00000000', 'transparent') : 'none';
    const stroke = borderEnabled ? cssColour(backgroundBorder?.colour ?? 'FFFFFFFF', '#FFFFFF') : 'none';

    if (shape.rendersLine) {
      // A line/divider has no area: paint the border as a centered stroke,
      // falling back to the fill colour or white when no border is set.
      const lineStroke = stroke !== 'none'
        ? stroke
        : (fillEnabled ? cssColour(backgroundFill?.colour ?? 'FFFFFFFF', '#FFFFFF') : '#FFFFFF');
      const lineWidth = strokeWidth > 0 ? strokeWidth : 2;
      return {
        width, height, points: '',
        line: { x1: 0, y1: height / 2, x2: width, y2: height / 2, stroke: lineStroke, width: lineWidth },
      };
    }

    if (shape.compoundPathData) {
      // Scaled into the box the way a polygon's points are, inset by half the stroke so the stroke
      // stays inside the box; the stroke itself does not scale.
      const open = part?.meta?.closed === false;
      const pathStroke = open && stroke === 'none'
        ? (fillEnabled ? cssColour(backgroundFill?.colour ?? 'FFFFFFFF', '#FFFFFF') : '#FFFFFF')
        : stroke;
      const pathStrokeWidth = open && strokeWidth === 0 ? 2 : strokeWidth;
      const inset = pathStrokeWidth / 2;
      return {
        width, height, line: null, points: '',
        fill: open ? 'none' : fill,
        stroke: pathStroke,
        strokeWidth: pathStrokeWidth,
        d: shape.compoundPathData,
        transform: `translate(${inset} ${inset}) scale(${Math.max(0.001, width - 2 * inset)} ${Math.max(0.001, height - 2 * inset)})`,
      };
    }

    if (shape.rendersOpenPath) {
      // An open path has no inside: stroke it like a line, falling back the same way.
      const openStroke = stroke !== 'none'
        ? stroke
        : (fillEnabled ? cssColour(backgroundFill?.colour ?? 'FFFFFFFF', '#FFFFFF') : '#FFFFFF');
      const openWidth = strokeWidth > 0 ? strokeWidth : 2;
      return {
        width, height, fill: 'none', stroke: openStroke, strokeWidth: openWidth, open: true,
        points: polygonToSvgPoints(shape.polygonVerts, width, height, openWidth / 2),
        line: null,
      };
    }

    const inset = strokeWidth / 2;
    return {
      width, height, fill, stroke, strokeWidth,
      points: polygonToSvgPoints(shape.polygonVerts, width, height, inset),
      line: null,
    };
  });

  // A closed polygon's fill when it has a gradient (gradientLayerStyle): the solid colour on a box
  // clipped to the same points the SVG polygon fills, so the two cannot drift apart.
  let polygonFillStyle = $derived.by(() => {
    if (!gradientLayerStyle || !shape.rendersVectorShape || !vectorShapeSvg?.points || vectorShapeSvg.open || vectorShapeSvg.line || vectorShapeSvg.d) return '';
    const corners = String(vectorShapeSvg.points).trim().split(/\s+/)
      .map((pair) => pair.split(',').map(Number))
      .filter(([x, y]) => Number.isFinite(x) && Number.isFinite(y))
      .map(([x, y]) => `${x}px ${y}px`);
    if (corners.length < 3) return '';
    const solid = vectorShapeSvg.fill && vectorShapeSvg.fill !== 'none' ? vectorShapeSvg.fill : 'transparent';
    return `clip-path: polygon(${corners.join(', ')}); background: ${solid};`;
  });

  let envelopeSvg = $derived.by(() => {
    if (!shape.rendersEnvelopePath) return { d: '', fillD: '', stroke: '#65E6A0', fill: 'transparent', strokeWidth: 3 };
    const envelopePath = part?.meta?.envelopePath ?? null;
    const width = Math.max(1, frame.width);
    const height = Math.max(1, frame.height);
    const padX = clampNumber(envelopePath?.padX, 0, width / 3);
    const padY = clampNumber(envelopePath?.padY, 0, height / 3);
    const innerWidth = Math.max(1, width - (padX * 2));
    const bottom = Math.max(padY + 1, height - padY);
    const top = padY;
    const normalizedPoints = Array.isArray(envelopePath?.points) ? envelopePath.points : [];
    const points = normalizedPoints.length >= 2
      ? normalizedPoints.map((point) => {
        const x = clampNumber(point?.x, 0, 1);
        const y = clampNumber(point?.y, 0, 1);
        return [
          padX + (innerWidth * x),
          bottom - ((bottom - top) * y),
        ];
      })
      : (() => {
        const attack = clampNumber(envelopePath?.attack, 0, 1);
        const decay = clampNumber(envelopePath?.decay, 0, 1);
        const sustain = clampNumber(envelopePath?.sustain, 0, 1);
        const release = clampNumber(envelopePath?.release, 0, 1);
        const attackX = padX + Math.max(12, innerWidth * (0.12 + attack * 0.18));
        const sustainX = Math.min(width - padX - 36, attackX + Math.max(22, innerWidth * (0.12 + decay * 0.16)));
        const releaseX = Math.max(sustainX + 28, width - padX - Math.max(20, innerWidth * (0.08 + release * 0.22)));
        const sustainY = bottom - ((bottom - top) * sustain);
        return [
          [padX, bottom],
          [attackX, top],
          [sustainX, sustainY],
          [releaseX, sustainY],
          [width - padX, bottom],
        ];
      })();
    const d = points.map(([x, y], index) => `${index === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${y.toFixed(2)}`).join(' ');
    const firstX = points[0]?.[0] ?? padX;
    const lastX = points.at(-1)?.[0] ?? (width - padX);
    const fillD = `${d} L ${lastX.toFixed(2)} ${bottom.toFixed(2)} L ${firstX.toFixed(2)} ${bottom.toFixed(2)} Z`;
    return {
      d,
      fillD,
      stroke: cssColour(envelopePath?.stroke ?? 'FF65E6A0', '#65E6A0'),
      fill: cssColour(envelopePath?.fill ?? '2265E6A0', 'rgba(101,230,160,0.12)'),
      strokeWidth: clampNumber(envelopePath?.strokeWidth, 1, 12),
    };
  });

  function waveformPath(type, left, right, top, bottom, mid) {
    const width = right - left;
    if (type === 'saw') {
      return `M ${left} ${bottom} L ${right} ${top} L ${right} ${bottom}`;
    }
    if (type === 'square') {
      return `M ${left} ${bottom} L ${left} ${top} L ${left + width * 0.5} ${top} L ${left + width * 0.5} ${bottom} L ${right} ${bottom}`;
    }
    if (type === 'noise') {
      const amplitude = Math.max(2, (bottom - top) * 0.42);
      const points = [
        [left, mid],
        [left + width * 0.12, mid - amplitude * 0.65],
        [left + width * 0.23, mid + amplitude * 0.35],
        [left + width * 0.34, mid - amplitude * 0.2],
        [left + width * 0.46, mid + amplitude * 0.78],
        [left + width * 0.58, mid - amplitude * 0.72],
        [left + width * 0.7, mid + amplitude * 0.08],
        [left + width * 0.82, mid - amplitude * 0.36],
        [right, mid],
      ];
      return points.map(([x, y], index) => `${index === 0 ? 'M' : 'L'} ${clampNumber(x, left, right).toFixed(2)} ${clampNumber(y, top, bottom).toFixed(2)}`).join(' ');
    }
    return `M ${left} ${mid} C ${left + width * 0.25} ${top}, ${left + width * 0.25} ${top}, ${left + width * 0.5} ${mid} C ${left + width * 0.75} ${bottom}, ${left + width * 0.75} ${bottom}, ${right} ${mid}`;
  }

  let waveformSvg = $derived.by(() => {
    if (!shape.rendersWaveformIcon) return { d: '', tileD: '', tiles: [], stroke: '#EAF0F6', strokeWidth: 3, animate: false, animationMode: 'scroll', durationMs: 900 };
    const waveformIcon = part?.meta?.waveformIcon ?? null;
    const width = Math.max(1, frame.width);
    const height = Math.max(1, frame.height);
    const pad = Math.max(2, Math.min(width, height) * 0.16);
    const left = pad;
    const right = width - pad;
    const top = pad;
    const mid = height / 2;
    const bottom = height - pad;
    const type = String(waveformIcon?.type ?? 'sine').trim().toLowerCase();
    const d = waveformPath(type, left, right, top, bottom, mid);
    const tileTop = top;
    const tileBottom = bottom;
    const tileMid = mid;
    const tileD = waveformPath(type, 0, width, tileTop, tileBottom, tileMid);
    return {
      d,
      tileD,
      tiles: [0, width, width * 2],
      stroke: cssColour(waveformIcon?.stroke ?? 'FFEAF0F6', '#EAF0F6'),
      strokeWidth: clampNumber(waveformIcon?.strokeWidth, 1, 8),
      animate: waveformIcon?.animate === true,
      animationMode: String(waveformIcon?.animationMode ?? waveformIcon?.animation ?? 'scroll').trim().toLowerCase(),
      durationMs: Math.max(120, numberOr(waveformIcon?.animationDurationMs ?? waveformIcon?.duration, 900)),
    };
  });
</script>

{#snippet partElement()}
  <div class="interactive-part" class:debug={debug} data-part-name={partName || part?.name || undefined} data-focus-ring={sliderControl?.domFocus === true ? '' : undefined} style={partStyle}>
    {#if renderedImage}
      <img class="interactive-part-rendered" data-rendered-look={part?.name ?? ''} src={renderedImage.url} alt=""
        style={`left:${renderedImage.x}px; top:${renderedImage.y}px; width:${renderedImage.w}px; height:${renderedImage.h}px;`} />
    {:else if surfaceEffects}
      <EffectSurface {effects} width={frame.width} height={frame.height} shadowsOnly target="part">{@render partContent()}</EffectSurface>
    {:else}
      {@render partContent()}
    {/if}
  </div>
{/snippet}

{#snippet partContent()}
    {#if materialLit}
      <MaterialFilter id={materialId} {material} />
    {/if}
    {#if shape.rendersOutline}
      {#if outline}
        {#if shadowLayers?.outer.length}
          <svg class="interactive-outline-shadow" viewBox={`0 0 ${Math.max(1, frame.width)} ${Math.max(1, frame.height)}`} aria-hidden="true">
            <defs>
              <mask id={`${partUid}-outside`} maskUnits="userSpaceOnUse" x={-shadowLayers.reach} y={-shadowLayers.reach} width={frame.width + 2 * shadowLayers.reach} height={frame.height + 2 * shadowLayers.reach}>
                <rect x={-shadowLayers.reach} y={-shadowLayers.reach} width={frame.width + 2 * shadowLayers.reach} height={frame.height + 2 * shadowLayers.reach} fill="white" />
                <path d={outline.d} fill="black" fill-rule="evenodd" />
              </mask>
              {#each shadowLayers.outer as shadow, i (i)}
                <filter id={`${partUid}-shadow-${i}`} filterUnits="userSpaceOnUse" x={-shadowLayers.reach} y={-shadowLayers.reach} width={frame.width + 2 * shadowLayers.reach} height={frame.height + 2 * shadowLayers.reach}>
                  {#if shadow.spread > 0}<feMorphology operator="dilate" radius={shadow.spread} />{:else if shadow.spread < 0}<feMorphology operator="erode" radius={-shadow.spread} />{/if}
                  {#if shadow.blur > 0}<feGaussianBlur stdDeviation={shadow.blur / 2} />{/if}
                </filter>
              {/each}
            </defs>
            <g mask={`url(#${partUid}-outside)`}>
              {#each shadowLayers.outer as shadow, i (i)}
                <path d={outline.d} fill={shadow.colour} fill-rule="evenodd" transform={`translate(${shadow.x} ${shadow.y})`} filter={`url(#${partUid}-shadow-${i})`} />
              {/each}
            </g>
          </svg>
        {/if}
        {#if background}
          <BackgroundRenderer {background} width={frame.width} height={frame.height} {outline} />
        {/if}
        {#if shadowLayers?.inner.length}
          <svg class="interactive-outline-shadow" viewBox={`0 0 ${Math.max(1, frame.width)} ${Math.max(1, frame.height)}`} aria-hidden="true">
            <defs>
              <clipPath id={`${partUid}-inside`}><path d={outline.d} clip-rule="evenodd" /></clipPath>
              {#each shadowLayers.inner as shadow, i (i)}
                <filter id={`${partUid}-inner-${i}`} filterUnits="userSpaceOnUse" x={-shadowLayers.reach} y={-shadowLayers.reach} width={frame.width + 2 * shadowLayers.reach} height={frame.height + 2 * shadowLayers.reach}>
                  {#if shadow.blur > 0}<feGaussianBlur stdDeviation={shadow.blur / 2} />{/if}
                </filter>
              {/each}
            </defs>
            <g clip-path={`url(#${partUid}-inside)`}>
              {#each shadowLayers.inner as shadow, i (i)}
                {@const reach = shadowLayers.reach}
                <!-- Everything outside the shape, moved by the offset and shrunk by the spread, blurred
                     back in over the edge: an inset box-shadow, on the outline. -->
                <g filter={`url(#${partUid}-inner-${i})`}>
                  <path fill={shadow.colour} fill-rule="evenodd"
                    d={`M ${-reach} ${-reach} H ${frame.width + reach} V ${frame.height + reach} H ${-reach} Z ${outline.d}`}
                    transform={`translate(${shadow.x} ${shadow.y})`} />
                  {#if shadow.spread > 0}
                    <path d={outline.d} fill="none" stroke={shadow.colour} stroke-width={shadow.spread * 2} transform={`translate(${shadow.x} ${shadow.y})`} />
                  {/if}
                </g>
              {/each}
            </g>
          </svg>
        {/if}
      {/if}
    {:else if background && shape.usesSimpleBackground && !shape.rendersVectorShape}
      <div class="interactive-simple-background ce-colour-anim" style={simpleBackgroundStyle}>
        {#if gradientLayerStyle}<div class="interactive-gradient-layer" style={gradientLayerStyle}></div>{/if}
      </div>
    {:else if background && !shape.rendersVectorShape && !shape.rendersArcTrack}
      <!-- Not for an arc: it is drawn from its own Arc settings (arcSvgData below). Its Background
           holds the colour and thickness that fall back to, and drawn as a box it put a full ring,
           radius 999 and the arc's own colour, under every arc the Arc pen made, so the arc's gap
           never showed. -->
      <BackgroundRenderer {background} width={frame.width} height={frame.height} absorbFill={!!absorbedFillCSS} />
    {/if}

    {#if polygonFillStyle}
      <!-- A polygon with a gradient: its fill, the solid colour and the gradient over it, on a box
           clipped to the polygon's own points; the SVG below draws only its stroke. -->
      <div class="interactive-polygon-fill" style={polygonFillStyle}>
        <div class="interactive-gradient-layer" style={gradientLayerStyle}></div>
      </div>
    {/if}
    {#if shape.rendersVectorShape && vectorShapeSvg}
      <svg class="interactive-vector-shape ce-colour-anim" viewBox={`0 0 ${vectorShapeSvg.width} ${vectorShapeSvg.height}`} preserveAspectRatio="none" aria-hidden="true">
        {#if vectorShapeSvg.line}
          <line
            x1={vectorShapeSvg.line.x1}
            y1={vectorShapeSvg.line.y1}
            x2={vectorShapeSvg.line.x2}
            y2={vectorShapeSvg.line.y2}
            stroke={vectorShapeSvg.line.stroke}
            stroke-width={vectorShapeSvg.line.width}
            stroke-linecap="round"
          ></line>
        {:else if vectorShapeSvg.d}
          <path
            d={vectorShapeSvg.d}
            transform={vectorShapeSvg.transform}
            fill={vectorShapeSvg.fill}
            fill-rule="evenodd"
            stroke={vectorShapeSvg.stroke}
            stroke-width={vectorShapeSvg.strokeWidth}
            stroke-linejoin="round"
            stroke-linecap="round"
            vector-effect="non-scaling-stroke"
          ></path>
        {:else if vectorShapeSvg.open}
          <polyline
            points={vectorShapeSvg.points}
            fill="none"
            stroke={vectorShapeSvg.stroke}
            stroke-width={vectorShapeSvg.strokeWidth}
            stroke-linejoin="round"
            stroke-linecap="round"
          ></polyline>
        {:else}
          <polygon
            points={vectorShapeSvg.points}
            fill={polygonFillStyle ? 'none' : vectorShapeSvg.fill}
            stroke={vectorShapeSvg.stroke}
            stroke-width={vectorShapeSvg.strokeWidth}
            stroke-linejoin="round"
          ></polygon>
        {/if}
      </svg>
    {/if}

    {#if sliderResolved && sliderAnatomy}
      <ControlAnatomy
        control={sliderResolved.control}
        runtime={sliderResolved.runtime}
        width={frame.width}
        height={frame.height}
        label={String(sliderResolved.control?._children?.Text?.content ?? '')}
      />
    {:else if sliderResolved}
      <SliderFamilyRenderer
        control={sliderResolved.control}
        runtime={sliderResolved.runtime}
        width={frame.width}
        height={frame.height}
        partTransitions={sliderTransitions?.partTransitions ?? null}
        {debug}
      />
    {/if}

    {#if shape.rendersValueArc}
      <div class="interactive-value-arc" style={valueArcStyle}></div>
    {/if}

    {#if arcPaintStyle}
      <div class="interactive-arc-paint" style={arcPaintStyle}>
        <BackgroundRenderer {background} width={arcSvgData.size + 2 * arcPaintPad} height={arcSvgData.size + 2 * arcPaintPad} />
      </div>
    {:else if arcZoneStyle}
      <div class="interactive-arc-zones" style={arcZoneStyle}></div>
    {:else if arcSvgData}
      <svg class="interactive-arc-svg" viewBox="0 0 {arcSvgData.size} {arcSvgData.size}" aria-hidden="true">
        <circle
          cx={arcSvgData.size / 2}
          cy={arcSvgData.size / 2}
          r={arcSvgData.r}
          fill="none"
          stroke={arcSvgData.colour}
          stroke-width={arcSvgData.thickness}
          stroke-linecap={arcSvgData.cap}
          stroke-dasharray="{arcSvgData.arcLength} {arcSvgData.circumference}"
          transform="rotate({arcSvgData.rotation} {arcSvgData.size / 2} {arcSvgData.size / 2})"
        />
      </svg>
    {/if}

    {#if shape.rendersEnvelopePath}
      <svg class="interactive-envelope-path" viewBox={`0 0 ${Math.max(1, frame.width)} ${Math.max(1, frame.height)}`} aria-hidden="true">
        <path d={envelopeSvg.fillD} fill={envelopeSvg.fill}></path>
        <path d={envelopeSvg.d} fill="none" stroke={envelopeSvg.stroke} stroke-width={envelopeSvg.strokeWidth} stroke-linecap="round" stroke-linejoin="round"></path>
      </svg>
    {/if}

    {#if shape.rendersWaveformIcon}
      <svg class="interactive-waveform-icon" class:dash-scrolling={waveformSvg.animate && waveformSvg.animationMode === 'dash'} class:real-scrolling={waveformSvg.animate && waveformSvg.animationMode !== 'dash'} viewBox={`0 0 ${Math.max(1, frame.width)} ${Math.max(1, frame.height)}`} aria-hidden="true">
        {#if waveformSvg.animate && waveformSvg.animationMode !== 'dash'}
          <g class="waveform-strip">
            <animateTransform attributeName="transform" type="translate" from="0 0" to={`-${Math.max(1, frame.width)} 0`} dur={`${waveformSvg.durationMs}ms`} repeatCount="indefinite" />
            {#each waveformSvg.tiles as offset}
              <path d={waveformSvg.tileD} transform={`translate(${offset} 0)`} fill="none" stroke={waveformSvg.stroke} stroke-width={waveformSvg.strokeWidth} stroke-linecap="round" stroke-linejoin="round"></path>
            {/each}
          </g>
        {:else}
          <path d={waveformSvg.d} fill="none" stroke={waveformSvg.stroke} stroke-width={waveformSvg.strokeWidth} stroke-linecap="round" stroke-linejoin="round"></path>
        {/if}
      </svg>
    {/if}

    {#if partIconUrl}
      <div class="interactive-part-icon">
        {#if usesIconTint(partIcon?.tint)}
          <div class="interactive-part-icon-image" style={`${iconImageStyle(partIcon)}; ${buildIconTintStyle(partIcon.tint, partIconUrl, partIcon?.fit)}`} aria-hidden="true"></div>
        {:else}
          <img class="interactive-part-icon-image" style={iconImageStyle(partIcon)} src={partIconUrl} alt="" />
        {/if}
      </div>
    {/if}

    {#if text && !editableInput}
      {#each textDecorations.filter((line) => !line.front) as line (line.kind)}
        <div class="interactive-part-text-line" style={`left:${line.left}px; top:${line.top}px; width:${line.width}px; height:${line.height}px; background:${line.colour};`}></div>
      {/each}
      <div class="interactive-part-text ce-colour-anim" style={textStyle}>
        {text?.content ?? ''}
      </div>
      {#each textDecorations.filter((line) => line.front) as line (line.kind)}
        <div class="interactive-part-text-line front" style={`left:${line.left}px; top:${line.top}px; width:${line.width}px; height:${line.height}px; background:${line.colour};`}></div>
      {/each}
    {:else if editableInput}
      <input
        class="interactive-part-input"
        type="text"
        inputmode={editableInput.inputMode ?? 'decimal'}
        value={editableInput.value ?? ''}
        disabled={editableInput.disabled === true}
        readonly={editableInput.readOnly === true}
        aria-label={editableInput.ariaLabel ?? 'Value'}
        tabindex={editableInput.tabIndex ?? -1}
        style={inputStyle}
        oninput={oneditableinput}
        onkeydown={oneditablekeydown}
        onfocus={oneditablefocus}
        onblur={oneditableblur}
        onpointerdown={(event) => event.stopPropagation()}
        onmousedown={(event) => event.stopPropagation()}
      />
    {/if}

    {#if isFramesImage(image)}
      <div class="interactive-part-frames" style="position:absolute; inset:0; isolation:isolate; pointer-events:none">
        {#each frameStyles as style}
          <div style={style}></div>
        {/each}
      </div>
    {:else if image}
      <div class="interactive-part-image" style={imageStyle}></div>
    {/if}

    {#if debug}
      <div class="part-debug-chip">{part?.name ?? part?.role ?? 'part'}</div>
    {/if}
{/snippet}

{#if part?.visible !== false || fadeHidden}
  {#if maskFixed}
    <div class="interactive-part-fixed-mask" data-mask-for={partName || part?.name || undefined} style={fixedMaskStyle}>
      {@render partElement()}
    </div>
  {:else}
    {@render partElement()}
  {/if}
{/if}

<style>
  .interactive-part {
    position: absolute;
    box-sizing: border-box;
    pointer-events: none;
  }

  .interactive-part-fixed-mask {
    position: absolute;
    left: 0;
    top: 0;
    pointer-events: none;
  }

  /* The elements inside a part that paint a colour glide with the part's colour timing. */
  .ce-colour-anim,
  .interactive-vector-shape :global(line),
  .interactive-vector-shape :global(polygon) {
    transition: var(--ce-colour-transition, none);
  }

  /* …and play its keyframe colour frames, each the one property it paints with. */
  .interactive-simple-background { animation: var(--ce-kf-paint, none); }
  .interactive-vector-shape :global(polygon) { animation: var(--ce-kf-shape, none); }
  .interactive-vector-shape :global(line) { animation: var(--ce-kf-stroke, none); }
  .interactive-part-text { animation: var(--ce-kf-text, none); }
  /* A text layer's underline, strikethrough or overline: under its glyphs, or over them (front). */
  .interactive-part-text-line { position: absolute; pointer-events: none; z-index: 1; }
  .interactive-part-icon { position: absolute; inset: 0; box-sizing: border-box; pointer-events: none; }
  .interactive-part-rendered { position: absolute; display: block; max-width: none; pointer-events: none; }
  .interactive-part-icon-image { display: block; }
  .interactive-part-text-line.front { z-index: 3; }

  /* Editable value field — make editing visually obvious (caret + focus highlight). */
  .interactive-part-input {
    caret-color: currentColor;
  }

  .interactive-part-input:focus {
    outline: 1px solid rgba(120, 180, 255, 0.9);
    outline-offset: -1px;
    background: rgba(120, 180, 255, 0.14) !important;
  }

  .interactive-part-input::selection {
    background: rgba(120, 180, 255, 0.45);
  }

  .interactive-value-arc {
    position: absolute;
    inset: 0;
    border-radius: 50%;
    pointer-events: none;
  }

  .interactive-arc-zones {
    position: absolute;
    left: 50%;
    top: 50%;
    transform: translate(-50%, -50%);
    pointer-events: none;
  }

  .interactive-arc-svg {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    overflow: visible;
    pointer-events: none;
  }

  .interactive-outline-shadow {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    overflow: visible;
    pointer-events: none;
  }

  .interactive-polygon-fill {
    position: absolute;
    inset: 0;
    pointer-events: none;
  }

  .interactive-gradient-layer {
    position: absolute;
    inset: 0;
    border-radius: inherit;
    pointer-events: none;
  }

  .interactive-envelope-path,
  .interactive-waveform-icon,
  .interactive-vector-shape {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    overflow: visible;
    pointer-events: none;
  }

  .interactive-waveform-icon.real-scrolling {
    overflow: hidden;
  }

  .interactive-waveform-icon path {
    vector-effect: non-scaling-stroke;
  }

  .interactive-waveform-icon.dash-scrolling path {
    stroke-dasharray: 14 8;
    animation: waveform-icon-scroll 760ms linear infinite;
  }

  @keyframes waveform-icon-scroll {
    from { stroke-dashoffset: 0; }
    to { stroke-dashoffset: -22; }
  }

  .part-debug-chip {
    position: absolute;
    top: 2px;
    left: 2px;
    padding: 2px 5px;
    border-radius: 999px;
    background: rgba(9, 71, 113, 0.92);
    color: #FFF;
    font-size: 9px;
    line-height: 1;
    letter-spacing: 0.2px;
    text-transform: uppercase;
    pointer-events: none;
    box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.08);
  }

  .interactive-part::after {
    content: '';
    position: absolute;
    inset: 0;
    pointer-events: none;
  }

  .interactive-part.debug::after {
    border: 1px dashed rgba(91, 155, 213, 0.55);
  }
</style>
