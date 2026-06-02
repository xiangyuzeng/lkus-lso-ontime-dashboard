# Deploy — `lkus-lso-ontime-dashboard`

Air-gapped pattern: an internal cron host runs the pipeline (read-only SQL),
commits `public/data.json` to GitHub, and Vercel rebuilds on push. The public
site never reaches the database.

## 1. Prerequisites
- Internal host (e.g. `dbtools02-prod-usa-aws`) with VPC reach to the iEHR and
  opempefficiency RDS instances, Python 3.11, and `pip install -r pipeline/requirements.txt`.
- AWS Secrets Manager secret (canonical `collector/mysql`) — same shape as the
  sibling pipelines: `{host, port, username, password, dbname}`.
- A GitHub repo `xiangyuzeng/lkus-lso-ontime-dashboard` (**public**) and a Vercel
  project linked to it (framework auto-detected as Next.js).

## 2. Environment (cron host)
```bash
export AWS_REGION=us-east-1
export MYSQL_SECRET_NAME=collector/mysql          # shared username + password only
export IEHR_HOST=<iehr-rds-endpoint>              # REQUIRED — iEHR instance endpoint
export OPEMPEFFICIENCY_HOST=<opemp-rds-endpoint>  # REQUIRED — opempefficiency endpoint
export GITHUB_TOKEN=ghp_xxx                       # repo-scope fine-grained PAT
export GITHUB_REPO=xiangyuzeng/lkus-lso-ontime-dashboard
export GITHUB_BRANCH=main
export GITHUB_FILE_PATH=public/data.json
```
The two source DBs live on separate RDS instances. Credentials come ONLY from the
secret; each endpoint comes ONLY from its `IEHR_HOST` / `OPEMPEFFICIENCY_HOST` (the
secret's `host` is never used). Both are required — a missing one aborts the run.
Different ports? add `IEHR_PORT` / `OPEMPEFFICIENCY_PORT` (or inline `host:port`).

## 3. One-time GitHub + Vercel setup
1. Create the public repo and push this project.
2. Import the repo in Vercel → it builds with `npm install && npm run build`.
3. The committed `public/data.json` (SEED) makes the first deploy render immediately.

## 4. Schedule the refresh (Mode A — primary)
```bash
sudo cp /opt/lkus-lso-ontime-dashboard/crontab.example /tmp/lso-ontime.cron
# edit the path/env, then:
crontab -l 2>/dev/null | cat - /tmp/lso-ontime.cron | crontab -
```
`refresh.sh` runs `schema_probe → collect → validate → push` and **bails on any
failure**, so a broken run never publishes an empty or stale payload. Daily is
the floor; hourly is fine (the data moves slowly).

## 5. Fallback (Mode C — Claude Code agent)
If the cron host is unavailable, an operator can run the refresh via a scheduled
Claude Code agent — see `refresh_prompt.md` and the commented Mode C line in
`crontab.example`.

## 6. Verify
- `python3 -m pipeline.collect` writes `public/data.json` with
  `meta.source='confirmed'`, non-empty `metrics`, and `numerator ≤ denominator`
  in every cell (the refresh.sh validator enforces this).
- After push, the Vercel deployment shows the updated `generated_at` and the
  SeedBadge disappears (source flips seed → confirmed).
- Reconcile a headline number against a manual query, e.g. LSO200 completers and
  on-time(≤45d) by store.
