<script>
  import SceneryGround from '../src/CE_Application/editor/SceneryGround.svelte';
  import { createControl } from '../src/CE_Application/models/componentTypes.js';
  import { planSceneryFold } from '../src/CE_Application/utils/sceneryModel.js';

  const at = (c, x, y, width, height) => { Object.assign(c._children.Transform, { x, y, width, height }); return c; };
  const controls = [
    at(createControl('Background', { Core: { id: 'plate' }, Background: { _children: { Fill: { colour: 'FF101418' } } } }), 0, 0, 400, 200),
    at(createControl('Label', { Core: { id: 'heading' }, Text: { content: 'OSCILLATOR' } }), 20, 10, 120, 16),
    at(createControl('Label', { Core: { id: 'legend' }, Text: { content: 'CUTOFF' } }), 20, 40, 80, 14),
  ];
  const { ground } = planSceneryFold(controls);
  let hiddenIds = $state(new Set());
  export function setHidden(ids) { hiddenIds = new Set(ids); }
  export const groundIds = ground.map((c) => c._children.Core.id);
</script>

<SceneryGround
  controls={ground}
  allControls={controls}
  panelControls={controls}
  panelWidth={400}
  panelHeight={200}
  scale={1}
  {hiddenIds}
/>
