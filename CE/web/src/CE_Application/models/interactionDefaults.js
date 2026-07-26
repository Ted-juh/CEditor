import { SECTION_DEFAULTS } from './sectionDefaults.js';
import { deepClone } from '../utils/deepClone.js';
import { createSliderSemanticParts } from '../utils/sliderEntityFactory.js';

function createStateNode(name, {
  group = 'interaction',
  description = '',
  when = {},
  component = {},
  parts = {},
} = {}) {
  return {
    _type: 'State',
    name,
    group,
    description,
    enabled: true,
    when,
    patches: {
      component,
      parts,
    },
  };
}

function createAnimationNode(name, {
  kind = 'transition',
  trigger = { type: 'stateChange', from: ['*'], to: [] },
  targets = [],
  duration = 120,
  delay = 0,
  easing = 'outQuad',
} = {}) {
  return {
    _type: 'Animation',
    name,
    enabled: true,
    kind,
    trigger,
    targets,
    duration,
    delay,
    easing,
  };
}

function createBindingNode(name, {
  source = 'value.normalized',
  mapMode = 'range',
  target = '',
  outputUnit = 'percent',
  inputMin = 0,
  inputMax = 1,
  outputMin = 0,
  outputMax = 100,
  falseValue = 0,
  trueValue = 100,
  enumMap = {},
  clamp = true,
  round = false,
  invert = false,
} = {}) {
  return {
    _type: 'Binding',
    name,
    enabled: true,
    source,
    mapMode,
    target,
    outputUnit,
    inputMin,
    inputMax,
    outputMin,
    outputMax,
    falseValue,
    trueValue,
    enumMap,
    clamp,
    round,
    invert,
  };
}

function createPartNode(name, {
  role = 'custom',
  zIndex = 0,
  visible = true,
  acceptsStatePatches = true,
  clipChildren = false,
  layout = {},
  sections = {},
} = {}) {
  return {
    _type: 'Part',
    name,
    role,
    visible,
    opacity: 1,
    zIndex,
    clipChildren,
    acceptsStatePatches,
    _children: {
      Layout: {
        _type: 'PartLayout',
        mode: 'absolute',
        x: 50,
        y: 50,
        width: 100,
        height: 100,
        xUnit: 'percent',
        yUnit: 'percent',
        widthUnit: 'percent',
        heightUnit: 'percent',
        anchorX: 'center',
        anchorY: 'center',
        align: 'center',
        paddingLeft: 0,
        paddingRight: 0,
        paddingTop: 0,
        paddingBottom: 0,
        offsetX: 0,
        offsetY: 0,
        rotation: 0,
        scale: 1,
        ...layout,
      },
      ...sections,
    },
  };
}

function rootBackgroundClone() {
  return deepClone(SECTION_DEFAULTS.Background);
}

function rootTextClone(content = '') {
  const text = deepClone(SECTION_DEFAULTS.Text);
  text.content = content;
  return text;
}

function rootIconClone() {
  return deepClone(SECTION_DEFAULTS.Icon);
}

