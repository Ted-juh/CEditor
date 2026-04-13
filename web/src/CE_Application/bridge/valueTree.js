import { writable, get } from 'svelte/store';
import {
  isJuceAvailable,
  setProperty,
  requestFullState,
  onFullState,
  onPropUpdate,
} from './bridge.js';

/**
 * Svelte store that mirrors the C++ ValueTree.
 * Automatically syncs bidirectionally via the bridge.
 */
export const controlTree = writable({});

/** Whether the bridge is connected to a JUCE backend */
export const bridgeConnected = writable(false);

/**
 * Set a nested value in an object by dot-notation path.
 * Path navigates _children: "Text.Fill.colour" means obj._children.Text._children.Fill.colour
 */
function setNestedValue(obj, path, value) {
  const parts = path.split('.');
  let current = obj;

  // Navigate through _children for all parts except the last
  for (let i = 0; i < parts.length - 1; i++) {
    if (current._children && current._children[parts[i]]) {
      current = current._children[parts[i]];
    } else {
      return; // Path doesn't exist
    }
  }

  // Set the property
  const propName = parts[parts.length - 1];
  current[propName] = value;
}

/**
 * Get a nested value from the tree by dot-notation path.
 */
export function getNestedValue(obj, path) {
  const parts = path.split('.');
  let current = obj;

  for (let i = 0; i < parts.length - 1; i++) {
    if (current._children && current._children[parts[i]]) {
      current = current._children[parts[i]];
    } else {
      return undefined;
    }
  }

  return current[parts[parts.length - 1]];
}

/**
 * Update a property and push the change to C++.
 */
export function updateProperty(path, value) {
  // Update local store immediately for responsive UI
  controlTree.update(tree => {
    const copy = structuredClone(tree);
    setNestedValue(copy, path, value);
    return copy;
  });

  // Push to C++
  setProperty(path, value);
}

// Initialize bridge listeners
if (isJuceAvailable()) {
  bridgeConnected.set(true);

  onFullState((data) => {
    controlTree.set(data);
  });

  onPropUpdate((data) => {
    controlTree.update(tree => {
      const copy = structuredClone(tree);
      setNestedValue(copy, data.path, data.value);
      return copy;
    });
  });

  // Request initial state from C++
  requestFullState();
} else {
  console.log('[valueTree] No JUCE backend detected — using mock data');
  bridgeConnected.set(false);

  // Mock data for standalone browser development
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
          Font: { _type: 'Font', family: 'Arial', weight: 'Regular', style: 'Normal', size: 14 },
          Position: {
            _type: 'Position',
            justification: 'centred',
            paddingLeft: 4, paddingRight: 4, paddingTop: 2, paddingBottom: 2,
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
