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

with open('d:/Project/CVAT-3D-Copilot/current_job58_annotations.json') as f:
    data = json.load(f)

# Load point clouds 19, 20, 25, 29
clouds = {
    19: read_pcd_xyz(DATA_DIR / "frame_19.pcd"),
    20: read_pcd_xyz(DATA_DIR / "frame_20.pcd"),
    25: read_pcd_xyz(DATA_DIR / "frame_25.pcd"),
    29: read_pcd_xyz(DATA_DIR / "frame_29.pcd"),
}

print(f"{'Trk':<4} {'ID':<6} {'Label':<8} {'F19 Pos':<22} {'Pts@F19':<9} {'Pts@F20':<9} {'Pts@F25':<9} {'Pts@F29':<9}")
print("-" * 90)

for idx, t in enumerate(data['tracks']):
    s19 = next((s for s in t['shapes'] if s['frame'] == 19 and not s.get('outside')), None)
    if not s19:
        print(f"T{idx+1:02d} {t.get('id'):<6} {t.get('label_id'):<8} {'No F19 (Outside)':<22}")
        continue
    
    p19 = np.array(s19['points'][:3])
    sz = np.array(s19['points'][6:9])
    r = max(sz[0], sz[1]) * 0.75 + 0.5
    
    pt_counts = []
    for f in [19, 20, 25, 29]:
        dist = np.linalg.norm(clouds[f][:, :2] - p19[:2], axis=1)
        cnt = np.sum((dist < r) & (np.abs(clouds[f][:, 2] - p19[2]) < sz[2]/2 + 0.3))
        pt_counts.append(cnt)
    
    pos_str = str([round(x, 1) for x in p19])
    print(f"T{idx+1:02d} {t.get('id'):<6} {t.get('label_id'):<8} {pos_str:<22} {pt_counts[0]:<9} {pt_counts[1]:<9} {pt_counts[2]:<9} {pt_counts[3]:<9}")
