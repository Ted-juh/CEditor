<script>
  import { panels } from '../src/CE_Application/stores/panels.js';
  import { flatControls } from '../src/CE_Application/utils/containment.js';
  import CanvasControl from '../src/CE_Application/editor/CanvasControl.svelte';
  let { panelId }=$props();
  let panel=$derived($panels.find(p=>p.id===panelId));
  let graph=$derived(flatControls(panel?.controls??[]).find(c=>c._children.Core.name==='tone1_filter_env_graph'));
  let placed=$derived(graph ? {...graph,_children:{...graph._children,Transform:{...graph._children.Transform,x:0,y:0}}}:null);
</script>
<div id="envelope-design-check" style="position:absolute;left:20px;top:2160px;width:400px;height:100px">
  {#if placed}<CanvasControl control={placed} allControls={panel.controls} />{/if}
</div>
