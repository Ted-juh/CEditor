// documentIconSources.js — the icons open panels carry, kept where the renderer looks for them.
//
// A panel shared by someone else, or saved after it arrived that way, carries the icons it uses
// (utils/documentIcons.js). Whatever panels are open, their icons answer alongside the library's;
// close the panel and its icons stop answering. The player does the same for its one panel when it
// loads it (Player.svelte). Wired once, at start-up (main.js).

import { setDocumentIcons } from '../utils/documentIcons.js';
import { panels } from './panels.js';

let wired = false;
export function wireDocumentIcons() {
  if (wired) return;
  wired = true;
  panels.subscribe((list) => {
    setDocumentIcons((list ?? []).flatMap((panel) => (Array.isArray(panel?.icons) ? panel.icons : [])));
  });
}
