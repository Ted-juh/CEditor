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

export const TEXT_POSITION_OPTIONS = [
  { value: 'topLeft', label: 'Top Left' },
  { value: 'top', label: 'Top' },
  { value: 'topRight', label: 'Top Right' },
  { value: 'left', label: 'Left' },
  { value: 'centred', label: 'Center' },
  { value: 'right', label: 'Right' },
  { value: 'bottomLeft', label: 'Bottom Left' },
  { value: 'bottom', label: 'Bottom' },
  { value: 'bottomRight', label: 'Bottom Right' },
];

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

export const TYPOGRAPHY_FEATURE_OPTIONS = [
  { key: 'ligatures', label: 'Ligatures', tags: ['liga', 'clig'] },
  { key: 'stylisticAlternates', label: 'Alternates', tags: ['salt'] },
  { key: 'oldstyleFigures', label: 'Oldstyle', tags: ['onum'] },
  { key: 'tabularFigures', label: 'Tabular', tags: ['tnum'] },
  { key: 'fractions', label: 'Fractions', tags: ['frac'] },
  { key: 'slashedZero', label: 'Slash 0', tags: ['zero'] },
];
