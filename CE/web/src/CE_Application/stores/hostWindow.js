/**
 * hostWindow.js — whether the window a plug-in's page sits in is showing.
 *
 * A plug-in's window is a child of the host's, and Windows tells a child nothing when the host's
 * top-level window is minimised, nor when a host hides its plug-in window: the page stays
 * `visible` and draws at sixty frames a second for nobody (release checks #17, watched from inside
 * the page). The page cannot simply be hidden, because while the window is open it is what drives
 * free-running modulators, panel scripts' timers and automation out to the hardware, and a hidden
 * page gets no frames and runs its timers once a second. So PlayerHost looks, and says
 * (`hostWindow`, { shown }), and the preview stops redrawing what nobody can see while everything
 * else carries on (PanelPreviewSurface's shared frame).
 *
 * True everywhere nothing says otherwise: the editor, a browser, a standalone window.
 */
import { writable } from 'svelte/store';

export const hostWindowShown = writable(true);
