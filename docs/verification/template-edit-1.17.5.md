# Whole-job JSON template editing — local 1.17.5

Date: 2026-10-21. This report covers offline tests and local packages. No live annotation import, Apply, Save or deletion was performed. Build verification was completed before publication; the GitHub v1.17.5 tag and release identify the published revision.

## Behavior

- JSON HUD has one workflow: select existing displayed #clientIDs, then edit them in place from the file.
- Source frame N edits target frame N. Different first keyframes do not disable ID selection or block a track edit. Native Track.frame is creation metadata; the keyframe set defines the trajectory and visibility.
- Every source keyframe is saved, including unchanged geometry. Obsolete target keyframes become interpolated frames on the same track. This does not remove or recreate the track.
- Sparse files retain native CVAT interpolation; dense files copy every supplied frame. Before-first visibility and outside spans follow the source keyframes.
- Existing target clientID/database ID and unselected objects remain. No missing objects are created. Old append/merge/delete-all requests are rejected at the backend.
- JSON without clientID requires explicit mapping to an existing displayed ID. Database IDs and array order are not matching keys. Stale previews, locked objects, foreign metadata, duplicate mappings and invalid geometry remain guarded.
- Standalone shapes remain tied to their original frame; this workflow does not convert them to tracks.

## Evidence

- All Node unit suites: **244 passed, 5 optional skips, 0 failed** (249 total).
- Annotation I/O with all four owner-file environment fixtures: **25 passed, 0 skipped, 0 failed**. Files were read only; tests assert source bytes remain unchanged.
- Edge headless browser fixtures for JSON dialog, session and Ground Snap: **16 passed**. Includes no mode selector, explicit selected-ID payload, enabled target with different starting frame, cleared confirmation after target change and missing/duplicate target guards.
- New full-job test checks all 60 frame states in both directions (first keyframe 0 → 8 and 8 → 0), sparse geometry interpolation and outside spans, identity retention, unselected objects and native-model Undo. The offline linear cuboid oracle is not a complete CVAT runtime or a live Save test.
- Dense 60-frame test verifies all 60 native-model saves, including already equal frames, with no collection commit/create/delete calls.
- Extension bundles rebuilt. Versioned ZIP contains 24 files matching the extension source bytes. All three packaged asset SHA-256 hashes verified.
- Windows installer self-test: version 1.17.5, bundled host protocol passed; registry mocked, browser installation not tested.

Local evidence logs: `template-edit-unit.local.log`, `template-edit-owner.local.log`, `template-edit-browser.local.log`, `template-edit-build.local.log`; installer report: `dist/template-edit-selftest.local.json`. These local artifacts are ignored by Git.

## Limits

Actual native CVAT Apply, server persistence and subsequent reload have not been exercised in this change, respecting the owner's prohibition on live import. Native Undo is per operation; a mid-run failure reports partial progress and does not promise an atomic rollback. ClientIDs can be reassigned when CVAT opens another editor session, so the preview must still be checked.
