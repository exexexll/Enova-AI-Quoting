"""Database connection management.

Supports **SQLite** (local dev) and **PostgreSQL** (production).
Set ``DATABASE_URL`` env var to use PostgreSQL; without it, the app
falls back to SQLite at ``DB_PATH``.
"""
from __future__ import annotations

import logging
import os
import re
import sqlite3
from contextlib import contextmanager
from typing import TYPE_CHECKING, Any

import psycopg2
import psycopg2.extras

from backend.config import DB_PATH

if TYPE_CHECKING:
    pass

logger = logging.getLogger(__name__)

DATABASE_URL = os.getenv("DATABASE_URL")
_USE_PG = bool(DATABASE_URL)

# ---------------------------------------------------------------------------
# SQL dialect translation  (SQLite → PostgreSQL)
# ---------------------------------------------------------------------------

def _to_pg(sql: str) -> str:
    """Translate a single SQLite-dialect SQL statement to PostgreSQL."""
    s = sql.strip()
    if not s:
        return ""
    if s.upper().startswith("PRAGMA"):
        return ""

    # DDL translations
    s = re.sub(
        r"INTEGER\s+PRIMARY\s+KEY\s+AUTOINCREMENT",
        "SERIAL PRIMARY KEY",
        s,
        flags=re.IGNORECASE,
    )
    s = re.sub(r"\bBLOB\b", "BYTEA", s)
    s = s.replace(
        "REFERENCES ingredients(id)",
        "REFERENCES ingredients(id) ON DELETE SET NULL",
    )

    # Timestamp default & expression
    s = s.replace("datetime('now')", "NOW()::TEXT")

    # Parameter placeholders: ? → %s  (skip inside string literals)
    out: list[str] = []
    in_str = False
    for ch in s:
        if ch == "'":
            in_str = not in_str
        if ch == "?" and not in_str:
            out.append("%s")
        else:
            out.append(ch)
    s = "".join(out)

    # INSERT OR IGNORE → INSERT … ON CONFLICT DO NOTHING
    if re.search(r"INSERT\s+OR\s+IGNORE\s+INTO\s+(\w+)", s, re.IGNORECASE):
        table_match = re.search(r"INSERT\s+OR\s+IGNORE\s+INTO\s+(\w+)", s, re.IGNORECASE)
        table_name = table_match.group(1) if table_match else ""
        s = re.sub(
            r"INSERT\s+OR\s+IGNORE\s+INTO",
            "INSERT INTO",
            s,
            flags=re.IGNORECASE,
        )
        conflict_col = {"pricing_config": "(key)"}.get(table_name, "")
        s = s.rstrip().rstrip(";") + f" ON CONFLICT {conflict_col} DO NOTHING"

    return s


# ---------------------------------------------------------------------------
# Cursor / connection wrappers
# ---------------------------------------------------------------------------

class _NoOpCursor:
    """Returned for skipped statements (e.g. PRAGMAs on PostgreSQL)."""
    lastrowid: int | None = None
    def fetchone(self) -> None:
        return None
    def fetchall(self) -> list:
        return []


class _PGCursorProxy:
    """Wraps a psycopg2 cursor to provide sqlite3-like fetchone/fetchall."""
    def __init__(self, cursor: Any):
        self._cur = cursor
        self.lastrowid: int | None = None

    def fetchone(self) -> dict[str, Any] | None:
        try:
            row = self._cur.fetchone()
            return dict(row) if row else None
        except Exception:
            return None

    def fetchall(self) -> list[dict[str, Any]]:
        try:
            return [dict(r) for r in self._cur.fetchall()]
        except Exception:
            return []


