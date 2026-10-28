// One list of calls for ce.osc, run through the panel view's oscCore.js and the JavaScript, Lua and
// Python preludes by test/oscParity.test.js, against one fake transport (answer). A text "fn:name"
// in a call stands for a function that writes "ran name <address>" when it is called; ['__receive',
// [message]] hands a message to the scripts, as the "__oscIn" event does.
export function answer(op, fields) {
  if (op === 'listen') return fields.port === 9999 ? { ok: false, error: 'portInUse', why: 'port 9999 is in use by another program' } : { ok: true, port: fields.port };
  if (op === 'stop') return true;
  if (op === 'status') return { listening: true, waiting: false, port: 8000, network: false, received: 3, sent: 2, dropped: 0 };
  if (op === 'send' && fields.to === 'refused') return { ok: false, error: 'refusedByUser', why: 'the user said no to sending OSC to 192.0.2.7' };
  return { ok: true };
}

const msg = (address, args = [0.5]) => ({ address, args, types: 'f'.repeat(args.length), from: { host: '127.0.0.1', port: 9000 } });

export const CALLS = [
  ['oscListen', []],
  ['oscListen', [{ port: 9000, network: true, nextFree: true }]],
  ['oscListen', [{ port: 80 }]],
  ['oscListen', [{ port: 8000.5 }]],
  ['oscListen', [{ port: 9999 }]],
  ['oscStop', []],
  ['oscStatus', []],
  ['oscOn', ['/fader/*', 'fn:faders']],
  ['oscOn', ['/fader/[1-4]', 'fn:low']],
  ['oscOn', ['/{knob,fader}/?', 'fn:either']],
  ['oscOn', ['/xy/[!0-9]', 'fn:letters']],
  ['oscOn', ['fader', 'fn:x']],
  ['oscOn', ['/x', 7]],
  ['__receive', [msg('/fader/3')]],
  ['__receive', [msg('/fader/12')]],
  ['__receive', [msg('/knob/5')]],
  ['__receive', [msg('/xy/a')]],
  ['__receive', [msg('/xy/1')]],
  ['__receive', [msg('/fader/3/x')]],
  ['oscOff', [2]],
  ['oscOff', [2]],
  ['__receive', [msg('/fader/3')]],
  ['oscTarget', ['tablet', '192.168.1.20:9000']],
  ['oscTarget', ['local', { host: 'localhost', port: 9001 }]],
  ['oscTarget', ['tablet']],
  ['oscTarget', ['', '1.2.3.4:5']],
  ['oscTarget', ['t', 'nowhere']],
  ['oscTarget', ['t', '1.2.3.4:70000']],
  ['oscSend', ['tablet', '/label/1', 'Cutoff']],
  ['oscSend', ['tablet', '/fader/1', [0.5, 2, true, false, 'x', [1, 2, 3]]]],
  ['oscSend', ['tablet', '/n', [1, 2], 'ih']],
  ['oscSend', ['tablet', '/n', [1.5], 'i']],
  ['oscSend', ['tablet', '/n', [1], 'iq']],
  ['oscSend', ['tablet', '/n', [1, 2], 'i']],
  ['oscSend', ['tablet', '/c', ['#FF8000', [0, 144, 60, 100], 'z'], 'rmc']],
  ['oscSend', ['tablet', '/c', ['orange'], 'r']],
  ['oscSend', ['tablet', 'nolead', [1]]],
  ['oscSend', [{ host: '127.0.0.1', port: 9000 }, '/reply', 1]],
  ['oscSend', [7, '/x']],
  ['oscSend', ['refused', '/x']],
  ['oscSend', ['tablet', '/x', [{ a: 1 }]]],
  ['oscBundle', ['tablet', [{ address: '/a', args: [1] }, { address: '/b' }]]],
  ['oscBundle', ['tablet', [{ address: '/a', args: [1] }], { time: 3913056000 }]],
  ['oscBundle', ['tablet', []]],
  ['oscBundle', ['tablet', [{ address: 'a' }]]],
  ['oscBundle', ['tablet', [{ address: '/a' }], { time: -1 }]],
];
