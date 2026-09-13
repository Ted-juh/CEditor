import { get, writable } from 'svelte/store';
import { editorTarget } from './editorTarget.js';
import { selectedControl } from './controls.js';
import { resolvedActivePanelId } from './panels.js';

const initial = () => ({ followSelection: true, pinnedId: null, domain: 'text', surface: 'component' });
export const effectsDockState = writable(initial());
resolvedActivePanelId.subscribe(() => effectsDockState.set(initial()));

// Explicit property-panel openers can name a different component. Ordinary tab clicks
// and selection changes need no global target and must not steal another dock's target.
editorTarget.subscribe((target) => {
  if (target?.kind !== 'effects') return;
  effectsDockState.update((state) => ({ ...state,
    domain: target.domain ?? 'text',
    surface: 'component',
    pinnedId: target.controlId,
    followSelection: target.controlId === get(selectedControl)?._children?.Core?.id,
  }));
});

// Keep the selected effect when visiting the shared colour editor and returning.
export const effectsDockSelection = writable({ text: 'outline', component: 'shadow:0', lighting: 'backlight' });
