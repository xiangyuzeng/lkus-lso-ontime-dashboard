# LSO On-Time Completion Dashboard · `lkus-lso-ontime-dashboard`

Internal HR-ops board for Luckin Coffee North America (tenant `LKUS`). Shows the
**on-time certification completion rate** for **LSO100** and **LSO200**, **per
region** and **overall**, with the raw numerator **and** denominator behind every
number — not just the percentage.

```
rate = (# who earned the cert ON TIME) / (# who entered that level's training)
```

Sibling of `lkus-lso-train-dashboard` (the in-training hours tracker); it reuses
that board's confirmed, air-gapped, read-only pipeline pattern. English UI.

- **Stack:** Next.js 14 (App Router) + TypeScript, deployed to Vercel.
- **Pipeline:** Python 3.11 (`pymysql` + `boto3` + `requests`) on an internal cron host with VPC reach to the production RDS instances.
- **Refresh:** at least daily. The pipeline pushes one static JSON payload to GitHub, Vercel rebuilds on push, and the client polls the payload every 5 minutes for early pickup.

> The client **never** touches MySQL. The only network path between the public
> Vercel dashboard and the internal databases is the static `public/data.json`
> payload the pipeline commits.

---

## Definitions (confirmed with the requester)

| | Definition |
|---|---|
| **LSO100 on-time** | cumulative `effective_hours` from hire → acquisition **≤ 112** |
| **LSO200 on-time** | calendar **days** from hire → acquisition **≤ 45** |
| **Entered (denominator) — LSO100** | everyone assigned to a store dept (**active + separated**) ∪ LSO100 completers |
| **Entered (denominator) — LSO200** | LSO100 completers ∪ LSO200 completers, **excluding anyone whose current position is Barista** (Barista / Barista Trainee) — keeps the LSO200 "entered training" pool consistent with the in-training tracker |
| **In progress** | `entered − completed` (a proxy — see *Data reality*) |

## Confirmed sources (live read-only discovery, 2026-06-01)

| Concern | Server · `schema.table` | Field(s) |
|---|---|---|
| Roster / hire / store | `aws-luckyus-iehr-rw` · `t_ehr_employee` + `t_ehr_department`(type=0) | `emp_no`, `join_date` (hire), `status`, `belong_dept_id`, `d.name` (store) |
| Cert acquisition date | `aws-luckyus-iehr-rw` · `t_ehr_employee_qualification_info` ⋈ `t_ehr_yxt_certificate` on `cer_id` | `obtaining_date`; level via `template_no` (**LSO100=`KFS`**, **LSO200=`ZBZG`**) |
| Worked hours | `aws-luckyus-opempefficiency-rw` · `t_attendance` | `effective_hours` (daily), `attendance_date`, `emp_no` |
| Tenant scope | both schemas | `tenant='LKUS'` (explicit on every table) |
| Join key | `emp_no` (`US<YYMMDD><seq>`) | 100% match rate cert ↔ roster |

> Acquisition dates live in `t_ehr_employee_qualification_info` (the 资质管理 /
> Yunxuetang-LMS cert ledger), **not** `t_ehr_employee_training_record`, which is
> empty for LKUS.

## Data reality (read before interpreting the numbers)

- **In-progress training is not recorded for LKUS.** Both the "LSO### In Training"
  cer_ids (`KFSIT`/`ZBZGIT`) and `t_ehr_employee_training_record` are empty for
  LKUS; only **completed** certs exist (215 LSO100, 107 LSO200 on 2026-06-01).
  So "In progress" is the **roster minus completers**, not a tracked enrollment.
- **LSO100 on-time (≤112 worked-hours) is a deliberately hard bar.** Associates
  take ~47 calendar days on average to earn LSO100 — by then they have logged
  hundreds of effective-hours — so most exceed 112 worked-hours before certifying
  and the on-time rate is low. **That low rate is the signal**, not a bug.
- **Anomalies** — a few certs have `obtaining_date < join_date` (transfers /
  re-hires / backfills) or a null hire date. They are **excluded from on-time**
  and surfaced via `meta.data_notes` and the *Excluded* stat. They still count as
  completers in the denominator.

## Region (pending by design)

There is **no usable store→region rollup** in master data:
`t_ehr_department.parent_code` collapses all ~18 active stores into a single area
(`LKUS00000041`), and the attendance `clock_in_dept_operation_area` cross-assigns
stores across areas. So regions render **"Pending"** (one ungrouped bucket =
Overall) until HR publishes a real map.

**To wire regions on:** edit `pipeline/config/region_map.csv`
(`store_name,region`); unmapped stores stay Pending. `region_map_status` moves
`pending → partial → complete`, and the UI breaks out per region automatically.
Nothing is fabricated.

## Payload shape (`public/data.json`)

