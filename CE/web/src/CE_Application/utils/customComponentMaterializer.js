import { createBackground, createPartNode, createText } from './customComponentFactory.js';
import { getCustomArpeggiator, noteNameFromMidi, arpeggiatorInspectorLayout } from './customComponentArpeggiator.js';
import { deepClone } from './deepClone.js';
import { numberOr, clamp } from './primitives.js';

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

function dialAngleToCanvasAngle(angle) {
  return numberOr(angle, 0) - 90;
}

function circularGeneratorAngles(generator, fallbackStart = -135, fallbackEnd = 135) {
  const authoredStart = numberOr(generator?.startAngle, fallbackStart);
  const authoredEnd = numberOr(generator?.endAngle, fallbackEnd);
  const startAngle = dialAngleToCanvasAngle(authoredStart);
  return {
    startAngle,
    endAngle: startAngle + (authoredEnd - authoredStart),
  };
}

function generatorEntries(control) {
  return Object.entries(control?._children?.Generators?._children ?? {})
    .filter(([, generator]) => generator?.enabled !== false);
}

function getParts(control) {
  return control?._children?.Parts?._children ?? {};
}

function getHitZones(control) {
  return control?._children?.HitZones?._children ?? {};
}

function getFilmstrips(control) {
  return control?._children?.Assets?.filmstrips ?? {};
}

function normalizedSignalForValueSource(signals = {}, valueSource = 'mainValue') {
  const source = String(valueSource ?? 'mainValue').trim();
  if (!source || source === 'mainValue' || source === 'value.normalized') {
    return clamp(numberOr(signals?.valueNormalized, 0), 0, 1);
  }
  if (source.startsWith('channel.')) {
    return clamp(numberOr(signals?.customChannels?.[source], 0), 0, 1);
  }
  return clamp(numberOr(signals?.customChannels?.[`channel.${source}.normalized`], signals?.valueNormalized ?? 0), 0, 1);
}

function generatorBounds(generator = null) {
  const bounds = generator?.bounds ?? generator?.rect ?? null;
  if (!bounds) return null;
  return {
    x: clamp(numberOr(bounds.x, 0), 0, 100),
    y: clamp(numberOr(bounds.y, 0), 0, 100),
    width: clamp(numberOr(bounds.width, 100), 0.001, 100),
    height: clamp(numberOr(bounds.height, 100), 0.001, 100),
  };
}

function mapGeneratorX(bounds, x) {
  return bounds ? bounds.x + ((numberOr(x, 0) / 100) * bounds.width) : x;
}

function mapGeneratorY(bounds, y) {
  return bounds ? bounds.y + ((numberOr(y, 0) / 100) * bounds.height) : y;
}

function mapGeneratorWidth(bounds, width) {
  return bounds ? (numberOr(width, 0) / 100) * bounds.width : width;
}

function mapGeneratorHeight(bounds, height) {
  return bounds ? (numberOr(height, 0) / 100) * bounds.height : height;
}

function mapGeneratorHitZoneBounds(bounds, zoneBounds = {}) {
  if (!bounds) return zoneBounds;
  return {
    ...zoneBounds,
    x: mapGeneratorX(bounds, zoneBounds.x ?? 0),
    y: mapGeneratorY(bounds, zoneBounds.y ?? 0),
    width: mapGeneratorWidth(bounds, zoneBounds.width ?? 100),
    height: mapGeneratorHeight(bounds, zoneBounds.height ?? 100),
    unit: 'percent',
  };
}

function addPart(parts, name, part, generatorName = '') {
  parts[name] = {
    ...part,
    generated: true,
    meta: {
      ...(part?.meta ?? {}),
      generated: true,
      generatedBy: generatorName,
    },
  };
}

function addHitZone(hitZones, name, zone, generatorName = '') {
  hitZones[name] = {
    _type: 'HitZone',
    name,
    enabled: true,
    visibleInEditor: true,
    priority: 20,
    cursor: 'pointer',
    condition: '',
    ...zone,
    generated: true,
    meta: {
      ...(zone?.meta ?? {}),
      generated: true,
      generatedBy: generatorName,
    },
  };
}

function makeTickPart(name, { x, y, width, height, zIndex, rotation = 0, colour = '99FFFFFF' }) {
  return createPartNode(name, {
    role: 'generatedTick',
    kind: 'rectangle',
    zIndex,
    layout: {
      x,
      y,
      width,
      height,
      xUnit: 'percent',
      yUnit: 'percent',
      widthUnit: 'px',
      heightUnit: 'px',
      rotation,
    },
    sections: {
      Background: createBackground(colour, { borderEnabled: false, radius: 2 }),
    },
  });
}

function makeGridLinePart(name, { x, y, width, height, zIndex, colour = '44FFFFFF' }) {
  return createPartNode(name, {
    role: 'generatedGridLine',
    kind: 'rectangle',
    zIndex,
    layout: {
      x,
      y,
      width,
      height,
      xUnit: 'percent',
      yUnit: 'percent',
      widthUnit: 'percent',
      heightUnit: 'percent',
    },
    sections: {
      Background: createBackground(colour, { borderEnabled: false, radius: 0 }),
    },
  });
}

function makeArpRuntimePart(name, {
  role = 'generatedArpeggiator',
  kind = 'rectangle',
  x = 0,
  y = 0,
  width = 10,
  height = 10,
  zIndex = 20,
  colour = '44FFFFFF',
  borderEnabled = false,
  borderColour = '55FFFFFF',
  borderThickness = 1,
  radius = 0,
  text = '',
  textColour = 'FFFFFFFF',
  fontSize = 10,
  fontWeight = 600,
  opacity = 1,
  meta = {},
} = {}) {
  const sections = {
    Background: createBackground(colour, {
      borderEnabled,
      borderColour,
      borderThickness,
      radius,
    }),
  };
  if (text) {
    sections.Text = createText(text, {
      colour: textColour,
      size: fontSize,
      weight: fontWeight,
    });
  }
  return createPartNode(name, {
    role,
    kind,
    zIndex,
    opacity,
    layout: {
      x,
      y,
      width,
      height,
      xUnit: 'px',
      yUnit: 'px',
      widthUnit: 'px',
      heightUnit: 'px',
      anchorX: 'left',
      anchorY: 'top',
    },
    sections,
    meta,
  });
}

function percent(value, total) {
  return total > 0 ? (value / total) * 100 : 0;
}

