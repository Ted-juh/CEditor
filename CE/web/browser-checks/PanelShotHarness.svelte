<script>
  // A whole .cepanel rendered at 1:1, so a generated panel can be looked at rather than reasoned
  // about. It exists because two bugs in the AN1x panel were invisible to every structural check:
  // a Combobox whose Behavior.buttonType had been elided drew NOTHING, and four curve lanes drew
  // in the stock blue because their colours had been written under a child section nothing reads.
  // Both were obvious in a screenshot and inspectable in neither the JSON nor the DOM shape.
  //
  // No preview session is passed, so every part driven by a value channel draws at its channel
  // minimum: faders sit at the bottom and knob pointers at seven o'clock whatever default the
  // parameter carries. That is this harness, not the panel — read the shot for layout, colour and
  // presence, not for values.
  import CanvasControl from '../src/CE_Application/editor/CanvasControl.svelte';
  let { panel } = $props();
  const controls = $derived(panel?.controls ?? []);
</script>

<div class="panel" style="width:{panel.width}px;height:{panel.height}px;background:#{String(panel.bgColour ?? 'FF202020').slice(2)}">
  {#each controls as control (control._children?.Core?.id)}
    <CanvasControl
      {control}
      scale={1}
      panelLocked={false}
      allControls={controls}
      panelControls={controls}
      panelWidth={panel.width}
      panelHeight={panel.height}
      editorInteractionEnabled={false}
    />
  {/each}
</div>

<style>
  .panel { position: relative; overflow: hidden; }
</style>
