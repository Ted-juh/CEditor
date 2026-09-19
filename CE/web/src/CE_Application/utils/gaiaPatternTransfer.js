import { gaiaPatternReadGroups, decodeGaiaPattern, patternValuesForSend } from './gaiaPatternEditing.js';

/** Transport-independent coordinator. Only fresh incoming evidence can complete a read. */
export function createGaiaPatternTransfer({ control, values, revision, route, feedback, read, write, apply, status, finishRead = () => {},
  pause = ms => new Promise(resolve => setTimeout(resolve, ms)), timeoutMs = 3500, sendGapMs = 20 }) {
  let busy = false, cancelled = false, serial = 0;
  return {
    get busy() { return busy; },
    cancel() { cancelled = true; },
    async run(action) {
      if (busy) return;
      busy = true; cancelled = false;
      let activeRead = '';
      const sentIds = new Set();
      const initialRevision = revision(), initialRoute = route(), generation = feedback().generation;
      const check = () => {
        if (cancelled) throw new Error('Cancelled. Already queued writes cannot be recalled.');
        if (!initialRoute.ready || !route().ready) throw new Error('Connect the GAIA MIDI input and output first.');
        if (initialRoute.key !== route().key || generation !== feedback().generation) throw new Error('Device route or patch changed; retry on the current patch.');
        if (feedback().identityError) throw new Error('Device identity mismatch; check the selected profile.');
        if (initialRevision !== revision()) throw new Error('Pattern changed during transfer. Edits kept; retry when ready.');
        for (const id of sentIds) if (feedback().writes?.[id]?.state === 'error') throw new Error(feedback().writes[id].error || 'Send failed.');
      };
      try {
        check();
        if (action === 'read') {
          const raw = {};
          for (let index = 0; index < gaiaPatternReadGroups.length; index++) {
            check();
            const group = gaiaPatternReadGroups[index];
            const baseline = Object.fromEntries(group.ids.map(id => [id, feedback().received?.[id]?.sequence ?? -1]));
            const correlationId = `gaia_pattern_read_${Date.now()}_${++serial}`;
            activeRead = correlationId;
            status(`READING ${index + 1}/17 — editor unchanged`, true);
            read({ request: group.request, correlationId });
            const deadline = Date.now() + timeoutMs;
            while (true) {
              check();
              const current = feedback();
              const error = current.reads?.[correlationId];
              if (error?.state === 'error') throw new Error(error.error || 'Read failed.');
              if (group.ids.every(id => (current.received?.[id]?.sequence ?? -1) > baseline[id])) {
                for (const id of group.ids) raw[id] = current.received[id].value;
                finishRead(correlationId);
                activeRead = '';
                break;
              }
              if (Date.now() >= deadline) throw new Error(`No complete reply for ${group.request}. Editor unchanged.`);
              await pause(25);
            }
          }
          check();
          apply(decodeGaiaPattern(raw));
          status('READ COMPLETE · Undo restores the previous editor pattern', false);
        } else {
          const entries = Object.entries(patternValuesForSend(control, values()));
          for (let index = 0; index < entries.length; index++) {
            check();
            const [parameterId, value] = entries[index];
            write({ parameterId, value });
            sentIds.add(parameterId);
            const failed = feedback().writes?.[parameterId];
            if (failed?.state === 'error') throw new Error(failed.error || 'Send failed.');
            if (index % 16 === 0) status(`SENDING ${index + 1}/${entries.length} · temporary patch only`, true);
            await pause(sendGapMs);
          }
          check();
          status('QUEUED · Read Pattern to verify; not saved to a user patch', false);
        }
      } catch (error) {
        if (activeRead) finishRead(activeRead, error.message);
        status(`${action === 'send' ? 'SEND STOPPED · hardware may be partially updated · ' : 'READ STOPPED · '}${error.message}`, false, true);
      } finally { busy = false; }
    },
  };
}
