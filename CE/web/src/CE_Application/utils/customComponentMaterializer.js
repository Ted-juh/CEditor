import { createBackground, createPartNode, createText } from './customComponentFactory.js';
import { getCustomArpeggiator, noteNameFromMidi } from './customComponentArpeggiator.js';
import { deepClone } from './deepClone.js';

function numberOr(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

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
      borderThickness: 1,
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
  const gridWidth = Math.max(1, width - labelWidth - 8);
  const gridHeight = Math.max(1, height - rulerHeight - 8);
  const rowHeight = gridHeight / 12;
  const stepWidth = gridWidth / Math.max(1, arpeggiator.stepCount);
  const currentStepRaw = signals?.customChannels?.['channel.arpCurrentStep.raw'];
  const currentStep = Math.max(0, Math.min(arpeggiator.stepCount - 1, Math.round(numberOr(currentStepRaw, -1))));
  const showPlayhead = Number.isFinite(Number(currentStepRaw));

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
        colour: '00000000',
        text: String(step + 1),
        textColour: major ? 'FFD7E7EF' : 'FF77848D',
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

    addHitZone(hitZones, `${blockName}_move`, {
      shape: 'rectangle',
      action: 'arpeggiatorMove',
      priority: 80,
      cursor: 'move',
      bounds: {
        x: percent(gridLeft + (block.step * stepWidth) + 1, width),
        y: percent(gridTop + (row * rowHeight) + 2, height),
        width: percent(Math.max(3, (block.length * stepWidth) - 2), width),
        height: percent(Math.max(4, rowHeight - 4), height),
        unit: 'percent',
      },
      payload: { type: 'arpeggiatorBlock', blockId: block.id },
    }, 'arpeggiator');

    addHitZone(hitZones, `${blockName}_resize`, {
      shape: 'rectangle',
      action: 'arpeggiatorResize',
      priority: 90,
      cursor: 'ew-resize',
      bounds: {
        x: percent(gridLeft + ((block.step + block.length) * stepWidth) - 7, width),
        y: percent(gridTop + (row * rowHeight) + 2, height),
        width: percent(10, width),
        height: percent(Math.max(4, rowHeight - 4), height),
        unit: 'percent',
      },
      payload: { type: 'arpeggiatorBlockResize', blockId: block.id },
    }, 'arpeggiator');
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
        x,
        y: black ? 28 : 50,
        width,
        height: black ? 56 : 100,
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
        bounds: {
          x: clamp(x - (width / 2), 0, 100),
          y: 0,
          width,
          height: black ? 58 : 100,
          unit: 'percent',
        },
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
