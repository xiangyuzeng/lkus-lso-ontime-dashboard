"""LSO on-time completion collector.

Computes, per region and overall, the on-time completion rate for LSO100 and
LSO200 for tenant LKUS:

    rate = (# who earned the cert ON TIME) / (# who entered that level's training)

"On time":
  - LSO100: cumulative effective_hours from hire to acquisition  <= 112
  - LSO200: calendar days       from hire to acquisition         <= 45

Denominator ("entered training"):
  - LSO100: everyone assigned to a store dept (active + separated)  UNION  LSO100 completers
  - LSO200: LSO100 completers  UNION  LSO200 completers, EXCLUDING anyone whose
            current position is Barista (or Barista Trainee) — keeps the LSO200
            "entered training" population consistent with the in-training board.
  "In progress" is the denominator minus the completers, because NO in-progress
  training is recorded for LKUS (the "In Training" cer_ids and
  t_ehr_employee_training_record are both empty) — see README.

Sources (all read-only, tenant='LKUS'):
  - roster / hire / store : luckyus_iehr.t_ehr_employee + t_ehr_department(type=0)
  - cert acquisition date : luckyus_iehr.t_ehr_employee_qualification_info
                            joined to t_ehr_yxt_certificate on cer_id
                            (LSO100 template_no='KFS', LSO200 template_no='ZBZG')
  - worked hours          : luckyus_opempefficiency.t_attendance.effective_hours

Region rollup: pipeline/config/region_map.csv (store_name -> region). Unmapped
stores render "Pending" (no usable region rollup exists in master data).

SELECT-only — every SQL string passes through assert_read_only() before execute.
"""
from __future__ import annotations

import argparse
import csv
import json
import logging
import sys
from collections import defaultdict
from datetime import date, datetime, timezone
from pathlib import Path
from typing import Any

from .config.settings import (
    IEHR_DB,
    LOCAL_PAYLOAD_PATH,
    OPEMPEFFICIENCY_DB,
    TENANT,
    assert_read_only,
    connect,
)

logger = logging.getLogger(__name__)
REPO_ROOT = Path(__file__).resolve().parent.parent

BOARD_ID = "LCNA-HR-LSO-ONTIME-2026"
TZ = "America/New_York"
PENDING = "Pending"

# Level config — must match lib/types.ts.
LEVELS: dict[str, dict[str, Any]] = {
    "LSO100": {"template_no": "KFS",  "basis": "effective_hours", "budget": 112, "unit": "hours"},
    "LSO200": {"template_no": "ZBZG", "basis": "calendar_days",   "budget": 45,  "unit": "days"},
}
TITLES = {
    "LSO100": "LSO100 on-time — earned within 112 worked-hours of hire",
    "LSO200": "LSO200 on-time — earned within 45 days of hire",
}
DENOM_DEF = {
    "LSO100": "store roster (active+separated) ∪ LSO100 completers",
    "LSO200": "LSO100 completers ∪ LSO200 completers, excluding current Baristas",
}

REGION_MAP_PATH = REPO_ROOT / "pipeline" / "config" / "region_map.csv"

# ── SQL (held verbatim; mirrors README "Confirmed sources") ──────────────

ROSTER_SQL = """
SELECT e.emp_no, e.join_date, e.status, d.name AS store_name, p.name AS post_name
FROM   t_ehr_employee e
JOIN   t_ehr_department d
       ON d.id = e.belong_dept_id AND d.type = 0 AND d.tenant = %s
LEFT JOIN t_ehr_employee_post_relation pr
       ON pr.emp_no = e.emp_no AND pr.relation_type = 0 AND pr.tenant = %s
LEFT JOIN t_ehr_post p
       ON p.id = pr.post_id AND p.tenant = %s
WHERE  e.tenant = %s
"""

COMPLETERS_SQL = """
SELECT q.emp_no, y.template_no, MIN(q.obtaining_date) AS obtaining_date,
       e.join_date, e.status, d.name AS store_name, p.name AS post_name
FROM   t_ehr_employee_qualification_info q
JOIN   t_ehr_yxt_certificate y ON q.cer_id = y.cer_id
JOIN   t_ehr_employee e        ON e.emp_no = q.emp_no AND e.tenant = %s
LEFT JOIN t_ehr_department d   ON d.id = e.belong_dept_id AND d.type = 0 AND d.tenant = %s
LEFT JOIN t_ehr_employee_post_relation pr ON pr.emp_no = e.emp_no AND pr.relation_type = 0 AND pr.tenant = %s
LEFT JOIN t_ehr_post p         ON p.id = pr.post_id AND p.tenant = %s
WHERE  q.tenant = %s AND y.template_no IN ('KFS', 'ZBZG')
GROUP BY q.emp_no, y.template_no, e.join_date, e.status, d.name, p.name
"""