function materializeArpeggiator(parts, hitZones, control, signals = {}) {
  const arpeggiator = getCustomArpeggiator(signals?.arpeggiator ?? control);
  if (!arpeggiator.enabled) return;

  const transform = control?._children?.Transform ?? {};
  const width = Math.max(320, numberOr(transform.width, 720));
  const height = Math.max(180, numberOr(transform.height, 300));
  const labelWidth = 44;
  const rulerHeight = 24;
  const gridLeft = labelWidth;
  const gridTop = rulerHeight;
  const numericFields = control?._children?.Designer?.arpeggiator?.numericFields === true;
  const editing = control?._children?.Designer?.patternEditing?.kind === 'gaia';
  const inspector = arpeggiatorInspectorLayout(width, editing);
  const gridWidth = Math.max(1, inspector.contentWidth - labelWidth - 8);
  const gridHeight = Math.max(1, height - rulerHeight - 8 - (numericFields ? inspector.height : 0));
  const rowHeight = gridHeight / 12;
  const stepWidth = gridWidth / Math.max(1, arpeggiator.stepCount);
  const currentStepRaw = signals?.customChannels?.['channel.arpCurrentStep.raw'];
  const currentStep = Math.max(0, Math.min(arpeggiator.stepCount - 1, Math.round(numberOr(currentStepRaw, -1))));
  const showPlayhead = Number.isFinite(Number(currentStepRaw));
  // Loop length is independent of the editor's width: never crop stored notes.
  const endStepRaw = signals?.customChannels?.['channel.arpEndStep.raw'];
  const hasEndStep = endStepRaw != null && Number.isFinite(Number(endStepRaw));
  const endStep = Math.round(clamp(numberOr(endStepRaw, arpeggiator.stepCount), 1, arpeggiator.stepCount));
  if (hasEndStep) {
    addHitZone(hitZones, 'arp_end_step_ruler', {
      shape: 'rectangle', action: 'arpeggiatorEndStep', targetValueChannel: 'arpEndStep',
      priority: 50, cursor: 'ew-resize',
      bounds: { x: percent(gridLeft, width), y: 0, width: percent(gridWidth, width), height: percent(rulerHeight, height), unit: 'percent' },
      payload: { steps: arpeggiator.stepCount },
    }, 'arpeggiator');
  }

  addHitZone(hitZones, 'arp_grid_draw', {
    shape: 'rectangle',
    action: 'arpeggiatorDraw',
    priority: 30,
    cursor: 'crosshair',
    bounds: {
      x: percent(gridLeft, width),
      y: percent(gridTop, height),
      width: percent(gridWidth, width),
      height: percent(gridHeight, height),
      unit: 'percent',
    },
    payload: { type: 'arpeggiatorGrid' },
  }, 'arpeggiator');

  addPart(parts, 'arp_runtime_ruler', makeArpRuntimePart('arp_runtime_ruler', {
    role: 'arpeggiatorRuler',
    x: gridLeft,
    y: 0,
    width: gridWidth,
    height: rulerHeight,
    zIndex: 18,
    colour: 'FF151A20',
    borderEnabled: true,
    borderColour: '223D4A55',
    radius: 0,
  }), 'arpeggiator');

  for (let noteIndex = 0; noteIndex < 12; noteIndex += 1) {
    const note = arpeggiator.viewNote + 11 - noteIndex;
    const y = gridTop + (noteIndex * rowHeight);
    addPart(parts, `arp_note_label_${note}`, makeArpRuntimePart(`arp_note_label_${note}`, {
      role: 'arpeggiatorNoteLabel',
      x: 0,
      y,
      width: labelWidth,
      height: rowHeight,
      zIndex: 19,
      colour: note % 12 === 0 ? 'FF202A32' : 'FF171D23',
      borderEnabled: true,
      borderColour: '223D4A55',
      text: noteNameFromMidi(note),
      textColour: note % 12 === 0 ? 'FFE6F7FF' : 'FF92A1AD',
      fontSize: 9,
      meta: { note },
    }), 'arpeggiator');
  }

  for (let row = 0; row < 12; row += 1) {
    addPart(parts, `arp_row_${row + 1}`, makeArpRuntimePart(`arp_row_${row + 1}`, {
      role: 'arpeggiatorRow',
      x: gridLeft,
      y: gridTop + (row * rowHeight),
      width: gridWidth,
      height: rowHeight,
      zIndex: 16,
      colour: row % 2 === 0 ? 'FF11161B' : 'FF0D1116',
      borderEnabled: true,
      borderColour: '18323C46',
      meta: { row },
    }), 'arpeggiator');
  }

  for (let step = 0; step < arpeggiator.stepCount; step += 1) {
    const major = step % 4 === 0;
    const x = gridLeft + (step * stepWidth);
    if (step % Math.max(1, Math.ceil(arpeggiator.stepCount / 32)) === 0) {
      addPart(parts, `arp_step_label_${step + 1}`, makeArpRuntimePart(`arp_step_label_${step + 1}`, {
        role: 'arpeggiatorStepLabel',
        x,
        y: 0,
        width: Math.max(14, stepWidth),
        height: rulerHeight,
        zIndex: 19,
        colour: hasEndStep && step + 1 === endStep ? 'FF60491F' : '00000000',
        text: String(step + 1),
        textColour: hasEndStep && step + 1 === endStep ? 'FFFFD77A' : major ? 'FFD7E7EF' : 'FF77848D',
        fontSize: 8,
        meta: { step },
      }), 'arpeggiator');
    }
    addPart(parts, `arp_step_${step + 1}`, makeArpRuntimePart(`arp_step_${step + 1}`, {
      role: 'arpeggiatorStep',
      x,
      y: gridTop,
      width: Math.max(1, major ? 2 : 1),
      height: gridHeight,
      zIndex: 17,
      colour: major ? '335CA8C8' : '1EFFFFFF',
      meta: { step },
    }), 'arpeggiator');
  }

  if (showPlayhead) {
    addPart(parts, 'arp_playhead', makeArpRuntimePart('arp_playhead', {
      role: 'arpeggiatorPlayhead',
      x: gridLeft + (currentStep * stepWidth),
      y: gridTop,
      width: Math.max(2, stepWidth),
      height: gridHeight,
      zIndex: 21,
      colour: '223CCBFF',
      borderEnabled: true,
      borderColour: 'AA3CCBFF',
      radius: 1,
      meta: { step: currentStep },
    }), 'arpeggiator');
  }

  for (const block of arpeggiator.blocks) {
    if (block.note < arpeggiator.viewNote || block.note >= arpeggiator.viewNote + 12) continue;
    const row = arpeggiator.viewNote + 11 - block.note;
    const velocityRatio = clamp(numberOr(block.velocity, 1) / 127, 0, 1);
    const blockName = `arp_block_${String(block.id).replace(/[^A-Za-z0-9_]/g, '_')}`;
    addPart(parts, blockName, makeArpRuntimePart(blockName, {
      role: 'arpeggiatorBlock',
      x: gridLeft + (block.step * stepWidth) + 1,
      y: gridTop + (row * rowHeight) + 2,
      width: Math.max(3, (block.length * stepWidth) - 2),
      height: Math.max(4, rowHeight - 4),
      zIndex: 24,
      colour: velocityRatio > 0.78 ? 'FFD7B85F' : (velocityRatio > 0.55 ? 'FF61B3C7' : 'FF7E8DD8'),
      borderEnabled: true,
      borderColour: 'CCF6FBFF',
      radius: 4,
      text: `${noteNameFromMidi(block.note)} ${block.velocity}`,
      textColour: 'FF081015',
      fontSize: 9,
      fontWeight: 800,
      meta: { ...block },
    }), 'arpeggiator');

    const blockX = gridLeft + block.step * stepWidth + 1;
    const blockY = gridTop + row * rowHeight + 2;
    const blockWidth = Math.max(3, block.length * stepWidth - 2);
    const blockHeight = Math.max(4, rowHeight - 4);
    if (block.id === arpeggiator.selectedBlock) {
      // Above the inactive-step shade so an edited outside-loop note remains identifiable.
      addPart(parts, `${blockName}_selected`, makeArpRuntimePart(`${blockName}_selected`, {
        role: 'arpeggiatorSelectionOutline', x: blockX - 1, y: blockY - 1,
        width: blockWidth + 2, height: blockHeight + 2, zIndex: 28,
        colour: '00000000', borderEnabled: true, borderColour: 'FFFFD77A', borderThickness: 2, radius: 4,
      }), 'arpeggiator');
    }
    const zones = [
      ['move', 'arpeggiatorMove', 'move'],
      ['velocity', 'arpeggiatorVelocity', 'ns-resize'],
      ['resize', 'arpeggiatorResize', 'ew-resize'],
    ];
    zones.forEach(([suffix, action, cursor], zoneIndex) => {
      addHitZone(hitZones, `${blockName}_${suffix}`, {
        shape: 'rectangle', action, priority: 80, cursor,
        bounds: {
          x: percent(blockX + zoneIndex * blockWidth / 3, width),
          y: percent(blockY, height),
          width: percent(blockWidth / 3, width),
          height: percent(blockHeight, height),
          unit: 'percent',
        },
        payload: { type: 'arpeggiatorBlock', blockId: block.id },
      }, 'arpeggiator');
      if (zoneIndex > 0) {
        // Short notches mark the thirds without running through the note/velocity text.
        for (const [edge, y] of [['top', blockY], ['bottom', blockY + blockHeight - 3]]) {
          const name = `${blockName}_zone_${zoneIndex}_${edge}`;
          addPart(parts, name, makeArpRuntimePart(name, {
            role: 'arpeggiatorZoneDivider', x: blockX + zoneIndex * blockWidth / 3,
            y, width: 1, height: 3, zIndex: 25, colour: '99081015',
          }), 'arpeggiator');
        }
      }
    });
  }
  if (hasEndStep) {
    const endX = gridLeft + endStep * stepWidth;
    if (endStep < arpeggiator.stepCount) {
      addPart(parts, 'arp_inactive_steps', makeArpRuntimePart('arp_inactive_steps', {
        role: 'arpeggiatorInactiveSteps', x: endX, y: 0,
        width: gridWidth - endStep * stepWidth, height: gridTop + gridHeight,
        zIndex: 26, colour: '99000000',
        meta: { endStep },
      }), 'arpeggiator');
    }
    addPart(parts, 'arp_end_boundary', makeArpRuntimePart('arp_end_boundary', {
      role: 'arpeggiatorEndBoundary', x: endX - 2, y: 0, width: 2,
      height: gridTop + gridHeight, zIndex: 27, colour: 'FFE5AD35',
      meta: { endStep },
    }), 'arpeggiator');
    addPart(parts, 'arp_end_label', makeArpRuntimePart('arp_end_label', {
      role: 'arpeggiatorEndLabel', x: Math.max(gridLeft, endX - 62), y: gridTop + gridHeight - 18,
      width: 60, height: 18, zIndex: 28, colour: 'E6222529',
      text: `END ${endStep}`, textColour: 'FFE5AD35', fontSize: 10,
    }), 'arpeggiator');
  }
  if (numericFields) {
    const selected = arpeggiator.blocks.find(b => b.id === arpeggiator.selectedBlock);
    const ordered = [...arpeggiator.blocks].sort((a, b) => a.step - b.step || a.note - b.note || a.id.localeCompare(b.id));
    const selectionIndex = ordered.findIndex(b => b.id === arpeggiator.selectedBlock);
    const y = height - inspector.height + 2;
    const footer = [
      ['selection', 'arpeggiatorSelectionLabel', 44, 156, selected ? `NOTE ${selectionIndex + 1} / ${ordered.length}` : 'SELECT A NOTE', 0],
      ['previous', 'arpeggiatorNavigation', 208, 28, '‹', 0],
      ['next', 'arpeggiatorNavigation', 244, 28, '›', 0],
    ];
    const fieldValues = selected ? { Pitch: noteNameFromMidi(selected.note), Start: selected.step + 1, Length: selected.length, Velocity: selected.velocity } : {};
    for (const field of inspector.fields) {
      footer.push([`${field.name}Label`, 'arpeggiatorFieldLabel', field.x, 72, field.name.toUpperCase(), field.y]);
      footer.push([field.name.toLowerCase(), `arp${field.name}Field`, field.x + 72, 60, selected ? String(fieldValues[field.name]) : '—', field.y]);
    }
    if (width >= 1180) {
      const outside = selected && hasEndStep && selected.step >= endStep;
      const crosses = selected && hasEndStep && selected.step < endStep && selected.step + selected.length > endStep;
      footer.push(['status', 'arpeggiatorSelectionStatus', 848, 144, outside ? 'OUTSIDE LOOP' : crosses ? 'TAIL OUTSIDE LOOP' : selected ? 'IN LOOP' : '', 0]);
      if (!editing) footer.push(['keys', 'arpeggiatorKeyboardHint', 1000, width - 1008, '[ / ] SELECT · ARROWS MOVE / PITCH', 0]);
    }
    for (const [name, role, x, w, text, offsetY] of footer) {
      const editable = /^arp(Pitch|Start|Length|Velocity)Field$/.test(role);
      const navigation = role === 'arpeggiatorNavigation';
      addPart(parts, `arp_numeric_${name}`, makeArpRuntimePart(`arp_numeric_${name}`, {
        role, x, y: y + offsetY, width: w, height: inspector.fieldHeight, zIndex: 29, text, fontSize: role === 'arpeggiatorKeyboardHint' ? 9 : 11,
        colour: editable || navigation ? 'FF11181E' : '00000000', textColour: editable || role === 'arpeggiatorSelectionStatus' ? 'FFE6C66C' : 'FFAEBAC6',
        borderEnabled: editable || navigation, borderColour: 'FF58616A', radius: 3,
      }), 'arpeggiator');
      if (navigation && ordered.length) addHitZone(hitZones, `arp_select_${name}`, {
        shape: 'rectangle', action: 'arpeggiatorSelect', priority: 80, cursor: 'pointer',
        bounds: { x: percent(x, width), y: percent(y, height), width: percent(w, width), height: percent(inspector.fieldHeight, height), unit: 'percent' },
        payload: { direction: name },
      }, 'arpeggiator');
    }
  }
  if (editing && numericFields) {
    const state = control._children.Designer.patternEditingState ?? {};
    const selected = arpeggiator.blocks.some(b => b.id === arpeggiator.selectedBlock);
    const y = height - 22;
    const helpX = inspector.contentWidth - 70;
    const buttons = [
      ['undo', 'UNDO', 44, 62, state.undo], ['redo', 'REDO', 112, 62, state.redo],
      ['duplicate', 'DUPLICATE', 190, 90, selected], ['delete', 'DELETE NOTE', 286, 102, selected],
      ['read', state.busy ? 'CANCEL' : 'READ PATTERN', 412, 122, true],
      ['send', 'SEND PATTERN', 540, 122, !state.busy],
      ['help', 'HELP', helpX, 62, true],
    ];
    for (const [index, [action, text, originalX, originalWidth, enabled]] of buttons.entries()) {
      const sideButton = inspector.sideWidth && action !== 'help';
      const x = sideButton ? inspector.contentWidth + 4 : originalX;
      const w = sideButton ? 120 : originalWidth;
      const buttonY = sideButton ? 4 + index * 26 : y;
      const buttonHeight = sideButton ? 22 : 18;
      addPart(parts, `arp_edit_${action}`, makeArpRuntimePart(`arp_edit_${action}`, {
        role: 'arpeggiatorEditButton', x, y: buttonY, width: w, height: buttonHeight, zIndex: 29, text,
        colour: 'FF17222B', textColour: enabled ? (action === 'send' ? 'FFE6C66C' : 'FFD7E1E9') : 'FF626C75',
        borderEnabled: true, borderColour: enabled ? 'FF687684' : 'FF343F48', radius: 3, fontSize: 10,
      }), 'arpeggiator');
      if (enabled) addHitZone(hitZones, `arp_edit_${action}`, {
        shape: 'rectangle', action: 'arpeggiatorCommand', priority: 90, cursor: 'pointer',
        bounds: { x: percent(x, width), y: percent(buttonY, height), width: percent(w, width), height: percent(buttonHeight, height), unit: 'percent' },
        payload: { command: action },
      }, 'arpeggiator');
    }
    if (width > 740) {
      const statusPart = makeArpRuntimePart('arp_edit_status', {
        role: 'arpeggiatorEditStatus', x: inspector.sideWidth ? inspector.contentWidth + 4 : 682,
        y: inspector.sideWidth ? 164 : y, width: inspector.sideWidth ? 120 : Math.max(0, helpX - 690),
        height: inspector.sideWidth ? height - 168 : 18, zIndex: 29,
        text: state.message || '',
        colour: '00000000', textColour: state.error ? 'FFFF8080' : 'FFAEBAC6', fontSize: inspector.sideWidth ? 9 : 10,
      });
      if (inspector.sideWidth && statusPart._children.Text) {
        Object.assign(statusPart._children.Text._children.Multiline, { maxLines: 4, wrapMode: 'word', fitMode: 'shrink', lineHeight: 1.1 });
      }
      addPart(parts, 'arp_edit_status', statusPart, 'arpeggiator');
    }
  }
}

