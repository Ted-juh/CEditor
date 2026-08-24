<script>
  import { getSection, updateControlProperty } from '../stores/controls.js';
  import { constraintModeLabel } from '../utils/constraintLayout.js';
  import PropertyCell from '../properties/PropertyCell.svelte';
  import PropertySection from '../properties/PropertySection.svelte';
  import PropertyToggle from '../properties/PropertyToggle.svelte';
  import SwatchCluster from '../properties/SwatchCluster.svelte';
  import NumberCell from '../properties/NumberCell.svelte';
  import Link from 'lucide-svelte/icons/link';
  import Palette from 'lucide-svelte/icons/palette';
  import SlidersHorizontal from 'lucide-svelte/icons/sliders-horizontal';

  import { componentListWithElement } from '../utils/componentElements.js';
  let { control = null } = $props();

  let core = $derived(getSection(control, 'Core'));
  let cs = $derived(getSection(control, 'Constraint'));
  let members = $derived(Array.isArray(cs?.members) ? cs.members : []);

  function set(prop, value) {
    if (!core?.id) return;
    updateControlProperty(core.id, `Constraint.${prop}`, value);
  }
  function num(v, f = 0) { const n = Number(v); return Number.isFinite(n) ? n : f; }
  function clamp01(n) { return n < 0 ? 0 : n > 1 ? 1 : n; }

  function setMembers(next) { set('members', next); }
  function updateMember(i, key, value) { setMembers(members.map((m, idx) => idx === i ? { ...m, [key]: value } : m)); }
  // Shared with ce.components.constraint.insert() — see componentElements.js.
  function addMember() { setMembers(componentListWithElement('Constraint', 'members', members, cs)); }
  function removeMember(i) { setMembers(members.filter((_, idx) => idx !== i)); }

  const MODE_HINTS = {
    sum: 'Members always total 100% (e.g. oscillator mix). Raise one and the rest shrink to compensate.',
    order: 'Members stay in order, each ≤ the next (e.g. resonance never exceeds cutoff).',
    ratio: 'Members are a locked gang — moving one scales them all, preserving proportions.',
    mirror: 'The first two members are complements (one rises as the other falls).',
    free: 'No rule — members move independently (a plain linked-fader bank).',
  };
  let modeHint = $derived(MODE_HINTS[String(cs?.mode ?? 'sum')] ?? '');
</script>

