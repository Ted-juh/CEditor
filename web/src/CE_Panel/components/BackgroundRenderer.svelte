<script>
  import { gradientToCSS } from '../../CE_Application/utils/gradientCSS.js';

  let { background = null } = $props();

  let style = $derived.by(() => {
    if (!background) return 'background: transparent;';

    const mode = background.mode || 'solid';
    const fill = background._children?.Fill;

    if (mode === 'solid' && fill?.colour) {
      return `background: #${fill.colour.slice(-6)};`;
    }

    if (mode === 'gradient' && background._children?.Fill?.Gradient) {
      const gradient = background._children.Fill.Gradient;
      const css = gradientToCSS(gradient);
      return `background: ${css};`;
    }

    return 'background: transparent;';
  });
</script>

<div class="bg-renderer" {style}></div>

<style>
  .bg-renderer {
    position: absolute;
    inset: 0;
    border-radius: inherit;
    pointer-events: none;
  }
</style>
