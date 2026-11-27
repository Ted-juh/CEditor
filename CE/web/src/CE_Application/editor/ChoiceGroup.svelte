<script>
  // ChoiceGroup.svelte — draws a choice group's (RadioButtonGroup's) options, each already placed
  // (utils/choiceGroupLayout.js) and resolved (utils/choiceGroupStyle.js) by CanvasControl. It draws
  // and nothing else: no layout, no hit-testing. Preview and the test surface find the option under
  // the pointer from the boxes drawn here (`data-choice-key`), so what is clicked is what is seen.
  //
  // The frame of the segmented style is the control's own Background, drawn by CanvasControl; the
  // other styles draw none. Each option is a box with, where it has them, a body (BackgroundRenderer),
  // an indicator (a ring and dot, a lamp, an underline) and a label; the keyboard's option has a
  // focus ring. Option ids are what the group's aria-activedescendant names.
  //
  // Drawn in layers, so the options can be animated as parts (choiceGroupLayout.js CHOICE_PARTS):
  // the options' faces, then their words, indicators and focus rings, each option's two moving as
  // one (`motion`, worked out by CanvasControl). The thumb, when anything plays on it, is the chosen
  // option's mark drawn apart, where it can travel (utils/choiceGroupMotion.js): under the words in
  // the styles that paint options and in the tab style, over the indicators in the radio and LED
  // styles, where it is the dot or the light.
  import BackgroundRenderer from '../../CE_Panel/components/BackgroundRenderer.svelte';
  import { cssColor } from './canvasControlStyles.js';
  import { indicatorRadius } from '../utils/choiceGroupStyle.js';
  import { lampFaceCss } from '../utils/lampFace.js';

  let {
    style = 'segmented',
    orientation = 'horizontal',
    items = [],
    dividers = [],
    dividerColour = 'rgba(255,255,255,0.25)',
    baseline = null,
    focusColour = 'rgba(91,155,213,1)',
    optionRole = 'radio',
    interactive = false,
    thumb = null,
  } = $props();

  // The radio's dot and the LED's light travel over the rings and lamps; a face, an underline under the words.
  const THUMB_OVER = new Set(['radio', 'led']);

  const centred = (value) => value === 'segmented' || value === 'buttons' || value === 'tab';

  function labelCss(label) {
    return [
      `color:${cssColor(label.colour)}`,
      `font-size:${label.fontSize}px`,
      `font-weight:${label.fontWeight}`,
      label.fontFamily ? `font-family:${JSON.stringify(label.fontFamily)}, sans-serif` : '',
      /italic/i.test(label.fontStyle) ? 'font-style:italic' : '',
      `letter-spacing:${label.letterSpacing}px`,
      label.textTransform !== 'none' ? `text-transform:${label.textTransform}` : '',
    ].filter(Boolean).join('; ');
  }

  function shapeCss(part) {
    return [
      `width:${part.width}px`,
      `height:${part.height}px`,
      `border:${part.borderWidth}px solid ${cssColor(part.borderColour)}`,
      `border-radius:${indicatorRadius(part.shape, part.radius)}`,
      `background:${cssColor(part.fillColour)}`,
    ].join('; ');
  }

  function lampFor(resolved, lit) {
    const { indicatorOuter: rest, indicatorInner: light } = resolved;
    const kind = rest.jewel ? 'jewel' : rest.shape === 'rounded' ? 'window' : 'led';
    return lampFaceCss({ kind, lit, colour: light.fillColour, offColour: rest.fillColour, bezelColour: rest.borderColour, size: rest.height });
  }

  function lampCssFor(option) {
    const rest = option.resolved.indicatorOuter;
    // With a thumb, the light is the thumb's: the chosen lamp is drawn out, and the light travels to it.
    return [`width:${rest.width}px`, `height:${rest.height}px`, lampFor(option.resolved, option.resolved.indicatorInner.shown && !option.thumbbed)].join('; ');
  }

  /** The thumb's own look: a face (drawn inside it), the dot, the light, or the underline's colour. */
  function thumbLook() {
    const resolved = thumb.resolved;
    if (style === 'radio') {
      const dot = resolved.indicatorInner;
      return `box-sizing:border-box;border:${dot.borderWidth}px solid ${cssColor(dot.borderColour)};border-radius:${indicatorRadius(dot.shape, dot.radius)};background:${cssColor(dot.fillColour)};`;
    }
    if (style === 'led') return lampFor(resolved, true);
    if (style === 'tab') return `background:${cssColor(resolved.indicatorInner.fillColour)};`;
    return '';
  }

  function underlineCss(option) {
    const mark = option.resolved.indicatorInner;
    const thickness = Math.max(1, mark.height || 2);
    return orientation === 'vertical'
      ? `left:0; top:20%; bottom:20%; width:${thickness}px; background:${cssColor(mark.fillColour)}`
      : `left:${option.padX}px; right:${option.padX}px; bottom:0; height:${thickness}px; background:${cssColor(mark.fillColour)}`;
  }

  function focusRadius(option) {
    const radius = Number(option.resolved.body?._children?.Corners?.radius);
    return Number.isFinite(radius) ? Math.min(radius, option.height / 2) : 4;
  }
</script>