function sliderParts() {
  const trackBackground = rootBackgroundClone();
  trackBackground._children.Fill.colour = 'FF2E2E2E';
  trackBackground._children.Border.enabled = false;

  const fillBackground = rootBackgroundClone();
  fillBackground._children.Fill.colour = 'FF5B9BD5';
  fillBackground._children.Border.enabled = false;

  const thumbBackground = rootBackgroundClone();
  thumbBackground._children.Fill.colour = 'FFF7F7F7';
  thumbBackground._children.Border.enabled = true;
  thumbBackground._children.Border.colour = '66000000';
  thumbBackground._children.Border.thickness = 1;
  thumbBackground._children.Corners.radius = 999;

  return {
    _type: 'Parts',
    _children: {
      track: createPartNode('track', {
        role: 'track',
        zIndex: 0,
        layout: {
          x: 50,
          y: 50,
          width: 86,
          height: 18,
          xUnit: 'percent',
          yUnit: 'percent',
          widthUnit: 'percent',
          heightUnit: 'percent',
          anchorX: 'center',
          anchorY: 'center',
        },
        sections: {
          Background: trackBackground,
        },
      }),
      fill: createPartNode('fill', {
        role: 'fill',
        zIndex: 1,
        layout: {
          x: 7,
          y: 50,
          width: 43,
          height: 18,
          xUnit: 'percent',
          yUnit: 'percent',
          widthUnit: 'percent',
          heightUnit: 'percent',
          anchorX: 'left',
          anchorY: 'center',
        },
        sections: {
          Background: fillBackground,
        },
      }),
      thumb: createPartNode('thumb', {
        role: 'thumb',
        zIndex: 2,
        layout: {
          x: 7,
          y: 50,
          width: 12,
          height: 42,
          xUnit: 'percent',
          yUnit: 'percent',
          widthUnit: 'percent',
          heightUnit: 'percent',
          anchorX: 'center',
          anchorY: 'center',
        },
        sections: {
          Background: thumbBackground,
        },
      }),
    },
  };
}

function rangeParts() {
  const buttonBackground = rootBackgroundClone();
  buttonBackground._children.Fill.colour = 'FF343434';
  buttonBackground._children.Border.enabled = true;
  buttonBackground._children.Border.thickness = 1;
  buttonBackground._children.Border.colour = '664C4C4C';
  buttonBackground._children.Corners.radius = 8;

  const fieldBackground = rootBackgroundClone();
  fieldBackground._children.Fill.colour = 'FF151515';
  fieldBackground._children.Border.enabled = true;
  fieldBackground._children.Border.thickness = 1;
  fieldBackground._children.Border.colour = '665B5B5B';
  fieldBackground._children.Corners.radius = 8;

  const buttonText = (content) => {
    const text = rootTextClone(content);
    text._children.Font.size = 15;
    text._children.Font.weightValue = 700;
    text._children.Font.weight = 'Bold';
    text._children.Position.justification = 'centred';
    return text;
  };

  const valueText = rootTextClone('0');
  valueText._children.Font.size = 12;
  valueText._children.Font.weightValue = 600;
  valueText._children.Font.weight = 'SemiBold';
  valueText._children.Position.justification = 'centred';

  return {
    _type: 'Parts',
    _children: {
      decrement: createPartNode('decrement', {
        role: 'decrement',
        zIndex: 0,
        layout: {
          x: 0,
          y: 50,
          width: 24,
          height: 100,
          xUnit: 'percent',
          yUnit: 'percent',
          widthUnit: 'percent',
          heightUnit: 'percent',
          anchorX: 'left',
          anchorY: 'center',
        },
        sections: {
          Background: deepClone(buttonBackground),
          Text: buttonText('-'),
        },
      }),
      valueField: createPartNode('valueField', {
        role: 'valueField',
        zIndex: 1,
        layout: {
          x: 50,
          y: 50,
          width: 48,
          height: 100,
          xUnit: 'percent',
          yUnit: 'percent',
          widthUnit: 'percent',
          heightUnit: 'percent',
          anchorX: 'center',
          anchorY: 'center',
        },
        sections: {
          Background: fieldBackground,
          Text: valueText,
        },
      }),
      increment: createPartNode('increment', {
        role: 'increment',
        zIndex: 2,
        layout: {
          x: 100,
          y: 50,
          width: 24,
          height: 100,
          xUnit: 'percent',
          yUnit: 'percent',
          widthUnit: 'percent',
          heightUnit: 'percent',
          anchorX: 'right',
          anchorY: 'center',
        },
        sections: {
          Background: deepClone(buttonBackground),
          Text: buttonText('+'),
        },
      }),
    },
  };
}

