// ce.osc — Open Sound Control for scripts: the part that is the same in every runtime. The port, the
// reading and writing of OSC and the user's yes for the network live once, in C++ (Osc/OscService);
// this file checks a script's call, works out the types of what it sends, and hands each message
// that arrives to the functions whose pattern matches its address. The JavaScript prelude runs this
// file itself (tools/scripts/gen-osc-prelude.mjs); the Lua and Python preludes are ports held to the
// same answers by test/oscParity.test.js.
//
// Design record: docs/design/ce-osc-module.md.
//
// The host: `{ say(level, text), query(op, fields) -> answer, listeners() -> list, call(fn, value) }`.
// `query` asks the transport (listen, stop, status, target, send, bundle); its answer is
// { ok, error?, why?, ... }. `listeners` is the running script's own list of { id, pattern, fn }, so a
// script's patterns go when it reloads.

const PORT_MIN = 1024;
const PORT_MAX = 65535;
const TAGS = 'ihfdsSTFNIbrmtc';

function present(v) {
  return v !== undefined && v !== null;
}

function opt(opts, key) {
  return opts && typeof opts === 'object' && !Array.isArray(opts) ? opts[key] : undefined;
}

function whole(v) {
  return typeof v === 'number' && Number.isFinite(v) && Math.floor(v) === v;
}

function isBytes(v, count) {
  if (!Array.isArray(v) || (count >= 0 && v.length !== count)) return false;
  for (const b of v) if (!whole(b) || b < 0 || b > 255) return false;
  return true;
}

/** Whether `tag` can carry `v` (OscCodec.h's fits, in the same words). */
function fits(tag, v) {
  const number = typeof v === 'number' && Number.isFinite(v);
  if (tag === 'i') return whole(v) && v >= -2147483648 && v <= 2147483647;
  if (tag === 'h') return whole(v);
  if (tag === 'f' || tag === 'd' || tag === 't') return number;
  if (tag === 's' || tag === 'S') return typeof v === 'string';
  if (tag === 'c') return typeof v === 'string' && v !== '';
  if (tag === 'b') return isBytes(v, -1);
  if (tag === 'm') return isBytes(v, 4);
  if (tag === 'r') return typeof v === 'string' && /^#([0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(v);
  return TAGS.includes(tag) && tag !== '';
}

const WHAT = {
  i: 'a whole number', h: 'a whole number', f: 'a number', d: 'a number', t: 'a number', s: 'text', S: 'text',
  c: 'one character of text', b: 'a list of bytes', m: 'a list of four bytes', r: 'a colour such as "#FF8000"',
};

/** One part of an address against one part of a pattern: * ? [a-z] [!a] {one,two}. */
function partMatches(p, pi, s, si) {
  while (pi < p.length) {
    const c = p[pi];
    if (c === '*') {
      for (let k = s.length; k >= si; k -= 1) if (partMatches(p, pi + 1, s, k)) return true;
      return false;
    }
    if (c === '?') {
      if (si >= s.length) return false;
      pi += 1; si += 1;
      continue;
    }
    if (c === '[') {
      const close = p.indexOf(']', pi + 1);
      if (close < 0 || si >= s.length) return false;
      let set = p.slice(pi + 1, close);
      const negate = set.startsWith('!');
      if (negate) set = set.slice(1);
      let found = false;
      for (let k = 0; k < set.length; k += 1) {
        if (k + 2 < set.length && set[k + 1] === '-') {
          if (s[si] >= set[k] && s[si] <= set[k + 2]) found = true;
          k += 2;
        } else if (s[si] === set[k]) found = true;
      }
      if (found === negate) return false;
      pi = close + 1; si += 1;
      continue;
    }
    if (c === '{') {
      const close = p.indexOf('}', pi + 1);
      if (close < 0) return false;
      for (const alt of p.slice(pi + 1, close).split(',')) {
        if (s.startsWith(alt, si) && partMatches(p, close + 1, s, si + alt.length)) return true;
      }
      return false;
    }
    if (si >= s.length || s[si] !== c) return false;
    pi += 1; si += 1;
  }
  return si === s.length;
}

/** Whether an OSC address matches a pattern, part by part between the slashes. */
export function oscMatches(pattern, address) {
  if (typeof pattern !== 'string' || typeof address !== 'string') return false;
  const p = pattern.split('/');
  const a = address.split('/');
  if (p.length !== a.length) return false;
  for (let i = 0; i < p.length; i += 1) if (!partMatches(p[i], 0, a[i], 0)) return false;
  return true;
}

