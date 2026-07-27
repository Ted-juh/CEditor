<script>
  /**
   * GradientMiniPreview — Small gradient preview shown in the Colors tab
   * when editing a gradient stop's color. Shows live gradient result.
   */
  import { onMount } from 'svelte';
  import { gradientToCSS, gradientFilterCSS, gradientBlendCSS, squareRampToDataURL } from '../utils/gradientCSS.js';
  import ArrowLeft from 'lucide-svelte/icons/arrow-left';

  let props = $props();
  let gradient = $derived(props.gradient);
  let shape = $derived(props.shape ?? 'rectangle');
  let onBack = $derived(props.onBack);

  let cssGradient = $derived(
    gradient?.type === 'squareRamp'
      ? `url(${squareRampToDataURL(gradient, 256, 256)})`
      : gradientToCSS(gradient, shape)
  );
  let cssFilter = $derived(gradientFilterCSS(gradient));
  let cssBlend = $derived(gradientBlendCSS(gradient));
  let needsShapeContainer = $derived(shape !== 'rectangle');
  let shapeClass = $derived(
    shape === 'circle' ? 'shape-circle'
    : shape === 'square' ? 'shape-square'
    : shape === 'ellipse' ? 'shape-ellipse'
    : shape === 'triangle' ? 'shape-triangle'
    : ''
  );

  let shapeContainerEl = $state(null);
  let shapeSize = $state(0);
  let containerW = $state(0);
  let containerH = $state(0);

  onMount(() => {
    if (!shapeContainerEl) return;
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      containerW = width;
      containerH = height;
      shapeSize = Math.floor(Math.min(width, height) * 0.85);
    });
    ro.observe(shapeContainerEl);
    return () => ro.disconnect();
  });

  let shapeW = $derived(shape === 'ellipse' ? Math.floor(containerW * 0.85) : shapeSize);
  let shapeH = $derived(shape === 'ellipse' ? Math.floor(containerH * 0.85) : shapeSize);
</script>

<div class="mini-preview">
  <button class="back-btn" onclick={onBack} title="Back to Gradient">
    <ArrowLeft size={12} strokeWidth={2} />
    <span>Gradient</span>
  </button>

  <div class="preview-area">
    <div class="checkerboard"></div>
    {#if needsShapeContainer}
      <div class="shape-container" bind:this={shapeContainerEl}>
        <div
          class="gradient-fill {shapeClass}"
          style="background: {cssGradient};{cssFilter ? ` filter: ${cssFilter};` : ''}{cssBlend ? ` background-blend-mode: ${cssBlend};` : ''} width: {shapeW}px; height: {shapeH}px;"
        ></div>
      </div>
    {:else}
      <div class="gradient-fill" style="background: {cssGradient};{cssFilter ? ` filter: ${cssFilter};` : ''}{cssBlend ? ` background-blend-mode: ${cssBlend};` : ''}"></div>
    {/if}
  </div>
</div>

<style>
  .mini-preview {
    display: flex;
    flex-direction: column;
    height: 100%;
    border-left: 1px solid #333;
    border-right: 1px solid #333;
    background: #1E1E1E;
  }

  .back-btn {
    display: flex;
    align-items: center;
    gap: 4px;
    background: #252525;
    border: none;
    border-bottom: 1px solid #333;
    color: #BBB;
    font-size: 10px;
    font-family: inherit;
    padding: 4px 8px;
    cursor: pointer;
    transition: all 0.1s;
  }

  .back-btn:hover {
    color: #DDD;
    background: #2D2D2D;
  }

  .preview-area {
    flex: 1;
    position: relative;
    overflow: hidden;
  }

  .checkerboard {
    position: absolute;
    inset: 0;
    background: repeating-conic-gradient(#2A2A2A 0% 25%, #1A1A1A 0% 50%) 0 0 / 16px 16px;
  }

  .gradient-fill {
    position: absolute;
    inset: 0;
  }

  .shape-container {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 8px;
  }

  .shape-container .gradient-fill {
    position: relative;
    overflow: hidden;
  }

  .shape-circle {
    border-radius: 50%;
  }

  .shape-ellipse {
    border-radius: 50%;
  }

  .shape-triangle {
    clip-path: polygon(50% 0%, 0% 100%, 100% 100%);
  }
</style>
