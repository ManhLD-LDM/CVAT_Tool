import os
import json
import math
import time
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

def get_initial_tracks():
    req = urllib.request.Request("https://cvat-test.vantixapps.net/api/jobs/58/annotations", headers=HEADERS)
    with urllib.request.urlopen(req) as resp:
        ann = json.loads(resp.read().decode())
    return ann.get("tracks", [])

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

def fit_cluster_in_box(pts_xyz: np.ndarray, center: np.ndarray, size: np.ndarray, yaw: float):
    dx, dy, dz = size  # L, W, H
    # 1. Filter points in ROI around center
    dist_xy = np.linalg.norm(pts_xyz[:, :2] - center[:2], axis=1)
    mask = dist_xy < (max(dx, dy) * 0.75 + 1.2)
    roi_pts = pts_xyz[mask]
    if len(roi_pts) < 4:
        return None, 0
    
    # 2. Local coordinates
    local = transform_to_box_frame(roi_pts, center, yaw)
    
    # 3. Filter points inside box + small margin
    in_box = (
        (np.abs(local[:, 0]) <= (dx / 2.0 + 0.35)) &
        (np.abs(local[:, 1]) <= (dy / 2.0 + 0.35)) &
        (np.abs(local[:, 2]) <= (dz / 2.0 + 0.3))
    )
    obj_pts = local[in_box]
    if len(obj_pts) < 4:
        return None, len(obj_pts)
    
    # Filter out ground points (bottom 10%)
    z_bottom = -dz / 2.0
    valid_z = obj_pts[:, 2] > (z_bottom + 0.12)
    if np.sum(valid_z) >= 4:
        obj_pts = obj_pts[valid_z]
    
    # Robust cluster centroid offset
    median_offset = np.median(obj_pts, axis=0)
    
    # Bounded shift to prevent jumps (max 0.45m per frame at ~10Hz)
    shift_local = np.clip(median_offset, -0.45, 0.45)
    
    # Z shift: keep bottom aligned to ground
    shift_local[2] = np.clip(median_offset[2], -0.2, 0.2)
    
    new_center = transform_from_box_frame(shift_local.reshape(1, 3), center, yaw)[0]
    return new_center, len(obj_pts)

