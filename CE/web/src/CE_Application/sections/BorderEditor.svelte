<script>
  import { getSection, updateInspectorControlProperty as updateControlProperty, updateSelectedInspectorProperty as updateSelectedProperty, applyInspectorControlPatchesById } from '../stores/controls.js';
  import { activePanel, selectedComponentIds } from '../stores/panels.js';
  import { stateEditScope } from '../stores/stateEditScope.js';
  import { findControlById } from '../utils/containment.js';
  import { resolveStateScopedControl } from '../utils/interactionRuntime.js';
  import { linkTogglePatch } from '../utils/borderLinkCascade.js';
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

  function toggleLinkForSelection(nextLinked) {
    if ($selectedComponentIds.size < 2 || !$activePanel) return false;
    const stateName = $stateEditScope.mode === 'state' ? $stateEditScope.stateName : '';
    const patches = new Map();
    for (const id of $selectedComponentIds) {
      const source = findControlById($activePanel.controls, id);
      if (!source) continue;
      const scoped = resolveStateScopedControl(source, stateName);
      const bg = getSection(scoped, 'Background');
      if (!bg) continue;
      patches.set(id, linkTogglePatch(bg._children?.Border, bg._children?.Corners, nextLinked));
    }
    if (!patches.size) return false;
    applyInspectorControlPatchesById(patches);
    return true;
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
      onlinktoggle={toggleLinkForSelection}
    />
  </div>
{/if}

<style>
  .border-editor { display: flex; flex-direction: column; }
</style>
