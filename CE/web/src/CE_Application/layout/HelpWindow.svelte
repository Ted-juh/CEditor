<script>
  // HelpWindow — the manual in a native window of its own (help.html → helpWindow.js).
  //
  // The window is the operating system's: it moves, resizes, maximises and goes to another screen
  // the way any window does, which is the point of it. This page is only the viewer plus the one
  // action that belongs here — back into the editor as a tab, on the same document.
  //
  // It opens on the document in its address (`help.html?doc=…&anchor=…`), else the last one shown;
  // while it is open the editor can ask it for another (`documentationRequest`), and it tells the
  // editor where it is through the storage both pages share (utils/documentationStorage.js).

  import { onMount } from 'svelte';
  import PanelTop from 'lucide-svelte/icons/panel-top';
  import DocumentationView from './DocumentationView.svelte';
  import { readLastDocument, rememberDocument } from '../utils/documentationStorage.js';
  import { canOpenDocumentationWindow, dockDocumentationWindow, onDocumentationRequest } from '../bridge/documentationWindow.js';

  const params = new URLSearchParams(typeof location === 'undefined' ? '' : location.search);
  let request = $state({
    doc: params.get('doc') || readLastDocument(),
    anchor: params.get('anchor') || '',
    n: 1,
  });

  onMount(() => onDocumentationRequest((payload) => {
    const doc = String(payload?.doc ?? '');
    const anchor = String(payload?.anchor ?? '');
    // An empty request only brought the window forward; the native side has done that already.
    if (doc || anchor) request = { doc, anchor, n: request.n + 1 };
  }));

  const noteShown = (id) => rememberDocument(id);

  // In a plain browser (the dev server, a test) there is no editor to go back to.
  const placeAction = canOpenDocumentationWindow() ? {
    label: 'Back to the editor',
    title: 'Close this window and show the manual as a tab in the editor again',
    icon: PanelTop,
    run: (position) => dockDocumentationWindow(position),
  } : null;
</script>

<DocumentationView {request} ondocument={noteShown} {placeAction} />
