/**
 * Icon assignments for the insert catalog (models/insertCatalog.js), shared
 * by every surface that renders the catalog. One icon per meaning: no icon
 * appears twice anywhere in this file (types + categories + fallback), and
 * the eleven custom components (components/icons/) follow lucide's drawing
 * conventions so the set reads as one family.
 */
import ArrowLeftRight from 'lucide-svelte/icons/arrow-left-right';
import BadgeCheck from 'lucide-svelte/icons/badge-check';
import BarChart3 from 'lucide-svelte/icons/bar-chart-3';
import CircleDashed from 'lucide-svelte/icons/circle-dashed';
import CircleDot from 'lucide-svelte/icons/circle-dot';
import Container from 'lucide-svelte/icons/container';
import Disc3 from 'lucide-svelte/icons/disc-3';
import Gauge from 'lucide-svelte/icons/gauge';
import Grid3x3 from 'lucide-svelte/icons/grid-3x3';
import Group from 'lucide-svelte/icons/group';
import Hash from 'lucide-svelte/icons/hash';
import Image from 'lucide-svelte/icons/image';
import Joystick from 'lucide-svelte/icons/joystick';
import Layers from 'lucide-svelte/icons/layers';
import LayoutGrid from 'lucide-svelte/icons/layout-grid';
import LayoutTemplate from 'lucide-svelte/icons/layout-template';
import Link2 from 'lucide-svelte/icons/link-2';
import List from 'lucide-svelte/icons/list';
import ListCollapse from 'lucide-svelte/icons/list-collapse';
import ListMusic from 'lucide-svelte/icons/list-music';
import ListOrdered from 'lucide-svelte/icons/list-ordered';
import Monitor from 'lucide-svelte/icons/monitor';
import MousePointerClick from 'lucide-svelte/icons/mouse-pointer-click';
import Music from 'lucide-svelte/icons/music';
import OctagonAlert from 'lucide-svelte/icons/octagon-alert';
import Orbit from 'lucide-svelte/icons/orbit';
import Palette from 'lucide-svelte/icons/palette';
import Piano from 'lucide-svelte/icons/piano';
import Puzzle from 'lucide-svelte/icons/puzzle';
import RefreshCw from 'lucide-svelte/icons/refresh-cw';
import Repeat from 'lucide-svelte/icons/repeat';
import SlidersVertical from 'lucide-svelte/icons/sliders-vertical';
import Sparkle from 'lucide-svelte/icons/sparkle';
import Spline from 'lucide-svelte/icons/spline';
import SplitSquareHorizontal from 'lucide-svelte/icons/split-square-horizontal';
import Square from 'lucide-svelte/icons/square';
import TextCursorInput from 'lucide-svelte/icons/text-cursor-input';
import TimerReset from 'lucide-svelte/icons/timer-reset';
import ToggleLeft from 'lucide-svelte/icons/toggle-left';
import Type from 'lucide-svelte/icons/type';
import Waves from 'lucide-svelte/icons/waves';
import Waypoints from 'lucide-svelte/icons/waypoints';

import BackdropIcon from '../components/icons/BackdropIcon.svelte';
import ChordPadIcon from '../components/icons/ChordPadIcon.svelte';
import KnobIcon from '../components/icons/KnobIcon.svelte';
import MatrixPatchIcon from '../components/icons/MatrixPatchIcon.svelte';
import MetronomeIcon from '../components/icons/MetronomeIcon.svelte';
import PendulumIcon from '../components/icons/PendulumIcon.svelte';
import PushButtonIcon from '../components/icons/PushButtonIcon.svelte';
import RangeSliderIcon from '../components/icons/RangeSliderIcon.svelte';
import RibbonStripIcon from '../components/icons/RibbonStripIcon.svelte';
import SliderIcon from '../components/icons/SliderIcon.svelte';
import StaircaseIcon from '../components/icons/StaircaseIcon.svelte';

export const CATEGORY_ICONS = {
  layout: LayoutTemplate,
  buttons: MousePointerClick,
  values: SlidersVertical,
  modulation: Waves,
  music: Music,
};

export const TYPE_ICONS = {
  // Layout & Display
  Background: BackdropIcon,
  Label: Type,
  TextInput: TextCursorInput,
  Container: Container,
  Group: Group,
  Image: Image,
  LcdDisplay: Monitor,
  PixelDisplay: Grid3x3,
  Meter: Gauge,
  // Buttons & Choices
  MomentaryButton: PushButtonIcon,
  ToggleButton: ToggleLeft,
  RadioButtonGroup: CircleDot,
  CyclicButton: RefreshCw,
  Combobox: ListCollapse,
  Listbox: List,
  TimedButton: TimerReset,
  OneShotButton: BadgeCheck,
  // Values & Sliders
  Slider: SliderIcon,
  Knob: KnobIcon,
  Range: RangeSliderIcon,
  Number: Hash,
  Crossfader: ArrowLeftRight,
  Numpad: Hash,
  Ribbon: RibbonStripIcon,
  Macro: CircleDashed,
  VectorJoystick: Joystick,
  CustomComponent: Puzzle,
  // Modulation & Routing
  Envelope: Spline,
  Matrix: MatrixPatchIcon,
  Orbit: Orbit,
  Looper: Repeat,
  Router: Waypoints,
  Timbre: Palette,
  Turing: BarChart3,
  Kinetic: PendulumIcon,
  Constellation: Sparkle,
  Constraint: Link2,
  // Music & Performance
  ChordPad: ChordPadIcon,
  Arp: ListMusic,
  NoteRibbon: Piano,
  DrumPads: LayoutGrid,
  Phrase: StaircaseIcon,
  Recorder: Disc3,
  Harmoniser: Layers,
  SplitZone: SplitSquareHorizontal,
  Setlist: ListOrdered,
  Transport: MetronomeIcon,
  Panic: OctagonAlert,
};

export const FALLBACK_TYPE_ICON = Square;
