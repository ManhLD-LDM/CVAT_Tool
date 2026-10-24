# Batch Outside — local 1.18.1

Date: 2026-10-23. No live CVAT annotation Apply/Save or import was performed.

## Behavior

Batch Edit now includes **Hiển thị / Outside** with explicit true (outside/hidden) and false (present/visible) choices. The selected cuboid track is read with native allTracks enabled, including outside frames. The inclusive user range supports 1–1000 frames. The operation preserves track identities and edits native geometry/outside fields without deleting or recreating annotations.

Every selected frame's original native geometry is captured before writing. If any outside value changes, all selected frames are saved from these original geometries and the desired outside flag. This deliberately materializes even already-equal range frames, because changing outside can change native interpolation. Existing geometry is reused when unhiding; no detection, tracking or new location estimation is performed.

Immediate boundary frames at from-1/to+1, where inside the job, are captured with their original geometry and outside flags and saved before the range. Existing boundary keys are also preserved. A range already in the requested state produces no writes or boundary keys. Preview lists state-change count, write count and boundary frames. Changing input invalidates Apply.

Stale previews, invalid/nonboolean values, invalid ranges, missing/invalid geometry and locked/ground-truth targets or boundaries stop before writes. Native save is checked for both geometry and outside. Errors stop later writes and report confirmed progress; renderer/history refresh and unlock run afterward. Undo is per native write and Save CVAT persists changes. A native failure is not promised to roll back atomically.

## Verification

- All Node suites: **261 passed, 6 optional skips, 0 failed** (267 total).
- Four new native-model tests cover both outside directions, geometry/identity/attribute retention, unchanged visibility outside the selected range, boundary order, existing keys, whole-job/single-frame ranges, no-op ranges, input/protection/stale guards, no-op native save, failure cleanup and model Undo. The fixture includes visibility-dependent interpolation and reads all tracks.
- Edge browser fixtures: **8 passed** across Outside, class attributes and dimensions. Outside tests verify explicit false/true payloads, preview messaging, correct panels, confirmation invalidation on value/mode changes, Apply and closing without edits.
- Local logs: `batch-outside-unit.local.log`, `batch-outside-browser.local.log`, `batch-outside-build.local.log` (ignored artifacts).
- Installer self-test passed for 1.18.1 with mocked registry; real browser installation was not tested. All 24 extension ZIP files match source and all three asset SHA-256 checksums were verified. Report: `dist/batch-outside-selftest.local.json`.

These checks use offline native-model and browser fixtures, not live acceptance on job 1224. Unhidden geometry requires human review, especially where original outside frames have sparse/held positions. Version 1.18.1 is local and has not been pushed or released as part of this task.
