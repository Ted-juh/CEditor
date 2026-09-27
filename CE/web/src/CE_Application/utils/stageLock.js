/** Commands that remain useful and safe while the rig is locked for performance. The browser
 * preview mirrors the native deny-by-default boundary (isStageSafeCommand in
 * InstrumentHostService.cpp), which remains authoritative in the application;
 * test/stageSafeParity.test.js reads the native list and fails when the two drift apart. */
export const STAGE_SAFE_COMMANDS = new Set([
  'beginParameterGesture', 'endParameterGesture', 'getAudioDevices', 'getHostProject',
  'getLibrary', 'getLicence', 'getParameters', 'getState', 'getSurfaceLayout', 'focusPart', 'hostNote',
  'launchClip', 'launchScene', 'panic', 'previewSupportBundle', 'resetParameter',
  'setBusLevel', 'setControlSlotValue', 'setEffectBypassed', 'setExternalClock',
  'setMacroValue', 'setMasterLevel', 'setParameter', 'setParameterText', 'setPartMixer',
  'setModulationRoute', 'setMidiLfo', 'setMidiLfoOutput', 'resetMidiLfo',
  'setEnvelope', 'triggerEnvelope', 'resetEnvelope', 'setMseg', 'resetMseg',
  'setRandomModulator', 'resetRandomModulator',
  'setReturnLevel', 'setSendLevel', 'setTempo', 'setTimeSignature',
  'setTransportPosition', 'setlistGo', 'setlistNext', 'setlistPrev', 'resetSetlistClock', 'stopAllClips',
  'stopClip', 'transportContinue', 'transportPlay', 'transportStop', 'walkPartPreset',
  'startMidiLoop', 'finishMidiLoop', 'cancelMidiLoop',
  'startGestureRecording', 'finishGestureRecording', 'cancelGestureRecording',
  'startPerformanceRecording', 'finishPerformanceRecording', 'cancelPerformanceRecording',
  'removePerformanceTake', 'replayPerformanceTake', 'stopPerformanceReplay',
  'surfacePerformanceEncoder', 'surfaceStepPad', 'surfaceInput', 'setSurfaceActive', 'showControlPage',
  'retryFailedProcessor', 'dismissFailoverEvent',
  'closeEditor', 'cancelHardwarePatchCapture', 'cancelKeyChordLearn', 'cancelLearnControlSlotParameter',
  'cancelMidiLearn', 'disarmCapture',
  'finishSoundcheck', 'setPerformanceFill', 'sendMicrotuning', 'startArrangement', 'stopArrangement',
  'startSoundComparison', 'stepSoundComparison', 'keepSoundComparison', 'cancelSoundComparison',
  'chordPad', 'chordStep',
]);

export function stageCommandAllowed(stageLocked, command) {
  return stageLocked !== true || STAGE_SAFE_COMMANDS.has(String(command ?? ''));
}
