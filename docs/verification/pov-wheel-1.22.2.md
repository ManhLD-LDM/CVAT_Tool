# Mouse-wheel image zoom — 1.22.2

- Scroll up/down over the POV image or enlarged preview to zoom in/out around the cursor. Mouse-wheel and trackpad pixel/line/page deltas are handled, within the existing 25–800% limits.
- Left-drag an enlarged image to pan. The buttons, percentage indicator and Fit control remain available.
- Scrolling an image does not scroll the page or change CVAT camera/annotation state.

All **7 reference-image browser tests passed**, including cursor anchoring, zooming both directions, dragging in both image windows, no page scrolling, unchanged annotations, image assignment, preview lifecycle and frame changes.

Rebuilt source `extension`, unpacked `dist/extension`, and `dist/CVAT-3D-Tool-Extension-1.22.2.zip`. Reload local applies the update when the browser loads one of the rebuilt folders; confirm v1.22.2 in the footer. No live CVAT annotations were edited.
