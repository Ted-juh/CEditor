import ArrowLeft from 'lucide-svelte/icons/arrow-left';
import ArrowRight from 'lucide-svelte/icons/arrow-right';
import Blend from 'lucide-svelte/icons/blend';
import FlipHorizontal from 'lucide-svelte/icons/flip-horizontal';
import ImageIcon from 'lucide-svelte/icons/image';
import Layers from 'lucide-svelte/icons/layers';
import PaintBucket from 'lucide-svelte/icons/paint-bucket';

export const DEFAULT_TEXT_FILL_GRADIENT = {
  type: 'linear',
  angle: 90,
  centerX: 50,
  centerY: 50,
  radiusX: 50,
  radiusY: 50,
  edge: 0,
  stops: [
    { color: 'FFFFFFFF'.slice(2), position: 0 },
    { color: 'FF3A3A3A'.slice(2), position: 100 },
  ],
};

// The pure-data vocabularies live next door so the scripting layer can read them without pulling
// the icon components in this file along with them. Re-exported so every existing importer of
// textEditorOptions keeps working unchanged.
export {
  TEXT_CASE_OPTIONS,
  TEXT_POSITION_OPTIONS,
  TEXT_SCRIPT_OPTIONS,
  TYPOGRAPHY_FEATURE_OPTIONS,
} from './textEditorVocabulary.js';

export const FLOW_MODE_OPTIONS = [
  { value: 'rotate', label: 'Rotate' },
  { value: 'line', label: 'Line' },
  { value: 'stair', label: 'Stair' },
  { value: 'arc', label: 'Arc' },
  { value: 'circle', label: 'Circle' },
  { value: 'vertical', label: 'Vertical' },
  { value: 'wave', label: 'Wave' },
  { value: 'zigzag', label: 'Zigzag' },
  { value: 'spiral', label: 'Spiral' },
  { value: 'perimeter', label: 'Perimeter' },
  { value: 'polyline', label: 'Polyline' },
  { value: 'bezier', label: 'Bezier' },
  { value: 'freehand', label: 'Freehand' },
];

export const TEXT_READING_OPTIONS = [
  { value: 'ltr', label: 'L->R', icon: ArrowRight, span: 1 },
  { value: 'rtl', label: 'R<-L', icon: ArrowLeft, span: 1 },
  { value: 'mirrored', label: 'Mirrored', icon: FlipHorizontal, span: 2 },
];

export const TEXT_FILL_LAYER_ORDER = ['solid', 'gradient', 'image', 'texture'];
export const TEXT_FILL_LAYER_LABELS = { solid: 'Solid', gradient: 'Gradient', image: 'Image', texture: 'Texture' };
export const TEXT_FILL_LAYER_ICONS = { solid: PaintBucket, gradient: Blend, image: ImageIcon, texture: Layers };