# emp_no list + global date window get parameterised in batches.
HOURS_SQL_TEMPLATE = """
SELECT emp_no, attendance_date, effective_hours
FROM   t_attendance
WHERE  tenant = %s
  AND  emp_no IN ({placeholders})
  AND  attendance_date BETWEEN %s AND %s
"""

# ── helpers ──────────────────────────────────────────────────────────────


def _to_date(value: Any) -> date | None:
    """Parse a DATE/DATETIME column or a 'YYYY-MM-DD[ HH:MM:SS]' varchar to a
    date. Returns None for NULL / '' / '0000-00-00' / unparseable values."""
    if value is None:
        return None
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    s = str(value).strip().replace("T", " ")
    if not s or s.startswith("0000"):
        return None
    for fmt in ("%Y-%m-%d %H:%M:%S", "%Y-%m-%d %H:%M", "%Y-%m-%d"):
        try:
            return datetime.strptime(s, fmt).date()
        except ValueError:
            pass
    try:
        return datetime.strptime(s[:10], "%Y-%m-%d").date()
    except ValueError:
        return None


def _chunks(seq: list, n: int):
    for i in range(0, len(seq), n):
        yield seq[i : i + n]


def _rate(num: int, den: int) -> float:
    return round(num / den, 4) if den else 0.0


# ── fetch (pymysql; SELECT-only) ─────────────────────────────────────────


def fetch_roster() -> list[dict[str, Any]]:
    assert_read_only(ROSTER_SQL)
    conn = connect(IEHR_DB)
    try:
        with conn.cursor() as cur:
            cur.execute(ROSTER_SQL, (TENANT, TENANT, TENANT, TENANT))
            return list(cur.fetchall())
    finally:
        conn.close()


def fetch_completers() -> list[dict[str, Any]]:
    assert_read_only(COMPLETERS_SQL)
    conn = connect(IEHR_DB)
    try:
        with conn.cursor() as cur:
            cur.execute(COMPLETERS_SQL, (TENANT, TENANT, TENANT, TENANT, TENANT))
            rows = list(cur.fetchall())
    finally:
        conn.close()
    tn2lvl = {cfg["template_no"]: lvl for lvl, cfg in LEVELS.items()}
    for r in rows:
        r["level"] = tn2lvl.get(r.get("template_no"))
    return [r for r in rows if r["level"]]


def fetch_lso100_hours(completers: list[dict[str, Any]]) -> dict[str, float]:
    """emp_no -> cumulative effective_hours within each LSO100 completer's
    [join_date, obtaining_date] window. Pulls daily rows in the global date
    range (batched ≤100 emp_nos) and applies the per-emp window in Python —
    same shape as the sibling board's hours fetch."""
    windows: dict[str, tuple[date, date]] = {}
    for c in completers:
        if c.get("level") != "LSO100":
            continue
        jd, od = _to_date(c.get("join_date")), _to_date(c.get("obtaining_date"))
        if jd and od and od >= jd:
            windows[str(c["emp_no"])] = (jd, od)
    if not windows:
        return {}

    gmin = min(w[0] for w in windows.values()).isoformat()
    gmax = max(w[1] for w in windows.values()).isoformat()
    hours: dict[str, float] = defaultdict(float)
    conn = connect(OPEMPEFFICIENCY_DB)
    try:
        with conn.cursor() as cur:
            for batch in _chunks(list(windows.keys()), 100):
                placeholders = ", ".join(["%s"] * len(batch))
                sql = HOURS_SQL_TEMPLATE.format(placeholders=placeholders)
                assert_read_only(sql)
                cur.execute(sql, [TENANT, *batch, gmin, gmax])
                for r in cur.fetchall():
                    emp = str(r["emp_no"])
                    d = _to_date(r["attendance_date"])
                    if d is None:
                        continue
                    jd, od = windows[emp]
                    if jd <= d <= od:
                        hours[emp] += float(r["effective_hours"] or 0.0)
    finally:
        conn.close()
    return dict(hours)


def load_region_map(path: Path | str = REGION_MAP_PATH) -> dict[str, str]:
    """store_name -> region. Blank region or missing file => store stays Pending."""
    mapping: dict[str, str] = {}
    p = Path(path)
    if not p.exists():
        return mapping
    with p.open(encoding="utf-8") as f:
        for row in csv.DictReader(f):
            store = (row.get("store_name") or "").strip()
            region = (row.get("region") or "").strip()
            if store and region:
                mapping[store] = region
    return mapping


# ── build (pure; no DB — unit-testable, reused by --fixtures) ────────────


