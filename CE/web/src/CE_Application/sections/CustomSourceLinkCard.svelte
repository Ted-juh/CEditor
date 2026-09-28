<script>
  /**
   * The Source card of a placed custom component: how this copy stands against its library package,
   * and the operations on that link.
   *
   * It replaces a card that compared fingerprints and could only say "edited since source package
   * load" — about nearly every instance on a real panel, because a position is part of the hash.
   * `utils/customComponentSourceLink.js` has the comparison and its reasoning; this file is only the
   * surface. Three rules it keeps:
   *
   *   - Every destructive operation (update over this copy's own edits, reset, detach) takes a second
   *     click that says exactly what will be lost. Nothing is discarded on one press.
   *   - "Update all copies" updates only the copies that can be updated without loss, and names how
   *     many it skipped and why. It never forces.
   *   - Each update is one store write, so one undo step, however many copies it touched.
   */
  import ChevronDown from 'lucide-svelte/icons/chevron-down';
  import ChevronRight from 'lucide-svelte/icons/chevron-right';
  import RefreshCw from 'lucide-svelte/icons/refresh-cw';
  import RotateCcw from 'lucide-svelte/icons/rotate-ccw';
  import Unlink from 'lucide-svelte/icons/unlink';
  import Layers from 'lucide-svelte/icons/layers';
  import { customComponentLibrary } from '../stores/customComponentLibrary.js';
  import { activePanel } from '../stores/panels.js';
  import { applyControlPatch, replaceControlsById } from '../stores/controls.js';
  import { flatControls } from '../utils/containment.js';
  import {
    describeSourceDiff,
    detachCustomComponentPatch,
    diffCustomComponentAgainstSource,
    packageFamily,
    rebaseCustomComponentOnSource,
  } from '../utils/customComponentSourceLink.js';

  let { control = null } = $props();

  let report = $derived(control ? diffCustomComponentAgainstSource(control, $customComponentLibrary ?? []) : null);
  let source = $derived(control?._children?.Designer?.sourcePackage ?? null);
  let controlId = $derived(control?._children?.Core?.id ?? '');

  // The other copies of the same package on this panel, and which of them an update would not hurt.
  let siblings = $derived.by(() => {
    if (!report?.family) return [];
    // Filtered by package before diffing: a diff flattens three controls, and this runs on every
    // panel change while the card is open.
    return flatControls($activePanel?.controls ?? [])
      .filter((entry) => entry?._children?.Core?.controlType === 'CustomComponent'
        && packageFamily(entry._children.Designer?.sourcePackage?.id ?? entry._children.Designer?.packageId) === report.family)
      .map((entry) => ({ control: entry, report: diffCustomComponentAgainstSource(entry, $customComponentLibrary ?? []) }));
  });
  let updatable = $derived(siblings.filter((entry) => entry.report.status === 'update'));
  let blocked = $derived(siblings.filter((entry) => entry.report.status === 'diverged'));
  let selfUpdatable = $derived(updatable.some((entry) => entry.control._children.Core.id === controlId));
  // Only offered from a copy that is itself on the panel — in the component workspace the control is
  // a document, and the panel's copies are not what is being edited.
  let onPanel = $derived(siblings.some((entry) => entry.control._children.Core.id === controlId));

  let open = $state(false);
  let confirming = $state('');
  let status = $state('');

  $effect(() => {
    // A different component, a different question.
    controlId;
    confirming = '';
    status = '';
  });

  const STATUS_LABEL = {
    current: 'Up to date',
    edited: 'Edited on this copy',
    update: 'Update available',
    diverged: 'Library changed · copy edited',
    missing: 'Not in this library',
  };

  function show(value) {
    if (value === undefined) return '—';
    if (value === null) return 'none';
    const text = typeof value === 'string' ? value : JSON.stringify(value);
    if (text.startsWith('data:')) return `${text.slice(0, text.indexOf(',') + 1)}… (${Math.round(text.length / 1024)} KB)`;
    return text.length > 48 ? `${text.slice(0, 47)}…` : text;
  }

  function originLabel(origin) {
    return { library: 'library', local: 'this copy', both: 'both', unknown: '?' }[origin] ?? origin;
  }

  function apply(options = {}) {
    if (!report?.latest || !control) return;
    const result = rebaseCustomComponentOnSource(control, report.latest, { report, ...options });
    confirming = '';
    if (result.refused) { status = result.refused; return; }
    replaceControlsById(new Map([[controlId, result.control]]));
    const parts = [`Now ${report.latest.version}`];
    if (result.carried.length) parts.push(`kept ${result.carried.length} value${result.carried.length === 1 ? '' : 's'}`);
    if (result.dropped.length) parts.push(`dropped ${result.dropped.length} the package no longer publishes`);
    if (result.discarded) parts.push(`discarded ${result.discarded} edit${result.discarded === 1 ? '' : 's'}`);
    status = parts.join(' · ');
  }

  function updateAll() {
    const replacements = new Map();
    for (const entry of updatable) {
      const result = rebaseCustomComponentOnSource(entry.control, entry.report.latest, { report: entry.report });
      if (result.control) replacements.set(entry.control._children.Core.id, result.control);
    }
    replaceControlsById(replacements);
    status = `Updated ${replacements.size} cop${replacements.size === 1 ? 'y' : 'ies'}`
      + (blocked.length ? ` · ${blocked.length} left alone: they have edits of their own` : '');
  }

  function detach() {
    confirming = '';
    applyControlPatch(controlId, detachCustomComponentPatch());
    status = 'Detached — this is now a standalone component';
  }

  function ask(what) {
    confirming = confirming === what ? '' : what;
  }
