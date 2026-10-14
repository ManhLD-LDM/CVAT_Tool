import os
import urllib.request
import json

sessionid = os.environ.get('CVAT_SESSION_ID', '')
csrftoken = os.environ.get('CVAT_CSRF_TOKEN', '')
headers = {
    'Cookie': f'sessionid={sessionid}; csrftoken={csrftoken}',
    'X-CSRFToken': csrftoken,
    'Referer': 'https://cvat-test.vantixapps.net/',
}

req = urllib.request.Request('https://cvat-test.vantixapps.net/api/jobs/58/annotations', headers=headers)
with urllib.request.urlopen(req) as resp:
    ann = json.loads(resp.read().decode())
    tracks = ann.get('tracks', [])
    print(f"Total tracks in Job 58: {len(tracks)}")
    total_shapes = sum(len(t.get('shapes', [])) for t in tracks)
    print(f"Total cuboids/shapes across all frames: {total_shapes}")
    label_map = {1: 'vehicles', 2: 'pedestrian', 3: 'two-wheels', 4: 'Animal', 5: 'Obstacle'}
    for idx, t in enumerate(tracks):
        shapes = t.get('shapes', [])
        lbl = label_map.get(t.get('label_id'), str(t.get('label_id')))
        attrs = {a.get('spec_id'): a.get('value') for a in t.get('attributes', [])}
        print(f"Track {idx+1:02d} (ID={t.get('id')}): {lbl:<10} attr={attrs} shapes={len(shapes)} frames=[{shapes[0].get('frame')}..{shapes[-1].get('frame')}]")
