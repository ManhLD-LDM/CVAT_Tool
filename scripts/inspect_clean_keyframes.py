import json

with open('d:/Project/CVAT-3D-Copilot/server_current_after_user_edit.json') as f:
    data = json.load(f)

print("Tracks with clean keyframe structure [<=19, 23, 29]:")
for idx, t in enumerate(data['tracks']):
    s_map = {s['frame']: s for s in t['shapes']}
    frames = sorted(s_map.keys())
    
    # Check <=19
    frames_u19 = [f for f in frames if f <= 19]
    has23 = 23 in s_map
    has29 = 29 in s_map
    
    out23 = s_map[23].get('outside') if has23 else None
    out29 = s_map[29].get('outside') if has29 else None
    
    p19 = [round(x, 1) for x in s_map[19]['points'][:3]] if 19 in s_map else None
    p23 = [round(x, 1) for x in s_map[23]['points'][:3]] if has23 else None
    p29 = [round(x, 1) for x in s_map[29]['points'][:3]] if has29 else None
    
    print(f"T{idx+1:02d} (ID {t.get('id')}): F<=19={frames_u19}")
    print(f"     F19={p19} -> F23={p23} (out={out23}) -> F29={p29} (out={out29})")
