/**
 * Icon assignments for the insert catalog (models/insertCatalog.js), shared
 * by every surface that renders the catalog — the rail's Insert panel today,
 * anything else tomorrow. Icons are lucide-svelte components.
 */
import ArrowLeftRight from 'lucide-svelte/icons/arrow-left-right';
import AudioWaveform from 'lucide-svelte/icons/audio-waveform';
import BadgeCheck from 'lucide-svelte/icons/badge-check';
import BarChart3 from 'lucide-svelte/icons/bar-chart-3';
import Circle from 'lucide-svelte/icons/circle';
import CircleDashed from 'lucide-svelte/icons/circle-dashed';
import CircleDot from 'lucide-svelte/icons/circle-dot';
import Container from 'lucide-svelte/icons/container';
import Crosshair from 'lucide-svelte/icons/crosshair';
import Disc3 from 'lucide-svelte/icons/disc-3';
import Gauge from 'lucide-svelte/icons/gauge';
import Grid2x2 from 'lucide-svelte/icons/grid-2x2';
import Grid2x2Check from 'lucide-svelte/icons/grid-2x2-check';
import Grid3x3 from 'lucide-svelte/icons/grid-3x3';
import Layers from 'lucide-svelte/icons/layers';
import LayoutGrid from 'lucide-svelte/icons/layout-grid';
import Link2 from 'lucide-svelte/icons/link-2';
import List from 'lucide-svelte/icons/list';
import ListCollapse from 'lucide-svelte/icons/list-collapse';
import ListMusic from 'lucide-svelte/icons/list-music';
import ListOrdered from 'lucide-svelte/icons/list-ordered';
import Monitor from 'lucide-svelte/icons/monitor';
import Music from 'lucide-svelte/icons/music';
import OctagonAlert from 'lucide-svelte/icons/octagon-alert';
import Orbit from 'lucide-svelte/icons/orbit';
import Palette from 'lucide-svelte/icons/palette';
import Piano from 'lucide-svelte/icons/piano';
import RectangleHorizontal from 'lucide-svelte/icons/rectangle-horizontal';
import RefreshCw from 'lucide-svelte/icons/refresh-cw';
import SlidersHorizontal from 'lucide-svelte/icons/sliders-horizontal';
import SlidersVertical from 'lucide-svelte/icons/sliders-vertical';
import Sparkle from 'lucide-svelte/icons/sparkle';
import Spline from 'lucide-svelte/icons/spline';
import SplitSquareHorizontal from 'lucide-svelte/icons/split-square-horizontal';
import Square from 'lucide-svelte/icons/square';
import TextCursorInput from 'lucide-svelte/icons/text-cursor-input';
import Timer from 'lucide-svelte/icons/timer';
import TimerReset from 'lucide-svelte/icons/timer-reset';
import ToggleLeft from 'lucide-svelte/icons/toggle-left';
import Type from 'lucide-svelte/icons/type';
import Waypoints from 'lucide-svelte/icons/waypoints';

export const CATEGORY_ICONS = {
  layout: Monitor,
  buttons: ToggleLeft,
  values: SlidersVertical,
  modulation: Orbit,
  music: Music,
};

export const TYPE_ICONS = {
  Background: Square,
  Label: Type,
  TextInput: TextCursorInput,
  Container: Container,
  Group: Container,
  Image: Square,
  LcdDisplay: Monitor,
  PixelDisplay: Grid3x3,
  Meter: Gauge,
  MomentaryButton: RectangleHorizontal,
  ToggleButton: ToggleLeft,
  RadioButtonGroup: CircleDot,
  CyclicButton: RefreshCw,
  Combobox: ListCollapse,
  Listbox: List,
  TimedButton: TimerReset,
  OneShotButton: BadgeCheck,
  Slider: SlidersVertical,
  Knob: CircleDot,
  Range: SlidersHorizontal,
  Number: RectangleHorizontal,
  Crossfader: ArrowLeftRight,
  Ribbon: SlidersVertical,
  Macro: CircleDashed,
  VectorJoystick: Crosshair,
  CustomComponent: Container,
  Envelope: Spline,
  Matrix: Grid2x2,
  Orbit: Orbit,
  Looper: AudioWaveform,
  Router: Waypoints,
  Timbre: Palette,
  Turing: BarChart3,
  Kinetic: Circle,
  Constellation: Sparkle,
  Constraint: Link2,
  ChordPad: Music,
  Arp: ListMusic,
  NoteRibbon: Piano,
  DrumPads: LayoutGrid,
  Phrase: Grid2x2Check,
  Recorder: Disc3,
  Harmoniser: Layers,
  SplitZone: SplitSquareHorizontal,
  Setlist: ListOrdered,
  Transport: Timer,
  Panic: OctagonAlert,
};

export const FALLBACK_TYPE_ICON = Square;
