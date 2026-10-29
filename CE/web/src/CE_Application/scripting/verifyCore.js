// ce.verify — asking the synth whether it holds what was sent: the part that is the same in every
// runtime.
//
// Design record: docs/design/ce-verify-module.md. The runtimes give this file a host (panelRuntime.js,
// and the `@module ce.verify` sections of the Lua, JavaScript and Python preludes); everything that
// decides something is here: which dumps hold which parameters, when two values are the same, the
// report, the one line a report becomes. The JavaScript prelude runs this file itself
// (tools/scripts/gen-verify-prelude.mjs); the Lua and Python preludes are ports held to the same
// answers by test/verifyParity.test.js.
//
// The host: `{ say(level, text), parameters(role), layout(role), read(id, role),
// write(id, value, role), sendDump(kind), patchSection(role), connected(role),
// requestDump(kind, fn), after(ms, fn), clock(), emit(report), jobs }`, `jobs` optional.
// `layout(role)` gives the profile's `{ dumps, requests, encodings, gapMs }`: its dumpDefinitions
// and requests as written, each parameter's encoding by id, and the profile's gap between messages.
//
// The read-back is always a dump the synth sent after the check asked for it: requestDump fills the
// panel from it, so what the panel held is read BEFORE each request, never after.

export const VERIFY_WHY = ['notInDump', 'noRequest', 'noReply', 'badChecksum', 'notWritable', 'moved', 'cancelled'];
const WHY_WORDS = {
  notInDump: 'not in a dump', noRequest: 'no request', noReply: 'no reply', badChecksum: 'bad checksum',
  notWritable: 'not writable', moved: 'moved', cancelled: 'cancelled',
};
// The reasons a check could have avoided: a report with one of these is not ok.
const AVOIDABLE = ['noReply', 'badChecksum', 'moved', 'cancelled'];
const MAIN_ROLE = 'mainSynth';
const TEXT_SAMPLE = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ012345';
const NUMBER_TEXT = /^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/;

/* -------------------------------------------------------------------------------- helpers */

function toNumber(v) {
  if (typeof v === 'number') return v;
  if (typeof v === 'string' && NUMBER_TEXT.test(v.trim())) return Number(v.trim());
  return NaN;
}

function opt(opts, key) {
  return opts && typeof opts === 'object' ? opts[key] : undefined;
}

function lower(s) {
  return String(s ?? '').toLowerCase();
}

function contains(list, value) {
  for (const x of list) if (x === value) return true;
  return false;
}

function listOf(v) {
  return Array.isArray(v) ? v : [];
}

function textList(v) {
  if (typeof v === 'string') return v === '' ? [] : [v];
  const out = [];
  for (const x of listOf(v)) if (typeof x === 'string' && x !== '') out.push(x);
  return out;
}

function roleOf(v) {
  return typeof v === 'string' && v !== '' ? v : MAIN_ROLE;
}

function roundHalfAway(x) {
  return x < 0 ? -Math.floor(-x + 0.5) : Math.floor(x + 0.5);
}

function present(v) {
  return v !== undefined && v !== null;
}

/* ----------------------------------------------------------------------- parameter kinds */

/** 'number', 'choice', 'text' or 'action', as ce.patch reads a descriptor. */
function kindOf(desc) {
  const type = String(desc?.type ?? '');
  if (type === 'action' || type === 'momentary' || type === 'trigger') return 'action';
  if (type === 'text') return 'text';
  if (type === 'choice' || type === 'boolean' || type === 'enum' || type === 'bool') return 'choice';
  if (Array.isArray(desc?.choices) && desc.choices.length > 0) return 'choice';
  return 'number';
}

function writable(desc) {
  const access = desc?.access;
  if (typeof access === 'string') return lower(access).indexOf('write') >= 0;
  if (access && typeof access === 'object' && access.canWrite === false) return false;
  return true;
}

function isWhole(desc) {
  return String(desc?.type ?? '') !== 'float';
}

function rangeOf(desc) {
  const range = desc?.range && typeof desc.range === 'object' ? desc.range : {};
  const lo = toNumber(range.min);
  const hi = toNumber(range.max);
  const a = Number.isFinite(lo) ? lo : 0;
  const b = Number.isFinite(hi) ? hi : 127;
  return a <= b ? [a, b] : [b, a];
}

