<script>
  import { get } from 'svelte/store';
  import PanelPreviewSurface from '../src/CE_Application/editor/PanelPreviewSurface.svelte';
  import InteractiveTestSurface from '../src/CE_Application/components/InteractiveTestSurface.svelte';
  import { createControl } from '../src/CE_Application/models/componentTypes.js';
  import { panels } from '../src/CE_Application/stores/panels.js';
  import { createInteractionPreviewSession, panelPreviewSessions } from '../src/CE_Application/stores/interactionPreview.js';
  import { resolveInteractiveControl } from '../src/CE_Application/utils/interactionRuntime.js';
  const control = createControl('CustomComponent', {
    Core: { id: 'arp_gestures', name: 'Arpeggio gestures' },
    Transform: { x: 0, y: 0, width: 640, height: 272 },
    Designer: { arpeggiator: { enabled: true, stepCount: 16, viewNote: 60,
      blocks: [{ id: 'note', note: 65, step: 3, length: 4, velocity: 80 }] } },
  });
  control._children.Behavior = {};
  const panel = { id: 91823, name: 'Arp gestures', width: 640, height: 272, controls: [control] };
  panels.set([panel]);
  let session = $state(createInteractionPreviewSession(control));
  const resolved = $derived(resolveInteractiveControl(control, session));
  function reset(length = 4) {
    control._children.Designer.arpeggiator.blocks[0].length = length;
    session = createInteractionPreviewSession(control);
    panelPreviewSessions.set({ arp_gestures: createInteractionPreviewSession(control) });
  }
  reset();
  window.__arp = {
    reset,
    state: (surface) => (surface === 'panel' ? get(panelPreviewSessions).arp_gestures : session)?.customValues?.__arpeggiator,
  };
</script>
<p>Panel preview — left: move · middle: velocity · right: length</p>
<div id="panel" style="position:relative;width:640px;height:272px"><PanelPreviewSurface {panel} /></div>
<p>Component test surface</p>
<div id="bench" style="width:680px;height:320px">
  <InteractiveTestSurface {control} {session} resolvedControl={resolved.control} resolvedRuntime={resolved.runtime}
    compact onpatchsession={(patch) => session = { ...session, ...patch }} />
</div>
