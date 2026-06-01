# Daily refresh — container deploy (the actual scheduler)

The board updates daily via a small **APScheduler container** that runs the
tested `refresh.sh` (`schema_probe → collect → validate → push`) once on startup
and then every day at the configured time. It is the same pattern the
`luckin-efficiency` / `luckin-store-ops` boards run on **`dbtools02-prod-usa-aws`**.

> Why a container (not GitHub Actions): the collector needs VPC reach to the
> iEHR + opempefficiency RDS instances and AWS Secrets Manager. GitHub-hosted
> runners can't reach those; `dbtools02` can.

## Deploy (one time, on `dbtools02-prod-usa-aws`)

```bash
# clone or pull the repo to the standard location
cd /opt/lkus-lso-ontime-dashboard && git pull   # or: git clone … /opt/lkus-lso-ontime-dashboard

cd pipeline
cp .env.example .env
#   edit .env →  MYSQL_SECRET_NAME, IEHR_HOST, OPEMPEFFICIENCY_HOST, GITHUB_TOKEN

docker compose up -d --build      # builds, starts; runs the first refresh immediately
docker compose logs -f            # watch the first run publish a confirmed payload
```

On the first run the board flips from the seed payload to a **confirmed** one
(`meta.source='confirmed'`), Vercel auto-rebuilds on the `public/data.json`
push, and from then on it refreshes daily at `DAILY_HOUR:DAILY_MINUTE`
(`DAILY_TIMEZONE`, default 06:00 UTC).

## Operate

```bash
docker compose ps                 # status
docker compose logs --tail=100    # recent runs (one log line per refresh)
docker compose restart            # re-run immediately (startup triggers a refresh)
docker compose down               # stop (pins project name so siblings are untouched)
```

Change the schedule by editing `DAILY_HOUR` / `DAILY_MINUTE` / `DAILY_TIMEZONE`
in `.env`, then `docker compose up -d`.

## Ad-hoc / fallback

- One-off refresh without the container: `bash refresh.sh` (same env vars).
- The `.github/workflows/refresh.yml` workflow can also run it, but only on a
  **self-hosted runner** with VPC reach — leave it `workflow_dispatch`-only
  unless such a runner is registered.
