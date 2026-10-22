# Cross-job template diagnosis and local fix — 1.17.6

Date: 2026-10-21. Owner files were read only. No live import, Apply, Save or annotation mutation was performed. This version is a local build, not a GitHub release in this task.

## File comparison

| Field | Friend's export | Owner's export |
| --- | --- | --- |
| Job | 1264 | 1224 |
| Tool version | 1.17.5 | 1.17.5 |
| Server | Same CVAT origin | Same CVAT origin |
| Tracks | 76 (#1–#76) | 79 (#1–#79) |
| Keyframes | 775 | 3469 |
| Keyframe bounds | 0–59 | 0–59 |
| Display clientIDs | Present and unique | Present and unique |
| Label/attribute schema | Same as target | Same as source |

The immediate rejection was the strict same-job guard, not a failed display-ID export. However, displayed IDs are not universal object identities across jobs. Source #72–#76 differ in class from the same-numbered target objects. Source #72 is vehicles; target #72 is pedestrian. At frame 49, the center of source #72 is identical to target #75's center. This single-frame observation suggests a numbering mismatch; it does not establish a complete track correspondence or justify automatic remapping. JSON annotation files do not establish point-cloud/frame provenance by themselves.

## Change

- Same-server, different-job files may open as templates with source/target job context. Different-server metadata remains rejected.
- Cross-job files require label schemas. Used labels and attributes map by names and mutability, rather than database IDs. Incoming frame numbers must remain inside target job bounds; no offset or coordinate conversion occurs.
- UI and backend require explicit confirmation that the jobs share scene, coordinates and frame numbering before Apply.
- Same-numbered rows with different classes show both classes and are not selected by default. Manual mapping to existing displayed IDs remains available. The tool does not infer mappings from nearest centers or database IDs.
- Editing remains in place, preserving target object identity and unselected objects, with no track creation/deletion. Export now includes job frame bounds in metadata.

## Evidence and limits

- All Node suites: **246 passed, 6 optional skips, 0 failed** (252 total).
- Annotation I/O with all owner-file fixtures enabled: **28/28 passed**.
- Actual-file replay edited all 76 selected source IDs on an offline model of target job 1224, checked exact source keyframe geometry/visibility, retained target display/database IDs, preserved #77–#79 and made no collection create/delete calls. Source file bytes remained unchanged. This deliberate mechanical replay does not assert that each same-numbered ID depicts the same physical object.
- Native-model fixture attribute reads were corrected to preserve inherited/default attributes during keyframe-only saves. This fixes an offline-model discrepancy, not a claimed live CVAT defect.
- Edge browser fixtures for import UI/session/Ground Snap: **17 passed**. Cross-job coverage includes required confirmation, confirmation reset, default deselection of class mismatches and the explicit Apply payload.
- Installer self-test passed for 1.17.6 with mocked registry; browser installation remains untested. All 24 extension ZIP files match source bytes; all three asset hashes verified.
- Local logs: `cross-job-unit.local.log`, `cross-job-owner.local.log`, `cross-job-browser.local.log`, `cross-job-build.local.log`; self-test report: `dist/cross-job-selftest.local.json`.

Actual CVAT Apply, persistence after Save/reopen, and whether both jobs contain the same point clouds have not been verified. Native Undo is per operation, and partial failures do not promise atomic rollback.
