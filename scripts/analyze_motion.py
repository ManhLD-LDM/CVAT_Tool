import json
import numpy as np

with open('d:/Project/CVAT-3D-Copilot/job58_prelabel_tracks.json', 'r') as f:
    data = json.load(f)

for idx, t in enumerate(data['tracks']):
    shapes = t['shapes']
    p0 = np.array(shapes[0]['points'][:3])
    p_last = np.array(shapes[-1]['points'][:3])
    disp = np.linalg.norm(p_last - p0)
    max_disp = max(np.linalg.norm(np.array(s['points'][:3]) - p0) for s in shapes)
    print(f"Track {idx+1:02d} (Label={t.get('label_id')}): Total disp={disp:.2f}m, Max disp={max_disp:.2f}m")
