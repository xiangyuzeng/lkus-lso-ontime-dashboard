"""
Credential and connection settings.

Pattern lifted from /app/luckin-store-ops-dashboard/pipeline/config/settings.py.
Credentials are pulled from AWS Secrets Manager — the secret name is read from
MYSQL_SECRET_NAME and never has a default, so the runtime host must set it
explicitly. Expected secret payload (matches the canonical `collector/mysql`
schema already in use by the sibling pipelines):

    {
      "host":     "...",
      "port":     3306,
      "username": "...",
      "password": "...",
      "dbname":   "luckyus_iehr"        // optional default DB; we override
    }

For lower-friction local runs you can set MYSQL_HOST + MYSQL_USER +
MYSQL_PASSWORD directly and skip Secrets Manager entirely.
"""
from __future__ import annotations

import json
import os
from dataclasses import dataclass
from typing import Any

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
    host: str
    port: int
    user: str
    password: str
    database: str


def _read_secret() -> dict[str, Any]:
    secret_name = os.environ.get("MYSQL_SECRET_NAME")
    if not secret_name:
        raise RuntimeError(
            "MYSQL_SECRET_NAME is not set. The pipeline refuses to run without an explicit "
            "Secrets Manager secret name; set it in the environment or pass via CI secrets. "
            "Alternatively set MYSQL_HOST + MYSQL_USER + MYSQL_PASSWORD for direct-env mode."
        )
    import boto3  # lazy import — settings.py stays importable in envs without boto3
    client = boto3.client("secretsmanager", region_name=DEFAULT_REGION)
    resp = client.get_secret_value(SecretId=secret_name)
    payload = resp.get("SecretString")
    if not payload:
        raise RuntimeError(f"Secret {secret_name} has no SecretString payload")
    return json.loads(payload)


def _load_credentials() -> DbCredentials:
    # Path B: direct env vars. Set MYSQL_HOST to enable this branch.
    if os.environ.get("MYSQL_HOST"):
        return DbCredentials(
            host=os.environ["MYSQL_HOST"],
            port=int(os.environ.get("MYSQL_PORT", "3306")),
            user=os.environ["MYSQL_USER"],
            password=os.environ["MYSQL_PASSWORD"],
            database=os.environ.get("MYSQL_DATABASE", IEHR_DB),
        )
    # Path A (default): AWS Secrets Manager.
    raw = _read_secret()
    user = raw.get("username") or raw.get("user")
    if not user:
        raise RuntimeError("Secret has neither 'username' nor 'user' key")
    return DbCredentials(
        host=raw["host"],
        port=int(raw.get("port", 3306)),
        user=user,
        password=raw["password"],
        database=raw.get("dbname") or raw.get("database") or IEHR_DB,
    )


# Per-database host override. Production stores iEHR and opempefficiency on
# separate RDS instances; if MYSQL_SECRET_NAME's host can only reach one,
# set the other via these env vars.
_DB_HOST_ENV_KEYS: dict[str, str] = {
    IEHR_DB:            "IEHR_HOST",
    OPEMPEFFICIENCY_DB: "OPEMPEFFICIENCY_HOST",
}


def _resolve_host(database: str, secret_host: str) -> str:
    env_key = _DB_HOST_ENV_KEYS.get(database)
    if env_key:
        override = os.environ.get(env_key)
        if override:
            return override
    return secret_host


def connect(database: str):
    """Return a pymysql connection. SELECT-only by convention — assert_read_only()
    rejects any write keyword before each execute()."""
    import pymysql  # lazy import
    creds = _load_credentials()
    host = _resolve_host(database, creds.host)
    return pymysql.connect(
        host=host,
        port=creds.port,
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
