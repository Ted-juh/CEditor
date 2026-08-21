<script>
  // The Device tab's diagnostics strip, to confirm the monitor rows are gone and the hand-off works.
  import ParameterBrowserTab from '../src/CE_Application/components/ParameterBrowserTab.svelte';
  let { onopentab } = $props();
</script>
<div class="pane"><ParameterBrowserTab {onopentab} /></div>
<style>.pane { width: 1100px; height: 700px; }</style>
