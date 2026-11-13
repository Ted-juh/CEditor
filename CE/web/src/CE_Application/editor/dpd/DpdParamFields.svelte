<script>
  // The selected parameter's own fields, edited in place on the model (a shared state proxy): its
  // name and group, value type, range and default, the message it is sent with and how it is sent as
  // it moves. A parameter of a repeated block is the block's: an edit applies to every instance.
  // Each field commits on change, not on every keystroke: an edit resolves the whole model again,
  // which on a KRONOS drum kit takes a moment.
  import { EMIT_DEFAULTS } from '../../generated/dpd/emit-legacy-core.mjs';

  // `shapes`: the model's message shapes, for a SysEx wire. `errors`: the validator's, about this one.
  let { param, shapes = [], errors = [] } = $props();

  const TYPES = [['continuous', 'Continuous'], ['signed', 'Signed'], ['enum', 'Choice'], ['toggle', 'Toggle'], ['trigger', 'Trigger'], ['momentary', 'Momentary'], ['text', 'Text']];
  const HEX2 = /^[0-9A-Fa-f]{2} [0-9A-Fa-f]{2}$/;
  const HEX = /^[0-9A-Fa-f]{2}(?: [0-9A-Fa-f]{2})*$/;

  let isEnum = $derived(param.valueType === 'enum');
  let isText = $derived(param.valueType === 'text');
  let write = $derived((param.wires ?? []).find((w) => w.dir === 'write') ?? null);
  // A hand-made Roland model's parameter has no wires: a DT1 to its address.
  let msg = $derived(write?.msg ?? (Array.isArray(param.wires) && !param.wires.length ? 'none' : param.address ? 'dt1' : 'none'));
  let policy = $derived(param.sendPolicy === undefined ? '' : param.sendPolicy === null ? 'none' : param.sendPolicy.mode);
  let shapeIds = $derived([...new Set([...shapes.map((s) => s.id), ...(write?.shape ? [write.shape] : [])])]);

  const int = (v) => { const n = Number.parseInt(String(v).trim(), 10); return Number.isFinite(n) ? n : null; };
  const hex = (v) => String(v).trim().toUpperCase().replace(/\s+/g, ' ');

  function setType(t) {
    param.valueType = t;
    if (t === 'enum') { if (!Array.isArray(param.enum)) param.enum = []; }
    else if (t !== 'text' && !param.range) param.range = { ...EMIT_DEFAULTS.range };
  }
  function setRange(end, v) {
    const n = int(v);
    if (n != null) param.range = { ...(param.range ?? EMIT_DEFAULTS.range), [end]: n };
  }
  function setDefault(v) {
    if (isEnum || isText) param.default = v;
    else { const n = int(v); if (n != null) param.default = n; }
  }
  // The write wire, made if there is none; the proxied one, so what is set on it is seen.
  function writeWire() {
    if (!Array.isArray(param.wires)) param.wires = [];
    if (!param.wires.some((w) => w.dir === 'write')) param.wires.unshift({ dir: 'write' });
    return param.wires.find((w) => w.dir === 'write');
  }
  function setMsg(m) {
    const others = (param.wires ?? []).filter((w) => w.dir !== 'write');
    const next = m === 'cc' ? { dir: 'write', msg: 'cc', cc: write?.cc ?? 0 }
      : m === 'nrpn' || m === 'rpn' ? { dir: 'write', msg: m, [m]: write?.[m] ?? '00 00' }
      : m === 'sysex' ? { dir: 'write', msg: 'sysex', shape: write?.shape ?? shapes[0]?.id }
      : null;
    param.wires = next ? [next, ...others] : others;
  }
  function setCc(v) { const n = int(v); if (n != null && n >= 0 && n <= 127) writeWire().cc = n; }
  function setNumber(v) { const h = hex(v); if (HEX2.test(h)) writeWire()[msg] = h; }
  function setAddress(v) { const h = hex(v); if (HEX.test(h)) param.address = h; }
  function setPolicy(v) {
    if (v === '') delete param.sendPolicy;
    else if (v === 'none') param.sendPolicy = null;
    else param.sendPolicy = EMIT_DEFAULTS.sendPolicy(v === 'onCommit' ? 'enum' : 'continuous');
  }