function makeLedPart(name, {
  x,
  y,
  size,
  zIndex,
  colour,
  borderColour = '55FFFFFF',
  opacity = 1,
}) {
  return createPartNode(name, {
    role: 'generatedLed',
    kind: 'circle',
    zIndex,
    opacity,
    layout: {
      x,
      y,
      width: size,
      height: size,
      xUnit: 'percent',
      yUnit: 'percent',
      widthUnit: 'px',
      heightUnit: 'px',
    },
    sections: {
      Background: createBackground(colour, { borderEnabled: false, borderColour, borderThickness: 1, radius: 999 }),
    },
    meta: {
      led: true,
    },
  });
}

function materializeTicks(parts, generator, prefix, generatorName = '') {
  const count = Math.max(0, Math.round(numberOr(generator?.count, 11)));
  const minorCount = Math.max(0, Math.round(numberOr(generator?.minorCount, 0)));
  const geometry = String(generator?.geometry ?? 'linear').trim().toLowerCase();
  const zIndex = numberOr(generator?.zIndex, 6);
  const bounds = generatorBounds(generator);
  if (count <= 0) return;

    if (geometry === 'circular' || geometry === 'ring') {
      const radius = numberOr(generator?.radius, 39);
      const { startAngle, endAngle } = circularGeneratorAngles(generator, -135, 135);
      const span = endAngle - startAngle;
    const denominator = Math.max(1, count - 1);
    for (let index = 0; index < count; index += 1) {
      const normalized = count === 1 ? 0.5 : index / denominator;
      const angle = startAngle + (span * normalized);
      const radians = (angle * Math.PI) / 180;
      addPart(parts, `${prefix}_major_${index + 1}`, makeTickPart(`${prefix}_major_${index + 1}`, {
        x: mapGeneratorX(bounds, 50 + (Math.cos(radians) * radius)),
        y: mapGeneratorY(bounds, 50 + (Math.sin(radians) * radius)),
        width: 2,
        height: 13,
        zIndex,
        rotation: angle + 90,
      }), generatorName);

      if (minorCount <= 0 || index >= count - 1) continue;
      for (let minor = 1; minor <= minorCount; minor += 1) {
        const minorNormalized = (index + (minor / (minorCount + 1))) / denominator;
        const minorAngle = startAngle + (span * minorNormalized);
        const minorRadians = (minorAngle * Math.PI) / 180;
        addPart(parts, `${prefix}_minor_${index + 1}_${minor}`, makeTickPart(`${prefix}_minor_${index + 1}_${minor}`, {
          x: mapGeneratorX(bounds, 50 + (Math.cos(minorRadians) * radius)),
          y: mapGeneratorY(bounds, 50 + (Math.sin(minorRadians) * radius)),
          width: 1,
          height: 8,
          zIndex: zIndex - 0.1,
          rotation: minorAngle + 90,
          colour: '66FFFFFF',
        }), generatorName);
      }
    }
    return;
  }

  const vertical = geometry === 'vertical';
  const denominator = Math.max(1, count - 1);
  for (let index = 0; index < count; index += 1) {
    const normalized = count === 1 ? 0.5 : index / denominator;
    addPart(parts, `${prefix}_major_${index + 1}`, makeTickPart(`${prefix}_major_${index + 1}`, {
      x: mapGeneratorX(bounds, vertical ? 14 : 14 + (normalized * 72)),
      y: mapGeneratorY(bounds, vertical ? 86 - (normalized * 72) : 82),
      width: vertical ? 12 : 2,
      height: vertical ? 2 : 12,
      zIndex,
    }), generatorName);

    if (minorCount <= 0 || index >= count - 1) continue;
    for (let minor = 1; minor <= minorCount; minor += 1) {
      const minorNormalized = (index + (minor / (minorCount + 1))) / denominator;
      addPart(parts, `${prefix}_minor_${index + 1}_${minor}`, makeTickPart(`${prefix}_minor_${index + 1}_${minor}`, {
        x: mapGeneratorX(bounds, vertical ? 18 : 14 + (minorNormalized * 72)),
        y: mapGeneratorY(bounds, vertical ? 86 - (minorNormalized * 72) : 85),
        width: vertical ? 8 : 1,
        height: vertical ? 1 : 7,
        zIndex: zIndex - 0.1,
        colour: '66FFFFFF',
      }), generatorName);
    }
  }
}

