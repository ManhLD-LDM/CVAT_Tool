import json
from pathlib import Path
import numpy as np

DATA_DIR = Path("d:/Project/CVAT-3D-Copilot/data_job58/pointclouds")

def read_pcd_xyz(path: Path) -> np.ndarray:
    raw = path.read_bytes()
    marker = b"DATA binary\n"
    idx = raw.find(marker)
    header_end = idx + len(marker)
    dt = np.dtype([("x", "<f4"), ("y", "<f4"), ("z", "<f4"), ("rgb", "<u4")])
    pts = np.frombuffer(raw[header_end:], dtype=dt)
    return np.stack([pts["x"], pts["y"], pts["z"]], axis=1)

clouds = {f: read_pcd_xyz(DATA_DIR / f"frame_{f:02d}.pcd") for f in range(20, 30)}

with open('d:/Project/CVAT-3D-Copilot/server_current_after_user_edit.json') as f:
    data = json.load(f)

print("Interpolation Quality Check:")
print(f"{'Trk':<4} {'Label':<6} {'F19-23 Speed':<14} {'F23-29 Speed':<14} {'F24-28 Avg Pts':<15}")
print("-" * 65)

for idx, t in enumerate(data['tracks']):
    s_map = {s['frame']: s for s in t['shapes']}
    if 19 not in s_map or 23 not in s_map or s_map[23].get('outside'):
        continue
    
    p19 = np.array(s_map[19]['points'][:3])
    p23 = np.array(s_map[23]['points'][:3])
    sz = np.array(s_map[23]['points'][6:9])
    
    # Speed 19-23
    disp_19_23 = np.linalg.norm(p23[:2] - p19[:2])
    spd_19_23 = (disp_19_23 / 0.4) * 3.6
    
    has29 = 29 in s_map and not s_map[29].get('outside')
    if has29:
        p29 = np.array(s_map[29]['points'][:3])
        disp_23_29 = np.linalg.norm(p29[:2] - p23[:2])
        spd_23_29 = (disp_23_29 / 0.6) * 3.6
        
        # Check point count along interpolation line 24..28
        pt_counts = []
        for f in range(24, 29):
            alpha = (f - 23.0) / 6.0
            interp_p = (1.0 - alpha) * p23 + alpha * p29
            dist = np.linalg.norm(clouds[f][:, :2] - interp_p[:2], axis=1)
            cnt = np.sum((dist < max(sz[:2])*0.75 + 0.5) & (np.abs(clouds[f][:, 2] - interp_p[2]) < sz[2]/2 + 0.3))
            pt_counts.append(cnt)
        avg_pts = int(np.mean(pt_counts))
    else:
        spd_23_29 = 0.0
        avg_pts = 0
        
    print(f"T{idx+1:02d} {t.get('label_id'):<6} {spd_19_23:<14.1f} {spd_23_29:<14.1f} {avg_pts:<15}")
