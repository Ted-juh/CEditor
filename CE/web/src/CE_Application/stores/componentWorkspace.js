import { derived, get, writable } from 'svelte/store';
import { createControl } from '../models/componentTypes.js';
import { applyPatchObject } from './controlTreeUtils.js';
import { createCustomComponentStarterPatch } from '../utils/customComponentFactory.js';
import { migrateCustomComponentPlan } from '../utils/customComponentMigrations.js';
import { instantiateCustomComponentPackageControl } from '../utils/customComponentPackage.js';
import { customComponentLibrary } from './customComponentLibrary.js';

import { deepClone } from '../utils/deepClone.js';
export const componentWorkspaceMode = writable('panel');
export const componentDocuments = writable([]);
export const activeComponentDocumentId = writable(null);

export const activeComponentDocument = derived(
  [componentDocuments, activeComponentDocumentId],
  ([$componentDocuments, $activeComponentDocumentId]) =>
    $componentDocuments.find((document) => document.id === $activeComponentDocumentId) ?? null
);

export const activeComponentControl = derived(
  activeComponentDocument,
  ($activeComponentDocument) => $activeComponentDocument?.control ?? null
);

export function openComponentSurfaceWorkspace() {
  componentWorkspaceMode.set('surface');
}

export function closeComponentWorkspace() {
  componentWorkspaceMode.set('panel');
}

function uniqueComponentDocumentId() {
  return `ctrl_component_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

export function createComponentDocument({ starterId = 'starter.blankCanvas', name = 'Untitled Component', control: sourceControl = null } = {}) {
  const control = sourceControl?._children
    ? migrateCustomComponentPlan(deepClone(sourceControl)).component
    : createControl('CustomComponent');

  if (!sourceControl?._children) {
    applyPatchObject(control, createCustomComponentStarterPatch(starterId));
  }

  control._children.Core.id = sourceControl?._children?.Core?.id || control._children.Core.id || uniqueComponentDocumentId();
  control._children.Core.controlType = 'CustomComponent';
  control._children.Core.name = name || control._children.Core.name || 'Untitled Component';
  const id = control._children.Core.id;
  const document = {
    id,
    name: control._children.Core.name,
    modified: false,
    control,
  };

  componentDocuments.update((documents) => [...documents, document]);
  activeComponentDocumentId.set(id);
  openComponentSurfaceWorkspace();
  return document;
}

export function createComponentDocumentFromLibraryEntry(entry) {
  const control = instantiateCustomComponentPackageControl(entry?.envelope ?? entry, {
    id: uniqueComponentDocumentId(),
    name: entry?.name || entry?.metadata?.name || 'Custom Component',
  });
  if (!control) return null;
  const document = createComponentDocument({
    name: control._children?.Core?.name || entry?.name || 'Custom Component',
    control,
  });
  if (entry?.id) customComponentLibrary.markUsed(entry.id);
  return document;
}

export function setActiveComponentDocument(id) {
  if (!id) return;
  if (!get(componentDocuments).some((document) => document.id === id)) return;
  activeComponentDocumentId.set(id);
  openComponentSurfaceWorkspace();
}

export function closeComponentDocument(id) {
  componentDocuments.update((documents) => documents.filter((document) => document.id !== id));
  if (get(activeComponentDocumentId) !== id) return get(activeComponentDocumentId);

  const remaining = get(componentDocuments);
  const nextId = remaining.at(-1)?.id ?? null;
  activeComponentDocumentId.set(nextId);
  if (!remaining.length) closeComponentWorkspace();
  return nextId;
}

export function mutateComponentDocumentControl(controlId, mutator) {
  if (!controlId || typeof mutator !== 'function') return false;
  let changed = false;
  componentDocuments.update((documents) => documents.map((document) => {
    if (document.control?._children?.Core?.id !== controlId) return document;
    const nextControl = deepClone(document.control);
    const didMutate = mutator(nextControl) !== false;
    if (!didMutate) return document;
    changed = true;
    return {
      ...document,
      name: nextControl?._children?.Core?.name ?? document.name,
      modified: true,
      control: nextControl,
    };
  }));
  return changed;
}
