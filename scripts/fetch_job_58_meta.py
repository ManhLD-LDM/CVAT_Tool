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

# 1. Labels
req = urllib.request.Request('https://cvat-test.vantixapps.net/api/labels?job_id=58', headers=headers)
with urllib.request.urlopen(req) as resp:
    data = json.loads(resp.read().decode())
    labels = data.get('results', data) if isinstance(data, dict) else data
    print('Total labels:', len(labels))
    for l in labels:
        print(f"Label ID={l.get('id')} Name={l.get('name')} Type={l.get('type')}")
        for a in l.get('attributes', []):
            print(f"   Attr ID={a.get('id')} Name={a.get('name')} Type={a.get('input_type')} Values={a.get('values')}")

# 2. Existing Annotations
req_ann = urllib.request.Request('https://cvat-test.vantixapps.net/api/jobs/58/annotations', headers=headers)
with urllib.request.urlopen(req_ann) as resp:
    ann = json.loads(resp.read().decode())
    print('\nExisting annotations in Job 58:')
    print(f"Version: {ann.get('version')}")
    print(f"Shapes count: {len(ann.get('shapes', []))}")
    print(f"Tracks count: {len(ann.get('tracks', []))}")
    print(f"Tags count: {len(ann.get('tags', []))}")
    if ann.get('tracks'):
        print('Sample track:', json.dumps(ann['tracks'][0], indent=2))