class _ConnWrapper:
    """Unified connection interface for both backends."""

    def __init__(self, raw_conn: Any, is_pg: bool):
        self._conn = raw_conn
        self._pg = is_pg

    def execute(self, sql: str, params: Any = None) -> Any:
        if self._pg:
            translated = _to_pg(sql)
            if not translated:
                return _NoOpCursor()
            cur = self._conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
            cur.execute(translated, tuple(params) if params else None)
            return _PGCursorProxy(cur)
        return self._conn.execute(sql, params or ())

    def execute_returning_id(self, sql: str, params: Any = None) -> int | None:
        """Execute an INSERT and return the generated ``id`` column."""
        if self._pg:
            translated = _to_pg(sql)
            if not translated:
                return None
            translated = translated.rstrip().rstrip(";") + " RETURNING id"
            cur = self._conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
            cur.execute(translated, tuple(params) if params else None)
            row = cur.fetchone()
            return row["id"] if row else None
        cursor = self._conn.execute(sql, params or ())
        return cursor.lastrowid

    def executemany(self, sql: str, params_list: list[tuple]) -> None:
        if self._pg:
            translated = _to_pg(sql)
            if not translated:
                return
            cur = self._conn.cursor()
            psycopg2.extras.execute_batch(cur, translated, params_list)
        else:
            self._conn.executemany(sql, params_list)

    def executescript(self, script: str) -> None:
        """Execute a multi-statement SQL script (split on ``;``)."""
        if self._pg:
            for stmt in script.split(";"):
                stmt = stmt.strip()
                if not stmt:
                    continue
                translated = _to_pg(stmt)
                if translated:
                    cur = self._conn.cursor()
                    cur.execute(translated)
        else:
            self._conn.executescript(script)

    def commit(self) -> None:
        self._conn.commit()

    def rollback(self) -> None:
        self._conn.rollback()

    def close(self) -> None:
        self._conn.close()


# ---------------------------------------------------------------------------
# Schema (written in SQLite dialect — auto-translated for PostgreSQL)
# ---------------------------------------------------------------------------

