import json
from pathlib import Path
import numpy as np

with open('d:/Project/CVAT-3D-Copilot/current_job58_annotations.json') as f:
    data = json.load(f)

print(f"Total tracks: {len(data['tracks'])}")
for idx, t in enumerate(data['tracks']):
    shapes = t['shapes']
    frames = [s['frame'] for s in shapes]
    last_valid_under_20 = None
    for s in shapes:
        if s['frame'] <= 19 and not s['outside']:
            last_valid_under_20 = s
    
    s20 = next((s for s in shapes if s['frame'] == 20), None)
    s29 = next((s for s in shapes if s['frame'] == 29), None)
    
    p_last19 = [round(x, 2) for x in last_valid_under_20['points'][:3]] if last_valid_under_20 else None
    f_last19 = last_valid_under_20['frame'] if last_valid_under_20 else None
    p20 = [round(x, 2) for x in s20['points'][:3]] if s20 else None
    p29 = [round(x, 2) for x in s29['points'][:3]] if s29 else None
    
    print(f"Track {idx+1:02d} (ID={t.get('id'):<5}, Label={t.get('label_id')}): Frames={frames}")
    print(f"   Last <=19: Frame {f_last19} Pos={p_last19}")
    print(f"   Frame 20: Pos={p20}, Outside={s20.get('outside') if s20 else None}")
    print(f"   Frame 29: Pos={p29}, Outside={s29.get('outside') if s29 else None}")
