# Floating task interface — local 1.20.0

Date: 2026-10-24. Implemented in the existing extension, with native CVAT annotation operations retained. No live CVAT annotation import, Apply, Save or reload was performed. No commit, push or release in this task.

## Implemented

- Floating panel with shared selected ID, size summary, Focus and native save status. Five accessible tabs: Box, QC, Camera, Dữ liệu, Cài đặt. Header retains drag/collapse and adds expansion. Tab changes move no annotations and retain actual controls/input values; no duplicate IDs or cloned action handlers.
- Compact hierarchy: direct Auto-Fit, Snap ground and rotation; expandable geometry, presets, ground-origin and mouse-placement settings. Batch entry points remain in a common section. Camera reuses CVAT Appearance for native point size; Batch Review offers its existing independent synchronization/override controls.
- Keyboard tab navigation (arrows/Home/End) is isolated from bubbling editor shortcuts. Responsive panel width, resize clamping, thin themed scrolling and consistent focus styles. Resize listeners are disposed on reinjection/navigation.
- Data separates in-place clientID editing from delete-and-import. Destructive entry is behind its own named expandable section; existing preview, backup and confirmation logic is retained. Server-session tools remain an advanced entry.
- Batch Review defaults to three larger frame cards, with an explicit seven-card compact option. Density changes align page boundaries, retain selections/drafts and use cached computation. Still up to 60 computed frames. Automatic refinement and native Apply math are unchanged. Manual scaled-canvas gestures, opt-in keyframe editing, ground-truth/lock guards and native undo behavior remain.
- Batch Edit has choose/preview/result steps, invalidated-preview feedback, expandable guidance and explicit whole-track scope. Frame range is hidden for whole-track lock/hidden/pinned flags. No-op/stale/locked checks remain in the existing controller.
- A consistent dark theme covers panel, Batch Review, Batch Edit, import preview and shortcut settings. No extra point-cloud renderer or replacement CVAT editor is introduced.

## Verification

- Full Node suite: **274 pass, 6 skipped, 0 fail** (280 cases).
- Final full Playwright suite: **83/83 pass**, one worker, 2.3 minutes. This includes original geometry/selection/undo/camera interactions in the offline 3D demo, native-state fixtures for batch and import, session transport mocks, update/reload guards, and new UI coverage. Tests follow task navigation and expand sections as a user would.
- After visual inspection, frame headings were made sticky while scrolling the batch cards. The three-frame density/manual-gesture test was rerun and passed after that CSS change; the installer and ZIP were rebuilt and reverified.
- New UI coverage: switching tasks does not edit annotations; selector/preset inputs survive navigation, expansion and collapse; controls/IDs are not duplicated; arrow keys do not bubble to the editor; narrow viewport and reinjection cleanup; three/seven-card density changes retain selections and scaled-pointer drafts remain staged until Apply.
- Early runs exposed test-navigation assumptions, a conditional-helper fixture error and competing test servers. Those were corrected. A deferred Auto-Fit request assertion was given an explicit asynchronous timeout. The final entire suite passes; there is no live performance benchmark claim.
- Standalone offline demo rebuilt with the current interface. Its HTTP-free opening is covered by the browser suite. Native-only batch actions remain unavailable in that fixed-frame demo.
- ZIP **24/24 entries match current source bytes**, manifest version 1.20.0. SHA256SUMS verifies **3/3 assets**.
- Windows installer self-test: ok/version 1.20.0/bundled host protocol pass. Registry is mocked, and actual browser installation is not exercised.
- `git diff --check` passes for implementation/tests/documentation.

## Visual evidence

- [Floating panel in offline demo](ui-tasks-1.20.0.png)
- [Three-frame Batch Review using a native-state fixture](ui-batch-three-1.20.0.png)
- [Narrow viewport](ui-mobile-1.20.0.png)

These screenshots show the implemented UI with demo/fixture annotations. They are not screenshots of a live CVAT job. Panel and Batch Review screenshots were visually inspected.

## Local deliverables and remaining acceptance

`dist/CVAT-3D-Tool-Setup.exe`, `dist/CVAT-3D-Tool-Extension-1.20.0.zip`, and the refreshed standalone demo are local builds. Save current work before loading/reloading the extension. Live native CVAT behavior, actual installation and visual integration still need verification on the deployed editor. Offline pass counts do not establish those gates.
