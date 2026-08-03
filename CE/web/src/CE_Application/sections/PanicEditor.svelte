<script>
  import { getSection, updateControlProperty } from '../stores/controls.js';
  import { PANIC_SCOPES, PANIC_SCOPE_LABELS, panicMessages } from '../utils/panicLayout.js';
  import PropertyCell from '../properties/PropertyCell.svelte';
  import PropertySection from '../properties/PropertySection.svelte';
  import PropertyToggle from '../properties/PropertyToggle.svelte';

  let { control = null } = $props();

  let core = $derived(getSection(control, 'Core'));
  let p = $derived(getSection(control, 'Panic'));

  function set(prop, value) {
    if (!core?.id) return;
    updateControlProperty(core.id, `Panic.${prop}`, value);
  }
  function num(v, f = 0) { const n = Number(v); return Number.isFinite(n) ? n : f; }
  function clampInt(v, lo, hi, f) { const n = Math.round(num(v, f)); return n < lo ? lo : n > hi ? hi : n; }

  let count = $derived.by(() => { try { return panicMessages(control).length; } catch { return 0; } });

  function colRgb(v, fb) { const s = String(v ?? fb).replace(/^#/, ''); return `#${s.length >= 6 ? s.slice(-6) : String(fb).slice(-6)}`; }
  function setCol(prop, cur, hex) { const s = String(cur ?? '').replace(/^#/, ''); const al = /^[0-9a-fA-F]{8}$/.test(s) ? s.slice(0, 2) : 'FF'; set(prop, `${al}${hex.replace('#', '').toUpperCase()}`); }
</script>

{#if p}
  <PropertySection title="Panic">
    <PropertyCell label="Label" span={2} hint="Text on the button.">
      <input class="val" type="text" value={p.label ?? 'PANIC'} onchange={(e) => set('label', e.target.value)} />
    </PropertyCell>
    <PropertyCell label="Scope" span={2} hint="Which MIDI channels the panic covers. All 16 is the default.">
      <select class="val" value={p.scope ?? 'all'} onchange={(e) => set('scope', e.target.value)}>
        {#each PANIC_SCOPES as sc (sc)}<option value={sc}>{PANIC_SCOPE_LABELS[sc] ?? sc}</option>{/each}
      </select>
    </PropertyCell>
    {#if String(p.scope ?? 'all') === 'channel'}
      <PropertyCell label="Channel" span={2} hint="The single channel to silence.">
        <input class="val" type="number" min="1" max="16" step="1" value={num(p.channel, 1)} onchange={(e) => set('channel', clampInt(e.target.value, 1, 16, 1))} />
      </PropertyCell>
    {/if}
    <PropertyCell label="Reset CCs" span={1} hint="Also send CC 121 (reset all controllers), which releases a mod wheel or pedal left stuck up.">
      <PropertyToggle value={p.resetControllers !== false} onchange={() => set('resetControllers', !(p.resetControllers !== false))} />
    </PropertyCell>
    <PropertyCell label="Centre bend" span={1} hint="Also recentre pitch bend — a Ribbon glide interrupted mid-slide can leave the synth detuned.">
      <PropertyToggle value={p.centreBend !== false} onchange={() => set('centreBend', !(p.centreBend !== false))} />
    </PropertyCell>
    <PropertyCell label="Stop panel" span={1} hint="Also silence this panel's own note controls — Chord Pad, Arp, Ribbon and Drum Pads — and clear the echoed note display.">
      <PropertyToggle value={p.clearLocal !== false} onchange={() => set('clearLocal', !(p.clearLocal !== false))} />
    </PropertyCell>
    <PropertyCell label="Pressable" span={1} hint="Allow firing it in preview / the player.">
      <PropertyToggle value={p.editable !== false} onchange={() => set('editable', !(p.editable !== false))} />
    </PropertyCell>
    <PropertyCell label="" span={4} hint="Sound-off is sent before notes-off, so long release tails are cut too.">
      <div class="note">Sends {count} message{count === 1 ? '' : 's'} on the 'mainSynth' role</div>
    </PropertyCell>
  </PropertySection>

  <PropertySection title="Appearance">
    <PropertyCell label="Summary" span={1} hint="Show the second line saying what pressing it will do.">
      <PropertyToggle value={p.showSummary !== false} onchange={() => set('showSummary', !(p.showSummary !== false))} />
    </PropertyCell>
    <PropertyCell label="Face" span={1} hint="Button fill.">
      <input class="cswatch" type="color" value={colRgb(p.faceColour, 'FF2A1416')} onchange={(e) => setCol('faceColour', p.faceColour, e.target.value)} />
    </PropertyCell>
    <PropertyCell label="Border" span={1} hint="Button outline.">
      <input class="cswatch" type="color" value={colRgb(p.borderColour, 'FFE05C5C')} onchange={(e) => setCol('borderColour', p.borderColour, e.target.value)} />
    </PropertyCell>
    <PropertyCell label="Label" span={1} hint="Label colour.">
      <input class="cswatch" type="color" value={colRgb(p.labelColour, 'FFF2C94C')} onchange={(e) => setCol('labelColour', p.labelColour, e.target.value)} />
    </PropertyCell>
    <PropertyCell label="Flash" span={2} hint="The colour it flashes when fired.">
      <input class="cswatch" type="color" value={colRgb(p.flashColour, 'FFE05C5C')} onchange={(e) => setCol('flashColour', p.flashColour, e.target.value)} />
    </PropertyCell>
  </PropertySection>
{/if}

<style>
  .val { width: 100%; box-sizing: border-box; background: #1A1A1A; border: 1px solid #333; color: #DDD; border-radius: 4px; padding: 3px 6px; font-size: 12px; outline: none; }
  .val:focus { border-color: #5B9BD5; }
  .cswatch { width: 100%; height: 26px; padding: 0; border: 1px solid #333; border-radius: 4px; background: #1A1A1A; cursor: pointer; }
  .note { font-size: 11px; color: #8a8a94; }
</style>
