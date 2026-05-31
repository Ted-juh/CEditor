const eventValue = { ref: 'event.value' };

export function createMacroRoutingScript() {
  return {
    id: 'macroRouting',
    name: 'macroRouting',
    scope: 'panel',
    description: 'Route macro value to cutoff, resonance, and CC74 while keeping mappings static.',
    event: 'onControlChanged',
    target: 'macroControl',
    enabled: true,
    runPolicy: 'During drag: Preview',
    commitPolicy: 'Send MIDI',
    notes: 'Source of truth is the portable command graph. Language tabs are generated projections.',
    steps: [
      {
        id: 'macro-cutoff',
        command: 'setValue',
        args: {
          target: 'cutoff.value',
          value: { op: 'scale', args: [eventValue, 0, 1, 80, 12000] },
        },
      },
      {
        id: 'macro-resonance',
        command: 'setValue',
        args: {
          target: 'resonance.value',
          value: { op: 'scale', args: [eventValue, 0, 1, 0.1, 0.85] },
        },
      },
      {
        id: 'macro-cc',
        command: 'sendCC',
        args: {
          channel: 1,
          cc: 74,
          value: { op: 'round', args: [{ op: '*', args: [eventValue, 127] }] },
          phase: 'commit',
        },
      },
    ],
  };
}

export function createScriptDocument(options = {}) {
  const macroRouting = createMacroRoutingScript();
  return {
    id: options.id ?? `script_${Date.now()}`,
    name: options.name ?? 'Untitled Script Workspace',
    modified: true,
    activeScriptId: macroRouting.id,
    mode: options.mode ?? 'diehard',
    scripts: [
      macroRouting,
      {
        id: 'limitRange',
        name: 'limitRange',
        scope: 'component',
        event: 'onValueChanged',
        target: 'rangeControl',
        enabled: true,
        description: 'Clamp a value so min, max, and pointer handles cannot escape their declared range.',
        steps: [
          { id: 'clamp-range', command: 'setValue', args: { target: 'rangeControl.value', value: { op: 'clamp', args: [eventValue, { ref: 'values.rangeControl.min' }, { ref: 'values.rangeControl.max' }] } } },
        ],
      },
      {
        id: 'modeVisibility',
        name: 'modeVisibility',
        scope: 'panel',
        event: 'onChanged',
        target: 'mode',
        enabled: true,
        steps: [
          { id: 'mode-advanced', command: 'setState', args: { target: 'advancedControls', state: 'visible' } },
          { id: 'mode-basic', command: 'setState', args: { target: 'basicControls', state: 'hidden' } },
        ],
      },
      {
        id: 'presetInit',
        name: 'presetInit',
        scope: 'project',
        event: 'onPresetLoad',
        target: 'preset',
        enabled: false,
        steps: [
          { id: 'preset-state', command: 'setState', args: { target: 'panel', state: 'default' } },
          { id: 'preset-macro', command: 'setValue', args: { target: 'macroControl.value', value: 0.5 } },
        ],
      },
      {
        id: 'sendCutoffSysex',
        name: 'sendCutoffSysEx',
        scope: 'device',
        event: 'onParameterCommitted',
        target: 'cutoff',
        enabled: true,
        steps: [
          { id: 'sysex-send', command: 'sendSysex', args: { bytes: [0xF0, 0x41, 0x10, 0x00, 0x15, 0x12, 0x34, 0x56, 0x77, 0xF7] } },
        ],
      },
      {
        id: 'parseDump',
        name: 'parseDump',
        scope: 'device',
        event: 'onPatchDumpReceived',
        target: 'synthProfile',
        enabled: false,
        steps: [
          { id: 'dump-log', command: 'log', args: { message: 'Patch dump received', value: { ref: 'event.value' } } },
        ],
      },
      {
        id: 'rawJsHelper',
        name: 'rawJsHelper',
        scope: 'project',
        event: 'manual',
        target: 'developer',
        enabled: false,
        rawLanguage: 'javascript',
        steps: [
          { id: 'raw-note', command: 'log', args: { message: 'Raw helper is intentionally marked as JS only.' } },
        ],
      },
    ],
  };
}