function materializeLeds(parts, generator, prefix, generatorName = '', hitZones = null, signals = {}) {
  const count = Math.max(1, Math.round(numberOr(generator?.count, 16)));
  const geometry = String(generator?.geometry ?? 'linear').trim().toLowerCase();
  const zIndex = numberOr(generator?.zIndex, 8);
  const size = Math.max(1, numberOr(generator?.ledSize ?? generator?.size, 9));
  const activeColour = generator?.activeColour ?? generator?.colour ?? 'FF5B9BD5';
  const inactiveColour = generator?.inactiveColour ?? '332C3840';
  const activeBorderColour = generator?.activeBorderColour ?? '99DFF3FF';
  const inactiveBorderColour = generator?.inactiveBorderColour ?? '33445566';
  const inactiveOpacity = clamp(numberOr(generator?.inactiveOpacity, 0.7), 0, 1);
  const valueSource = generator?.valueSource ?? generator?.targetValueChannel ?? 'mainValue';
  const normalized = normalizedSignalForValueSource(signals, valueSource);
  const activationMode = String(generator?.activationMode ?? 'cumulative').trim().toLowerCase();
  const bounds = generatorBounds(generator);

  function isActive(index) {
    if (activationMode === 'single') {
      return index === clamp(Math.round(normalized * (count - 1)), 0, count - 1);
    }
    return normalized >= ((index + 1) / count);
  }

  function addLed(index, x, y) {
    const active = isActive(index);
    const ledName = `${prefix}_${index + 1}`;
    const threshold = (index + 1) / count;
    const mappedX = mapGeneratorX(bounds, x);
    const mappedY = mapGeneratorY(bounds, y);
    addPart(parts, ledName, makeLedPart(ledName, {
      x: mappedX,
      y: mappedY,
      size,
      zIndex,
      colour: active ? activeColour : inactiveColour,
      borderColour: active ? activeBorderColour : inactiveBorderColour,
      opacity: active ? 1 : inactiveOpacity,
    }), generatorName);
    parts[ledName].meta = {
      ...(parts[ledName].meta ?? {}),
      threshold,
      active,
      valueSource,
    };

    if (generator?.generatedHitZones === true && hitZones) {
      addHitZone(hitZones, `${prefix}_zone_${index + 1}`, {
        shape: 'circle',
        targetBehavior: generator?.targetBehavior ?? '',
        targetValueChannel: generator?.targetValueChannel ?? 'mainValue',
        action: generator?.hitZoneAction ?? 'setValue',
        payload: {
          type: 'ledSegment',
          index,
          number: index + 1,
          normalized: threshold,
          threshold,
        },
        bounds: {
          x: mappedX - mapGeneratorWidth(bounds, 3),
          y: mappedY - mapGeneratorHeight(bounds, 3),
          width: mapGeneratorWidth(bounds, 6),
          height: mapGeneratorHeight(bounds, 6),
          unit: 'percent',
        },
      }, generatorName);
    }
  }

  if (geometry === 'circular' || geometry === 'ring') {
    const radius = numberOr(generator?.radius, 38);
    const { startAngle, endAngle } = circularGeneratorAngles(generator, -135, 135);
    const span = endAngle - startAngle;
    const denominator = Math.max(1, count - 1);
    for (let index = 0; index < count; index += 1) {
      const angle = startAngle + (span * (count === 1 ? 0.5 : index / denominator));
      const radians = (angle * Math.PI) / 180;
      addLed(index, 50 + (Math.cos(radians) * radius), 50 + (Math.sin(radians) * radius));
    }
    return;
  }

  const vertical = geometry === 'vertical';
  const denominator = Math.max(1, count - 1);
  for (let index = 0; index < count; index += 1) {
    const normalizedIndex = count === 1 ? 0.5 : index / denominator;
    addLed(
      index,
      vertical ? 50 : 14 + (normalizedIndex * 72),
      vertical ? 86 - (normalizedIndex * 72) : 50
    );
  }
}

