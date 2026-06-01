"""APScheduler entry point for the LSO on-time board's daily refresh.

This is the Docker / in-container path (``docker compose up`` runs this). It
invokes the already-tested ``refresh.sh`` (schema_probe → collect → validate →
push) once on startup — so a fresh container publishes a confirmed payload
within seconds — and then daily on the configured schedule.

For ad-hoc runs the bash entrypoint still works directly:
    bash refresh.sh

Schedule comes from the environment (.env):
    DAILY_HOUR / DAILY_MINUTE / DAILY_TIMEZONE   (default 06:00 UTC)
"""
from __future__ import annotations

import logging
import os
import subprocess
import sys
import time
from pathlib import Path

from apscheduler.schedulers.blocking import BlockingScheduler
from apscheduler.triggers.cron import CronTrigger

REPO_ROOT = Path(__file__).resolve().parent.parent.parent
REFRESH_SH = REPO_ROOT / "refresh.sh"

DAILY_HOUR = int(os.environ.get("DAILY_HOUR", "6"))
DAILY_MINUTE = int(os.environ.get("DAILY_MINUTE", "0"))
DAILY_TIMEZONE = os.environ.get("DAILY_TIMEZONE", "UTC")

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    handlers=[logging.StreamHandler(sys.stdout)],
)
logger = logging.getLogger("cron_runner")


def run_refresh() -> None:
    """Run the tested refresh.sh. It bails internally on any failure, so it
    never publishes an empty/stale payload; we just log the exit code."""
    logger.info("=== refresh start ===")
    t0 = time.monotonic()
    try:
        proc = subprocess.run(["bash", str(REFRESH_SH)], cwd=str(REPO_ROOT), check=False)
        logger.info("refresh.sh exited %d", proc.returncode)
    except Exception:
        logger.exception("refresh run crashed")
    logger.info("=== refresh done in %.1fs ===", time.monotonic() - t0)


def main() -> None:
    scheduler = BlockingScheduler(timezone="UTC")
    scheduler.add_job(
        run_refresh,
        CronTrigger(hour=DAILY_HOUR, minute=DAILY_MINUTE, timezone=DAILY_TIMEZONE),
        id="lso_ontime_daily",
        name="LSO on-time daily refresh",
        misfire_grace_time=3600,
    )
    logger.info("scheduler started; daily %02d:%02d %s", DAILY_HOUR, DAILY_MINUTE, DAILY_TIMEZONE)
    # Publish immediately on container start so we don't wait up to a day.
    run_refresh()
    try:
        scheduler.start()
    except (KeyboardInterrupt, SystemExit):
        logger.info("scheduler stopped")


if __name__ == "__main__":
    main()
