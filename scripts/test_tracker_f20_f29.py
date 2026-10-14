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
    # 1. Broad ROI
    dist_xy = np.linalg.norm(pts_xyz[:, :2] - center[:2], axis=1)
    mask = (dist_xy < (max(dx, dy) * 0.75 + 1.2)) & (np.abs(pts_xyz[:, 2] - center[2]) < (dz/2 + 0.6))
    roi = pts_xyz[mask]
    if len(roi) < 5:
        return None, 0
    
    # 2. Local coordinates
    local = transform_to_box_frame(roi, center, yaw)
    
    # 3. Inside box + small tolerance
    in_box = (
        (np.abs(local[:, 0]) <= (dx / 2.0 + 0.35)) &
        (np.abs(local[:, 1]) <= (dy / 2.0 + 0.30)) &
        (np.abs(local[:, 2]) <= (dz / 2.0 + 0.25))
    )
    obj_pts = local[in_box]
    if len(obj_pts) < 5:
        return None, len(obj_pts)
    
    # Filter ground points
    z_bottom = -dz / 2.0
    valid_z = obj_pts[:, 2] > (z_bottom + 0.12)
    if np.sum(valid_z) >= 5:
        obj_pts = obj_pts[valid_z]
    
    # Robust median offset
    offset = np.median(obj_pts, axis=0)
    
    # Clamp maximum correction per frame (max 0.35m in XY, 0.1m in Z)
    shift_local = np.zeros(3)
    shift_local[0] = np.clip(offset[0], -0.35, 0.35)
    shift_local[1] = np.clip(offset[1], -0.35, 0.35)
    shift_local[2] = np.clip(offset[2], -0.10, 0.10)
    
    new_center = transform_from_box_frame(shift_local.reshape(1, 3), center, yaw)[0]
    return new_center, len(obj_pts)

# Load point clouds 20..29
clouds = {f: read_pcd_xyz(DATA_DIR / f"frame_{f:02d}.pcd") for f in range(20, 30)}

with open('d:/Project/CVAT-3D-Copilot/current_job58_annotations.json') as f:
    data = json.load(f)

print("Testing tracking from Frame 19 -> 29:")
for idx, t in enumerate(data['tracks']):
    shapes_under_20 = {s['frame']: s for s in t['shapes'] if s['frame'] <= 19 and not s.get('outside')}
    s19 = shapes_under_20.get(19)
    if not s19:
        print(f"\nTrack {idx+1:02d} (ID={t.get('id')}): Left before F19 -> OUTSIDE")
        continue
    
    p19 = np.array(s19['points'][:3])
    r19 = list(s19['points'][3:6])
    yaw19 = float(r19[2])
    sz = np.array(s19['points'][6:9])
    
    # Estimate velocity from F16 or F15
    s16 = shapes_under_20.get(16)
    s15 = shapes_under_20.get(15)
    if s16:
        vel = (p19 - np.array(s16['points'][:3])) / (19.0 - 16.0)
    elif s15:
        vel = (p19 - np.array(s15['points'][:3])) / (19.0 - 15.0)
    else:
        vel = np.zeros(3)
    
    # Clamp velocity to reasonable limit (max 1.6m/frame ~ 58km/h)
    speed = np.linalg.norm(vel[:2])
    if speed > 1.6:
        vel = vel * (1.6 / speed)
    # Z velocity should be minimal
    vel[2] = np.clip(vel[2], -0.05, 0.05)
    
    curr_center = p19.copy()
    curr_yaw = yaw19
    curr_vel = vel.copy()
    missed = 0
    
    print(f"\nTrack {idx+1:02d} (ID={t.get('id')}, Lbl={t.get('label_id')}): F19 Pos={[round(x,2) for x in p19]}, InitVel={[round(x,2) for x in vel]} (speed={round(speed*36,1)}km/h)")
    
    traj = []
    for f in range(20, 30):
        pred_center = curr_center + curr_vel
        fitted_center, pt_cnt = fit_box_to_points(clouds[f], pred_center, sz, curr_yaw)
        
        is_outside = False
        if fitted_center is not None and pt_cnt >= 5:
            # Good fit
            prev_c = curr_center.copy()
            curr_center = fitted_center
            # Smooth velocity update
            step_vel = curr_center - prev_c
            curr_vel = 0.75 * curr_vel + 0.25 * step_vel
            curr_vel[2] = 0.0  # Keep Z flat
            # Keep Z within 0.15m of F19 Z
            curr_center[2] = np.clip(curr_center[2], p19[2] - 0.15, p19[2] + 0.15)
            missed = 0
        else:
            missed += 1
            curr_center = pred_center
            if missed >= 4 or np.linalg.norm(curr_center[:2]) > 65.0:
                is_outside = True
        
        traj.append((f, [round(x, 2) for x in curr_center], is_outside, pt_cnt if fitted_center is not None else 0))
    
    print(f"   -> F20: Pos={traj[0][1]}, Pts={traj[0][3]}")
    print(f"   -> F25: Pos={traj[5][1]}, Pts={traj[5][3]}")
    print(f"   -> F29: Pos={traj[9][1]}, Pts={traj[9][3]}, Outside={traj[9][2]}")
