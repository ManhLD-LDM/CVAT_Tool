# POV image QoL — 1.22.1

The floating POV image has magnify **− / +**, percentage, and **Fit** controls. Zoom ranges from 25% to 800%; drag enlarged images to pan. Auto direction changes preserve the chosen magnification. These controls do not change CVAT cameras or annotations.

In the wheel configuration, small magnify buttons appear at the top-right of both the wheel's image thumbnails and the image-list thumbnails. They open a larger, draggable and resizable preview with separate zoom and Fit controls. Previewing does not select or assign an image. Close with × or Escape. Changing the frame closes stale previews and refreshes configuration thumbnails.

Rebuilt folders: `extension` and `dist/extension`. Archive: `dist/CVAT-3D-Tool-Extension-1.22.1.zip`. **Reload local** applies the change when the browser is loading one of those rebuilt folders; it does not copy files into a separate installer-managed folder. Confirm **v1.22.1** in the footer.

Verification: all six reference-image browser checks passed, covering Auto/manual selection, frame refresh, mapping edits, zoom/pan/Fit, both magnify-button locations, unchanged assignments, missing images and stale-preview cleanup. The preview screenshot was visually inspected: `pov-preview-1.22.1.png`. Tests used local native-model fixtures; no live annotations were edited.
