<script>
  import { getContext } from 'svelte';
  import Link2 from 'lucide-svelte/icons/link-2';
  import { setHint, clearHint } from '../stores/propertyHint.js';
  import { propertyFilter } from '../stores/propertyFilter.js';
  import { colourRoleName } from '../models/controlSetOwnership.js';

  // `hint` is rendered in the panel's Info bar — a fixed 80px box with no
  // scrollbar. Keep it to one sentence saying what the control does, under 120
  // characters. House rules: docs/property-hints.md.
  //
  // `compact` suppresses the label strip for controls that carry their own
  // label inside the well (NumberCell); `label` stays required for the filter
  // and hint plumbing, and the well bottom-aligns with labelled neighbours.
  //
  // `path` names the property the cell edits ('Background.Fill.colour', a part's
  // 'Parts.<name>.…'). Where the control's set can decide that property, the cell says whether
  // it is inherited from the set or an override, as Unity marks a prefab override: a bar in the
  // margin, a bold label, and Revert. A colour drawn from a set colour role names the role.
  // The control's ownership comes from SectionRenderer (models/controlSetOwnership.js).
  let { label = '', span = 1, disabled = false, hint = '', compact = false, path = '', children } = $props();
  const ownershipContext = getContext('ce.setOwnership');
  let mark = $derived.by(() => {
    if (!path || typeof ownershipContext !== 'function') return null;
    const ownership = ownershipContext();
    if (!ownership) return null;
    const key = String(path).replace(/\._children\./g, '.');
    const override = ownership.own.has(key);
    const inherited = ownership.fromSet.has(key);
    const role = ownership.roles.get(key) ?? '';
    if (!override && !inherited && !role) return null;
    const title = override
      ? `Override. Set value: ${describeValue(ownership.setValues.get(key))}. Revert restores it.`
      : (ownership.detached ? '' : `Inherited from ${ownership.setName}.`);
    return { key, override, role: override ? '' : role, title, revert: ownership.revert };
  });

  function describeValue(value) {
    if (value === undefined || value === null || value === '') return 'none';
    if (typeof value === 'boolean') return value ? 'On' : 'Off';
    if (typeof value === 'object') return 'set default';
    return String(value);
  }

  // A PropertyCell inside a PropertySection coordinates filtering through the
  // section's context (shared filter + title-match + a visible-row counter);
  // outside a section it falls back to the raw store.
  const section = getContext('propertySection');
  const filterStore = getContext('propertyFilterStore') ?? propertyFilter;
  let filter = $derived(String($filterStore ?? '').trim().toLowerCase());
  let selfMatch = $derived(`${label} ${hint}`.toLowerCase().includes(filter));
  let visible = $derived(!filter || selfMatch || (section?.shared.titleMatches ?? false));

  // Report this cell's visibility into the section's counter so the section can
  // hide its header when a filter leaves it with no matching rows.
  $effect(() => {
    if (!section || !filter || !visible) return;
    section.report(1);
    return () => section.report(-1);
  });
</script>

<div
  class="property-cell"
  class:span-1={span === 1}
  class:span-2={span === 2}
  class:span-3={span === 3}
  class:span-4={span === 4}
  class:disabled
  class:compact
  class:filtered-out={!visible}
  class:override={mark?.override}
  role="group"
  onmouseenter={() => hint && setHint(hint)}
  onmouseleave={() => hint && clearHint()}
>
  {#if !compact}
    {#if mark}
      <span class="property-label marked" title={mark.title}>
        <span class="label-text">{label}</span>
        {#if mark.role}<span class="role-chip" title={`Linked to the set colour role ${colourRoleName(mark.role)}.`}><Link2 size={9} strokeWidth={2} />{colourRoleName(mark.role)}</span>{/if}
        {#if mark.override}<button type="button" class="revert" title={mark.title} onclick={() => mark.revert(mark.key)}>Revert</button>{/if}
      </span>
    {:else}
      <span class="property-label">{label}</span>
    {/if}
  {/if}
  <div class="property-input">
    {@render children()}
  </div>
</div>

<style>
  .property-cell {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }

  /* span-3 was missing and 44 cells ask for it. With no matching class the cell fell back to
     the grid default of one track, so a three-wide field silently rendered one-wide and the row
     it was supposed to fill kept a ragged hole on the right. Nothing errored, which is why it
     survived: `span={3}` reads as honoured at every call site. */
  .property-cell.span-1 { grid-column: span 1; }
  .property-cell.span-2 { grid-column: span 2; }
  .property-cell.span-3 { grid-column: span 3; }
  .property-cell.span-4 { grid-column: span 4; }
  /* In the two columns of a narrow properties panel (PropertySection), three- and four-wide fields
     take the row; spanning four of two would add columns past the panel's edge. */
  @container properties-tab (max-width: 460px) {
    .property-cell.span-3,
    .property-cell.span-4 { grid-column: 1 / -1; }
  }

  .property-cell.filtered-out { display: none; }

  /* Compact cells bottom-align their well with labelled neighbours in the
     same grid row. */
  .property-cell.compact { justify-content: flex-end; }

  .property-label {
    font-size: 10px;
    color: #5B9BD5;
    text-transform: uppercase;
    letter-spacing: 0.3px;
    line-height: 1.1;
    padding-left: 2px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    user-select: none;
  }

  /* An override: a bar in the margin and a bold label. */
  .property-cell { position: relative; }
  .property-cell.override::before {
    content: '';
    position: absolute;
    left: -5px;
    top: 0;
    bottom: 0;
    width: 2px;
    border-radius: 1px;
    background: #2A8FD6;
  }
  .property-label.marked { display: flex; align-items: center; gap: 6px; }
  .property-label.marked .label-text { overflow: hidden; text-overflow: ellipsis; }
  .property-cell.override .property-label { color: #E9F1F7; font-weight: 700; }
  .role-chip {
    margin-left: auto;
    display: inline-flex;
    align-items: center;
    gap: 3px;
    flex: 0 1 auto;
    min-width: 0;
    overflow: hidden;
    padding: 0 5px;
    border: 1px solid #3A4A56;
    border-radius: 3px;
    color: #9FB6C8;
    font-size: 9.5px;
    font-weight: 600;
    letter-spacing: 0;
    text-transform: none;
  }
  .revert {
    margin-left: auto;
    padding: 0 4px;
    border: 1px solid transparent;
    border-radius: 3px;
    background: none;
    color: #9FB6C8;
    font: inherit;
    font-size: 10px;
    font-weight: 600;
    letter-spacing: 0;
    text-transform: none;
    cursor: pointer;
  }
  .revert:hover, .revert:focus-visible { background: #22384A; border-color: #2A5F86; color: #FFF; outline: none; }

  .property-input {
    min-width: 0;
    display: flex;
  }

  .property-input > :global(*) {
    flex: 1;
    min-width: 0;
  }

  .property-cell.disabled {
    opacity: 0.3;
    pointer-events: none;
  }

  .property-cell.disabled .property-label {
    color: #444;
  }
</style>
