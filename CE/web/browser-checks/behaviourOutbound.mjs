/**
 * behaviourOutbound.mjs — the rows whose evidence is BYTES ON THE WIRE, and the panel key.
 *
 * Four groups the ledger had listed as unverified, three of them for the same reason: the promised
 * effect is controller traffic, and `notes()` taps `sendNoteBytes` while `noteOutputFromBytes`
 * publishes note-on and note-off and nothing else. A bend, a channel pressure, a CC and a system
 * exclusive all pass through that funnel invisibly. The door they DO go through is
 * `triggerRawMidiAction`, which `kit.wire()` stands a backend behind and `kit.sent()` reads.
 *
 * The fourth, `followPanelKey`, was listed as needing "a second control driving it live", which was
 * simply wrong: the panel key is not written by a control at all. `setPanelKey` is a store action
 * that BROADCASTS — it writes the new key and scale into each following component's own section, so
 * the effect is in the document, on the drawing and in the notes the component plays, and all three
 * are measured here.
 */
import assert from 'node:assert/strict';
import { boot, Ledger } from './behaviourKit.mjs';

const kit = await boot();
const led = new Ledger('outbound');
const hx = (n) => n.toString(16).padStart(2, '0').toUpperCase();
const noteOn = (ch, note, vel = 100) => `${hx(0x90 + ch - 1)}${hx(note)}${hx(vel)}`;
const noteOff = (ch, note) => `${hx(0x80 + ch - 1)}${hx(note)}00`;
/** Pitch bend, lsb first, 14 bits. Centre is 8192. */
const bend = (ch, v14) => `${hx(0xE0 + ch - 1)}${hx(v14 & 0x7F)}${hx((v14 >> 7) & 0x7F)}`;
const pressure = (ch, v) => `${hx(0xD0 + ch - 1)}${hx(v)}`;
const cc = (ch, n, v) => `${hx(0xB0 + ch - 1)}${hx(n)}${hx(v)}`;
const polyAt = (ch, note, v) => `${hx(0xA0 + ch - 1)}${hx(note)}${hx(v)}`;

const send = async (hex, settle = 180) => {
  await kit.page.evaluate(async ({ hex }) => {
    const { latestMidiInputMessage } = await import('/src/CE_Application/stores/deviceProfileStores.js');
    latestMidiInputMessage.set({ hex, messageType: 'midi', at: Date.now() });
  }, { hex });
  await kit.settle(settle);
};
/** Everything on the wire with this status byte, as { channel, bytes } — the status masked off. */
const ofStatus = (wire, status) => wire.filter((m) => m.status === status)
  .map((m) => ({ channel: m.channel, bytes: m.bytes }));

