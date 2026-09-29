# Undo history

Every undo step has a name, such as *Move Cutoff*, *Rename Drive to Overdrive*, *Delete 3 controls*
or *Resize panel*. The names appear in three places:

- **Edit › Undo** and **Edit › Redo** name the step they will take back or put back:
  *Undo Move Cutoff*.
- The **Undo** and **Redo** buttons say the same in their tooltips, on the properties toolbar and
  in the Component Designer.
- **Edit › History...** opens a window listing every step of the document you are editing, oldest
  first. The highlighted row is where you are. Rows below it, in grey, are steps you have undone
  and can redo. Click any row to go straight to the state just after it, or **Start** to go back to
  before the first step listed. The window sits beside the canvas, so you can watch the panel
  change as you click. Esc closes it.

Jumping is the same as pressing Undo or Redo that many times. The selection and the unsaved-changes
dot follow as they would for each single step.

## What the names say

| Name | Means |
|---|---|
| Move / Resize / Rotate *control* | Only its position, size or rotation changed |
| Rename *old* to *new* | Only its name changed |
| Edit *section* of *control* | One section changed, such as *Edit background of Cutoff* |
| Edit *control* | Several of its sections changed |
| Move 4 controls, Edit background of 2 controls | The same change to several controls |
| Edit 3 controls | Different changes to several controls |
| Add / Delete *control* or *N controls* | Controls added or removed |
| Reorder controls | Only the stacking order changed |
| Resize panel, Edit notes, Change panel settings | The panel itself, not its controls |
| Recall *snapshot*, Randomise values | Commands that change values rather than the design |

A control inside a container is named itself; moving a knob inside a group reads *Move Env
Amount*, not as a change to the group. In the Component Designer, steps are named by part: *Add
part knob*, *Move or resize part label*, *Edit states*.

## Limits

- History keeps the last **50 steps per document**. Each open panel and component has its own.
- **Background images are not part of undo**, as before.
- A step is listed once it is committed: when you let go of a drag, or about half a second after
  you stop typing.
