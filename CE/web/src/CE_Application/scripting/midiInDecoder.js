// The MIDI a device sends, decoded once for every script: bends, pressure, program changes with their
// bank select, NRPNs and RPNs put together from their controllers, transport from a device, and MPE
// read back into notes (docs/design/midi-input-and-mpe.md). The panel view feeds it from its MIDI
// input; an exported plug-in with its window shut runs its C++ twin, MidiInDecoder.h. Both are held
// to the same table of messages and the events they give, test/fixtures/midiInCases.json.
//
// feed(role, bytes, now) gives the events one message raises, as { event, payload }; flush(now)
// gives the thinned ones whose time has come; nextDue() says when the next one will. A bend, a
// pressure or an MPE expression is raised at most once every 10 ms per channel (per note for poly
// pressure and expression), with the latest value; anything else on that channel first lets what is
// waiting go, so nothing is reordered. An NRPN's coarse half waits 5 ms for its fine half.

export const THIN_MS = 10;
export const NRPN_WAIT_MS = 5;
const RPN_NAMES = { 0: 'bendRange', 1: 'fineTuning', 2: 'coarseTuning', 6: 'mpeConfiguration' };

export function createMidiInDecoder() {
  const channels = new Map();   // role:channel -> { bankMsb, bankLsb, kind, msb, lsb, coarse, coarseAt }
  const lastRaised = new Map(); // thinning key -> time
  const waiting = [];           // [{ key, base, due, event, payload }] thinned or NRPN, in the order they began
  const listens = new Map();    // role ('' = every input) -> { zone, members, bendRange }
  const sounding = new Map();   // role:channel -> MPE note { id, note, velocity }
  const expression = new Map(); // role:channel -> { bend, pressure, timbre } as last sent on the channel
  let nextId = 1;

  function state(role, channel) {
    const key = `${role}:${channel}`;
    if (!channels.has(key)) channels.set(key, { bankMsb: null, bankLsb: null, kind: null, msb: null, lsb: null, coarse: null, coarseAt: 0 });
    return channels.get(key);
  }

  function listenFor(role) {
    return listens.get(role) ?? listens.get('') ?? null;
  }

  function isMember(listen, channel) {
    if (!listen) return false;
    if (listen.zone === 'upper') return channel <= 15 && channel >= 16 - listen.members;
    return channel >= 2 && channel <= 1 + listen.members;
  }

  /** What waits on this channel goes now, in the order it began. */
  function release(base, out) {
    for (let i = 0; i < waiting.length;) {
      const w = waiting[i];
      if (w.base !== base) { i += 1; continue; }
      waiting.splice(i, 1);
      out.push(...settle(w));
    }
  }

  /** A waiting entry, as the events it raises. */
  function settle(w) {
    if (w.nrpn) {
      const s = state(w.role, w.channel);
      if (s.coarse === null) return [];
      const payload = numberPayload(w.role, w.channel, s, s.coarse, false);
      s.coarse = null;
      return payload ? [payload] : [];
    }
    lastRaised.set(w.key, w.due);
    return [{ event: w.event, payload: w.payload }];
  }

  /** A fast message: raised now when the last went 10 ms ago, else the latest waits its turn. */
  function thinned(key, base, now, event, payload, out) {
    const last = lastRaised.get(key);
    if (last === undefined || now - last >= THIN_MS) {
      const at = waiting.findIndex((w) => w.key === key);
      if (at >= 0) waiting.splice(at, 1);
      lastRaised.set(key, now);
      out.push({ event, payload });
      return;
    }
    const w = waiting.find((x) => x.key === key);
    if (w) { w.payload = payload; return; }
    waiting.push({ key, base, due: last + THIN_MS, event, payload });
  }

  function numberPayload(role, channel, s, value, fine) {
    if (s.msb === null || s.lsb === null) return null;
    const parameter = s.msb * 128 + s.lsb;
    const payload = { channel, from: role, msb: s.msb, lsb: s.lsb, parameter, value, fine };
    if (s.kind === 'rpn') {
      if (RPN_NAMES[parameter]) payload.name = RPN_NAMES[parameter];
      // The device says which MPE zone it plays: what listen reads, when listening to it.
      if (parameter === 6 && !fine) {
        const listen = listenFor(role);
        if (listen && (channel === 1 || channel === 16) && value >= 0 && value <= 15) {
          listen.zone = channel === 16 ? 'upper' : 'lower';
          listen.members = value;
        }
      }
    }
    return { event: s.kind === 'rpn' ? 'onRpnIn' : 'onNrpnIn', payload };
  }

  function expressionEvent(role, channel, note, changed, now, out) {
    const e = expression.get(`${role}:${channel}`);
    const payload = { id: note.id, note: note.note, channel, bend: e.bend, pressure: e.pressure, timbre: e.timbre, changed, from: role };
    thinned(`${role}:${channel}:expression`, `${role}:${channel}`, now, 'onExpressionIn', payload, out);
  }

  function controller(role, channel, cc, value, now, out, listen) {
    const s = state(role, channel);
    const base = `${role}:${channel}`;
    if (listen && isMember(listen, channel) && cc === 74) {
      const e = expression.get(base) ?? { bend: 0, pressure: 0, timbre: 0 };
      e.timbre = value / 127;
      expression.set(base, e);
      const note = sounding.get(base);
      if (note) expressionEvent(role, channel, note, 'timbre', now, out);
      return true;
    }
    if (cc === 0) { s.bankMsb = value; return false; }
    if (cc === 32) { s.bankLsb = value; return false; }
    if (cc === 99 || cc === 98) {
      if (s.kind !== 'nrpn') { s.msb = null; s.lsb = null; }
      s.kind = 'nrpn';
      if (cc === 99) s.msb = value; else s.lsb = value;
      return false;
    }
    if (cc === 101 || cc === 100) {
      if (s.kind !== 'rpn') { s.msb = null; s.lsb = null; }
      s.kind = 'rpn';
      if (cc === 101) s.msb = value; else s.lsb = value;
      if (s.msb === 127 && s.lsb === 127) { s.kind = null; s.msb = null; s.lsb = null; }
      return false;
    }
    if (s.kind === null || s.msb === null || s.lsb === null) return false;
    if (cc === 6) {
      release(base, out);
      s.coarse = value;
      waiting.push({ nrpn: true, role, channel, key: `${base}:nrpn`, base, due: now + NRPN_WAIT_MS });
      return false;
    }
    if (cc === 38) {
      const at = waiting.findIndex((w) => w.key === `${base}:nrpn`);
      if (at >= 0) waiting.splice(at, 1);
      const coarse = s.coarse;
      s.coarse = null;
      if (coarse === null) return false;
      const ev = numberPayload(role, channel, s, coarse * 128 + value, true);
      if (ev) out.push(ev);
      return false;
    }
    if (cc === 96 || cc === 97) {
      const ev = numberPayload(role, channel, s, null, false);
      if (ev) {
        delete ev.payload.value;
        delete ev.payload.fine;
        ev.payload.step = cc === 96 ? 1 : -1;
        release(base, out);
        out.push(ev);
      }
    }
    return false;
  }

  /**
   * One message's events. `ccTaken` is true when a controller was read as MPE timbre, which is then
   * raised as expressionIn instead of ccIn.
   */
  function feed(role, bytes, now) {
    const out = [];
    const from = String(role || 'mainSynth');
    const status = bytes[0] ?? 0;
    let ccTaken = false;
    if (status === 0xFA || status === 0xFB || status === 0xFC) {
      out.push({ event: 'onTransportIn', payload: { action: status === 0xFA ? 'start' : status === 0xFB ? 'continue' : 'stop', from } });
      return { events: out, ccTaken };
    }
    if (status === 0xF2 && bytes.length >= 3) {
      out.push({ event: 'onTransportIn', payload: { action: 'position', beat: ((bytes[2] & 0x7F) * 128 + (bytes[1] & 0x7F)) / 4, from } });
      return { events: out, ccTaken };
    }
    if (status < 0x80 || status >= 0xF0) return { events: out, ccTaken };
    const kind = status & 0xF0;
    const channel = (status & 0x0F) + 1;
    const base = `${from}:${channel}`;
    const listen = listenFor(from);
    const member = isMember(listen, channel);
    const x = bytes[1] ?? 0;
    const y = bytes[2] ?? 0;

    if (kind === 0x90 || kind === 0x80) {
      release(base, out);
      const off = kind === 0x80 || y === 0;
      const payload = { channel, note: x, velocity: y, from };
      if (member) {
        const playing = sounding.get(base);
        if (!off) {
          const id = nextId;
          nextId += 1;
          sounding.set(base, { id, note: x, velocity: y });
          if (!expression.has(base)) expression.set(base, { bend: 0, pressure: 0, timbre: 0 });
          payload.id = id;
        } else if (playing && playing.note === x) {
          payload.id = playing.id;
          sounding.delete(base);
        }
      }
      out.push({ event: off ? 'onNoteOffIn' : 'onNoteIn', payload });
      return { events: out, ccTaken };
    }
    if (kind === 0xE0) {
      const raw = (y & 0x7F) * 128 + (x & 0x7F);
      const value = raw - 8192;
      if (member) {
        const e = expression.get(base) ?? { bend: 0, pressure: 0, timbre: 0 };
        e.bend = (value >= 0 ? value / 8191 : value / 8192) * listen.bendRange;
        expression.set(base, e);
        const note = sounding.get(base);
        if (note) expressionEvent(from, channel, note, 'bend', now, out);
        return { events: out, ccTaken };
      }
      thinned(`${base}:bend`, base, now, 'onBendIn', { channel, value, amount: value >= 0 ? value / 8191 : value / 8192, raw, from }, out);
      return { events: out, ccTaken };
    }
    if (kind === 0xD0) {
      if (member) {
        const e = expression.get(base) ?? { bend: 0, pressure: 0, timbre: 0 };
        e.pressure = x / 127;
        expression.set(base, e);
        const note = sounding.get(base);
        if (note) expressionEvent(from, channel, note, 'pressure', now, out);
        return { events: out, ccTaken };
      }
      thinned(`${base}:pressure`, base, now, 'onPressureIn', { channel, value: x, amount: x / 127, from }, out);
      return { events: out, ccTaken };
    }
    if (kind === 0xA0) {
      thinned(`${base}:poly:${x}`, base, now, 'onPolyPressureIn', { channel, note: x, value: y, amount: y / 127, from }, out);
      return { events: out, ccTaken };
    }
    if (kind === 0xC0) {
      release(base, out);
      const s = state(from, channel);
      const payload = { channel, program: x, number: x + 1, from };
      if (s.bankMsb !== null) payload.bankMsb = s.bankMsb;
      if (s.bankLsb !== null) payload.bankLsb = s.bankLsb;
      s.bankMsb = null;
      s.bankLsb = null;
      out.push({ event: 'onProgramIn', payload });
      return { events: out, ccTaken };
    }
    if (kind === 0xB0) {
      ccTaken = controller(from, channel, x, y, now, out, listen);
      return { events: out, ccTaken };
    }
    return { events: out, ccTaken };
  }

  /** The waiting events whose time has come, in the order they began. */
  function flush(now) {
    const out = [];
    for (let i = 0; i < waiting.length;) {
      if (waiting[i].due > now) { i += 1; continue; }
      const w = waiting.splice(i, 1)[0];
      out.push(...settle(w));
    }
    return out;
  }

  function nextDue() {
    let due = null;
    for (const w of waiting) if (due === null || w.due < due) due = w.due;
    return due;
  }

  /** ce.mpe.listen: read MPE from a role ('' for every input), or stop. */
  function listen(role, opts) {
    const key = String(role ?? '');
    if (opts === null) {
      listens.delete(key);
      for (const k of [...sounding.keys()]) if (key === '' || k.startsWith(`${key}:`)) sounding.delete(k);
      return;
    }
    listens.set(key, {
      zone: opts.zone === 'upper' ? 'upper' : 'lower',
      members: Math.max(1, Math.min(15, Math.floor(Number(opts.members) || 15))),
      bendRange: Number(opts.bendRange) > 0 ? Number(opts.bendRange) : 48,
    });
  }

  function reset() {
    channels.clear();
    lastRaised.clear();
    waiting.length = 0;
    listens.clear();
    sounding.clear();
    expression.clear();
    nextId = 1;
  }

  return { feed, flush, nextDue, listen, reset };
}
