<script>
  import { panels } from '../src/CE_Application/stores/panels.js';
  import PanelPreviewSurface from '../src/CE_Application/editor/PanelPreviewSurface.svelte';
  import ScriptDialog from '../src/CE_Application/layout/ScriptDialog.svelte';
  export let panelId;
  $: panel = $panels.find(p => p.id === panelId);
</script>
{#if panel}<PanelPreviewSurface {panel}/>{/if}
<ScriptDialog />
