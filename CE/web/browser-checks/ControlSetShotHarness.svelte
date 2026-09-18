<script>
  // A specimen panel under one control set, rendered through the Player's own surface so the
  // picture shows what a set actually does: the family patch, the material filters, the panel's
  // lamp and material. The set is a prop, so one page can show four sets in turn.
  import PanelPreviewSurface from '../src/CE_Application/editor/PanelPreviewSurface.svelte';
  import { buildSolidStyle } from '../src/CE_Application/utils/backgroundCSS.js';
  let { panel } = $props();
  const bgLayers = $derived({ solid: buildSolidStyle(panel) });
</script>

<div class="frame" style="width:{panel.width}px;height:{panel.height}px">
  {#key panel.controlSet?.id}
    <PanelPreviewSurface {panel} scale={1} {bgLayers} gridStyle="" />
  {/key}
</div>

<style>
  .frame { position: relative; overflow: hidden; }
</style>
