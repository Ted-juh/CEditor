// ce.mpe — playing MPE, the part that is the same in every runtime (docs/design/midi-input-and-mpe.md).
// A script plays notes by id; this picks each note's member channel, sends its expression on that
// channel alone, and frees the channel when the note ends. Reading MPE back in is the input decoder's
// (midiInDecoder.js, MidiInDecoder.h); listen() only tells it how. The JavaScript prelude runs this
// file itself (tools/scripts/gen-mpe-prelude.mjs); the Lua and Python preludes are ports held to the
// same answers by test/mpeParity.test.js.
//
// The host: `{ say(level, text), send(bytes, role), note(v) -> 0..127 or undefined, listen(role, opts) }`.

const ZONES = ['lower', 'upper'];

function opt(opts, key) {
  return opts && typeof opts === 'object' ? opts[key] : undefined;
}

function present(v) {
  return v !== undefined && v !== null;
}

function finite(v) {
  return typeof v === 'number' && Number.isFinite(v);
}

/** x held to lo..hi (not ce.math.clamp, which this module does not require). */
function held(x, lo, hi) {
  return x < lo ? lo : (x > hi ? hi : x);
}

function roundHalfAway(x) {
  return x < 0 ? -Math.floor(-x + 0.5) : Math.floor(x + 0.5);
}

