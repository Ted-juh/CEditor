// ce.daw — the exported plug-in and its DAW: the part that is the same in every runtime. What the DAW
// is, its parameters and programs, and the changes a script may make to what it sees, all live in the
// plug-in (PluginProcessor.h); this file checks a script's call, asks the host, and hands back the
// answer in one shape. In the editor there is no DAW, and the host says so. The JavaScript prelude runs
// this file itself (tools/scripts/gen-daw-prelude.mjs); the Lua and Python preludes are ports held to
// the same answers by test/dawParity.test.js.
//
// Design record: docs/design/ce-daw-module.md.
//
// The host: `{ say(level, text), query(op, fields) -> answer }`. The ops are host, parameters,
// program, programs, beginGesture, endGesture, rename, assign and markChanged; an op the host cannot
// answer gives nothing.

function present(v) {
  return v !== undefined && v !== null;
}

function isTable(v) {
  return v !== null && typeof v === 'object';
}

export function dawCommands(host) {
  const say = (level, text) => host.say(level, text);

  function needPath(verb, path, what) {
    if (typeof path === 'string' && path !== '') return true;
    say('error', `ce.daw.${verb}: path must be a control's path, such as "Cutoff.value", so ${what}.`);
    return false;
  }

  function list(op) {
    const answer = host.query(op, {});
    return Array.isArray(answer) ? answer : [];
  }

  function table(op) {
    const answer = host.query(op, {});
    return isTable(answer) && !Array.isArray(answer) ? answer : undefined;
  }

  function hostInfo() { return table('host'); }

  function parameters() { return list('parameters'); }

  function parameter(path) {
    if (!needPath('parameter', path, 'there is nothing to give')) return undefined;
    for (const p of parameters()) if (isTable(p) && p.path === path) return p;
    return undefined;
  }

  function program() { return table('program'); }

  function programs() { return list('programs'); }

  function gesture(verb, path) {
    if (!needPath(verb, path, 'nothing was done')) return false;
    return host.query(verb, { path }) === true;
  }

  function rename(path, name) {
    if (!needPath('rename', path, 'nothing was renamed')) return false;
    if (present(name) && typeof name !== 'string') {
      say('error', 'ce.daw.rename: name must be text, or nothing for the name it was exported with, so nothing was renamed.');
      return false;
    }
    return host.query('rename', { path, name: present(name) ? name : '' }) === true;
  }

  function assign(slot, path, opts) {
    if (typeof slot !== 'number' || !Number.isFinite(slot) || Math.floor(slot) !== slot || slot < 1) {
      say('error', 'ce.daw.assign: slot must be a whole number from 1, so nothing was assigned.');
      return false;
    }
    if (present(path) && (typeof path !== 'string' || path === '')) {
      say('error', 'ce.daw.assign: path must be a control\'s path, such as "Cutoff.value", or nothing to empty the slot, so nothing was assigned.');
      return false;
    }
    const name = isTable(opts) ? opts.name : undefined;
    if (present(name) && typeof name !== 'string') {
      say('error', 'ce.daw.assign: name must be text, so nothing was assigned.');
      return false;
    }
    return host.query('assign', { slot, path: present(path) ? path : '', name: present(name) ? name : '' }) === true;
  }

  function markChanged() { return host.query('markChanged', {}) === true; }

  return {
    host: hostInfo, parameters, parameter, program, programs,
    beginGesture: (path) => gesture('beginGesture', path),
    endGesture: (path) => gesture('endGesture', path),
    rename, assign, markChanged,
  };
}
