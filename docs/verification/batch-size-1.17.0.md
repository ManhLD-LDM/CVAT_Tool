# Batch Size Update 1.17.0 — local verification

Date: 2026-10-21. No live CVAT annotation was imported, exported, changed or saved during this feature verification.

Implemented a separate manual size workflow for one native cuboid track. Preview captures all original geometry before writing, including existing keyframes. It accepts 1–1000 inclusive frames and finite dimensions 0.01–100 m. Defaults to the selected box's dimensions and preserving each frame's existing lowest vertex Z; center XYZ is an alternative. It does not estimate ground, track objects or fetch point clouds.

Apply uses ObjectState.save(), retains the native object identity, preserves frame-specific XY/orientation and changes only dimensions plus Z in bottom mode. Original interpolation immediately outside the selected range is pinned with unchanged boundary keyframes before any dimension writes. Outside frames are skipped. Locked/ground-truth targets or required boundaries block preflight. Original keyframes can be deliberately resized here; Batch Track Review's anchor protection remains unchanged.

Preview is invalidated by changed form values, changed track/job/session, cancellation or a superseding preview. Backend rejects concurrent/repeated apply. Writes yield every 20 operations, verify saved geometry, refresh native states/history and release the edit lock on failure. Partial failures report confirmed writes, including a save which commits before throwing. This is sequential, not atomic; native Undo is per write. Save CVAT persists changes to the server.

Evidence:

- Node suite excluding the separate session transport suite: **223 passed, 3 optional skipped, 0 failed** (226 total). Includes ten new controller tests and one native adapter integration test.
- Browser fixtures: **21 distinct passed**: 4 Batch Size Update + 9 Batch Track Review + 4 annotation import UI + 4 update UI. Import UI tests use fixtures only; no live import/export.
- The new browser tests exercise a 20-frame range, whole-job 60-frame update including existing keyframes, center/bottom anchoring, boundary writes, explicit preview/confirm, invalidation, invalid range and closing without edits.
- Controller tests additionally check rotated bottom height, sparse interpolation outside the selected range, protected targets/boundaries, outside skipping, stale/read-only sessions, concurrent apply, partial failure, no-op native saves and superseded previews.
- Generated MAIN/PANEL bundles and 24-file extension ZIP contain the new controller/UI. Local package manifest is 1.17.0. All three distribution asset SHA-256 checksums verified.
- Frozen Setup.exe self-test: ok, bundled version 1.17.0, host protocol pass; registry mocked and browser installation not tested.

Limits: live CVAT rendering, Undo and server persistence still require an authenticated editor acceptance test. No live latency benchmark or 1000-frame load benchmark was performed. Preserving existing bottom height does not correct an already floating or buried box. Local build only; this task has not published a GitHub release.
