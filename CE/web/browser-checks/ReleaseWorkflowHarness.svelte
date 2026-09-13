<script>
  import { selectedControl } from '../src/CE_Application/stores/controls.js';
  import DeviceBindingsEditor from '../src/CE_Application/sections/DeviceBindingsEditor.svelte';
  import DisplayPanel from '../src/CE_Application/panels/DisplayPanel.svelte';
  import StatusBar from '../src/CE_Application/layout/StatusBar.svelte';
  import DeviceInsight from '../src/CE_Application/layout/DeviceInsight.svelte';
</script>

<div class="status"><StatusBar /></div>
<div class="insight"><DeviceInsight /></div>
<main>
  <section class="bindings"><DeviceBindingsEditor control={$selectedControl} /></section>
  <section class="ports"><DisplayPanel /></section>
</main>

<style>
  :global(body) { margin: 0; background: #202020; color: #ddd; font-family: sans-serif; }
  .status { height: 24px; }
  main { display: flex; gap: 16px; padding: 12px; }
  .bindings { width: 400px; }
  .ports { width: 700px; height: 800px; }
</style>
