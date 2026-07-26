import { numberOr, clamp } from './primitives.js';
export const CUSTOM_ARP_NOTE_MIN = 0;
export const CUSTOM_ARP_NOTE_MAX = 127;
export const CUSTOM_ARP_DEFAULT_STEP_COUNT = 32;
export const CUSTOM_ARP_MAX_STEP_COUNT = 256;
export const CUSTOM_ARP_RUNTIME_KEY = '__arpeggiator';

function objectChildren(section) {
  return section?._children ?? {};
}

function designerArpeggiator(controlOrDesigner = null) {
  if (controlOrDesigner?._children?.Designer) return controlOrDesigner._children.Designer.arpeggiator;
  return controlOrDesigner?.arpeggiator ?? controlOrDesigner;
}

export function noteNameFromMidi(note) {
  const names = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  const midi = Math.round(clamp(numberOr(note, 60), CUSTOM_ARP_NOTE_MIN, CUSTOM_ARP_NOTE_MAX));
  return `${names[midi % 12]}${Math.floor(midi / 12) - 1}`;
}

export function normalizeCustomArpeggiator(value = {}) {
  const stepCount = Math.max(1, Math.min(CUSTOM_ARP_MAX_STEP_COUNT, Math.round(numberOr(value?.stepCount, CUSTOM_ARP_DEFAULT_STEP_COUNT))));
  const viewNote = Math.max(CUSTOM_ARP_NOTE_MIN, Math.min(116, Math.round(numberOr(value?.viewNote, 60))));
  const selectedBlock = String(value?.selectedBlock ?? '');
  const blocks = Array.isArray(value?.blocks)
    ? value.blocks
      .map((block, index) => ({
        id: String(block?.id ?? `arpBlock${index + 1}`),
        note: Math.round(clamp(numberOr(block?.note, 60), CUSTOM_ARP_NOTE_MIN, CUSTOM_ARP_NOTE_MAX)),
        step: Math.round(clamp(numberOr(block?.step, 0), 0, stepCount - 1)),
        length: Math.round(clamp(numberOr(block?.length, 1), 1, stepCount)),
        velocity: Math.round(clamp(numberOr(block?.velocity, 96), 1, 127)),
      }))
      .map((block) => ({
        ...block,
        length: Math.min(block.length, stepCount - block.step),
      }))
    : [];

  return {
    enabled: value?.enabled === true,
    stepCount,
    noteMin: CUSTOM_ARP_NOTE_MIN,
    noteMax: CUSTOM_ARP_NOTE_MAX,
    viewNote,
    selectedBlock,
    blocks,
  };
}

export function getCustomArpeggiator(controlOrDesigner = null, runtimeValues = null) {
  const runtimeArpeggiator = runtimeValues?.[CUSTOM_ARP_RUNTIME_KEY] ?? runtimeValues?.arpeggiator;
  return normalizeCustomArpeggiator(runtimeArpeggiator ?? designerArpeggiator(controlOrDesigner));
}

export function resolveCustomArpeggiatorStep(controlOrDesigner, stepIndex = 0, runtimeValues = null) {
  const arpeggiator = getCustomArpeggiator(controlOrDesigner, runtimeValues);
  const stepCount = arpeggiator.stepCount;
  const rawStep = Math.round(numberOr(stepIndex, 0));
  const step = ((rawStep % stepCount) + stepCount) % stepCount;
  const activeBlocks = arpeggiator.blocks
    .filter((block) => step >= block.step && step < block.step + block.length)
    .sort((left, right) => left.note - right.note || left.step - right.step)
    .map((block) => ({
      id: block.id,
      note: block.note,
      noteName: noteNameFromMidi(block.note),
      step: block.step,
      length: block.length,
      velocity: block.velocity,
    }));
  const primary = activeBlocks[0] ?? null;

  return {
    enabled: arpeggiator.enabled,
    step,
    stepCount,
    gate: arpeggiator.enabled && activeBlocks.length > 0,
    note: primary?.note ?? 0,
    noteName: primary ? primary.noteName : '',
    velocity: primary?.velocity ?? 0,
    activeBlocks,
  };
}

export function syncCustomArpeggiatorValues(control, values = {}) {
  const arpeggiator = getCustomArpeggiator(control, values);
  if (!arpeggiator.enabled) return { ...(values ?? {}) };

  const channels = objectChildren(control?._children?.ValueChannels);
  const currentStep = values?.arpCurrentStep ?? channels.arpCurrentStep?.currentValue ?? channels.arpCurrentStep?.defaultValue ?? 0;
  const resolved = resolveCustomArpeggiatorStep(arpeggiator, currentStep);
  const next = { ...(values ?? {}) };
  next[CUSTOM_ARP_RUNTIME_KEY] = arpeggiator;
  if (channels.arpCurrentStep) next.arpCurrentStep = resolved.step;
  if (channels.arpStepCount) next.arpStepCount = resolved.stepCount;
  if (channels.arpGate) next.arpGate = resolved.gate;
  if (channels.arpNote) next.arpNote = resolved.note;
  if (channels.arpVelocity) next.arpVelocity = resolved.velocity;
  // Re-expression on the array primitive (§12.3), read side: when an
  // `arpPattern` object-array channel exists, publish the normalized block
  // list through it, so the pattern flows through the ordinary channel /
  // published-API machinery (bench, panel links, scripts) like any value.
  // The WRITE side (driving the pattern by setting the channel) is
  // deliberately not wired yet: interactive grid edits write the runtime
  // key above, and a channel write racing a grid edit has no clean
  // precedence — that needs its own design pass before both can be sources.
  if (channels.arpPattern) next.arpPattern = arpeggiator.blocks.map((block) => ({ ...block }));
  return next;
}

