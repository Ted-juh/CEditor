<script>
  // Structured condition editor shared by Links and Hit Zones. Reads/writes a
  // plain condition string (e.g. `mode == 'A' && level > 3`) so storage stays
  // unchanged, but presents it as channel · operator · value rows with an
  // AND/OR join. Mixed or unparseable expressions fall back to a raw-text
  // "advanced" escape hatch so no expression is ever locked out of editing.

  let {
    value = '',
    channels = [],
    onChange = () => {},
    placeholder = "always runs",
  } = $props();

  const OPERATORS = [
    { value: '==', label: 'is' },
    { value: '!=', label: 'is not' },
    { value: '>', label: '>' },
    { value: '>=', label: '≥' },
    { value: '<', label: '<' },
    { value: '<=', label: '≤' },
  ];

  const CLAUSE_RE = /^([A-Za-z_$][\w$]*)\s*(===|!==|==|!=|>=|<=|>|<)\s*['"]?([^'"]*)['"]?$/;

  function normalizeOp(op) {
    if (op === '===') return '==';
    if (op === '!==') return '!=';
    return op;
  }

  function quote(raw) {
    const s = String(raw ?? '');
    if (s === '') return "''";
    if (/^-?\d+(\.\d+)?$/.test(s) || s === 'true' || s === 'false') return s;
    return `'${s}'`;
  }

  function parse(text) {
    const t = String(text ?? '').trim();
    if (!t) return { mode: 'visual', join: 'and', clauses: [] };
    const hasOr = t.includes('||');
    const hasAnd = t.includes('&&');
    if (hasOr && hasAnd) return { mode: 'advanced' };
    const join = hasOr ? 'or' : 'and';
    const parts = t.split(hasOr ? '||' : '&&').map((p) => p.trim()).filter(Boolean);
    const clauses = [];
    for (const part of parts) {
      const m = part.match(CLAUSE_RE);
      if (!m) return { mode: 'advanced' };
      clauses.push({ channel: m[1], operator: normalizeOp(m[2]), value: m[3] });
    }
    return { mode: 'visual', join, clauses };
  }

  function serialize(join, clauses) {
    const sep = join === 'or' ? ' || ' : ' && ';
    return clauses
      .filter((c) => String(c.channel ?? '').trim())
      .map((c) => `${c.channel} ${c.operator} ${quote(c.value)}`)
      .join(sep);
  }

  let join = $state('and');
  let clauses = $state([]);
  let advanced = $state(false);
  let raw = $state('');
  let lastEmitted = $state(null);

  // Re-sync from the incoming value only when it is an external change (not the
  // echo of our own emit), so live edits are never clobbered mid-keystroke.
  $effect(() => {
    const incoming = String(value ?? '');
    if (incoming === lastEmitted) return;
    const parsed = parse(incoming);
    if (parsed.mode === 'advanced') {
      advanced = true;
      raw = incoming;
    } else {
      advanced = false;
      join = parsed.join;
      clauses = parsed.clauses;
    }
    raw = incoming;
  });

  function emit(next) {
    lastEmitted = next;
    onChange(next);
  }

  function emitVisual() {
    emit(serialize(join, clauses));
  }

  function setJoin(next) {
    join = next;
    emitVisual();
  }

  function updateClause(index, field, fieldValue) {
    clauses = clauses.map((c, i) => (i === index ? { ...c, [field]: fieldValue } : c));
    emitVisual();
  }

  function addClause() {
    const channel = channels[0] ?? '';
    clauses = [...clauses, { channel, operator: '==', value: '' }];
    emitVisual();
  }

  function removeClause(index) {
    clauses = clauses.filter((_, i) => i !== index);
    emitVisual();
  }

  function commitRaw(text) {
    raw = text;
    emit(text);
  }

  function enterAdvanced() {
    raw = serialize(join, clauses);
    advanced = true;
  }

  function exitAdvanced() {
    const parsed = parse(raw);
    if (parsed.mode === 'advanced') return; // still not parseable; stay in raw mode
    join = parsed.join;
    clauses = parsed.clauses;
    advanced = false;
  }
</script>

