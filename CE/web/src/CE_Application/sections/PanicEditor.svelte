<script>
  import { getSection, updateControlProperty } from '../stores/controls.js';
  import { PANIC_SCOPES, PANIC_SCOPE_LABELS, panicMessages } from '../utils/panicLayout.js';
  import PropertyCell from '../properties/PropertyCell.svelte';
  import PropertySection from '../properties/PropertySection.svelte';
  import PropertyToggle from '../properties/PropertyToggle.svelte';
  import SwatchCluster from '../properties/SwatchCluster.svelte';
  import NumberCell from '../properties/NumberCell.svelte';
  import Siren from 'lucide-svelte/icons/siren';
  import Palette from 'lucide-svelte/icons/palette';

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
</script>

{#if p}
  <PropertySection title="Panic" icon={Siren}>
    <PropertyCell label="Label" span={2} hint="Text on the button.">
      <input class="val" type="text" value={p.label ?? 'PANIC'} onchange={(e) => set('label', e.target.value)} />
    </PropertyCell>
    <PropertyCell label="Scope" span={2} hint="Which MIDI channels the panic covers. All 16 is the default.">
      <select class="val" value={p.scope ?? 'all'} onchange={(e) => set('scope', e.target.value)}>
        {#each PANIC_SCOPES as sc (sc)}<option value={sc}>{PANIC_SCOPE_LABELS[sc] ?? sc}</option>{/each}
      </select>
    </PropertyCell>
    {#if String(p.scope ?? 'all') === 'channel'}
      <PropertyCell label="Channel" span={2} compact hint="The single channel to silence.">
        <NumberCell label="Ch" min={1} max={16} step={1} value={num(p.channel, 1)} defaultValue={1} onchange={(v) => set('channel', clampInt(v, 1, 16, 1))} />
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

  <PropertySection title="Appearance" icon={Palette}>
    <PropertyCell label="Summary" span={4} hint="Show the second line saying what pressing it will do.">
      <PropertyToggle value={p.showSummary !== false} onchange={() => set('showSummary', !(p.showSummary !== false))} />
    </PropertyCell>
    <PropertyCell label="Colours" span={4} hint="Button fill, outline, label, and the flash when fired. Click a swatch to edit it in the Colors tab.">
      <SwatchCluster swatches={[
        { key: 'faceColour', label: 'Face', value: p.faceColour ?? 'FF2A1416', target: { type: 'control', controlId: core?.id, path: 'Panic.faceColour' } },
        { key: 'borderColour', label: 'Border', value: p.borderColour ?? 'FFE05C5C', target: { type: 'control', controlId: core?.id, path: 'Panic.borderColour' } },
        { key: 'labelColour', label: 'Label', value: p.labelColour ?? 'FFF2C94C', target: { type: 'control', controlId: core?.id, path: 'Panic.labelColour' } },
        { key: 'flashColour', label: 'Flash', value: p.flashColour ?? 'FFE05C5C', target: { type: 'control', controlId: core?.id, path: 'Panic.flashColour' } },
      ]} />
    </PropertyCell>
  </PropertySection>
{/if}

<style>
  .val { width: 100%; box-sizing: border-box; background: #1A1A1A; border: 1px solid #333; color: #DDD; border-radius: 4px; padding: 3px 6px; font-size: 12px; outline: none; }
  .val:focus { border-color: #5B9BD5; }
  .note { font-size: 11px; color: #8a8a94; }
</style>