export function oscCommands(host) {
  const say = (level, text) => host.say(level, text);
  let nextId = 1;

  /** The transport's answer: true, or false having said why. */
  function answered(verb, answer, what) {
    if (answer === true || (answer && typeof answer === 'object' && answer.ok === true)) return true;
    const why = answer && typeof answer.why === 'string' && answer.why !== '' ? answer.why : 'OSC is not available here';
    say('error', `ce.osc.${verb}: ${why}, so ${what}.`);
    return false;
  }

  /** `to` as the transport takes it: a target's name or "host:port", or { host, port }. */
  function destination(verb, to) {
    if (typeof to === 'string' && to.trim() !== '') return to.trim();
    if (to && typeof to === 'object' && !Array.isArray(to) && typeof to.host === 'string' && whole(to.port)) {
      return { host: to.host, port: to.port };
    }
    say('error', `ce.osc.${verb}: to must be a target's name, "host:port", or a message's from, so nothing was sent.`);
    return null;
  }

  /** A message's values and their types, worked out and checked; null having said why. */
  function message(verb, address, args, types, which) {
    const where = which ? `message ${which}: ` : '';
    if (typeof address !== 'string' || !address.startsWith('/')) {
      say('error', `ce.osc.${verb}: ${where}address must be text starting with /, such as "/fader/1", so nothing was sent.`);
      return null;
    }
    const values = !present(args) ? [] : (Array.isArray(args) ? args : [args]);
    let tags = '';
    if (present(types)) {
      if (typeof types !== 'string' || types.length !== values.length || [...types].some((t) => !TAGS.includes(t))) {
        say('error', `ce.osc.${verb}: ${where}types must be text with one OSC type for each value, such as "if", so nothing was sent.`);
        return null;
      }
      tags = types;
    } else {
      for (let i = 0; i < values.length; i += 1) {
        const v = values[i];
        if (typeof v === 'number') tags += 'f';
        else if (typeof v === 'string') tags += 's';
        else if (typeof v === 'boolean') tags += v ? 'T' : 'F';
        else if (v === null || v === undefined) tags += 'N';
        else if (isBytes(v, -1)) tags += 'b';
        else {
          say('error', `ce.osc.${verb}: ${where}value ${i + 1} is not a number, text, true or false, or a list of bytes, so nothing was sent.`);
          return null;
        }
      }
    }
    for (let i = 0; i < values.length; i += 1) {
      if (!fits(tags[i], values[i])) {
        say('error', `ce.osc.${verb}: ${where}value ${i + 1} is not ${WHAT[tags[i]] ?? 'what its type needs'}, as type "${tags[i]}" needs, so nothing was sent.`);
        return null;
      }
    }
    return { address, args: values.map((v) => (v === undefined ? null : v)), types: tags };
  }

  function listen(opts) {
    const port = present(opt(opts, 'port')) ? opt(opts, 'port') : 8000;
    if (!whole(port) || port < PORT_MIN || port > PORT_MAX) {
      say('error', `ce.osc.listen: port must be a whole number from ${PORT_MIN} to ${PORT_MAX}, so it is not listening.`);
      return false;
    }
    const network = opt(opts, 'network') === true;
    const nextFree = opt(opts, 'nextFree') === true;
    return answered('listen', host.query('listen', { port, network, nextFree }), 'it is not listening');
  }

  function stop() {
    return host.query('stop', {}) === true;
  }

  function on(pattern, fn) {
    if (typeof pattern !== 'string' || !pattern.startsWith('/')) {
      say('error', 'ce.osc.on: pattern must be an address starting with /, such as "/fader/*", so nothing will run.');
      return undefined;
    }
    if (typeof fn !== 'function') {
      say('error', 'ce.osc.on: fn must be a function to call with each message, so nothing will run.');
      return undefined;
    }
    const id = nextId;
    nextId += 1;
    host.listeners().push({ id, pattern, fn });
    return id;
  }

  function off(id) {
    const list = host.listeners();
    for (let i = 0; i < list.length; i += 1) {
      if (list[i].id === id) { list.splice(i, 1); return true; }
    }
    return false;
  }

  function target(name, address) {
    if (typeof name !== 'string' || name === '') {
      say('error', 'ce.osc.target: name must be text, such as "tablet", so nothing was set.');
      return false;
    }
    if (!present(address)) return answered('target', host.query('target', { name, host: '', port: 0 }), 'nothing was set');
    let where = null;
    if (typeof address === 'string') {
      const at = address.lastIndexOf(':');
      const port = Number(address.slice(at + 1));
      if (at > 0 && whole(port) && port >= 1 && port <= PORT_MAX) where = { host: address.slice(0, at).trim(), port };
    } else if (address && typeof address === 'object' && typeof address.host === 'string' && whole(address.port)
      && address.port >= 1 && address.port <= PORT_MAX) {
      where = { host: address.host, port: address.port };
    }
    if (!where || where.host === '') {
      say('error', 'ce.osc.target: address must be "host:port", { host, port } or a message\'s from, so nothing was set.');
      return false;
    }
    return answered('target', host.query('target', { name, host: where.host, port: where.port }), 'nothing was set');
  }

  function send(to, address, args, types) {
    const where = destination('send', to);
    if (where === null) return false;
    const m = message('send', address, args, types, 0);
    if (m === null) return false;
    return answered('send', host.query('send', { to: where, address: m.address, args: m.args, types: m.types }), 'nothing was sent');
  }

  function bundle(to, messages, opts) {
    const where = destination('bundle', to);
    if (where === null) return false;
    if (!Array.isArray(messages) || messages.length === 0) {
      say('error', 'ce.osc.bundle: messages must be a list of { address, args, types }, so nothing was sent.');
      return false;
    }
    const out = [];
    for (let i = 0; i < messages.length; i += 1) {
      const x = messages[i];
      const m = message('bundle', x && typeof x === 'object' ? x.address : undefined, x?.args, x?.types, i + 1);
      if (m === null) return false;
      out.push(m);
    }
    const time = opt(opts, 'time');
    if (present(time) && !(typeof time === 'number' && Number.isFinite(time) && time >= 0)) {
      say('error', 'ce.osc.bundle: time must be a number of seconds, so nothing was sent.');
      return false;
    }
    return answered('bundle', host.query('bundle', { to: where, messages: out, time: present(time) ? time : 0 }), 'nothing was sent');
  }

  function status() {
    const s = host.query('status', {});
    return s && typeof s === 'object' && !Array.isArray(s) ? s : { listening: false, waiting: false, received: 0, sent: 0, dropped: 0 };
  }

  /** A message arrived: each of this script's functions whose pattern matches it runs, in order. */
  function receive(msg) {
    if (!msg || typeof msg !== 'object' || typeof msg.address !== 'string') return;
    for (const l of host.listeners().slice()) {
      if (oscMatches(l.pattern, msg.address)) host.call(l.fn, msg);
    }
  }

  return { listen, stop, on, off, target, send, bundle, status, receive };
}
