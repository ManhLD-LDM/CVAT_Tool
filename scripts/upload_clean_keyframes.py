import os
import json
import urllib.request
from pathlib import Path

SESSIONID = os.environ.get("CVAT_SESSION_ID", "")
CSRFTOKEN = os.environ.get("CVAT_CSRF_TOKEN", "")
HEADERS = {
    "Cookie": f"sessionid={SESSIONID}; csrftoken={CSRFTOKEN}",
    "X-CSRFToken": CSRFTOKEN,
    "Referer": "https://cvat-test.vantixapps.net/",
}

payload_path = Path("d:/Project/CVAT-3D-Copilot/job58_clean_keyframes_payload.json")
payload_bytes = payload_path.read_bytes()

print("Uploading clean keyframes payload to Job 58 via PUT...")
upload_req = urllib.request.Request(
    "https://cvat-test.vantixapps.net/api/jobs/58/annotations",
    data=payload_bytes,
    headers={**HEADERS, "Content-Type": "application/json"},
    method="PUT"
)

with urllib.request.urlopen(upload_req) as resp:
    print("Upload Status Code:", resp.status)
    resp_body = resp.read().decode()
    print("Upload Response Preview:", resp_body[:250])

print("\nVerifying updated annotations on CVAT server...")
verify_req = urllib.request.Request("https://cvat-test.vantixapps.net/api/jobs/58/annotations", headers=HEADERS)
with urllib.request.urlopen(verify_req) as resp:
    v_data = json.loads(resp.read().decode())

tracks = v_data.get('tracks', [])
print(f"Total tracks on server: {len(tracks)}")
for idx, t in enumerate(tracks):
    shapes = t.get('shapes', [])
    frames = [s['frame'] for s in shapes]
    print(f"Track {idx+1:02d} (ID={t.get('id')}, Label={t.get('label_id')}): Keyframes={frames}")

print("\nSUCCESSFULLY UPDATED CVAT JOB 58!")
