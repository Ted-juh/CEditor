// ce.ci in the panel view (docs/design/ce-ci-module.md). ciCore.js does what every runtime does; this
// gives it a host over the native bridge, where the device layer's MIDI-CI session lives:
//   page -> native  "ciCommand"          { requestId, token, op, ... }
//   native -> page  "ciCommandAnswered"  { requestId, answer }   at once
//                   "ciReply"            { token, final, result } what the device said, later
//                   "ciDiscovered", "ciDeviceRemoved", "ciProfileChanged"
// The bridge cannot answer while a script waits, so the commands that answer at once (devices,
// profiles) answer from what the page has heard: every device found and every profile change.
import { ciCommands } from './ciCore.js';
import { midiCiPropertiesToProfile } from '../generated/dpd/import-midici.mjs';

/**
 * `bridge`: { send(event, payload) -> boolean, raise(name, payload) }. `send` answers false when there
 * is no native host; `raise` delivers a panel event (onCiDiscovered...) to the scripts.
 */
export function createCiBridge(bridge) {
  const instances = new Set();
  const devices = new Map();      // muid -> device, as last heard
  const profiles = new Map();     // muid -> [{ id, address, enabled }]
  const pending = new Map();      // token -> { op, instance }
  let next = 1;

  function noteDevice(d) {
    if (d && typeof d === 'object' && Number.isFinite(Number(d.muid))) devices.set(Number(d.muid), d);
  }

  function failed(token, op, error) {
    const result = op === 'discover' || op === 'profiles' ? []
      : op === 'subscribe' ? { command: 'end', ok: false, message: error }
        : { ok: false, status: 0, message: error };
    for (const instance of instances) instance.receive({ token, final: true, result });
  }

  /** What the native side sends back. */
  function heard(name, payload) {
    if (name === 'ciCommandAnswered') {
      const answer = payload?.answer;
      const token = String(payload?.requestId ?? '');
      const asked = pending.get(token);
      if (asked && (!answer || answer.ok === false)) {
        pending.delete(token);
        const why = typeof answer?.error === 'string' && answer.error !== '' ? answer.error : 'MIDI-CI is not available here';
        asked.say('error', `ce.ci.${asked.op}: ${why}.`);
        failed(token, asked.op, why);
      }
      return;
    }
    if (name === 'ciReply') {
      const token = String(payload?.token ?? '');
      const asked = pending.get(token);
      if (asked?.op === 'discover' && Array.isArray(payload?.result)) {
        for (const [muid, d] of devices) if (d?.role === asked.role) devices.delete(muid);
        payload.result.forEach(noteDevice);
      }
      if (asked?.op === 'profiles' && Array.isArray(payload?.result)) profiles.set(asked.muid, payload.result);
      if (payload?.final === true) pending.delete(token);
      for (const instance of instances) instance.receive(payload);
      return;
    }
    if (name === 'ciDiscovered') { noteDevice(payload); bridge.raise('onCiDiscovered', payload); return; }
    if (name === 'ciDeviceRemoved') {
      devices.delete(Number(payload?.muid));
      profiles.delete(Number(payload?.muid));
      bridge.raise('onCiDeviceRemoved', payload);
      return;
    }
    if (name === 'ciProfileChanged') {
      const muid = Number(payload?.muid);
      const list = (profiles.get(muid) ?? []).filter((p) => !(p.id === payload.id && p.address === payload.address));
      list.push({ id: payload.id, address: payload.address, enabled: payload.enabled === true });
      profiles.set(muid, list);
      bridge.raise('onCiProfileChanged', payload);
    }
  }

  /** ce.ci for one script: its messages and functions are its own. */
  function forScript({ say, call }) {
    const waiters = {};
    const host = {
      say,
      waiters: () => waiters,
      call,
      ask(fields) {
        if (fields.op === 'get' || fields.op === 'set' || fields.op === 'subscribe') {
          const d = devices.get(Number(fields.muid));
          if (!d) return { ok: false, error: `no MIDI-CI device ${fields.muid} has answered: ce.ci.discover() finds them` };
          if (d.propertyExchange !== true) return { ok: false, error: 'the device does not support property exchange' };
        }
        const token = `w${next}`;
        next += 1;
        pending.set(token, { op: fields.op, role: fields.role, muid: Number(fields.muid), say });
        if (bridge.send('ciCommand', { ...fields, token, requestId: token }) !== true) {
          pending.delete(token);
          return { ok: false, error: 'MIDI-CI needs the app or the plug-in to reach a device' };
        }
        return { ok: true, token };
      },
      query(fields) {
        if (fields.op === 'devices') {
          return [...devices.values()].filter((d) => !fields.role || d.role === fields.role).map((d) => ({ ...d }));
        }
        if (fields.op === 'profiles') return (profiles.get(Number(fields.muid)) ?? []).map((p) => ({ ...p }));
        if (fields.op === 'unsubscribe') {
          const known = pending.has(fields.id);
          pending.delete(fields.id);
          if (known) bridge.send('ciCommand', { ...fields, requestId: '' });
          return known;
        }
        if (fields.op === 'setProfile') {
          if (!devices.has(Number(fields.muid))) return { ok: false, error: `no MIDI-CI device ${fields.muid} has answered: ce.ci.discover() finds them` };
          return bridge.send('ciCommand', { ...fields, requestId: '' }) === true
            ? true : { ok: false, error: 'MIDI-CI needs the app or the plug-in to reach a device' };
        }
        return undefined;
      },
    };
    const ci = ciCommands(host);
    instances.add(ci);

    /** A draft device profile from what the device reports (import-midici.mjs, as the Discovery screen). */
    function draftProfile(muid, fn) {
      if (typeof fn !== 'function') {
        say('error', 'ce.ci.draftProfile: fn must be a function to call with the draft, so nothing was asked.');
        return false;
      }
      const d = devices.get(Number(muid));
      if (!d || d.propertyExchange !== true) {
        say('error', `ce.ci.draftProfile: device ${String(muid)} ${d ? 'does not support property exchange' : 'has not answered: ce.ci.discover() finds them'}, so nothing was asked.`);
        return false;
      }
      const wanted = ['DeviceInfo', 'AllCtrlList', 'ChCtrlList', 'ProgramList'];
      const got = {};
      const missing = [];
      const step = (i) => {
        if (i >= wanted.length) {
          let draft;
          try {
            const controllers = [...(Array.isArray(got.AllCtrlList) ? got.AllCtrlList : []), ...(Array.isArray(got.ChCtrlList) ? got.ChCtrlList : [])];
            draft = midiCiPropertiesToProfile({ deviceInfo: got.DeviceInfo ?? {}, allCtrlList: controllers, programList: got.ProgramList ?? [] });
          } catch (e) {
            say('error', `ce.ci.draftProfile: the draft could not be made: ${e?.message ?? e}.`);
            call(fn, undefined);
            return;
          }
          const summary = { ...(draft.summary ?? {}), missing };
          call(fn, { profile: draft.profile, summary });
          return;
        }
        const ok = ci.get(muid, wanted[i], (result) => {
          if (result && result.ok === true) got[wanted[i]] = result.body;
          else missing.push(wanted[i]);
          step(i + 1);
        });
        if (!ok) { missing.push(wanted[i]); step(i + 1); }
      };
      step(0);
      return true;
    }

    return { ...ci, draftProfile };
  }

  return { forScript, heard, reset() { instances.clear(); pending.clear(); } };
}