def _assemble(
    level: str,
    denom_emps: set[str],
    completed_emps: set[str],
    ontime_emps: set[str],
    emp_store: dict[str, str],
    region_of,
    anomalies: int,
) -> dict[str, Any]:
    cfg = LEVELS[level]
    reg: dict[str, dict[str, Any]] = defaultdict(
        lambda: {"denominator": 0, "completed": 0, "numerator": 0, "stores": set()}
    )
    for e in denom_emps:
        r = region_of(e)
        reg[r]["denominator"] += 1
        st = emp_store.get(e, "")
        if st:
            reg[r]["stores"].add(st)
    for e in completed_emps:
        reg[region_of(e)]["completed"] += 1
    for e in ontime_emps:
        reg[region_of(e)]["numerator"] += 1

    by_region = []
    for name in sorted(reg.keys(), key=lambda x: (x == PENDING, x)):
        c = reg[name]
        den, comp, num = c["denominator"], c["completed"], c["numerator"]
        by_region.append(
            {
                "region": name,
                "pending": name == PENDING,
                "store_count": len(c["stores"]),
                "numerator": num,
                "denominator": den,
                "rate": _rate(num, den),
                "completed": comp,
                "in_progress": den - comp,
            }
        )

    den, comp, num = len(denom_emps), len(completed_emps), len(ontime_emps)
    return {
        "level": level,
        "title": TITLES[level],
        "definition": {"basis": cfg["basis"], "budget": cfg["budget"], "unit": cfg["unit"], "clock_from": "hire"},
        "denominator_def": DENOM_DEF[level],
        "overall": {
            "numerator": num,
            "denominator": den,
            "rate": _rate(num, den),
            "completed": comp,
            "in_progress": den - comp,
            "anomalies": anomalies,
        },
        "by_region": by_region,
    }


def build_payload(
    roster: list[dict[str, Any]],
    completers: list[dict[str, Any]],
    hours_map: dict[str, float],
    region_map: dict[str, str],
    *,
    source: str = "confirmed",
    generated_by: str = "collect.py",
) -> dict[str, Any]:
    # emp -> store (roster first, then completer fills gaps)
    emp_store: dict[str, str] = {}
    for r in roster:
        e = str(r["emp_no"])
        if not emp_store.get(e):
            emp_store[e] = (r.get("store_name") or "").strip()
    comp_by_level: dict[str, list] = defaultdict(list)
    for c in completers:
        e = str(c["emp_no"])
        comp_by_level[c["level"]].append(c)
        if not emp_store.get(e):
            emp_store[e] = (c.get("store_name") or "").strip()

    # emp -> current post_name (roster first, then completer) for the LSO200
    # position exclusion below.
    emp_post: dict[str, str] = {}
    for r in roster:
        e = str(r["emp_no"])
        if not emp_post.get(e):
            emp_post[e] = (r.get("post_name") or "").strip()
    for c in completers:
        e = str(c["emp_no"])
        if not emp_post.get(e):
            emp_post[e] = (c.get("post_name") or "").strip()

    roster_emps = {str(r["emp_no"]) for r in roster}

    def region_of(emp: str) -> str:
        return region_map.get(emp_store.get(emp, "")) or PENDING

    # ---- LSO100: hours-based on-time ----
    lso100 = comp_by_level["LSO100"]
    lso100_completers = {str(c["emp_no"]) for c in lso100}
    lso100_denom = roster_emps | lso100_completers
    lso100_ontime: set[str] = set()
    lso100_anom = 0
    budget100 = LEVELS["LSO100"]["budget"]
    for c in lso100:
        e = str(c["emp_no"])
        jd, od = _to_date(c.get("join_date")), _to_date(c.get("obtaining_date"))
        if jd is None or od is None or od < jd:
            lso100_anom += 1
            continue
        if hours_map.get(e, 0.0) <= budget100:
            lso100_ontime.add(e)

    # ---- LSO200: calendar-days-based on-time ----
    lso200 = comp_by_level["LSO200"]
    lso200_completers = {str(c["emp_no"]) for c in lso200}
    lso200_denom = lso100_completers | lso200_completers
    lso200_ontime: set[str] = set()
    lso200_anom = 0
    budget200 = LEVELS["LSO200"]["budget"]
    for c in lso200:
        e = str(c["emp_no"])
        jd, od = _to_date(c.get("join_date")), _to_date(c.get("obtaining_date"))
        if jd is None or od is None or od < jd:
            lso200_anom += 1
            continue
        if (od - jd).days <= budget200:
            lso200_ontime.add(e)

    # Position exclusion — consistency with the in-training board: drop associates
    # whose CURRENT position is Barista (or Barista Trainee) from the LSO200 metric
    # (denominator, completers, and on-time alike). LSO100 is unchanged.
    EXCLUDE_LSO200 = {"Barista", "Barista Trainee"}
    def _keep200(e: str) -> bool:
        return emp_post.get(e, "") not in EXCLUDE_LSO200
    lso200_completers = {e for e in lso200_completers if _keep200(e)}
    lso200_denom = {e for e in lso200_denom if _keep200(e)}
    lso200_ontime = {e for e in lso200_ontime if _keep200(e)}

    metrics = [
        _assemble("LSO100", lso100_denom, lso100_completers, lso100_ontime, emp_store, region_of, lso100_anom),
        _assemble("LSO200", lso200_denom, lso200_completers, lso200_ontime, emp_store, region_of, lso200_anom),
    ]

    # stores[] + regions[] + region_map_status
    all_stores = sorted({s for s in emp_store.values() if s})
    stores_rows = []
    for st in all_stores:
        stores_rows.append(
            {
                "store": st,
                "region": region_map.get(st) or "pending",
                "lso100_denominator": sum(1 for e in lso100_denom if emp_store.get(e) == st),
                "lso200_denominator": sum(1 for e in lso200_denom if emp_store.get(e) == st),
            }
        )

    mapped_regions = sorted({r for s in all_stores if (r := region_map.get(s))})
    unmapped_store = any(not region_map.get(s) for s in all_stores)
    no_store_emp = any(not emp_store.get(e) for e in (lso100_denom | lso200_denom))
    has_pending = unmapped_store or no_store_emp
    regions_list = mapped_regions + ([PENDING] if has_pending else [])
    status = "pending" if not mapped_regions else ("partial" if has_pending else "complete")

    return {
        "meta": {
            "board_id": BOARD_ID,
            "generated_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3] + "Z",
            "generated_by": generated_by,
            "tz": TZ,
            "tenant": TENANT,
            "source": source,
            "region_map_status": status,
            "metrics_def": {
                lvl: {"basis": cfg["basis"], "budget": cfg["budget"], "unit": cfg["unit"], "clock_from": "hire"}
                for lvl, cfg in LEVELS.items()
            },
            "denominator_def": DENOM_DEF,
            "sources": {
                "roster": f"{IEHR_DB}.t_ehr_employee + t_ehr_department(type=0)",
                "cert": f"{IEHR_DB}.t_ehr_employee_qualification_info + t_ehr_yxt_certificate",
                "hours": f"{OPEMPEFFICIENCY_DB}.t_attendance",
            },
            "data_notes": {"lso100_anomalies": lso100_anom, "lso200_anomalies": lso200_anom},
        },
        "metrics": metrics,
        "regions": regions_list,
        "stores": stores_rows,
    }


