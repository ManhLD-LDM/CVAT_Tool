# Interactive Batch Review / Batch Properties — local 1.19.0

Date: 2026-10-24. This is offline verification, not live CVAT acceptance. No live import, Apply or Save was performed. No commit, push or GitHub release was requested or performed in this task.

## Changes

- Independent projection geometry supports move in Top/Side/Front, positive-face resize with the opposite face fixed, and Top yaw rotation. The overlay projects all cuboid vertices. Mouse gestures stage drafts in controller memory; they do not call native save until explicit Apply. Reset restores the computed card. Automatic position suggestions are unchanged.
- Native keyframes require manual-edit opt-in and apply confirmation. User protection, locks and ground truth remain enforced. Manual interaction supports yaw-only cuboids. Native interpolation between edited keys can change; original QC counters are not a recomputed full-cloud audit of the draft.
- Point size follows `settings.shapes.pointSize` when available or the visible, explicitly labelled Point size slider. Opacity and control-handle size are not used. An unavailable source is labelled and falls back to 2 px. The user may override review size locally, 0.5–12 px. Actual deployment state exposure and visual equivalence still require live verification.
- Batch Edit adds occluded/keyframe interval changes and lock/hidden/pinned whole-track editor switches with explicit scope acknowledgement. Boolean false is supported. First/visibility/occlusion/attribute anchors are retained during key removal. Global flags are not serialized as server annotation properties. Locked tracks can open Batch Edit for unlock; other mutation guards remain.
- Includes the earlier local Batch Outside changes, preserving IDs and range/boundary geometry snapshots.

## Verification

- Full Node suite: **274 passed, 6 skipped, 0 failed** (280 tests). Includes native-model property fixtures, ID/geometry preservation, native-model Undo, range boundaries, locked/GT/stale guards, manual drafts, reset and geometry calculations.
- Targeted browser suite: **22 passed** across batch review, size, class attributes, outside and property controls. Tests use simulated native state/history and real local PCD parsing/projection, not a live CVAT server. An initial resize test used the original handle position despite an automatic proposal offset; corrected the fixture to edit an explicitly enabled native anchor, then reran the complete targeted suite.
- Screenshot visually inspected: [manual draft](batch-review-manual-1.19.0.png).
- Extension ZIP: **24/24 entries match source bytes**. Three packaged assets match SHA256SUMS.
- Windows installer self-test: ok, version 1.19.0, bundled host protocol pass. Registry is mocked; browser installation was not tested.

## Remaining live acceptance

Load local 1.19.0, check point size against the deployed CVAT Appearance slider, then review move/resize/yaw drafts on a disposable track. Confirm Apply, native Undo and Save/reload behavior separately. Confirm editor-only flags against the deployed native sidebar. These steps have not been claimed as complete.
