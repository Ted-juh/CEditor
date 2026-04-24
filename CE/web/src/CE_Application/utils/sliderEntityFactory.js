import { SECTION_DEFAULTS } from '../models/sectionDefaults.js';
import { deepClone } from './deepClone.js';

function createPartNode(name, {
  role = 'custom',
  zIndex = 0,
  opacity = 1,
  visible = true,
  layout = {},
  sections = {},
} = {}) {
  return {
    _type: 'Part',
    name,
    role,
    visible,
    opacity,
    zIndex,
    acceptsStatePatches: true,
    clipChildren: false,
    _children: {
      Layout: {
        _type: 'PartLayout',
        mode: 'absolute',
        x: 50,
        y: 50,
        width: 10,
        height: 10,
        xUnit: 'percent',
        yUnit: 'percent',
        widthUnit: 'px',
        heightUnit: 'px',
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

function backgroundFill(colour, {
  borderEnabled = false,
  borderColour = '00000000',
  borderThickness = 0,
  radius = 999,
} = {}) {
  const background = deepClone(SECTION_DEFAULTS.Background);
  background._children.Fill.colour = colour;
  background._children.Border.enabled = borderEnabled;
  background._children.Border.colour = borderColour;
  background._children.Border.thickness = borderThickness;
  background._children.Corners.radius = radius;
  return background;
}

function textSection({
  content = '',
  colour = 'FFF5F5F5',
  size = 11,
  weight = 600,
  family = 'Arial',
} = {}) {
  const text = deepClone(SECTION_DEFAULTS.Text);
  text.content = content;
  text._children.Fill.colour = colour;
  text._children.Font.family = family;
  text._children.Font.size = size;
  text._children.Font.weightValue = weight;
  text._children.Font.weight = weight >= 700 ? 'Bold' : (weight >= 600 ? 'SemiBold' : 'Regular');
  text._children.Position.justification = 'centred';
  return text;
}

export function createSliderSemanticParts() {
  return {
    _type: 'Parts',
    _children: {
      bodyTrackBase: createPartNode('bodyTrackBase', {
        role: 'bodyTrackBase',
        zIndex: 0,
        layout: { width: 100, height: 10, widthUnit: 'px', heightUnit: 'px' },
        sections: {
          Background: backgroundFill('FF2C2C2C', {
            borderEnabled: true,
            borderColour: '55202020',
            borderThickness: 1,
            radius: 999,
          }),
        },
      }),
      bodyTrackFill: createPartNode('bodyTrackFill', {
        role: 'bodyTrackFill',
        zIndex: 1,
        layout: { width: 100, height: 10, widthUnit: 'px', heightUnit: 'px' },
        sections: {
          Background: backgroundFill('FF5B9BD5', { radius: 999 }),
        },
      }),
      bodySelectedRange: createPartNode('bodySelectedRange', {
        role: 'bodySelectedRange',
        zIndex: 1,
        layout: { width: 100, height: 10, widthUnit: 'px', heightUnit: 'px' },
        sections: {
          Background: backgroundFill('FF7BB3FF', { radius: 999 }),
        },
      }),
      bodyCenterMarker: createPartNode('bodyCenterMarker', {
        role: 'bodyCenterMarker',
        zIndex: 2,
        layout: { width: 2, height: 18, widthUnit: 'px', heightUnit: 'px' },
        opacity: 0.6,
        sections: {
          Background: backgroundFill('99FFFFFF', { radius: 999 }),
        },
      }),
      pointerStart: createPartNode('pointerStart', {
        role: 'pointerStart',
        zIndex: 3,
        layout: { width: 18, height: 18, widthUnit: 'px', heightUnit: 'px' },
        sections: {
          Background: backgroundFill('FFF2B44B', {
            borderEnabled: true,
            borderColour: '99201000',
            borderThickness: 1,
            radius: 999,
          }),
        },
      }),
      pointerCurrent: createPartNode('pointerCurrent', {
        role: 'pointerCurrent',
        zIndex: 4,
        layout: { width: 20, height: 20, widthUnit: 'px', heightUnit: 'px' },
        sections: {
          Background: backgroundFill('FFF6F6F6', {
            borderEnabled: true,
            borderColour: '99333333',
            borderThickness: 1,
            radius: 999,
          }),
        },
      }),
      pointerEnd: createPartNode('pointerEnd', {
        role: 'pointerEnd',
        zIndex: 3,
        layout: { width: 18, height: 18, widthUnit: 'px', heightUnit: 'px' },
        sections: {
          Background: backgroundFill('FF55C79A', {
            borderEnabled: true,
            borderColour: '99202020',
            borderThickness: 1,
            radius: 999,
          }),
        },
      }),
      tickMajor: createPartNode('tickMajor', {
        role: 'tickMajor',
        zIndex: 1,
        layout: { width: 2, height: 12, widthUnit: 'px', heightUnit: 'px' },
        opacity: 0.95,
        sections: {
          Background: backgroundFill('CCFFFFFF', { radius: 999 }),
        },
      }),
      tickMinor: createPartNode('tickMinor', {
        role: 'tickMinor',
        zIndex: 1,
        layout: { width: 1, height: 7, widthUnit: 'px', heightUnit: 'px' },
        opacity: 0.55,
        sections: {
          Background: backgroundFill('99FFFFFF', { radius: 999 }),
        },
      }),
      labelMin: createPartNode('labelMin', {
        role: 'labelMin',
        zIndex: 5,
        sections: { Text: textSection() },
      }),
      labelMax: createPartNode('labelMax', {
        role: 'labelMax',
        zIndex: 5,
        sections: { Text: textSection() },
      }),
      labelStart: createPartNode('labelStart', {
        role: 'labelStart',
        zIndex: 5,
        sections: { Text: textSection({ colour: 'FFF2B44B' }) },
      }),
      labelCurrent: createPartNode('labelCurrent', {
        role: 'labelCurrent',
        zIndex: 5,
        sections: { Text: textSection({ colour: 'FFF6F6F6' }) },
      }),
      labelEnd: createPartNode('labelEnd', {
        role: 'labelEnd',
        zIndex: 5,
        sections: { Text: textSection({ colour: 'FF55C79A' }) },
      }),
      labelValue: createPartNode('labelValue', {
        role: 'labelValue',
        zIndex: 6,
        sections: { Text: textSection({ size: 12, weight: 700 }) },
      }),
      labelTitle: createPartNode('labelTitle', {
        role: 'labelTitle',
        zIndex: 6,
        sections: { Text: textSection({ size: 11, weight: 700, colour: 'FFB8C7D8' }) },
      }),
      labelUnit: createPartNode('labelUnit', {
        role: 'labelUnit',
        zIndex: 6,
        sections: { Text: textSection({ size: 10, weight: 600, colour: 'FFB8C7D8' }) },
      }),
    },
  };
}

export function resolveSliderSemanticParts(existingParts = null) {
  const defaults = createSliderSemanticParts();
  const existing = existingParts?._children ?? {};
  for (const [partName, defaultPart] of Object.entries(defaults._children)) {
    if (!existing[partName]) {
      defaults._children[partName] = defaultPart;
      continue;
    }
    defaults._children[partName] = {
      ...deepClone(defaultPart),
      ...deepClone(existing[partName]),
      _children: {
        ...deepClone(defaultPart?._children ?? {}),
        ...deepClone(existing[partName]?._children ?? {}),
      },
    };
  }
  return defaults;
}
