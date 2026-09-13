import { get, writable } from 'svelte/store';
import { editorTarget } from './editorTarget.js';
import { selectedControl } from './controls.js';
import { resolvedActivePanelId } from './panels.js';

export const TEXT_DOCK_GROUPS = ['type', 'layout', 'fill', 'flow', 'lines', 'effects'];
const initial = () => ({ followSelection: true, pinnedId: null, group: 'type', line: 'underline', effect: 'outline' });

// Keep the target and group when a colour/gradient picker temporarily replaces the Text tab.
export const textDockState = writable(initial());
resolvedActivePanelId.subscribe(() => textDockState.set(initial()));
editorTarget.subscribe((target) => {
  if (target?.kind !== 'typography') return;
  textDockState.update((state) => ({
    ...state,
    group: TEXT_DOCK_GROUPS.includes(target.domain) ? target.domain : 'type',
    pinnedId: target.controlId,
    followSelection: target.controlId === get(selectedControl)?._children?.Core?.id,
  }));
});
