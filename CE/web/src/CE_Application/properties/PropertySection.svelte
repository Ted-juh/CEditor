<script>
  import { getContext, setContext, untrack } from 'svelte';
  import { propertyFilter } from '../stores/propertyFilter.js';
  import { sectionCollapse, setCollapsed, registerSectionKey } from '../stores/sectionCollapse.js';

  // `icon` (a lucide-svelte component) gives the header a scannable landmark.
  // `tools` is an inline snippet rendered at the right edge of the header —
  // the W6 slot for a master-enable pill, a tiny picker, or an add button —
  // so a section whose only decision lives in its header needs no body rows.
  //
  // COLLAPSE, AND WHY IT PERSISTS ITSELF NOW.
  //
  // `collapsed` defaults to undefined rather than false, and that distinction is the whole
  // mechanism: undefined means "the caller did not say", which is the case for 249 of the 265
  // PropertySections in the panel. Those used to fall back to throwaway local state, so a section
  // you collapsed sprang open the moment you clicked a different component — SectionRenderer keys
  // the editor on the control id, so the whole editor remounts and local state dies with it. The
  // fix cannot be "wire the store at every call site": that was the standing recommendation for
  // months and got done in two files out of sixty-nine, because it is four lines of ceremony per
  // section and nothing fails when you skip it.
  //
  // So a section with no `collapsed` prop manages its own, keyed by the scope SectionRenderer
  // publishes plus the title. A section that DOES pass `collapsed` keeps the old behaviour
  // untouched, which is what BackgroundEditor and TextEditor already rely on (they persist by
  // hand, with keys that include the control id — a different and deliberate choice).
  //
  // `defaultCollapsed` is for sections that should arrive shut. It only seeds the first visit;
  // once the user has an opinion, the store holds it.
  // `collapseKey` overrides the title in the storage key, for the case where two sections that
  // legitimately share a title render in the same tab. CustomInteractEditor embeds the Behaviors
  // and ValueChannels editors side by side and both call their first section "Definition" — right
  // in each on its own, one collapse state between them once the title is the key.
  let {
    title = '',
    collapseKey = '',
    collapsed = $bindable(undefined),
    defaultCollapsed = false,
    ontoggle = null,
    icon = undefined,
    tools = undefined,
    children,
  } = $props();

  // SectionRenderer publishes this as a getter; see the comment there for why it cannot be a
  // plain string. Read once at init — this component is re-created whenever the scope could have
  // changed, because the editor above it is keyed on tab and control.
  const scopeSource = getContext('propertySectionScope');
  const scope = typeof scopeSource === 'function' ? (scopeSource() ?? '') : (scopeSource ?? '');

  // Whether the CALLER owns collapse is a fact about the call site, not about the current value,
  // so it is read once — `untrack` says that to the compiler as well as to the reader.
  const callerOwnsCollapse = untrack(() => collapsed !== undefined);

  // Derived on `title`, not captured: only one section in the panel has a reactive title today
  // (BackgroundEditor's, which passes `collapsed` itself and so never gets here), but a key
  // silently pinned to a stale title is the kind of thing that would be found much later, by
  // someone wondering why one section stopped remembering.
  let keyName = $derived(collapseKey || title);
  let storeKey = $derived(!callerOwnsCollapse && scope !== '' && keyName !== '' ? `${scope}/${keyName}` : '');
  let selfManaged = $derived(storeKey !== '');

  // Registered so the toolbar's collapse-all knows this section is on screen.
  $effect(() => (storeKey ? registerSectionKey(scope, storeKey) : undefined));

  let isCollapsed = $derived(
    selfManaged ? ($sectionCollapse[storeKey] ?? defaultCollapsed) : collapsed === true
  );

  let filter = $derived(String($propertyFilter ?? '').trim().toLowerCase());
  let filterActive = $derived(filter !== '');
  let titleMatches = $derived(filterActive && title.toLowerCase().includes(filter));

  // Visible-row counter, maintained by child PropertyCells via report(+/-1).
  let visibleCount = $state(0);

  // Shared with descendant cells via a $state proxy so reads stay reactive
  // across the component boundary; an effect mirrors the derived filter state in.
  let shared = $state({ filter: '', titleMatches: false });
  $effect(() => {
    shared.filter = filter;
    shared.titleMatches = titleMatches;
  });
  setContext('propertySection', {
    shared,
    report(delta) { visibleCount += delta; },
  });

  // While filtering, force the grid open so matching rows can show (and report)
  // even if the user had collapsed the section.
  let renderGrid = $derived(!isCollapsed || filterActive);
  // Hide the whole section when a filter matches neither its title nor any row.
  let hideSection = $derived(filterActive && !titleMatches && visibleCount === 0);

  function toggle() {
    const next = !isCollapsed;
    if (selfManaged) setCollapsed(storeKey, next);
    else collapsed = next;
    ontoggle?.(next);
  }
</script>

<div class="property-section" class:filtered-hidden={hideSection}>
  <div class="property-section-header">
    <button class="header-toggle" onclick={toggle} aria-expanded={!isCollapsed}>
      <svg class="chevron" class:collapsed={isCollapsed && !filterActive} width="10" height="10" viewBox="0 0 10 10">
        <path d="M2 3l3 4 3-4" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
      {#if icon}
        {@const Icon = icon}
        <span class="header-icon"><Icon size={12} strokeWidth={2} /></span>
      {/if}
      <span class="header-line"></span>
      <span class="property-section-title">{title}</span>
    </button>
    {#if tools}
      <span class="header-tools">
        {@render tools()}
      </span>
    {/if}
  </div>
  {#if renderGrid}
    <div class="property-grid">
      {@render children()}
    </div>
  {/if}
</div>

<style>
  .property-section {
    border-bottom: 1px solid #2A2A2A;
  }

  .property-section.filtered-hidden {
    display: none;
  }

  .property-section-header {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 0 8px 0 0;
  }

  .property-section-header:hover {
    background: #252525;
  }

  .header-toggle {
    flex: 1;
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 6px 0 6px 8px;
    background: none;
    border: none;
    color: #5B9BD5;
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    cursor: pointer;
    font-family: inherit;
    text-align: left;
  }

  .property-section-header:hover .header-toggle {
    color: #BBB;
  }

  .header-icon {
    flex-shrink: 0;
    display: flex;
    align-items: center;
    opacity: 0.85;
  }

  .header-line {
    flex: 1;
    height: 1px;
    background: #333;
  }

  .header-tools {
    flex-shrink: 0;
    display: flex;
    align-items: center;
    gap: 4px;
  }

  .chevron {
    flex-shrink: 0;
    color: #555;
    transition: transform 0.1s ease;
  }

  .chevron.collapsed {
    transform: rotate(-90deg);
  }

  .property-grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 6px 4px;
    padding: 4px 8px 8px 8px;
  }
</style>