function choicesOf(desc) {
  const out = [];
  for (const c of listOf(desc?.choices)) {
    if (c && typeof c === 'object') {
      if (present(c.id)) out.push(c.id);
      else if (present(c.value)) out.push(c.value);
    } else if (present(c)) {
      out.push(c);
    }
  }
  if (out.length === 0 && (String(desc?.type ?? '') === 'boolean' || String(desc?.type ?? '') === 'bool')) {
    out.push(false);
    out.push(true);
  }
  return out;
}

/** The finest step a float can carry on the wire: 14 bits across its range. */
function floatStep(desc) {
  const [lo, hi] = rangeOf(desc);
  return (hi - lo) / 16383;
}

/**
 * When two values are the same, in the parameter's own units: numbers after rounding to what the
 * wire carries (a whole number, or a float's finest 14-bit step), text without trailing spaces and
 * padding, a choice by its id, an on/off by its state.
 */
export function verifySame(desc, a, b) {
  if (!present(a) || !present(b)) return false;
  if (typeof a === 'boolean' || typeof b === 'boolean') {
    const x = typeof a === 'boolean' ? a : toNumber(a) !== 0;
    const y = typeof b === 'boolean' ? b : toNumber(b) !== 0;
    return x === y;
  }
  const x = toNumber(a);
  const y = toNumber(b);
  if (typeof a === 'number' && typeof b === 'number' && Number.isFinite(x) && Number.isFinite(y)) {
    if (isWhole(desc)) return roundHalfAway(x) === roundHalfAway(y);
    return Math.abs(x - y) <= floatStep(desc) / 2 + 1e-9;
  }
  return String(a).replace(/[\s\u0000]+$/, '') === String(b).replace(/[\s\u0000]+$/, '');
}

/** For a choice: the value the synth gave when the profile does not name it, else nothing. */
function rawOf(desc, got) {
  if (kindOf(desc) !== 'choice' || !present(got) || typeof got === 'boolean') return null;
  const choices = choicesOf(desc);
  if (choices.length === 0) return null;
  for (const c of choices) if (c === got) return null;
  return got;
}

/* ------------------------------------------------------------------------------- layout */

/** How many bytes a mapped value takes in the payload, from its encoding. */
export function verifyByteWidth(encoding) {
  const e = encoding && typeof encoding === 'object' ? encoding : {};
  const type = String(e.type ?? 'u7');
  const length = toNumber(e.length);
  const nibbles = toNumber(e.nibbles);
  if (type === 'text-ascii' || type === 'ascii' || type === 'fixed-ascii') return Number.isFinite(length) && length > 0 ? length : 1;
  if (type === 'text-nibbled-ascii' || type === 'nibbled-ascii' || type === 'packed-nibbled-ascii') {
    if (Number.isFinite(nibbles) && nibbles > 0) return nibbles;
    return Number.isFinite(length) && length > 0 ? length * 2 : 2;
  }
  if (type === 'u14' || type === 'u14-msb-lsb' || type === 'u14-lsb-msb') return 2;
  if (type === 'nibbled') return Number.isFinite(nibbles) && nibbles > 0 ? nibbles : 2;
  return 1;
}

function intOr(v, fallback) {
  const n = toNumber(v);
  return Number.isFinite(n) ? Math.floor(n) : fallback;
}

/**
 * The profile's dumps, as a check reads them: `{ id, name, request, timeoutMs, retries,
 * expectedBytes, layoutBytes, payloadSize, mappings: [{ parameter, offset, size }] }`, in the
 * profile's order. `request` is the request whose answer is the dump, or ''.
 */
