import { writable, get } from 'svelte/store';
import {
  isJuceAvailable,
  setProperty,
  requestFullState,
  onFullState,
  onPropUpdate,
} from './bridge.js';

/**
 * Legacy debug-only ValueTree mirror.
 * The production editor uses the panel/control stores; this module exists for
 * BridgeTest and similar diagnostics only.
 */
export const controlTree = writable({});
export const bridgeConnected = writable(false);

function setNestedValue(obj, path, value) {
  const parts = path.split('.');
  let current = obj;

  for (let i = 0; i < parts.length - 1; i += 1) {
    if (current._children && current._children[parts[i]]) {
      current = current._children[parts[i]];
    } else {
      return;
    }
  }

  current[parts[parts.length - 1]] = value;
}

export function getNestedValue(obj, path) {
  const parts = path.split('.');
  let current = obj;

  for (let i = 0; i < parts.length - 1; i += 1) {
    if (current._children && current._children[parts[i]]) {
      current = current._children[parts[i]];
    } else {
      return undefined;
    }
  }

  return current[parts[parts.length - 1]];
}

export function updateProperty(path, value) {
  controlTree.update((tree) => {
    const copy = structuredClone(tree);
    setNestedValue(copy, path, value);
    return copy;
  });

  setProperty(path, value);
}

if (isJuceAvailable()) {
  bridgeConnected.set(true);

  onFullState((data) => {
    controlTree.set(data);
  });

  onPropUpdate((data) => {
    controlTree.update((tree) => {
      const copy = structuredClone(tree);
      setNestedValue(copy, data.path, data.value);
      return copy;
    });
  });

  requestFullState();
} else {
  console.log('[valueTreeDebug] No JUCE backend detected — using mock data');
  bridgeConnected.set(false);

  controlTree.set({
    _type: 'Control',
    controlType: 'Button',
    name: 'TestButton',
    _children: {
      Identity: {
        _type: 'Identity',
        x: 50, y: 50, width: 120, height: 40,
        visible: true, enabled: true,
      },
      Background: {
        _type: 'Background',
        mode: 'solid',
        _children: {
          Fill: {
            _type: 'Fill',
            mode: 'solid',
            layerOrder: ['solid', 'gradient', 'image', 'overlay'],
            colour: 'FF3A3A3A',
            solidEnabled: true,
            solidBlend: 'normal',
            solidClipMode: 'shape',
            solidMuted: false,
            gradientEnabled: false,
            gradientOpacity: 100,
            gradientName: '',
            gradientBlend: 'normal',
            gradientClipMode: 'shape',
            gradientMuted: false,
            gradient: null,
            imageEnabled: false,
            imageMuted: false,
            imageSrc: '',
            imageOpacity: 100,
            imageFit: 'fill',
            imageAlign: 'center',
            imageOffsetX: 0,
            imageOffsetY: 0,
            imageBlend: 'normal',
            imageBlur: 0,
            imageTint: 'FFFFFF',
            imageFlipH: false,
            imageFlipV: false,
            imageRotation: 0,
            imageGrayscale: false,
            imageSaturation: 100,
            imageBrightness: 100,
            imageContrast: 100,
            imageTileScale: 1.0,
            imageClipMode: 'shape',
            overlayEnabled: false,
            overlayMuted: false,
            overlaySrc: '',
            overlayOpacity: 100,
            overlayFit: 'tile',
            overlayAlign: 'center',
            overlayOffsetX: 0,
            overlayOffsetY: 0,
            overlayBlend: 'normal',
            overlayBlur: 0,
            overlayTint: 'FFFFFF',
            overlayFlipH: false,
            overlayFlipV: false,
            overlayRotation: 0,
            overlayGrayscale: false,
            overlaySaturation: 100,
            overlayBrightness: 100,
            overlayContrast: 100,
            overlayTileScale: 1.0,
            overlayClipMode: 'shape',
            soloLayer: '',
          },
        },
      },
      Text: {
        _type: 'Text',
        content: 'Click Me',
        _children: {
          Fill: { _type: 'Fill', mode: 'solid', colour: 'FFFFFFFF' },
          Font: {
            _type: 'Font',
            family: 'Arial',
            weight: 'Regular',
            weightValue: 400,
            style: 'Normal',
            size: 14,
            underline: false,
            strikethrough: false,
            overline: false,
            letterSpacing: 0,
            underlineOffset: 0,
            underlineThickness: 1,
            underlineColour: '',
            underlineInsetLeft: 0,
            underlineInsetRight: 0,
            underlineGap: 0,
            underlineLayer: 'back',
            strikethroughOffset: 0,
            strikethroughThickness: 1,
            strikethroughColour: '',
            strikethroughInsetLeft: 0,
            strikethroughInsetRight: 0,
            strikethroughGap: 0,
            strikethroughLayer: 'back',
            overlineOffset: 0,
            overlineThickness: 1,
            overlineColour: '',
            overlineInsetLeft: 0,
            overlineInsetRight: 0,
            overlineGap: 0,
            overlineLayer: 'back',
          },
          Position: {
            _type: 'Position',
            justification: 'centred',
            paddingLeft: 4, paddingRight: 4, paddingTop: 0, paddingBottom: 0,
            offsetX: 0, offsetY: 0,
          },
        },
      },
      Border: {
        _type: 'Border',
        enabled: true, style: 'solid',
        _children: {
          Fill: { _type: 'Fill', colour: 'FF888888' },
          Corners: { _type: 'Corners', radius: 6 },
        },
      },
    },
  });
}
