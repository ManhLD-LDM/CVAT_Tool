"""Build the extension through the canonical Node bundler.

Run this entry point with the user's configured Python interpreter.
Both build entry points produce the same complete MAIN/ISOLATED bundles.
"""
from pathlib import Path
import shutil
import subprocess

ROOT = Path(__file__).resolve().parent.parent

def build():
    node = shutil.which("node")
    if not node:
        raise RuntimeError("Node.js is required to build the extension")
    subprocess.run([node, str(ROOT / "scripts" / "build-extension.cjs")],
                   cwd=ROOT, check=True)

if __name__ == "__main__":
    build()