```jsonc
{
  "meta": {
    "board_id": "LCNA-HR-LSO-ONTIME-2026",
    "generated_at": "2026-06-01T06:00:00.000Z",      // ISO UTC
    "generated_by": "collect.py", "tz": "America/New_York",
    "tenant": "LKUS", "source": "confirmed",          // or "seed"
    "region_map_status": "pending",                   // pending | partial | complete
    "metrics_def":     { "LSO100": { "basis":"effective_hours","budget":112,"unit":"hours","clock_from":"hire" }, "LSO200": { "basis":"calendar_days","budget":45,"unit":"days","clock_from":"hire" } },
    "denominator_def": { "LSO100": "store roster (active+separated) ∪ LSO100 completers", "LSO200": "LSO100 completers ∪ LSO200 completers, excluding current Baristas" },
    "sources":    { "roster":"…", "cert":"…", "hours":"…" },
    "data_notes": { "lso100_anomalies": 0, "lso200_anomalies": 0 }
  },
  "metrics": [
    {
      "level": "LSO100",
      "title": "LSO100 on-time — earned within 112 worked-hours of hire",
      "definition": { "basis":"effective_hours","budget":112,"unit":"hours","clock_from":"hire" },
      "denominator_def": "store roster (active+separated) ∪ LSO100 completers",
      "overall":   { "numerator":9, "denominator":437, "rate":0.0206, "completed":215, "in_progress":222, "anomalies":0 },
      "by_region": [ { "region":"Pending", "pending":true, "store_count":18, "numerator":9, "denominator":437, "rate":0.0206, "completed":215, "in_progress":222 } ]
    },
    { "level": "LSO200", "title":"…", "overall": { … }, "by_region": [ … ] }
  ],
  "regions": ["Pending"],
  "stores":  [ { "store":"8th & Broadway", "region":"pending", "lso100_denominator":53, "lso200_denominator":19 } ]
}
```

Every cell ships the raw `numerator` + `denominator` (+ `completed`,
`in_progress`, `anomalies`). `stores[]` lists the live stores and their current
mapping, both for transparency and to seed `region_map.csv`.

## Pipeline

- **`pipeline/collect.py`** — roster + completers from iEHR, per-employee windowed
  `effective_hours` from opempefficiency, computes on-time + denominators + region
  rollup → writes `public/data.json` with `meta.source='confirmed'`.
  `build_payload()` is a pure function (DB-free, unit-tested).
- **Offline / no-DB build:** `python3 -m pipeline.collect --fixtures <dir>` reads
  `roster.json` / `completers.json` / `hours.json` instead of querying.
- **`pipeline/config/region_map.csv`** — editable `store_name,region`.
- **`pipeline/schema_probe.py`** — best-effort drift check on the five source tables.
- **`pipeline/sender/push_to_github.py`** — Contents API PUT (3 retries, 2/4/8 s).
- **`refresh.sh`** — `schema_probe → collect → validate → push`; **bails on any
  failure** so no empty/stale payload is ever pushed. Validation requires
  `meta.source='confirmed'`, non-empty `metrics`, and `numerator ≤ denominator`,
  `0 ≤ rate ≤ 1` in every cell.

See **DEPLOY.md** and **crontab.example** for the cron-host setup. The canonical
refresh is Mode A (pymysql + AWS Secrets Manager on the internal host); Mode C
(a scheduled Claude Code agent, `refresh_prompt.md`) is the fallback.

## Seed / demo

The committed `public/data.json` is a **SEED** payload (`meta.source='seed'`),
grounded in the live per-store counts so it is realistic, but with LSO100 on-time
estimated. The `SeedBadge` stays visible until the pipeline overwrites it with
`source='confirmed'`. `npm run dev` / `npm run build` work with **zero DB access**.

## Local dev

```bash
npm install
npm run dev      # http://localhost:3000 — renders against public/data.json
npm run build    # production build; final acceptance gate
```

## Acceptance gates

1. `npm run build` → zero TypeScript / lint errors.
2. `npm run dev` → SeedBadge visible, FreshnessBadge shows a real age, two metric
   cards render with Overall rate-bars + raw counts, region rows show `N / D`, the
   region-pending banner shows, and the stores table lists 18 stores as *pending*.
3. Pipeline dry-run: `python3 -m pipeline.collect --fixtures <dir>` (or live on the
   internal host) writes a valid payload with `meta.source='confirmed'`, non-empty
   `metrics`, and `numerator ≤ completed ≤ denominator` everywhere.
4. Region test: fill two stores' region in `region_map.csv` → rebuild → those
   stores form their own region bars and `region_map_status` becomes `partial`.

## File map

```
app/            page.tsx (header + metric cards + stores table), layout.tsx, globals.css
lib/            types.ts (payload contract), payload.ts (usePayload), freshness.ts, tokens.ts
components/     MetricCard.tsx, RateBar.tsx, FreshnessBadge.tsx, SeedBadge.tsx, KpiCard.tsx
public/         data.json (SEED; overwritten by the pipeline)
pipeline/       self-contained collection system (own Docker build context)
  refresh.sh, collect.py, schema_probe.py, config/{settings.py,region_map.csv},
  sender/push_to_github.py, scheduler/cron_runner.py,
  Dockerfile · docker-compose.yml · .dockerignore · .env.example · SETUP.md · setup.sh
crontab.example · refresh_prompt.md · vercel.json · .github/workflows/refresh.yml
```

## Safety / read-only guarantees

- All SQL is built in `pipeline/collect.py` / `schema_probe.py` and passes
  `assert_read_only()` (rejects insert/update/delete/drop/truncate/replace/alter/
  grant/revoke/create) before execute.
- `GITHUB_TOKEN` and the MySQL secret are read from the environment / AWS Secrets
  Manager at runtime; never committed.
- PII: the payload carries no employee names — only counts and store names.