</script>

{#if source && report}
  <div class="source-card" data-status={report.status}>
    <div class="head">
      <strong>{source.name} {source.version}</strong>
      <b class="pill">{STATUS_LABEL[report.status] ?? report.status}</b>
    </div>
    <span class="line">{describeSourceDiff(report)}</span>

    {#if report.design.length || report.overrides.length}
      <button type="button" class="toggle" onclick={() => { open = !open; }} aria-expanded={open}>
        {#if open}<ChevronDown size={12} />{:else}<ChevronRight size={12} />{/if}
        {report.design.length} design difference{report.design.length === 1 ? '' : 's'} · {report.overrides.length} published value{report.overrides.length === 1 ? '' : 's'}
      </button>
    {/if}

    {#if open}
      <div class="diff">
        {#each report.groups as group (group.group)}
          <div class="group">{group.group}</div>
          {#each group.rows as row (row.path)}
            <div class="row" title={row.path}>
              <span class="what">{row.path.split('.').slice(2).join('.') || row.path.split('.').slice(1).join('.') || row.label}</span>
              <span class="from">{show(row.instance)}</span>
              <span class="arrow">→</span>
              <span class="to">{show(row.source)}</span>
              <i class="origin" data-origin={row.origin}>{originLabel(row.origin)}</i>
            </div>
          {/each}
        {/each}
        {#if report.overrides.length}
          <div class="group">Published values on this copy</div>
          {#each report.overrides as row (row.path)}
            <div class="row" title={row.path}>
              <span class="what">{row.label}</span>
              <span class="from">{show(row.instance)}</span>
              <span class="arrow">{row.carried ? 'kept' : 'dropped'}</span>
              <span class="to">{show(row.source)}</span>
              <i class="origin" data-origin={row.carried ? 'kept' : 'dropped'}>{row.carried ? 'kept' : 'lost'}</i>
            </div>
          {/each}
        {/if}
      </div>
    {/if}

    <div class="actions">
      {#if report.status === 'update'}
        <button type="button" class="act primary" onclick={() => apply()}>
          <RefreshCw size={13} /> Update to {report.latest.version}
        </button>
      {:else if report.status === 'diverged'}
        <button type="button" class="act warn" onclick={() => ask('force')}>
          <RefreshCw size={13} /> Update to {report.latest.version}…
        </button>
      {/if}
      {#if report.latest && report.status !== 'current'}
        <button type="button" class="act" onclick={() => ask('reset')}>
          <RotateCcw size={13} /> Reset to library
        </button>
      {/if}
      {#if onPanel && (updatable.length > 1 || (updatable.length === 1 && !selfUpdatable))}
        <button type="button" class="act" onclick={updateAll} title="Only copies without edits of their own are touched">
          <Layers size={13} /> {selfUpdatable ? `Update ${updatable.length} copies on panel` : `Update ${updatable.length} other cop${updatable.length === 1 ? 'y' : 'ies'}`}
        </button>
      {/if}
      <button type="button" class="act quiet" onclick={() => ask('detach')}>
        <Unlink size={13} /> Detach
      </button>
    </div>

    {#if confirming === 'force'}
      <div class="confirm">
        <span>Updating discards {report.localEdits} design edit{report.localEdits === 1 ? '' : 's'} made on this copy{report.baseKnown ? '' : ' (or that the library made — the version it came from is gone, so it cannot tell)'}. Published values are kept.</span>
        <button type="button" class="act warn" onclick={() => apply({ discardLocalEdits: true })}>Discard and update</button>
      </div>
    {:else if confirming === 'reset'}
      <div class="confirm">
        <span>Returns this copy to library {report.latest?.version} exactly. Keeps position, name, bindings and panel routes; discards {report.overrides.length} published value{report.overrides.length === 1 ? '' : 's'} and {report.localEdits} design edit{report.localEdits === 1 ? '' : 's'}.</span>
        <button type="button" class="act warn" onclick={() => apply({ discardLocalEdits: true, keepOverrides: false })}>Reset</button>
      </div>
    {:else if confirming === 'detach'}
      <div class="confirm">
        <span>The component stays exactly as it is, but stops tracking {source.name}. It will not be offered library updates again.</span>
        <button type="button" class="act warn" onclick={detach}>Detach</button>
      </div>
    {/if}

    {#if status}<small class="status" role="status">{status}</small>{/if}
    <small class="fp" title="Package fingerprint">{source.fingerprint}</small>
  </div>
{/if}

<style>
  .source-card {
    width: 100%;
    box-sizing: border-box;
    display: grid;
    gap: 4px;
    padding: 6px 7px;
    border: 1px solid #2F573E;
    border-radius: 5px;
    background: #141F18;
    color: #A9DCB8;
    font-size: 11px;
    min-width: 0;
  }

  .source-card[data-status='edited'],
  .source-card[data-status='diverged'],
  .source-card[data-status='missing'] {
    border-color: #665234;
    background: #211D15;
    color: #E8C08A;
  }

  .source-card[data-status='update'] {
    border-color: #344E64;
    background: #152029;
    color: #9FC8E4;
  }

  .head {
    display: flex;
    align-items: center;
    gap: 6px;
    min-width: 0;
  }

  .head strong {
    flex: 1;
    min-width: 0;
    color: #F4F7FA;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .pill {
    flex: none;
    padding: 1px 6px;
    border: 1px solid currentColor;
    border-radius: 9px;
    font-size: 10px;
    font-weight: 600;
  }

  .line {
    color: inherit;
    line-height: 1.35;
  }

  .toggle {
    justify-self: start;
    display: flex;
    align-items: center;
    gap: 3px;
    padding: 0;
    border: 0;
    background: none;
    color: #C9D5DD;
    font-size: 10px;
    cursor: pointer;
  }

  .diff {
    display: grid;
    gap: 1px;
    max-height: 220px;
    overflow: auto;
    padding: 4px;
    border: 1px solid #2A3238;
    border-radius: 4px;
    background: #101417;
    color: #C9D5DD;
  }

  .group {
    margin-top: 3px;
    color: #F4F7FA;
    font-weight: 600;
    font-size: 10px;
  }

  .row {
    display: grid;
    grid-template-columns: minmax(0, 1.2fr) minmax(0, 1fr) auto minmax(0, 1fr) auto;
    gap: 4px;
    align-items: center;
    font-size: 10px;
  }

  .row span {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .what { color: #93A6B3; }
  .arrow { color: #6D7C86; }

  .origin {
    font-style: normal;
    font-size: 9px;
    padding: 0 4px;
    border-radius: 3px;
    background: #22303A;
    color: #9FC8E4;
  }

  .origin[data-origin='local'],
  .origin[data-origin='both'],
  .origin[data-origin='unknown'],
  .origin[data-origin='dropped'] {
    background: #3A2F1C;
    color: #E8C08A;
  }

  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    margin-top: 2px;
  }

  .act {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    min-height: 26px;
    padding: 0 8px;
    border: 1px solid #344E64;
    border-radius: 5px;
    background: #17242D;
    color: #D8E8F2;
    font-size: 11px;
    font-weight: 600;
    cursor: pointer;
  }

  .act:hover { background: #20313B; border-color: #466B84; }
  .act.primary { border-color: #3F7A58; background: #1B3325; color: #CFF0DA; }
  .act.warn { border-color: #7A5E34; background: #2E2415; color: #F0D2A4; }
  .act.quiet { border-color: #38434A; background: transparent; color: #A9B6BE; }

  .confirm {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 6px;
    align-items: center;
    padding: 5px 6px;
    border: 1px solid #7A5E34;
    border-radius: 4px;
    background: #1D1811;
    color: #F0D2A4;
    line-height: 1.35;
  }

  .status { color: #F4F7FA; }

  .fp {
    opacity: 0.6;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
</style>