{#if cs}
  <PropertySection title="Constraint Cell" icon={Link}>
    <PropertyCell label="Rule" span={2} hint={modeHint}>
      <select class="val" value={cs.mode ?? 'sum'} onchange={(e) => set('mode', e.target.value)}>
        <option value="sum">Sum = 100%</option>
        <option value="order">Ordered (a ≤ b ≤ c)</option>
        <option value="ratio">Ratio lock</option>
        <option value="mirror">Mirror (a + b = 1)</option>
        <option value="free">Free (no rule)</option>
      </select>
    </PropertyCell>
    <PropertyCell label="Editable" span={1} hint="Drag the member bars in preview.">
      <PropertyToggle value={cs.editable !== false} onchange={() => set('editable', !(cs.editable !== false))} />
    </PropertyCell>
    <PropertyCell label="Badge" span={1} hint="Show the rule badge on the cell.">
      <PropertyToggle value={cs.showBadge !== false} onchange={() => set('showBadge', !(cs.showBadge !== false))} />
    </PropertyCell>
    {#if String(cs.mode ?? 'sum') === 'order'}
      <PropertyCell label="Min gap" span={1} compact hint="Minimum spacing kept between adjacent members (e.g. keep resonance a little below cutoff).">
        <NumberCell label="Gap" min={0} max={0.9} step={0.02} value={cs.minGap ?? 0} defaultValue={0} onchange={(v) => set('minGap', clamp01(v))} />
      </PropertyCell>
    {/if}
    <PropertyCell label="Values" span={1} hint="Show live per-member values.">
      <PropertyToggle value={cs.showValues !== false} onchange={() => set('showValues', !(cs.showValues !== false))} />
    </PropertyCell>
    <PropertyCell label="" span={3} hint="Bind each member's port in Device Bindings to drive a real parameter." compact>
      <div class="rule">{constraintModeLabel(cs.mode ?? 'sum')} · {members.length} members</div>
    </PropertyCell>
  </PropertySection>

  <PropertySection title="Appearance" icon={Palette}>
    <PropertyCell label="Colours" span={4} hint="Cell background, bar track, link chain + badge, labels. Click a swatch to edit it in the Colors tab.">
      <SwatchCluster swatches={[
        { key: 'fieldColour', label: 'Field', value: cs.fieldColour ?? 'FF0E0E13', target: { type: 'control', controlId: core?.id, path: 'Constraint.fieldColour' } },
        { key: 'trackColour', label: 'Track', value: cs.trackColour ?? 'FFFFFFFF', target: { type: 'control', controlId: core?.id, path: 'Constraint.trackColour' } },
        { key: 'linkColour', label: 'Link', value: cs.linkColour ?? 'FFF2C94C', target: { type: 'control', controlId: core?.id, path: 'Constraint.linkColour' } },
        { key: 'labelColour', label: 'Labels', value: cs.labelColour ?? 'FFB9B9B9', target: { type: 'control', controlId: core?.id, path: 'Constraint.labelColour' } },
      ]} />
    </PropertyCell>
  </PropertySection>

  <PropertySection title="Members" icon={SlidersHorizontal}>
    {#snippet tools()}
      <button type="button" class="header-add-btn" title="Add member" onclick={addMember}>+ Add</button>
    {/snippet}
    <PropertyCell label="" span={4} hint="The linked parameters, moving together to satisfy the rule. Bind each 'Member' port in Device Bindings." compact>
      <div class="rows">
        {#if members.length === 0}<div class="empty">No members yet. Add one, then bind its port.</div>{/if}
        {#each members as m, i (m.id ?? i)}
          <div class="member">
            <div class="mrow">
              <input class="val name" type="text" value={m.label ?? ''} placeholder="Member" onchange={(e) => updateMember(i, 'label', e.target.value)} />
              <span class="clus">
                <SwatchCluster swatches={[
                  { key: `member-${m.id ?? i}`, label: 'Colour', value: m.colour ?? 'FF39D98A', target: { type: 'callback', apply: (hex) => updateMember(i, 'colour', hex) } },
                ]} />
              </span>
              <label class="fld"><span>Value</span>
                <span class="vnum nc-wrap">
                  <NumberCell min={0} max={1} step={0.05} value={num(m.value, 0.5)} defaultValue={0.5} onchange={(v) => updateMember(i, 'value', clamp01(v))} />
                </span>
              </label>
              <button type="button" class="action-btn danger" onclick={() => removeMember(i)} title="Remove">✕</button>
            </div>
          </div>
        {/each}
      </div>
    </PropertyCell>
  </PropertySection>
{/if}

<style>
  .val { box-sizing: border-box; width: 100%; min-width: 0; height: var(--pp-field-height, 26px); padding: var(--pp-field-padding, 0 6px); background: var(--pp-field-bg, #1A1A1A); border: 1px solid var(--pp-field-border, #333); border-radius: var(--pp-field-radius, 3px); color: var(--pp-field-fg, #DDD); font-size: var(--pp-field-font, 11px); font-family: inherit; outline: none; }
  .val:focus { border-color: var(--pp-field-focus, #5B9BD5); }
  .rule { font-size: 11px; color: #8a8a94; }
  .rows { display: flex; flex-direction: column; gap: 8px; }
  .member { border: 1px solid #303030; border-radius: 6px; background: #171717; padding: 8px; }
  .mrow { display: flex; align-items: flex-end; gap: 8px; }
  .mrow .name { flex: 1 1 auto; }
  .vnum { width: 64px; }
  .nc-wrap { display: flex; }
  .clus { flex: 0 0 44px; display: flex; }
  .fld { display: flex; flex-direction: column; gap: 3px; }
  .fld > span { font-size: 10px; letter-spacing: .04em; text-transform: uppercase; color: #8a8a8a; }
  .empty { border: 1px dashed #3A3A3A; border-radius: 4px; color: #8A8A8A; font-size: 11px; padding: 8px; }
  .action-btn { background: #252525; border: 1px solid #3B3B3B; border-radius: 3px; color: #DDD; font-size: 11px; padding: 4px 8px; cursor: pointer; align-self: flex-start; }
  .action-btn:hover { border-color: #5B9BD5; }
  .action-btn.danger { flex: 0 0 auto; padding: 3px 7px; }
  .action-btn.danger:hover { border-color: #C96A6A; }
  .header-add-btn {
    height: 16px; padding: 0 8px; border-radius: 8px; border: 1px solid #333;
    background: #252525; color: #777; font-size: 9px; font-family: inherit;
    cursor: pointer; line-height: 1;
  }
  .header-add-btn:hover { color: #CCC; border-color: #4A6E8C; }
</style>
