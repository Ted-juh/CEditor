<script>
  import { getSection, updateControlProperty } from '../stores/controls.js';
  import { constraintModeLabel } from '../utils/constraintLayout.js';
  import PropertyCell from '../properties/PropertyCell.svelte';
  import PropertySection from '../properties/PropertySection.svelte';
  import PropertyToggle from '../properties/PropertyToggle.svelte';

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

  // Accent-colour swatches (preserve alpha).
  function colRgb(v, fb) { const s = String(v ?? fb).replace(/^#/, ''); return `#${s.length >= 6 ? s.slice(-6) : String(fb).slice(-6)}`; }
  function setCol(prop, cur, hex) { const s = String(cur ?? '').replace(/^#/, ''); const a = /^[0-9a-fA-F]{8}$/.test(s) ? s.slice(0, 2) : 'FF'; set(prop, `${a}${hex.replace('#', '').toUpperCase()}`); }
</script>

{#if cs}
  <PropertySection title="Constraint Cell">
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
      <PropertyCell label="Min gap" span={2} hint="Minimum spacing kept between adjacent members (e.g. keep resonance a little below cutoff).">
        <input class="val" type="number" min="0" max="0.9" step="0.02" value={cs.minGap ?? 0} onchange={(e) => set('minGap', clamp01(num(e.target.value, 0)))} />
      </PropertyCell>
    {/if}
    <PropertyCell label="Values" span={1} hint="Show live per-member values.">
      <PropertyToggle value={cs.showValues !== false} onchange={() => set('showValues', !(cs.showValues !== false))} />
    </PropertyCell>
    <PropertyCell label="" span={3} hint="Bind each member's port in Device Bindings to drive a real parameter.">
      <div class="rule">{constraintModeLabel(cs.mode ?? 'sum')} · {members.length} members</div>
    </PropertyCell>
  </PropertySection>

  <PropertySection title="Appearance">
    <PropertyCell label="Field" span={1} hint="Cell background colour.">
      <input class="cswatch" type="color" value={colRgb(cs.fieldColour, 'FF0E0E13')} onchange={(e) => setCol('fieldColour', cs.fieldColour, e.target.value)} />
    </PropertyCell>
    <PropertyCell label="Track" span={1} hint="Empty bar track colour (stays faint — its transparency is kept).">
      <input class="cswatch" type="color" value={colRgb(cs.trackColour, 'FFFFFFFF')} onchange={(e) => setCol('trackColour', cs.trackColour, e.target.value)} />
    </PropertyCell>
    <PropertyCell label="Link" span={1} hint="Link chain + badge colour.">
      <input class="cswatch" type="color" value={colRgb(cs.linkColour, 'FFF2C94C')} onchange={(e) => setCol('linkColour', cs.linkColour, e.target.value)} />
    </PropertyCell>
    <PropertyCell label="Labels" span={1} hint="Label colour.">
      <input class="cswatch" type="color" value={colRgb(cs.labelColour, 'FFB9B9B9')} onchange={(e) => setCol('labelColour', cs.labelColour, e.target.value)} />
    </PropertyCell>
  </PropertySection>

  <PropertySection title="Members">
    <PropertyCell label="" span={4} hint="The linked parameters, moving together to satisfy the rule. Bind each 'Member' port in Device Bindings.">
      <div class="rows">
        {#if members.length === 0}<div class="empty">No members yet. Add one, then bind its port.</div>{/if}
        {#each members as m, i (m.id ?? i)}
          <div class="member">
            <div class="mrow">
              <input class="val name" type="text" value={m.label ?? ''} placeholder="Member" onchange={(e) => updateMember(i, 'label', e.target.value)} />
              <input class="swatch" type="color" value={`#${String(m.colour ?? 'FF39D98A').slice(-6)}`} onchange={(e) => updateMember(i, 'colour', `FF${e.target.value.replace('#', '').toUpperCase()}`)} title="Colour" />
              <label class="fld"><span>Value</span>
                <input class="val vnum" type="number" min="0" max="1" step="0.05" value={num(m.value, 0.5)} onchange={(e) => updateMember(i, 'value', clamp01(num(e.target.value, 0.5)))} />
              </label>
              <button type="button" class="action-btn danger" onclick={() => removeMember(i)} title="Remove">✕</button>
            </div>
          </div>
        {/each}
        <button type="button" class="action-btn" onclick={addMember}>Add member</button>
      </div>
    </PropertyCell>
  </PropertySection>
{/if}

<style>
  .val { width: 100%; box-sizing: border-box; background: #1A1A1A; border: 1px solid #333; color: #DDD; border-radius: 4px; padding: 3px 6px; font-size: 12px; outline: none; }
  .val:focus { border-color: #5B9BD5; }
  .cswatch { width: 100%; height: 26px; padding: 0; border: 1px solid #333; border-radius: 4px; background: #1A1A1A; cursor: pointer; }
  .rule { font-size: 11px; color: #8a8a94; }
  .rows { display: flex; flex-direction: column; gap: 8px; }
  .member { border: 1px solid #303030; border-radius: 6px; background: #171717; padding: 8px; }
  .mrow { display: flex; align-items: flex-end; gap: 8px; }
  .mrow .name { flex: 1 1 auto; }
  .vnum { width: 64px; }
  .swatch { width: 26px; height: 24px; padding: 0; border: 1px solid #333; border-radius: 4px; background: #1A1A1A; cursor: pointer; }
  .fld { display: flex; flex-direction: column; gap: 3px; }
  .fld > span { font-size: 10px; letter-spacing: .04em; text-transform: uppercase; color: #8a8a8a; }
  .empty { border: 1px dashed #3A3A3A; border-radius: 4px; color: #8A8A8A; font-size: 11px; padding: 8px; }
  .action-btn { background: #252525; border: 1px solid #3B3B3B; border-radius: 3px; color: #DDD; font-size: 11px; padding: 4px 8px; cursor: pointer; align-self: flex-start; }
  .action-btn:hover { border-color: #5B9BD5; }
  .action-btn.danger { flex: 0 0 auto; padding: 3px 7px; }
  .action-btn.danger:hover { border-color: #C96A6A; }
</style>