<div class="cond">
  {#if advanced}
    <div class="cond-advanced">
      <input
        class="val code"
        type="text"
        value={raw}
        placeholder="mode == 'A' && level > 3"
        onchange={(event) => commitRaw(event.target.value)}
      />
      <button type="button" class="cond-mini" title="Switch back to the visual builder" onclick={exitAdvanced}>Visual</button>
    </div>
    <div class="cond-hint">Free-form expression. Combine clauses with &amp;&amp; (all) or || (any).</div>
  {:else}
    {#if clauses.length === 0}
      <div class="cond-empty">
        <span>No condition — {placeholder}.</span>
        <button type="button" class="cond-mini" onclick={addClause}>+ Add condition</button>
      </div>
    {:else}
      {#if clauses.length > 1}
        <div class="cond-join" role="radiogroup" aria-label="Match mode">
          <button type="button" class:active={join === 'and'} aria-pressed={join === 'and'} onclick={() => setJoin('and')}>Match all</button>
          <button type="button" class:active={join === 'or'} aria-pressed={join === 'or'} onclick={() => setJoin('or')}>Match any</button>
        </div>
      {/if}
      {#each clauses as clause, index (index)}
        <div class="cond-row">
          <input
            class="val cond-channel"
            type="text"
            list="condition-channels"
            value={clause.channel}
            placeholder="channel"
            onchange={(event) => updateClause(index, 'channel', event.target.value)}
          />
          <select class="val cond-op" value={clause.operator} onchange={(event) => updateClause(index, 'operator', event.target.value)}>
            {#each OPERATORS as op}
              <option value={op.value}>{op.label}</option>
            {/each}
          </select>
          <input
            class="val cond-value"
            type="text"
            value={clause.value}
            placeholder="value"
            onchange={(event) => updateClause(index, 'value', event.target.value)}
          />
          <button type="button" class="cond-remove" title="Remove clause" aria-label="Remove clause" onclick={() => removeClause(index)}>&times;</button>
        </div>
      {/each}
      <div class="cond-actions">
        <button type="button" class="cond-mini" onclick={addClause}>+ Add condition</button>
        <button type="button" class="cond-mini ghost" title="Edit as a raw expression" onclick={enterAdvanced}>Advanced</button>
      </div>
    {/if}
    <datalist id="condition-channels">
      {#each channels as name}
        <option value={name}></option>
      {/each}
    </datalist>
  {/if}
</div>

<style>
  .cond { display: flex; flex-direction: column; gap: 5px; width: 100%; min-width: 0; }
  .val { box-sizing: border-box; width: 100%; min-width: 0; height: var(--pp-field-height, 26px); padding: var(--pp-field-padding, 0 6px); background: var(--pp-field-bg, #1A1A1A); border: 1px solid var(--pp-field-border, #333); border-radius: var(--pp-field-radius, 3px); color: var(--pp-field-fg, #DDD); font-size: var(--pp-field-font, 11px); font-family: inherit; outline: none; }
  .val.code { font-family: Consolas, 'Courier New', monospace; }
  .val:focus { border-color: var(--pp-field-focus, #5B9BD5); }
  .cond-row { display: grid; grid-template-columns: minmax(0, 1.1fr) minmax(56px, 0.6fr) minmax(0, 1fr) auto; gap: 4px; align-items: center; }
  .cond-op { cursor: pointer; }
  .cond-remove { background: #252525; border: 1px solid #3B3B3B; border-radius: 3px; color: #C8C8C8; font-size: 13px; line-height: 1; width: 22px; height: 24px; cursor: pointer; padding: 0; }
  .cond-remove:hover { border-color: #D56B6B; color: #FFF; }
  .cond-join { display: inline-flex; gap: 0; border: 1px solid #333; border-radius: 3px; overflow: hidden; width: fit-content; }
  .cond-join button { background: #1C1C1C; border: none; color: #999; font-size: 10px; padding: 3px 9px; cursor: pointer; font-family: inherit; }
  .cond-join button.active { background: #2E4A66; color: #FFF; }
  .cond-actions { display: flex; gap: 6px; }
  .cond-mini { background: #252525; border: 1px solid #3B3B3B; border-radius: 3px; color: #CCC; font-size: 10px; padding: 3px 8px; cursor: pointer; font-family: inherit; }
  .cond-mini:hover { border-color: #5B9BD5; color: #FFF; }
  .cond-mini.ghost { color: #888; }
  .cond-empty { display: flex; align-items: center; justify-content: space-between; gap: 8px; color: #777; font-size: 11px; }
  .cond-advanced { display: flex; gap: 4px; align-items: center; }
  .cond-hint { color: #777; font-size: 10px; line-height: 1.3; }
</style>