export function verifyDumps(layout) {
  const requests = listOf(layout?.requests);
  const encodings = layout?.encodings && typeof layout.encodings === 'object' ? layout.encodings : {};
  const out = [];
  for (const d of listOf(layout?.dumps)) {
    if (!d || typeof d !== 'object' || typeof d.id !== 'string' || d.id === '') continue;
    let request = '';
    let timeoutMs = 2000;
    let retries = 0;
    for (const r of requests) {
      if (!r || typeof r !== 'object') continue;
      const answer = r.response && typeof r.response === 'object' && typeof r.response.dump === 'string' ? r.response.dump
        : (typeof r.expectedDump === 'string' ? r.expectedDump : '');
      if (answer === d.id && typeof r.id === 'string' && r.id !== '') {
        request = r.id;
        timeoutMs = intOr(r.timeoutMs, 2000);
        retries = intOr(r.retries, 0);
        break;
      }
    }
    const matcher = d.matcher && typeof d.matcher === 'object' ? d.matcher : {};
    const prefix = listOf(matcher.prefix).length;
    const suffix = listOf(matcher.suffix).length;
    const payload = d.payload && typeof d.payload === 'object' ? d.payload : {};
    const payloadOffset = intOr(payload.offset, prefix);
    const payloadSize = intOr(payload.size, 0);
    const pack = payload.pack && typeof payload.pack === 'object' ? payload.pack : null;
    let wire = payloadSize;
    if (pack && pack.type === 'packed8to7' && payloadSize > 0) {
      const group = Math.max(1, intOr(pack.groupSize, 7));
      wire = payloadSize + Math.floor((payloadSize + group - 1) / group);
    }
    let end = payloadOffset + wire;
    const checksum = d.checksum && typeof d.checksum === 'object' ? d.checksum : null;
    if (checksum && Number.isFinite(toNumber(checksum.byteOffset))) {
      end = Math.max(end, intOr(checksum.byteOffset, 0) + Math.max(1, intOr(checksum.byteCount, 1)));
    }
    const completion = d.completion && typeof d.completion === 'object' ? d.completion : {};
    const expected = toNumber(completion.expectedBytes);
    const mappings = [];
    for (const m of listOf(d.mappings)) {
      if (!m || typeof m !== 'object' || typeof m.parameter !== 'string') continue;
      const codec = m.codec && typeof m.codec === 'object' ? m.codec : encodings[m.parameter];
      mappings.push({ parameter: m.parameter, offset: intOr(m.offset, 0), size: verifyByteWidth(codec) });
    }
    out.push({
      id: d.id,
      name: typeof d.name === 'string' && d.name !== '' ? d.name : d.id,
      request,
      timeoutMs,
      retries,
      expectedBytes: Number.isFinite(expected) ? Math.floor(expected) : null,
      layoutBytes: end + suffix,
      payloadSize,
      mappings,
    });
  }
  return out;
}

/** The payload byte ranges no parameter reads, as `{ from, to }`, both ends counted. */
export function verifyUnread(dump) {
  const read = [];
  for (let i = 0; i < dump.payloadSize; i += 1) read.push(false);
  for (const m of dump.mappings) {
    for (let i = m.offset; i < m.offset + m.size; i += 1) if (i >= 0 && i < dump.payloadSize) read[i] = true;
  }
  const out = [];
  let from = -1;
  for (let i = 0; i < dump.payloadSize; i += 1) {
    if (!read[i] && from < 0) from = i;
    if (read[i] && from >= 0) {
      out.push({ from, to: i - 1 });
      from = -1;
    }
  }
  if (from >= 0) out.push({ from, to: dump.payloadSize - 1 });
  return out;
}

/** Parameter id -> the first dump that holds it. */
function dumpIndex(dumps) {
  const index = {};
  for (const d of dumps) {
    for (const m of d.mappings) if (!present(index[m.parameter])) index[m.parameter] = d;
  }
  return index;
}

/* ------------------------------------------------------------------------- choosing */

/**
 * The parameters a check is asked about, in the profile's order: `ids`, or a `group`, or every
 * parameter but the actions. An id the profile does not have is left out, with a warning.
 */
export function verifyChoose(params, opts, say, verb) {
  const ids = textList(opt(opts, 'ids'));
  const group = opt(opts, 'group');
  const out = [];
  if (ids.length > 0) {
    const known = {};
    for (const desc of params) known[String(desc.id)] = true;
    for (const id of ids) {
      if (!known[id]) say('warn', `ce.verify.${verb}: "${id}" is not a parameter of the synth, so it was left out.`);
    }
    for (const desc of params) if (contains(ids, String(desc.id))) out.push(desc);
    return out;
  }
  if (typeof group === 'string' && group !== '') {
    for (const desc of params) if (lower(desc.group) === lower(group)) out.push(desc);
    if (out.length === 0) say('warn', `ce.verify.${verb}: the synth has no parameters in the group "${group}".`);
    return out;
  }
  for (const desc of params) if (kindOf(desc) !== 'action') out.push(desc);
  return out;
}

