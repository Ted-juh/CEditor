<script>
  /**
   * The way from a properties section into its dock tab.
   *
   * Goes in a `PropertySection`'s `tools` slot, at the right edge of the header. It carries the
   * same icon the dock tab carries, so the two are one thing rather than two, and clicking it does
   * both halves of the handoff: arm the target, request the tab. `utils/dockOpeners.js` has the
   * reasoning and the registry.
   *
   * Per-icon imports, never the lucide-svelte barrel — treeshake is off in this project and a
   * barrel drags the whole set in. Same rule `DisplayPanel.svelte` states for its tab strip, and
   * the eight icons here are the eight it uses for these tabs.
   */
  import Sparkles from 'lucide-svelte/icons/sparkles';
  import TypeIcon from 'lucide-svelte/icons/type';
  import Boxes from 'lucide-svelte/icons/boxes';
  import MonitorIcon from 'lucide-svelte/icons/monitor';
  import Braces from 'lucide-svelte/icons/braces';
  import LibraryBig from 'lucide-svelte/icons/library-big';
  import Spline from 'lucide-svelte/icons/spline';
  import PencilRuler from 'lucide-svelte/icons/pencil-ruler';

  import { displayTabRequest } from '../stores/displayTab.js';
  import { activateEditorTarget } from '../stores/editorTarget.js';
  import { openerFor, openerTitle } from '../utils/dockOpeners.js';

  const ICONS = {
    effects: Sparkles,
    type: TypeIcon,
    assets: Boxes,
    screen: MonitorIcon,
    api: Braces,
    library: LibraryBig,
    animation: Spline,
    designer: PencilRuler,
  };

  let {
    tab = '',
    controlId = '',
    domain = null,
    /** Named in the tooltip: "Edit this control's effects in the Effects tab". */
    what = '',
    /** Hide the label and show the icon alone, for a header that is already full. */
    compact = false,
    disabled = false,
  } = $props();

  let opener = $derived(openerFor(tab));
  let Icon = $derived(ICONS[tab] ?? null);
  let title = $derived(openerTitle(tab, what));
  // A tab that edits a control needs one; Library does not.
  let blocked = $derived(disabled || !opener || (!!opener.kind && !controlId));

  function open() {
    // No stopPropagation. `PropertySection` puts `tools` in a SIBLING span of its collapse button
    // rather than inside it, so a click here cannot reach the toggle — and calling stopPropagation
    // on a delegated Svelte event broke every later click in the panel when this was measured, with
    // the next button arming a mixture of its own kind and a previous button's control.
    if (blocked) return;
    if (opener.kind) activateEditorTarget(opener.kind, controlId, domain);
    displayTabRequest.set({ tab: opener.tab });
  }
</script>

{#if opener}
  <button
    type="button"
    class="open-in-dock"
    class:compact
    data-open={`${tab}:${controlId}:${domain ?? '-'}`}
    disabled={blocked}
    {title}
    aria-label={title}
    onclick={open}
  >
    {#if Icon}<Icon size={11} aria-hidden="true" />{/if}
    {#if !compact}<span>{opener.label}</span>{/if}
  </button>
{/if}

<style>
  .open-in-dock {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    height: 18px;
    padding: 0 6px;
    border: 1px solid #333B42;
    border-radius: 3px;
    background: #12171A;
    color: #7E8B95;
    font: 600 9px/1 'IBM Plex Sans', system-ui, sans-serif;
    cursor: pointer;
    white-space: nowrap;
  }
  .open-in-dock.compact { padding: 0 4px; }
  .open-in-dock:hover:not(:disabled) { border-color: #0E7C70; background: #0B2320; color: #8FEDE3; }
  .open-in-dock:focus-visible { outline: none; border-color: #5B9BD5; box-shadow: 0 0 0 1px #5B9BD5; }
  .open-in-dock:disabled { opacity: 0.35; cursor: default; }
</style>
