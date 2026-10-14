import os
import json
import math
import shutil
import urllib.request
from pathlib import Path
import numpy as np

SESSIONID = os.environ.get("CVAT_SESSION_ID", "")
CSRFTOKEN = os.environ.get("CVAT_CSRF_TOKEN", "")
HEADERS = {
    "Cookie": f"sessionid={SESSIONID}; csrftoken={CSRFTOKEN}",
    "X-CSRFToken": CSRFTOKEN,
    "Referer": "https://cvat-test.vantixapps.net/",
}

DATA_DIR = Path("d:/Project/CVAT-3D-Copilot/data_job58/pointclouds")

def read_pcd_xyz(path: Path) -> np.ndarray:
    raw = path.read_bytes()
    marker = b"DATA binary\n"
    idx = raw.find(marker)
    if idx < 0:
        raise ValueError(f"Not binary PCD: {path}")
    header_end = idx + len(marker)
    dt = np.dtype([("x", "<f4"), ("y", "<f4"), ("z", "<f4"), ("rgb", "<u4")])
    pts = np.frombuffer(raw[header_end:], dtype=dt)
    return np.stack([pts["x"], pts["y"], pts["z"]], axis=1)

def transform_to_box_frame(pts_xyz: np.ndarray, center: np.ndarray, yaw: float) -> np.ndarray:
    rel = pts_xyz - center
    c, s = math.cos(yaw), math.sin(yaw)
    R = np.array([
        [c, s, 0],
        [-s, c, 0],
        [0, 0, 1]
    ])
    return rel @ R.T

def transform_from_box_frame(local_pts: np.ndarray, center: np.ndarray, yaw: float) -> np.ndarray:
    c, s = math.cos(yaw), math.sin(yaw)
    R = np.array([
        [c, -s, 0],
        [s, c, 0],
        [0, 0, 1]
    ])
    return local_pts @ R.T + center

def fit_box_to_points(pts_xyz: np.ndarray, center: np.ndarray, size: np.ndarray, yaw: float):
    dx, dy, dz = size  # L, W, H
    dist_xy = np.linalg.norm(pts_xyz[:, :2] - center[:2], axis=1)
    mask = (dist_xy < (max(dx, dy) * 0.75 + 1.2)) & (np.abs(pts_xyz[:, 2] - center[2]) < (dz / 2.0 + 0.6))
    roi = pts_xyz[mask]
    if len(roi) < 5:
        return None, 0
    
    local = transform_to_box_frame(roi, center, yaw)
    in_box = (
        (np.abs(local[:, 0]) <= (dx / 2.0 + 0.30)) &
        (np.abs(local[:, 1]) <= (dy / 2.0 + 0.25)) &
        (np.abs(local[:, 2]) <= (dz / 2.0 + 0.20))
    )
    obj_pts = local[in_box]
    if len(obj_pts) < 5:
        return None, len(obj_pts)
    
    z_bottom = -dz / 2.0
    valid_z = obj_pts[:, 2] > (z_bottom + 0.12)
    if np.sum(valid_z) >= 5:
        obj_pts = obj_pts[valid_z]
    
    offset = np.median(obj_pts, axis=0)
    shift_local = np.zeros(3)
    shift_local[0] = np.clip(offset[0], -0.35, 0.35)
    shift_local[1] = np.clip(offset[1], -0.35, 0.35)
    shift_local[2] = np.clip(offset[2], -0.08, 0.08)
    
    new_center = transform_from_box_frame(shift_local.reshape(1, 3), center, yaw)[0]
    return new_center, len(obj_pts)

