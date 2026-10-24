# Visible controls and feature help — 1.22.3

Implemented the requested UI changes:

- Free Cam uses a green active background/border and an **ON** label, driven by the actual camera state. Escape returns it to the inactive appearance. `aria-pressed` exposes the state to assistive technology.
- **Box → Quick controls** lists the live bindings for aiming Top view, moving the box center, nearest-corner resizing and direction rotation, with the applicable views shown beside each action. Keyboard and mouse rebindings update these hints. Shortcut badges on action buttons also remain visible in compact mode.
- Small **?** buttons on the right of feature controls open non-modal, read-only guide popovers beside the feature. Guides cover annotation, selection/class, ground options, camera, appearance, POV images, batch tools, import/export, controls, updates and work logging. Help remains enabled for disabled features and never invokes their action.
- Escape, × or clicking outside closes a guide. Popovers stay within the viewport, return keyboard focus when dismissed, and are cleaned up when the panel is reinjected or removed. POV windows use the same guide system.

Verification:

- Full browser regression: **97 passed**.
- Final focused UI/guide checks after layout refinements: **8 passed**.
- Annotation export/version checks: **28 passed, 4 existing fixture-dependent skips**.
- Screenshots visually inspected: `quick-controls-help-1.22.3.png` and `freecam-help-1.22.3.png`.

Source `extension`, unpacked `dist/extension`, standalone demo and `dist/CVAT-3D-Tool-Extension-1.22.3.zip` rebuilt. Reload local applies this build when the browser loads a rebuilt folder; confirm **v1.22.3** in the footer. No live annotations were edited and no release was published.
