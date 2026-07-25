import PanelCardContent from './PanelCardContent.svelte';
import CoreEditor from '../sections/CoreEditor.svelte';
import TransformEditor from '../sections/TransformEditor.svelte';
import BackgroundEditor from '../sections/BackgroundEditor.svelte';
import BorderEditor from '../sections/BorderEditor.svelte';

const PANEL_EDITORS = {
  core: PanelCardContent,
  background: PanelCardContent,
  grid: PanelCardContent,
  export: PanelCardContent,
};

const EAGER_COMPONENT_EDITORS = {
  core: CoreEditor,
  transform: TransformEditor,
  background: BackgroundEditor,
  border: BorderEditor,
};

const LAZY_COMPONENT_LOADERS = {
  text: () => import('../sections/TextEditor.svelte'),
  contentlayout: () => import('../sections/ContentLayoutEditor.svelte'),
  icon: () => import('../sections/IconEditor.svelte'),
  effects: () => import('../sections/EffectsEditor.svelte'),
  behavior: () => import('../sections/BehaviorEditor.svelte'),
  display: () => import('../sections/DisplayEditor.svelte'),
  pixel: () => import('../sections/PixelDisplayEditor.svelte'),
  listbox: () => import('../sections/ListboxEditor.svelte'),
  meter: () => import('../sections/MeterEditor.svelte'),
  envelope: () => import('../sections/EnvelopeEditor.svelte'),
  matrix: () => import('../sections/MatrixEditor.svelte'),
  joystick: () => import('../sections/JoystickEditor.svelte'),
  crossfader: () => import('../sections/CrossfaderEditor.svelte'),
  ribbon: () => import('../sections/RibbonEditor.svelte'),
  macro: () => import('../sections/MacroEditor.svelte'),
  orbit: () => import('../sections/OrbitEditor.svelte'),
  looper: () => import('../sections/LooperEditor.svelte'),
  router: () => import('../sections/RouterEditor.svelte'),
  timbre: () => import('../sections/TimbreEditor.svelte'),
  turing: () => import('../sections/TuringEditor.svelte'),
  kinetic: () => import('../sections/KineticEditor.svelte'),
  constellation: () => import('../sections/ConstellationEditor.svelte'),
  constraint: () => import('../sections/ConstraintEditor.svelte'),
  chordpad: () => import('../sections/ChordPadEditor.svelte'),
  arp: () => import('../sections/ArpEditor.svelte'),
  noteribbon: () => import('../sections/NoteRibbonEditor.svelte'),
  drumpads: () => import('../sections/DrumPadsEditor.svelte'),
  panic: () => import('../sections/PanicEditor.svelte'),
  slider: () => import('../sections/SliderEditor.svelte'),
  label: () => import('../sections/SliderLabelEditor.svelte'),
  states: () => import('../sections/StatesEditor.svelte'),
  value: () => import('../sections/ValueEditor.svelte'),
  segments: () => import('../sections/SegmentsEditor.svelte'),
  bindings: () => import('../sections/BindingsEditor.svelte'),
  devicebindings: () => import('../sections/DeviceBindingsEditor.svelte'),
  animations: () => import('../sections/AnimationsEditor.svelte'),
  designer: () => import('../sections/CustomDesignerEditor.svelte'),
  valuechannels: () => import('../sections/CustomValueChannelsEditor.svelte'),
  behaviors: () => import('../sections/CustomBehaviorsEditor.svelte'),
  hitzones: () => import('../sections/CustomHitZonesEditor.svelte'),
  assets: () => import('../sections/CustomAssetsEditor.svelte'),
  links: () => import('../sections/CustomLinksEditor.svelte'),
  published: () => import('../sections/CustomApiEditor.svelte'),
  variants: () => import('../sections/CustomVariantsEditor.svelte'),
  testbench: () => import('../sections/CustomTestBenchEditor.svelte'),
};

const lazyEditorCache = new Map();
const lazyEditorPromiseCache = new Map();

export function getSectionEditorComponent(contextMode, tabId) {
  if (contextMode === 'panel') {
    return PANEL_EDITORS[tabId] ?? null;
  }

  return EAGER_COMPONENT_EDITORS[tabId]
    ?? lazyEditorCache.get(tabId)
    ?? null;
}

export function hasSectionEditor(contextMode, tabId) {
  if (contextMode === 'panel') {
    return !!PANEL_EDITORS[tabId];
  }

  return !!(EAGER_COMPONENT_EDITORS[tabId] || LAZY_COMPONENT_LOADERS[tabId]);
}

export function ensureSectionEditorComponent(contextMode, tabId) {
  const existing = getSectionEditorComponent(contextMode, tabId);
  if (existing || contextMode === 'panel') {
    return Promise.resolve(existing);
  }

  const loader = LAZY_COMPONENT_LOADERS[tabId];
  if (!loader) {
    return Promise.resolve(null);
  }

  if (!lazyEditorPromiseCache.has(tabId)) {
    lazyEditorPromiseCache.set(
      tabId,
      loader()
        .then((module) => {
          const component = module.default ?? null;
          if (component) lazyEditorCache.set(tabId, component);
          return component;
        })
        .finally(() => {
          lazyEditorPromiseCache.delete(tabId);
        })
    );
  }

  return lazyEditorPromiseCache.get(tabId);
}

export function preloadCommonSectionEditors() {
  return Promise.resolve([
    EAGER_COMPONENT_EDITORS.core,
    EAGER_COMPONENT_EDITORS.transform,
    EAGER_COMPONENT_EDITORS.background,
    EAGER_COMPONENT_EDITORS.border,
  ]);
}
