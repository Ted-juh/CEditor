import { writable } from 'svelte/store';

export const componentDesignerStatus = writable({
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
});

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