def main() -> int:
    ap = argparse.ArgumentParser(description="Build public/data.json for the LSO on-time board")
    ap.add_argument("--out", default=str(REPO_ROOT / LOCAL_PAYLOAD_PATH), help="output payload path")
    ap.add_argument(
        "--fixtures",
        default=None,
        help="dir with roster.json / completers.json / hours.json — build offline without a DB",
    )
    args = ap.parse_args()
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")

    region_map = load_region_map()
    if args.fixtures:
        d = Path(args.fixtures)
        roster = json.loads((d / "roster.json").read_text(encoding="utf-8"))
        completers = json.loads((d / "completers.json").read_text(encoding="utf-8"))
        hours_map = json.loads((d / "hours.json").read_text(encoding="utf-8"))
        generated_by = "collect.py --fixtures"
    else:
        roster = fetch_roster()
        completers = fetch_completers()
        hours_map = fetch_lso100_hours(completers)
        generated_by = "collect.py"

    logger.info("roster=%d completers=%d hours_map=%d", len(roster), len(completers), len(hours_map))
    if not completers:
        # Fail loudly — the cron host must never publish an empty board.
        raise RuntimeError("completers query returned 0 rows; refusing to write an empty payload")

    payload = build_payload(roster, completers, hours_map, region_map, source="confirmed", generated_by=generated_by)

    out_path = Path(args.out)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(payload, indent=2, ensure_ascii=False), encoding="utf-8")

    m100, m200 = payload["metrics"][0]["overall"], payload["metrics"][1]["overall"]
    logger.info(
        "wrote %s — LSO100 on-time %d/%d (%.1f%%) · LSO200 on-time %d/%d (%.1f%%) · region_map=%s",
        out_path,
        m100["numerator"], m100["denominator"], 100 * m100["rate"],
        m200["numerator"], m200["denominator"], 100 * m200["rate"],
        payload["meta"]["region_map_status"],
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
