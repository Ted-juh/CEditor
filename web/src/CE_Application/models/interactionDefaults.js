import { SECTION_DEFAULTS } from './sectionDefaults.js';
import { deepClone } from '../utils/deepClone.js';

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

const BUTTON_PRIORITY = ['hover', 'pressed', 'focused', 'checked', 'mixed', 'disabled'];
const SLIDER_PRIORITY = ['hover', 'pressed', 'focused', 'dragging', 'disabled'];

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
      snapToStep: true,
      emitClick: true,
      emitValueChange: true,
      emitStateChange: true,
    };
  }

  if (type === 'Slider') {
    return {
      _type: 'Behavior',
      family: 'range',
      role: 'slider',
      valueType: 'float',
      defaultValue: 0.5,
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
      keyboardEnabled: true,
      focusable: true,
      activationKeys: ['Enter', 'Space'],
      arrowKeyAdjust: true,
      pageKeyAdjust: true,
      homeEndAdjust: true,
      dragEnabled: true,
      wheelEnabled: true,
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

  if (type === 'Slider') {
    return {
      _type: 'States',
      enabled: true,
      debug: false,
      priority: SLIDER_PRIORITY,
      _children: {
        Hover: createStateNode('Hover', {
          description: 'Lift the thumb while hovering.',
          when: { hover: true },
          parts: {
            thumb: {
              'Layout.scale': 1.06,
            },
          },
        }),
        Pressed: createStateNode('Pressed', {
          description: 'Tighten the thumb while pressing.',
          when: { pressed: true },
          parts: {
            thumb: {
              'Layout.scale': 0.96,
            },
          },
        }),
        Dragging: createStateNode('Dragging', {
          description: 'Brighten the fill while dragging.',
          when: { dragging: true },
          parts: {
            fill: {
              'Background.Fill.colour': 'FF71B8F1',
            },
            thumb: {
              'Background.Fill.colour': 'FFFFFFFF',
              'Layout.scale': 1.08,
            },
          },
        }),
        Focused: createStateNode('Focused', {
          description: 'Accent the thumb while focused.',
          when: { focused: true },
          parts: {
            thumb: {
              'Background.Border.colour': 'FF89C2FF',
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
  if (type === 'Slider') {
    return {
      _type: 'Bindings',
      enabled: true,
      debug: false,
      _children: {
        fillWidth: createBindingNode('fillWidth', {
          source: 'value.normalized',
          mapMode: 'range',
          target: 'Parts.fill.Layout.width',
          outputUnit: 'percent',
          outputMin: 0,
          outputMax: 86,
        }),
        thumbX: createBindingNode('thumbX', {
          source: 'value.normalized',
          mapMode: 'range',
          target: 'Parts.thumb.Layout.x',
          outputUnit: 'percent',
          outputMin: 7,
          outputMax: 93,
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
  if (type === 'Slider') {
    return {
      _type: 'Animations',
      enabled: true,
      debug: false,
      _children: {
        thumbSlide: createAnimationNode('thumbSlide', {
          trigger: {
            type: 'valueChange',
            source: 'value.normalized',
          },
          targets: [
            { path: 'Parts.thumb.Layout.x', properties: ['transform'] },
          ],
          duration: 140,
          easing: 'outCubic',
        }),
        fillSlide: createAnimationNode('fillSlide', {
          trigger: {
            type: 'valueChange',
            source: 'value.normalized',
          },
          targets: [
            { path: 'Parts.fill.Layout.width', properties: ['size'] },
          ],
          duration: 140,
          easing: 'outCubic',
        }),
      },
    };
  }

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
  if (type === 'Slider') {
    return sliderParts();
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
