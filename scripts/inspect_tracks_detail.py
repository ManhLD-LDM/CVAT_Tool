import os
import urllib.request
import json

sessionid = os.environ.get('CVAT_SESSION_ID', '')
headers = {
    'Cookie': f'sessionid={sessionid}',
    'Referer': 'https://cvat-test.vantixapps.net/',
}
req = urllib.request.Request('https://cvat-test.vantixapps.net/api/jobs/58/annotations', headers=headers)
with urllib.request.urlopen(req) as resp:
    data = json.loads(resp.read().decode())

tracks = data.get('tracks', [])
print(f"Total tracks: {len(tracks)}")
for idx, t in enumerate(tracks):
    shapes = t.get('shapes', [])
    print(f"\n--- Track {idx+1} (ID={t.get('id')}, label={t.get('label_id')}) ---")
    for s in sorted(shapes, key=lambda x: x.get('frame')):
        f = s.get('frame')
        out = s.get('outside')
        occ = s.get('occluded')
        pts = [round(v, 2) for v in s.get('points', [])[:3]]
        rot = [round(v, 2) for v in s.get('points', [])[3:6]]
        size = [round(v, 2) for v in s.get('points', [])[6:9]]
        print(f"  Frame {f:02d}: outside={out}, occluded={occ}, center={pts}, rot={rot}, size={size}")
