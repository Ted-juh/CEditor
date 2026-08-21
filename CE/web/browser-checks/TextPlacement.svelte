<script>
  /**
   * Every text placement the block layout can produce, rendered as real controls in a real browser.
   *
   * Text placement is measured, not computed: `.text-anchor` is positioned from `domTextGlyphSize`,
   * which is read off the rendered `.text-glyphs` element. So it is a feedback loop — render,
   * measure, reposition — and no amount of server-rendered markup tells you where the glyphs
   * actually land. Only a browser does.
   *
   * That is why this exists. `.text-anchor` and `.text-span` are two elements doing two jobs (place
   * the block; be the box transforms are centred on) and merging them is worth one DOM node per
   * text-bearing control. The comment on textAxisCenter says not to touch the anchor math without
   * redesigning text positioning, and that Top/Center/Bottom "drifts and flips again" when someone
   * does — which is a warning from experience with no test behind it. This is the test.
   */
  import CanvasControl from '../src/CE_Application/editor/CanvasControl.svelte';
  import { createControl } from '../src/CE_Application/models/componentTypes.js';

  const JUSTIFICATIONS = [
    'topLeft', 'top', 'topRight',
    'left', 'centred', 'right',
    'bottomLeft', 'bottom', 'bottomRight',
  ];

  /**
   * The axes that move glyphs, crossed against every justification. Rotation and fit-scale matter
   * most: both are applied as a transform about `center center` of `.text-span`, so they are exactly
   * what a merge would disturb.
   */
  const VARIANTS = [
    { name: 'plain', text: {}, font: {}, size: [160, 40] },
    { name: 'long', text: { content: 'A rather longer label that must wrap' }, font: {}, size: [160, 60] },
    { name: 'multiline', text: { content: 'One\nTwo\nThree' }, font: {}, size: [160, 60] },
    { name: 'rotated', text: {}, font: {}, size: [160, 40], position: { flowAngle: 0 }, rotation: 30 },
    { name: 'big-font', text: {}, font: { size: 28 }, size: [160, 40] },
    { name: 'tight', text: { content: 'Squeezed into a narrow box' }, font: { size: 20 }, size: [70, 24] },
    // Padding comes from ContentLayout, not Text.Position — effectiveTextPaddingLeft reads
    // layoutPaddingLeft. Setting it on Position looks right and moves nothing.
    { name: 'padded', text: {}, font: {}, size: [160, 40], layout: { paddingLeft: 24, paddingTop: 12, paddingRight: 6, paddingBottom: 2 } },
    { name: 'offset', text: {}, font: {}, size: [160, 40], position: { offsetX: 7, offsetY: -5 } },
    { name: 'italic-bold', text: {}, font: { style: 'Italic', weight: 'Bold', weightValue: 700, size: 16 }, size: [160, 40] },
    { name: 'spaced', text: {}, font: { letterSpacing: 3, wordSpacing: 6 }, size: [160, 40] },
    { name: 'underlined', text: {}, font: { underline: true, strikethrough: true, overline: true }, size: [160, 40] },
  ];

  function specimen(variant, justification) {
    const [width, height] = variant.size;
    const control = createControl('Label', {
      Core: { id: `${variant.name}__${justification}` },
      Text: { content: 'Label', ...variant.text },
    });
    Object.assign(control._children.Transform, { x: 0, y: 0, width, height });
    if (variant.rotation) control._children.Transform.rotation = variant.rotation;
    Object.assign(control._children.Text._children.Font, variant.font ?? {});
    Object.assign(control._children.Text._children.Position, { justification, ...(variant.position ?? {}) });
    if (variant.layout) Object.assign(control._children.ContentLayout, variant.layout);
    return { id: `${variant.name}__${justification}`, control, width, height };
  }

  const cases = VARIANTS.flatMap((v) => JUSTIFICATIONS.map((j) => specimen(v, j)));
  export const caseIds = cases.map((c) => c.id);
</script>

<div class="cases">
  {#each cases as item (item.id)}
    <div class="case" data-case={item.id} style="width:{item.width}px; height:{item.height}px;">
      <CanvasControl
        control={item.control}
        scale={1}
        panelLocked={false}
        allControls={[item.control]}
        panelControls={[item.control]}
        panelWidth={item.width}
        panelHeight={item.height}
        editorInteractionEnabled={false}
      />
    </div>
  {/each}
</div>

<style>
  .cases { display: flex; flex-wrap: wrap; gap: 24px; padding: 12px; background: #202020; }
  .case { position: relative; outline: 1px solid #444; flex: none; }
</style>
