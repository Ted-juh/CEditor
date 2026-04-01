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
          Fill: { _type: 'Fill', colour: 'FF3A3A3A' },
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
