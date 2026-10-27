// ce.ci — MIDI-CI for scripts: the part that is the same in every runtime. The session that talks to
// the device lives once, in the device layer in C++ (DeviceProfileService::ciCommand, MidiCiSession);
// this file checks a script's call, sends it on, and hands the device's answers to the function the
// script gave. The JavaScript prelude runs this file itself (tools/scripts/gen-ci-prelude.mjs); the
// Lua and Python preludes are ports held to the same answers by test/ciParity.test.js.
//
// Design record: docs/design/ce-ci-module.md.
//
// The host: `{ say(level, text), ask(fields) -> { ok, token } or { ok: false, error },
// query(fields) -> answer, waiters() -> table, call(fn, value) }`. `ask` starts a command whose
// answers come later, `query` one that answers at once; `waiters` is the running script's own table
// of token -> { fn }, so an answer reaches the script that asked; `receive` is called with each
// "ciReply" { token, final, result }.

const NUMBER_TEXT = /^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/;

function opt(opts, key) {
  return opts && typeof opts === 'object' ? opts[key] : undefined;
}

function toNumber(v) {
  if (typeof v === 'number') return v;
  if (typeof v === 'string' && NUMBER_TEXT.test(v.trim())) return Number(v.trim());
  return NaN;
}

function present(v) {
  return v !== undefined && v !== null;
}

/** The options a command passes on to the device layer, as numbers and text it can read. */
function passOn(opts, keys) {
  const out = {};
  for (const key of keys) {
    const v = opt(opts, key);
    if (present(v)) out[key] = v;
  }
  return out;
}

export function ciCommands(host) {
  const say = (level, text) => host.say(level, text);

  function muidOf(verb, muid) {
    const n = toNumber(muid);
    if (Number.isFinite(n) && n >= 0 && Math.floor(n) === n) return n;
    say('error', `ce.ci.${verb}: muid must be a device's number, as discover or devices give it, so nothing was sent.`);
    return null;
  }

  function needFn(verb, fn) {
    if (typeof fn === 'function') return true;
    say('error', `ce.ci.${verb}: fn must be a function to call with the answer, so nothing was sent.`);
    return false;
  }

  function needResource(verb, resource) {
    if (typeof resource === 'string' && resource !== '') return true;
    say('error', `ce.ci.${verb}: resource must be a resource's name, such as "ProgramList", so nothing was sent.`);
    return false;
  }

  /** Start a command; its answers go to fn. The token, or false (said) when it was not sent. */
  function start(verb, fields, fn) {
    const answer = host.ask(fields);
    if (!answer || answer.ok !== true || !present(answer.token)) {
      const why = answer && typeof answer.error === 'string' && answer.error !== '' ? answer.error : 'MIDI-CI is not available here';
      say('error', `ce.ci.${verb}: ${why}, so nothing was sent.`);
      return false;
    }
    host.waiters()[String(answer.token)] = { fn };
    return answer.token;
  }

  function discover(a, b) {
    const opts = typeof a === 'function' ? undefined : a;
    const fn = typeof a === 'function' ? a : b;
    if (!needFn('discover', fn)) return false;
    const role = opt(opts, 'role');
    const fields = { op: 'discover', role: typeof role === 'string' && role !== '' ? role : 'mainSynth' };
    const timeout = toNumber(opt(opts, 'timeoutMs'));
    if (Number.isFinite(timeout) && timeout > 0) fields.timeoutMs = timeout;
    return start('discover', fields, fn) !== false;
  }

  function devices(role) {
    const fields = { op: 'devices' };
    if (typeof role === 'string' && role !== '') fields.role = role;
    const list = host.query(fields);
    return Array.isArray(list) ? list : [];
  }

  function get(muid, resource, a, b) {
    const opts = typeof a === 'function' ? undefined : a;
    const fn = typeof a === 'function' ? a : b;
    const m = muidOf('get', muid);
    if (m === null || !needResource('get', resource) || !needFn('get', fn)) return false;
    return start('get', { op: 'get', muid: m, resource, opts: passOn(opts, ['resId', 'offset', 'limit', 'timeoutMs']) }, fn) !== false;
  }

  function set(muid, resource, body, a, b) {
    const opts = typeof a === 'function' ? undefined : a;
    const fn = typeof a === 'function' ? a : b;
    const m = muidOf('set', muid);
    if (m === null || !needResource('set', resource) || !needFn('set', fn)) return false;
    if (!present(body)) {
      say('error', 'ce.ci.set: body must be given: a table, text or bytes, so nothing was sent.');
      return false;
    }
    return start('set', { op: 'set', muid: m, resource, body, opts: passOn(opts, ['resId', 'partial', 'mediaType', 'timeoutMs']) }, fn) !== false;
  }

  function subscribe(muid, resource, a, b) {
    const opts = typeof a === 'function' ? undefined : a;
    const fn = typeof a === 'function' ? a : b;
    const m = muidOf('subscribe', muid);
    if (m === null || !needResource('subscribe', resource) || !needFn('subscribe', fn)) return undefined;
    const token = start('subscribe', { op: 'subscribe', muid: m, resource, opts: passOn(opts, ['resId']) }, fn);
    return token === false ? undefined : token;
  }

  function unsubscribe(id) {
    if (!present(id)) return false;
    delete host.waiters()[String(id)];
    return host.query({ op: 'unsubscribe', id: String(id) }) === true;
  }

  function profiles(muid, fn) {
    const m = muidOf('profiles', muid);
    if (m === null) return [];
    const list = host.query({ op: 'profiles', muid: m });
    if (present(fn)) {
      if (needFn('profiles', fn)) start('profiles', { op: 'profiles', muid: m, ask: true }, fn);
    }
    return Array.isArray(list) ? list : [];
  }

  function setProfile(muid, id, on, opts) {
    const m = muidOf('setProfile', muid);
    if (m === null) return false;
    if (typeof id !== 'string' || id === '') {
      say('error', 'ce.ci.setProfile: id must be a profile, as profiles gives it ("7E 21 09 01 00"), so nothing was sent.');
      return false;
    }
    if (typeof on !== 'boolean') {
      say('error', 'ce.ci.setProfile: on must be true or false, so nothing was sent.');
      return false;
    }
    let channel = 0;
    const given = opt(opts, 'channel');
    if (present(given)) {
      const c = toNumber(given);
      if (!Number.isFinite(c) || Math.floor(c) !== c || c < 1 || c > 16) {
        say('error', 'ce.ci.setProfile: channel must be 1 to 16, so nothing was sent.');
        return false;
      }
      channel = c;
    }
    const answer = host.query({ op: 'setProfile', muid: m, id, on, channel });
    if (answer === true) return true;
    const why = answer && typeof answer.error === 'string' && answer.error !== '' ? answer.error : 'MIDI-CI is not available here';
    say('error', `ce.ci.setProfile: ${why}, so nothing was sent.`);
    return false;
  }

  /** A device's answer: to the function that asked, once, or until a subscription ends. */
  function receive(reply) {
    if (!reply || typeof reply !== 'object' || !present(reply.token)) return;
    const waiters = host.waiters();
    const key = String(reply.token);
    const w = waiters[key];
    if (!w) return;
    if (reply.final === true) delete waiters[key];
    host.call(w.fn, reply.result);
  }

  return { discover, devices, get, set, subscribe, unsubscribe, profiles, setProfile, receive };
}
