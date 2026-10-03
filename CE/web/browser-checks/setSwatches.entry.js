/**
 * The inspector's swatches show the colour the canvas draws (utils/setSwatchValue.js).
 *
 * A Turing on a Tolex panel: its editor's Bars swatch used to say factory green while the bars were
 * tan, because editors build swatches from the document, which holds the factory value. Mounted
 * here with the real stores, so what is checked is the painted swatch, not the helper.
 */
import { mount, unmount } from 'svelte';
import TuringEditor from '../src/CE_Application/sections/TuringEditor.svelte';
import { panels, activePanelId, selectedComponentIds } from '../src/CE_Application/stores/panels.js';
import { createControl } from '../src/CE_Application/models/componentTypes.js';
import { getControlSet, resolveToken } from '../src/CE_Application/models/controlSets.js';

let mounted = null;
window.__swatches = {
  show(setId, { barColour } = {}) {
    if (mounted) unmount(mounted);
    const turing = createControl('Turing');
    turing._children.Core.id = 'ctrl_t';
    if (barColour) turing._children.Turing.barColour = barColour;
    panels.set([{ id: 'p1', name: 'S', width: 800, height: 400, bgColour: 'FF1E1E1E', controls: [turing], controlSet: { id: setId } }]);
    activePanelId.set('p1');
    selectedComponentIds.set(new Set(['ctrl_t']));
    mounted = mount(TuringEditor, { target: document.getElementById('host'), props: { control: turing } });
    return { series: resolveToken('series.one', getControlSet(setId)), factory: createControl('Turing')._children.Turing.barColour };
  },
  bars() {
    const button = [...document.querySelectorAll('.swx')].find((el) => el.textContent.trim() === 'Bars')?.querySelector('button');
    return button ? { background: getComputedStyle(button).backgroundColor, fromSet: button.classList.contains('from-set'), title: button.title } : null;
  },
};
