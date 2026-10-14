import os
import urllib.request
import urllib.error

sessionid = os.environ.get("CVAT_SESSION_ID", "")
csrftoken = os.environ.get("CVAT_CSRF_TOKEN", "")
headers = {
    "Cookie": f"sessionid={sessionid}; csrftoken={csrftoken}",
    "X-CSRFToken": csrftoken,
    "Referer": "https://cvat-test.vantixapps.net/",
}

for t in ["chunk", "frame", "context_image"]:
    for q in ["compressed", "original"]:
        url = f"https://cvat-test.vantixapps.net/api/jobs/58/data?type={t}&quality={q}&number=0"
        req = urllib.request.Request(url, headers=headers)
        try:
            with urllib.request.urlopen(req) as resp:
                print(t, q, "SUCCESS:", resp.status, resp.headers.get("Content-Type"), resp.headers.get("Content-Length"))
        except urllib.error.HTTPError as e:
            print(t, q, "ERROR:", e.code, e.read()[:80])
