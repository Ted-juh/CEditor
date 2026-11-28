<script>
  // A stand-in for the Animation Designer's stage: a still stage of its own around a live surface,
  // where a scene moves only under the playhead and never by itself (stores/sceneStage.js).
  import { setContext } from 'svelte';
  import { writable } from 'svelte/store';
  import PanelPreviewSurface from '../src/CE_Application/editor/PanelPreviewSurface.svelte';
  import { SCENE_STAGE } from '../src/CE_Application/stores/sceneStage.js';
  let { panel } = $props();
  setContext(SCENE_STAGE, writable({ scene: null, at: 0, playing: false, phase: 'a' }));
</script>

<PanelPreviewSurface {panel} scale={1} bgLayers={{}} gridStyle="" />
