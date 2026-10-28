// OSC learn: a control that follows an OSC address, with no script (docs/design/ce-osc-module.md,
// "Panel side"). Stored beside the MIDI bindings in a control's DeviceBindings, as kind "oscControl".
// The panel view applies it (scripting/panelRuntime.js, oscBindingsHeard), and an exported plug-in
// with its window shut does the same (Player/PluginProcessor.h, oscBindingHeard).

export const OSC_CONTROL_KIND = 'oscControl';

/** A new OSC binding: no address yet ("Learn" takes the next message's), the first value, 0 to 1
    (what TouchOSC sends), sent back to whoever sent last. */
export function oscControlBinding(port = 'value') {
  return { kind: OSC_CONTROL_KIND, port, address: '', valueIndex: 1, min: 0, max: 1, sendBack: true, sendTo: '' };
}

export function isOscControlBinding(binding) {
  return binding?.kind === OSC_CONTROL_KIND && typeof binding.address === 'string' && binding.address.startsWith('/');
}

/** The panel's named destinations, one per line: "tablet = 192.168.1.20:9000". Lines that do not
    read are left out. */
export function parseOscTargets(text) {
  const out = [];
  for (const line of String(text ?? '').split(/\r?\n/)) {
    const m = /^\s*([^=\s][^=]*?)\s*=\s*(\S+):(\d{1,5})\s*$/.exec(line);
    if (!m) continue;
    const port = Number(m[3]);
    if (port >= 1 && port <= 65535) out.push({ name: m[1], host: m[2], port });
  }
  return out;
}
