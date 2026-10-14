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

req_ann = urllib.request.Request('https://cvat-test.vantixapps.net/api/jobs/58/annotations', headers=headers)
with urllib.request.urlopen(req_ann) as resp:
    ann = json.loads(resp.read().decode())
    tracks = ann.get('tracks', [])
    label_map = {1: 'vehicles', 2: 'pedestrian', 3: 'two-wheels', 4: 'Animal', 5: 'Obstacle'}
    for t in tracks:
        s = t['shapes'][0]
        pts = s['points']
        center = pts[:3]
        rot = pts[3:6]
        size = pts[6:9]
        attr = t.get('attributes')
        lbl = label_map.get(t.get('label_id'), str(t.get('label_id')))
        print(f"Track ID={t.get('id')} Label={lbl} Attr={attr} Pos={[round(v, 2) for v in center]} Size={[round(v, 2) for v in size]} Yaw={round(rot[2], 2)}")
