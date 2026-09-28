<script>
  // The Public API section of whichever control is selected, re-rendered from the store the way the
  // properties panel does — so an update shows up in the card exactly as it would in the app.
  import CustomPublicPropertiesEditor from '../src/CE_Application/sections/CustomPublicPropertiesEditor.svelte';
  import { panels, selectedComponentIds } from '../src/CE_Application/stores/panels.js';

  let control = $derived.by(() => {
    const id = [...($selectedComponentIds ?? [])][0];
    return ($panels[0]?.controls ?? []).find((entry) => entry._children.Core.id === id) ?? null;
  });
</script>

{#if control}
  {#key control._children.Core.id}
    <CustomPublicPropertiesEditor {control} />
  {/key}
{/if}