// Two-value min/max spinner: [ low ] [ − + ] [ high ].
// The two numbers live in the outer fields; the steppers sit in the middle and
// act on whichever field is "active" (default: low, shown with a brighter
// border). Distinct from Number, which is a single-value stepper.
function rangeSpinnerParts(lowContent = '40', highContent = '90') {
  const buttonBackground = rootBackgroundClone();
  buttonBackground._children.Fill.colour = 'FF343434';
  buttonBackground._children.Border.enabled = true;
  buttonBackground._children.Border.thickness = 1;
  buttonBackground._children.Border.colour = '664C4C4C';
  buttonBackground._children.Corners.radius = 8;

  const fieldBackground = (active = false) => {
    const bg = rootBackgroundClone();
    bg._children.Fill.colour = 'FF151515';
    bg._children.Border.enabled = true;
    bg._children.Border.thickness = 1;
    // Active field gets the accent border so it's clear which value the
    // steppers (and typing) will change.
    bg._children.Border.colour = active ? 'FF89C2FF' : '665B5B5B';
    bg._children.Corners.radius = 8;
    return bg;
  };

  const buttonText = (content) => {
    const text = rootTextClone(content);
    text._children.Font.size = 15;
    text._children.Font.weightValue = 700;
    text._children.Font.weight = 'Bold';
    text._children.Position.justification = 'centred';
    return text;
  };

  const valueText = (content) => {
    const text = rootTextClone(content);
    text._children.Font.size = 13;
    text._children.Font.weightValue = 600;
    text._children.Font.weight = 'SemiBold';
    text._children.Position.justification = 'centred';
    return text;
  };

  return {
    _type: 'Parts',
    _children: {
      lowField: createPartNode('lowField', {
        role: 'lowField',
        zIndex: 0,
        layout: {
          x: 0,
          y: 50,
          width: 30,
          height: 100,
          xUnit: 'percent',
          yUnit: 'percent',
          widthUnit: 'percent',
          heightUnit: 'percent',
          anchorX: 'left',
          anchorY: 'center',
        },
        sections: {
          Background: fieldBackground(true),
          Text: valueText(lowContent),
        },
      }),
      decrement: createPartNode('decrement', {
        role: 'decrement',
        zIndex: 1,
        layout: {
          x: 38,
          y: 50,
          width: 15,
          height: 100,
          xUnit: 'percent',
          yUnit: 'percent',
          widthUnit: 'percent',
          heightUnit: 'percent',
          anchorX: 'center',
          anchorY: 'center',
        },
        sections: {
          Background: deepClone(buttonBackground),
          Text: buttonText('−'),
        },
      }),
      increment: createPartNode('increment', {
        role: 'increment',
        zIndex: 2,
        layout: {
          x: 62,
          y: 50,
          width: 15,
          height: 100,
          xUnit: 'percent',
          yUnit: 'percent',
          widthUnit: 'percent',
          heightUnit: 'percent',
          anchorX: 'center',
          anchorY: 'center',
        },
        sections: {
          Background: deepClone(buttonBackground),
          Text: buttonText('+'),
        },
      }),
      highField: createPartNode('highField', {
        role: 'highField',
        zIndex: 3,
        layout: {
          x: 100,
          y: 50,
          width: 30,
          height: 100,
          xUnit: 'percent',
          yUnit: 'percent',
          widthUnit: 'percent',
          heightUnit: 'percent',
          anchorX: 'right',
          anchorY: 'center',
        },
        sections: {
          Background: fieldBackground(false),
          Text: valueText(highContent),
        },
      }),
    },
  };
}

const BUTTON_PRIORITY = ['hover', 'focused', 'checked', 'mixed', 'pressed', 'disabled'];
const SLIDER_PRIORITY = ['disabled', 'dragging', 'pressed', 'activehandlestart', 'activehandlecurrent', 'activehandleend', 'hover', 'focused'];
const RANGE_PRIORITY = ['hover', 'focused', 'dragging', 'pressed', 'disabled'];

