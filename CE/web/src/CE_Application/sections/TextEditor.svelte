<script>
  import { Bold, Italic, Underline, Strikethrough } from 'lucide-svelte';
  import { getSection, updateControlProperty, updateSelectedProperty } from '../stores/controls.js';
  import { selectedComponentIds } from '../stores/panels.js';
  import { availableFonts, WEIGHT_OPTIONS, ensureStoredFontLoaded } from '../stores/appSettings.js';
  import { activateColorTarget } from '../stores/colorTarget.js';
  import { ensureFillGradientSeeded, openFillGradientEditor } from '../stores/gradientTarget.js';
  import AlignmentPicker from '../properties/AlignmentPicker.svelte';
  import PropertyCell from '../properties/PropertyCell.svelte';
  import PropertyColor from '../properties/PropertyColor.svelte';
  import PropertySection from '../properties/PropertySection.svelte';
  import PropertyToggle from '../properties/PropertyToggle.svelte';
  import { stateEditScope } from '../stores/stateEditScope.js';
  import { sectionCollapse, setCollapsed } from '../stores/sectionCollapse.js';
  import { gradientToCSS } from '../utils/gradientCSS.js';
  import { deepClone } from '../utils/deepClone.js';
  import { browseImage, onImageBrowsed } from '../bridge/bridge.js';
  import NumberInput from './NumberInput.svelte';
  import TextLineDecorationControls from './TextLineDecorationControls.svelte';
  import {
    DEFAULT_TEXT_FILL_GRADIENT,
    FLOW_MODE_OPTIONS,
    TEXT_FILL_LAYER_ICONS,
    TEXT_FILL_LAYER_LABELS,
    TEXT_FILL_LAYER_ORDER,
    TEXT_POSITION_OPTIONS,
    TEXT_READING_OPTIONS,
    TYPOGRAPHY_FEATURE_OPTIONS,
  } from './textEditorOptions.js';

  let {
    control = null,
    textPathPrefix = 'Text',
    textOverride = null,
    editorScope = 'component-text',
  } = $props();

  let core = $derived(getSection(control, 'Core'));
  let transform = $derived(getSection(control, 'Transform'));
  let text = $derived(textOverride ?? getSection(control, 'Text'));
  let textFill = $derived(text?._children?.Fill ?? null);
  let font = $derived(text?._children?.Font ?? null);
  let multiline = $derived(text?._children?.Multiline ?? null);
  let textEffects = $derived(text?._children?.Effects ?? null);
  let position = $derived(text?._children?.Position ?? null);
  let selectedFontOption = $derived(
    $availableFonts.find(option => option.value === (font?.family ?? 'Arial'))
    ?? $availableFonts.find(option => option.family === (font?.family ?? 'Arial'))
    ?? null
  );
  let weightedFontSelected = $derived(selectedFontOption?.supportsWeight === true);
  let effectiveWeightValue = $derived(font?.weightValue ?? (font?.weight === 'Bold' ? 700 : 400));
  let boldActive = $derived(weightedFontSelected ? effectiveWeightValue >= 700 : font?.weight === 'Bold');
  let selectedFontPreviewFamily = $derived(selectedFontOption?.cssFamily ?? font?.family ?? 'Arial');
  $effect(() => {
    if (!selectedFontOption) return;
    ensureStoredFontLoaded(selectedFontOption, { allowFeatureBackfill: true, delayMs: 0 });
  });
  let displayedVerticalOffset = $derived(-(position?.offsetY ?? 0));
  let displayedWeightValue = $derived(String(normalizeWeightValue(effectiveWeightValue)));
  let lineColourFallback = $derived(String(textFill?.colour ?? 'FFFFFFFF'));
  let textFillModeValue = $derived.by(() => {
    const value = String(textFill?.mode ?? 'solid');
    return ['solid', 'gradient', 'image', 'texture'].includes(value) ? value : 'solid';
  });
  let textFillGradientPreview = $derived.by(() =>
    textFill?.gradient?.stops?.length >= 2 ? gradientToCSS(textFill.gradient) : 'linear-gradient(90deg, #ffffff, #000000)'
  );
  let selectedFontAxes = $derived(Array.isArray(selectedFontOption?.axes) ? selectedFontOption.axes : []);
  let selectedFontSupportedFeatures = $derived(
    Array.isArray(selectedFontOption?.supportedFeatures) ? selectedFontOption.supportedFeatures : []
  );
  let selectedFontFeatureSupportKnown = $derived(selectedFontOption?.featureSupportKnown === true);
  let editScope = $derived($stateEditScope);
  let fontEditorRenderKey = $derived(
    `${core?.id ?? 'global'}:${textPathPrefix}:${editScope?.mode ?? 'base'}:${editScope?.stateName ?? ''}:${font?.family ?? 'Arial'}:${font?.weightValue ?? font?.weight ?? 400}:${font?.style ?? 'Normal'}`
  );
  let textReadingOrientationValue = $derived.by(() => {
    const value = String(position?.readingOrientation ?? 'ltr');
    return value === 'rtl' || value === 'mirrored' ? value : 'ltr';
  });
  let textFlowModeValue = $derived.by(() => {
    const value = String(position?.flowMode ?? 'rotate');
    return ['rotate', 'line', 'stair', 'arc', 'circle', 'vertical', 'wave', 'zigzag', 'spiral', 'perimeter', 'polyline', 'bezier', 'freehand'].includes(value) ? value : 'rotate';
  });
  let textFlowAngleValue = $derived(resolveFlowAngle(position));
  function sectionKey(name) {
    return `${editorScope}:${core?.id ?? 'global'}:${textPathPrefix}:${name}`;
  }

  function fillLayerCollapseKey(layerId) {
    return `${editorScope}:${core?.id ?? 'global'}:${textPathPrefix}:fill-layer:${layerId}`;
  }

  let textSectionCollapsed = $derived($sectionCollapse[sectionKey('text')] ?? false);
  let fillSectionCollapsed = $derived($sectionCollapse[sectionKey('fill')] ?? false);
  let fontSectionCollapsed = $derived($sectionCollapse[sectionKey('font')] ?? false);
  let typographySectionCollapsed = $derived($sectionCollapse[sectionKey('typography')] ?? false);
  let multilineSectionCollapsed = $derived($sectionCollapse[sectionKey('multiline')] ?? false);
  let positionSectionCollapsed = $derived($sectionCollapse[sectionKey('position')] ?? false);
  let orientationSectionCollapsed = $derived($sectionCollapse[sectionKey('orientation')] ?? false);
  let effectsSectionCollapsed = $derived($sectionCollapse[sectionKey('effects')] ?? false);
  let lineSectionCollapsed = $derived($sectionCollapse[sectionKey('line')] ?? false);
  let reflectionEffectActive = $derived.by(() =>
    textEffects?.reflectionEnabled === true || (textEffects?.reflectionEnabled == null && textEffects?.copyEnabled === true)
  );
  let textEffectControlsVisible = $derived.by(() =>
    textEffects?.outlineEnabled === true
    || textEffects?.stroke2Enabled === true
    || textEffects?.shadowEnabled === true
    || textEffects?.glowEnabled === true
    || textEffects?.innerGlowEnabled === true
    || textEffects?.innerShadowEnabled === true
    || textEffects?.blurEnabled === true
    || textEffects?.motionEnabled === true
    || textEffects?.bevelEnabled === true
    || reflectionEffectActive
  );
  let visibleTypographyFeatureOptions = $derived.by(() => {
    if (!selectedFontFeatureSupportKnown) return [];
    return TYPOGRAPHY_FEATURE_OPTIONS.filter((option) =>
      option.tags.some((tag) => selectedFontSupportedFeatures.includes(tag))
    );
  });
  let textDraft = $state('');
  let textDraftSource = $state('');
  let displayTextFillColour = $derived(String(textFill?.colour ?? 'FFFFFFFF').slice(-6));

  $effect(() => {
    const current = String(text?.content ?? '');
    if (current !== textDraftSource) {
      textDraft = current;
      textDraftSource = current;
    }
  });

  function set(path, value) {
    if (!core?.id) return;
    const scoped = scopeTextPath(path);
    if ($selectedComponentIds.size > 1) {
      updateSelectedProperty(scoped, value);
    } else {
      updateControlProperty(core.id, scoped, value);
    }
  }

  function scopeTextPath(path) {
    const raw = String(path ?? '');
    if (textPathPrefix === 'Text') return raw;
    if (raw === 'Text') return textPathPrefix;
    if (raw.startsWith('Text.')) return `${textPathPrefix}${raw.slice('Text'.length)}`;
    return raw;
  }

  function textFillAssetRequestId(kind) {
    return `componentTextFill:${core?.id ?? 'global'}:${textPathPrefix}:${kind}`;
  }

  function fillProp(name, fallback) {
    return textFill?.[name] ?? fallback;
  }

  function setFillNumber(name, value, step = 1) {
    set(`Text.Fill.${name}`, roundLineValue(value, step));
  }

  function setFillColor(value) {
    let normalized = String(value ?? '').replace(/^#/, '').toUpperCase();
    if (normalized.length === 6) normalized = `FF${normalized}`;
    if (normalized.length !== 8) return;
    set('Text.Fill.colour', normalized);
  }

  function setTextFillDisplayColour(event) {
    setFillColor(event?.target?.value ?? event);
  }

  function handleFillColorSwatch() {
    if (!core?.id) return;
    activateColorTarget(
      { type: 'control', controlId: core.id, path: scopeTextPath('Text.Fill.colour') },
      String(textFill?.colour ?? 'FFFFFFFF')
    );
  }

  function ensureTextGradient() {
    return ensureFillGradientSeeded({
      fill: textFill,
      defaultGradient: DEFAULT_TEXT_FILL_GRADIENT,
      seedGradient: (seeded) => set('Text.Fill.gradient', seeded),
    });
  }

  function openTextGradientEditor() {
    if (!core?.id || $selectedComponentIds.size > 1) return;
    openFillGradientEditor({
      controlId: core.id,
      targetPath: scopeTextPath('Text.Fill'),
      fill: textFill,
      defaultGradient: DEFAULT_TEXT_FILL_GRADIENT,
      seedGradient: (seeded) => set('Text.Fill.gradient', seeded),
    });
  }

  function chooseTextFillAsset(kind) {
    if (!core?.id || $selectedComponentIds.size > 1) return;
    browseImage(textFillAssetRequestId(kind));
  }

  function setTextFillMode(mode) {
    const nextMode = TEXT_FILL_LAYER_ORDER.includes(mode) ? mode : 'solid';
    set('Text.Fill.mode', nextMode);
    set('Text.Fill.gradientEnabled', nextMode === 'gradient');
    set('Text.Fill.imageEnabled', nextMode === 'image');
    set('Text.Fill.textureEnabled', nextMode === 'texture');
    if (nextMode === 'gradient') ensureTextGradient();
  }

  function setTextFillTint(path, value) {
    let normalized = String(value ?? '').replace(/^#/, '').toUpperCase();
    if (normalized.length === 6) normalized = `FF${normalized}`;
    if (normalized.length !== 8) return;
    set(path, normalized);
  }

  onImageBrowsed((result) => {
    if (!core?.id) return;
    if (result.requestId === textFillAssetRequestId('image')) {
      set('Text.Fill.imageSrc', result.filePath);
      set('Text.Fill.imageEnabled', true);
      set('Text.Fill.mode', 'image');
    } else if (result.requestId === textFillAssetRequestId('texture')) {
      set('Text.Fill.textureSrc', result.filePath);
      set('Text.Fill.textureEnabled', true);
      set('Text.Fill.mode', 'texture');
    }
  });

  function caseModeValue() {
    const value = String(font?.caseMode ?? 'normal');
    return ['normal', 'uppercase', 'lowercase', 'title', 'sentence', 'smallcaps'].includes(value) ? value : 'normal';
  }

  function scriptModeValue() {
    const value = String(font?.scriptMode ?? 'normal');
    return ['normal', 'superscript', 'subscript'].includes(value) ? value : 'normal';
  }

  function fontAxisValue(axis) {
    const tag = String(axis?.tag ?? '');
    const explicit = Number(font?.variationAxes?.[tag]);
    if (Number.isFinite(explicit)) return explicit;
    return Number(axis?.default ?? 0);
  }

  function setFontAxis(tag, value) {
    const normalizedTag = String(tag ?? '').slice(0, 4);
    if (!normalizedTag) return;
    set(`Text.Font.variationAxes.${normalizedTag}`, Number(value));
    if (normalizedTag === 'wght') {
      const normalizedWeight = normalizeWeightValue(Number(value));
      set('Text.Font.weightValue', normalizedWeight);
      set('Text.Font.weight', normalizedWeight >= 700 ? 'Bold' : 'Regular');
    }
  }

  function typographyFeatureActive(key) {
    if (key === 'ligatures') return font?.ligatures !== false;
    return font?.[key] === true;
  }

  function toggleTypographyFeature(key) {
    if (key === 'ligatures') {
      set('Text.Font.ligatures', !(font?.ligatures !== false));
      return;
    }
    set(`Text.Font.${key}`, !(font?.[key] === true));
  }

  function flowPointValue(collection, index, axis, fallback) {
    const point = position?.[collection]?.[index];
    return Number(point?.[axis] ?? fallback);
  }

  function setFlowPointValue(collection, index, axis, value) {
    set(`Text.Position.${collection}.${index}.${axis}`, Number(value));
  }

  function normalizeWeightValue(value) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return 400;

    const exact = WEIGHT_OPTIONS.find((option) => option.value === numeric);
    if (exact) return exact.value;

    return WEIGHT_OPTIONS.reduce((closest, option) =>
      Math.abs(option.value - numeric) < Math.abs(closest.value - numeric) ? option : closest
    ).value;
  }

  function angleForOrientation(value) {
    switch (String(value ?? 'horizontal')) {
      case 'rotate90':
        return 90;
      case 'rotate180':
        return 180;
      case 'rotate270':
        return 270;
      default:
        return 0;
    }
  }

  function normalizeAngle(value) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return 0;
    return ((numeric % 360) + 360) % 360;
  }

  function presetOrientationForAngle(value) {
    const normalized = normalizeAngle(value);
    if (Math.abs(normalized - 90) < 0.001) return 'rotate90';
    if (Math.abs(normalized - 180) < 0.001) return 'rotate180';
    if (Math.abs(normalized - 270) < 0.001) return 'rotate270';
    if (Math.abs(normalized) < 0.001) return 'horizontal';
    return '';
  }

  function resolveFlowAngle(positionSection) {
    const explicit = Number(positionSection?.flowAngle);
    if (Number.isFinite(explicit)) return explicit;
    return angleForOrientation(positionSection?.orientation);
  }

  function multilineProp(name, fallback) {
    return multiline?.[name] ?? fallback;
  }

  function multilineWrapModeValue() {
    const value = String(multilineProp('wrapMode', 'word'));
    return value === 'none' || value === 'character' ? value : 'word';
  }

  function multilineOverflowModeValue() {
    return String(multilineProp('overflowMode', 'clip')) === 'ellipsis' ? 'ellipsis' : 'clip';
  }

  function multilineParagraphModeValue() {
    const explicit = String(multilineProp('paragraphMode', ''));
    if (explicit === 'justify') return 'justify';
    if (explicit === 'normal') return 'normal';

    const legacy = String(multilineProp('fillWidthMode', 'none'));
    return legacy === 'justify' || legacy === 'fill' ? 'justify' : 'normal';
  }

  function multilineAlignValue() {
    const value = String(position?.justification ?? 'centred');
    if (value === 'left' || value === 'topLeft' || value === 'bottomLeft') return 'left';
    if (value === 'right' || value === 'topRight' || value === 'bottomRight') return 'right';
    return 'centred';
  }

  function setMultilineAlign(value) {
    const current = String(position?.justification ?? 'centred');
    const align = value === 'left' || value === 'right' ? value : 'centred';

    if (current === 'top' || current === 'topLeft' || current === 'topRight') {
      set('Text.Position.justification', align === 'left' ? 'topLeft' : (align === 'right' ? 'topRight' : 'top'));
      return;
    }

    if (current === 'bottom' || current === 'bottomLeft' || current === 'bottomRight') {
      set('Text.Position.justification', align === 'left' ? 'bottomLeft' : (align === 'right' ? 'bottomRight' : 'bottom'));
      return;
    }

    set('Text.Position.justification', align === 'left' ? 'left' : (align === 'right' ? 'right' : 'centred'));
  }

  function multilineFitModeValue() {
    return String(multilineProp('fitMode', 'none')) === 'shrink' ? 'shrink' : 'none';
  }

  function multilineLastLineAlignValue() {
    const value = String(multilineProp('lastLineAlign', 'inherit'));
    return ['inherit', 'left', 'centred', 'right'].includes(value) ? value : 'inherit';
  }

  function setMultilineNumber(name, value, step = 0.1, min = Number.NEGATIVE_INFINITY) {
    const numeric = Math.max(min, roundLineValue(value, step));
    set(`Text.Multiline.${name}`, numeric);
  }

  function commitTextDraft() {
    const nextValue = String(textDraft ?? '');
    textDraftSource = nextValue;
    set('Text.content', nextValue);
  }

  function handleTextDraftKeydown(event) {
    if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
      event.preventDefault();
      commitTextDraft();
    }
  }

  function setFontFamily(event) {
    const family = event.target.value;
    set('Text.Font.family', family);

    const nextFontOption = $availableFonts.find((option) => option.value === family)
      ?? $availableFonts.find((option) => option.family === family)
      ?? null;

    if (nextFontOption?.supportsWeight === true) {
      const normalizedWeight = normalizeWeightValue(effectiveWeightValue);
      set('Text.Font.weightValue', normalizedWeight);
      set('Text.Font.weight', normalizedWeight >= 700 ? 'Bold' : 'Regular');
    }
  }

  function toggleBold() {
    if (weightedFontSelected) {
      const nextWeight = effectiveWeightValue >= 700 ? 400 : 700;
      set('Text.Font.weightValue', nextWeight);
      set('Text.Font.weight', nextWeight >= 700 ? 'Bold' : 'Regular');
      return;
    }

    set('Text.Font.weight', font?.weight === 'Bold' ? 'Regular' : 'Bold');
    set('Text.Font.weightValue', font?.weight === 'Bold' ? 400 : 700);
  }

  function toggleItalic() {
    set('Text.Font.style', font?.style === 'Italic' ? 'Normal' : 'Italic');
  }

  function toggleUnderline() {
    set('Text.Font.underline', !(font?.underline === true));
  }

  function toggleStrikethrough() {
    set('Text.Font.strikethrough', !(font?.strikethrough === true));
  }

  function toggleOverline() {
    set('Text.Font.overline', !(font?.overline === true));
  }

  function lineProp(name, fallback) {
    return font?.[name] ?? fallback;
  }

  function roundLineValue(value, step = 0.5) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric) || step <= 0) return 0;
    return Math.round(numeric / step) * step;
  }

  function setLineNumber(name, value) {
    set(`Text.Font.${name}`, roundLineValue(value));
  }

  function lineLayerValue(kind) {
    return String(lineProp(`${kind}Layer`, 'back'));
  }

  function setLineLayer(kind, value) {
    set(`Text.Font.${kind}Layer`, value === 'front' ? 'front' : 'back');
  }

  function lineBaseYOffset(kind) {
    const halfFontSize = Number(font?.size ?? 12) / 2;
    if (kind === 'underline') return halfFontSize;
    if (kind === 'overline') return -halfFontSize;
    return 0;
  }

  function displayedLineY(kind) {
    return roundLineValue(-(lineBaseYOffset(kind) + Number(lineProp(`${kind}Offset`, 0))));
  }

  function setDisplayedLineY(kind, value) {
    setLineNumber(`${kind}Offset`, roundLineValue(-Number(value) - lineBaseYOffset(kind)));
  }

  function componentInlineHalfExtent() {
    const preset = presetOrientationForAngle(textFlowAngleValue);
    const vertical = textFlowModeValue === 'rotate' && (preset === 'rotate90' || preset === 'rotate270');
    return Number(vertical ? (transform?.height ?? 0) : (transform?.width ?? 0)) / 2;
  }

  function displayedLineLeft(name) {
    if (textFlowModeValue !== 'rotate') {
      return roundLineValue(Math.max(0, Number(lineProp(name, 0))));
    }
    return roundLineValue(Number(lineProp(name, 0)) - componentInlineHalfExtent());
  }

  function setDisplayedLineLeft(name, value) {
    if (textFlowModeValue !== 'rotate') {
      setLineNumber(name, Math.max(0, roundLineValue(Number(value))));
      return;
    }
    setLineNumber(name, roundLineValue(Number(value) + componentInlineHalfExtent()));
  }

  function displayedLineRight(name) {
    if (textFlowModeValue !== 'rotate') {
      return roundLineValue(Math.max(0, Number(lineProp(name, 0))));
    }
    return roundLineValue(componentInlineHalfExtent() - Number(lineProp(name, 0)));
  }

  function setDisplayedLineRight(name, value) {
    if (textFlowModeValue !== 'rotate') {
      setLineNumber(name, Math.max(0, roundLineValue(Number(value))));
      return;
    }
    setLineNumber(name, roundLineValue(componentInlineHalfExtent() - Number(value)));
  }

  function measureTextWidth() {
    if (typeof document === 'undefined') return Number(transform?.width ?? 0);

    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    if (!context) return Number(transform?.width ?? 0);

    const fontSize = Number(font?.size ?? 12);
    const fontStyle = font?.style === 'Italic' ? 'italic' : 'normal';
    const fontWeight = Number(font?.weightValue ?? (font?.weight === 'Bold' ? 700 : 400));
    const fontFamily = selectedFontPreviewFamily ?? font?.family ?? 'Arial';
    const letterSpacing = Number(font?.letterSpacing ?? 0);
    const content = String(text?.content ?? '');

    context.font = `${fontStyle} ${fontWeight} ${fontSize}px "${fontFamily}"`;
    const metrics = context.measureText(content);
    const spacingWidth = Math.max(0, content.length - 1) * letterSpacing;
    return metrics.width + spacingWidth;
  }

  function fitLineToLeftBorder(kind) {
    setLineNumber(`${kind}InsetLeft`, 0);
  }

  function fitLineToWordWidth(kind) {
    if (textFlowModeValue !== 'rotate') {
      setLineNumber(`${kind}InsetLeft`, 0);
      setLineNumber(`${kind}InsetRight`, 0);
      return;
    }
    const halfWidth = roundLineValue(measureTextWidth() / 2);
    setDisplayedLineLeft(`${kind}InsetLeft`, -halfWidth);
    setDisplayedLineRight(`${kind}InsetRight`, halfWidth);
  }

  function fitLineToRightBorder(kind) {
    setLineNumber(`${kind}InsetRight`, 0);
  }

  function setLineColor(name, value) {
    let normalized = String(value ?? '').replace(/^#/, '').toUpperCase();
    if (normalized.length === 6) normalized = `FF${normalized}`;
    if (normalized.length !== 8) return;
    set(`Text.Font.${name}`, normalized);
  }

  function handleLineColorSwatch(name) {
    if (!core?.id) return;
    activateColorTarget(
      { type: 'control', controlId: core.id, path: `Text.Font.${name}` },
      String(lineProp(name, lineColourFallback))
    );
  }

  function effectProp(name, fallback) {
    return textEffects?.[name] ?? fallback;
  }

  function toggleTextEffect(name) {
    set(`Text.Effects.${name}`, !(textEffects?.[name] === true));
  }

  function toggleReflectionEffect() {
    set('Text.Effects.reflectionEnabled', !reflectionEffectActive);
  }

  function setEffectNumber(name, value, step = 0.5) {
    set(`Text.Effects.${name}`, roundLineValue(value, step));
  }

  function setEffectColor(name, value) {
    let normalized = String(value ?? '').replace(/^#/, '').toUpperCase();
    if (normalized.length === 6) normalized = `FF${normalized}`;
    if (normalized.length !== 8) return;
    set(`Text.Effects.${name}`, normalized);
  }

  function handleEffectColorSwatch(name, fallback) {
    if (!core?.id) return;
    activateColorTarget(
      { type: 'control', controlId: core.id, path: `Text.Effects.${name}` },
      String(effectProp(name, fallback))
    );
  }

  function normalizeColorValue(value, fallback = 'FFFFFFFF') {
    let normalized = String(value ?? '').replace(/^#/, '').toUpperCase();
    if (normalized.length === 6) normalized = `FF${normalized}`;
    if (normalized.length === 8) return normalized;
    return fallback;
  }

  function reflectionDisplayAngleFromStored(value, fallback = 180) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return fallback;
    return normalizeAngle(numeric + 90);
  }

  function reflectionStoredAngleFromDisplay(value) {
    return normalizeAngle(Number(value) - 90);
  }

  function reflectionProp(name, fallback) {
    const explicit = textEffects?.[name];
    if (explicit != null) {
      if (name === 'reflectionAngle') return reflectionDisplayAngleFromStored(explicit, fallback);
      return explicit;
    }

    if (name === 'reflectionAngle') {
      const x = Number(textEffects?.copyOffsetX ?? 0);
      const y = Number(textEffects?.copyOffsetY ?? 0);
      if (Math.hypot(x, y) > 0.001) return normalizeAngle(((Math.atan2(y, x) * 180 / Math.PI) + 360) % 360 + 90);
    }

    if (name === 'reflectionDistance') {
      const x = Number(textEffects?.copyOffsetX ?? 0);
      const y = Number(textEffects?.copyOffsetY ?? 0);
      const distance = Math.hypot(x, y);
      if (distance > 0.001) return distance;
    }

    if (name === 'reflectionBlur' && textEffects?.copyBlur != null) {
      return textEffects.copyBlur;
    }

    if (name === 'reflectionColour' && textEffects?.copyColour != null) {
      return normalizeColorValue(textEffects.copyColour, fallback);
    }

    return fallback;
  }

  function reflectionColorValue() {
    return normalizeColorValue(reflectionProp('reflectionColour', lineColourFallback), lineColourFallback);
  }

  function reflectionFadeModeValue() {
    const value = String(reflectionProp('reflectionFadeMode', 'none'));
    return value === 'in' || value === 'out' ? value : 'none';
  }

  function reflectionFadeModeLabel() {
    const mode = reflectionFadeModeValue();
    if (mode === 'in') return 'Fade In';
    if (mode === 'out') return 'Fade Out';
    return 'None';
  }

  function cycleReflectionFadeMode() {
    const mode = reflectionFadeModeValue();
    const next = mode === 'none' ? 'in' : (mode === 'in' ? 'out' : 'none');
    set('Text.Effects.reflectionFadeMode', next);
  }

  function selectAll(event) {
    event.target.select();
  }

  function setFontWeight(event) {
    const weightValue = Number(event.target.value);
    if (!Number.isFinite(weightValue)) return;
    set('Text.Font.weightValue', weightValue);
    set('Text.Font.weight', weightValue >= 700 ? 'Bold' : 'Regular');
  }

  function setJustification(value) {
    set('Text.Position.justification', value);
  }

  function setReadingOrientation(value) {
    set('Text.Position.readingOrientation', value === 'rtl' || value === 'mirrored' ? value : 'ltr');
  }

  function setFlowMode(value) {
    set('Text.Position.flowMode', FLOW_MODE_OPTIONS.some((option) => option.value === value) ? value : 'rotate');
  }

  function setFlowAngle(value) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return;
    set('Text.Position.flowAngle', numeric);
    const preset = presetOrientationForAngle(numeric);
    if (preset) set('Text.Position.orientation', preset);
  }

  function resetPosition() {
    set('Text.Position.justification', 'centred');
    set('Text.Position.offsetX', 0);
    set('Text.Position.offsetY', 0);
  }
</script>

{#if text}
  <div class="text-editor-sections">
    <PropertySection
      title="Text"
      collapsed={textSectionCollapsed}
      ontoggle={(value) => setCollapsed(sectionKey('text'), value)}
    >
      <PropertyCell label="Text" span={4} hint="The text content displayed by this component">
        <div class="text-edit-row">
          <textarea
            class="text-input"
            bind:value={textDraft}
            rows="1"
            onfocus={selectAll}
            onblur={commitTextDraft}
            onkeydown={handleTextDraftKeydown}
          ></textarea>
          <button class="style-btn text-accept-btn" onclick={commitTextDraft}>OK</button>
        </div>
      </PropertyCell>
      {#if String(core?.controlType ?? '') === 'Label'}
        <PropertyCell label="Editable" span={2} hint="Whether this label's text can be edited by the user at runtime. Must be On before an LCD 'edit' zone can rewrite it from the screen.">
          <PropertyToggle value={text?.editable === true} onchange={(next) => set('Text.editable', next)} />
        </PropertyCell>
      {/if}
    </PropertySection>

    {#key fontEditorRenderKey}
      <PropertySection
        title="Font Settings"
        collapsed={fontSectionCollapsed}
        ontoggle={(value) => setCollapsed(sectionKey('font'), value)}
      >
        <PropertyCell label="Font" span={2} hint="Choose the font family for this text">
          <select
            class="text-select"
            style={`font-family:'${selectedFontPreviewFamily}'`}
            value={font?.family ?? 'Arial'}
            onchange={setFontFamily}
          >
            {#each $availableFonts as option}
              <option value={option.value} style={`font-family:'${option.cssFamily ?? option.value}'`}>{option.label}</option>
            {/each}
          </select>
        </PropertyCell>

        <PropertyCell label="Size" span={2} hint="Font size in pixels">
          <NumberInput
            value={font?.size ?? 12}
            min={1}
            step={1}
            onchange={(value) => set('Text.Font.size', value)}
          />
        </PropertyCell>

        <PropertyCell
          label="Weight"
          span={2}
          disabled={!weightedFontSelected}
          hint={weightedFontSelected
            ? 'Choose a font weight for weight-capable fonts'
            : 'This font does not expose variable weight options'}
        >
          <select
            class="text-select"
            value={displayedWeightValue}
            onchange={setFontWeight}
            disabled={!weightedFontSelected}
          >
            {#each WEIGHT_OPTIONS as option}
              <option value={String(option.value)}>{option.label}</option>
            {/each}
          </select>
        </PropertyCell>

        <PropertyCell label="Typeface" span={2} hint="Quick typeface styling toggles">
          <div class="style-row">
            <button class="style-btn" class:active={boldActive} title="Bold" onclick={toggleBold}>
              <Bold size={14} strokeWidth={1.8} />
            </button>
            <button class="style-btn" class:active={font?.style === 'Italic'} title="Italic" onclick={toggleItalic}>
              <Italic size={14} strokeWidth={1.8} />
            </button>
          </div>
        </PropertyCell>

        <PropertyCell label="Word Spacing" span={2} hint="Adjust spacing added to each whitespace character in pixels.">
          <NumberInput
            value={font?.wordSpacing ?? 0}
            step={0.5}
            onchange={(value) => set('Text.Font.wordSpacing', value)}
          />
        </PropertyCell>

        <PropertyCell label="Letter Spacing" span={2} hint="Adjust spacing between characters in pixels">
          <NumberInput
            value={font?.letterSpacing ?? 0}
            step={0.5}
            onchange={(value) => set('Text.Font.letterSpacing', value)}
          />
        </PropertyCell>
      </PropertySection>
    {/key}

    <PropertySection
      title="Typography"
      collapsed={typographySectionCollapsed}
      ontoggle={(value) => setCollapsed(sectionKey('typography'), value)}
    >
      <PropertyCell label="Case" span={2} hint="Apply text case transforms including title, sentence, and small caps modes.">
        <select class="text-select" value={caseModeValue()} onchange={(event) => set('Text.Font.caseMode', event.target.value)}>
          <option value="normal">Normal</option>
          <option value="uppercase">Uppercase</option>
          <option value="lowercase">Lowercase</option>
          <option value="title">Title Case</option>
          <option value="sentence">Sentence Case</option>
          <option value="smallcaps">Small Caps</option>
        </select>
      </PropertyCell>

      <PropertyCell label="Script" span={1} hint="Shift the text into superscript or subscript styling.">
        <select class="text-select" value={scriptModeValue()} onchange={(event) => set('Text.Font.scriptMode', event.target.value)}>
          <option value="normal">Normal</option>
          <option value="superscript">Super</option>
          <option value="subscript">Sub</option>
        </select>
      </PropertyCell>

      <PropertyCell label="Baseline" span={1} hint="Additional baseline shift in pixels. Positive raises the text.">
        <NumberInput
          value={Number(font?.baselineShift ?? 0)}
          step={0.5}
          onchange={(value) => set('Text.Font.baselineShift', value)}
        />
      </PropertyCell>

      <PropertyCell label="Features" span={4} hint="OpenType feature toggles for ligatures, alternates, figures, fractions, and slashed zero.">
        {#if visibleTypographyFeatureOptions.length > 0}
          <div class="effect-toggle-grid">
            {#each visibleTypographyFeatureOptions as option}
              <button class="style-btn" class:active={typographyFeatureActive(option.key)} onclick={() => toggleTypographyFeature(option.key)}>
                {option.label}
              </button>
            {/each}
          </div>
        {:else if selectedFontFeatureSupportKnown}
          <div class="feature-note">No supported OpenType feature toggles were detected for this font.</div>
        {:else}
          <div class="feature-note">OpenType feature support is unavailable for this font.</div>
        {/if}
      </PropertyCell>

      {#if selectedFontAxes.length > 0}
        {#each selectedFontAxes as axis}
          <PropertyCell
            label={axis.tag.toUpperCase()}
            span={1}
            hint={`${axis.tag.toUpperCase()} variable-font axis (${axis.min} to ${axis.max}).`}
          >
            <NumberInput
              value={fontAxisValue(axis)}
              min={Number(axis.min)}
              max={Number(axis.max)}
              step={axis.tag === 'slnt' ? 1 : 1}
              onchange={(value) => setFontAxis(axis.tag, value)}
            />
          </PropertyCell>
        {/each}
      {/if}
    </PropertySection>

    <PropertySection
      title="Multiline"
      collapsed={multilineSectionCollapsed}
      ontoggle={(value) => setCollapsed(sectionKey('multiline'), value)}
    >
      <PropertyCell
        label="Wrap"
        span={1}
        disabled={textFlowModeValue !== 'rotate'}
        hint={textFlowModeValue === 'rotate'
          ? 'Choose how text should break onto multiple lines inside the component width.'
          : 'Wrap modes currently apply to normal block text. Flow modes keep the explicit line breaks only.'}
      >
        <select
          class="text-select"
          value={multilineWrapModeValue()}
          onchange={(event) => set('Text.Multiline.wrapMode', event.target.value)}
          disabled={textFlowModeValue !== 'rotate'}
        >
          <option value="word">Word</option>
          <option value="character">Character</option>
          <option value="none">None</option>
        </select>
      </PropertyCell>

      <PropertyCell
        label="Align"
        span={1}
        disabled={textFlowModeValue !== 'rotate'}
        hint={textFlowModeValue === 'rotate'
          ? 'Align each text line to the left, centre, or right edge of the component, like a normal paragraph editor.'
          : 'Line alignment currently applies to normal block text.'}
      >
        <select
          class="text-select"
          value={multilineAlignValue()}
          onchange={(event) => setMultilineAlign(event.target.value)}
          disabled={textFlowModeValue !== 'rotate'}
        >
          <option value="left">Left</option>
          <option value="centred">Center</option>
          <option value="right">Right</option>
        </select>
      </PropertyCell>

      <PropertyCell
        label="Paragraph"
        span={1}
        disabled={textFlowModeValue !== 'rotate'}
        hint={textFlowModeValue === 'rotate'
          ? 'Justify wrapped paragraph lines to both left and right edges. The last line keeps the chosen alignment.'
          : 'Paragraph justification currently applies to normal block text.'}
      >
        <select
          class="text-select"
          value={multilineParagraphModeValue()}
          onchange={(event) => {
            const nextValue = event.target.value === 'justify' ? 'justify' : 'normal';
            set('Text.Multiline.paragraphMode', nextValue);
            set('Text.Multiline.fillWidthMode', nextValue === 'justify' ? 'justify' : 'none');
          }}
          disabled={textFlowModeValue !== 'rotate'}
        >
          <option value="normal">Normal</option>
          <option value="justify">Justify</option>
        </select>
      </PropertyCell>

      <PropertyCell
        label="Overflow"
        span={1}
        disabled={textFlowModeValue !== 'rotate'}
        hint={textFlowModeValue === 'rotate'
          ? 'Clip overflowing text or trim the last visible line with an ellipsis.'
          : 'Overflow handling currently applies to normal block text.'}
      >
        <select
          class="text-select"
          value={multilineOverflowModeValue()}
          onchange={(event) => set('Text.Multiline.overflowMode', event.target.value)}
          disabled={textFlowModeValue !== 'rotate'}
        >
          <option value="clip">Clip</option>
          <option value="ellipsis">Ellipsis</option>
        </select>
      </PropertyCell>

      <PropertyCell
        label="Justify Last"
        span={1}
        disabled={textFlowModeValue !== 'rotate' || multilineParagraphModeValue() !== 'justify'}
        hint="When enabled, the final visible line is justified too instead of keeping the selected alignment."
      >
        <select
          class="text-select"
          value={multilineProp('justifyLastLine', false) === true ? 'yes' : 'no'}
          onchange={(event) => set('Text.Multiline.justifyLastLine', event.target.value === 'yes')}
          disabled={textFlowModeValue !== 'rotate' || multilineParagraphModeValue() !== 'justify'}
        >
          <option value="no">No</option>
          <option value="yes">Yes</option>
        </select>
      </PropertyCell>

      <PropertyCell
        label="Last Line"
        span={1}
        disabled={textFlowModeValue !== 'rotate'}
        hint="Override the last visible line alignment when the paragraph is not justified, or when Justify Last is off."
      >
        <select
          class="text-select"
          value={multilineLastLineAlignValue()}
          onchange={(event) => set('Text.Multiline.lastLineAlign', event.target.value)}
          disabled={textFlowModeValue !== 'rotate'}
        >
          <option value="inherit">Inherit</option>
          <option value="left">Left</option>
          <option value="centred">Center</option>
          <option value="right">Right</option>
        </select>
      </PropertyCell>

      <PropertyCell
        label="Max Lines"
        span={1}
        disabled={textFlowModeValue !== 'rotate'}
        hint={textFlowModeValue === 'rotate'
          ? 'Limit the number of visible wrapped lines. Set to 0 for unlimited.'
          : 'Line limiting currently applies to normal block text.'}
      >
        <NumberInput
          value={Math.max(0, Number(multilineProp('maxLines', 0)))}
          min={0}
          step={1}
          onchange={(value) => set('Text.Multiline.maxLines', Math.max(0, Math.round(Number(value) || 0)))}
          disabled={textFlowModeValue !== 'rotate'}
        />
      </PropertyCell>

      <PropertyCell
        label="Fit"
        span={1}
        disabled={textFlowModeValue !== 'rotate'}
        hint={textFlowModeValue === 'rotate'
          ? 'Shrink the whole text block uniformly until it fits the component bounds.'
          : 'Fit currently applies to normal block text.'}
      >
        <select
          class="text-select"
          value={multilineFitModeValue()}
          onchange={(event) => set('Text.Multiline.fitMode', event.target.value)}
          disabled={textFlowModeValue !== 'rotate'}
        >
          <option value="none">None</option>
          <option value="shrink">Shrink</option>
        </select>
      </PropertyCell>

      <PropertyCell label="Line Height" span={4} hint="Multiplier applied to the font size when spacing lines vertically.">
        <NumberInput
          value={Math.max(0.5, Number(multilineProp('lineHeight', 1.2)))}
          min={0.5}
          step={0.1}
          onchange={(value) => setMultilineNumber('lineHeight', value, 0.1, 0.5)}
        />
      </PropertyCell>
    </PropertySection>

    <PropertySection
      title="Position"
      collapsed={positionSectionCollapsed}
      ontoggle={(value) => setCollapsed(sectionKey('position'), value)}
    >
      <PropertyCell label="Position" span={2} hint="Anchor the text inside the component bounds">
        <div class="position-picker-wrap">
          <AlignmentPicker
            value={position?.justification ?? 'centred'}
            options={TEXT_POSITION_OPTIONS}
            onchange={setJustification}
          />
        </div>
      </PropertyCell>

      <PropertyCell label="Offset" span={2} hint="Horizontal uses left minus / right plus. Vertical uses up plus / down minus.">
        <div class="offset-panel">
          <div class="offset-row">
            <span class="offset-label">H</span>
            <NumberInput
              value={position?.offsetX ?? 0}
              step={1}
              onchange={(value) => set('Text.Position.offsetX', value)}
            />
          </div>
          <div class="offset-row">
            <span class="offset-label">V</span>
            <NumberInput
              value={displayedVerticalOffset}
              step={1}
              onchange={(value) => set('Text.Position.offsetY', -value)}
            />
          </div>
          <button class="reset-btn" onclick={resetPosition}>Reset</button>
        </div>
      </PropertyCell>
    </PropertySection>

    <PropertySection
      title="Fill"
      collapsed={fillSectionCollapsed}
      ontoggle={(value) => setCollapsed(sectionKey('fill'), value)}
    >
      <PropertyCell label="Fill" span={4} hint="Choose the active text fill layer.">
        <div class="bg-layer-buttons">
          {#each TEXT_FILL_LAYER_ORDER as layerId (layerId)}
            {@const Icon = TEXT_FILL_LAYER_ICONS[layerId]}
            <button
              class="bg-layer-btn"
              class:active={textFillModeValue === layerId}
              title={`Activate ${TEXT_FILL_LAYER_LABELS[layerId]} text fill`}
              onclick={() => setTextFillMode(layerId)}
              oncontextmenu={(event) => {
                event.preventDefault();
                setTextFillMode(layerId);
              }}
            >
              <Icon size={14} strokeWidth={1.5} />
              <span class="bg-layer-label">{TEXT_FILL_LAYER_LABELS[layerId]}</span>
            </button>
          {/each}
        </div>
      </PropertyCell>
    </PropertySection>

    {#if textFillModeValue === 'solid'}
      <PropertySection
        title="Solid"
        collapsed={$sectionCollapse[fillLayerCollapseKey('solid')] ?? false}
        ontoggle={(value) => setCollapsed(fillLayerCollapseKey('solid'), value)}
      >
        <div class="prop-row full-span">
          <span class="lbl">Colour</span>
          <div class="color-input">
            <button class="mini-swatch" title="Pick colour" style={`background:#${displayTextFillColour}`} onclick={handleFillColorSwatch}></button>
            <input class="val" type="text" value={displayTextFillColour} onfocus={selectAll} onchange={setTextFillDisplayColour} />
          </div>
        </div>
        <div class="prop-row full-span">
          <span class="lbl">Fill Order</span>
          <NumberInput value={Number(fillProp('order', 50))} step={1} onchange={(value) => setFillNumber('order', value, 1)} />
        </div>
      </PropertySection>
    {/if}

    {#if textFillModeValue === 'gradient'}
      <PropertySection
        title="Gradient"
        collapsed={$sectionCollapse[fillLayerCollapseKey('gradient')] ?? false}
        ontoggle={(value) => setCollapsed(fillLayerCollapseKey('gradient'), value)}
      >
        <div class="prop-row full-span">
          <span class="lbl">Preview</span>
          <button class="bg-swatch" style={`background:${textFillGradientPreview}`} title="Edit gradient" onclick={openTextGradientEditor}></button>
        </div>
        <div class="prop-row full-span">
          <span class="lbl">Gradient</span>
          <div class="asset-row">
            <button class="action-btn" onclick={openTextGradientEditor}>Edit</button>
            <span class="hint-text">Display Panel → Gradient</span>
          </div>
        </div>
        <div class="prop-row full-span">
          <span class="lbl">Name</span>
          <input class="val" type="text" value={String(fillProp('gradientName', ''))} placeholder="Unnamed" onfocus={selectAll} onchange={(event) => set('Text.Fill.gradientName', event.target.value)} />
        </div>
        <div class="prop-row full-span">
          <span class="lbl">Fill Order</span>
          <NumberInput value={Number(fillProp('order', 50))} step={1} onchange={(value) => setFillNumber('order', value, 1)} />
        </div>
      </PropertySection>
    {/if}

    {#if textFillModeValue === 'image'}
      <PropertySection
        title="Image"
        collapsed={$sectionCollapse[fillLayerCollapseKey('image')] ?? false}
        ontoggle={(value) => setCollapsed(fillLayerCollapseKey('image'), value)}
      >
        <div class="bg-file-row">
          <button class="bg-browse-btn" title="Browse..." onclick={() => chooseTextFillAsset('image')}>...</button>
          <input class="val" type="text" value={String(fillProp('imageSrc', ''))} placeholder="No image selected" readonly />
        </div>
      </PropertySection>
      {#if !($sectionCollapse[fillLayerCollapseKey('image')] ?? false)}
        <PropertySection title="Geometry">
          <PropertyCell label="Fit" span={2} hint="How the image should fit inside the text fill area.">
            <select class="text-select" value={String(fillProp('imageFit', 'cover'))} onchange={(event) => set('Text.Fill.imageFit', event.target.value)}>
              <option value="cover">Cover</option>
              <option value="contain">Contain</option>
              <option value="fill">Fill</option>
            </select>
          </PropertyCell>
          <PropertyCell label="Offset X" span={1} hint="Horizontal offset of the image fill.">
            <NumberInput value={Number(fillProp('imageOffsetX', 0))} step={1} onchange={(value) => set('Text.Fill.imageOffsetX', value)} />
          </PropertyCell>
          <PropertyCell label="Offset Y" span={1} hint="Vertical offset of the image fill.">
            <NumberInput value={Number(fillProp('imageOffsetY', 0))} step={1} onchange={(value) => set('Text.Fill.imageOffsetY', value)} />
          </PropertyCell>
        </PropertySection>

        <PropertySection title="Color Effects">
          <PropertyCell label="Opacity" span={1} hint="Opacity of the image fill.">
            <NumberInput value={Number(fillProp('imageOpacity', 100))} min={0} max={100} step={1} onchange={(value) => set('Text.Fill.imageOpacity', value)} />
          </PropertyCell>
          <PropertyCell label="Tint" span={2} hint="Tint colour multiplied with the image fill.">
            <PropertyColor
              value={String(fillProp('imageTint', 'FFFFFFFF'))}
              onchange={(value) => setTextFillTint('Text.Fill.imageTint', value)}
              onswatchclick={() => activateColorTarget({ type: 'control', controlId: core.id, path: scopeTextPath('Text.Fill.imageTint') }, String(fillProp('imageTint', 'FFFFFFFF')))}
            />
          </PropertyCell>
          <PropertyCell label="Fill Order" span={1} hint="Draw order of the main text fill layer. Lower draws earlier, higher draws later.">
            <NumberInput value={Number(fillProp('order', 50))} step={1} onchange={(value) => setFillNumber('order', value, 1)} />
          </PropertyCell>
        </PropertySection>
      {/if}
    {/if}

    {#if textFillModeValue === 'texture'}
      <PropertySection
        title="Texture"
        collapsed={$sectionCollapse[fillLayerCollapseKey('texture')] ?? false}
        ontoggle={(value) => setCollapsed(fillLayerCollapseKey('texture'), value)}
      >
        <div class="bg-file-row">
          <button class="bg-browse-btn" title="Browse..." onclick={() => chooseTextFillAsset('texture')}>...</button>
          <input class="val" type="text" value={String(fillProp('textureSrc', ''))} placeholder="No texture selected" readonly />
        </div>
      </PropertySection>
      {#if !($sectionCollapse[fillLayerCollapseKey('texture')] ?? false)}
        <PropertySection title="Geometry">
          <PropertyCell label="Scale" span={2} hint="Tile scale for the texture pattern.">
            <NumberInput value={Number(fillProp('textureTileScale', 1))} min={0.1} step={0.1} onchange={(value) => set('Text.Fill.textureTileScale', value)} />
          </PropertyCell>
          <PropertyCell label="Offset X" span={1} hint="Horizontal offset of the tiled pattern.">
            <NumberInput value={Number(fillProp('textureOffsetX', 0))} step={1} onchange={(value) => set('Text.Fill.textureOffsetX', value)} />
          </PropertyCell>
          <PropertyCell label="Offset Y" span={1} hint="Vertical offset of the tiled pattern.">
            <NumberInput value={Number(fillProp('textureOffsetY', 0))} step={1} onchange={(value) => set('Text.Fill.textureOffsetY', value)} />
          </PropertyCell>
        </PropertySection>

        <PropertySection title="Color Effects">
          <PropertyCell label="Opacity" span={1} hint="Opacity of the texture fill.">
            <NumberInput value={Number(fillProp('textureOpacity', 100))} min={0} max={100} step={1} onchange={(value) => set('Text.Fill.textureOpacity', value)} />
          </PropertyCell>
          <PropertyCell label="Tint" span={2} hint="Tint colour multiplied with the texture fill.">
            <PropertyColor
              value={String(fillProp('textureTint', 'FFFFFFFF'))}
              onchange={(value) => setTextFillTint('Text.Fill.textureTint', value)}
              onswatchclick={() => activateColorTarget({ type: 'control', controlId: core.id, path: scopeTextPath('Text.Fill.textureTint') }, String(fillProp('textureTint', 'FFFFFFFF')))}
            />
          </PropertyCell>
          <PropertyCell label="Fill Order" span={1} hint="Draw order of the main text fill layer. Lower draws earlier, higher draws later.">
            <NumberInput value={Number(fillProp('order', 50))} step={1} onchange={(value) => setFillNumber('order', value, 1)} />
          </PropertyCell>
        </PropertySection>
      {/if}
    {/if}

    <PropertySection
      title="Flow"
      collapsed={orientationSectionCollapsed}
      ontoggle={(value) => setCollapsed(sectionKey('orientation'), value)}
    >
      <PropertyCell label="Reading" span={4} hint="Choose the reading direction or mirror the text glyphs.">
        <div class="reading-row">
          {#each TEXT_READING_OPTIONS as option}
            <button
              class="reading-btn"
              class:active={textReadingOrientationValue === option.value}
              title={option.label}
              style={`grid-column: span ${option.span ?? 1}`}
              onclick={() => setReadingOrientation(option.value)}
            >
              <option.icon size={11} strokeWidth={1.7} />
              <span>{option.label}</span>
            </button>
          {/each}
        </div>
      </PropertyCell>

      <PropertyCell label="Mode" span={4} hint="Choose how the text should flow: rotate as a block, run on a line, step like a staircase, or bend onto an arc or full circle.">
        <div class="flow-mode-grid">
          {#each FLOW_MODE_OPTIONS as option}
            <button
              class="flow-mode-btn"
              class:active={textFlowModeValue === option.value}
              onclick={() => setFlowMode(option.value)}
            >{option.label}</button>
          {/each}
        </div>
      </PropertyCell>

      <PropertyCell label="Distribution" span={1} hint="Natural uses measured advances, Fit stretches along the path, Justify expands spaces, Fixed uses a constant advance.">
        <select class="text-select" value={String(position?.flowDistribution ?? 'natural')} onchange={(event) => set('Text.Position.flowDistribution', event.target.value)}>
          <option value="natural">Natural</option>
          <option value="fit">Fit to Path</option>
          <option value="justify">Justify to Path</option>
          <option value="fixed">Fixed</option>
        </select>
      </PropertyCell>
      <PropertyCell label="Facing" span={1} hint="Rotate glyphs to the path, keep them upright, or turn them inward/outward.">
        <select class="text-select" value={String(position?.flowFacing ?? 'path')} onchange={(event) => set('Text.Position.flowFacing', event.target.value)}>
          <option value="path">Follow</option>
          <option value="upright">Upright</option>
          <option value="inward">Inward</option>
          <option value="outward">Outward</option>
        </select>
      </PropertyCell>
      <PropertyCell label="Side" span={1} hint="Offset the path to the inside or outside of its baseline.">
        <select class="text-select" value={String(position?.flowSide ?? 'center')} onchange={(event) => set('Text.Position.flowSide', event.target.value)}>
          <option value="center">Center</option>
          <option value="inside">Inside</option>
          <option value="outside">Outside</option>
        </select>
      </PropertyCell>
      <PropertyCell label="Reverse" span={1} hint="Reverse the path direction before distributing the text.">
        <select class="text-select" value={position?.flowReverse === true ? 'yes' : 'no'} onchange={(event) => set('Text.Position.flowReverse', event.target.value === 'yes')}>
          <option value="no">No</option>
          <option value="yes">Yes</option>
        </select>
      </PropertyCell>

      <PropertyCell label="Start Offset" span={2} hint="Offset the text run along the path before the first glyph is placed.">
        <NumberInput value={Number(position?.flowStartOffset ?? 0)} step={1} onchange={(value) => set('Text.Position.flowStartOffset', value)} />
      </PropertyCell>
      <PropertyCell label="Fixed Advance" span={2} disabled={String(position?.flowDistribution ?? 'natural') !== 'fixed'} hint="Advance used by Fixed distribution mode.">
        <NumberInput value={Number(position?.flowFixedAdvance ?? 0)} min={0} step={1} onchange={(value) => set('Text.Position.flowFixedAdvance', value)} disabled={String(position?.flowDistribution ?? 'natural') !== 'fixed'} />
      </PropertyCell>

      {#if textFlowModeValue === 'rotate' || textFlowModeValue === 'line' || textFlowModeValue === 'wave' || textFlowModeValue === 'zigzag' || textFlowModeValue === 'perimeter'}
        <PropertyCell label="Angle" span={4} hint="Set the exact angle in degrees. Rotate turns the text block; Line distributes letters across an angled baseline.">
          <NumberInput
            value={textFlowAngleValue}
            step={1}
            onchange={setFlowAngle}
          />
        </PropertyCell>
      {:else if textFlowModeValue === 'stair'}
        <PropertyCell label="Step X" span={2} hint="Horizontal shift applied to each successive character in stair mode.">
          <NumberInput
            value={position?.flowStepX ?? 8}
            step={1}
            onchange={(value) => set('Text.Position.flowStepX', value)}
          />
        </PropertyCell>
        <PropertyCell label="Step Y" span={2} hint="Vertical shift applied to each successive character in stair mode.">
          <NumberInput
            value={position?.flowStepY ?? 8}
            step={1}
            onchange={(value) => set('Text.Position.flowStepY', value)}
          />
        </PropertyCell>
        <PropertyCell label="Unit" span={4} hint="Apply stair stepping per character, per word, or per explicit line.">
          <select class="text-select" value={String(position?.flowStairUnit ?? 'character')} onchange={(event) => set('Text.Position.flowStairUnit', event.target.value)}>
            <option value="character">Character</option>
            <option value="word">Word</option>
            <option value="line">Line</option>
          </select>
        </PropertyCell>
      {:else if textFlowModeValue === 'vertical'}
        <PropertyCell label="Step Y" span={2} hint="Vertical advance between glyphs in true vertical typesetting.">
          <NumberInput value={Number(position?.flowStepY ?? 8)} step={1} onchange={(value) => set('Text.Position.flowStepY', value)} />
        </PropertyCell>
        <PropertyCell label="Step X" span={2} hint="Horizontal column offset between explicit lines in true vertical typesetting.">
          <NumberInput value={Number(position?.flowStepX ?? 8)} step={1} onchange={(value) => set('Text.Position.flowStepX', value)} />
        </PropertyCell>
      {:else if textFlowModeValue === 'arc'}
        <PropertyCell label="Angle" span={2} hint="Center angle for the arc in degrees.">
          <NumberInput
            value={textFlowAngleValue}
            step={1}
            onchange={setFlowAngle}
          />
        </PropertyCell>
        <PropertyCell label="Radius" span={1} hint="Distance from the arc centre to the glyph baseline.">
          <NumberInput
            value={position?.flowRadius ?? 48}
            min={1}
            step={1}
            onchange={(value) => set('Text.Position.flowRadius', value)}
          />
        </PropertyCell>
        <PropertyCell label="Sweep" span={1} hint="How much of the circle the arc should cover, in degrees. Negative values reverse the direction.">
          <NumberInput
            value={position?.flowSweep ?? 180}
            step={1}
            onchange={(value) => set('Text.Position.flowSweep', value)}
          />
        </PropertyCell>
      {:else if textFlowModeValue === 'circle'}
        <PropertyCell label="Angle" span={2} hint="Starting angle for the full-circle text run in degrees.">
          <NumberInput
            value={textFlowAngleValue}
            step={1}
            onchange={setFlowAngle}
          />
        </PropertyCell>
        <PropertyCell label="Radius" span={2} hint="Distance from the circle centre to the glyph baseline.">
          <NumberInput
            value={position?.flowRadius ?? 48}
            min={1}
            step={1}
            onchange={(value) => set('Text.Position.flowRadius', value)}
          />
        </PropertyCell>
      {:else if textFlowModeValue === 'wave' || textFlowModeValue === 'zigzag'}
        <PropertyCell label="Amplitude" span={2} hint="Wave or zigzag height from the baseline.">
          <NumberInput value={Number(position?.flowAmplitude ?? 18)} min={0} step={1} onchange={(value) => set('Text.Position.flowAmplitude', value)} />
        </PropertyCell>
        <PropertyCell label="Frequency" span={2} hint="How many wave or zigzag cycles the run should cover.">
          <NumberInput value={Number(position?.flowFrequency ?? 1)} min={0.1} step={0.1} onchange={(value) => set('Text.Position.flowFrequency', value)} />
        </PropertyCell>
      {:else if textFlowModeValue === 'spiral'}
        <PropertyCell label="Turns" span={2} hint="How many turns the spiral should complete.">
          <NumberInput value={Number(position?.flowTurns ?? 2)} min={0.1} step={0.1} onchange={(value) => set('Text.Position.flowTurns', value)} />
        </PropertyCell>
        <PropertyCell label="Radius" span={2} hint="Base radius of the spiral.">
          <NumberInput value={Number(position?.flowRadius ?? 48)} min={1} step={1} onchange={(value) => set('Text.Position.flowRadius', value)} />
        </PropertyCell>
      {:else if textFlowModeValue === 'perimeter'}
        <PropertyCell label="Inset" span={4} hint="Inset the text path from the component edge.">
          <NumberInput value={Number(position?.flowPerimeterInset ?? 0)} step={1} onchange={(value) => set('Text.Position.flowPerimeterInset', value)} />
        </PropertyCell>
      {:else if textFlowModeValue === 'bezier'}
        <PropertyCell label="Start X" span={1} hint="Bezier start X as a percentage of the text box.">
          <NumberInput value={Number(position?.flowPathStartX ?? 0)} step={1} onchange={(value) => set('Text.Position.flowPathStartX', value)} />
        </PropertyCell>
        <PropertyCell label="Start Y" span={1} hint="Bezier start Y as a percentage of the text box.">
          <NumberInput value={Number(position?.flowPathStartY ?? 50)} step={1} onchange={(value) => set('Text.Position.flowPathStartY', value)} />
        </PropertyCell>
        <PropertyCell label="End X" span={1} hint="Bezier end X as a percentage of the text box.">
          <NumberInput value={Number(position?.flowPathEndX ?? 100)} step={1} onchange={(value) => set('Text.Position.flowPathEndX', value)} />
        </PropertyCell>
        <PropertyCell label="End Y" span={1} hint="Bezier end Y as a percentage of the text box.">
          <NumberInput value={Number(position?.flowPathEndY ?? 50)} step={1} onchange={(value) => set('Text.Position.flowPathEndY', value)} />
        </PropertyCell>
        <PropertyCell label="Ctrl 1 X" span={1} hint="Bezier first control handle X.">
          <NumberInput value={Number(position?.flowPathC1X ?? 33)} step={1} onchange={(value) => set('Text.Position.flowPathC1X', value)} />
        </PropertyCell>
        <PropertyCell label="Ctrl 1 Y" span={1} hint="Bezier first control handle Y.">
          <NumberInput value={Number(position?.flowPathC1Y ?? 0)} step={1} onchange={(value) => set('Text.Position.flowPathC1Y', value)} />
        </PropertyCell>
        <PropertyCell label="Ctrl 2 X" span={1} hint="Bezier second control handle X.">
          <NumberInput value={Number(position?.flowPathC2X ?? 66)} step={1} onchange={(value) => set('Text.Position.flowPathC2X', value)} />
        </PropertyCell>
        <PropertyCell label="Ctrl 2 Y" span={1} hint="Bezier second control handle Y.">
          <NumberInput value={Number(position?.flowPathC2Y ?? 100)} step={1} onchange={(value) => set('Text.Position.flowPathC2Y', value)} />
        </PropertyCell>
      {:else if textFlowModeValue === 'polyline' || textFlowModeValue === 'freehand'}
        {#each [0, 1, 2, 3] as index}
          <PropertyCell label={`P${index + 1} X`} span={1} hint="Path point X as a percentage of the text box.">
            <NumberInput value={flowPointValue(textFlowModeValue === 'freehand' ? 'flowFreehandPoints' : 'flowPolylinePoints', index, 'x', index * 33)} step={1} onchange={(value) => setFlowPointValue(textFlowModeValue === 'freehand' ? 'flowFreehandPoints' : 'flowPolylinePoints', index, 'x', value)} />
          </PropertyCell>
          <PropertyCell label={`P${index + 1} Y`} span={1} hint="Path point Y as a percentage of the text box.">
            <NumberInput value={flowPointValue(textFlowModeValue === 'freehand' ? 'flowFreehandPoints' : 'flowPolylinePoints', index, 'y', 50)} step={1} onchange={(value) => setFlowPointValue(textFlowModeValue === 'freehand' ? 'flowFreehandPoints' : 'flowPolylinePoints', index, 'y', value)} />
          </PropertyCell>
        {/each}
      {/if}

    </PropertySection>

    <PropertySection
      title="Effects"
      collapsed={effectsSectionCollapsed}
      ontoggle={(value) => setCollapsed(sectionKey('effects'), value)}
    >
      <PropertyCell label="Effects" span={4} hint="Apply text-specific effects to glyphs instead of the whole control box.">
        <div class="effect-toggle-grid">
          <button class="style-btn" class:active={textEffects?.outlineEnabled === true} onclick={() => toggleTextEffect('outlineEnabled')}>Outline</button>
          <button class="style-btn" class:active={textEffects?.stroke2Enabled === true} onclick={() => toggleTextEffect('stroke2Enabled')}>2nd Stroke</button>
          <button class="style-btn" class:active={textEffects?.shadowEnabled === true} onclick={() => toggleTextEffect('shadowEnabled')}>Shadow</button>
          <button class="style-btn" class:active={textEffects?.glowEnabled === true} onclick={() => toggleTextEffect('glowEnabled')}>Glow</button>
          <button class="style-btn" class:active={textEffects?.innerGlowEnabled === true} onclick={() => toggleTextEffect('innerGlowEnabled')}>Inner Glow</button>
          <button class="style-btn" class:active={textEffects?.innerShadowEnabled === true} onclick={() => toggleTextEffect('innerShadowEnabled')}>Inner Shadow</button>
          <button class="style-btn" class:active={textEffects?.bevelEnabled === true} onclick={() => toggleTextEffect('bevelEnabled')}>Bevel</button>
          <button class="style-btn" class:active={textEffects?.blurEnabled === true} onclick={() => toggleTextEffect('blurEnabled')}>Blur</button>
          <button class="style-btn" class:active={textEffects?.motionEnabled === true} onclick={() => toggleTextEffect('motionEnabled')}>Motion</button>
          <button class="style-btn" class:active={reflectionEffectActive} onclick={toggleReflectionEffect}>Reflection</button>
          <button class="style-btn" class:active={textEffects?.knockout === true} onclick={() => toggleTextEffect('knockout')}>Hollow</button>
        </div>
      </PropertyCell>

      {#if textEffectControlsVisible}
        <PropertyCell label="Text Effects" span={4} hint="Detailed controls for the currently active text effects.">
          <div class="effect-divider"></div>
        </PropertyCell>
      {/if}

      {#if textEffects?.outlineEnabled === true}
        <PropertyCell label="Outline Thickness" span={1} hint="Extra outline thickness outside the glyph fill, in pixels.">
          <NumberInput
            value={Math.max(1, effectProp('outlineThickness', effectProp('outlineWidth', 1)))}
            min={1}
            step={1}
            onchange={(value) => {
              setEffectNumber('outlineThickness', value);
              setEffectNumber('outlineWidth', value);
            }}
          />
        </PropertyCell>
        <PropertyCell label="Outline Distance" span={1} hint="Gap between the glyph and the outline band, in pixels.">
          <NumberInput
            value={Math.max(0, effectProp('outlineDistance', 0))}
            min={0}
            step={1}
            onchange={(value) => setEffectNumber('outlineDistance', value)}
          />
        </PropertyCell>
        <PropertyCell label="Outline Fill" span={1} hint="Fill from the glyph edge outward, or show only the outer outline band.">
          <select
            class="text-select"
            value={effectProp('outlineFill', true) === false ? 'no' : 'yes'}
            onchange={(event) => set('Text.Effects.outlineFill', event.target.value !== 'no')}
          >
            <option value="yes">Yes</option>
            <option value="no">No</option>
          </select>
        </PropertyCell>
        <PropertyCell label="Outline Join" span={1} hint="Corner style of the expanded outline on angular glyphs.">
          <select
            class="text-select"
            value={String(effectProp('outlineJoin', 'round'))}
            onchange={(event) => set('Text.Effects.outlineJoin', event.target.value)}
          >
            <option value="round">Round</option>
            <option value="miter">Miter</option>
            <option value="bevel">Bevel</option>
          </select>
        </PropertyCell>
        <PropertyCell label="Outline Color" span={4} hint="AARRGGBB outline colour.">
          <PropertyColor
            value={String(effectProp('outlineColour', 'FF000000'))}
            onchange={(value) => setEffectColor('outlineColour', value)}
            onswatchclick={() => handleEffectColorSwatch('outlineColour', 'FF000000')}
          />
        </PropertyCell>
        <PropertyCell label="Placement" span={1} hint="Where the outline band should sit relative to the glyph edge.">
          <select class="text-select" value={String(effectProp('outlinePlacement', 'outer'))} onchange={(event) => set('Text.Effects.outlinePlacement', event.target.value)}>
            <option value="outer">Outer</option>
            <option value="center">Center</option>
            <option value="inner">Inner</option>
          </select>
        </PropertyCell>
        <PropertyCell label="Dash" span={1} hint="Render the outline as a dashed stroke.">
          <select class="text-select" value={effectProp('outlineDashEnabled', false) === true ? 'yes' : 'no'} onchange={(event) => set('Text.Effects.outlineDashEnabled', event.target.value === 'yes')}>
            <option value="no">No</option>
            <option value="yes">Yes</option>
          </select>
        </PropertyCell>
        <PropertyCell label="Dash Len" span={1} disabled={effectProp('outlineDashEnabled', false) !== true} hint="Length of each outline dash.">
          <NumberInput value={Number(effectProp('outlineDashLength', 8))} min={1} step={1} onchange={(value) => setEffectNumber('outlineDashLength', value, 1)} disabled={effectProp('outlineDashEnabled', false) !== true} />
        </PropertyCell>
        <PropertyCell label="Gap" span={1} disabled={effectProp('outlineDashEnabled', false) !== true} hint="Gap between dashed outline segments.">
          <NumberInput value={Number(effectProp('outlineDashGap', 4))} min={1} step={1} onchange={(value) => setEffectNumber('outlineDashGap', value, 1)} disabled={effectProp('outlineDashEnabled', false) !== true} />
        </PropertyCell>
        <PropertyCell label="Order" span={1} hint="Draw order for the outline layer. Lower draws earlier, higher draws later.">
          <NumberInput value={Number(effectProp('outlineOrder', 40))} step={1} onchange={(value) => setEffectNumber('outlineOrder', value, 1)} />
        </PropertyCell>
      {/if}

      {#if textEffects?.stroke2Enabled === true}
        <PropertyCell label="2nd Thickness" span={1} hint="Thickness of the secondary stroke.">
          <NumberInput value={Number(effectProp('stroke2Thickness', 1))} min={1} step={1} onchange={(value) => setEffectNumber('stroke2Thickness', value, 1)} />
        </PropertyCell>
        <PropertyCell label="Placement" span={1} hint="Place the secondary stroke inside, centered on, or outside the glyph edge.">
          <select class="text-select" value={String(effectProp('stroke2Placement', 'inner'))} onchange={(event) => set('Text.Effects.stroke2Placement', event.target.value)}>
            <option value="inner">Inner</option>
            <option value="center">Center</option>
            <option value="outer">Outer</option>
          </select>
        </PropertyCell>
        <PropertyCell label="Dash" span={1} hint="Render the secondary stroke as a dashed line.">
          <select class="text-select" value={effectProp('stroke2DashEnabled', false) === true ? 'yes' : 'no'} onchange={(event) => set('Text.Effects.stroke2DashEnabled', event.target.value === 'yes')}>
            <option value="no">No</option>
            <option value="yes">Yes</option>
          </select>
        </PropertyCell>
        <PropertyCell label="Dash Len" span={1} disabled={effectProp('stroke2DashEnabled', false) !== true} hint="Length of each secondary stroke dash.">
          <NumberInput value={Number(effectProp('stroke2DashLength', 6))} min={1} step={1} onchange={(value) => setEffectNumber('stroke2DashLength', value, 1)} disabled={effectProp('stroke2DashEnabled', false) !== true} />
        </PropertyCell>
        <PropertyCell label="Gap" span={1} disabled={effectProp('stroke2DashEnabled', false) !== true} hint="Gap between secondary stroke dashes.">
          <NumberInput value={Number(effectProp('stroke2DashGap', 3))} min={1} step={1} onchange={(value) => setEffectNumber('stroke2DashGap', value, 1)} disabled={effectProp('stroke2DashEnabled', false) !== true} />
        </PropertyCell>
        <PropertyCell label="Stroke Color" span={2} hint="AARRGGBB colour for the secondary stroke.">
          <PropertyColor
            value={String(effectProp('stroke2Colour', 'FFFFFFFF'))}
            onchange={(value) => setEffectColor('stroke2Colour', value)}
            onswatchclick={() => handleEffectColorSwatch('stroke2Colour', 'FFFFFFFF')}
          />
        </PropertyCell>
        <PropertyCell label="Order" span={2} hint="Draw order for the secondary stroke layer. Lower draws earlier, higher draws later.">
          <NumberInput value={Number(effectProp('stroke2Order', 45))} step={1} onchange={(value) => setEffectNumber('stroke2Order', value, 1)} />
        </PropertyCell>
      {/if}

      {#if textEffects?.shadowEnabled === true}
        <PropertyCell label="Style" span={1} hint="Soft uses blur, Long casts repeated flat copies, Extrude builds a hard stacked edge.">
          <select class="text-select" value={String(effectProp('shadowStyle', 'soft'))} onchange={(event) => set('Text.Effects.shadowStyle', event.target.value)}>
            <option value="soft">Soft</option>
            <option value="long">Long</option>
            <option value="extrude">Extrude</option>
          </select>
        </PropertyCell>
        <PropertyCell label="Shadow X" span={1} hint="Horizontal shadow offset in pixels.">
          <NumberInput
            value={effectProp('shadowOffsetX', 1)}
            step={0.5}
            onchange={(value) => setEffectNumber('shadowOffsetX', value)}
          />
        </PropertyCell>
        <PropertyCell label="Shadow Y" span={1} hint="Vertical shadow offset in pixels.">
          <NumberInput
            value={effectProp('shadowOffsetY', 1)}
            step={0.5}
            onchange={(value) => setEffectNumber('shadowOffsetY', value)}
          />
        </PropertyCell>
        <PropertyCell label="Shadow Blur" span={1} hint="Blur radius for the text shadow.">
          <NumberInput
            value={effectProp('shadowBlur', 2)}
            min={0}
            step={0.5}
            onchange={(value) => setEffectNumber('shadowBlur', value)}
          />
        </PropertyCell>
        <PropertyCell label="Shadow Color" span={1} hint="AARRGGBB shadow colour.">
          <PropertyColor
            value={String(effectProp('shadowColour', '80000000'))}
            onchange={(value) => setEffectColor('shadowColour', value)}
            onswatchclick={() => handleEffectColorSwatch('shadowColour', '80000000')}
          />
        </PropertyCell>
        <PropertyCell label="Distance" span={1} disabled={String(effectProp('shadowStyle', 'soft')) === 'soft'} hint="Length used by long-shadow and extrude shadow styles.">
          <NumberInput value={Number(effectProp('shadowDistance', 12))} min={0} step={1} onchange={(value) => setEffectNumber('shadowDistance', value, 1)} disabled={String(effectProp('shadowStyle', 'soft')) === 'soft'} />
        </PropertyCell>
        <PropertyCell label="Steps" span={1} disabled={String(effectProp('shadowStyle', 'soft')) === 'soft'} hint="Number of repeated copies used for long-shadow and extrude styles.">
          <NumberInput value={Number(effectProp('shadowSteps', 8))} min={1} step={1} onchange={(value) => set('Text.Effects.shadowSteps', Math.max(1, Math.round(Number(value) || 1)))} disabled={String(effectProp('shadowStyle', 'soft')) === 'soft'} />
        </PropertyCell>
        <PropertyCell label="Order" span={1} hint="Draw order for the shadow layer. Lower draws earlier, higher draws later.">
          <NumberInput value={Number(effectProp('shadowOrder', 10))} step={1} onchange={(value) => setEffectNumber('shadowOrder', value, 1)} />
        </PropertyCell>
      {/if}

      {#if textEffects?.glowEnabled === true}
        <PropertyCell label="Glow Size" span={1} hint="Blur radius for the outer text glow.">
          <NumberInput
            value={effectProp('glowSize', 4)}
            min={0}
            step={0.5}
            onchange={(value) => setEffectNumber('glowSize', value)}
          />
        </PropertyCell>
        <PropertyCell label="Glow Intensity" span={1} hint="Strength of the glow at the chosen size. Higher values stack a brighter halo.">
          <NumberInput
            value={effectProp('glowIntensity', 1)}
            min={0}
            step={0.25}
            onchange={(value) => setEffectNumber('glowIntensity', value, 0.25)}
          />
        </PropertyCell>
        <PropertyCell label="Glow Color" span={2} hint="AARRGGBB glow colour.">
          <PropertyColor
            value={String(effectProp('glowColour', '80FFFFFF'))}
            onchange={(value) => setEffectColor('glowColour', value)}
            onswatchclick={() => handleEffectColorSwatch('glowColour', '80FFFFFF')}
          />
        </PropertyCell>
        <PropertyCell label="Order" span={2} hint="Draw order for the glow layer. Lower draws earlier, higher draws later.">
          <NumberInput value={Number(effectProp('glowOrder', 20))} step={1} onchange={(value) => setEffectNumber('glowOrder', value, 1)} />
        </PropertyCell>
      {/if}

      {#if textEffects?.innerGlowEnabled === true}
        <PropertyCell label="Inner Glow" span={1} hint="Blur radius for the inner glow clipped inside glyphs.">
          <NumberInput
            value={effectProp('innerGlowSize', 3)}
            min={0}
            step={0.5}
            onchange={(value) => setEffectNumber('innerGlowSize', value)}
          />
        </PropertyCell>
        <PropertyCell label="Inner Glow Color" span={3} hint="AARRGGBB inner glow colour.">
          <PropertyColor
            value={String(effectProp('innerGlowColour', '80FFFFFF'))}
            onchange={(value) => setEffectColor('innerGlowColour', value)}
            onswatchclick={() => handleEffectColorSwatch('innerGlowColour', '80FFFFFF')}
          />
        </PropertyCell>
        <PropertyCell label="Order" span={1} hint="Draw order for the inner glow layer. Lower draws earlier, higher draws later.">
          <NumberInput value={Number(effectProp('innerGlowOrder', 80))} step={1} onchange={(value) => setEffectNumber('innerGlowOrder', value, 1)} />
        </PropertyCell>
      {/if}

      {#if textEffects?.innerShadowEnabled === true}
        <PropertyCell label="Inner X" span={1} hint="Horizontal offset of the inner shadow.">
          <NumberInput value={Number(effectProp('innerShadowOffsetX', 1))} step={0.5} onchange={(value) => setEffectNumber('innerShadowOffsetX', value)} />
        </PropertyCell>
        <PropertyCell label="Inner Y" span={1} hint="Vertical offset of the inner shadow.">
          <NumberInput value={Number(effectProp('innerShadowOffsetY', 1))} step={0.5} onchange={(value) => setEffectNumber('innerShadowOffsetY', value)} />
        </PropertyCell>
        <PropertyCell label="Inner Blur" span={1} hint="Blur radius for the inner shadow.">
          <NumberInput value={Number(effectProp('innerShadowBlur', 2))} min={0} step={0.5} onchange={(value) => setEffectNumber('innerShadowBlur', value)} />
        </PropertyCell>
        <PropertyCell label="Inner Color" span={1} hint="AARRGGBB inner shadow colour.">
          <PropertyColor
            value={String(effectProp('innerShadowColour', '80000000'))}
            onchange={(value) => setEffectColor('innerShadowColour', value)}
            onswatchclick={() => handleEffectColorSwatch('innerShadowColour', '80000000')}
          />
        </PropertyCell>
        <PropertyCell label="Order" span={4} hint="Draw order for the inner shadow layer. Lower draws earlier, higher draws later.">
          <NumberInput value={Number(effectProp('innerShadowOrder', 60))} step={1} onchange={(value) => setEffectNumber('innerShadowOrder', value, 1)} />
        </PropertyCell>
      {/if}

      {#if textEffects?.blurEnabled === true}
        <PropertyCell label="Blur" span={4} hint="Blur applied to the main text fill and outline.">
          <NumberInput
            value={effectProp('blurAmount', 1)}
            min={0}
            step={0.5}
            onchange={(value) => setEffectNumber('blurAmount', value)}
          />
        </PropertyCell>
      {/if}

      {#if textEffects?.motionEnabled === true}
        <PropertyCell label="Motion Angle" span={1} hint="Direction of the smear in degrees.">
          <NumberInput
            value={effectProp('motionAngle', 0)}
            step={1}
            onchange={(value) => setEffectNumber('motionAngle', value)}
          />
        </PropertyCell>
        <PropertyCell label="Distance" span={1} hint="Total smear distance in pixels.">
          <NumberInput
            value={effectProp('motionDistance', 8)}
            min={0}
            step={0.5}
            onchange={(value) => setEffectNumber('motionDistance', value)}
          />
        </PropertyCell>
        <PropertyCell label="Steps" span={1} hint="Number of layered copies used for the smear.">
          <NumberInput
            value={effectProp('motionSteps', 4)}
            min={1}
            step={1}
            onchange={(value) => set('Text.Effects.motionSteps', Math.max(1, Math.round(Number(value) || 1)))}
          />
        </PropertyCell>
        <PropertyCell label="Motion Color" span={1} hint="AARRGGBB motion smear colour.">
          <PropertyColor
            value={String(effectProp('motionColour', '80FFFFFF'))}
            onchange={(value) => setEffectColor('motionColour', value)}
            onswatchclick={() => handleEffectColorSwatch('motionColour', '80FFFFFF')}
          />
        </PropertyCell>
        <PropertyCell label="Order" span={1} hint="Draw order for the motion layer. Lower draws earlier, higher draws later.">
          <NumberInput value={Number(effectProp('motionOrder', 30))} step={1} onchange={(value) => setEffectNumber('motionOrder', value, 1)} />
        </PropertyCell>
      {/if}

      {#if textEffects?.bevelEnabled === true}
        <PropertyCell label="Bevel Style" span={1} hint="Embossed highlight/shadow treatment.">
          <select
            class="text-select"
            value={String(effectProp('bevelStyle', 'emboss'))}
            onchange={(event) => set('Text.Effects.bevelStyle', event.target.value)}
          >
            <option value="emboss">Emboss</option>
            <option value="inner">Inner</option>
            <option value="outer">Outer</option>
          </select>
        </PropertyCell>
        <PropertyCell label="Depth" span={1} hint="Offset depth of the highlight/shadow copies.">
          <NumberInput
            value={effectProp('bevelDepth', 1.5)}
            min={0}
            step={0.5}
            onchange={(value) => setEffectNumber('bevelDepth', value)}
          />
        </PropertyCell>
        <PropertyCell label="Highlight" span={1} hint="AARRGGBB highlight colour.">
          <PropertyColor
            value={String(effectProp('bevelHighlightColour', '99FFFFFF'))}
            onchange={(value) => setEffectColor('bevelHighlightColour', value)}
            onswatchclick={() => handleEffectColorSwatch('bevelHighlightColour', '99FFFFFF')}
          />
        </PropertyCell>
        <PropertyCell label="Shadow" span={1} hint="AARRGGBB bevel shadow colour.">
          <PropertyColor
            value={String(effectProp('bevelShadowColour', '99000000'))}
            onchange={(value) => setEffectColor('bevelShadowColour', value)}
            onswatchclick={() => handleEffectColorSwatch('bevelShadowColour', '99000000')}
          />
        </PropertyCell>
        <PropertyCell label="Order" span={4} hint="Draw order for the bevel layer. Lower draws earlier, higher draws later.">
          <NumberInput value={Number(effectProp('bevelOrder', 60))} step={1} onchange={(value) => setEffectNumber('bevelOrder', value, 1)} />
        </PropertyCell>
      {/if}

      {#if reflectionEffectActive}
        <PropertyCell label="Angle" span={1} hint="Direction from the text toward the reflection, in degrees. 0=Up, 90=Right, 180=Down, 270=Left.">
          <NumberInput
            value={reflectionProp('reflectionAngle', 180)}
            step={1}
            onchange={(value) => set('Text.Effects.reflectionAngle', reflectionStoredAngleFromDisplay(value))}
          />
        </PropertyCell>
        <PropertyCell label="Distance" span={1} hint="Distance from the text to the mirrored reflection.">
          <NumberInput
            value={reflectionProp('reflectionDistance', 8)}
            min={0}
            step={0.5}
            onchange={(value) => setEffectNumber('reflectionDistance', value)}
          />
        </PropertyCell>
        <PropertyCell label="Intensity" span={1} hint="Opacity of the reflection layer.">
          <NumberInput
            value={reflectionProp('reflectionIntensity', 0.45)}
            min={0}
            max={1}
            step={0.05}
            onchange={(value) => set('Text.Effects.reflectionIntensity', Math.max(0, Math.min(1, Number(value) || 0)))}
          />
        </PropertyCell>
        <PropertyCell label="Blur" span={1} hint="Blur applied to the reflection.">
          <NumberInput
            value={reflectionProp('reflectionBlur', 2)}
            min={0}
            step={0.5}
            onchange={(value) => setEffectNumber('reflectionBlur', value)}
          />
        </PropertyCell>
        <PropertyCell label="Fade" span={2} hint="Fade the reflection in, out, or not at all along the reflection distance.">
          <div class="style-row">
            <button class="style-btn" onclick={cycleReflectionFadeMode}>
              {reflectionFadeModeLabel()}
            </button>
          </div>
        </PropertyCell>
        <PropertyCell label="Fade Amount" span={2} hint="Measured from the near edge of the reflection. Fade Out starts dropping here; Fade In reaches full opacity here.">
          <NumberInput
            value={reflectionProp('reflectionFadeAmount', 0)}
            min={0}
            step={1}
            onchange={(value) => setEffectNumber('reflectionFadeAmount', value, 1)}
          />
        </PropertyCell>
        <PropertyCell label="Reflection Color" span={4} hint="AARRGGBB colour for the mirrored reflection layer.">
          <PropertyColor
            value={reflectionColorValue()}
            onchange={(value) => setEffectColor('reflectionColour', value)}
            onswatchclick={() => handleEffectColorSwatch('reflectionColour', reflectionColorValue())}
          />
        </PropertyCell>
        <PropertyCell label="Order" span={4} hint="Draw order for the reflection layer. Lower draws earlier, higher draws later.">
          <NumberInput value={Number(effectProp('reflectionOrder', 5))} step={1} onchange={(value) => setEffectNumber('reflectionOrder', value, 1)} />
        </PropertyCell>
      {/if}
    </PropertySection>

    <PropertySection
      title="Line"
      collapsed={lineSectionCollapsed}
      ontoggle={(value) => setCollapsed(sectionKey('line'), value)}
    >
      <PropertyCell label="Type" span={4} hint="Toggle underline, strikethrough, and overline decorations.">
        <div class="style-row">
          <button class="style-btn" class:active={font?.underline === true} title="Underline" onclick={toggleUnderline}>
            <Underline size={14} strokeWidth={1.8} />
          </button>
          <button class="style-btn" class:active={font?.strikethrough === true} title="Strikethrough" onclick={toggleStrikethrough}>
            <Strikethrough size={14} strokeWidth={1.8} />
          </button>
          <button class="style-btn" class:active={font?.overline === true} title="Overline" onclick={toggleOverline}>
            <span class="overline-mark">O</span>
          </button>
        </div>
      </PropertyCell>

      {#if font?.underline === true}
        <TextLineDecorationControls
          title="Underline"
          yLabel="Underline Y"
          thicknessLabel="Underline Thickness"
          colorLabel="Underline Color"
          leftLabel="Underline Left"
          rightLabel="Underline Right"
          colorValue={String(lineProp('underlineColour', lineColourFallback))}
          displayedY={displayedLineY('underline')}
          thickness={lineProp('underlineThickness', 1)}
          displayedLeft={displayedLineLeft('underlineInsetLeft')}
          displayedRight={displayedLineRight('underlineInsetRight')}
          gap={lineProp('underlineGap', 0)}
          layerValue={lineLayerValue('underline')}
          onChangeY={(value) => setDisplayedLineY('underline', value)}
          onChangeThickness={(value) => setLineNumber('underlineThickness', value)}
          onChangeColor={(value) => setLineColor('underlineColour', value)}
          onColorSwatch={() => handleLineColorSwatch('underlineColour')}
          onChangeLeft={(value) => setDisplayedLineLeft('underlineInsetLeft', value)}
          onFitLeft={() => fitLineToLeftBorder('underline')}
          onFitWord={() => fitLineToWordWidth('underline')}
          onFitRight={() => fitLineToRightBorder('underline')}
          onChangeRight={(value) => setDisplayedLineRight('underlineInsetRight', value)}
          onSetLayer={(value) => setLineLayer('underline', value)}
          onChangeGap={(value) => setLineNumber('underlineGap', value)}
        />
      {/if}

      {#if font?.strikethrough === true}
        <TextLineDecorationControls
          title="Strikethrough"
          yLabel="Strike Y"
          thicknessLabel="Strike Thickness"
          colorLabel="Strike Color"
          leftLabel="Strike Left"
          rightLabel="Strike Right"
          colorValue={String(lineProp('strikethroughColour', lineColourFallback))}
          displayedY={displayedLineY('strikethrough')}
          thickness={lineProp('strikethroughThickness', 1)}
          displayedLeft={displayedLineLeft('strikethroughInsetLeft')}
          displayedRight={displayedLineRight('strikethroughInsetRight')}
          gap={lineProp('strikethroughGap', 0)}
          layerValue={lineLayerValue('strikethrough')}
          onChangeY={(value) => setDisplayedLineY('strikethrough', value)}
          onChangeThickness={(value) => setLineNumber('strikethroughThickness', value)}
          onChangeColor={(value) => setLineColor('strikethroughColour', value)}
          onColorSwatch={() => handleLineColorSwatch('strikethroughColour')}
          onChangeLeft={(value) => setDisplayedLineLeft('strikethroughInsetLeft', value)}
          onFitLeft={() => fitLineToLeftBorder('strikethrough')}
          onFitWord={() => fitLineToWordWidth('strikethrough')}
          onFitRight={() => fitLineToRightBorder('strikethrough')}
          onChangeRight={(value) => setDisplayedLineRight('strikethroughInsetRight', value)}
          onSetLayer={(value) => setLineLayer('strikethrough', value)}
          onChangeGap={(value) => setLineNumber('strikethroughGap', value)}
        />
      {/if}

      {#if font?.overline === true}
        <TextLineDecorationControls
          title="Overline"
          yLabel="Overline Y"
          thicknessLabel="Overline Thickness"
          colorLabel="Overline Color"
          leftLabel="Overline Left"
          rightLabel="Overline Right"
          colorValue={String(lineProp('overlineColour', lineColourFallback))}
          displayedY={displayedLineY('overline')}
          thickness={lineProp('overlineThickness', 1)}
          displayedLeft={displayedLineLeft('overlineInsetLeft')}
          displayedRight={displayedLineRight('overlineInsetRight')}
          gap={lineProp('overlineGap', 0)}
          layerValue={lineLayerValue('overline')}
          onChangeY={(value) => setDisplayedLineY('overline', value)}
          onChangeThickness={(value) => setLineNumber('overlineThickness', value)}
          onChangeColor={(value) => setLineColor('overlineColour', value)}
          onColorSwatch={() => handleLineColorSwatch('overlineColour')}
          onChangeLeft={(value) => setDisplayedLineLeft('overlineInsetLeft', value)}
          onFitLeft={() => fitLineToLeftBorder('overline')}
          onFitWord={() => fitLineToWordWidth('overline')}
          onFitRight={() => fitLineToRightBorder('overline')}
          onChangeRight={(value) => setDisplayedLineRight('overlineInsetRight', value)}
          onSetLayer={(value) => setLineLayer('overline', value)}
          onChangeGap={(value) => setLineNumber('overlineGap', value)}
        />
      {/if}
    </PropertySection>
  </div>
{/if}

<style>
  .text-editor-sections {
    display: flex;
    flex-direction: column;
  }

  .full-span {
    width: 100%;
  }

  .prop-row {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 2px 0;
  }

  .lbl {
    color: #888;
    font-size: 11px;
    min-width: 52px;
    flex-shrink: 0;
  }

  .val {
    color: #DDD;
    font-size: 11px;
    background: #1A1A1A;
    padding: 4px 6px;
    border-radius: 3px;
    border: 1px solid #333;
    flex: 1;
    min-width: 0;
    font-family: inherit;
    outline: none;
    height: 26px;
  }

  .val:focus {
    border-color: #5B9BD5;
  }

  .color-input,
  .asset-row {
    display: flex;
    align-items: center;
    gap: 6px;
    flex: 1;
    min-width: 0;
  }

  .mini-swatch,
  .bg-swatch {
    border-radius: 3px;
    border: 1px solid #555;
    cursor: pointer;
    padding: 0;
  }

  .mini-swatch {
    width: 18px;
    height: 18px;
    flex-shrink: 0;
  }

  .bg-swatch {
    width: 100%;
    height: 26px;
  }

  .mini-swatch:hover,
  .bg-swatch:hover {
    border-color: #5B9BD5;
  }

  .action-btn {
    height: 26px;
    padding: 0 10px;
    border-radius: 3px;
    border: 1px solid #333;
    background: #252525;
    color: #DDD;
    font-size: 11px;
    font-family: inherit;
    cursor: pointer;
    flex-shrink: 0;
  }

  .action-btn:hover {
    border-color: #5B9BD5;
  }

  .hint-text {
    color: #555;
    font-size: 10px;
    font-style: italic;
  }

  .bg-layer-buttons {
    display: flex;
    gap: 3px;
  }

  .bg-layer-btn {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 3px;
    padding: 6px 0;
    background: #1A1A1A;
    border: 1px solid #333;
    color: #777;
    border-radius: 3px;
    cursor: pointer;
    font-family: inherit;
  }

  .bg-layer-btn:hover {
    border-color: #555;
    color: #AAA;
  }

  .bg-layer-btn.active {
    border-color: #5B9BD5;
    color: #5B9BD5;
    background: #0D2A3E;
  }

  .bg-layer-label {
    font-size: 8px;
    text-transform: uppercase;
    letter-spacing: 0.3px;
    line-height: 1;
  }

  .bg-file-row {
    grid-column: span 4;
    display: flex;
    gap: 4px;
    align-items: center;
  }

  .bg-browse-btn {
    width: 36px;
    flex-shrink: 0;
    height: 26px;
    background: #252525;
    border: 1px solid #333;
    color: #888;
    font-size: 11px;
    border-radius: 3px;
    cursor: pointer;
    font-family: inherit;
  }

  .bg-browse-btn:hover {
    border-color: #5B9BD5;
    color: #DDD;
  }

  .text-input {
    width: 100%;
    min-height: 26px;
    resize: vertical;
    color: #DDD;
    font-size: 11px;
    background: #1A1A1A;
    padding: 6px 8px;
    border-radius: 3px;
    border: 1px solid #333;
    font-family: inherit;
    outline: none;
    line-height: 1.25;
  }

  .text-input:focus,
  .text-select:focus {
    border-color: #5B9BD5;
  }

  .text-select {
    width: 100%;
    height: 26px;
    color: #DDD;
    font-size: 11px;
    background: #1A1A1A;
    padding: 0 6px;
    border-radius: 3px;
    border: 1px solid #333;
    font-family: inherit;
    outline: none;
  }

    .style-row {
      display: flex;
      gap: 4px;
    }

    .text-edit-row {
      width: 100%;
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      gap: 6px;
      align-items: stretch;
    }

    .text-accept-btn {
      min-width: 56px;
      padding: 0 12px;
      flex: 0 0 auto;
    }

    .style-btn {
      width: auto;
      height: 26px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: #1A1A1A;
    border: 1px solid #333;
    color: #AAA;
    border-radius: 3px;
    cursor: pointer;
    padding: 0;
    flex: 1 1 0;
    min-width: 0;
  }

  .style-btn:hover {
    border-color: #5B9BD5;
    color: #FFF;
  }

  .style-btn.active {
    background: #094771;
    border-color: #0B6EB5;
    color: #FFF;
  }

  .offset-panel {
    display: flex;
    flex-direction: column;
    gap: 4px;
    width: 100%;
  }

  .position-picker-wrap {
    width: 100%;
    height: 80px;
    display: flex;
  }

  .flow-mode-grid {
    width: 100%;
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 4px;
  }

  .effect-toggle-grid {
    width: 100%;
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 4px;
  }

  .feature-note {
    width: 100%;
    min-height: 28px;
    display: flex;
    align-items: center;
    color: #777;
    font-size: 11px;
  }

  .effect-divider {
    width: 100%;
    height: 1px;
    background: #2a2a2a;
    margin-top: 4px;
  }

  .flow-mode-btn {
    height: 28px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    background: #1A1A1A;
    border: 1px solid #333;
    color: #AAA;
    border-radius: 3px;
    cursor: pointer;
    padding: 0 6px;
    font-size: 10px;
    font-family: inherit;
    line-height: 1;
  }

  .flow-mode-btn:hover {
    border-color: #5B9BD5;
    color: #FFF;
  }

  .flow-mode-btn.active {
    background: #094771;
    border-color: #0B6EB5;
    color: #FFF;
  }

  .reading-row {
    width: 100%;
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 4px;
    margin-bottom: 6px;
  }

  .reading-btn {
    height: 28px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    background: #1A1A1A;
    border: 1px solid #333;
    color: #AAA;
    border-radius: 3px;
    cursor: pointer;
    padding: 0 10px;
    font-size: 10px;
    line-height: 1;
    font-family: inherit;
  }

  .reading-btn:hover {
    border-color: #5B9BD5;
    color: #FFF;
  }

  .reading-btn.active {
    background: #094771;
    border-color: #0B6EB5;
    color: #FFF;
  }

  .offset-row {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .offset-label {
    width: 10px;
    flex: 0 0 10px;
    color: #777;
    font-size: 10px;
    text-align: center;
    user-select: none;
  }

  .reset-btn {
    height: 24px;
    background: #1A1A1A;
    border: 1px solid #333;
    color: #BBB;
    border-radius: 3px;
    cursor: pointer;
    font-size: 10px;
    font-family: inherit;
    padding: 0 8px;
  }

  .reset-btn:hover {
    border-color: #5B9BD5;
    color: #FFF;
  }

  .reset-btn:active {
    background: #094771;
    border-color: #0B6EB5;
  }

  .overline-mark {
    font-size: 12px;
    line-height: 1;
    text-decoration: overline;
    text-decoration-thickness: 1px;
  }
</style>
