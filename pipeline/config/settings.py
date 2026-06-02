"""
Credential and connection settings.

This board reads TWO databases that live on TWO SEPARATE RDS instances:
    luckyus_iehr             on  aws-luckyus-iehr-rw
    luckyus_opempefficiency  on  aws-luckyus-opempefficiency-rw

Connection model:
  • CREDENTIALS (username / password) come uniformly from ONE AWS Secrets Manager
    secret, named by MYSQL_SECRET_NAME (no default — the host must set it).
  • Each INSTANCE ENDPOINT (host + port) comes from its OWN env vars, one pair per
    database: IEHR_HOST/IEHR_PORT and OPEMPEFFICIENCY_HOST/OPEMPEFFICIENCY_PORT.
    These are the ONLY source of the endpoint — any "host"/"port" inside the secret
    is IGNORED. The two instances may use DIFFERENT ports. There is NO fallback for
    the host: if the required *_HOST var is missing the pipeline logs an error and
    exits (it never guesses an endpoint).
    Port precedence per DB: {DB}_PORT  >  inline `host:port` in {DB}_HOST  >  shared
    MYSQL_PORT  >  3306.

Expected secret payload — credentials only; any "host"/"port" key is ignored:

    {
      "username": "...",
      "password": "..."
    }

For lower-friction local runs you can instead set MYSQL_USER + MYSQL_PASSWORD
directly and skip Secrets Manager. Endpoints still come only from the per-instance
*_HOST / *_PORT envs.
"""
from __future__ import annotations

import json
import logging
import os
import sys
from dataclasses import dataclass
from typing import Any

logger = logging.getLogger(__name__)

DEFAULT_REGION = os.environ.get("AWS_REGION", "us-east-1")
TENANT = os.environ.get("LUCKIN_TENANT", "LKUS")

# Two databases we read from. Each one lives on its own RDS instance in prod,
# so the secret's "host" field can only point at one of them. The IEHR_HOST /
# OPEMPEFFICIENCY_HOST env overrides redirect each connect() to the right
# endpoint without needing extra secrets.
IEHR_DB           = "luckyus_iehr"
OPEMPEFFICIENCY_DB = "luckyus_opempefficiency"

# Logical source labels surfaced in payload meta (and in the README source table).
# Cert acquisitions live in the qualification table joined to the Yunxuetang LMS
# cert master — NOT t_ehr_employee_training_record, which is empty for LKUS.
CERT_SOURCE   = f"{IEHR_DB}.t_ehr_employee_qualification_info"
ATTEND_SOURCE = f"{OPEMPEFFICIENCY_DB}.t_attendance"
COURSE_SOURCE = f"{OPEMPEFFICIENCY_DB}.t_working_time_apply"

# GitHub push config — consumed by pipeline/sender/push_to_github.py.
GITHUB_TOKEN     = os.environ.get("GITHUB_TOKEN", "")
GITHUB_REPO      = os.environ.get("GITHUB_REPO", "xiangyuzeng/lkus-lso-ontime-dashboard")
GITHUB_BRANCH    = os.environ.get("GITHUB_BRANCH", "main")
GITHUB_FILE_PATH = os.environ.get("GITHUB_FILE_PATH", "public/data.json")

# Where the local payload lives relative to repo root.
LOCAL_PAYLOAD_PATH = "public/data.json"

LOG_DIR = os.environ.get("LOG_DIR", "logs")


@dataclass(frozen=True)
class DbCredentials:
    # Credentials only — NO host/port. The endpoint (host + port) is resolved
    # separately and comes exclusively from the per-instance *_HOST / *_PORT envs.
    user: str
    password: str


def _read_secret() -> dict[str, Any]:
    secret_name = os.environ.get("MYSQL_SECRET_NAME")
    if not secret_name:
        raise RuntimeError(
            "MYSQL_SECRET_NAME is not set. The pipeline refuses to run without an explicit "
            "Secrets Manager secret name; set it in the environment or pass via CI secrets. "
            "Alternatively set MYSQL_USER + MYSQL_PASSWORD for direct-env mode."
        )
    import boto3  # lazy import — settings.py stays importable in envs without boto3
    client = boto3.client("secretsmanager", region_name=DEFAULT_REGION)
    resp = client.get_secret_value(SecretId=secret_name)
    payload = resp.get("SecretString")
    if not payload:
        raise RuntimeError(f"Secret {secret_name} has no SecretString payload")
    return json.loads(payload)


