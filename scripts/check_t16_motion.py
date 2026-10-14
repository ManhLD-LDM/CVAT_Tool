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

with open('d:/Project/CVAT-3D-Copilot/server_current_after_user_edit.json') as f:
    data = json.load(f)

clouds = {f: read_pcd_xyz(DATA_DIR / f"frame_{f:02d}.pcd") for f in range(19, 30)}

# Look at Track 16 (index 15)
t16 = data['tracks'][15]
s_map = {s['frame']: s for s in t16['shapes']}

print("Track 16 (ID %s):" % t16.get('id'))
for f in range(19, 30):
    if f in s_map:
        p = s_map[f]['points'][:3]
        dist = np.linalg.norm(clouds[f][:, :2] - np.array(p[:2]), axis=1)
        cnt = np.sum((dist < 2.5) & (np.abs(clouds[f][:, 2] - p[2]) < 1.0))
        print("  Frame %02d: pos=[%.2f, %.2f, %.2f], points_in_box=%d" % (f, p[0], p[1], p[2], cnt))
