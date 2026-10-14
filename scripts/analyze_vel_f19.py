import json
import numpy as np

with open('d:/Project/CVAT-3D-Copilot/current_job58_annotations.json') as f:
    data = json.load(f)

print(f"{'Trk':<4} {'ID':<6} {'Label':<10} {'F15':<18} {'F16':<18} {'F19':<18} {'Vel (m/fr)':<12} {'Speed(km/h)':<12}")
print("-" * 95)

for idx, t in enumerate(data['tracks']):
    shapes = {s['frame']: s for s in t['shapes'] if not s.get('outside')}
    s15 = shapes.get(15)
    s16 = shapes.get(16)
    s19 = shapes.get(19)
    
    p15 = np.array(s15['points'][:3]) if s15 else None
    p16 = np.array(s16['points'][:3]) if s16 else None
    p19 = np.array(s19['points'][:3]) if s19 else None
    
    vel = None
    speed_kmh = None
    if p19 is not None and p16 is not None:
        dt = 3.0
        vel = (p19 - p16) / dt
        # assuming 10 fps (0.1s per frame)
        speed_kmh = np.linalg.norm(vel[:2]) * 10.0 * 3.6
    elif p19 is not None and p15 is not None:
        dt = 4.0
        vel = (p19 - p15) / dt
        speed_kmh = np.linalg.norm(vel[:2]) * 10.0 * 3.6
    
    s_f15 = str([round(x, 1) for x in p15]) if p15 is not None else "None"
    s_f16 = str([round(x, 1) for x in p16]) if p16 is not None else "None"
    s_f19 = str([round(x, 1) for x in p19]) if p19 is not None else "None"
    s_vel = str(round(np.linalg.norm(vel[:2]), 2)) if vel is not None else "N/A"
    s_spd = str(round(speed_kmh, 1)) if speed_kmh is not None else "N/A"
    
    print(f"T{idx+1:02d} {t.get('id'):<6} {t.get('label_id'):<10} {s_f15:<18} {s_f16:<18} {s_f19:<18} {s_vel:<12} {s_spd:<12}")
