# Alignment and selection hierarchy

Figma's [alignment documentation](https://help.figma.com/hc/en-us/articles/360039956914-Adjust-alignment-rotation-position-and-dimensions)
describes single-layer alignment to a parent group or frame and multi-layer
alignment relative to the selected layers. Its
[selection documentation](https://help.figma.com/hc/en-us/articles/360040449873-Select-layers-and-objects)
distinguishes selecting a parent from selecting nested objects directly.
Squig follows that distinction for alignment and distribution.

| Selection | Alignment target | What moves |
| --- | --- | --- |
| Two or more groups | Combined bounds of the selected groups | Each selected group as a unit |
| Individually selected children, including every child | Combined bounds of those children | Each selected child independently |
| A child and an object outside its group | Combined bounds of those objects | Only those selected objects |
| A group and a child from another group | Combined bounds of those two units | The selected group and the selected child |
| One child | Immediate group's bounds before the operation | Only the child |
| One nested group | Immediate parent group's bounds | The subgroup as a unit |
| One top-level object or group | No parent target | Alignment unavailable |

All six alignment directions use visible bounds, including rotated shapes and
routed connectors. Distribution needs at least three selected units, counts a
selected group once, and preserves each group's internal offsets. A parent and
a subgroup represented in the same selection never move a leaf twice.

Squig groups have no separate container node or persistent dimensions. Their
bounds come from their contents and can change after a child moves. A rectangle
that merely surrounds another object is not its parent; they must belong to a
group. Locked siblings contribute to a child's parent bounds. Locked layers do
not move, following squig's existing per-layer lock policy.

## Keeping intent through a flat document

`selection` remains a list of leaf IDs for rendering and dragging.
`selectionGroups` records explicitly selected group units; unclaimed leaves
remain independent. `selectionGroupId` retains the existing single-group drill-in
context. Group clicks, additive clicks, marquee and Select all carry group intent;
direct API selections of leaf IDs do not infer groups from complete membership.
Undo, redo, duplicate and canceled gestures carry the group units with them.

The inspector, quick controls, context menu and command palette share the
alignment availability calculation. A single child gets the same six controls,
with accessible labels identifying its group as the target.

## Related Figma behavior outside this change

Figma also documents Shift-click alignment of a multi-selection as a temporary
group to its parent frame, with selections across frames using their respective
parents. This change covers ordinary alignment and distribution; it does not add
that modifier behavior, fixed frames, or auto layout. Spacing and tidy-up remain
separate operations with their existing behavior.

## Verification

`scripts/test-groups.ts` covers hierarchy, all six parent alignments, mixed
selections, locks, distribution, duplication, and undo. The existing geometry
suite covers visible bounds for rotation and connectors.
`scripts/ui/alignment-browser.mjs` exercises actual group clicks, deep additive
clicks, marquee selection, toolbar visibility, parent alignment and undo.
