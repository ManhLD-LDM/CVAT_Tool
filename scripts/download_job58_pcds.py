import os
import time
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

SESSIONID = os.environ.get("CVAT_SESSION_ID", "")
CSRFTOKEN = os.environ.get("CVAT_CSRF_TOKEN", "")
HEADERS = {
    "Cookie": f"sessionid={SESSIONID}; csrftoken={CSRFTOKEN}",
    "X-CSRFToken": CSRFTOKEN,
    "Referer": "https://cvat-test.vantixapps.net/",
}

CACHE_DIR = Path("d:/Project/CVAT-3D-Copilot/data_job58/pointclouds")
CACHE_DIR.mkdir(parents=True, exist_ok=True)

def download_frame(frame_idx: int):
    target = CACHE_DIR / f"frame_{frame_idx:02d}.pcd"
    if target.exists() and target.stat().st_size > 1000:
        return frame_idx, True, target.stat().st_size
    
    url = f"https://cvat-test.vantixapps.net/api/jobs/58/data?type=frame&quality=original&number={frame_idx}"
    req = urllib.request.Request(url, headers=HEADERS)
    for attempt in range(3):
        try:
            with urllib.request.urlopen(req, timeout=30) as resp:
                data = resp.read()
                target.write_bytes(data)
                return frame_idx, True, len(data)
        except Exception as e:
            time.sleep(1)
            if attempt == 2:
                print(f"Error frame {frame_idx}: {e}")
                return frame_idx, False, 0

def download_all(total_frames: int = 30, max_workers: int = 6):
    print(f"Starting download of {total_frames} frames into {CACHE_DIR}...")
    start_time = time.time()
    with ThreadPoolExecutor(max_workers=max_workers) as executor:
        results = list(executor.map(download_frame, range(total_frames)))
    
    success_count = sum(1 for _, ok, _ in results if ok)
    elapsed = time.time() - start_time
    print(f"Downloaded {success_count}/{total_frames} frames in {elapsed:.1f}s.")
    return success_count == total_frames

if __name__ == "__main__":
    download_all(30)
