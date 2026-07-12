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
  slider: () => import('../sections/SliderEditor.svelte'),
  label: () => import('../sections/SliderLabelEditor.svelte'),
  states: () => import('../sections/StatesEditor.svelte'),
  value: () => import('../sections/ValueEditor.svelte'),
  segments: () => import('../sections/SegmentsEditor.svelte'),
  bindings: () => import('../sections/BindingsEditor.svelte'),
  devicebindings: () => import('../sections/DeviceBindingsEditor.svelte'),
  animations: () => import('../sections/AnimationsEditor.svelte'),
  // Interact = Channels + Behaviors + Hit Zones as cluster cards (Stage C);
  // the flat editors live inside it as the Advanced escape hatch.
  interact: () => import('../sections/CustomInteractEditor.svelte'),
  // React = Bindings + Links + States + Animations under one sub-nav for
  // custom components (Stage D1); the standalone editors stay for other
  // controls and are embedded by CustomReactEditor.
  react: () => import('../sections/CustomReactEditor.svelte'),
  assets: () => import('../sections/CustomAssetsEditor.svelte'),
  // Publish = contract + variant definitions + package/library (Stage B1);
  // the instance-facing "Values" half lives in the `properties` tab (Stage A).
  publish: () => import('../sections/CustomPublishEditor.svelte'),
  properties: () => import('../sections/CustomInstancePropertiesEditor.svelte'),
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
