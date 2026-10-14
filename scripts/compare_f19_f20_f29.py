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
print(f"{'Trk':<4} {'ID':<6} {'Label':<12} {'Frame 19 Pos':<22} {'Frame 20 Pos':<22} {'Frame 29 Pos':<22}")
print("-" * 90)
for idx, t in enumerate(tracks):
    f_map = {s['frame']: s for s in t.get('shapes', [])}
    s19 = f_map.get(19)
    s20 = f_map.get(20)
    s29 = f_map.get(29)
    p19 = [round(x, 1) for x in s19['points'][:3]] if s19 else 'None'
    p20 = [round(x, 1) for x in s20['points'][:3]] if s20 else 'None'
    p29 = [round(x, 1) for x in s29['points'][:3]] if s29 else 'None'
    lbl = t.get('label_id')
    print(f"T{idx+1:02d} {t.get('id'):<6} {lbl:<12} {str(p19):<22} {str(p20):<22} {str(p29):<22}")