_CREATE_TABLES = """
-- ==================== INGREDIENTS ====================

CREATE TABLE IF NOT EXISTS ingredients (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    item_name       TEXT NOT NULL,
    item_id         TEXT,
    supplier        TEXT,
    location        TEXT,
    uom             TEXT,
    c_last          REAL DEFAULT 0,
    safety_stock    REAL DEFAULT 0,
    on_hand         REAL DEFAULT 0,
    sum_cavg        REAL DEFAULT 0,
    sum_ss_cost     REAL DEFAULT 0,
    cost_kg         REAL DEFAULT 0,
    supplier_code   TEXT,
    source_tab      TEXT NOT NULL,
    category        TEXT,
    chinese_name    TEXT,
    potency         TEXT,
    form            TEXT,
    is_trademarked  INTEGER DEFAULT 0,
    warehouse       TEXT,
    moq_kg          REAL,
    price_per_kg    REAL,
    embedding       BLOB,
    needs_manual_price INTEGER DEFAULT 0,
    created_at      TEXT DEFAULT (datetime('now')),
    updated_at      TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_ingredients_name ON ingredients(item_name);
CREATE INDEX IF NOT EXISTS idx_ingredients_source ON ingredients(source_tab);
CREATE INDEX IF NOT EXISTS idx_ingredients_category ON ingredients(category);
CREATE INDEX IF NOT EXISTS idx_ingredients_manual ON ingredients(needs_manual_price);

-- ==================== SESSIONS ====================

CREATE TABLE IF NOT EXISTS sessions (
    id              TEXT PRIMARY KEY,
    client_name     TEXT,
    client_email    TEXT,
    client_company  TEXT,
    client_phone    TEXT,
    client_address  TEXT,
    status          TEXT DEFAULT 'active',
    workflow_state  TEXT DEFAULT 'intake',
    context_json    TEXT DEFAULT '{}',
    contract_status TEXT,
    created_at      TEXT DEFAULT (datetime('now')),
    updated_at      TEXT DEFAULT (datetime('now'))
);

-- ==================== CHAT MESSAGES ====================

CREATE TABLE IF NOT EXISTS chat_messages (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id      TEXT NOT NULL REFERENCES sessions(id),
    timestamp       TEXT DEFAULT (datetime('now')),
    role            TEXT NOT NULL,
    phase           TEXT,
    content         TEXT,
    metadata_json   TEXT,
    FOREIGN KEY (session_id) REFERENCES sessions(id)
);

CREATE INDEX IF NOT EXISTS idx_chat_session ON chat_messages(session_id, timestamp);

-- ==================== SESSION INGREDIENTS ====================

CREATE TABLE IF NOT EXISTS session_ingredients (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id      TEXT NOT NULL REFERENCES sessions(id),
    ingredient_id   INTEGER REFERENCES ingredients(id),
    ingredient_name TEXT NOT NULL,
    mg_per_serving  REAL,
    label_claim     TEXT,
    uom             TEXT,
    unit_cost       REAL,
    cost_source     TEXT,
    confidence      TEXT,
    est_low         REAL,
    est_high        REAL,
    similar_items   TEXT,
    created_at      TEXT DEFAULT (datetime('now'))
);

-- ==================== CLIENT UPLOADED FILES ====================

CREATE TABLE IF NOT EXISTS client_files (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id      TEXT NOT NULL REFERENCES sessions(id),
    filename        TEXT NOT NULL,
    content_type    TEXT,
    file_path       TEXT NOT NULL,
    extraction_json TEXT,
    created_at      TEXT DEFAULT (datetime('now'))
);

-- ==================== CONTRACTS ====================

CREATE TABLE IF NOT EXISTS contracts (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id      TEXT NOT NULL REFERENCES sessions(id),
    version         INTEGER DEFAULT 1,
    status          TEXT DEFAULT 'draft',
    pdf_path        TEXT,
    data_json       TEXT,
    client_name_sig TEXT,
    client_comments TEXT,
    admin_notes     TEXT,
    submitted_at    TEXT,
    accepted_at     TEXT,
    created_at      TEXT DEFAULT (datetime('now')),
    updated_at      TEXT DEFAULT (datetime('now'))
);

-- ==================== ESCALATION QUEUE ====================

CREATE TABLE IF NOT EXISTS escalation_queue (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id      TEXT NOT NULL REFERENCES sessions(id),
    client_name     TEXT,
    item_requested  TEXT NOT NULL,
    source          TEXT NOT NULL,
    quantity_needed TEXT,
    similar_items   TEXT,
    est_low         REAL,
    est_high        REAL,
    status          TEXT DEFAULT 'pending',
    confirmed_price REAL,
    admin_notes     TEXT,
    resolved_at     TEXT,
    created_at      TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_escalation_status ON escalation_queue(status);

-- ==================== PRICING CONFIG ====================

CREATE TABLE IF NOT EXISTS pricing_config (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    key             TEXT UNIQUE NOT NULL,
    value           TEXT NOT NULL,
    description     TEXT,
    updated_at      TEXT DEFAULT (datetime('now'))
);

-- ==================== MACHINE WEAR RATES ====================

CREATE TABLE IF NOT EXISTS machine_rates (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    machine_type        TEXT NOT NULL,
    model               TEXT,
    hourly_rate         REAL NOT NULL,
    setup_cost          REAL DEFAULT 0,
    cleaning_cost       REAL DEFAULT 0,
    throughput_per_hour REAL,
    maintenance_pct     REAL DEFAULT 0.05,
    notes               TEXT,
    created_at          TEXT DEFAULT (datetime('now'))
);

-- ==================== LABOR RATES ====================

CREATE TABLE IF NOT EXISTS labor_rates (
    id                      INTEGER PRIMARY KEY AUTOINCREMENT,
    role                    TEXT NOT NULL,
    hourly_rate             REAL NOT NULL,
    headcount_per_line      INTEGER DEFAULT 1,
    est_hours_per_10k_units REAL,
    overtime_multiplier     REAL DEFAULT 1.5,
    notes                   TEXT,
    created_at              TEXT DEFAULT (datetime('now'))
);

-- ==================== PACKAGING RATES ====================

CREATE TABLE IF NOT EXISTS packaging_rates (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    component_type  TEXT NOT NULL,
    description     TEXT,
    cost_per_unit   REAL NOT NULL,
    min_order_qty   INTEGER,
    lead_time_days  INTEGER,
    supplier        TEXT,
    notes           TEXT,
    created_at      TEXT DEFAULT (datetime('now'))
);

-- ==================== TRANSPORT RATES ====================

CREATE TABLE IF NOT EXISTS transport_rates (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    carrier         TEXT NOT NULL,
    service_level   TEXT,
    rate_type       TEXT NOT NULL,
    rate_value      REAL NOT NULL,
    weight_min_lbs  REAL DEFAULT 0,
    weight_max_lbs  REAL,
    zone_or_region  TEXT,
    surcharges_pct  REAL DEFAULT 0,
    notes           TEXT,
    created_at      TEXT DEFAULT (datetime('now'))
);

-- ==================== QUOTES ====================

CREATE TABLE IF NOT EXISTS quotes (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id      TEXT NOT NULL REFERENCES sessions(id),
    version         INTEGER DEFAULT 1,
    ingredient_cost_low   REAL,
    ingredient_cost_mid   REAL,
    ingredient_cost_high  REAL,
    machine_cost_low      REAL,
    machine_cost_mid      REAL,
    machine_cost_high     REAL,
    labor_cost_low        REAL,
    labor_cost_mid        REAL,
    labor_cost_high       REAL,
    packaging_cost_low    REAL,
    packaging_cost_mid    REAL,
    packaging_cost_high   REAL,
    transport_cost_low    REAL,
    transport_cost_mid    REAL,
    transport_cost_high   REAL,
    total_low             REAL,
    total_mid             REAL,
    total_high            REAL,
    margin_pct            REAL,
    breakdown_json        TEXT,
    warnings_json         TEXT,
    blockers_json         TEXT,
    created_at            TEXT DEFAULT (datetime('now'))
);
"""

