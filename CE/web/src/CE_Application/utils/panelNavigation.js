/** Keep local tab navigation in the document without changing its saved status or content identity. */
export function withViewerActiveIndex(panel, activeImageIndex) {
  if (!panel || panel.viewer?.activeImageIndex === activeImageIndex) return panel;
  return { ...panel, viewer: { ...(panel.viewer ?? {}), activeImageIndex } };
}

export function withNotepadActiveIndex(panel, activeNoteIndex) {
  if (!panel || panel.notepad?.activeNoteIndex === activeNoteIndex) return panel;
  return { ...panel, notepad: { ...(panel.notepad ?? {}), activeNoteIndex } };
}
