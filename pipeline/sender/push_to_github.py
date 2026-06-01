"""GitHub Contents API pusher.

Uploads a local file to a GitHub repo path via REST (PUT). Three retries with
exponential backoff. Pattern lifted from
/app/luckin-store-ops-dashboard/pipeline/sender/github_pusher.py.
"""
from __future__ import annotations

import argparse
import base64
import logging
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

import requests

from ..config.settings import GITHUB_BRANCH, GITHUB_FILE_PATH, GITHUB_REPO, GITHUB_TOKEN, LOCAL_PAYLOAD_PATH

logger = logging.getLogger(__name__)

_API_BASE = "https://api.github.com"
_MAX_RETRIES = 3
_BACKOFF_BASE = 2


def _headers() -> dict:
    return {
        "Authorization": f"Bearer {GITHUB_TOKEN}",
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
    }


def _current_sha(repo_path: str) -> str | None:
    url = f"{_API_BASE}/repos/{GITHUB_REPO}/contents/{repo_path}"
    resp = requests.get(url, headers=_headers(), params={"ref": GITHUB_BRANCH}, timeout=15)
    if resp.status_code == 200:
        return resp.json().get("sha")
    if resp.status_code == 404:
        return None
    resp.raise_for_status()
    return None


def push_file(local_path: Path, repo_path: str, message: str | None = None) -> bool:
    """Upload local_path to GITHUB_REPO at repo_path on GITHUB_BRANCH.

    Returns True on success. Retries 3x with exponential backoff (2s/4s/8s)
    on network errors or 5xx responses.
    """
    if not GITHUB_TOKEN:
        logger.error("GITHUB_TOKEN not set; refusing to push")
        return False
    if not GITHUB_REPO:
        logger.error("GITHUB_REPO not set; refusing to push")
        return False
    if not local_path.exists():
        logger.error("local file %s does not exist", local_path)
        return False

    content_bytes = local_path.read_bytes()
    encoded = base64.b64encode(content_bytes).decode("ascii")
    ts = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M")
    body = {
        "message": message or f"[auto] LSO on-time data refresh {ts}",
        "content": encoded,
        "branch": GITHUB_BRANCH,
    }
    sha = _current_sha(repo_path)
    if sha:
        body["sha"] = sha

    url = f"{_API_BASE}/repos/{GITHUB_REPO}/contents/{repo_path}"
    for attempt in range(1, _MAX_RETRIES + 1):
        try:
            resp = requests.put(url, headers=_headers(), json=body, timeout=60)
            if resp.status_code in (200, 201):
                logger.info(
                    "push OK %s -> %s (attempt %d, %.1f KB)",
                    local_path.name, repo_path, attempt, len(content_bytes) / 1024,
                )
                return True
            logger.warning(
                "push HTTP %d (attempt %d): %s",
                resp.status_code, attempt, resp.text[:300],
            )
        except requests.RequestException as exc:
            logger.warning("push network error (attempt %d): %s", attempt, exc)

        if attempt < _MAX_RETRIES:
            time.sleep(_BACKOFF_BASE ** attempt)

    logger.error("push FAILED after %d attempts: %s -> %s", _MAX_RETRIES, local_path, repo_path)
    return False


def main() -> int:
    parser = argparse.ArgumentParser(description="Push the local payload to GitHub via Contents API")
    parser.add_argument("--local", default=LOCAL_PAYLOAD_PATH,
                        help=f"path to the payload file (default: {LOCAL_PAYLOAD_PATH})")
    parser.add_argument("--repo-path", default=GITHUB_FILE_PATH,
                        help=f"repo-relative target path (default: {GITHUB_FILE_PATH})")
    parser.add_argument("--message", default=None, help="commit message override")
    args = parser.parse_args()

    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    )
    ok = push_file(Path(args.local), args.repo_path, args.message)
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
