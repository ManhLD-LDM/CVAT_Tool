import json
from pathlib import Path

with open('d:/Project/CVAT-3D-Copilot/server_current_after_user_edit.json') as f:
    orig = json.load(f)

clean_tracks = []
for idx, t in enumerate(orig['tracks']):
    s_map = {s['frame']: s for s in t['shapes']}
    
    # 1. Keep all user keyframes <= 19
    shapes_under_20 = [s for s in t['shapes'] if s['frame'] <= 19]
    
    # 2. Keep user keyframe at 23
    s23 = s_map.get(23)
    
    # 3. Keep user keyframe at 29
    s29 = s_map.get(29)
    
    new_shapes = list(shapes_under_20)
    if s23:
        new_shapes.append(s23)
    if s29:
        new_shapes.append(s29)
        
    t_copy = dict(t)
    if "id" in t_copy:
        del t_copy["id"]
        
    clean_shapes = []
    for s in new_shapes:
        sc = dict(s)
        if "id" in sc:
            del sc["id"]
        sc["keyframe"] = True
        clean_shapes.append(sc)
        
    t_copy["shapes"] = clean_shapes
    clean_tracks.append(t_copy)
    
    frames_list = [s['frame'] for s in clean_shapes]
    print(f"Track {idx+1:02d} (Label {t.get('label_id')}): Keyframes={frames_list}")

payload = {
    "version": 0,
    "tags": [],
    "shapes": [],
    "tracks": clean_tracks
}

out_file = Path("d:/Project/CVAT-3D-Copilot/job58_clean_keyframes_payload.json")
out_file.write_text(json.dumps(payload, indent=2))
print(f"\nGenerated payload with {len(clean_tracks)} tracks, saved to {out_file}.")
