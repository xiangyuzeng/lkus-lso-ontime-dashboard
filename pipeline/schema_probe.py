"""CHECKPOINT-1/2 schema discovery — confirms the two tables we depend on
still have the column shape we built collect.py around. Writes a small
schema_map.json fingerprint so drift can be diff'd over time.

This script is best-effort: a non-zero exit does NOT block refresh.sh.
"""
from __future__ import annotations

import json
import logging
from pathlib import Path
from typing import Any

from .config.settings import IEHR_DB, OPEMPEFFICIENCY_DB, assert_read_only, connect

logger = logging.getLogger(__name__)

# (db, table) → minimum columns we must see
REQUIRED: dict[tuple[str, str], list[str]] = {
    (IEHR_DB, "t_ehr_employee"):                    ["emp_no", "join_date", "status", "tenant", "belong_dept_id"],
    (IEHR_DB, "t_ehr_department"):                  ["id", "name", "type", "tenant", "parent_code"],
    (IEHR_DB, "t_ehr_employee_qualification_info"): ["emp_no", "cer_id", "obtaining_date", "status", "tenant"],
    (IEHR_DB, "t_ehr_yxt_certificate"):             ["cer_id", "qualification_certificate", "template_no"],
    (OPEMPEFFICIENCY_DB, "t_attendance"):           ["emp_no", "attendance_date", "effective_hours", "tenant"],
}


def _describe(conn, db: str, table: str) -> list[str]:
    sql = (
        "SELECT COLUMN_NAME FROM information_schema.COLUMNS "
        "WHERE TABLE_SCHEMA=%s AND TABLE_NAME=%s ORDER BY ORDINAL_POSITION"
    )
    assert_read_only(sql)
    with conn.cursor() as cur:
        cur.execute(sql, (db, table))
        rows: list[dict[str, Any]] = list(cur.fetchall())
    return [str(r["COLUMN_NAME"]) for r in rows]


def main() -> int:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
    fingerprint: dict[str, dict[str, list[str]]] = {}
    drift: list[str] = []

    # Group by db so we open one connection per db.
    by_db: dict[str, list[str]] = {}
    for (db, table) in REQUIRED:
        by_db.setdefault(db, []).append(table)

    for db, tables in by_db.items():
        try:
            conn = connect(db)
        except Exception as exc:
            logger.warning("could not connect to %s: %s", db, exc)
            return 1
        try:
            fingerprint[db] = {}
            for table in tables:
                cols = _describe(conn, db, table)
                fingerprint[db][table] = cols
                expected = REQUIRED[(db, table)]
                missing = [c for c in expected if c not in cols]
                if missing:
                    drift.append(f"{db}.{table} missing columns: {missing}")
        finally:
            conn.close()

    out_path = Path(__file__).resolve().parent / "schema_map.json"
    out_path.write_text(json.dumps(fingerprint, indent=2, ensure_ascii=False), encoding="utf-8")
    logger.info("schema fingerprint written to %s", out_path)

    if drift:
        for line in drift:
            logger.warning("DRIFT: %s", line)
        return 2
    logger.info("no drift detected")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
