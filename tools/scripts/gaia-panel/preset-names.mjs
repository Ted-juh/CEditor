// Read the actual twelve-character SH-01 names. No catalogue guesses and no DT1 writes.
// User memory has direct RQ1 addresses; ROM/USB/PCM are read via the selected patch.
// Serialized into the panel so this works in the editor and exported panel runtimes.
import { updateGaiaScreen } from './status-display.mjs';
function installGaiaNames(config) {
  const role = config.role;
  let cache = {};
  let job = null;
  let serial = 0;
  let cacheKey = '';
  let fresh = {};
  let selected = null;
  let selectionConfirmed = false;
  let routeKey = '';
  let wasConnected = false;
  let loadSerial = 0;
  let message = '';
  const bankFor = slot => config.banks.find(b => slot >= b.startSlot && slot < b.startSlot + b.slotCount);
  const safeId = id => id.replace(/-/g, '_');
  function slotLabel(slot) {
    const bank = bankFor(slot);
    const n = slot - bank.startSlot;
    return bank.id === 'preset-pcm' ? 'PCM ' + (n + 1) : 'ABCDEFGH'[Math.floor(n / 8)] + '-' + (n % 8 + 1);
  }
  function buttonName(slot) {
    const b = bankFor(slot), n = slot - b.startSlot;
    return 'recall_' + safeId(b.id) + '_' + 'ABCDEFGH'[Math.floor(n / 8)] + (n % 8 + 1);
  }
  function headerName(slot) {
    const b = bankFor(slot);
    return 'patch_bank_header_' + safeId(b.id) + '_' + 'ABCDEFGH'[Math.floor((slot - b.startSlot) / 8)];
  }
  function paintSlot(slot) {
    const button = buttonName(slot), name = typeof cache[slot] === 'string' ? cache[slot] : '';
    const chosen = slot === selected;
    const source = name ? fresh[slot] ? 'Read from GAIA this session (snapshot, not continuous monitoring).' : 'Cached name; not refreshed in this connection/session.' : 'Name has not been read.';
    set(button + '.text.content', (name ? fresh[slot] ? '● ' : '○ ' : '— ') + slotLabel(slot) + '  ' + (name || '[not read]'));
    set(button + '.core.tooltip', source + (chosen ? selectionConfirmed ? ' Current bank/program confirmed by GAIA.' : ' Recall requested; hardware selection NOT confirmed.' : '') + ' Click to recall; unsaved sound edits may be lost.');
    set(button + '.background.fill.colour', chosen ? selectionConfirmed ? 'FF24483C' : 'FF59492B' : 'FF333D46');
    set(button + '.background.border.colour', chosen ? selectionConfirmed ? 'FF8CD7A0' : 'FFE6C66C' : 'FF65717C');
    set(button + '.text.fill.colour', chosen ? 'FFFFFFFF' : fresh[slot] ? 'FFB8E7D0' : 'FFBCC5CD');
  }
  function paintHeader(slot) {
    if (slot == null || !bankFor(slot)) return;
    const b = bankFor(slot), group = Math.floor((slot - b.startSlot) / 8);
    const active = selected != null && headerName(selected) === headerName(slot);
    set(headerName(slot) + '.text.content', (b.id === 'preset-pcm' ? 'PCM' : 'BANK ' + 'ABCDEFGH'[group])
      + (active ? selectionConfirmed ? ' · SELECTED' : ' · REQUESTED' : ''));
    set(headerName(slot) + '.text.fill.colour', active ? selectionConfirmed ? 'FF8CD7A0' : 'FFE6C66C' : 'FFBAC5CE');
  }
  function status(next) {
    if (next != null) message = next;
    const pick = selected == null ? 'Selection unknown' : (selectionConfirmed ? 'Confirmed ' : 'Requested ') + bankFor(selected).label + ' ' + slotLabel(selected);
    updateGaiaScreen({
      patch_selection: 'PATCH: ' + pick,
      patch_name: 'NAME: ' + (selected == null ? 'SELECTION UNKNOWN' : cache[selected] || 'NOT READ'),
      patch_source: selected == null ? 'Use PATCH BANKS / CHECK SELECTION to identify.'
        : !cache[selected] ? 'Name not read. READ NAMES on the bank page.'
          : fresh[selected] ? 'NAME: READ THIS SESSION (stored-patch snapshot)' : 'NAME: CACHED - not freshly read from hardware',
      patch_message: message,
    });
    for (const bank of config.banks) {
      let read = 0, cached = 0;
      for (let s = bank.startSlot; s < bank.startSlot + bank.slotCount; s++) if (cache[s]) { if (fresh[s]) read++; else cached++; }
      set('names_status_' + safeId(bank.id) + '.text.content', pick + ' | ● ' + read + ' read · ○ ' + cached + ' cached · — ' + (bank.slotCount - read - cached) + ' unknown | ' + message);
    }
  }
  function markSelection(slot, confirmed) {
    const previous = selected;
    selected = bankFor(slot) ? slot : null;
    selectionConfirmed = confirmed && selected != null;
    if (previous != null) { paintSlot(previous); paintHeader(previous); }
    if (selected != null) { paintSlot(selected); paintHeader(selected); }
    status();
  }
  function loadCache() {
    const p = ce.device.profile(role);
    const key = 'gaia.patchNames.v1:' + (p ? p.midiInput + ':' + p.midiDestination : 'unmapped');
    if (key === cacheKey) return;
    cacheKey = key;
    const saved = loadSetting(key, {});
    cache = saved && typeof saved === 'object' ? saved : {};
    fresh = {};
    for (const b of config.banks) for (let slot = b.startSlot; slot < b.startSlot + b.slotCount; slot++) paintSlot(slot);
  }
  function send(bytes) { routeMidi(role, () => sendSysex(bytes)); }
  function request(address, size) {
    const body = address.concat([0, 0, 0, size]);
    const sum = body.reduce((a, b) => a + b, 0);
    send([240, 65, job.deviceId, 0, 0, 65, 17].concat(body, [(128 - sum % 128) % 128, 247]));
  }
  function later(ms, fn) {
    const token = serial;
    after(ms, () => { if (job && serial === token) fn(); });
  }
  function finish(message, restore = true) {
    const previous = job;
    job = null;
    serial++;
    if (restore && previous && previous.changed && previous.originalSlot != null) {
      const result = recallPreset(previous.originalSlot, { role });
      if (result && result.ok) markSelection(previous.originalSlot, false);
      message += result && result.ok ? ' · Original recall requested; CHECK SELECTION to confirm.' : ' · Could not reselect original patch.';
    }
    status(message);
  }
  function waitFor(phase, ms = 1800) {
    job.phase = phase;
    const token = ++serial;
    after(ms, () => {
      if (job && serial === token) finish('Read stopped: no ' + phase + ' reply. Check GAIA MIDI input/output and SysEx.');
    });
  }
  function selection(data) {
    const b = config.banks.find(b => b.bankMsb === data[0] && b.bankLsb === data[1] && data[2] < b.slotCount);
    return b ? b.startSlot + data[2] : null;
  }
  function next() {
    if (job.index >= job.slots.length) {
      finish(job.slots.length + ' patch names read from GAIA and cached.');
      return;
    }
    job.slot = job.slots[job.index];
    status('Reading ' + job.bank.label + ' ' + slotLabel(job.slot) + ' · ' + job.index + '/' + job.slots.length);
    if (job.bank.id === 'user') {
      waitFor('name');
      request([32, job.slot, 0, 0], 12);
    } else {
      job.phase = 'selecting';
      const result = recallPreset(job.slot, { role });
      if (!result || !result.ok) { finish('Recall failed: ' + (result && result.error || 'no device profile')); return; }
      markSelection(job.slot, false);
      job.changed = true;
      serial++;
      // Give the hardware time to load, then verify the actual bank/PC before trusting a name.
      later(350, () => { waitFor('selection'); request([1, 0, 0, 0], 3); });
    }
  }
  function begin(bank) {
    monitorRoute();
    loadCache();
    job = { bank, slots: Array.from({ length: bank.slotCount }, (_, i) => bank.startSlot + i), index: 0, changed: false };
    status('Asking GAIA for its identity…');
    waitFor('identity');
    send([240, 126, 127, 6, 1, 247]);
  }
  function scan(bankId) {
    if (job) { status('A name read is running. Stop it before starting another.'); return; }
    const bank = config.banks.find(b => b.id === bankId);
    if (!bank) return;
    if (bank.id === 'user') { begin(bank); return; }
    ce.ui.dialog({
      title: 'Read ' + bank.label + ' names from GAIA?',
      message: 'This selects each patch to read its name. Save any unsaved sound edits first; patch selection discards them. Stop playback while scanning. The original patch will be reselected afterwards, but unsaved edits cannot be restored. No stored patch will be overwritten.',
      buttons: ['Cancel', 'Read names'], default: 'Cancel',
    }, choice => { if (choice === 'Read names' && !job) begin(bank); });
  }
  function recall(slot) {
    if (job) { status('Name read in progress. Press STOP before selecting a patch.'); return { ok: false }; }
    monitorRoute();
    const result = recallPreset(slot, { role });
    if (result && result.ok) { markSelection(slot, false); status('Recall requested · CHECK SELECTION confirms the hardware'); }
    else status('Recall failed: ' + (result && result.error || 'no device profile'));
    return result;
  }
  function checkSelection() {
    if (job) { status('Read in progress. Press STOP first.'); return; }
    monitorRoute();
    markSelection(null, false);
    job = { checking: true, changed: false };
    status('Checking current bank/program; sound will not change…');
    waitFor('identity');
    send([240, 126, 127, 6, 1, 247]);
  }
  function invalidate(message) {
    if (job) finish(message, false); // Never restore a patch onto a changed/disconnected route.
    fresh = {};
    markSelection(null, false);
    for (const b of config.banks) for (let slot = b.startSlot; slot < b.startSlot + b.slotCount; slot++) paintSlot(slot);
    status(message);
  }
  function monitorRoute() {
    const p = ce.device.profile(role);
    const key = p ? p.id + ':' + p.midiInput + ':' + p.midiDestination : 'unmapped';
    if (routeKey && (routeKey !== key || (wasConnected && !p?.connected))) {
      invalidate('Connection changed · cached names are not a fresh read');
      if (routeKey !== key) { cacheKey = ''; loadCache(); status(); }
    }
    routeKey = key;
    wasConnected = !!p?.connected;
  }
  function receive(bytes) {
    monitorRoute();
    if (!job || !Array.isArray(bytes)) return;
    if (job.phase === 'identity') {
      // Roland SH-01 universal identity: manufacturer 41, family 41 02, model 00 00.
      if (bytes.length !== 15 || bytes[0] !== 240 || bytes[1] !== 126 || bytes[3] !== 6 || bytes[4] !== 2 || bytes[5] !== 65 || bytes[6] !== 65 || bytes[7] !== 2 || bytes[8] !== 0 || bytes[9] !== 0 || bytes[14] !== 247) return;
      job.deviceId = bytes[2];
      serial++;
      if (job.checking) { waitFor('check selection'); request([1, 0, 0, 0], 3); }
      else if (job.bank.id === 'user') next();
      else { waitFor('original selection'); request([1, 0, 0, 0], 3); }
      return;
    }
    if (bytes.length < 14 || bytes[0] !== 240 || bytes[1] !== 65 || bytes[2] !== job.deviceId || bytes[3] !== 0 || bytes[4] !== 0 || bytes[5] !== 65 || bytes[6] !== 18 || bytes[bytes.length - 1] !== 247) return;
    if (bytes.slice(1, -1).some(b => !Number.isInteger(b) || b < 0 || b > 127)) return;
    if (bytes.slice(7, -1).reduce((a, b) => a + b, 0) % 128 !== 0) return;
    const address = bytes.slice(7, 11);
    const data = bytes.slice(11, -2);
    if (job.phase === 'original selection' || job.phase === 'selection' || job.phase === 'check selection') {
      if (address.join() !== '1,0,0,0' || data.length !== 3) return;
      const slot = selection(data);
      markSelection(slot, slot != null);
      if (job.phase === 'check selection') {
        finish(slot == null ? 'GAIA reported an unmapped bank/program.' : 'Current patch confirmed by GAIA.', false);
        return;
      }
      if (job.phase === 'original selection') {
        if (slot == null) { finish('Cannot identify the current patch. Scan cancelled before changing sounds.'); return; }
        job.originalSlot = slot;
        serial++;
        next();
      } else {
        if (slot !== job.slot) { finish('Bank/program did not match. Check RX BANK SELECT and RX PROGRAM CHANGE.'); return; }
        waitFor('name');
        request([16, 0, 0, 0], 12);
      }
      return;
    }
    if (job.phase !== 'name' || data.length !== 12) return;
    const expected = job.bank.id === 'user' ? [32, job.slot, 0, 0] : [16, 0, 0, 0];
    if (address.join() !== expected.join() || data.some(b => b < 32 || b > 127)) return;
    const name = String.fromCharCode.apply(null, data).replace(/\x7f/g, ' ').trim();
    cache[job.slot] = name || '(unnamed)';
    fresh[job.slot] = true;
    paintSlot(job.slot);
    saveSetting(cacheKey, cache);
    job.index++;
    job.phase = 'gap';
    serial++;
    later(60, next);
  }
  function load() {
    job = null; serial++;
    fresh = {}; selected = null; selectionConfirmed = false; cacheKey = '';
    routeKey = ''; monitorRoute();
    loadCache();
    for (const b of config.banks) for (let s = b.startSlot; s < b.startSlot + b.slotCount; s += 8) paintHeader(s);
    status('CHECK SELECTION is read-only · ● read this session · ○ cached');
    defineAction('gaiaNamesScan', scan);
    defineAction('gaiaNamesRecall', recall);
    defineAction('gaiaNamesStop', () => { if (job) finish('Name read stopped. Previously read names kept.'); });
    defineAction('gaiaNamesCheck', checkSelection);
    off('*', 'onPresetChange');
    on('*', 'onPresetChange', event => {
      if (event.role !== role) return;
      if (event.source === 'panel') markSelection(event.slot, false);
      else {
        if (job && !job.checking && job.bank.id !== 'user' && job.phase === 'name') finish('Hardware patch changed during name read; stopped.', false);
        markSelection(null, false); status('Hardware program change observed · CHECK SELECTION to identify its bank');
      }
    });
    off('*', 'onDeviceDisconnected');
    on('*', 'onDeviceDisconnected', event => { if (event.role === role) invalidate('Disconnected · names retained as cache'); });
    const token = ++loadSerial;
    function pollRoute() { if (token !== loadSerial) return; monitorRoute(); after(1000, pollRoute); }
    after(1000, pollRoute);
    off('*', 'onSysexIn');
    on('*', 'onSysexIn', receive);
  }
  return { load, receive };
}

export function presetNamesScript(profile, role) {
  const config = { role, banks: profile.presets.banks };
  return `${updateGaiaScreen.toString()}\nvar gaiaNames = (${installGaiaNames.toString()})(${JSON.stringify(config)});
function onPanelLoad() { gaiaNames.load(); }
function onSysexIn(bytes) { gaiaNames.receive(bytes); }
`;
}