// Value labels along a scale (linear, vertical, or circular). Explicit
// `labels` win; otherwise numbers interpolate min..max with `precision` and
// an optional `suffix`.
function materializeLabels(parts, generator, prefix, generatorName = '') {
  const count = Math.max(1, Math.round(numberOr(generator?.count, 5)));
  const geometry = String(generator?.geometry ?? 'linear').trim().toLowerCase();
  const zIndex = numberOr(generator?.zIndex, 7);
  const bounds = generatorBounds(generator);
  const colour = generator?.colour ?? 'CCB9C8D4';
  const fontSize = Math.max(5, numberOr(generator?.fontSize, 9));
  const explicitLabels = Array.isArray(generator?.labels) ? generator.labels : null;
  const min = numberOr(generator?.min, 0);
  const max = numberOr(generator?.max, 100);
  const precision = Math.max(0, Math.min(4, Math.round(numberOr(generator?.precision, 0))));
  const suffix = String(generator?.suffix ?? '');
  const denominator = Math.max(1, count - 1);

  for (let index = 0; index < count; index += 1) {
    const normalized = count === 1 ? 0.5 : index / denominator;
    const text = explicitLabels?.[index] !== undefined && explicitLabels?.[index] !== null
      ? String(explicitLabels[index])
      : `${(min + ((max - min) * normalized)).toFixed(precision)}${suffix}`;

    let x = 6 + (normalized * 88);
    let y = 85;
    if (geometry === 'vertical') {
      x = 14;
      y = 90 - (normalized * 80);
    } else if (geometry === 'circular' || geometry === 'ring') {
      const radius = numberOr(generator?.radius, 42);
      const { startAngle, endAngle } = circularGeneratorAngles(generator, -135, 135);
      const angle = startAngle + ((endAngle - startAngle) * normalized);
      const radians = (dialAngleToCanvasAngle(angle) * Math.PI) / 180;
      x = 50 + (Math.cos(radians) * radius);
      y = 50 + (Math.sin(radians) * radius);
    }

    addPart(parts, `${prefix}_label_${index + 1}`, createPartNode(`${prefix}_label_${index + 1}`, {
      role: 'generatedLabel',
      kind: 'text',
      zIndex,
      layout: {
        x: mapGeneratorX(bounds, x),
        y: mapGeneratorY(bounds, y),
        width: 34,
        height: 12,
        xUnit: 'percent',
        yUnit: 'percent',
        widthUnit: 'px',
        heightUnit: 'px',
      },
      sections: { Text: createText(text, { size: fontSize, weight: 600, colour }) },
      meta: { generatedLabel: true, index, normalized },
    }), generatorName);
  }
}

// A bank of N buttons: one part per button plus (by default) a generated
// setValue zone per button carrying its index/value payload. The button
// matching the target channel's current raw value renders highlighted, so
// the bank behaves like a segmented selector with zero hand wiring.
function materializeButtons(parts, control, signals, generator, prefix, generatorName = '', hitZones = null) {
  const count = Math.max(1, Math.round(numberOr(generator?.count, 4)));
  const geometry = String(generator?.geometry ?? 'linear').trim().toLowerCase();
  const vertical = geometry === 'vertical';
  const zIndex = numberOr(generator?.zIndex, 7);
  const bounds = generatorBounds(generator);
  const labels = Array.isArray(generator?.labels) ? generator.labels : null;
  const values = Array.isArray(generator?.values) ? generator.values : null;
  const activeColour = generator?.activeColour ?? 'FF5B9BD5';
  const inactiveColour = generator?.inactiveColour ?? generator?.colour ?? 'FF232C34';
  const fontSize = Math.max(5, numberOr(generator?.fontSize, 9));
  const gap = clamp(numberOr(generator?.gap, 8), 0, 60); // % of one cell kept as spacing

  const channelName = String(generator?.targetValueChannel ?? generator?.valueSource ?? '').trim();
  const currentRaw = signals?.customChannels?.[`channel.${channelName}.raw`];
  const denominator = Math.max(1, count - 1);
  const cell = 100 / count;
  const size = cell * (1 - (gap / 100));

  for (let index = 0; index < count; index += 1) {
    const value = values?.[index] !== undefined ? values[index] : index;
    const label = labels?.[index] !== undefined && labels?.[index] !== null ? String(labels[index]) : String(value);
    const active = currentRaw !== undefined && String(currentRaw) === String(value);
    const center = (index + 0.5) * cell;
    const buttonName = `${prefix}_${index + 1}`;

    addPart(parts, buttonName, createPartNode(buttonName, {
      role: 'generatedButton',
      kind: 'roundedRectangle',
      zIndex,
      layout: {
        x: mapGeneratorX(bounds, vertical ? 50 : center),
        y: mapGeneratorY(bounds, vertical ? center : 50),
        width: mapGeneratorWidth(bounds, vertical ? 88 : size),
        height: mapGeneratorHeight(bounds, vertical ? size : 76),
        xUnit: 'percent',
        yUnit: 'percent',
        widthUnit: 'percent',
        heightUnit: 'percent',
      },
      sections: {
        Background: createBackground(active ? activeColour : inactiveColour, {
          borderEnabled: true,
          borderColour: active ? '99DFF3FF' : '332B3742',
          borderThickness: 1,
          radius: 4,
        }),
        Text: createText(label, { size: fontSize, weight: 700, colour: active ? 'FF10161B' : 'CCB9C8D4' }),
      },
      meta: { generatedButton: true, index, value, active },
    }), generatorName);

    if (generator?.generatedHitZones !== false && hitZones && channelName) {
      addHitZone(hitZones, `${prefix}_zone_${index + 1}`, {
        shape: 'rectangle',
        targetBehavior: generator?.targetBehavior ?? '',
        targetValueChannel: channelName,
        action: generator?.hitZoneAction ?? 'setValue',
        payload: {
          type: 'bankButton',
          index,
          number: index + 1,
          value,
          normalized: count === 1 ? 0 : index / denominator,
        },
        bounds: mapGeneratorHitZoneBounds(bounds, {
          x: vertical ? 0 : index * cell,
          y: vertical ? index * cell : 0,
          width: vertical ? 100 : cell,
          height: vertical ? cell : 100,
          unit: 'percent',
        }),
      }, generatorName);
    }
  }
}