export function resolveRuntimeArpeggiatorEdit(control, values = {}, hitZone = null, point = null) {
  const action = String(hitZone?.action ?? hitZone?.meta?.action ?? '').trim().toLowerCase();
  if (!['arpeggiatordraw', 'arpeggiatormove', 'arpeggiatorresize'].includes(action)) return null;
  if (!point?.rect) return null;

  const arpeggiator = getCustomArpeggiator(control, values);
  if (!arpeggiator.enabled) return null;

  const transform = control?._children?.Transform ?? {};
  const width = Math.max(320, numberOr(transform.width, point.rect.width));
  const height = Math.max(180, numberOr(transform.height, point.rect.height));
  const labelWidth = 44;
  const rulerHeight = 24;
  const gridLeft = labelWidth;
  const gridTop = rulerHeight;
  const gridWidth = Math.max(1, width - labelWidth - 8);
  const gridHeight = Math.max(1, height - rulerHeight - 8);
  const rowHeight = gridHeight / 12;
  const stepWidth = gridWidth / Math.max(1, arpeggiator.stepCount);
  const localX = clamp(numberOr(point.clientX, point.rect.left) - point.rect.left, 0, point.rect.width);
  const localY = clamp(numberOr(point.clientY, point.rect.top) - point.rect.top, 0, point.rect.height);
  const designX = point.rect.width > 0 ? (localX / point.rect.width) * width : localX;
  const designY = point.rect.height > 0 ? (localY / point.rect.height) * height : localY;
  const step = Math.round(clamp(Math.floor((designX - gridLeft) / stepWidth), 0, arpeggiator.stepCount - 1));
  const row = Math.round(clamp(Math.floor((designY - gridTop) / rowHeight), 0, 11));
  const note = Math.round(clamp(arpeggiator.viewNote + 11 - row, CUSTOM_ARP_NOTE_MIN, CUSTOM_ARP_NOTE_MAX));
  const rowY = gridTop + (row * rowHeight);
  const rowPosition = clamp((designY - rowY) / Math.max(1, rowHeight), 0, 1);
  const velocity = Math.round(clamp(127 - (rowPosition * 126), 1, 127));
  const blockId = String(hitZone?.payload?.blockId ?? hitZone?.meta?.blockId ?? '');
  const blocks = arpeggiator.blocks.map((block) => ({ ...block }));

  if (action === 'arpeggiatordraw') {
    const existingIndex = blocks.findIndex((block) => block.step === step && block.note === note);
    if (existingIndex >= 0) {
      blocks.splice(existingIndex, 1);
      return normalizeCustomArpeggiator({ ...arpeggiator, selectedBlock: '', blocks });
    }
    const id = `arp_${Date.now().toString(36)}_${step}_${note}`;
    blocks.push({ id, note, step, length: 1, velocity });
    return normalizeCustomArpeggiator({ ...arpeggiator, selectedBlock: id, blocks });
  }

  const index = blocks.findIndex((block) => block.id === blockId);
  if (index < 0) return arpeggiator;

  if (action === 'arpeggiatormove') {
    const length = Math.min(blocks[index].length, arpeggiator.stepCount - step);
    blocks[index] = { ...blocks[index], step, note, length, velocity };
  } else if (action === 'arpeggiatorresize') {
    const length = Math.max(1, step - blocks[index].step + 1);
    blocks[index] = { ...blocks[index], length: Math.min(length, arpeggiator.stepCount - blocks[index].step), velocity };
  }

  return normalizeCustomArpeggiator({ ...arpeggiator, selectedBlock: blocks[index].id, blocks });
}

export function summarizeCustomArpeggiator(controlOrDesigner = null) {
  const arpeggiator = getCustomArpeggiator(controlOrDesigner);
  const usedNotes = [...new Set(arpeggiator.blocks.map((block) => block.note))]
    .sort((left, right) => left - right);
  const stepPolyphony = Array.from({ length: arpeggiator.stepCount }, (_, index) =>
    arpeggiator.blocks.filter((block) => index >= block.step && index < block.step + block.length).length
  );
  return {
    enabled: arpeggiator.enabled,
    stepCount: arpeggiator.stepCount,
    blockCount: arpeggiator.blocks.length,
    noteMin: arpeggiator.noteMin,
    noteMax: arpeggiator.noteMax,
    viewNote: arpeggiator.viewNote,
    usedNotes,
    usedNoteNames: usedNotes.map(noteNameFromMidi),
    maxPolyphony: Math.max(0, ...stepPolyphony),
  };
}