def run_tracker_pipeline(total_frames: int = 30):
    print("Fetching existing tracks on Frame 0...")
    existing_tracks = get_initial_tracks()
    print(f"Found {len(existing_tracks)} initial tracks.")
    
    # Load all point clouds
    print(f"Loading {total_frames} point clouds...")
    clouds = []
    for f_idx in range(total_frames):
        pcd_path = DATA_DIR / f"frame_{f_idx:02d}.pcd"
        while not pcd_path.exists() or pcd_path.stat().st_size < 1000:
            print(f"Waiting for frame_{f_idx:02d}.pcd...")
            time.sleep(2)
        clouds.append(read_pcd_xyz(pcd_path))
    print(f"Loaded all {len(clouds)} point clouds into memory.")
    
    updated_tracks = []
    
    for t_idx, track in enumerate(existing_tracks):
        track_id = track.get("id")
        label_id = track.get("label_id")
        attributes = track.get("attributes", [])
        init_shape = track["shapes"][0]
        init_pts = init_shape["points"]
        
        center_0 = np.array(init_pts[:3], dtype=float)
        rot_0 = list(init_pts[3:6])
        yaw_0 = float(rot_0[2])
        size = np.array(init_pts[6:9], dtype=float)  # L, W, H invariant
        
        shapes = []
        
        # Frame 0 shape (preserve exact manual baseline)
        shapes.append({
            "type": "cuboid",
            "frame": 0,
            "occluded": False,
            "outside": False,
            "keyframe": True,
            "z_order": 0,
            "rotation": 0.0,
            "points": list(init_pts),
            "attributes": []
        })
        
        curr_center = center_0.copy()
        curr_yaw = yaw_0
        prev_center = center_0.copy()
        missed_frames = 0
        
        # Track across frames 1..29
        for f in range(1, total_frames):
            pts = clouds[f]
            
            # Estimate velocity
            vel = curr_center - prev_center if f > 1 else np.zeros(3)
            pred_center = curr_center + vel
            
            new_center, pt_count = fit_cluster_in_box(pts, pred_center, size, curr_yaw)
            
            if new_center is not None and pt_count >= 5:
                # Good detection
                prev_center = curr_center.copy()
                curr_center = new_center
                
                # Yaw update if moving fast enough
                speed = np.linalg.norm(vel[:2])
                if speed > 0.15:
                    motion_yaw = math.atan2(vel[1], vel[0])
                    # Ensure heading aligns with general orientation
                    diff = (motion_yaw - curr_yaw + math.pi) % (2 * math.pi) - math.pi
                    if abs(diff) < math.pi / 2:
                        curr_yaw = curr_yaw * 0.85 + motion_yaw * 0.15
                
                shapes.append({
                    "type": "cuboid",
                    "frame": f,
                    "occluded": False,
                    "outside": False,
                    "keyframe": True,
                    "z_order": 0,
                    "rotation": 0.0,
                    "points": [
                        float(curr_center[0]), float(curr_center[1]), float(curr_center[2]),
                        0.0, 0.0, float(curr_yaw),
                        float(size[0]), float(size[1]), float(size[2]),
                        0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0
                    ],
                    "attributes": []
                })
                missed_frames = 0
            elif missed_frames < 4:
                # Occluded / sparse -> extrapolate
                missed_frames += 1
                prev_center = curr_center.copy()
                curr_center = pred_center
                shapes.append({
                    "type": "cuboid",
                    "frame": f,
                    "occluded": True,
                    "outside": False,
                    "keyframe": True,
                    "z_order": 0,
                    "rotation": 0.0,
                    "points": [
                        float(curr_center[0]), float(curr_center[1]), float(curr_center[2]),
                        0.0, 0.0, float(curr_yaw),
                        float(size[0]), float(size[1]), float(size[2]),
                        0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0
                    ],
                    "attributes": []
                })
            else:
                # Object left scene
                shapes.append({
                    "type": "cuboid",
                    "frame": f,
                    "occluded": False,
                    "outside": True,
                    "keyframe": True,
                    "z_order": 0,
                    "rotation": 0.0,
                    "points": [
                        float(curr_center[0]), float(curr_center[1]), float(curr_center[2]),
                        0.0, 0.0, float(curr_yaw),
                        float(size[0]), float(size[1]), float(size[2]),
                        0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0
                    ],
                    "attributes": []
                })
        
        updated_tracks.append({
            "id": track_id,
            "label_id": label_id,
            "frame": 0,
            "group": 0,
            "source": "semi-auto",
            "attributes": attributes,
            "shapes": shapes,
            "elements": []
        })
        print(f"Track {t_idx+1}/{len(existing_tracks)} (ID {track_id}): generated {len(shapes)} frame shapes.")
    
    clean_tracks = []
    for t in updated_tracks:
        track_copy = dict(t)
        if "id" in track_copy:
            del track_copy["id"]
        clean_shapes = []
        for s in track_copy.get("shapes", []):
            s_copy = dict(s)
            if "id" in s_copy:
                del s_copy["id"]
            clean_shapes.append(s_copy)
        track_copy["shapes"] = clean_shapes
        clean_tracks.append(track_copy)

    payload = {
        "version": 0,
        "tags": [],
        "shapes": [],
        "tracks": clean_tracks
    }
    
    out_file = Path("d:/Project/CVAT-3D-Copilot/job58_prelabel_tracks.json")
    out_file.write_text(json.dumps(payload, indent=2))
    print(f"Saved pre-labeled payload to {out_file} ({len(updated_tracks)} tracks, total {sum(len(t['shapes']) for t in updated_tracks)} shapes).")
    
    # Upload to CVAT via PUT
    print("Uploading updated tracks to Job 58 via API PUT...")
    req = urllib.request.Request(
        "https://cvat-test.vantixapps.net/api/jobs/58/annotations",
        data=json.dumps(payload).encode("utf-8"),
        headers={**HEADERS, "Content-Type": "application/json"},
        method="PUT"
    )
    with urllib.request.urlopen(req) as resp:
        print("Upload Status:", resp.status)
        resp_data = resp.read().decode()
        print("Upload Response:", resp_data[:200])
        print("SUCCESSFULLY UPLOADED TO JOB 58!")

if __name__ == "__main__":
    run_tracker_pipeline(30)
