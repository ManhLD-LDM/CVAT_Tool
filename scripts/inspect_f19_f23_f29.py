import json

with open('d:/Project/CVAT-3D-Copilot/server_current_after_user_edit.json') as f:
    data = json.load(f)

print(f"{'Trk':<4} {'ID':<6} {'Label':<6} {'F19':<20} {'F20':<20} {'F22':<20} {'F23 (User)':<20} {'F29 (User)':<20}")
print("-" * 115)
for idx, t in enumerate(data['tracks']):
    s_map = {s['frame']: s for s in t['shapes']}
    p19 = [round(x, 1) for x in s_map[19]['points'][:3]] if 19 in s_map else 'None'
    p20 = [round(x, 1) for x in s_map[20]['points'][:3]] if 20 in s_map else 'None'
    p22 = [round(x, 1) for x in s_map[22]['points'][:3]] if 22 in s_map else 'None'
    p23 = [round(x, 1) for x in s_map[23]['points'][:3]] if 23 in s_map else 'None'
    p29 = [round(x, 1) for x in s_map[29]['points'][:3]] if 29 in s_map else 'None'
    lbl = t.get('label_id')
    print(f"T{idx+1:02d} {t.get('id'):<6} {lbl:<6} {str(p19):<20} {str(p20):<20} {str(p22):<20} {str(p23):<20} {str(p29):<20}")
