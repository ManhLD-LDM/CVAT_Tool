# CVAT 3D TOOL 1.22.0 — local testing guide

Implemented on 2026-10-24. This build includes all three requested parts and mouse-capable control configuration.

## Load the build

Use the unpacked folder `dist/extension`, or extract `dist/CVAT-3D-Tool-Extension-1.22.0.zip` into a dedicated folder. In Edge/Chrome's extensions page, enable Developer mode and load that folder. Disable any older copy of this tool to avoid two extensions controlling the same CVAT page. If already loading the source `extension` folder, reload that extension instead. Save pending CVAT changes before refreshing the job page.

Confirm **v1.22.0** in the tool footer. This task does not replace a separately installed managed extension, install a new browser extension, push commits, or publish a release.

Existing saved keyboard assignments are preserved. Choose **Cài đặt → Shortcuts & controls → Reset all controls** if you want the new default R/E/M bindings. Other settings need not be reset.

## Controls and annotation checks

| Default | View | Expected behavior |
| --- | --- | --- |
| R + left-drag | 3D | Circle around the selected box's projected center to rotate yaw. Live preview, one native write on mouse release. Escape or releasing the held key cancels. |
| E | Top / Side / Front | Nearest projected corner moves to the cursor. Opposite corner stays anchored; visible dimensions resize and hidden dimension stays fixed. Crossing the opposite corner or shrinking below 0.1 m is refused. |
| M | 3D | Aim Top view at the LiDAR point under the cursor. No annotation edit; a brief aim marker appears. |
| M | Top | Place box center at cursor XY, preserving Z, dimensions and orientation. No automatic refinement or snapping. |
| Alt+Shift+B | Applicable viewport | Execute the replacement Auto Adjust using configured stages. |

Controls ignore typing and open dialogs. Move the cursor over the viewport and remove focus from form fields before testing a shortcut. Locked/ground-truth boxes and review workspaces remain protected. Verify native Undo and Save/reload on a test job.

In **Shortcuts & controls**, select a binding and use the capture area. Release a key to record a keyboard shortcut; hold a key while clicking or scrolling to record a combination. Left/middle/right/back/forward buttons and wheel up/down are supported. Drag actions require a mouse button and can use a held key or modifiers. Clear, Reset and duplicate checks apply to mouse bindings too. Native browser/OS-reserved inputs may be intercepted before the page receives them.

## Auto Adjust

In **Box → Auto Adjust options**, Move to mouse and Ground snap start enabled; both push directions start Off. With placement enabled, hover Top view before using the shortcut. M in 3D only aims Top view; it does not place the box.

Processing order is exact mouse placement, ground snap, longitudinal push, lateral push. Forward closes the rear gap; Left closes the right-side gap. Directions are relative to the box's own heading. Pushes use a supported object cluster, remove a ground band of at least 20 cm (increased for uncertain planes), exclude neighboring boxes, and refuse ambiguous or oversized support. Push fitting requires upright boxes. The dimensions and all rotation components remain unchanged.

The complete result is calculated before a native write. Missing pointer, unreliable ground, unsupported contact, stale geometry and excessive ground movement stop the operation without committing preceding stages. With Ground snap disabled, pushing still needs reliable ground to exclude road returns. Ground movement retains the existing 1.5 m guard.

## Appearance and reference images

**Camera → Appearance** changes the shared viewport background through color picker or HEX. Turn off Follow CVAT to set Top/Side/Front point size from 1–32 px. The perspective point material remains independent. Settings reapply after viewport reconstruction; Reset restores native behavior.

**Camera → Reference images** opens the floating image window. Auto selects using the selected/locked box center, otherwise the camera look-at target, relative to the LiDAR reset origin. Horizontal bearing controls the image; orbiting around a selected box does not switch its direction. A small boundary dead band avoids flickering. Manual selection is also available.

**Configure wheel** opens a separate configuration window. Click a sector, select its context-image thumbnail, edit its name/angle, or drag the boundary between adjacent directions. Add/Remove preserves remaining direction centers and recalculates coverage boundaries. Apply persists the configuration per server/task; Cancel discards it. Configure vehicle-forward heading clockwise from data +X when needed. Default direction assignments follow the requested eight-image order; the native context-image enumeration must match that order, so verify it against the actual dataset. No external image source is required.

Missing images, missing camera APIs and undefined bearings produce an explanatory state. Loading a new frame hides the previous frame's image. Context images are read through native `job.frames.contextImage`, converted to JPEG previews with a maximum edge of 1600 px, and cached for the current frame. Native image bitmaps remain owned by CVAT.

## Ground selection fix

With **Use origin ground OFF**, Ground Snap and inspection use only local measured road. Missing reliable road produces an explanation and no annotation edit. There is no implicit fallback to road near the LiDAR origin. With the option ON, the existing fixed reset-reference height plus signed offset applies. The new Auto Adjust and Auto-Fit respect the explicit source choice.

## Verification

- Node unit suite: **312 passed, 6 skipped**, zero failures. The skipped cases were existing tests requiring external fixtures.
- Full Edge browser regression suite: **88 passed**, covering batch review/editing, annotation import/export, native adapter fixtures, UI, controls, context images, updates and work logging.
- Subsequent focused final-bundle checks: **18 passed**; direction-wheel layout recheck: **3 passed**.
- Python annotation CLI regression suite: **11 passed**, run with `C:\Users\admin\miniconda3\python.exe` against a local mock server.
- Both the canonical Node build and Python build entry point produce complete extension bundles. The offline demo was rebuilt.
- Screenshots: `appearance-1.22.0.png` and `reference-wheel-1.22.0.png` in this directory.

Tests use native-model fixtures and local browser pages. Actual point-cloud accuracy, installed CVAT compatibility, mouse hardware buttons, and native Save/reload still need the user's live acceptance testing. No live job was mutated during implementation.
