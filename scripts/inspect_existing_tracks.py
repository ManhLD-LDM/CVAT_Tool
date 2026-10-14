import os
import json
import urllib.request

sessionid = os.environ.get('CVAT_SESSION_ID', '')
csrftoken = os.environ.get('CVAT_CSRF_TOKEN', '')
headers = {
    'Cookie': f'sessionid={sessionid}; csrftoken={csrftoken}',
    'X-CSRFToken': csrftoken,
    'Referer': 'https://cvat-test.vantixapps.net/',
}

req_ann = urllib.request.Request('https://cvat-test.vantixapps.net/api/jobs/58/annotations', headers=headers)
with urllib.request.urlopen(req_ann) as resp:
    ann = json.loads(resp.read().decode())
    tracks = ann.get('tracks', [])
    print(f'Total tracks: {len(tracks)}')
    label_map = {1: 'vehicles', 2: 'pedestrian', 3: 'two-wheels', 4: 'Animal', 5: 'Obstacle'}
    for idx, t in enumerate(tracks):
        shapes = t.get('shapes', [])
        frames = [s.get('frame') for s in shapes]
        attrs = {a.get('spec_id'): a.get('value') for a in t.get('attributes', [])}
        lbl = label_map.get(t.get('label_id'), str(t.get('label_id')))
        print(f"Track {idx+1} (ID={t.get('id')}): Label={lbl} Attrs={attrs} Frames={len(frames)} (min={min(frames) if frames else None}, max={max(frames) if frames else None})")