</script>

<div class="pfields">
  <label for="pf-name">Name</label>
  <input id="pf-name" class="pf-name" value={param.name ?? ''} onchange={(e) => { param.name = e.currentTarget.value; }} />
  <label for="pf-group">Group</label>
  <input id="pf-group" value={param.group ?? ''} onchange={(e) => { param.group = e.currentTarget.value; }} />
  <label for="pf-type">Value type</label>
  <select id="pf-type" class="pf-type" value={param.valueType} onchange={(e) => setType(e.currentTarget.value)}>
    {#each TYPES as [v, label] (v)}<option value={v}>{label}</option>{/each}
  </select>
  {#if !isEnum && !isText}
    <span class="pfl">Range</span>
    <span class="pf-pair">
      <input class="pf-min" type="number" aria-label="Lowest value" value={param.range?.min ?? EMIT_DEFAULTS.range.min} onchange={(e) => setRange('min', e.currentTarget.value)} />
      <span>–</span>
      <input class="pf-max" type="number" aria-label="Highest value" value={param.range?.max ?? EMIT_DEFAULTS.range.max} onchange={(e) => setRange('max', e.currentTarget.value)} />
    </span>
  {/if}
  <label for="pf-default">Default</label>
  {#if isEnum}
    <select id="pf-default" value={param.default ?? param.enum?.[0]?.id ?? ''} onchange={(e) => setDefault(e.currentTarget.value)}>
      {#each param.enum ?? [] as entry (entry.id)}<option value={entry.id}>{entry.label}</option>{/each}
    </select>
  {:else}
    <input id="pf-default" type={isText ? 'text' : 'number'} value={param.default ?? ''} onchange={(e) => setDefault(e.currentTarget.value)} />
  {/if}
  <label for="pf-msg">Sent as</label>
  <select id="pf-msg" class="pf-msg" value={msg} onchange={(e) => setMsg(e.currentTarget.value)}>
    <option value="cc">Control change</option>
    <option value="nrpn">NRPN</option>
    <option value="rpn">RPN</option>
    <option value="sysex">SysEx</option>
    {#if msg === 'dt1'}<option value="dt1">SysEx (DT1)</option>{/if}
    <option value="none">Not sent (read back only)</option>
  </select>
  {#if msg === 'cc'}
    <label for="pf-cc">Controller</label>
    <span class="pf-pair"><input id="pf-cc" class="pf-cc" type="number" min="0" max="127" value={write?.cc ?? 0} onchange={(e) => setCc(e.currentTarget.value)} />{#if write?.lsbCc != null}<span class="pfnote">low 7 bits on CC {write.lsbCc}</span>{/if}</span>
  {:else if msg === 'nrpn' || msg === 'rpn'}
    <label for="pf-num">{msg.toUpperCase()} number</label>
    <input id="pf-num" placeholder="MM LL" value={write?.[msg] ?? ''} onchange={(e) => setNumber(e.currentTarget.value)} />
  {:else if msg === 'sysex' || msg === 'dt1'}
    {#if msg === 'sysex'}
      <label for="pf-shape">Message shape</label>
      <select id="pf-shape" value={write?.shape ?? ''} onchange={(e) => { writeWire().shape = e.currentTarget.value; }}>
        {#each shapeIds as id (id)}<option value={id}>{id}</option>{/each}
      </select>
    {/if}
    <label for="pf-addr">Address</label>
    <input id="pf-addr" class="pf-addr" placeholder="hex bytes" value={param.address ?? ''} onchange={(e) => setAddress(e.currentTarget.value)} />
  {/if}
  <label for="pf-policy">Sent while moving</label>
  <select id="pf-policy" value={policy} onchange={(e) => setPolicy(e.currentTarget.value)}>
    <option value="">The model's default for its type</option>
    <option value="continuous">As it moves</option>
    <option value="onCommit">Once set</option>
    <option value="none">Never</option>
  </select>
</div>
{#if errors.length}
  <div class="perrs">{#each errors as e, i (i)}<div>⚠ {e}</div>{/each}</div>
{/if}
