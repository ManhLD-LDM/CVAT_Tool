# Separate online update and local reload — 1.17.1

Date: 2026-10-21. Local implementation and fixture verification only; no live CVAT job changed.

The HUD always displays **Update online** and **Reload local**. Startup still checks GitHub once, with no periodic polling. Update online checks again and installs a newer stable release through the existing updater/save guards; current/ahead/unavailable results do not reload or downgrade the installed copy. Reload local goes directly to guarded local reload, without a release check or native updater dependency, even while the startup GitHub request is pending. It reloads the browser's currently loaded extension folder; it does not copy a different checkout or pull Git.

Existing native save/verify, multi-tab, pending-import and open-dialog protections remain. Pending CVAT edits are saved and confirmed clean before reload. Save failure does not trigger an unsafe direct page refresh. Both action buttons disable during an active action. README and distribution version updated.

Verification:

- Node suite excluding the separate session transport suite: **224 passed, 3 optional skipped, 0 failed**.
- Updated browser updater suite: **7 passed**, covering online installation, all four release states for local reload, no downgrade/reload for current/ahead/unavailable online results, hanging startup checks, save failures, native save guards and pending import protection.
- The four Batch Size Update browser tests also passed during this change.
- Added service test confirms local reload makes zero GitHub requests and zero native updater calls when both are unavailable, while retaining save/verify messages.
- Rebuilt extension bundles, ZIP and standalone installer for 1.17.1. Installer self-test passed with mocked registry; archive buttons/version and all asset checksums verified.

Not verified here: authenticated CVAT save/reload, actual native browser registration or a published GitHub release. This version remains a local build.