try {
  // =============================================================================================
  // HARMONISER forwardBend / forwardPressure — bend and aftertouch onto the chord's channel.
  // =============================================================================================
  await kit.fresh();
  {
    const H = 'Harmoniser';
    const hid = await kit.make(H, { 'Transform.x': 40, 'Transform.y': 60,
      'Transform.width': 520, 'Transform.height': 180,
      'Harmoniser.mode': 'diatonic', 'Harmoniser.key': 0, 'Harmoniser.scale': 'major',
      'Harmoniser.size': 3, 'Harmoniser.voicing': 'close', 'Harmoniser.strumMs': 0,
      'Harmoniser.inputChannel': 0, 'Harmoniser.channel': 7, 'Harmoniser.velocity': 0,
      'Harmoniser.forwardBend': false, 'Harmoniser.forwardPressure': false });
    await kit.wire();
    await kit.preview(true);
    await kit.settle(300);

    /** Send one message and hand back only what left on the wire because of it. */
    const after = async (hex) => { await kit.forgetSent(); await send(hex); return kit.sent(); };

    // --- forwardBend: off, then on ---------------------------------------------------------------
    {
      led.check(H, 'forwardBend (off)', 'a harmoniser that is not forwarding bend puts no bend on the wire at all',
        0, ofStatus(await after(bend(1, 12000)), 0xE0).length);

      await kit.set(hid, { 'Harmoniser.forwardBend': true });
      await kit.settle(200);
      const on = ofStatus(await after(bend(1, 12000)), 0xE0);
      led.check(H, 'forwardBend (on)', "and one that is puts it on the chord's own channel, not the input's",
        { count: 1, channel: 7 },
        { count: on.length, channel: on[0]?.channel ?? null });
    }

    // --- the fourteen bits survive ---------------------------------------------------------------
    {
      // 12000 is 0x2EE0: lsb 0x60, msb 0x5D. A forwarder that re-sent seven bits would put a zero
      // in the low byte and turn a glide into a staircase — the one thing a bend wheel exists to
      // avoid, and the reason the surface carries value14 rather than value.
      const on = ofStatus(await after(bend(1, 12000)), 0xE0);
      const b = on[0]?.bytes ?? [];
      led.check(H, 'forwardBend (all fourteen bits)',
        'the low seven bits of the bend are carried through rather than rounded away',
        { lsb: 12000 & 0x7F, msb: (12000 >> 7) & 0x7F }, { lsb: b[1] ?? null, msb: b[2] ?? null });
    }

    // --- forwardPressure ---------------------------------------------------------------------------
    {
      led.check(H, 'forwardPressure (off)', 'channel pressure is dropped while the switch is off, even with bend forwarding on',
        0, ofStatus(await after(pressure(1, 90)), 0xD0).length);

      await kit.set(hid, { 'Harmoniser.forwardPressure': true });
      await kit.settle(200);
      const on = ofStatus(await after(pressure(1, 90)), 0xD0);
      led.check(H, 'forwardPressure (on)', 'and forwarded to the chord channel carrying its value when it is on',
        { count: 1, channel: 7, value: 90 },
        { count: on.length, channel: on[0]?.channel ?? null, value: on[0]?.bytes?.[1] ?? null });
    }

    // --- inputChannel: whose bend it is ------------------------------------------------------------
    {
      await kit.set(hid, { 'Harmoniser.inputChannel': 3 });
      await kit.settle(200);
      led.check(H, 'inputChannel (a bend on another channel)',
        'a harmoniser watching channel 3 does not forward channel 1 traffic',
        { bend: 0, pressure: 0 },
        await (async () => { const w = await after(bend(1, 3000) + pressure(1, 40));
          return { bend: ofStatus(w, 0xE0).length, pressure: ofStatus(w, 0xD0).length }; })());

      const mine = await after(bend(3, 3000) + pressure(3, 40));
      led.check(H, 'inputChannel (the channel it watches)',
        'and does forward the channel it was told to watch, both kinds',
        { bend: 1, pressure: 1, bendCh: 7, pressureCh: 7 },
        { bend: ofStatus(mine, 0xE0).length, pressure: ofStatus(mine, 0xD0).length,
          bendCh: ofStatus(mine, 0xE0)[0]?.channel ?? null,
          pressureCh: ofStatus(mine, 0xD0)[0]?.channel ?? null });
      await kit.set(hid, { 'Harmoniser.inputChannel': 0 });
      await kit.settle(200);
    }

    // --- and it still does all that after a save and reopen ----------------------------------------
    {
      const re = await kit.reopen(hid);
      await kit.wire();
      await kit.preview(true);
      await kit.settle(400);
      const w = await after(bend(1, 9000) + pressure(1, 77));
      const bs = ofStatus(w, 0xE0);
      const ps = ofStatus(w, 0xD0);
      led.check(H, 'save/reopen (both switches)',
        'a reopened harmoniser forwards both, still onto channel 7, still with all fourteen bits',
        { bend: 1, bendCh: 7, lsb: 9000 & 0x7F, msb: (9000 >> 7) & 0x7F, pressure: 1, pressureValue: 77 },
        { bend: bs.length, bendCh: bs[0]?.channel ?? null,
          lsb: bs[0]?.bytes?.[1] ?? null, msb: bs[0]?.bytes?.[2] ?? null,
          pressure: ps.length, pressureValue: ps[0]?.bytes?.[1] ?? null });
      void re;
    }
  }
  await kit.preview(false);

  // =============================================================================================
  // ZONE SPLITTER controller routing — which zone hears what, and on whose channel.
  // =============================================================================================
  await kit.fresh();
  {
    const Z = 'SplitZone';
    const zone = (over = {}) => ({ id: 'z0', label: 'Bass', lowNote: 36, highNote: 59, channel: 1,
      transpose: 0, curve: 'linear', velLow: 1, velHigh: 127, fixedVelocity: 100,
      velSwitchLow: 1, velSwitchHigh: 127, ccMode: 'all', ccList: [], sustain: true,
      bendMode: 'lastPlayed', pressureMode: 'lastPlayed', polyPressure: true,
      enabled: true, colour: 'FF5B9BD5', ...over });
    const LOW = zone({ id: 'z0', label: 'Bass', lowNote: 36, highNote: 59, channel: 4 });
    const HIGH = zone({ id: 'z1', label: 'Lead', lowNote: 60, highNote: 96, channel: 9 });
    const zid = await kit.make(Z, { 'Transform.x': 40, 'Transform.y': 60,
      'Transform.width': 620, 'Transform.height': 180, 'SplitZone.lowNote': 36,
      'SplitZone.highNote': 96, 'SplitZone.inputChannel': 0,
      'SplitZone.unmatched': 'drop', 'SplitZone.passChannel': 1,
      'SplitZone.zones': [LOW, HIGH] });
    await kit.wire();
    await kit.preview(true);
    await kit.settle(300);

    const zones = async (...list) => { await kit.set(zid, { 'SplitZone.zones': list }); await kit.settle(220); };
    const after = async (hex) => { await kit.forgetSent(); await send(hex); return kit.sent(); };
    /** The channels a controller reached, in order, deduplicated the way the router deduplicates. */
    const ccChannels = async (hex, n) => (await after(hex))
      .filter((m) => m.status === 0xB0 && m.data1 === n).map((m) => m.channel);

    // --- zones[].ccMode --------------------------------------------------------------------------
    {
      led.check(Z, "zones[].ccMode 'all'", 'a zone set to all forwards the mod wheel to its own channel, and both zones do',
        [4, 9], await ccChannels(cc(1, 1, 64), 1));

      await zones({ ...LOW, ccMode: 'none' }, HIGH);
      led.check(Z, "zones[].ccMode 'none'", 'a zone set to none hears nothing, while the other goes on hearing everything',
        [9], await ccChannels(cc(1, 1, 70), 1));

      await zones({ ...LOW, ccMode: 'list', ccList: [74] }, { ...HIGH, ccMode: 'none' });
      led.check(Z, "zones[].ccMode 'list' (a controller on the list)",
        'a zone set to a list hears the controllers on it', [4], await ccChannels(cc(1, 74, 80), 74));
      led.check(Z, "zones[].ccList (a controller that is not)",
        'and not the ones that are not — a list of 74 does not pass 1', [], await ccChannels(cc(1, 1, 80), 1));
    }

    // --- the value is carried, not just the routing -----------------------------------------------
    {
      await zones({ ...LOW, ccMode: 'all' }, { ...HIGH, ccMode: 'none' });
      const m = (await after(cc(1, 74, 33))).find((x) => x.status === 0xB0 && x.data1 === 74);
      led.check(Z, 'zones[].ccMode (the value travels with it)',
        'the forwarded controller carries its number and value, not merely its channel',
        { channel: 4, cc: 74, value: 33 },
        { channel: m?.channel ?? null, cc: m?.data1 ?? null, value: m?.data2 ?? null });
    }

    // --- zones[].sustain: its own switch, because everybody wants it per zone ----------------------
    {
      // CC 64 is checked BEFORE ccMode, so a zone hearing nothing else still takes the pedal.
      await zones({ ...LOW, ccMode: 'none', sustain: true }, { ...HIGH, ccMode: 'all', sustain: false });
      led.check(Z, 'zones[].sustain', 'the pedal has its own switch: a zone deaf to every other controller still takes it, and one listening to all of them can still refuse it',
        [4], await ccChannels(cc(1, 64, 127), 64));
      led.check(Z, 'zones[].sustain (the other controllers are unaffected)',
        'and the switch is about the pedal alone — the zone that refused it still hears the mod wheel',
        [9], await ccChannels(cc(1, 1, 50), 1));
    }

    // --- one message per channel, however many zones share it --------------------------------------
    {
      // A keyboard split into a low and high half of the SAME patch is two zones on one channel.
      // Forwarding twice is twice the traffic for no audible difference.
      await zones({ ...LOW, channel: 5, ccMode: 'all' }, { ...HIGH, channel: 5, ccMode: 'all' });
      led.check(Z, 'zones[].ccMode (two zones on one channel)',
        'two zones sharing a channel get the controller once between them, not once each',
        [5], await ccChannels(cc(1, 1, 90), 1));
    }

    // --- unmatched: what happens to a controller no zone claims ------------------------------------
    {
      await zones({ ...LOW, ccMode: 'none' }, { ...HIGH, ccMode: 'none' });
      await kit.set(zid, { 'SplitZone.unmatched': 'drop' });
      await kit.settle(200);
      led.check(Z, "unmatched 'drop' (controllers)", 'with every zone deaf and unmatched set to drop, the controller goes nowhere',
        [], await ccChannels(cc(1, 1, 30), 1));
      await kit.set(zid, { 'SplitZone.unmatched': 'pass', 'SplitZone.passChannel': 12 });
      await kit.settle(200);
      led.check(Z, "unmatched 'pass' (controllers)",
        'and with pass-through on it goes out on the pass channel, so a panel being set up does not go half-dead at the first touch of the mod wheel',
        [12], await ccChannels(cc(1, 1, 30), 1));
      await kit.set(zid, { 'SplitZone.unmatched': 'drop' });
      await kit.settle(200);
    }

    // --- zones[].bendMode: bend carries no note, so it is attributed --------------------------------
    {
      const bends = async (v14) => (await after(bend(1, v14)))
        .filter((m) => m.status === 0xE0).map((m) => m.channel);
      await zones({ ...LOW, bendMode: 'off' }, { ...HIGH, bendMode: 'off' });
      led.check(Z, "zones[].bendMode 'off'", 'a zone with bend off does not get it, and neither does the other',
        [], await bends(10000));

      await zones({ ...LOW, bendMode: 'always' }, { ...HIGH, bendMode: 'off' });
      led.check(Z, "zones[].bendMode 'always'", "and one set to always gets it whether or not anything has been played",
        [4], await bends(10000));

      // The fourteen bits again, on the splitter's own path this time.
      const b = (await after(bend(1, 10000))).find((m) => m.status === 0xE0);
      led.check(Z, 'zones[].bendMode (all fourteen bits)',
        'the routed bend keeps its low seven bits rather than arriving as a staircase',
        { lsb: 10000 & 0x7F, msb: (10000 >> 7) & 0x7F }, { lsb: b?.bytes?.[1] ?? null, msb: b?.bytes?.[2] ?? null });

      // 'lastPlayed' is the interesting one: it follows whoever claimed the most recent note-on.
      await zones({ ...LOW, bendMode: 'lastPlayed' }, { ...HIGH, bendMode: 'lastPlayed' });
      await send(noteOn(1, 40));                                  // a bass note: the low zone claims it
      const low = await bends(10000);
      await send(noteOff(1, 40));
      await send(noteOn(1, 72));                                  // a lead note: the high zone does
      const high = await bends(10000);
      await send(noteOff(1, 72));
      led.check(Z, "zones[].bendMode 'lastPlayed'",
        'bend follows the zone that claimed the last note played — a bass note sends it to the bass channel and a lead note to the lead channel',
        { afterBass: [4], afterLead: [9] }, { afterBass: low, afterLead: high });
    }

    // --- zones[].pressureMode: the same attribution, its own switch ----------------------------------
    {
      const ats = async (v) => (await after(pressure(1, v)))
        .filter((m) => m.status === 0xD0).map((m) => ({ channel: m.channel, value: m.data1 }));
      await zones({ ...LOW, pressureMode: 'off' }, { ...HIGH, pressureMode: 'off' });
      led.check(Z, "zones[].pressureMode 'off'", 'channel pressure is dropped by a zone that does not want it',
        [], await ats(88));
      await zones({ ...LOW, pressureMode: 'always' }, { ...HIGH, pressureMode: 'off' });
      led.check(Z, "zones[].pressureMode 'always'",
        'and reaches the zone that does, carrying its value — a synth that screams under aftertouch and one that sings is exactly why this is per zone',
        [{ channel: 4, value: 88 }], await ats(88));

      // 'sounding' is not 'lastPlayed': it asks who is holding a note NOW, not who held one last.
      await zones({ ...LOW, pressureMode: 'sounding' }, { ...HIGH, pressureMode: 'sounding' });
      await send(noteOn(1, 40));
      const while_ = await ats(70);
      await send(noteOff(1, 40));
      const after_ = await ats(70);
      led.check(Z, "zones[].pressureMode 'sounding'",
        'pressure goes to whoever is holding a note at the time, and to nobody once the key is released',
        { holding: [{ channel: 4, value: 70 }], released: [] }, { holding: while_, released: after_ });
    }

    // --- zones[].polyPressure: it names its note, so it needs no rule ---------------------------------
    {
      await zones({ ...LOW, polyPressure: true, transpose: -12 }, { ...HIGH, polyPressure: true });
      await send(noteOn(1, 40));
      const on = (await after(polyAt(1, 40, 64))).filter((m) => m.status === 0xA0)
        .map((m) => ({ channel: m.channel, note: m.data1, value: m.data2 }));
      led.check(Z, 'zones[].polyPressure (on)',
        "per-note pressure follows its own note's routing, transposition included — the zone drops it an octave, so the pressure goes to note 28 on channel 4",
        [{ channel: 4, note: 28, value: 64 }], on);

      await zones({ ...LOW, polyPressure: false, transpose: -12 }, { ...HIGH, polyPressure: false });
      const off = (await after(polyAt(1, 40, 64))).filter((m) => m.status === 0xA0);
      led.check(Z, 'zones[].polyPressure (off)',
        'and a zone that refuses per-note pressure gets none, even while its note is still sounding',
        0, off.length);
      await send(noteOff(1, 40));
    }

    // --- inputChannel: whose controllers these are -----------------------------------------------------
    {
      await zones({ ...LOW, ccMode: 'all' }, { ...HIGH, ccMode: 'none' });
      await kit.set(zid, { 'SplitZone.inputChannel': 6 });
      await kit.settle(200);
      led.check(Z, 'inputChannel (pinned, another channel)',
        'a splitter watching channel 6 ignores controllers on channel 1', [], await ccChannels(cc(1, 1, 20), 1));
      led.check(Z, 'inputChannel (pinned, its own channel)',
        'and forwards the ones on the channel it watches', [4], await ccChannels(cc(6, 1, 20), 1));
      await kit.set(zid, { 'SplitZone.inputChannel': 0 });
      await kit.settle(200);
      led.check(Z, 'inputChannel (omni)', 'and set to omni it takes whatever arrives, on any channel',
        [4], await ccChannels(cc(11, 1, 20), 1));
    }

    // --- and it still routes after a save and reopen ------------------------------------------------
    {
      await zones({ ...LOW, ccMode: 'list', ccList: [74], channel: 4, bendMode: 'always' },
        { ...HIGH, ccMode: 'none', channel: 9, bendMode: 'off' });
      await kit.reopen(zid);
      await kit.wire();
      await kit.preview(true);
      await kit.settle(400);
      const listed = await ccChannels(cc(1, 74, 55), 74);
      const notListed = await ccChannels(cc(1, 1, 55), 1);
      const bends = (await after(bend(1, 4000))).filter((m) => m.status === 0xE0).map((m) => m.channel);
      led.check(Z, 'save/reopen (the routing)',
        'a reopened splitter still forwards only the controller on its list, still to channel 4, and still bends only for the zone that asked',
        { listed: [4], notListed: [], bends: [4] }, { listed, notListed, bends });
    }
  }
  await kit.preview(false);

  // =============================================================================================
  // SETLIST scenes[].sysex — the bulk message a program change alone cannot send.
  // =============================================================================================
  await kit.fresh();
  {
    const S = 'Setlist';
    const scene = (over = {}) => ({ id: 's1', name: 'One', note: '', values: {}, program: null,
      bankMsb: null, bankLsb: null, bpm: null, enabled: true, colour: '', ccs: [], sysex: [], ...over });
    const sid = await kit.make(S, { 'Transform.x': 40, 'Transform.y': 60,
      'Transform.width': 320, 'Transform.height': 160, 'Setlist.index': 0,
      'Setlist.channel': 1, 'Setlist.sendProgram': true, 'Setlist.crossfadeMs': 0,
      'Setlist.scenes': [
        scene({ id: 's1', name: 'Plain' }),
        scene({ id: 's2', name: 'Dump', program: 5, ccs: [{ channel: null, cc: 91, value: 0 }],
          sysex: [0xF0, 0x43, 0x10, 0x4C, 0x02, 0x01, 0x00, 0xF7] }),
        scene({ id: 's3', name: 'Unframed', sysex: [0x41, 0x10, 0x42, 0x12] }),
        scene({ id: 's4', name: 'Dirty', sysex: [0xF0, 0x41, 0x90, 0x42, 0xF7] })] });
    await kit.wire();
    await kit.preview(true);
    await kit.settle(300);

    const goTo = async (index) => {
      await kit.forgetSent();
      await kit.set(sid, { 'Setlist.index': index });
      await kit.settle(340);
      return kit.sent();
    };

    // --- scenes[].sysex: the bytes ----------------------------------------------------------------
    {
      await goTo(1);
      const wire = await goTo(0);
      led.check(S, 'scenes[].sysex (a scene without one)', 'a scene carrying no system exclusive sends none',
        0, wire.filter((m) => m.bytes[0] === 0xF0).length);

      const dump = await goTo(1);
      const sx = dump.filter((m) => m.bytes[0] === 0xF0);
      led.check(S, 'scenes[].sysex', 'a scene carrying one puts those exact bytes on the wire, whole',
        { count: 1, bytes: [0xF0, 0x43, 0x10, 0x4C, 0x02, 0x01, 0x00, 0xF7] },
        { count: sx.length, bytes: sx[0]?.bytes ?? null });
    }

    // --- and it goes LAST, after the program change and its controllers -----------------------------
    {
      const wire = await goTo(0).then(() => goTo(1));
      const kinds = wire.map((m) => (m.bytes[0] === 0xF0 ? 'sysex'
        : m.status === 0xC0 ? 'program' : m.status === 0xB0 ? 'cc' : 'other'));
      led.check(S, 'scenes[].sysex (the order)',
        'the dump follows the program change and the controllers rather than preceding them — a patch change resets a synth, so anything sent first is wiped by the patch it was meant to modify',
        ['program', 'cc', 'sysex'], kinds);
    }

    // --- framing, which is the component's own promise ----------------------------------------------
    {
      // "an unterminated sysex leaves the receiving device waiting for the rest of a message that
      // never comes" — so normalizeSysex frames it rather than trusting the input.
      const wire = await goTo(2);
      const sx = wire.filter((m) => m.bytes[0] === 0xF0)[0];
      led.check(S, 'scenes[].sysex (an unframed one is framed)',
        'bytes authored without the F0 and F7 go out with them, so the receiving device is not left waiting for the end of a message that never comes',
        [0xF0, 0x41, 0x10, 0x42, 0x12, 0xF7], sx?.bytes ?? null);

      const dirty = (await goTo(3)).filter((m) => m.bytes[0] === 0xF0)[0];
      led.check(S, 'scenes[].sysex (a status byte in the body)',
        'and a byte in the body with the high bit set — which would end the message early on the wire — is dropped rather than sent',
        [0xF0, 0x41, 0x42, 0xF7], dirty?.bytes ?? null);
    }

    // --- sendProgram gates the whole plan, dump included ----------------------------------------------
    {
      await goTo(0);
      await kit.set(sid, { 'Setlist.sendProgram': false });
      await kit.settle(200);
      const wire = await goTo(1);
      led.check(S, 'sendProgram (false) — the dump goes with it',
        'switching the outbound MIDI off silences the system exclusive too, not merely the program change',
        { sysex: 0, program: 0 },
        { sysex: wire.filter((m) => m.bytes[0] === 0xF0).length,
          program: wire.filter((m) => m.status === 0xC0).length });
      await kit.set(sid, { 'Setlist.sendProgram': true });
      await kit.settle(200);
    }

    // --- and after a save and reopen -------------------------------------------------------------------
    {
      await goTo(0);
      await kit.reopen(sid);
      await kit.wire();
      await kit.preview(true);
      await kit.settle(400);
      const wire = await goTo(1);
      const sx = wire.filter((m) => m.bytes[0] === 0xF0);
      led.check(S, 'save/reopen (the dump)',
        'a reopened setlist sends the same bytes, still after the program change',
        { count: 1, bytes: [0xF0, 0x43, 0x10, 0x4C, 0x02, 0x01, 0x00, 0xF7], afterProgram: true },
        { count: sx.length, bytes: sx[0]?.bytes ?? null,
          afterProgram: wire.findIndex((m) => m.status === 0xC0) < wire.findIndex((m) => m.bytes[0] === 0xF0) });
    }
  }
  await kit.preview(false);

  // =============================================================================================
  // followPanelKey — one key for the panel, and the components that agreed to keep in step.
  // =============================================================================================
  await kit.fresh();
  {
    /**
     * THE OLD REASON FOR THIS ROW WAS WRONG, and it is worth saying why rather than just replacing
     * it. Three ledgers carried "the panel key is a panel-level broadcast written by another
     * control; it needs a second control driving it". No control writes it. `setPanelKey` is a
     * store action, and following is a BROADCAST rather than an indirection: it writes the new key
     * and scale into each follower's OWN section, so nothing downstream reads the panel — the
     * renderers, the editors, export and an older build all keep reading what they always read.
     *
     * That shape is what makes this measurable in three ways at once: the document carries the new
     * key, the drawing says so, and the notes the component plays move with it.
     */
    const setKey = (root, scale) => kit.page.evaluate(async ({ root, scale }) => {
      const { setPanelKey } = await import('/src/CE_Application/stores/panelKeyActions.js');
      const r = setPanelKey({ root, scale, enabled: true });
      return { ok: r.ok, changed: r.changed, skipped: r.skipped.map((e) => ({ section: e.section, reason: e.reason })) };
    }, { root, scale });

    // Four steps, four rows, one cell each — a rising line whose PITCHES are what the key moves.
    const stair = { '0:0': { velocity: null, tie: false }, '1:1': { velocity: null, tie: false },
      '2:2': { velocity: null, tie: false }, '3:3': { velocity: null, tie: false } };

    const harm = await kit.make('Harmoniser', { 'Transform.x': 40, 'Transform.y': 40,
      'Transform.width': 460, 'Transform.height': 150, 'Harmoniser.mode': 'diatonic',
      'Harmoniser.key': 0, 'Harmoniser.scale': 'major', 'Harmoniser.followPanelKey': true,
      'Harmoniser.size': 3, 'Harmoniser.channel': 1, 'Harmoniser.strumMs': 0,
      'Harmoniser.showHeader': true });
    const phrase = await kit.make('Phrase', { 'Transform.x': 40, 'Transform.y': 210,
      'Transform.width': 460, 'Transform.height': 170, 'Phrase.running': false,
      'Phrase.mode': 'degree', 'Phrase.key': 0, 'Phrase.scale': 'minor',
      'Phrase.followPanelKey': true, 'Phrase.baseOctave': 3, 'Phrase.transpose': 0,
      'Phrase.steps': 4, 'Phrase.rows': 4, 'Phrase.direction': 'forward', 'Phrase.rate': 8,
      'Phrase.channel': 1, 'Phrase.velocity': 100, 'Phrase.gate': 0.5,
      'Phrase.syncToTransport': false, 'Phrase.pattern': stair, 'Phrase.showHeader': true });
    const rec = await kit.make('Recorder', { 'Transform.x': 520, 'Transform.y': 40,
      'Transform.width': 300, 'Transform.height': 150, 'Recorder.key': 0,
      'Recorder.scale': 'minor', 'Recorder.followPanelKey': true });
    // The control that did NOT agree. Every row below has it beside the followers, because "the
    // panel key changed everything" and "the panel key changed the things that asked" are different
    // promises and only the second one is made.
    const holdout = await kit.make('ChordPad', { 'Transform.x': 520, 'Transform.y': 210,
      'Transform.width': 300, 'Transform.height': 170, 'ChordPad.key': 0,
      'ChordPad.scale': 'major', 'ChordPad.followPanelKey': false });
    await kit.preview(true);
    await kit.settle(350);

    const keyOf = async (id, section) => ({
      key: await kit.read(id, `${section}.key`), scale: await kit.read(id, `${section}.scale`) });
    // The two headers are laid out differently and it matters which text you read. The phrase puts
    // its key label FIRST ("C minor · 4 steps"); the harmoniser puts the chord name first and hangs
    // the key off the right-hand end, so its text[0] is the chord — "—" when nothing is held, which
    // reads as a key label that never changes.
    const phraseHeader = async (id) => (await kit.texts(id))[0] ?? null;
    const harmHeader = async (id) =>
      (await kit.shapes(id, 'text', (n) => n['text-anchor'] === 'end'))[0]?.text ?? null;
    /**
     * The set of pitches the phrase plays over a lap, sorted — NOT the sequence in order.
     *
     * A stopped phrase keeps its step index, so the next run resumes where the last one left off
     * rather than at step 0. Asserting on `notes[0]` therefore asks the sequencer to have forgotten
     * something it is right to remember, and reads as a key that did not move. The pitch SET over a
     * window longer than one lap answers the question actually being asked — which four notes is it
     * playing — and does not care where in the pattern the window opened.
     */
    const phrasePitches = async () => {
      await kit.forget();
      await kit.set(phrase, { 'Phrase.running': true });
      await kit.settle(700);                       // 125ms a step at rate 8: more than one lap of four
      await kit.set(phrase, { 'Phrase.running': false });
      await kit.settle(160);
      const ons = (await kit.notes()).filter((n) => n.kind === 'on').map((n) => n.note);
      return [...new Set(ons)].sort((a, b) => a - b);
    };

    const before = { harm: await keyOf(harm, 'Harmoniser'), phrase: await keyOf(phrase, 'Phrase'),
      rec: await keyOf(rec, 'Recorder'), holdout: await keyOf(holdout, 'ChordPad') };
    const phraseBefore = await phrasePitches();
    const harmHeaderBefore = await harmHeader(harm);
    const phraseHeaderBefore = await phraseHeader(phrase);

    // --- the broadcast ----------------------------------------------------------------------------
    const result = await setKey(5, 'dorian');            // F dorian
    await kit.settle(400);

    // --- followPanelKey: the document -------------------------------------------------------------
    {
      led.check('Harmoniser', 'followPanelKey (the document)',
        "a following harmoniser's own key and scale are rewritten to the panel's — a broadcast, so what the file carries afterwards is F dorian and not a pointer to the panel",
        { key: 5, scale: 'dorian' }, await keyOf(harm, 'Harmoniser'));
      led.check('Phrase', 'followPanelKey (the document)', 'and the phrase sequencer the same, from its own C minor',
        { key: 5, scale: 'dorian' }, await keyOf(phrase, 'Phrase'));
      led.check('Recorder', 'followPanelKey (the document)', 'and the recorder, which carries a key for its quantiser',
        { key: 5, scale: 'dorian' }, await keyOf(rec, 'Recorder'));
      led.check('ChordPad', 'followPanelKey (false)',
        'while the control that did not agree keeps the key it was given, which is the whole point of the switch',
        before.holdout, await keyOf(holdout, 'ChordPad'));
      led.check('Harmoniser', 'followPanelKey (what the action reports)',
        'and the action reports exactly the three it changed, with nothing it had to skip',
        { ok: true, changed: 3, skipped: [] }, result);
    }

    // --- followPanelKey: the drawing ----------------------------------------------------------------
    {
      const h = await harmHeader(harm);
      const p = await phraseHeader(phrase);
      led.check('Harmoniser', 'followPanelKey (the drawing)',
        'the harmoniser draws the key it is now in rather than the one it was authored in',
        { wasInC: true, changed: true, says: true },
        // The label carries the voicing and the size after the key ("C Major · Close · 3"), so the
        // key is the head of it rather than the whole of it.
        { wasInC: /^C Major\b/.test(String(harmHeaderBefore)), changed: h !== harmHeaderBefore,
          says: /F\b/.test(String(h)) && /[Dd]orian/.test(String(h)) });
      led.check('Phrase', 'followPanelKey (the drawing)', 'and so does the phrase sequencer',
        { changed: true, says: true },
        { changed: p !== phraseHeaderBefore, says: /F\b/.test(String(p)) && /dorian/i.test(String(p)) });
    }

    // --- followPanelKey: the notes ---------------------------------------------------------------------
    {
      // C minor at octave 3 is 48, 50, 51, 53. F dorian is rooted five semitones up with a
      // different third: 53, 55, 56, 58. Both the root and the intervals have to move, which is why
      // this is the row that matters — a transposition alone would give 53, 55, 56, 58 from minor
      // too, and dorian differs from minor at the sixth.
      const after = await phrasePitches();
      led.check('Phrase', 'followPanelKey (what it plays)',
        'the phrase plays the new key: the four degrees that were C minor at octave 3 come out as F dorian, which moves the root five semitones AND changes the intervals',
        { before: [48, 50, 51, 53], after: [53, 55, 56, 58] },
        { before: phraseBefore, after });
    }

    // --- a scale the components have no name for --------------------------------------------------------
    {
      // The care this file was written with: "a panel set to a scale a component has no name for
      // must be REPORTED, not silently rounded to major — a chord pad quietly playing the wrong
      // mode is the kind of bug somebody blames on their ears."
      const stuck = await keyOf(harm, 'Harmoniser');
      const r = await setKey(2, 'wholeTone');
      await kit.settle(300);
      led.check('Harmoniser', 'followPanelKey (a scale with no component name)',
        'a panel set to whole tone leaves its followers exactly as they were rather than rounding them to something else, and names each one it could not move',
        { key: stuck.key, scale: stuck.scale, changed: 0, skippedSections: 3, reasonNamesTheScale: true },
        { ...(await keyOf(harm, 'Harmoniser')), changed: r.changed,
          skippedSections: r.skipped.length,
          reasonNamesTheScale: r.skipped.every((e) => /wholeTone/.test(String(e.reason))) });
    }

    // --- and the follower is still following after a save and reopen --------------------------------------
    {
      await setKey(5, 'dorian');
      await kit.settle(300);
      await kit.reopen(phrase);
      await kit.preview(true);
      await kit.settle(400);
      led.check('Phrase', 'save/reopen (the broadcast key)',
        'a reopened panel carries the key the broadcast wrote — which is the point of writing it into the section rather than reading the panel at render time',
        { key: 5, scale: 'dorian', follows: true },
        { ...(await keyOf(phrase, 'Phrase')), follows: await kit.read(phrase, 'Phrase.followPanelKey') });
      const after = await phrasePitches();
      led.check('Phrase', 'save/reopen (it still plays it)',
        'and plays it — the reopened phrase sounds F dorian, not the C minor it was authored in',
        [53, 55, 56, 58], after);
    }
  }
  await kit.preview(false);

  // =============================================================================================
  // THE INERT SWEEP — declared options with no reader, found by looking rather than by noticing.
  // =============================================================================================
  //
  // The inert rows collected across this pass were each found by tripping over one. That is not a
  // method, and it cannot produce a FINAL list, so the list was instead derived: every key declared
  // in `sectionDefaults.js` (1,046 of them across 63 sections), checked against every mention in
  // `CE/web/src` (723 files). Eight keys had no mention at all.
  //
  // Four of the eight were FALSE POSITIVES and are recorded here because the check that caught them
  // is the interesting part: `DrumPads.cornerTopLeft`, `cornerTopRight`, `cornerBottomLeft` and
  // `cornerBottomRight` are read through `cornerField(corner)`, which BUILDS the key by string
  // concatenation. A sweep for a literal identifier cannot see a computed one, so every candidate
  // below was confirmed by hand against the renderer, the editor and the verb tables before being
  // called inert.
  //
  // The rows are recorded here rather than in the suite that owns each component, because what the
  // sweep found is one fact about the whole catalogue rather than eight facts about eight
  // components — and because two of them are in root's half.
  await kit.fresh();
  {
    // --- published as a scripting verb, and read by nothing: a caller exists and gets silence ------
    led.inert('Meter', 'showScaleLabels', 'value-scale labels beside the meter',
      'NOT PREVIOUSLY CATALOGUED. No reader anywhere in src/ — MeterRenderer draws no scale labels at '
      + 'all — and yet it is published: derivedFlagVerbs() in componentVerbs.js turns every `show*` '
      + 'boolean in a section into a verb automatically, so `meter.showScaleLabels` reaches all seven '
      + 'engines by derivation rather than by anyone writing it down. Same shape as '
      + 'Constellation.showField and found the same way, by the sweep rather than by use.');
    led.inert('Constellation', 'showField', 'a heat field behind the stars',
      'still inert, and still derived into `constellation.showField` by the same rule. Only '
      + 'TimbreRenderer reads a showField, and that is the Timbre\'s own.');
    led.inert('Looper', 'quantizeLoop', 'snap the loop length to whole beats',
      'still inert, and the only one of the three written by hand: componentVerbs.js line 292 maps '
      + '`looper.quantize` to it. Nothing in src/ reads it — not the renderer, not looperLayout, not '
      + 'the Looper editor, which does not offer it.');

    // --- reachable from nowhere: declared, and that is all ------------------------------------------
    led.inert('Core', 'alwaysOnTop', 'keep this control above the others',
      'NOT PREVIOUSLY CATALOGUED. Zero mentions in src/, zero in the properties panel, zero in the '
      + 'verb tables — and `Core` is not a scriptable family, so unlike the three above there is no '
      + 'caller to disappoint. A z-order promise the canvas does not keep; z-order is the paint order.');
    led.inert('ContentLayout', 'textAboveIcon', 'stack the label above the icon',
      'NOT PREVIOUSLY CATALOGUED. Its only mention outside the defaults is a fixture in '
      + 'tools/scripts/qa/sheets/properties.mjs, which sets it and never reads it.');
    led.inert('ChordPad', 'fieldColour', 'the backing field colour',
      'still inert, and still the mildest of them: ChordPadRenderer has no fieldCss, the ChordPad '
      + 'editor does not offer it, and it is not a verb. Unreachable from every direction at once.');
    led.inert('Envelope', 'xLabel', 'axis label',
      'still inert. EnvelopeRenderer draws no <text> at all; written only by '
      + 'tools/scripts/an1x-panel/make-an1x-panel.mjs, and never read back.');
    led.inert('Envelope', 'yLabel', 'axis label', 'same as xLabel, and in the same comment block.');
  }

  led.report();
  assert.deepEqual(kit.failures, [], 'page errors during the pass');
  assert.deepEqual(led.failures, [], 'defects');
  console.log('\n--- ledger ---\n' + led.markdown());
} finally {
  await kit.close();
}
