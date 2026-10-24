# Batch Edit dimensions and class attributes — local 1.18.0

Date: 2026-10-23. Scope: the selected cuboid track in a user-selected inclusive range, with explicit handling of track-wide attributes. No live CVAT annotation changes or server Save were performed.

## Implemented

- The former Batch Size Update button opens **Batch Edit**. Its **Kích thước box** function keeps the prior size-edit algorithm and boundary protection. **Thuộc tính theo class** reads native label attribute definitions and current effective values, with a checkbox for each field to change.
- Attribute inputs support native select/radio, checkbox, text and number schemas. Backend validates field membership, enumerated/boolean values and numeric limits/steps. Boolean false is not mistaken for an omitted value.
- Mutable attributes such as `pose` and `ride_state` are changed in the chosen interval. Existing keyframes may be deliberately edited. Outside frames are skipped and reported. Nonselected attributes, geometry, label, visibility and object IDs are retained.
- End-boundary effective attribute values are captured before edits and restored at `to+1`, including existing keyframes with no explicit value for a chosen attribute. Range writes precede boundary restoration because native attribute saves do nothing when the requested value already matches the current effective value.
- Immutable attributes such as `age` in the supplied job schema affect the whole track. Both preview/UI and backend require explicit whole-track acknowledgement. The implementation does not split/recreate the track or pretend a frame range can change native attribute mutability.
- Writes use native ObjectState.save(), with preview invalidation, complete write/boundary preflight, stale detection, protected-state guards, native history, render refresh and partial-error reporting. On failure after range changes, the controller attempts end-boundary restoration and reports any restoration failure. Native Undo remains per operation; there is no atomic batch rollback guarantee.
- The existing BATCH_SIZE protocol and factory names remain internal compatibility details; the product UI is Batch Edit. A batch edit changes either dimensions or selected attributes per preview/apply cycle.

## Evidence

- Node suites: **257 passed, 6 optional skipped, 0 failed** (263 total).
- Ten existing dimension-controller tests continue to pass.
- Seven new native-model attribute tests cover mutable fields, immutable age acknowledgement, selected-only updates, exact geometry/ID preservation, whole-range Undo, existing end keys, numeric/text schemas, invalid inputs, stale/protected states, outside skips, no-op previews and partial-error boundary restoration.
- Edge browser fixtures: **17 passed** across Batch Edit attributes, existing size editing and annotation I/O. UI tests verify schema controls, explicit false, preview invalidation, range payloads, whole-track age messaging/acknowledgement and successful Apply summaries.
- UI screenshot inspected: `dist/batch-edit-attributes.local.png` (synthetic fixture; not live CVAT evidence).
- Local 1.18.0 installer self-test passed with mocked registry; real browser installation was not tested. All 24 extension ZIP files match source bytes, and all three packaged asset SHA-256 checksums were verified. Report: `dist/batch-edit-selftest.local.json`.
- Logs: `batch-edit-unit.local.log`, `batch-edit-browser.local.log`, `batch-edit-build.local.log` (ignored local artifacts).

## Limits

This is offline/native-model and browser-fixture evidence. Native Apply, Undo/Redo and persistence on real job 1224 remain unverified in this change. The controller cannot make an immutable attribute frame-specific without changing the project's schema or object model. Boundary restoration is best effort after a native error, and failures are explicitly surfaced. Verification was completed before the requested push/publication of version 1.18.0.
