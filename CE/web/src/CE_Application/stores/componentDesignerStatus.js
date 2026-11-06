import { writable } from 'svelte/store';

/**
 * What the Component Designer reports while it is open; `kind` is empty when it is not. Beside the
 * header chips: the component it holds (`controlId`), its editable selected layers and the first
 * one's fill (`layers`, `fill`: the dock's Colors tab edits them) and the surface's own zoom and
 * snap (`zoom` as a factor, `snapEnabled`, `snapSize`: the status bar shows these, not the panel's).
 */
const CLOSED = Object.freeze({
  kind: '',
  tool: '',
  layer: '',
  zone: '',
  warning: '',
  artboard: '',
  layerCount: 0,
  zoneCount: 0,
  lockedNote: '',
  previewMode: 'edit',
  controlId: '',
  fill: '',
  layers: Object.freeze([]),
  looks: Object.freeze([]),
  zoom: 1,
  snapEnabled: false,
  snapSize: 10,
});

export const componentDesignerStatus = writable(CLOSED);

/**
 * A layer the dock asks the open designer to select (`{ controlId, name }`): a light layer's "Edit
 * <layer>'s colour" selects the layer it lights. The designer takes it and sets it back to null.
 */
export const designerLayerRequest = writable(null);

/** The designer has closed: nothing to report. */
export function resetComponentDesignerStatus() {
  componentDesignerStatus.set(CLOSED);
}

export const componentDesignerPreviewRequest = writable({
  mode: '',
  token: 0,
});

export function requestComponentDesignerPreview(mode) {
  componentDesignerPreviewRequest.update((request) => ({
    mode,
    token: (request?.token ?? 0) + 1,
  }));
}
