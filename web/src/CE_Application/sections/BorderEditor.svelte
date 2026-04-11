<script>
  import { getSection, updateControlProperty, updateSelectedProperty } from '../stores/controls.js';
  import { selectedComponentIds } from '../stores/panels.js';
  import BorderCornerWidget from '../properties/BorderCornerWidget.svelte';

  let { control = null } = $props();

  let core = $derived(getSection(control, 'Core'));
  let background = $derived(getSection(control, 'Background'));
  let border = $derived(background?._children?.Border);
  let corners = $derived(background?._children?.Corners);

  function set(path, value) {
    if (!core?.id) return;
    if ($selectedComponentIds.size > 1) {
      updateSelectedProperty(path, value);
    } else {
      updateControlProperty(core.id, path, value);
    }
  }
</script>

{#if background}
  <div class="border-editor">
    <BorderCornerWidget
      {border}
      {corners}
      linked={corners?.linked ?? true}
      controlId={core?.id}
      onupdate={(path, value) => set(path, value)}
    />
  </div>
{/if}

<style>
  .border-editor { display: flex; flex-direction: column; }
</style>
