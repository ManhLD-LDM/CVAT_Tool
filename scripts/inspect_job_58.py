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

# 1. Fetch Job 58
req_job = urllib.request.Request('https://cvat-test.vantixapps.net/api/jobs/58', headers=headers)
with urllib.request.urlopen(req_job) as resp:
    job = json.loads(resp.read().decode())
    print('Job 58 summary:')
    print(json.dumps({
        'id': job.get('id'),
        'task_id': job.get('task_id'),
        'project_id': job.get('project_id'),
        'stage': job.get('stage'),
        'state': job.get('state'),
        'start_frame': job.get('start_frame'),
        'stop_frame': job.get('stop_frame'),
        'mode': job.get('mode'),
        'dimension': job.get('dimension')
    }, indent=2))

task_id = job.get('task_id')
# 2. Fetch Task
req_task = urllib.request.Request(f'https://cvat-test.vantixapps.net/api/tasks/{task_id}', headers=headers)
with urllib.request.urlopen(req_task) as resp:
    task = json.loads(resp.read().decode())
    print('\nTask summary:')
    print(json.dumps({
        'id': task.get('id'),
        'name': task.get('name'),
        'size': task.get('size'),
        'mode': task.get('mode'),
        'dimension': task.get('dimension'),
        'overlap': task.get('overlap'),
        'segment_size': task.get('segment_size')
    }, indent=2))
    labels = task.get('labels', [])
    print(f'\nLabels ({len(labels)}):')
    for l in labels:
        attrs = [f"{a.get('name')} ({a.get('input_type')}: {a.get('values')})" for a in l.get('attributes', [])]
        print(f"  - [{l.get('id')}] {l.get('name')}: {attrs}")

# 3. Check existing annotations in Job 58
req_ann = urllib.request.Request('https://cvat-test.vantixapps.net/api/jobs/58/annotations', headers=headers)
with urllib.request.urlopen(req_ann) as resp:
    ann = json.loads(resp.read().decode())
    print(f"\nExisting annotations: {len(ann.get('shapes', []))} shapes, {len(ann.get('tracks', []))} tracks, {len(ann.get('tags', []))} tags")
