# CVAT 3D TOOL Windows updater

Requires Windows, Edge/Chrome developer mode and Python 3.10+ (standard library only). This is an unpacked-extension updater, not a browser-store automatic-update mechanism.

1. Extract **CVAT-3D-Tool-Updater-Windows.zip** to a normal folder.
2. Run PowerShell in that folder: `powershell -NoProfile -ExecutionPolicy Bypass -File .\install.ps1`.
3. Follow the installer: Load unpacked `%LOCALAPPDATA%\CVAT-3D-Tool\extension`, disable the old copy, and paste the managed extension's ID. No admin rights required. Moving to this folder changes an unpacked extension's ID, so configure presets/shortcuts again if necessary. The old copy's settings remain with the old ID.
4. Reload the managed extension once, then open CVAT. HUD checks GitHub once on opening and when Reload is clicked. There is no polling timer.

The updater only writes its managed installation. It never pulls Git, edits the source checkout, reads CVAT sessions, or imports/exports annotations. The extension saves annotations through native CVAT APIs before reloading; failure/unknown save state blocks reload. Multiple dirty editors of the same job also block reload. Close Batch/settings dialogs before retrying.

GitHub repo is fixed to `ManhLD-LDM/CVAT_Tool`. Only the latest stable release is considered. The release must include `CVAT-3D-Tool-Extension-VERSION.zip` and GitHub's SHA-256 asset digest or `SHA256SUMS.txt`. Missing releases, a private repo without public releases, rate limits, invalid ZIPs/checksums or network failures show “cannot check/update”, never “up to date”. No GitHub token or CVAT cookie is sent.

Updates are staged and validated before changing files. The old extension directory is retained under `backups\VERSION-TOKEN`. A failed directory swap restores the previous directory. Host code itself is not remotely replaced; rerun a newer installer if its protocol needs upgrading. Staged packages and backups are retained locally for diagnosis and can be removed while the updater is idle. A stale `update.lock` after a crashed host requires confirming no updater process is running before manually removing that file.

After an annotation import, reload the imported result using the import screen's existing reload action. Never save the stale pre-import editor over the imported data. This updater does not add autosave-after-import or a timer that silently saves regular editing.

Native Messaging framing and protocol are fixture-tested. Real browser host registration/reload must still be verified on the installed managed copy. Browser-native Refresh/close and other extensions are outside this save-before-reload guard.