/** coverage(): which of `list` a check can read back, and why not the rest. */
export function verifyCoverage(list, dumps, role) {
  const index = dumpIndex(dumps);
  const unchecked = [];
  const used = [];
  let checkable = 0;
  for (const desc of list) {
    const id = String(desc.id);
    const d = index[id];
    if (!d) unchecked.push({ id, name: String(desc.name ?? id), why: 'notInDump' });
    else if (d.request === '') unchecked.push({ id, name: String(desc.name ?? id), why: 'noRequest' });
    else checkable += 1;
    if (d && !contains(used, d)) used.push(d);
  }
  const out = [];
  for (const d of dumps) {
    if (!contains(used, d)) continue;
    out.push({ kind: d.id, expectedBytes: d.expectedBytes, layoutBytes: d.layoutBytes, unread: verifyUnread(d) });
  }
  return { role, total: list.length, checkable, unchecked, dumps: out };
}

/* ------------------------------------------------------------------------------- reports */

export function verifyIsReport(r) {
  return r !== null && typeof r === 'object' && !Array.isArray(r) && typeof r.kind === 'string'
    && Array.isArray(r.matched) && Array.isArray(r.differed) && Array.isArray(r.unchecked);
}

function shortWhy(report) {
  for (const d of listOf(report.dumps)) {
    if (d && d.status !== 'ok') return `${WHY_WORDS[d.status] ?? String(d.status)}: ${String(d.kind)}`;
  }
  // The reason a check could have avoided first, as it is the one worth acting on; then the
  // commonest, the first of equals.
  const counts = {};
  let best = '';
  let avoidable = '';
  for (const u of report.unchecked) {
    const why = String(u?.why ?? '');
    counts[why] = (counts[why] ?? 0) + 1;
    if (best === '' || counts[why] > counts[best]) best = why;
    if (contains(AVOIDABLE, why) && (avoidable === '' || counts[why] > counts[avoidable])) avoidable = why;
  }
  if (avoidable !== '') best = avoidable;
  return best === '' ? '' : (WHY_WORDS[best] ?? best);
}

/**
 * A report as one line: "1180 of 1222 match, 3 differ, 39 unchecked (no reply: tone3)". With a
 * width, the reason in brackets goes first, then the words are shortened, then the line is cut.
 */
export function verifySummary(report, opts) {
  const total = Number.isFinite(toNumber(report.total)) ? toNumber(report.total) : report.matched.length + report.differed.length + report.unchecked.length;
  const lead = report.cancelled === true ? 'cancelled: ' : '';
  const why = shortWhy(report);
  const base = `${lead}${report.matched.length} of ${total} match, ${report.differed.length} differ, ${report.unchecked.length} unchecked`;
  const full = why === '' ? base : `${base} (${why})`;
  const width = toNumber(opt(opts, 'width'));
  if (!Number.isFinite(width) || width <= 0) return full;
  const w = Math.floor(width);
  if (full.length <= w) return full;
  if (base.length <= w) return base;
  const short = `${report.cancelled === true ? 'cancel ' : ''}${report.matched.length}/${total} ok ${report.differed.length} diff ${report.unchecked.length} unchk`;
  return short.length <= w ? short : short.slice(0, w);
}

/* ------------------------------------------------------------------------------ commands */

