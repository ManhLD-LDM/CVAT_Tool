# Local workload ledger / daily KPI — 1.21.0

Date: 2026-10-24. This task implements personal workload tracking in the floating extension. No live CVAT annotation import, Apply, Save or reload was performed. No commit, push or GitHub release was requested or performed.

## User flow

Open **Công việc**, select the local calendar day, choose a target and unit, then **Vào ca**. The default unit is unique changed cuboid annotation frames; the alternative is changed objects. **Ra ca** ends observation. Targets, completed/remaining units, touched frames, saved indications, estimated activity time and explicit Batch Review decisions are shown separately. Per-job/#clientID rows list affected frames, with ID filtering, pagination and daily CSV export. Shift start/end history is expandable. A day with no target is not automatically marked complete.

## Counting contract

- Only observed work during an open shift contributes. The initial annotation document is a baseline, so loading an AI prelabel or opening/navigating a job does not create completed work. An object/frame contributes at most once per day despite repeated edits.
- Counts concern native cuboid annotation anchors/shape records, not every interpolated frame influenced by one key. Global class/attribute metadata contributes to the object unit rather than multiplying cuboids. This is a self-set reference target, not team quality acceptance or a labor-effort measurement.
- Net changed and historically touched counts are separate. Undo back to the day's initial observed state reduces net KPI. Deletion/outside does not increase completed cuboids. Reopening/re-entering a shift reconciles existing records against current hashes: restored baseline reduces KPI, unknown external state is marked uncertain and excluded.
- Technical boundary anchors added by Batch Edit are excluded from human-work quantity. The watcher waits until tool batch writes finish before comparing their final document. Tool imports reset baselines and do not count imported data as manual annotation work.
- Automatic Batch Review proposals count accepted only after complete successful Apply. Explicit Protect counts rejection once per review episode. Unchecked cards, closed previews, manual drafts and failed/partial Apply do not silently become accept/reject events.
- Saved status means a matching fingerprint was observed while native CVAT reported no unsaved annotation changes. It does not independently verify the server or quality. The post-save/pre-reload hook flushes the ledger again so new database-ID aliases and saved indications can persist before reload. Errors release the reload hold and block automatic reload.
- Activity time is a heartbeat estimate for focused, recently interacted-with pages. Idle/browser downtime is not billed as elapsed shift hours. Local-day boundaries split activity correctly. There is no retroactive reconstruction of edits that were not observed.

## Implementation and data boundaries

- `work_log.js` contains coordinate-free native-document fingerprints, day summaries, a serialized persistence service and reducer. `work_log_ui.js` is bundled into the isolated panel. `GET_WORK_DOCUMENT` reads native `job.annotations.export()` without native saves, selections, point-cloud loads or REST annotation writes. Large read responses are excluded from bridge response caching.
- Native geometry is normalized to 1e-6 for stable hashes; attribute order is canonicalized. Server/job/entity identity separates same-number IDs. Temporary new-object identities can alias to actual native database IDs after Save; this is statistical identity handling, not annotation import remapping. The displayed #clientID remains attached to observed work.
- Worker messages require the extension sender and a real job URL. Origin/job context comes from the sender tab, not caller-supplied metadata. Each CVAT origin has a separate ledger, shifts and daily goals. A tab on another origin cannot retrieve that ledger through the work API.
- Records are local to the browser profile and server, including accounts using that same profile/server. There is no cloud synchronization, telemetry upload, cookie capture, keystroke-content storage or annotation-coordinate storage. Removing the extension/profile can remove its history. CSV reports are user-triggered.
- Storage is partitioned by day; each change loads the relevant days rather than all past records. `unlimitedStorage` supports ongoing local history without the default extension storage quota. Persistence failures are visible; the UI does not silently claim successful recording.
- Work logic is bundled into the generated MAIN, ISOLATED and worker scripts. Worker source now lives in `session_worker_source.js`; rebuild with `node scripts/build-extension.cjs`. The release retains the existing **24-file allowlist**, preserving the native updater's package layout. No cached job/work ledger is packaged.

## Verification

- **295 Node tests pass, 6 skipped** (301 cases). Covers unique counts, same-number IDs, undo/redo, deletion, global attributes, invalid goals/dates, saved hashes, native ID aliases, discarded edits, uncertainty, shift gating, explicit decisions, heartbeat/day rollover, concurrent service calls, restart, quota errors, per-origin isolation and read-only adapter behavior during reload hold.
- Full browser regression sweep: **90/90 pass**. After the final storage-isolation, shift-reentry and post-save flush refinements, **15/15 focused browser tests pass** (7 workload + 8 update/reload). One new reload test is included in that focused run; these runs cover 91 distinct browser cases, not a claim of one 91-case final sweep.
- Workload browser cases cover native edit observations, repeated edits, Undo, navigation, shift stop/reentry, persistence, matching saved state, CSV download, date-specific goals, storage errors, disabled demo tracking, explicit automatic suggestion decisions, import exclusion and Batch Edit boundary exclusion.
- **29 Python tests pass**, using local fixtures/mock HTTP endpoints for CLI, installer and updater. No production import/export was exercised.
- [Implemented KPI UI](work-kpi-1.21.0.png) was visually inspected. It is explicitly marked an **offline test fixture**, not a live screenshot of job 1224.
- Installer, source-matching ZIP/checksum and self-test results are verified separately below. Live deployment acceptance remains open.

## Package verification

The local 1.21.0 extension ZIP contains 24 allowlisted files matching source bytes. All three distributed assets match SHA256SUMS. Windows setup self-test passes for 1.21.0 and the bundled host protocol; registry writes are mocked and browser installation is not tested.

## Remaining live acceptance

Install/reload the local extension after saving work. On a disposable native cuboid track, set a small target, enter a shift, edit the same frame repeatedly, edit another frame, Undo, Save and reopen. Compare object/frame totals and saved indicators with CVAT. Confirm tracking overhead and native deployment export availability on real jobs. Offline fixtures do not establish those live results or the team's official KPI policy.