export function createBehaviorDefaults(type) {
  if (type === 'ToggleButton') {
    return {
      _type: 'Behavior',
      family: 'select',
      role: 'toggle',
      valueType: 'bool',
      defaultValue: false,
      selectionMode: 'single',
      enumValues: [],
      wrapEnum: false,
      groupId: '',
      allowMixed: false,
      uncheckOnClick: true,
      pressMode: 'pressRelease',
      toggleOn: 'release',
      orientation: 'horizontal',
      direction: 'ltr',
      min: 0,
      max: 1,
      step: 1,
      keyboardEnabled: true,
      focusable: true,
      activationKeys: ['Enter', 'Space'],
      arrowKeyAdjust: false,
      pageKeyAdjust: false,
      homeEndAdjust: false,
      dragEnabled: false,
      wheelEnabled: false,
      reverseMouseDirection: false,
      snapToStep: true,
      emitClick: true,
      emitValueChange: true,
      emitStateChange: true,
    };
  }

  if (type === 'Slider' || type === 'Knob') {
    const behavior = {
      _type: 'Behavior',
      family: 'range',
      role: 'slider',
      valueType: 'float',
      geometry: 'linear',
      valueMode: 'single',
      defaultValue: 0.5,
      defaultCurrentValue: 0.5,
      defaultStartValue: 0.25,
      defaultEndValue: 0.75,
      centerValue: 0.5,
      selectionMode: 'none',
      enumValues: [],
      wrapEnum: false,
      groupId: '',
      allowMixed: false,
      uncheckOnClick: false,
      pressMode: 'pressRelease',
      toggleOn: 'release',
      orientation: 'horizontal',
      direction: 'ltr',
      min: 0,
      max: 1,
      step: 0.01,
      startAngle: 135,
      sweepAngle: 270,
      allowWrapAround: false,
      allowHandleCross: false,
      activeHandlePolicy: 'currentFirst',
      trackClickMode: 'moveNearestHandle',
      keyboardEnabled: true,
      focusable: true,
      activationKeys: ['Enter', 'Space'],
      arrowKeyAdjust: true,
      pageKeyAdjust: true,
      homeEndAdjust: true,
      dragEnabled: true,
      wheelEnabled: true,
      reverseMouseDirection: false,
      snapToStep: true,
      snapToTicks: false,
      emitValueCommit: true,
      emitActiveHandleChange: true,
      showTicks: true,
      majorTickCount: 11,
      minorTickCount: 3,
      majorTickLength: 12,
      minorTickLength: 7,
      tickPlacement: 'outside',
      showMinMaxLabels: true,
      showHandleLabels: false,
      showValueReadout: true,
      showCenterMarker: false,
      precision: 2,
      prefix: '',
      suffix: '',
      unit: '',
      rangeSeparator: ' - ',
      bandSeparator: ' | ',
      showSign: false,
      emitClick: true,
      emitValueChange: true,
      emitStateChange: true,
    };
    if (type === 'Knob') behavior.geometry = 'circular';
    return behavior;
  }

  if (type === 'Number') {
    return {
      _type: 'Behavior',
      family: 'range',
      role: 'spinbox',
      valueMode: 'single',
      valueType: 'int',
      defaultValue: 0,
      selectionMode: 'none',
      enumValues: [],
      wrapEnum: false,
      groupId: '',
      allowMixed: false,
      uncheckOnClick: false,
      pressMode: 'pressRelease',
      toggleOn: 'release',
      orientation: 'horizontal',
      direction: 'ltr',
      min: 0,
      max: 100,
      step: 1,
      keyboardEnabled: true,
      focusable: true,
      activationKeys: ['Enter', 'Space'],
      arrowKeyAdjust: true,
      pageKeyAdjust: true,
      homeEndAdjust: true,
      dragEnabled: true,
      wheelEnabled: true,
      reverseMouseDirection: false,
      snapToStep: true,
      emitClick: true,
      emitValueChange: true,
      emitStateChange: true,
    };
  }

  if (type === 'Range') {
    // Two-value min/max spinner. Shares the range/spinbox engine but carries a
    // low (start) and high (end) value plus which one the steppers act on.
    return {
      _type: 'Behavior',
      family: 'range',
      role: 'spinbox',
      variant: 'spinner',
      valueMode: 'range',
      valueType: 'int',
      defaultValue: 0,
      defaultStartValue: 40,
      defaultEndValue: 90,
      activeHandle: 'start',
      selectionMode: 'none',
      enumValues: [],
      wrapEnum: false,
      groupId: '',
      allowMixed: false,
      uncheckOnClick: false,
      pressMode: 'pressRelease',
      toggleOn: 'release',
      orientation: 'horizontal',
      direction: 'ltr',
      min: 0,
      max: 100,
      step: 1,
      keyboardEnabled: true,
      focusable: true,
      activationKeys: ['Enter', 'Space'],
      arrowKeyAdjust: true,
      pageKeyAdjust: true,
      homeEndAdjust: true,
      dragEnabled: true,
      wheelEnabled: true,
      reverseMouseDirection: false,
      snapToStep: true,
      emitClick: true,
      emitValueChange: true,
      emitStateChange: true,
    };
  }

  return {
    _type: 'Behavior',
    family: 'trigger',
    role: 'button',
    valueType: 'none',
    defaultValue: null,
    selectionMode: 'none',
    enumValues: [],
    wrapEnum: false,
    groupId: '',
    allowMixed: false,
    uncheckOnClick: false,
    pressMode: 'pressRelease',
    toggleOn: 'release',
    orientation: 'horizontal',
    direction: 'ltr',
    min: 0,
    max: 1,
    step: 1,
    keyboardEnabled: true,
    focusable: true,
    activationKeys: ['Enter', 'Space'],
    arrowKeyAdjust: false,
    pageKeyAdjust: false,
    homeEndAdjust: false,
    dragEnabled: false,
    wheelEnabled: false,
    reverseMouseDirection: false,
    snapToStep: true,
    emitClick: true,
    emitValueChange: false,
    emitStateChange: true,
  };
}

