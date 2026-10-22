# Explicit full JSON replacement — local 1.17.7

Date: 2026-10-22. User requested restoring deletion of current annotations followed by import of new annotations. This supersedes the prior edit-only preference for this separate action. Existing edit-by-clientID behavior remains available.

## Behavior

- HUD has separate **Chỉnh ID theo file JSON** and **Xóa & import mới** buttons. File selection captures the requested mode; old edit-mode `scope: all/merge` requests remain rejected.
- Full replacement previews the current and incoming object counts and explicitly states that new IDs are assigned. It requires confirmation, imports the whole file and provides no per-ID mapping selector. Same-server cross-job confirmation and schema/frame validation remain enforced.
- Before Apply, the UI exports a native editor JSON backup and requests a timestamped download. Export failure blocks Apply. Browser download requests do not prove the user saved a file to disk; the README states this limitation.
- Backend preflights native commit support, all current cuboid objects, locks/ground truth and the frozen editor signature. Unsupported tags/intervals/non-cuboids are rejected rather than silently deleted or retained.
- Incoming object and keyframe database IDs and object clientIDs are stripped. One native `annotations.commit(incoming, current, frame)` imports the new collection and marks old objects removed with native Undo/Redo history. No separate clear/delete operation leaves the editor deliberately empty first.
- The result checks the final collection counts, fresh clientIDs and geometry/visibility against the incoming file. Renderer/history refresh runs on success or failure. Save CVAT persists changes. Failure reports possible partial changes and points to native Undo; no atomic rollback guarantee is made.

## Verification

- Node suites: **250 passed, 6 optional skips, 0 failed** (256 total).
- Annotation I/O suite with all owner-file fixtures enabled: **32/32 passed**. Includes full recreation, recursive ID stripping, model Undo, preserved edit-only behavior, cross-job confirmation, invalid geometry, locked targets, stale previews, incomplete selections and native failure cleanup. Owner files remain read only.
- Edge browser fixtures: **20 passed** across annotation I/O, session and ground fallback. New tests cover confirmation, old/new counts, no ID mapping controls, backup-before-import ordering, export failure preventing Apply and closing without mutation.
- Installer self-test passed for 1.17.7, using a mocked registry. Real browser installation was not tested. Extension ZIP has 24 files matching current extension source bytes. All three packaged asset SHA-256 checksums verified.
- Logs: `recreate-unit.local.log`, `recreate-owner.local.log`, `recreate-browser.local.log`, `recreate-build.local.log`; report: `dist/recreate-selftest.local.json` (ignored local artifacts).

No live CVAT annotation import, deletion, Apply or Save was performed. Native commit behavior was inspected in the local CVAT reference source and exercised through offline fixtures; live Undo/Redo and server persistence remain unverified. Verification preceded the requested push to main. A GitHub release is separate and was not created by this push.
