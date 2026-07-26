import { writable } from 'svelte/store';

/**
 * Id of the container currently highlighted as the drop target while a
 * canvas drag is in flight, or null. Set by the dragged CanvasControl,
 * read by every container to render its capture highlight.
 */
export const containerDropTargetId = writable(null);
