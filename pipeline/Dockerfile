# LSO on-time refresh container — APScheduler runs the tested refresh.sh
# (schema_probe → collect → validate → push) once on startup and then daily;
# Vercel auto-rebuilds when public/data.json is pushed.
#
# Build context = repo root:
#   docker compose -f pipeline/docker-compose.yml up -d --build
FROM python:3.11-slim

WORKDIR /workspace

# bash (refresh.sh uses bashisms) + CA certs (HTTPS to Secrets Manager + GitHub).
RUN apt-get update \
    && apt-get install -y --no-install-recommends bash ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Install deps first for layer caching. apscheduler is only needed by the
# container entrypoint, so it is added here rather than in requirements.txt.
COPY pipeline/requirements.txt /tmp/requirements.txt
RUN pip install --no-cache-dir -r /tmp/requirements.txt apscheduler==3.10.4 && rm /tmp/requirements.txt

# refresh.sh (repo root) + the pipeline package. public/ is (re)generated each run.
COPY refresh.sh /workspace/refresh.sh
COPY pipeline /workspace/pipeline
RUN mkdir -p /workspace/public /workspace/logs && chmod +x /workspace/refresh.sh

ENV PYTHONUNBUFFERED=1

CMD ["python", "pipeline/scheduler/cron_runner.py"]
