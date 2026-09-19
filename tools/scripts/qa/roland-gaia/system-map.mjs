// SH-01 MIDI Implementation §3 System, supplied by the user. Offsets are bytes,
// while the # fields store one hexadecimal nibble per byte. Reserved bytes omitted.
export const SYSTEM_BASE = '01 00 00 00';
const offOn = ['OFF', 'ON'];
const row = (offset, id, name, min, max, extra = {}) => ({ offset: `00 ${offset}`, id, name, min, max, ...extra });
const choice = (offset, id, name, labels) => row(offset, id, name, 0, labels.length - 1, { labels });
export const SYSTEM = [
  row('00', 'bankSelectMsb', 'Bank Select MSB', 0, 127),
  row('01', 'bankSelectLsb', 'Bank Select LSB', 0, 127),
  row('02', 'programNumber', 'Program Number', 0, 127),
  row('03', 'masterLevel', 'Master Level', 0, 127),
  row('04', 'masterTune', 'Master Tune', 24, 2024, { nibbles: 4, displayMin: -100, displayMax: 100, unit: 'cent' }),
  choice('08', 'patchRemain', 'Patch Remain', offOn),
  choice('09', 'clockSource', 'Clock Source', ['PATCH', 'SYSTEM', 'MIDI', 'USB']),
  row('0A', 'tempo', 'System Tempo', 5, 300, { nibbles: 3, unit: 'BPM' }),
  choice('0D', 'keyboardVelocity', 'Keyboard Velocity', ['REAL', 'FIX']),
  choice('0E', 'pedalPolarity', 'Pedal Polarity', ['STANDARD', 'REVERSE']),
  choice('0F', 'pedalAssign', 'Pedal Assign', ['HOLD', 'MODULATION', 'VOLUME', 'EXPRESSION', 'BEND-MODE', 'D-BEAM-SYNC', 'TAP-TEMPO']),
  row('10', 'dBeamSens', 'D Beam Sensitivity', 1, 8),
  row('11', 'rxTxChannel', 'Rx/Tx Channel', 0, 15, { displayMin: 1, displayMax: 16 }),
  ...[
    ['12', 'midiUsbThru', 'MIDI-USB Thru'], ['13', 'softThru', 'Soft Thru'],
    ['14', 'rxProgramChange', 'Rx Program Change'], ['15', 'rxBankSelect', 'Rx Bank Select'],
    ['16', 'remoteKeyboard', 'Remote Keyboard'], ['17', 'txProgramChange', 'Tx Program Change'],
    ['18', 'txBankSelect', 'Tx Bank Select'], ['19', 'txEditData', 'Tx Edit Data'],
    ['1A', 'recorderSyncOutput', 'Recorder Sync Output'],
  ].map(([offset, id, name]) => choice(offset, id, name, offOn)),
  choice('1B', 'metronomeMode', 'Recorder Metronome Mode', ['OFF', 'REC-ONLY', 'REC&PLAY', 'ALWAYS']),
  row('1C', 'metronomeLevel', 'Recorder Metronome Level', 0, 7),
  ...Array.from({ length: 64 }, (_, i) => choice(
    (0x2b + i).toString(16).toUpperCase().padStart(2, '0'),
    `writeProtect${'ABCDEFGH'[Math.floor(i / 8)]}${i % 8 + 1}`,
    `Write Protect ${'ABCDEFGH'[Math.floor(i / 8)]}-${i % 8 + 1}`, offOn)),
  choice('6B', 'powerSave', 'Power Save Mode', ['OFF', '1 min', '3 min', '5 min', '10 min', '20 min', '30 min', '60 min']),
];