export function createStatesDefaults(type) {
  if (type === 'ToggleButton') {
    return {
      _type: 'States',
      enabled: true,
      debug: false,
      priority: BUTTON_PRIORITY,
      _children: {
        Hover: createStateNode('Hover', {
          description: 'Highlight when the pointer is over the control.',
          when: { hover: true },
          component: {
            'Background.Fill.colour': 'FF4A4A4A',
          },
        }),
        Pressed: createStateNode('Pressed', {
          description: 'Darken the control while it is pressed.',
          when: { pressed: true },
          component: {
            'Background.Fill.colour': 'FF2C2C2C',
            'Transform.scale': 0.98,
          },
        }),
        Focused: createStateNode('Focused', {
          description: 'Slight emphasis for keyboard focus.',
          when: { focused: true },
          component: {
            'Background.Border.colour': 'FF89C2FF',
          },
        }),
        Checked: createStateNode('Checked', {
          group: 'logical',
          description: 'Selected visual state.',
          when: { checked: true },
          component: {
            'Background.Fill.colour': 'FF2D6F9C',
            'Text.Fill.colour': 'FFFFFFFF',
          },
        }),
        Disabled: createStateNode('Disabled', {
          group: 'system',
          description: 'Dim the control when disabled.',
          when: { disabled: true },
          component: {
            'Transform.opacity': 0.55,
          },
        }),
      },
    };
  }

  if (type === 'Slider' || type === 'Knob') {
    return {
      _type: 'States',
      enabled: true,
      debug: false,
      priority: SLIDER_PRIORITY,
      _children: {
        Hover: createStateNode('Hover', {
          description: 'Slightly lift the active pointer while hovering.',
          when: { hover: true },
          parts: {
            pointerCurrent: {
              'Layout.scale': 1.06,
            },
          },
        }),
        Pressed: createStateNode('Pressed', {
          description: 'Tighten the active pointer while pressing.',
          when: { pressed: true },
          parts: {
            pointerCurrent: {
              'Layout.scale': 0.96,
            },
          },
        }),
        Dragging: createStateNode('Dragging', {
          description: 'Brighten the active body span while dragging.',
          when: { dragging: true },
          parts: {
            bodyTrackFill: {
              'Background.Fill.colour': 'FF71B8F1',
            },
            bodySelectedRange: {
              'Background.Fill.colour': 'FF9FD0FF',
            },
            pointerCurrent: {
              'Background.Fill.colour': 'FFFFFFFF',
              'Layout.scale': 1.08,
            },
          },
        }),
        Focused: createStateNode('Focused', {
          description: 'Accent the active pointer while focused.',
          when: { focused: true },
          parts: {
            pointerCurrent: {
              'Background.Border.colour': 'FF89C2FF',
            },
            labelValue: {
              'Text.Fill.colour': 'FFDAEEFF',
            },
          },
        }),
        ActiveHandleStart: createStateNode('ActiveHandleStart', {
          group: 'logical',
          description: 'Emphasize the start handle when it is active.',
          when: { activeHandle: 'start' },
          parts: {
            pointerStart: {
              'Layout.scale': 1.08,
            },
          },
        }),
        ActiveHandleCurrent: createStateNode('ActiveHandleCurrent', {
          group: 'logical',
          description: 'Emphasize the current handle when it is active.',
          when: { activeHandle: 'current' },
          parts: {
            pointerCurrent: {
              'Layout.scale': 1.08,
            },
          },
        }),
        ActiveHandleEnd: createStateNode('ActiveHandleEnd', {
          group: 'logical',
          description: 'Emphasize the end handle when it is active.',
          when: { activeHandle: 'end' },
          parts: {
            pointerEnd: {
              'Layout.scale': 1.08,
            },
          },
        }),
        Disabled: createStateNode('Disabled', {
          group: 'system',
          description: 'Dim the slider when disabled.',
          when: { disabled: true },
          component: {
            'Transform.opacity': 0.55,
          },
        }),
      },
    };
  }

  if (type === 'Number') {
    return {
      _type: 'States',
      enabled: true,
      debug: false,
      priority: RANGE_PRIORITY,
      _children: {
        Hover: createStateNode('Hover', {
          description: 'Lift the step buttons and value field while hovering.',
          when: { hover: true },
          parts: {
            decrement: {
              'Background.Fill.colour': 'FF3D3D3D',
            },
            increment: {
              'Background.Fill.colour': 'FF3D3D3D',
            },
            valueField: {
              'Background.Fill.colour': 'FF1B1B1B',
            },
          },
        }),
        Pressed: createStateNode('Pressed', {
          description: 'Tighten the control while pressing.',
          when: { pressed: true },
          component: {
            'Transform.scale': 0.99,
          },
          parts: {
            decrement: {
              'Background.Fill.colour': 'FF282828',
            },
            increment: {
              'Background.Fill.colour': 'FF282828',
            },
          },
        }),
        Dragging: createStateNode('Dragging', {
          description: 'Highlight the value field while scrubbing.',
          when: { dragging: true },
          parts: {
            valueField: {
              'Background.Fill.colour': 'FF203141',
              'Background.Border.colour': 'FF5B9BD5',
            },
          },
        }),
        Focused: createStateNode('Focused', {
          description: 'Accent the editable value field while focused.',
          when: { focused: true },
          parts: {
            valueField: {
              'Background.Border.colour': 'FF89C2FF',
            },
          },
        }),
        Disabled: createStateNode('Disabled', {
          group: 'system',
          description: 'Dim the range control when disabled.',
          when: { disabled: true },
          component: {
            'Transform.opacity': 0.55,
          },
        }),
      },
    };
  }

  if (type === 'Range') {
    return {
      _type: 'States',
      enabled: true,
      debug: false,
      priority: RANGE_PRIORITY,
      _children: {
        Hover: createStateNode('Hover', {
          description: 'Lift the step buttons and value fields while hovering.',
          when: { hover: true },
          parts: {
            decrement: {
              'Background.Fill.colour': 'FF3D3D3D',
            },
            increment: {
              'Background.Fill.colour': 'FF3D3D3D',
            },
            lowField: {
              'Background.Fill.colour': 'FF1B1B1B',
            },
            highField: {
              'Background.Fill.colour': 'FF1B1B1B',
            },
          },
        }),
        Pressed: createStateNode('Pressed', {
          description: 'Tighten the control while pressing.',
          when: { pressed: true },
          component: {
            'Transform.scale': 0.99,
          },
          parts: {
            decrement: {
              'Background.Fill.colour': 'FF282828',
            },
            increment: {
              'Background.Fill.colour': 'FF282828',
            },
          },
        }),
        ActiveLow: createStateNode('ActiveLow', {
          description: 'Accent the low field while it is the active (edited) value.',
          when: { activeHandle: 'start' },
          parts: {
            lowField: {
              'Background.Border.colour': 'FF89C2FF',
            },
            highField: {
              'Background.Border.colour': '665B5B5B',
            },
          },
        }),
        ActiveHigh: createStateNode('ActiveHigh', {
          description: 'Accent the high field while it is the active (edited) value.',
          when: { activeHandle: 'end' },
          parts: {
            highField: {
              'Background.Border.colour': 'FF89C2FF',
            },
            lowField: {
              'Background.Border.colour': '665B5B5B',
            },
          },
        }),
        Disabled: createStateNode('Disabled', {
          group: 'system',
          description: 'Dim the range control when disabled.',
          when: { disabled: true },
          component: {
            'Transform.opacity': 0.55,
          },
        }),
      },
    };
  }

  return {
    _type: 'States',
    enabled: true,
    debug: false,
    priority: BUTTON_PRIORITY,
    _children: {
      Hover: createStateNode('Hover', {
        description: 'Highlight when the pointer is over the control.',
        when: { hover: true },
        component: {
          'Background.Fill.colour': 'FF4A4A4A',
        },
      }),
      Pressed: createStateNode('Pressed', {
        description: 'Darken and slightly compress while pressed.',
        when: { pressed: true },
        component: {
          'Background.Fill.colour': 'FF2C2C2C',
          'Transform.scale': 0.98,
        },
      }),
      Focused: createStateNode('Focused', {
        description: 'Slight emphasis for keyboard focus.',
        when: { focused: true },
        component: {
          'Background.Border.colour': 'FF89C2FF',
        },
      }),
      Disabled: createStateNode('Disabled', {
        group: 'system',
        description: 'Dim the control when disabled.',
        when: { disabled: true },
        component: {
          'Transform.opacity': 0.55,
        },
      }),
    },
  };
}

