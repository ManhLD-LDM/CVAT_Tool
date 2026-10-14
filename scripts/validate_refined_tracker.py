import json
import math
from pathlib import Path
import numpy as np

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
    mask = (dist_xy < (max(dx, dy) * 0.75 + 1.2)) & (np.abs(pts_xyz[:, 2] - center[2]) < (dz/2 + 0.6))
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

# Load point clouds 20..29
clouds = {f: read_pcd_xyz(DATA_DIR / f"frame_{f:02d}.pcd") for f in range(20, 30)}

with open('d:/Project/CVAT-3D-Copilot/current_job58_annotations.json') as f:
    orig_data = json.load(f)

# Build updated tracks
new_tracks = []
all_stats = []

for idx, t in enumerate(orig_data['tracks']):
    track_id = t.get('id')
    label_id = t.get('label_id')
    shapes = t['shapes']
    
    # 1. Keep all shapes frame <= 19 exactly as they are
    clean_shapes_under_20 = [s for s in shapes if s['frame'] <= 19]
    
    # Find last valid shape under 20
    last_valid_under_20 = None
    for s in sorted(clean_shapes_under_20, key=lambda x: x['frame']):
        if not s.get('outside'):
            last_valid_under_20 = s
            
    # Check if object was already outside at or before frame 19
    was_outside = (last_valid_under_20 is None) or (clean_shapes_under_20[-1].get('outside', False))
    
    if was_outside:
        # Object was already outside before frame 20 (e.g. Track 12)
        # Keep shapes under 20, do not add shapes 20..29
        t_copy = dict(t)
        t_copy['shapes'] = clean_shapes_under_20
        new_tracks.append(t_copy)
        print(f"Track {idx+1:02d} (ID={track_id}): Already outside at frame {clean_shapes_under_20[-1]['frame']}. Retained {len(clean_shapes_under_20)} shapes.")
        continue
    
    # Active object at frame 19
    s19 = last_valid_under_20
    p19 = np.array(s19['points'][:3])
    r19 = list(s19['points'][3:6])
    yaw19 = float(r19[2])
    sz = np.array(s19['points'][6:9])
    
    # Estimate velocity from F16 or F15
    s16 = next((s for s in clean_shapes_under_20 if s['frame'] == 16 and not s.get('outside')), None)
    s15 = next((s for s in clean_shapes_under_20 if s['frame'] == 15 and not s.get('outside')), None)
    
    if s16 and s19['frame'] > 16:
        vel = (p19 - np.array(s16['points'][:3])) / (s19['frame'] - 16.0)
    elif s15 and s19['frame'] > 15:
        vel = (p19 - np.array(s15['points'][:3])) / (s19['frame'] - 15.0)
    else:
        vel = np.zeros(3)
    
    # Limit max realistic speed (~55 km/h -> 1.5 m/frame)
    speed = np.linalg.norm(vel[:2])
    if speed > 1.55:
        vel = vel * (1.55 / speed)
    vel[2] = 0.0  # Keep Z flat
    
    # Track through frames 20..29
    curr_center = p19.copy()
    curr_yaw = yaw19
    prev_yaw = yaw19
    curr_vel = vel.copy()
    missed = 0
    generated_shapes = []
    
    for f in range(20, 30):
        # Predict
        yaw_rate = (curr_yaw - prev_yaw) * 0.5
        pred_yaw = curr_yaw + yaw_rate
        pred_center = curr_center + curr_vel
        
        fitted_center, pt_cnt = fit_box_to_points(clouds[f], pred_center, sz, pred_yaw)
        
        is_outside = False
        is_occluded = False
        
        if fitted_center is not None and pt_cnt >= 5:
            # Good detection
            prev_c = curr_center.copy()
            curr_center = fitted_center
            step_vel = curr_center - prev_c
            curr_vel = 0.75 * curr_vel + 0.25 * step_vel
            curr_vel[2] = 0.0
            
            # Ground constraint: Z within 0.15m of F19
            curr_center[2] = np.clip(curr_center[2], p19[2] - 0.15, p19[2] + 0.15)
            
            # Update yaw slightly towards motion if moving
            cur_spd = np.linalg.norm(curr_vel[:2])
            if cur_spd > 0.25:
                motion_angle = math.atan2(curr_vel[1], curr_vel[0])
                # Find closest orientation (heading or reverse heading)
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
            # Low points / occluded
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
    
    t_copy = dict(t)
    t_copy['shapes'] = clean_shapes_under_20 + generated_shapes
    new_tracks.append(t_copy)
    
    f20_pos = generated_shapes[0]['points'][:3]
    f29_pos = generated_shapes[-1]['points'][:3]
    f29_out = generated_shapes[-1]['outside']
    all_stats.append((idx+1, track_id, label_id, len(clean_shapes_under_20), len(generated_shapes), f20_pos, f29_pos, f29_out))

print("\n--- SUMMARY OF REFINED TRACKS (Frames 20..29) ---")
print(f"{'Trk':<4} {'ID':<6} {'Lbl':<4} {'F<=19':<6} {'F20-29':<7} {'F20 Pos':<24} {'F29 Pos':<24} {'F29 Outside'}")
print("-" * 95)
for s in all_stats:
    p20_s = str([round(x, 1) for x in s[5]])
    p29_s = str([round(x, 1) for x in s[6]])
    print(f"T{s[0]:02d} {s[1]:<6} {s[2]:<4} {s[3]:<6} {s[4]:<7} {p20_s:<24} {p29_s:<24} {s[7]}")