_INSERT_DEFAULT_CONFIG = """
INSERT OR IGNORE INTO pricing_config (key, value, description) VALUES
    ('margin_pct', '0.30', 'Default profit margin percentage'),
    ('waste_factor_low', '0.03', 'Low waste factor for ingredient pricing'),
    ('waste_factor_mid', '0.07', 'Mid waste factor for ingredient pricing'),
    ('waste_factor_high', '0.12', 'High waste factor for ingredient pricing'),
    ('overhead_low', '0.15', 'Low overhead percentage for labor'),
    ('overhead_mid', '0.25', 'Mid overhead percentage for labor'),
    ('overhead_high', '0.35', 'High overhead percentage for labor'),
    ('efficiency_low', '0.95', 'Machine efficiency low (best case)'),
    ('efficiency_mid', '0.85', 'Machine efficiency mid'),
    ('efficiency_high', '0.75', 'Machine efficiency high (worst case)'),
    ('medium_est_floor_factor', '0.9', 'Multiply lowest similar cost by this for MEDIUM low'),
    ('medium_est_ceil_factor', '1.2', 'Multiply highest similar cost by this for MEDIUM high'),
    ('similarity_threshold', '0.85', 'Embedding similarity threshold for HIGH confidence'),
    ('bm25_score_threshold', '5.0', 'BM25 score threshold for strong keyword match')
;
"""


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def _raw_connection() -> _ConnWrapper:
    if _USE_PG:
        conn = psycopg2.connect(DATABASE_URL)
        return _ConnWrapper(conn, is_pg=True)

    conn = sqlite3.connect(str(DB_PATH), check_same_thread=False)
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    conn.row_factory = sqlite3.Row
    return _ConnWrapper(conn, is_pg=False)


def init_db():
    """Create all tables and seed default config.

    Safe for concurrent workers: if another process already created
    the schema (race on SERIAL sequence), we catch and continue.
    """
    wrapper = _raw_connection()
    try:
        wrapper.executescript(_CREATE_TABLES)
        wrapper.executescript(_INSERT_DEFAULT_CONFIG)
        wrapper.commit()
    except Exception as exc:
        wrapper.rollback()
        if _USE_PG and "already exists" in str(exc).lower():
            logger.info("Schema already created by another worker — skipping.")
        else:
            raise
    finally:
        wrapper.close()
    logger.info("Database initialised (%s)", "PostgreSQL" if _USE_PG else "SQLite")


@contextmanager
def get_db():
    """Context manager yielding a connection wrapper (auto-commit on success)."""
    wrapper = _raw_connection()
    try:
        yield wrapper
        wrapper.commit()
    except Exception:
        wrapper.rollback()
        raise
    finally:
        wrapper.close()


# ==================== Helper functions ====================

def get_config(key: str, default: str = "") -> str:
    with get_db() as conn:
        row = conn.execute("SELECT value FROM pricing_config WHERE key=?", (key,)).fetchone()
        return row["value"] if row else default


def set_config(key: str, value: str, description: str = ""):
    with get_db() as conn:
        conn.execute(
            "INSERT INTO pricing_config (key, value, description) VALUES (?,?,?) "
            "ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=datetime('now')",
            (key, value, description),
        )


def get_config_float(key: str, default: float = 0.0) -> float:
    return float(get_config(key, str(default)))