// Windowed virtual list: `count` virtual items, `rows` visible at once.
// A scroll channel (valueSource, normalized 0..1) picks the window's first
// item; the generator re-materializes live as the channel moves, so no
// renderer clipping is needed — edge rows snap in/out rather than clip.
// Optional `targetValueChannel` turns rows into a selector: clicking a row
// sets that channel to the row's item index (or its `values[i]` payload),
// and the matching row renders highlighted.
function materializeScrollList(parts, control, signals, generator, prefix, generatorName = '', hitZones = null) {
  const count = Math.max(1, Math.round(numberOr(generator?.count, 12)));
  const visibleRows = Math.max(1, Math.min(count, Math.round(numberOr(generator?.rows, 4))));
  const zIndex = numberOr(generator?.zIndex, 6);
  const bounds = generatorBounds(generator);
  const labels = Array.isArray(generator?.labels) ? generator.labels : null;
  const values = Array.isArray(generator?.values) ? generator.values : null;
  const activeColour = generator?.activeColour ?? 'FF5B9BD5';
  const inactiveColour = generator?.inactiveColour ?? generator?.colour ?? 'FF1B242C';
  const fontSize = Math.max(5, numberOr(generator?.fontSize, 9));
  const gap = clamp(numberOr(generator?.gap, 10), 0, 60);

  const scrollSource = generator?.valueSource ?? generator?.scrollChannel ?? '';
  const scrollNormalized = normalizedSignalForValueSource(signals, scrollSource);
  const maxFirst = Math.max(0, count - visibleRows);
  const firstIndex = clamp(Math.round(scrollNormalized * maxFirst), 0, maxFirst);

  const selectChannel = String(generator?.targetValueChannel ?? '').trim();
  const selectedRaw = selectChannel ? signals?.customChannels?.[`channel.${selectChannel}.raw`] : undefined;

  const rowCell = 100 / visibleRows;
  const rowSize = rowCell * (1 - (gap / 100));

  for (let slot = 0; slot < visibleRows; slot += 1) {
    const itemIndex = firstIndex + slot;
    const value = values?.[itemIndex] !== undefined ? values[itemIndex] : itemIndex;
    const label = labels?.[itemIndex] !== undefined && labels?.[itemIndex] !== null
      ? String(labels[itemIndex])
      : `Item ${itemIndex + 1}`;
    const active = selectedRaw !== undefined && String(selectedRaw) === String(value);
    const rowName = `${prefix}_row_${slot + 1}`; // slot-stable names; meta carries the virtual index

    addPart(parts, rowName, createPartNode(rowName, {
      role: 'generatedListRow',
      kind: 'roundedRectangle',
      zIndex,
      layout: {
        x: mapGeneratorX(bounds, 50),
        y: mapGeneratorY(bounds, (slot + 0.5) * rowCell),
        width: mapGeneratorWidth(bounds, 96),
        height: mapGeneratorHeight(bounds, rowSize),
        xUnit: 'percent',
        yUnit: 'percent',
        widthUnit: 'percent',
        heightUnit: 'percent',
      },
      sections: {
        Background: createBackground(active ? activeColour : inactiveColour, {
          borderEnabled: true,
          borderColour: active ? '99DFF3FF' : '22344551',
          borderThickness: 1,
          radius: 3,
        }),
        Text: createText(label, { size: fontSize, weight: 600, colour: active ? 'FF10161B' : 'CCB9C8D4' }),
      },
      meta: { generatedListRow: true, slot, itemIndex, value, active, firstIndex, count },
    }), generatorName);

    if (generator?.generatedHitZones !== false && hitZones && selectChannel) {
      addHitZone(hitZones, `${prefix}_rowZone_${slot + 1}`, {
        shape: 'rectangle',
        targetBehavior: generator?.targetBehavior ?? '',
        targetValueChannel: selectChannel,
        action: generator?.hitZoneAction ?? 'setValue',
        payload: {
          type: 'listRow',
          slot,
          index: itemIndex,
          number: itemIndex + 1,
          value,
          normalized: count > 1 ? itemIndex / (count - 1) : 0,
        },
        bounds: mapGeneratorHitZoneBounds(bounds, {
          x: 0,
          y: slot * rowCell,
          width: 100,
          height: rowCell,
          unit: 'percent',
        }),
      }, generatorName);
    }
  }
}