export function createBindingsDefaults(type) {
  if (type === 'Slider' || type === 'Knob') {
    return {
      _type: 'Bindings',
      enabled: true,
      debug: false,
      _children: {},
    };
  }

  if (type === 'Number') {
    return {
      _type: 'Bindings',
      enabled: true,
      debug: false,
      _children: {
        valueText: createBindingNode('valueText', {
          source: 'value.display',
          mapMode: 'direct',
          target: 'Parts.valueField.Text.content',
          outputUnit: 'unitless',
        }),
      },
    };
  }

  if (type === 'Range') {
    // Two-value spinner: the low field shows the start value, the high field
    // shows the end value. In the editor (design view) the static part content
    // shows the defaults; in preview these keep the fields live.
    return {
      _type: 'Bindings',
      enabled: true,
      debug: false,
      _children: {
        lowText: createBindingNode('lowText', {
          source: 'value.start.display',
          mapMode: 'direct',
          target: 'Parts.lowField.Text.content',
          outputUnit: 'unitless',
        }),
        highText: createBindingNode('highText', {
          source: 'value.end.display',
          mapMode: 'direct',
          target: 'Parts.highField.Text.content',
          outputUnit: 'unitless',
        }),
      },
    };
  }

  return {
    _type: 'Bindings',
    enabled: true,
    debug: false,
    _children: {},
  };
}