export function verifyCommands(host) {
  const say = (level, text) => host.say(level, text);
  // role -> the job running on it. A host may hand in a table every script shares, so a script's
  // Stop button can cancel what another script's Check button started.
  const running = host.jobs && typeof host.jobs === 'object' ? host.jobs : {};

  function finish(job) {
    if (job.finished) return;
    job.finished = true;
    if (running[job.role] === job) delete running[job.role];
    const r = job.report;
    let ok = r.differed.length === 0 && r.cancelled !== true;
    for (const u of r.unchecked) if (contains(AVOIDABLE, u.why)) ok = false;
    for (const d of r.dumps) if (d.status !== 'ok') ok = false;
    r.ok = ok;
    r.ms = Math.max(0, Math.floor(host.clock() - job.start));
    try {
      job.fn(r);
    } catch (e) {
      say('error', `ce.verify.${r.kind}: the function given to it failed: ${String(e && e.message ? e.message : e)}`);
    }
    host.emit(r);
  }

  function newJob(kind, role, fn, total, steps) {
    const job = {
      kind, role, fn, steps, at: 0, finished: false, cancelled: false, step: null, start: host.clock(),
      report: { kind, role, ok: false, total, matched: [], differed: [], unchecked: [], dumps: [], probes: [], ms: 0, cancelled: false },
      onCancel: null,
    };
    running[role] = job;
    return job;
  }

  /** A check that talks to the synth may start: a function to call, the main synth, connected, idle. */
  function mayStart(verb, role, fn) {
    if (typeof fn !== 'function') {
      say('error', `ce.verify.${verb}: fn must be a function to call with the report, so nothing was checked.`);
      return false;
    }
    if (role !== MAIN_ROLE) {
      say('error', `ce.verify.${verb}: only the main synth can be asked for a dump, and "${role}" is not it, so nothing was checked.`);
      return false;
    }
    if (running[role]) return false;
    return host.connected(role) === true;
  }

  /**
   * Ask for one dump and call `done(values)` with what came back, or `done(null)` when nothing did.
   * Only the first answer counts: a refused request still times out later, and a cancelled check
   * hears nothing more.
   */
  function ask(job, dump, done) {
    const step = { settled: false };
    job.step = step;
    const answer = (values, info) => {
      if (step.settled || job.finished) return;
      step.settled = true;
      job.step = null;
      const ok = info && info.ok === true && values && typeof values === 'object';
      done(ok ? values : null);
    };
    const asked = host.requestDump(dump.request, answer);
    if (asked === false) answer(null, { ok: false });
  }

  function later(job, ms, fn) {
    host.after(Math.max(1, Math.floor(ms)), () => {
      if (!job.finished) fn();
    });
  }

  function descriptors(role) {
    const params = host.parameters(role);
    return Array.isArray(params) ? params : [];
  }

  function context(role) {
    const params = descriptors(role);
    const layout = host.layout(role);
    const dumps = verifyDumps(layout);
    const gap = toNumber(layout?.gapMs);
    return { role, params, dumps, index: dumpIndex(dumps), gapMs: Number.isFinite(gap) && gap > 0 ? gap : 0, encodings: layout?.encodings ?? {} };
  }

  function nameOf(desc) {
    return String(desc.name ?? desc.id);
  }

  function leave(job, desc, why) {
    job.report.unchecked.push({ id: String(desc.id), name: nameOf(desc), why });
  }

  function judge(job, desc, expected, got) {
    if (verifySame(desc, expected, got)) {
      job.report.matched.push(String(desc.id));
    } else {
      job.report.differed.push({ id: String(desc.id), name: nameOf(desc), expected: present(expected) ? expected : null, got: present(got) ? got : null, raw: rawOf(desc, got) });
    }
  }

  /**
   * Plan a compare: the parameters by the dump that holds them, in the profile's order, and those
   * no dump can bring back left unchecked with the reason.
   */
  function plan(job, ctx, list) {
    const steps = [];
    for (const d of ctx.dumps) {
      if (d.request === '') continue;
      const held = [];
      for (const desc of list) if (ctx.index[String(desc.id)] === d) held.push(desc);
      if (held.length > 0) steps.push({ dump: d, params: held });
    }
    for (const desc of list) {
      const d = ctx.index[String(desc.id)];
      if (!d) leave(job, desc, 'notInDump');
      else if (d.request === '') leave(job, desc, 'noRequest');
    }
    return steps;
  }

  /** Ask for each step's dump in turn and compare what came back with what the panel held. */
  function compareSteps(job, ctx, steps, before) {
    job.steps = steps;
    job.at = 0;
    job.onCancel = () => {
      for (let i = job.at; i < steps.length; i += 1) for (const desc of steps[i].params) leave(job, desc, 'cancelled');
    };
    const next = () => {
      if (job.at >= steps.length) { finish(job); return; }
      const step = steps[job.at];
      const expected = {};
      for (const desc of step.params) expected[String(desc.id)] = host.read(String(desc.id), ctx.role);
      ask(job, step.dump, (values) => {
        job.at += 1;
        job.report.dumps.push({ kind: step.dump.id, status: values ? 'ok' : 'noReply', expectedBytes: step.dump.expectedBytes });
        for (const desc of step.params) {
          const id = String(desc.id);
          if (!values) leave(job, desc, 'noReply');
          else if (!verifySame(desc, before[id], expected[id]) && (present(before[id]) || present(expected[id]))) leave(job, desc, 'moved');
          else if (!present(values[id])) leave(job, desc, 'noReply');
          else judge(job, desc, expected[id], values[id]);
        }
        if (job.at >= steps.length) finish(job);
        else later(job, ctx.gapMs, next);
      });
    };
    next();
  }

  function snapshot(ctx, list) {
    const out = {};
    for (const desc of list) out[String(desc.id)] = host.read(String(desc.id), ctx.role);
    return out;
  }

  function splitArgs(a, b) {
    return typeof a === 'function' ? { opts: undefined, fn: a } : { opts: a, fn: b };
  }

  function coverage(opts) {
    const ctx = context(roleOf(opt(opts, 'role')));
    return verifyCoverage(verifyChoose(ctx.params, opts, say, 'coverage'), ctx.dumps, ctx.role);
  }

  function check(a, b) {
    const { opts, fn } = splitArgs(a, b);
    const role = roleOf(opt(opts, 'role'));
    if (!mayStart('check', role, fn)) return false;
    const ctx = context(role);
    const list = verifyChoose(ctx.params, opts, say, 'check');
    const job = newJob('check', role, fn, list.length, []);
    compareSteps(job, ctx, plan(job, ctx, list), snapshot(ctx, list));
    return true;
  }

  function dump(kind, a, b) {
    const { opts, fn } = splitArgs(a, b);
    const role = roleOf(opt(opts, 'role'));
    if (typeof kind !== 'string' || kind === '') {
      say('error', 'ce.verify.dump: kind must be the id of a dump in the profile, so nothing was checked.');
      return false;
    }
    if (!mayStart('dump', role, fn)) return false;
    const ctx = context(role);
    let d = null;
    for (const x of ctx.dumps) if (x.id === kind || (x.request !== '' && x.request === kind)) { d = x; break; }
    if (d === null || d.request === '') {
      say('error', `ce.verify.dump: the profile has ${d === null ? 'no dump' : 'no request for the dump'} "${kind}", so nothing was checked.`);
      return false;
    }
    const timesGiven = toNumber(opt(opts, 'times'));
    const times = Number.isFinite(timesGiven) ? Math.min(10, Math.max(2, Math.floor(timesGiven))) : 2;
    const gapGiven = toNumber(opt(opts, 'gapMs'));
    const gapMs = Number.isFinite(gapGiven) && gapGiven >= 0 ? gapGiven : 500;
    const list = [];
    for (const desc of ctx.params) if (ctx.index[String(desc.id)] === d) list.push(desc);
    const job = newJob('dump', role, fn, list.length, []);
    const replies = [];
    let asked = 0;
    job.onCancel = () => {
      for (const desc of list) leave(job, desc, 'cancelled');
    };
    const end = () => {
      if (replies.length < times) {
        for (const desc of list) leave(job, desc, 'noReply');
      } else {
        const first = replies[0];
        const last = replies[replies.length - 1];
        for (const desc of list) {
          const id = String(desc.id);
          if (!present(first[id]) || !present(last[id])) leave(job, desc, 'noReply');
          else judge(job, desc, first[id], last[id]);
        }
      }
      finish(job);
    };
    const next = () => {
      asked += 1;
      ask(job, d, (values) => {
        job.report.dumps.push({ kind: d.id, status: values ? 'ok' : 'noReply', expectedBytes: d.expectedBytes });
        job.at = asked;
        if (!values) { end(); return; }
        replies.push(values);
        if (asked >= times) end();
        else later(job, gapMs, next);
      });
    };
    job.steps = [];
    for (let i = 0; i < times; i += 1) job.steps.push(d);
    next();
    return true;
  }

  function findParam(ctx, id, verb) {
    for (const desc of ctx.params) if (String(desc.id) === id) return desc;
    say('error', `ce.verify.${verb}: "${String(id)}" is not a parameter of the synth, so nothing was checked.`);
    return null;
  }

  function settleOf(opts) {
    const given = toNumber(opt(opts, 'settleMs'));
    return Number.isFinite(given) && given >= 0 ? given : 100;
  }

  /**
   * Write `value`, wait, ask for the dump that holds it, and call `done(got, why)`: what came back,
   * or nothing and the reason it was not read.
   */
  function writeAndRead(job, ctx, desc, value, settleMs, done) {
    const id = String(desc.id);
    const d = ctx.index[id];
    host.write(id, value, ctx.role);
    if (!d) { done(null, 'notInDump'); return; }
    if (d.request === '') { done(null, 'noRequest'); return; }
    later(job, settleMs, () => {
      const now = host.read(id, ctx.role);
      if (present(now) && !verifySame(desc, now, value)) { done(null, 'moved'); return; }
      ask(job, d, (values) => {
        job.report.dumps.push({ kind: d.id, status: values ? 'ok' : 'noReply', expectedBytes: d.expectedBytes });
        if (!values || !present(values[id])) done(null, 'noReply');
        else done(values[id], '');
      });
    });
  }

  function write(id, value, a, b) {
    const { opts, fn } = splitArgs(a, b);
    const role = roleOf(opt(opts, 'role'));
    if (!mayStart('write', role, fn)) return false;
    const ctx = context(role);
    const desc = findParam(ctx, String(id ?? ''), 'write');
    if (desc === null) return false;
    if (!present(value)) {
      say('error', 'ce.verify.write: value must be given, so nothing was checked.');
      return false;
    }
    const job = newJob('write', role, fn, 1, [ctx.index[String(desc.id)]]);
    job.onCancel = () => leave(job, desc, 'cancelled');
    if (!writable(desc)) {
      leave(job, desc, 'notWritable');
      finish(job);
      return true;
    }
    writeAndRead(job, ctx, desc, value, settleOf(opts), (got, why) => {
      job.at = 1;
      if (why !== '') leave(job, desc, why);
      else judge(job, desc, value, got);
      finish(job);
    });
    return true;
  }

  /** The values a probe tries when it is given none. */
  function probeValues(desc, ctx) {
    const kind = kindOf(desc);
    const out = [];
    const add = (v) => {
      for (const x of out) if (x === v) return;
      out.push(v);
    };
    if (kind === 'choice') {
      const choices = choicesOf(desc);
      if (choices.length <= 16) for (const c of choices) add(c);
      else {
        add(choices[0]);
        add(choices[Math.floor(choices.length / 2)]);
        add(choices[choices.length - 1]);
      }
      return out;
    }
    if (kind === 'text') {
      const enc = ctx.encodings && typeof ctx.encodings === 'object' ? ctx.encodings[String(desc.id)] : null;
      const length = toNumber(enc && typeof enc === 'object' ? enc.length : undefined);
      const n = Number.isFinite(length) && length > 0 ? Math.min(TEXT_SAMPLE.length, Math.floor(length)) : 8;
      add(TEXT_SAMPLE.slice(0, n));
      add('');
      return out;
    }
    const [lo, hi] = rangeOf(desc);
    const step = isWhole(desc) ? 1 : (hi - lo) / 100;
    let mid = lo + (hi - lo) / 2;
    if (isWhole(desc)) mid = roundHalfAway(mid);
    for (const v of [lo, lo + step, mid, hi - step, hi]) if (v >= lo && v <= hi) add(v);
    return out;
  }

  function probe(id, a, b) {
    const { opts, fn } = splitArgs(a, b);
    const role = roleOf(opt(opts, 'role'));
    if (!mayStart('probe', role, fn)) return false;
    const ctx = context(role);
    const desc = findParam(ctx, String(id ?? ''), 'probe');
    if (desc === null) return false;
    const given = opt(opts, 'values');
    if (present(given) && (!Array.isArray(given) || given.length === 0)) {
      say('error', 'ce.verify.probe: values must be a list of values to try, so nothing was checked.');
      return false;
    }
    const values = present(given) ? given.slice() : probeValues(desc, ctx);
    const settleMs = settleOf(opts);
    const pid = String(desc.id);
    const old = host.read(pid, role);
    const job = newJob('probe', role, fn, 1, values);
    job.report.restored = false;
    // Nothing is sent that cannot be read back: a probe that learns nothing should change nothing.
    const held = ctx.index[pid];
    const cannot = !writable(desc) ? 'notWritable' : (!held ? 'notInDump' : (held.request === '' ? 'noRequest' : ''));
    if (cannot !== '') {
      leave(job, desc, cannot);
      finish(job);
      return true;
    }
    let failed = false;
    let why = '';
    const restore = (then) => {
      if (!present(old)) { then(); return; }
      writeAndRead(job, ctx, desc, old, settleMs, (got, reason) => {
        job.report.restored = reason === '' && verifySame(desc, old, got);
        then();
      });
    };
    job.onCancel = () => {
      // Put back without waiting: the report goes out now, and the old value follows it.
      if (present(old)) host.write(pid, old, role);
      if (job.report.matched.length === 0 && job.report.differed.length === 0) leave(job, desc, 'cancelled');
    };
    const end = () => {
      if (why !== '') leave(job, desc, why);
      else if (!failed) job.report.matched.push(pid);
      restore(() => finish(job));
    };
    const next = () => {
      if (job.at >= values.length) { end(); return; }
      const value = values[job.at];
      writeAndRead(job, ctx, desc, value, settleMs, (got, reason) => {
        job.at += 1;
        if (reason !== '') { why = reason; end(); return; }
        const same = verifySame(desc, value, got);
        job.report.probes.push({ id: pid, value, got, same });
        if (!same) {
          failed = true;
          job.report.differed.push({ id: pid, name: nameOf(desc), expected: value, got, raw: rawOf(desc, got) });
        }
        next();
      });
    };
    next();
    return true;
  }

  function patch(a, b) {
    const { opts, fn } = splitArgs(a, b);
    const role = roleOf(opt(opts, 'role'));
    const via = opt(opts, 'via');
    if (present(via) && via !== 'dump' && via !== 'parameters') {
      say('error', `ce.verify.patch: via "${String(via)}" is not "dump" or "parameters", so nothing was checked.`);
      return false;
    }
    if (!mayStart('patch', role, fn)) return false;
    const ctx = context(role);
    const list = verifyChoose(ctx.params, opts, say, 'patch');
    const job = newJob('patch', role, fn, list.length, []);
    const chosen = [];
    for (const desc of list) {
      if (writable(desc)) chosen.push(desc);
      else leave(job, desc, 'notWritable');
    }
    const before = snapshot(ctx, chosen);
    const steps = plan(job, ctx, chosen);
    if (opt(opts, 'send') !== false) {
      const section = host.patchSection(role);
      const deliver = section && typeof section === 'object' && typeof section.deliver === 'string' ? section.deliver : '';
      const how = present(via) ? via : (deliver === 'dump' ? 'dump' : 'parameters');
      if (how === 'dump') {
        for (const step of steps) host.sendDump(step.dump.id);
      } else {
        for (const desc of chosen) {
          const v = before[String(desc.id)];
          if (present(v)) host.write(String(desc.id), v, role);
        }
      }
    }
    if (steps.length === 0) {
      finish(job);
      return true;
    }
    later(job, settleOf(opts), () => compareSteps(job, ctx, steps, before));
    return true;
  }

  function summary(report, opts) {
    if (!verifyIsReport(report)) {
      say('error', 'ce.verify.summary: that is not a report, as a check gives them, so there is nothing to say.');
      return undefined;
    }
    return verifySummary(report, opts);
  }

  function runningNow(role) {
    const job = running[roleOf(role)];
    if (!job) return null;
    return { kind: job.kind, role: job.role, done: job.at, total: job.steps.length, ms: Math.max(0, Math.floor(host.clock() - job.start)) };
  }

  function cancel(role) {
    const job = running[roleOf(role)];
    if (!job) return false;
    job.cancelled = true;
    job.report.cancelled = true;
    if (job.step) job.step.settled = true;
    if (job.onCancel) job.onCancel();
    finish(job);
    return true;
  }

  return { coverage, check, dump, write, probe, patch, summary, running: runningNow, cancel };
}