// Indexed per-instance repeats (§12.4): one bar per item of an ARRAY channel.
// Bar i's height follows item i live (through the channel signals), and the
// generated zone for column i writes item i back (action setItemValue), so
// "16 step buttons from a count" needs zero hand wiring.
function materializeStepBars(parts, control, signals, generator, prefix, generatorName = '', hitZones = null) {
  const channels = control?._children?.ValueChannels?._children ?? {};
  const channelName = String(generator?.valueSource ?? generator?.targetValueChannel ?? '')
    .replace(/^channel\./, '')
    .replace(/\..*$/, '')
    .trim();
  const channel = channels[channelName] ?? null;
  const liveItems = signals?.customChannels?.[`channel.${channelName}.items`];
  const items = Array.isArray(liveItems)
    ? liveItems
    : (Array.isArray(channel?.items) ? channel.items : []);
  const count = Math.max(1, Math.round(numberOr(generator?.count, items.length || 16)));
  const zIndex = numberOr(generator?.zIndex, 6);
  const bounds = generatorBounds(generator);
  const barColour = generator?.activeColour ?? generator?.colour ?? 'FF5B9BD5';
  const wellColour = generator?.inactiveColour ?? '22212B31';
  const gap = clamp(numberOr(generator?.gap, 18), 0, 80); // % of one column kept as spacing
  const minBar = clamp(numberOr(generator?.minBarHeight, 3), 0, 100); // % so a zero item stays visible

  const itemMin = numberOr(channel?.min, 0);
  const itemMax = Math.max(itemMin, numberOr(channel?.max, itemMin + 1));
  const span = Math.max(0.000001, itemMax - itemMin);

  const columnWidth = 100 / count;
  const barWidth = columnWidth * (1 - (gap / 100));

  for (let index = 0; index < count; index += 1) {
    const centerX = (index + 0.5) * columnWidth;
    const normalized = clamp((numberOr(items[index], itemMin) - itemMin) / span, 0, 1);
    const heightPct = Math.max(minBar, normalized * 100);

    // A faint full-height well behind each bar so empty steps still read as steps.
    addPart(parts, `${prefix}_well_${index + 1}`, createPartNode(`${prefix}_well_${index + 1}`, {
      role: 'generatedStepWell',
      kind: 'rectangle',
      zIndex: zIndex - 0.1,
      layout: {
        x: mapGeneratorX(bounds, centerX),
        y: mapGeneratorY(bounds, 50),
        width: mapGeneratorWidth(bounds, barWidth),
        height: mapGeneratorHeight(bounds, 100),
        xUnit: 'percent',
        yUnit: 'percent',
        widthUnit: 'percent',
        heightUnit: 'percent',
      },
      sections: { Background: createBackground(wellColour, { borderEnabled: false, radius: 2 }) },
      meta: { stepWell: true, index },
    }), generatorName);

    // The value bar, bottom-anchored inside the generator bounds.
    addPart(parts, `${prefix}_${index + 1}`, createPartNode(`${prefix}_${index + 1}`, {
      role: 'generatedStepBar',
      kind: 'rectangle',
      zIndex,
      layout: {
        x: mapGeneratorX(bounds, centerX),
        y: mapGeneratorY(bounds, 100),
        width: mapGeneratorWidth(bounds, barWidth),
        height: mapGeneratorHeight(bounds, heightPct),
        xUnit: 'percent',
        yUnit: 'percent',
        widthUnit: 'percent',
        heightUnit: 'percent',
        anchorY: 'bottom',
      },
      sections: { Background: createBackground(barColour, { borderEnabled: false, radius: 2 }) },
      meta: {
        stepBar: true,
        index,
        valueSource: channelName,
        itemNormalized: normalized,
      },
    }), generatorName);

    if (generator?.generatedHitZones !== false && hitZones && channelName) {
      addHitZone(hitZones, `${prefix}_zone_${index + 1}`, {
        shape: 'rectangle',
        cursor: 'ns-resize',
        targetBehavior: generator?.targetBehavior ?? '',
        targetValueChannel: channelName,
        action: 'setItemValue',
        payload: {
          type: 'stepBar',
          index,
          number: index + 1,
          count,
        },
        bounds: mapGeneratorHitZoneBounds(bounds, {
          x: index * columnWidth,
          y: 0,
          width: columnWidth,
          height: 100,
          unit: 'percent',
        }),
      }, generatorName);
    }
  }
}

function materializeGrid(parts, generator, prefix, generatorName = '', hitZones = null) {
  const rows = Math.max(1, Math.round(numberOr(generator?.rows, 4)));
  const columns = Math.max(1, Math.round(numberOr(generator?.columns, 4)));
  const zIndex = numberOr(generator?.zIndex, 5);
  const colour = generator?.colour ?? '44FFFFFF';
  const targetBehavior = generator?.targetBehavior ?? '';
  const targetValueChannel = generator?.targetValueChannel ?? 'mainValue';
  const targetValueChannelY = generator?.targetValueChannelY ?? generator?.targetYValueChannel ?? '';
  const bounds = generatorBounds(generator);

  for (let column = 0; column <= columns; column += 1) {
    const x = (column / columns) * 100;
    addPart(parts, `${prefix}_v_${column}`, makeGridLinePart(`${prefix}_v_${column}`, {
      x: mapGeneratorX(bounds, x),
      y: mapGeneratorY(bounds, 50),
      width: mapGeneratorWidth(bounds, 0.35),
      height: mapGeneratorHeight(bounds, 100),
      zIndex,
      colour,
    }), generatorName);
  }
  for (let row = 0; row <= rows; row += 1) {
    const y = (row / rows) * 100;
    addPart(parts, `${prefix}_h_${row}`, makeGridLinePart(`${prefix}_h_${row}`, {
      x: mapGeneratorX(bounds, 50),
      y: mapGeneratorY(bounds, y),
      width: mapGeneratorWidth(bounds, 100),
      height: mapGeneratorHeight(bounds, 0.35),
      zIndex,
      colour,
    }), generatorName);
  }

  if (generator?.generatedHitZones === true && hitZones) {
    const cellCount = Math.max(1, rows * columns);
    for (let row = 0; row < rows; row += 1) {
      for (let column = 0; column < columns; column += 1) {
        const zoneName = `${prefix}_cell_${row + 1}_${column + 1}`;
        const cellIndex = (row * columns) + column;
        const columnNormalized = columns > 1 ? column / (columns - 1) : 0.5;
        const rowNormalized = rows > 1 ? row / (rows - 1) : 0.5;
        const cellNormalized = cellCount > 1 ? cellIndex / (cellCount - 1) : 0;
        addHitZone(hitZones, zoneName, {
          shape: 'rectangle',
          targetBehavior,
          targetValueChannel,
          targetValueChannelY,
          action: generator?.hitZoneAction ?? 'setValue',
          payload: {
            type: 'gridCell',
            row,
            column,
            rowIndex: row,
            columnIndex: column,
            rowNumber: row + 1,
            columnNumber: column + 1,
            cellIndex,
            cellNumber: cellIndex + 1,
            rows,
            columns,
            normalized: cellNormalized,
            cellNormalized,
            xNormalized: columnNormalized,
            yNormalized: rowNormalized,
            columnNormalized,
            rowNormalized,
            rowNormalizedInverted: 1 - rowNormalized,
          },
          bounds: mapGeneratorHitZoneBounds(bounds, {
            x: (column / columns) * 100,
            y: (row / rows) * 100,
            width: 100 / columns,
            height: 100 / rows,
            unit: 'percent',
          }),
        }, generatorName);
      }
    }
  }
}

function isBlackPianoKey(noteNumber) {
  return [1, 3, 6, 8, 10].includes(((noteNumber % 12) + 12) % 12);
}