export function mpeCommands(host) {
  const say = (level, text) => host.say(level, text);
  let zone = null;            // { upper, members, bendRange, managerBendRange, role }
  let sounding = [];          // { id, note, channel, velocity, bend, pressure, timbre }, oldest first
  let released = {};          // channel -> when it was last freed (a count), for the longest-free rule
  let releases = 0;
  let nextId = 1;
  let warnedFull = false;

  function members() {
    const out = [];
    for (let i = 0; i < zone.members; i += 1) out.push(zone.upper ? 15 - i : 2 + i);
    return out;
  }

  function send(bytes) {
    host.send(bytes, zone.role);
  }

  function rpn(channel, msb, lsb, value) {
    const status = 0xB0 + channel - 1;
    send([status, 101, msb]);
    send([status, 100, lsb]);
    send([status, 6, value]);
    send([status, 38, 0]);
    send([status, 101, 127]);
    send([status, 100, 127]);
  }

  function bendBytes(channel, semitones) {
    const v = held(roundHalfAway(8192 + (semitones / zone.bendRange) * 8192), 0, 16383);
    return [0xE0 + channel - 1, v % 128, Math.floor(v / 128)];
  }

  function amount7(x) {
    return held(roundHalfAway(held(x, 0, 1) * 127), 0, 127);
  }

  function release(n, velocity) {
    send([0x80 + n.channel - 1, n.note, velocity]);
    sounding = sounding.filter((x) => x !== n);
    releases += 1;
    released[n.channel] = releases;
  }

  function allOff() {
    if (zone === null) return 0;
    const count = sounding.length;
    for (const n of sounding.slice()) release(n, 64);
    for (const channel of members()) send([0xE0 + channel - 1, 0, 64]);
    return count;
  }

  function semitones(verb, value, name) {
    if (!finite(value)) {
      say('error', `ce.mpe.${verb}: ${name} must be a number of semitones, so nothing was done.`);
      return null;
    }
    return value;
  }

  function setZone(opts) {
    const which = present(opt(opts, 'zone')) ? opt(opts, 'zone') : 'lower';
    if (!ZONES.includes(which)) {
      say('error', `ce.mpe.zone: zone must be "lower" or "upper", so nothing was done.`);
      return false;
    }
    const count = present(opt(opts, 'members')) ? opt(opts, 'members') : 15;
    if (!finite(count) || Math.floor(count) !== count || count < 1 || count > 15) {
      say('error', 'ce.mpe.zone: members must be a whole number from 1 to 15, so nothing was done.');
      return false;
    }
    const bendRange = present(opt(opts, 'bendRange')) ? semitones('zone', opt(opts, 'bendRange'), 'bendRange') : 48;
    if (bendRange === null) return false;
    const managerBendRange = present(opt(opts, 'managerBendRange')) ? semitones('zone', opt(opts, 'managerBendRange'), 'managerBendRange') : 2;
    if (managerBendRange === null) return false;
    if (bendRange <= 0 || bendRange > 96 || managerBendRange <= 0 || managerBendRange > 96) {
      say('error', 'ce.mpe.zone: a bend range must be above 0 and at most 96 semitones, so nothing was done.');
      return false;
    }
    const role = opt(opts, 'role');
    allOff();
    zone = {
      upper: which === 'upper', members: count, bendRange, managerBendRange,
      role: typeof role === 'string' && role !== '' ? role : 'mainSynth',
    };
    sounding = [];
    released = {};
    if (opt(opts, 'send') !== false) {
      const manager = zone.upper ? 16 : 1;
      rpn(manager, 0, 6, count);
      rpn(manager, 0, 0, roundHalfAway(managerBendRange));
      for (const channel of members()) rpn(channel, 0, 0, roundHalfAway(bendRange));
    }
    return true;
  }

  function startValues(verb, values) {
    const out = { bend: 0, pressure: 0, timbre: 0.5 };
    if (!present(values)) return out;
    if (typeof values !== 'object') {
      say('error', `ce.mpe.${verb}: values must be a table of bend, pressure and timbre, so nothing was sent.`);
      return null;
    }
    for (const key of ['bend', 'pressure', 'timbre']) {
      const v = values[key];
      if (!present(v)) continue;
      if (!finite(v)) {
        say('error', `ce.mpe.${verb}: ${key} must be a number, so nothing was sent.`);
        return null;
      }
      out[key] = v;
    }
    return out;
  }

  function noteOn(note, velocity, opts) {
    const n = host.note(note);
    if (!present(n)) {
      say('error', 'ce.mpe.noteOn: note must be 0 to 127 or a name such as "C4", so nothing was sent.');
      return undefined;
    }
    if (!finite(velocity) || Math.floor(velocity) !== velocity || velocity < 1 || velocity > 127) {
      say('error', 'ce.mpe.noteOn: velocity must be a whole number from 1 to 127, so nothing was sent.');
      return undefined;
    }
    const start = startValues('noteOn', opts);
    if (start === null) return undefined;
    if (zone === null) setZone({});
    const busy = {};
    for (const x of sounding) busy[x.channel] = true;
    let channel = 0;
    let best = Infinity;
    for (const c of members()) {
      if (busy[c]) continue;
      const when = released[c] ?? 0;
      if (when < best) { best = when; channel = c; }
    }
    if (channel === 0) {
      const oldest = sounding[0];
      if (!warnedFull) {
        warnedFull = true;
        say('warn', 'ce.mpe.noteOn: every member channel is busy, so the oldest note was ended. More members, or fewer notes at once, avoid it.');
      }
      channel = oldest.channel;
      release(oldest, 64);
    }
    const bend = held(start.bend, -zone.bendRange, zone.bendRange);
    // As MPE asks: the note's bend and timbre first, so it never starts at the last note's.
    send(bendBytes(channel, bend));
    send([0xB0 + channel - 1, 74, amount7(start.timbre)]);
    send([0xD0 + channel - 1, amount7(start.pressure)]);
    send([0x90 + channel - 1, n, velocity]);
    const id = nextId;
    nextId += 1;
    sounding.push({ id, note: n, channel, velocity, bend, pressure: held(start.pressure, 0, 1), timbre: held(start.timbre, 0, 1) });
    return id;
  }

  function find(id) {
    for (const n of sounding) if (n.id === id) return n;
    return null;
  }

  function express(id, values) {
    const n = find(id);
    if (n === null) return false;
    if (!values || typeof values !== 'object') {
      say('error', 'ce.mpe.express: values must be a table of bend, pressure and timbre, so nothing was sent.');
      return false;
    }
    const v = startValues('express', values);
    if (v === null) return false;
    if (present(values.bend)) {
      n.bend = held(values.bend, -zone.bendRange, zone.bendRange);
      send(bendBytes(n.channel, n.bend));
    }
    if (present(values.pressure)) {
      n.pressure = held(values.pressure, 0, 1);
      send([0xD0 + n.channel - 1, amount7(n.pressure)]);
    }
    if (present(values.timbre)) {
      n.timbre = held(values.timbre, 0, 1);
      send([0xB0 + n.channel - 1, 74, amount7(n.timbre)]);
    }
    return true;
  }

  function noteOff(id, velocity) {
    const n = find(id);
    if (n === null) return false;
    let v = 64;
    if (present(velocity)) {
      if (!finite(velocity) || Math.floor(velocity) !== velocity || velocity < 0 || velocity > 127) {
        say('error', 'ce.mpe.noteOff: velocity must be a whole number from 0 to 127, so the note was ended at 64.');
      } else {
        v = velocity;
      }
    }
    release(n, v);
    return true;
  }

  function notes() {
    return sounding.map((n) => ({ id: n.id, note: n.note, channel: n.channel, velocity: n.velocity, bend: n.bend, pressure: n.pressure, timbre: n.timbre }));
  }

  function listen(opts) {
    const from = opt(opts, 'from');
    const role = typeof from === 'string' ? from : '';
    if (opt(opts, 'off') === true) {
      host.listen(role, null);
      return true;
    }
    const which = present(opt(opts, 'zone')) ? opt(opts, 'zone') : 'lower';
    if (!ZONES.includes(which)) {
      say('error', 'ce.mpe.listen: zone must be "lower" or "upper", so nothing was done.');
      return false;
    }
    const count = present(opt(opts, 'members')) ? opt(opts, 'members') : 15;
    if (!finite(count) || Math.floor(count) !== count || count < 1 || count > 15) {
      say('error', 'ce.mpe.listen: members must be a whole number from 1 to 15, so nothing was done.');
      return false;
    }
    const bendRange = present(opt(opts, 'bendRange')) ? semitones('listen', opt(opts, 'bendRange'), 'bendRange') : 48;
    if (bendRange === null) return false;
    if (bendRange <= 0 || bendRange > 96) {
      say('error', 'ce.mpe.listen: bendRange must be above 0 and at most 96 semitones, so nothing was done.');
      return false;
    }
    host.listen(role, { zone: which, members: count, bendRange });
    return true;
  }

  return { zone: setZone, noteOn, express, noteOff, allOff, notes, listen };
}
