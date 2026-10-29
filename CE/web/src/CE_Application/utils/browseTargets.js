// browseTargets.js — where an image chosen from the file dialog goes.

/**
 * Whether an image chosen with a layer's Browse goes on the whole selection, or only on the
 * control whose editor asked for it.
 *
 * Every other change on the Background tab reaches every selected control; Browse refused to start
 * at all with more than one selected, so a texture meant for ten sections had to be put on one and
 * copied to the rest. The dialog's answer arrives later, though, and by then the selection may have
 * moved on: an image chosen for ten sections must not land on whatever is selected now. So it goes
 * on the selection only when that is still exactly the one Browse was started with.
 */
export function browseGoesToSelection(startedWith, current) {
  if (!startedWith || startedWith.size < 2 || !current || current.size !== startedWith.size) return false;
  for (const id of startedWith) {
    if (!current.has(id)) return false;
  }
  return true;
}