function materializePianoKeys(parts, generator, prefix, generatorName = '', hitZones = null) {
  // Every other generator in this file opens with this line and maps its output through the rect.
  // This one did not, and hardcoded the full height for both the drawn keys and — because
  // generatedHitZones is on — their hit zones. A starter that puts anything else underneath the
  // keyboard therefore had it buried: the Scrollable Piano Bar declares a scroll zone at y 86-98%
  // and draws a thumb at 91%, and the app reported a piano key at every point inside that strip,
  // so the scroll it advertises could never be dragged.
  const bounds = generatorBounds(generator);
  const count = Math.max(1, Math.round(numberOr(generator?.count, 12)));
  const zIndex = numberOr(generator?.zIndex, 5);
  const targetBehavior = generator?.targetBehavior ?? '';
  const targetValueChannel = generator?.targetValueChannel ?? 'mainValue';
  const baseNote = Math.round(numberOr(generator?.baseNote, 60));
  const notes = Array.from({ length: count }, (_, index) => {
    const noteNumber = baseNote + index;
    return {
      index,
      noteNumber,
      black: isBlackPianoKey(noteNumber),
      noteName: `${NOTE_NAMES[((noteNumber % 12) + 12) % 12]}${Math.floor(noteNumber / 12) - 1}`,
    };
  });
  const whiteCount = Math.max(1, notes.filter((entry) => !entry.black).length);
  const whiteKeyWidth = 100 / whiteCount;
  let whiteIndex = 0;

  for (const entry of notes) {
    const { index, noteNumber, noteName, black } = entry;
    const name = `${prefix}_key_${index + 1}`;
    const blackWidth = whiteKeyWidth * 0.62;
    const x = black
      ? clamp(whiteIndex * whiteKeyWidth, blackWidth / 2, 100 - (blackWidth / 2))
      : (whiteIndex * whiteKeyWidth) + (whiteKeyWidth / 2);
    const width = black ? blackWidth : whiteKeyWidth;
    if (!black) whiteIndex += 1;

    addPart(parts, name, createPartNode(name, {
      role: black ? 'generatedBlackKey' : 'generatedWhiteKey',
      kind: 'rectangle',
      zIndex: zIndex + (black ? 1 : 0),
      layout: {
        x: mapGeneratorX(bounds, x),
        y: mapGeneratorY(bounds, black ? 28 : 50),
        width: mapGeneratorWidth(bounds, width),
        height: mapGeneratorHeight(bounds, black ? 56 : 100),
        xUnit: 'percent',
        yUnit: 'percent',
        widthUnit: 'percent',
        heightUnit: 'percent',
      },
      sections: {
        Background: createBackground(black ? 'FF151515' : 'FFEDEDE8', {
          borderEnabled: true,
          borderColour: black ? 'FF050505' : '55303030',
          radius: 3,
        }),
      },
    }), generatorName);

    if (generator?.generatedHitZones === true && hitZones) {
      addHitZone(hitZones, `${prefix}_keyZone_${index + 1}`, {
        shape: 'rectangle',
        targetBehavior,
        targetValueChannel,
        action: generator?.hitZoneAction ?? 'setValue',
        payload: {
          type: 'pianoKey',
          keyIndex: index,
          keyNumber: index + 1,
          noteNumber,
          noteName,
          isBlackKey: black,
          normalized: count > 1 ? index / (count - 1) : 0,
        },
        bounds: mapGeneratorHitZoneBounds(bounds, {
          x: clamp(x - (width / 2), 0, 100),
          y: 0,
          width,
          height: black ? 58 : 100,
          unit: 'percent',
        }),
      }, generatorName);
    }
  }
}

function materializeFilmstrips(parts, control, signals, generator, prefix, generatorName = '') {
  const filmstrips = getFilmstrips(control);
  const names = Object.keys(filmstrips);
  const targetName = generator?.assetName && filmstrips?.[generator.assetName]
    ? generator.assetName
    : names[0];
  const filmstrip = filmstrips?.[targetName] ?? null;
  if (!filmstrip) return;

  const frameCount = Math.max(1, Math.round(numberOr(filmstrip.frameCount, 1)));
  const normalized = normalizedSignalForValueSource(signals, filmstrip.valueSource ?? 'mainValue');
  const frameIndex = clamp(Math.round(normalized * (frameCount - 1)), 0, frameCount - 1);
  const name = `${prefix}_${targetName}`;
  addPart(parts, name, createPartNode(name, {
    role: 'generatedFilmstrip',
    kind: 'image',
    zIndex: numberOr(generator?.zIndex, 7),
    layout: {
      mode: 'fill',
      xUnit: 'percent',
      yUnit: 'percent',
      widthUnit: 'percent',
      heightUnit: 'percent',
    },
    sections: {
      Image: {
        _type: 'Image',
        source: filmstrip.source ?? '',
        mode: 'filmstrip',
        frameIndex,
        frameCount,
        frameWidth: numberOr(filmstrip.frameWidth, 0),
        frameHeight: numberOr(filmstrip.frameHeight, 0),
        orientation: filmstrip.orientation ?? 'vertical',
        interpolation: filmstrip.interpolation ?? 'nearest',
        fit: 'cover',
      },
    },
    meta: {
      assetName: targetName,
      valueSource: filmstrip.valueSource ?? 'mainValue',
    },
  }), generatorName);
}

export function materializeCustomComponent(control, signals = {}) {
  if (String(control?._children?.Core?.controlType ?? '') !== 'CustomComponent') return control;
  const resolved = control;
  const partsSection = resolved?._children?.Parts;
  if (!partsSection?._children) return resolved;
  const parts = getParts(resolved);
  const hitZones = getHitZones(resolved);

  for (const [generatorName, generator] of generatorEntries(resolved)) {
    const prefix = String(generator?.generatedPartPrefix ?? generatorName ?? 'generated').trim() || 'generated';
    const type = String(generator?.type ?? 'ticks').trim().toLowerCase();
    if (type === 'ticks' || type === 'radial-markers') {
      materializeTicks(parts, generator, prefix, generatorName);
    } else if (type === 'repeated-leds') {
      materializeLeds(parts, generator, prefix, generatorName, hitZones, signals);
    } else if (type === 'step-bars' || type === 'steps') {
      materializeStepBars(parts, resolved, signals, generator, prefix, generatorName, hitZones);
    } else if (type === 'labels') {
      materializeLabels(parts, generator, prefix, generatorName);
    } else if (type === 'repeated-buttons' || type === 'buttons') {
      materializeButtons(parts, resolved, signals, generator, prefix, generatorName, hitZones);
    } else if (type === 'scrollable-content' || type === 'scroll-list') {
      materializeScrollList(parts, resolved, signals, generator, prefix, generatorName, hitZones);
    } else if (type === 'grid' || type === 'meter-bars' || type === 'segmented-ring') {
      materializeGrid(parts, generator, prefix, generatorName, hitZones);
    } else if (type === 'piano-keys' || type === 'piano') {
      materializePianoKeys(parts, generator, prefix, generatorName, hitZones);
    } else if (type === 'filmstrip-frames' || type === 'filmstrip') {
      materializeFilmstrips(parts, resolved, signals, generator, prefix, generatorName);
    }
  }

  materializeArpeggiator(parts, hitZones, resolved, signals);

  return resolved;
}

export function materializedCustomComponentSnapshot(control, signals = {}) {
  return materializeCustomComponent(deepClone(control), signals);
}

export function extractDetachedGeneratedParts(control, generatorName = '', signals = {}) {
  const materialized = materializedCustomComponentSnapshot(control, signals);
  const parts = materialized?._children?.Parts?._children ?? {};
  return Object.fromEntries(
    Object.entries(parts)
      .filter(([, part]) => part?.generated === true && (!generatorName || part?.meta?.generatedBy === generatorName))
      .map(([name, part]) => {
        const nextPart = deepClone(part);
        nextPart.generated = false;
        nextPart.detachedFromGenerator = generatorName || nextPart?.meta?.generatedBy || '';
        nextPart.meta = {
          ...(nextPart.meta ?? {}),
          generated: false,
          detachedFromGenerator: nextPart.detachedFromGenerator,
        };
        return [name, nextPart];
      })
  );
}

export function extractDetachedGeneratedHitZones(control, generatorName = '', signals = {}) {
  const materialized = materializedCustomComponentSnapshot(control, signals);
  const hitZones = materialized?._children?.HitZones?._children ?? {};
  return Object.fromEntries(
    Object.entries(hitZones)
      .filter(([, zone]) => zone?.generated === true && (!generatorName || zone?.meta?.generatedBy === generatorName))
      .map(([name, zone]) => {
        const nextZone = deepClone(zone);
        nextZone.generated = false;
        nextZone.detachedFromGenerator = generatorName || nextZone?.meta?.generatedBy || '';
        nextZone.meta = {
          ...(nextZone.meta ?? {}),
          generated: false,
          detachedFromGenerator: nextZone.detachedFromGenerator,
        };
        return [name, nextZone];
      })
  );
}
