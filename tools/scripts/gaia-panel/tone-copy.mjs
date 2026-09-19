import { PATCH_TONE } from '../qa/roland-gaia/address-map.mjs';

function installToneCopy(config) {
  let job = null, serial = 0;
  const role = config.role;
  const routeKey = () => {
    const p = ce.device.profile(role);
    return p ? p.id + ':' + p.midiInput + ':' + p.midiDestination : '';
  };
  function status(text) { if (job) set('tone' + job.from + '_copy_status.text.content', text); }
  function finish(text) { status(text); job = null; serial++; }
  function send(command, address, data) {
    const body = address.concat(data);
    routeMidi(role, () => sendSysex([240,65,job.deviceId,0,0,65,command].concat(body, [(128-body.reduce((a,b)=>a+b,0)%128)%128,247])));
  }
  function wait(phase) {
    job.phase = phase;
    const token = ++serial;
    after(2500, () => { if (job && token === serial) finish('No reply. Copy stopped.'); });
  }
  function read(tone, phase) { wait(phase); send(17, [16,0,tone,0], [0,0,0,62]); }
  function begin(from, to) {
    const profile = ce.device.profile(role);
    if (!profile || profile.id !== 'roland-gaia-sh01') {
      set('tone' + from + '_copy_status.text.content', 'Connect the GAIA first.'); return;
    }
    job = { from, to, route: routeKey() };
    status('Reading Tone ' + from + '…');
    wait('identity');
    routeMidi(role, () => sendSysex([240,126,127,6,1,247]));
  }
  function choose(from) {
    if (job || ![1,2,3].includes(from)) return;
    const destinations = [1,2,3].filter(t => t !== from);
    ce.ui.dialog({ title: 'Copy Tone ' + from + ' to…',
      message: 'Replaces the destination tone in the current sound with a fresh read from the GAIA. Stored patches are unchanged until you save the patch.',
      buttons: destinations.map(t => 'Tone ' + t).concat('Cancel'), default: 'Cancel',
    }, choice => {
      const to = destinations.find(t => choice === 'Tone ' + t);
      if (to && !job) begin(from, to);
    });
  }
  function receive(bytes) {
    if (!job) return;
    if (routeKey() !== job.route) { finish('Connection changed. Stopped.'); return; }
    if (!Array.isArray(bytes)) return;
    if (job.phase === 'identity') {
      if (bytes.length !== 15 || bytes[0] !== 240 || bytes[1] !== 126 || bytes[3] !== 6 || bytes[4] !== 2
        || bytes[5] !== 65 || bytes[6] !== 65 || bytes[7] !== 2 || bytes[8] !== 0 || bytes[9] !== 0 || bytes[14] !== 247) return;
      job.deviceId = bytes[2]; read(job.from, 'source'); return;
    }
    if (bytes.length !== 75 || bytes[0] !== 240 || bytes[1] !== 65 || bytes[2] !== job.deviceId
      || bytes[3] !== 0 || bytes[4] !== 0 || bytes[5] !== 65 || bytes[6] !== 18 || bytes[74] !== 247) return;
    if (bytes.slice(1,-1).some(b => !Number.isInteger(b) || b < 0 || b > 127)
      || bytes.slice(7,-1).reduce((a,b)=>a+b,0)%128 !== 0) return;
    const tone = job.phase === 'source' ? job.from : job.to;
    if (bytes.slice(7,11).join() !== [16,0,tone,0].join()) return;
    const data = bytes.slice(11,-2);
    if (job.phase === 'source') {
      for (const field of config.fields) {
        if (data[field.offset] < field.min || data[field.offset] > field.max) { finish('Invalid tone data. Stopped.'); return; }
      }
      job.source = data;
      job.phase = 'writing'; serial++;
      status('Copying to Tone ' + job.to + '…');
      // Write documented fields only; destination reserved bytes are preserved.
      for (const segment of config.segments) send(18, [16,0,job.to,segment.start], data.slice(segment.start, segment.end));
      const token = serial;
      after(100, () => {
        if (!job || serial !== token) return;
        if (routeKey() !== job.route) { finish('Connection changed. Stopped.'); return; }
        read(job.to, 'verify');
      });
    } else if (job.phase === 'verify') {
      if (config.fields.some(field => data[field.offset] !== job.source[field.offset])) { finish('Readback differs. Check tone.'); return; }
      for (const t of [1,2,3]) ce.device.write('common.tone' + t + 'Select', t === job.to ? 'on' : 'off', role);
      send(17, [16,0,0,0], [0,0,0,61]);
      finish('Copied to Tone ' + job.to);
    }
  }
  function load() {
    job = null; serial++;
    defineAction('gaiaToneCopy', choose);
    on('*', 'onSysexIn', receive);
    on('*', 'onDeviceDisconnected', event => { if (job && event.role === role) finish('Disconnected. Copy stopped.'); });
    on('*', 'onPresetChange', event => { if (job && event.role === role) finish('Patch changed. Copy stopped.'); });
  }
  return { load, receive };
}

export function toneCopyScript() {
  const fields = PATCH_TONE.map(p => ({ offset: parseInt(p.offset.split(' ')[1], 16), min: p.min, max: p.max }));
  const segments = [];
  for (const { offset } of fields) {
    if (segments.at(-1)?.end === offset) segments.at(-1).end++;
    else segments.push({ start: offset, end: offset + 1 });
  }
  return `var gaiaToneCopy = (${installToneCopy.toString()})(${JSON.stringify({ role: 'Roland GAIA SH-01', fields, segments })});\nfunction onPanelLoad() { gaiaToneCopy.load(); }\nfunction onSysexIn(bytes) { gaiaToneCopy.receive(bytes); }\n`;
}
