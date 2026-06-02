# Daily refresh — setup runbook (start here)

Make the dashboard update itself every day. You do this **once** on the internal
host **`dbtools02-prod-usa-aws`** (same host that already runs the
`luckin-efficiency` / `luckin-store-ops` refresh containers). After that it's
automatic.

**Why this host:** the refresh reads the iEHR + opempefficiency databases, which
are only reachable from inside the VPC. It can't run on GitHub Actions or a
laptop. `dbtools02` can reach them and already has Docker.

---

## Before you start — gather 3 values
- **`IEHR_HOST`** and **`OPEMPEFFICIENCY_HOST`** — the RDS endpoints for
  `luckyus_iehr` and `luckyus_opempefficiency`. *Same values the
  `lkus-lso-train-dashboard` refresh uses — copy them from its `.env`.*
- **`GITHUB_TOKEN`** — a token that can push to
  `xiangyuzeng/lkus-lso-ontime-dashboard` (PAT with **Contents: write**).
  *The sibling board's refresh already has one you can reuse.*

The shared DB credential is AWS Secrets Manager secret **`collector/mysql`**
(already used by the other boards — nothing to create).

---

## The 4 steps

```bash
# 1. Log into the internal host
ssh dbtools02-prod-usa-aws

# 2. Get the code (next to the other dashboards)
cd /opt
git clone https://github.com/xiangyuzeng/lkus-lso-ontime-dashboard.git
cd lkus-lso-ontime-dashboard/pipeline
#   (already cloned before?  cd /opt/lkus-lso-ontime-dashboard && git pull && cd pipeline)

# 3. Run the helper — first run creates .env and tells you what to fill in
./setup.sh
nano .env          # set IEHR_HOST, OPEMPEFFICIENCY_HOST, GITHUB_TOKEN

# 4. Run it again — validates, builds, starts, and tails the first refresh
./setup.sh
```

`setup.sh` is just a friendly wrapper around `docker compose up -d --build`. If
you prefer, you can do steps 3–4 manually:
```bash
cp .env.example .env && nano .env      # fill the 3 values
docker compose up -d --build
docker compose logs -f
```

---

## Verify it worked (all three)
1. **Logs:** in `docker compose logs -f` you should see
   `wrote public/data.json — LSO100 … · LSO200 …`, then `[validate] OK`, then `push OK`.
2. **GitHub:** a new commit `[auto] LSO on-time data refresh …` at
   <https://github.com/xiangyuzeng/lkus-lso-ontime-dashboard/commits/main>.
3. **Live site (after ~1–2 min):**
   `curl -s https://lkus-lso-ontime-dashboard.vercel.app/data.json | grep -o '"generated_at":"[^"]*"'`
   → a timestamp from the last few minutes; the amber **SEED** chip on the site is gone.

✅ Done — it now refreshes every day at `DAILY_HOUR:DAILY_MINUTE` (`.env`, default 06:00 UTC).

---

## Everyday commands (run from `pipeline/`)
```bash
docker compose ps                 # is it running?
docker compose logs --tail=50     # recent refreshes (one block per day)
docker compose restart            # force a refresh right now
docker compose down               # stop      |   docker compose up -d   # start
git pull && docker compose up -d --build      # update to newer code
```
Change the time: edit `DAILY_HOUR` / `DAILY_MINUTE` / `DAILY_TIMEZONE` in `.env`, then `docker compose up -d`.

## If something fails (read `docker compose logs`)
| Message | Cause | Fix |
|---|---|---|
| `Can't connect to MySQL` / timeout | wrong host, or not on the VPC | check `IEHR_HOST`/`OPEMPEFFICIENCY_HOST`; confirm you're on `dbtools02` |
| `MYSQL_SECRET_NAME is not set` / Secrets Manager error | env/AWS creds | check `.env`; host role must read `collector/mysql` |
| `push HTTP 401/403` | bad/expired token | new PAT with Contents:write on the repo |
| `collect.py failed; refusing to push` | a query/validation failed | board keeps last good data (safe); see the error lines above |

The pipeline is **fail-safe**: if any step errors it does **not** push, so a bad
run never overwrites good data on the board.