def _load_credentials() -> DbCredentials:
    # Path B: direct env credentials (local dev). No host/port — the endpoint
    # always comes from the per-instance *_HOST / *_PORT envs. Set MYSQL_USER.
    if os.environ.get("MYSQL_USER"):
        return DbCredentials(
            user=os.environ["MYSQL_USER"],
            password=os.environ.get("MYSQL_PASSWORD", ""),
        )
    # Path A (default): AWS Secrets Manager — credentials only. Any "host"/"port"
    # in the secret is ignored; the endpoint comes from the per-DB *_HOST/*_PORT.
    raw = _read_secret()
    user = raw.get("username") or raw.get("user")
    if not user:
        raise RuntimeError("Secret has neither 'username' nor 'user' key")
    password = raw.get("password")
    if not password:
        raise RuntimeError("Secret has no 'password' key")
    return DbCredentials(user=user, password=password)


# Per-database instance endpoint. iEHR and opempefficiency live on separate RDS
# instances, so each database maps to its OWN host + port env vars. These are the
# ONLY source of the endpoint — the secret's host/port is never used.
#   {db: (host_env, port_env)}
_DB_ENDPOINT_ENV: dict[str, tuple[str, str]] = {
    IEHR_DB:            ("IEHR_HOST", "IEHR_PORT"),
    OPEMPEFFICIENCY_DB: ("OPEMPEFFICIENCY_HOST", "OPEMPEFFICIENCY_PORT"),
}


def _split_host_port(raw: str) -> tuple[str, str | None]:
    """Allow an endpoint written as `host:port`. Splits on the LAST colon only
    when the tail is all digits (RDS FQDNs contain no colon, so this is safe)."""
    host, _, tail = raw.rpartition(":")
    if host and tail.isdigit():
        return host, tail
    return raw, None


def _resolve_endpoint(database: str) -> tuple[str, int]:
    """(host, port) for `database`, EXCLUSIVELY from its per-instance env vars.
    Port precedence: explicit {DB}_PORT  >  inline `host:port`  >  shared
    MYSQL_PORT  >  3306. Host is required — if its *_HOST var is missing, log and
    exit (no fallback, never guess)."""
    keys = _DB_ENDPOINT_ENV.get(database)
    host_key, port_key = keys if keys else (None, None)
    raw_host = os.environ.get(host_key) if host_key else None
    if not raw_host:
        logger.error(
            "Required endpoint env var %s is not set (database %r). "
            "Set it to that instance's RDS host. Aborting.",
            host_key or f"<no mapping for {database}>", database,
        )
        sys.exit(1)
    host, inline_port = _split_host_port(raw_host)
    port = (
        (os.environ.get(port_key) if port_key else None)
        or inline_port
        or os.environ.get("MYSQL_PORT")
        or "3306"
    )
    return host, int(port)


def connect(database: str):
    """Return a pymysql connection. SELECT-only by convention — assert_read_only()
    rejects any write keyword before each execute()."""
    import pymysql  # lazy import
    host, port = _resolve_endpoint(database)
    creds = _load_credentials()
    return pymysql.connect(
        host=host,
        port=port,
        user=creds.user,
        password=creds.password,
        database=database,
        charset="utf8mb4",
        cursorclass=pymysql.cursors.DictCursor,  # type: ignore[union-attr]
        autocommit=True,
        connect_timeout=15,
        read_timeout=180,
    )


_WRITE_KEYWORDS = (
    " insert ", " update ", " delete ", " drop ", " truncate ",
    " replace ", " alter ", " grant ", " revoke ", " create ",
)


def assert_read_only(sql: str) -> None:
    """Defense-in-depth: reject any SQL containing a write keyword. Collectors
    only build SELECT statements; this check fails fast if a future edit
    introduces one."""
    lowered = f" {sql.lower()} "
    for kw in _WRITE_KEYWORDS:
        if kw in lowered:
            raise RuntimeError(f"Write keyword detected in SQL: {kw.strip()}")
