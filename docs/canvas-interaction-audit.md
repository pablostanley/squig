# Canvas interaction audit

Reviewed against Figma and FigJam's published interaction guidance, September 2026.
The aim is predictable pointer targets and familiar shortcuts across selection,
movement, resizing, rotation, and editing.

## Reference behavior

- [Select, move, and order objects in FigJam](https://help.figma.com/hc/en-us/articles/1500004292221-Select-move-and-order-objects-in-FigJam): object dragging, crossing marquees, and Shift selection.
- [Resize, rotate, and flip objects in FigJam](https://help.figma.com/hc/en-us/articles/1500006206242-Resize-rotate-and-flip-objects-in-FigJam): edge/corner resizing, proportional and centered resizing, and rotation outside corners.
- [Adjust alignment, rotation, position, and dimensions in Figma](https://help.figma.com/hc/en-us/articles/360039956914-Adjust-alignment-rotation-position-and-dimensions): rotation around selection centers, numeric dimensions, and 15-degree snapping.
- [Group objects in FigJam](https://help.figma.com/hc/en-us/articles/1500004414962-Group-objects-in-FigJam): moving groups and duplicating with Alt/Option-drag.
- [Select layers and objects in Figma](https://help.figma.com/hc/en-us/articles/360040449873-Select-layers-and-objects): additive and deeper selection.

These are references for the interaction model, not a claim of full Figma feature parity.

## Findings and changes

| Before | After |
|---|---|
| A hollow shape's center could select it on release but could not start a move. | Interior dragging selects and moves on the first press, independent of fill. |
| A selected outline moved; resizing required finding a small handle. | All four bounding-box edges resize continuously. Interior movement remains available. |
| A hollow container needed to stay transparent to reach its contents. | Visible content takes priority. Shift-drag inside an unselected outline offers a marquee. |
| Empty space between selected objects started a new marquee. | The gap moves the whole selection. Shift keeps it available for marquee selection. |
| Shift removed an already selected member immediately, preventing a constrained drag. | Removal waits for a click's release; a real drag preserves the set and constrains movement. |
| A marquee could alter selection below the drag threshold. | A click remains a click until the radial threshold is crossed. |
| Small or thin selections lost all transform handles. | Thin selections retain end grips; tiny selections retain an outward corner grip. |
| Filled ellipses could be selected in empty bounding-box corners. Hollow oval marquee crossings could be missed. | Ellipse tests use the oval geometry for both clicks and marquees. |
| Minimum-size clamping broke the original aspect ratio. | Proportional transforms clamp a single scale; thin shapes keep their untouched dimension. |
| There was no rotation model or control. | Drag outside any corner to rotate; Shift snaps to 15 degrees. The inspector accepts an exact angle. |
| Rotation had no representation in editing, routing, or export. | Local axes drive rotated resize/crop; text editors, connector anchors, detached parts, bounds, history, and SVG share rotation geometry. |
| Transform cursors could disappear under pointer capture. | The active cursor remains visible and follows the object's orientation. |
| A handle could intercept secondary-button and pan gestures. | Primary transform presses are guarded; middle-button and Space panning take precedence. |
| A final pointer position could be missed before release. | Release flushes the final position before committing. |
| An out-and-back drag could consume Undo and destroy Redo. | Completed no-op checkpoints are discarded and the displaced redo stack is restored. |
| Numeric inspector edits stayed pending on Enter. | Enter commits; Escape discards the draft. |

## Current interaction rules

- Click a member of a multi-selection to narrow it on release; drag it to move the full selection.
- Shift-click adds/removes. Shift-drag constrains movement. Cmd/Ctrl-click reaches inside a group; Shift can add that deep pick.
- Alt/Option-drag duplicates, including when toggled during the gesture. One undo removes the copy. Escape cancels the gesture.
- Selected edges resize one axis; corners resize both. Shift preserves proportions; Alt/Option resizes about the center. Text side handles edit the text container without scaling its type.
- Rotate outside the corners around the selection center. Group members orbit and turn together. The angle convention is counterclockwise positive.
- The Rotation inspector, like the existing dimension fields, sets each selected layer's value. Use the canvas rotation gesture to orbit a group around its shared center.
- Arrows retain endpoint and route controls. Rotating a selection containing connectors rotates their endpoints; attached ends settle onto their targets. Elbow connectors keep orthogonal routing.
- A multi-selection containing rotated layers scales uniformly: the document stores rectangles and angles, so a nonuniform world transform would require unsupported shear.
- Resizing stops at the minimum instead of flipping through an edge. Explicit flip commands remain available.
- Resize snapping uses world axes on unrotated selections. A rotated single layer resizes in its local axes without world-axis resize snapping.

## Verification

Pure regression cases cover target precedence, selection press/release rules,
ellipse geometry, tiny/thin handle availability, proportional limits on all eight
handles, rotated hit areas/bounds/anchors, pointer/keyboard resize agreement,
group rotation, saved rotation, SVG bounds, API validation, and undo/redo.

Browser checks exercise first-drag hollow movement; edge resizing away from the
midpoint handle; rotated edge resizing; Shift-constrained moves; selection-gap
movement; click collapse and Shift toggling; nested marquee selection; Alt-copy
and undo; Escape cancellation; thin shape movement/resizing; middle-button pan
over handles; final-release coordinates; rotation snapping; exact numeric angle
entry and cancellation; rotated inline text editing; rotated image cropping; and
group rotation with one-step undo.

The repository release gate is lint, all test suites, the separate agent suite,
the production build, and the offline Webxdc package build.