{#snippet thumbMark()}
  <div class="choice-thumb" data-choice-thumb style="{thumb.edges}{thumb.timing}{thumb.moves}{thumb.colours}{thumbLook()}">
    {#if (style === 'segmented' || style === 'buttons') && thumb.resolved.body}
      <div class="choice-body">
        <BackgroundRenderer background={thumb.resolved.body} width={thumb.box.width} height={thumb.box.height} />
      </div>
    {/if}
  </div>
{/snippet}

<div class="choice-group" data-style={style}>
  {#if baseline}
    <span class="choice-baseline" style="left:{baseline.left}px; top:{baseline.top}px; width:{baseline.width}px; height:{baseline.height}px; background:{baseline.colour};"></span>
  {/if}
  {#each dividers as divider (divider.between.join('|'))}
    <span
      class="choice-divider"
      class:hidden={divider.hidden}
      style="left:{Math.min(divider.x1, divider.x2) - 0.5}px; top:{Math.min(divider.y1, divider.y2) - 0.5}px; width:{Math.max(1, Math.abs(divider.x2 - divider.x1))}px; height:{Math.max(1, Math.abs(divider.y2 - divider.y1))}px; background:{dividerColour};"
    ></span>
  {/each}
  <!-- The faces, under everything. With a thumb, the chosen one's chosen look is the thumb's, and
       it keeps the face it has when not chosen (a key stays a key while the colour comes to it). -->
  {#each items as option (option.key)}
    {@const body = option.thumbbed ? option.restingBody : option.resolved.body}
    {#if body}
      <div class="choice-face" data-choice-face={option.key} style="left:{option.left}px; top:{option.top}px; width:{option.width}px; height:{option.height}px;{option.motion ?? ''}">
        <BackgroundRenderer background={body} width={option.width} height={option.height} />
      </div>
    {/if}
  {/each}
  {#if thumb && !THUMB_OVER.has(style)}{@render thumbMark()}{/if}
  {#each items as option (option.key)}
    {@const resolved = option.resolved}
    <div
      class="radio-group-item choice-option"
      class:selected={option.selected}
      id={option.id}
      role={interactive ? optionRole : undefined}
      aria-checked={interactive ? option.selected : undefined}
      data-choice-key={option.key}
      style="left:{option.left}px; top:{option.top}px; width:{option.width}px; height:{option.height}px;{option.motion ?? ''}"
    >
      <div
        class="choice-content"
        style="padding:{resolved.whole.paddingY}px {option.padX}px; gap:{resolved.whole.indicatorGap}px; justify-content:{centred(style) ? 'center' : 'flex-start'};"
      >
        {#if style === 'led'}
          <span class="choice-lamp" style={lampCssFor(option)}></span>
        {:else if resolved.indicatorOuter.visible}
          <span class="choice-ring" style={shapeCss(resolved.indicatorOuter)}>
            {#if resolved.indicatorInner.shown && style !== 'tab' && !option.thumbbed}
              <span class="choice-dot" style={shapeCss(resolved.indicatorInner)}></span>
            {/if}
          </span>
        {:else if resolved.indicatorInner.shown && style !== 'tab' && !option.thumbbed}
          <span class="choice-dot" style={shapeCss(resolved.indicatorInner)}></span>
        {/if}
        <span class="radio-group-label choice-label" style="{labelCss(resolved.label)};{option.words?.outer ?? ''}">{#if option.words?.pieces}{#each option.words.pieces as piece, k (k)}<span class="choice-piece" style={piece.style}>{piece.text}</span>{/each}{:else if option.words?.colours}<span class="choice-ink">{option.label}</span>{:else}{option.label}{/if}</span>
      </div>
      {#if style === 'tab' && resolved.indicatorInner.shown && !option.thumbbed}
        <span class="choice-underline" style={underlineCss(option)}></span>
      {/if}
      {#if option.focused}
        <span class="choice-focus" style="border-color:{focusColour}; border-radius:{focusRadius(option)}px;"></span>
      {/if}
      {#if option.editTarget}
        <!-- The Segments tab's target: what its edits will change. -->
        <span class="choice-edit-target"></span>
        <span class="choice-edit-badge">Editing</span>
      {/if}
    </div>
  {/each}
  {#if thumb && THUMB_OVER.has(style)}{@render thumbMark()}{/if}
</div>

<style>
  .choice-group {
    position: absolute;
    inset: 0;
    pointer-events: none;
    z-index: 3;
  }

  .choice-option {
    position: absolute;
    box-sizing: border-box;
  }

  .choice-body {
    position: absolute;
    inset: 0;
  }

  .choice-face,
  .choice-thumb {
    position: absolute;
    box-sizing: border-box;
  }

  /* A colour frame on an option's words (`Parts.chosenLabel`, `Parts.optionLabel`). */
  .choice-ink {
    animation: var(--ce-kf-text, none);
  }

  .choice-content {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    box-sizing: border-box;
    min-width: 0;
  }

  .choice-ring,
  .choice-dot,
  .choice-lamp {
    flex-shrink: 0;
    box-sizing: border-box;
    display: inline-grid;
    place-items: center;
  }

  .choice-label {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    line-height: 1.15;
    transition: color 0.12s ease;
  }

  .choice-divider,
  .choice-baseline,
  .choice-underline {
    position: absolute;
  }

  .choice-divider {
    transition: opacity 0.12s ease;
  }

  .choice-divider.hidden {
    opacity: 0;
  }

  .choice-edit-target {
    position: absolute;
    inset: 1px;
    border: 2px solid rgba(46, 139, 87, 0.95);
    border-radius: 6px;
    box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.55), 0 0 10px rgba(46, 139, 87, 0.45);
    pointer-events: none;
  }

  .choice-edit-badge {
    position: absolute;
    right: 4px;
    top: 3px;
    border-radius: 999px;
    padding: 1px 5px;
    background: rgba(14, 63, 42, 0.92);
    border: 1px solid rgba(46, 139, 87, 0.95);
    color: #FFF;
    font-size: 8px;
    line-height: 1.2;
  }

  .choice-focus {
    position: absolute;
    inset: 1px;
    border: 2px solid;
    box-sizing: border-box;
    pointer-events: none;
  }
</style>
