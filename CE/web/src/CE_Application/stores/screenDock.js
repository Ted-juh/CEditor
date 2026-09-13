import { get, writable } from 'svelte/store';
import { editorTarget } from './editorTarget.js';
import { selectedControl } from './controls.js';
import { resolvedActivePanelId } from './panels.js';

export const SCREEN_DOCK_GROUPS = ['screen', 'appearance', 'content', 'pages', 'motion'];
const initial = () => ({ followSelection: true, pinnedId: null, group: 'screen' });
export const screenDockState = writable(initial());
resolvedActivePanelId.subscribe(() => screenDockState.set(initial()));
editorTarget.subscribe((target) => {
  if (target?.kind !== 'screen') return;
  screenDockState.update((state) => ({ ...state, pinnedId: target.controlId,
    followSelection: target.controlId === get(selectedControl)?._children?.Core?.id,
  }));
});