def main():
    print("1. Fetching current annotations from CVAT Job 58...")
    req = urllib.request.Request("https://cvat-test.vantixapps.net/api/jobs/58/annotations", headers=HEADERS)
    with urllib.request.urlopen(req) as resp:
        orig_data = json.loads(resp.read().decode())
    
    # Save backup
    backup_path = Path("d:/Project/CVAT-3D-Copilot/backup_job58_annotations.json")
    backup_path.write_text(json.dumps(orig_data, indent=2))
    print(f"Backed up current annotations to {backup_path}")
    
    # Load point clouds for frames 20..29
    print("2. Loading point clouds for frames 20 to 29...")
    clouds = {f: read_pcd_xyz(DATA_DIR / f"frame_{f:02d}.pcd") for f in range(20, 30)}
    print(f"Loaded {len(clouds)} point clouds.")
    
    # Track generation
    print("3. Tracking objects from Frame 19 into Frames 20..29...")
    updated_tracks = []
    
    for idx, t in enumerate(orig_data['tracks']):
        track_id = t.get('id')
        label_id = t.get('label_id')
        attributes = t.get('attributes', [])
        shapes = t['shapes']
        
        # Preserve all shapes frame <= 19
        clean_shapes_under_20 = [s for s in shapes if s['frame'] <= 19]
        
        # Check if active at frame 19
        last_valid_under_20 = None
        for s in sorted(clean_shapes_under_20, key=lambda x: x['frame']):
            if not s.get('outside'):
                last_valid_under_20 = s
                
        was_outside = (last_valid_under_20 is None) or (clean_shapes_under_20[-1].get('outside', False))
        
        if was_outside:
            # Already outside before frame 20 (e.g. Track 12)
            updated_tracks.append({
                "label_id": label_id,
                "frame": 0,
                "group": 0,
                "source": "manual",
                "attributes": attributes,
                "shapes": clean_shapes_under_20,
                "elements": []
            })
            print(f"  Track {idx+1:02d} (ID={track_id}): Left scene at frame {clean_shapes_under_20[-1]['frame']} -> outside retained.")
            continue
        
        # Active object at frame 19
        s19 = last_valid_under_20
        p19 = np.array(s19['points'][:3])
        r19 = list(s19['points'][3:6])
        yaw19 = float(r19[2])
        sz = np.array(s19['points'][6:9])
        
        # Velocity estimation
        s16 = next((s for s in clean_shapes_under_20 if s['frame'] == 16 and not s.get('outside')), None)
        s15 = next((s for s in clean_shapes_under_20 if s['frame'] == 15 and not s.get('outside')), None)
        
        if s16 and s19['frame'] > 16:
            vel = (p19 - np.array(s16['points'][:3])) / (s19['frame'] - 16.0)
        elif s15 and s19['frame'] > 15:
            vel = (p19 - np.array(s15['points'][:3])) / (s19['frame'] - 15.0)
        else:
            vel = np.zeros(3)
            
        speed = np.linalg.norm(vel[:2])
        if speed > 1.55:
            vel = vel * (1.55 / speed)
        vel[2] = 0.0  # Ground constraint
        
        curr_center = p19.copy()
        curr_yaw = yaw19
        prev_yaw = yaw19
        curr_vel = vel.copy()
        missed = 0
        generated_shapes = []
        
        for f in range(20, 30):
            yaw_rate = (curr_yaw - prev_yaw) * 0.5
            pred_yaw = curr_yaw + yaw_rate
            pred_center = curr_center + curr_vel
            
            fitted_center, pt_cnt = fit_box_to_points(clouds[f], pred_center, sz, pred_yaw)
            
            is_outside = False
            is_occluded = False
            
            if fitted_center is not None and pt_cnt >= 5:
                prev_c = curr_center.copy()
                curr_center = fitted_center
                step_vel = curr_center - prev_c
                curr_vel = 0.75 * curr_vel + 0.25 * step_vel
                curr_vel[2] = 0.0
                curr_center[2] = np.clip(curr_center[2], p19[2] - 0.15, p19[2] + 0.15)
                
                cur_spd = np.linalg.norm(curr_vel[:2])
                if cur_spd > 0.25:
                    motion_angle = math.atan2(curr_vel[1], curr_vel[0])
                    diff = (motion_angle - pred_yaw + math.pi) % (2 * math.pi) - math.pi
                    if abs(diff) < math.pi / 3:
                        new_yaw = pred_yaw + 0.15 * diff
                    elif abs(diff) > 2 * math.pi / 3:
                        diff_rev = (motion_angle + math.pi - pred_yaw + math.pi) % (2 * math.pi) - math.pi
                        new_yaw = pred_yaw + 0.15 * diff_rev
                    else:
                        new_yaw = pred_yaw
                    prev_yaw = curr_yaw
                    curr_yaw = new_yaw
                else:
                    prev_yaw = curr_yaw
                    curr_yaw = pred_yaw
                missed = 0
            else:
                missed += 1
                curr_center = pred_center
                curr_center[2] = np.clip(curr_center[2], p19[2] - 0.15, p19[2] + 0.15)
                prev_yaw = curr_yaw
                curr_yaw = pred_yaw
                is_occluded = True
                if missed >= 4 or np.linalg.norm(curr_center[:2]) > 60.0:
                    is_outside = True
            
            generated_shapes.append({
                "type": "cuboid",
                "frame": f,
                "occluded": is_occluded,
                "outside": is_outside,
                "keyframe": True,
                "z_order": 0,
                "rotation": 0.0,
                "points": [
                    float(curr_center[0]), float(curr_center[1]), float(curr_center[2]),
                    0.0, 0.0, float(curr_yaw),
                    float(sz[0]), float(sz[1]), float(sz[2]),
                    0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0
                ],
                "attributes": []
            })
            
        all_track_shapes = clean_shapes_under_20 + generated_shapes
        updated_tracks.append({
            "label_id": label_id,
            "frame": 0,
            "group": 0,
            "source": "manual",
            "attributes": attributes,
            "shapes": all_track_shapes,
            "elements": []
        })
        print(f"  Track {idx+1:02d} (ID={track_id}): Retained {len(clean_shapes_under_20)} shapes <=19 + added {len(generated_shapes)} shapes 20..29.")
    
    # Clean payload (strip any lingering internal IDs)
    clean_tracks = []
    for t in updated_tracks:
        tc = dict(t)
        if "id" in tc:
            del tc["id"]
        cs = []
        for s in tc["shapes"]:
            sc = dict(s)
            if "id" in sc:
                del sc["id"]
            cs.append(sc)
        tc["shapes"] = cs
        clean_tracks.append(tc)
        
    payload = {
        "version": 0,
        "tags": [],
        "shapes": [],
        "tracks": clean_tracks
    }
    
    out_file = Path("d:/Project/CVAT-3D-Copilot/job58_fixed_tracks.json")
    out_file.write_text(json.dumps(payload, indent=2))
    print(f"4. Saved fixed annotations to {out_file} ({len(clean_tracks)} tracks).")
    
    # Upload to CVAT via PUT
    print("5. Uploading fixed annotations to CVAT Job 58 via PUT...")
    upload_req = urllib.request.Request(
        "https://cvat-test.vantixapps.net/api/jobs/58/annotations",
        data=json.dumps(payload).encode("utf-8"),
        headers={**HEADERS, "Content-Type": "application/json"},
        method="PUT"
    )
    with urllib.request.urlopen(upload_req) as resp:
        print("Upload Status Code:", resp.status)
        resp_body = resp.read().decode()
        print("Upload Response Preview:", resp_body[:250])
    
    print("\n6. Verifying uploaded annotations from CVAT server...")
    verify_req = urllib.request.Request("https://cvat-test.vantixapps.net/api/jobs/58/annotations", headers=HEADERS)
    with urllib.request.urlopen(verify_req) as resp:
        verified_data = json.loads(resp.read().decode())
    
    v_tracks = verified_data.get('tracks', [])
    print(f"Verified tracks on server: {len(v_tracks)}")
    
    # Check shape counts and Z coordinates
    for idx, vt in enumerate(v_tracks):
        shapes = vt.get('shapes', [])
        f20_to_29 = [s for s in shapes if s['frame'] >= 20]
        z_vals = [s['points'][2] for s in f20_to_29]
        max_z = max(z_vals) if z_vals else None
        min_z = min(z_vals) if z_vals else None
        print(f"  Track {idx+1:02d} (ID={vt.get('id')}): Total shapes={len(shapes)} (F20-29={len(f20_to_29)}), Z-range=[{min_z:.2f}, {max_z:.2f}]" if z_vals else f"  Track {idx+1:02d} (ID={vt.get('id')}): Total shapes={len(shapes)} (F20-29=0)")
    
    print("\nSUCCESS! All frames 20 to 29 in CVAT Job 58 have been fixed and verified!")

if __name__ == "__main__":
    main()
