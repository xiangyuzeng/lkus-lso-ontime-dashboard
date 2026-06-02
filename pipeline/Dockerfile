# LSO on-time refresh container — the self-contained collection system.
# APScheduler runs the tested refresh.sh (schema_probe → collect → validate →
# push) once on startup and then daily; Vercel auto-rebuilds when the pushed
# public/data.json lands in the GitHub repo.
#
# Build context = this pipeline/ directory (NOT the repo root — the frontend is
# built and deployed separately).
#   docker compose up -d --build        # run from pipeline/
FROM python:3.11-slim

WORKDIR /workspace

# bash (refresh.sh uses bashisms) + CA certs (HTTPS to Secrets Manager + GitHub).
RUN apt-get update \
    && apt-get install -y --no-install-recommends bash ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Install deps first for layer caching. apscheduler is only needed by the
# container entrypoint, so it is added here rather than in requirements.txt.
COPY requirements.txt /tmp/requirements.txt
RUN pip install --no-cache-dir -r /tmp/requirements.txt apscheduler==3.10.4 && rm /tmp/requirements.txt

# Copy the whole pipeline package (build context = pipeline/) into a `pipeline/`
# subdir so `python -m pipeline.X` resolves with /workspace on sys.path. public/
# is (re)generated each run.
COPY . /workspace/pipeline
RUN chmod +x /workspace/pipeline/refresh.sh && mkdir -p /workspace/public /workspace/logs

ENV PYTHONUNBUFFERED=1

CMD ["python", "-m", "pipeline.scheduler.cron_runner"]