export function createAnimationsDefaults(type) {
  if (type === 'Slider' || type === 'Knob') {
    return {
      _type: 'Animations',
      enabled: true,
      debug: false,
      _children: {
        pointerSlide: createAnimationNode('pointerSlide', {
          trigger: {
            type: 'valueChange',
            source: 'value.normalized',
          },
          targets: [
            { path: 'Parts.pointerCurrent.Layout.x', properties: ['transform'] },
            { path: 'Parts.pointerCurrent.Layout.y', properties: ['transform'] },
            { path: 'Parts.pointerStart.Layout.x', properties: ['transform'] },
            { path: 'Parts.pointerStart.Layout.y', properties: ['transform'] },
            { path: 'Parts.pointerEnd.Layout.x', properties: ['transform'] },
            { path: 'Parts.pointerEnd.Layout.y', properties: ['transform'] },
          ],
          duration: 140,
          easing: 'outCubic',
        }),
        rangeSlide: createAnimationNode('rangeSlide', {
          trigger: {
            type: 'valueChange',
            source: 'value.normalized',
          },
          targets: [
            { path: 'Parts.bodyTrackFill.Layout.width', properties: ['size'] },
            { path: 'Parts.bodySelectedRange.Layout.width', properties: ['size'] },
          ],
          duration: 140,
          easing: 'outCubic',
        }),
      },
    };
  }

  if (type === 'Range' || type === 'Number') {
    return {
      _type: 'Animations',
      enabled: true,
      debug: false,
      _children: {
        pressIn: createAnimationNode('pressIn', {
          trigger: {
            type: 'stateChange',
            from: ['*'],
            to: ['pressed'],
          },
          targets: [
            { path: 'Transform.scale', properties: ['transform'] },
          ],
          duration: 90,
          easing: 'outQuad',
        }),
      },
    };
  }

  // (Range and Number share the same press animation above.)

  return {
    _type: 'Animations',
    enabled: true,
    debug: false,
    _children: {
      hoverIn: createAnimationNode('hoverIn', {
        trigger: {
          type: 'stateChange',
          from: ['*'],
          to: ['hover'],
        },
        targets: [
          { path: 'Transform.scale', properties: ['transform'] },
        ],
        duration: 120,
        easing: 'outQuad',
      }),
      pressIn: createAnimationNode('pressIn', {
        trigger: {
          type: 'stateChange',
          from: ['*'],
          to: ['pressed'],
        },
        targets: [
          { path: 'Transform.scale', properties: ['transform'] },
        ],
        duration: 80,
        easing: 'outQuad',
      }),
    },
  };
}

export function createPartsDefaults(type) {
  if (type === 'Number') {
    return rangeParts();
  }

  if (type === 'Range') {
    return rangeSpinnerParts();
  }

  if (type === 'Slider' || type === 'Knob') {
    return createSliderSemanticParts();
  }

  return {
    _type: 'Parts',
    _children: {},
  };
}

export function createDefaultInteractiveSections(type) {
  return {
    Behavior: createBehaviorDefaults(type),
    Parts: createPartsDefaults(type),
    Bindings: createBindingsDefaults(type),
    States: createStatesDefaults(type),
    Animations: createAnimationsDefaults(type),
  };
}
