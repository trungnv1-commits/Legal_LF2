"""Database module -- PostgreSQL (production) or SQLite (dev/test).

When DATABASE_URL env var is set -> connects to PostgreSQL.
When DATABASE_URL is empty      -> falls back to local SQLite.
"""

import os
import re
import sqlite3

_connection = None
_db_path: str | None = None


def _use_pg() -> bool:
    return bool(os.environ.get("DATABASE_URL", ""))


def get_db():
    """Get the shared database connection."""
    global _connection, _db_path
    if _connection is not None:
        return _connection

    if _use_pg():
        import psycopg2
        url = os.environ["DATABASE_URL"]
        raw = psycopg2.connect(url)
        _connection = PGConnectionWrapper(raw)
    else:
        if _db_path is None:
            _db_path = os.environ.get(
                "LEGAL_DB_PATH",
                os.path.join(os.path.dirname(__file__), "..", "..", "legal.db"),
            )
        raw = sqlite3.connect(_db_path, check_same_thread=False)
        raw.row_factory = sqlite3.Row
        raw.execute("PRAGMA journal_mode=WAL")
        raw.execute("PRAGMA foreign_keys=ON")
        _connection = raw
    return _connection


def init_db():
    """Create all tables if they do not exist."""
    db = get_db()
    if _use_pg():
        db.executescript(SCHEMA_PG)
    else:
        db.executescript(SCHEMA_SQLITE)
    db.commit()


def reset_db(path: str = ":memory:"):
    """Reset database (tests). Always SQLite."""
    global _connection, _db_path
    if _connection:
        try:
            _connection.close()
        except Exception:
            pass
    _db_path = path
    _connection = None
    old_url = os.environ.pop("DATABASE_URL", None)
    init_db()
    if old_url:
        os.environ["DATABASE_URL"] = old_url


def table_has_data(table_name: str) -> bool:
    db = get_db()
    row = db.execute(f"SELECT COUNT(*) as cnt FROM {table_name}").fetchone()
    if isinstance(row, dict):
        return row.get("cnt", 0) > 0
    return row[0] > 0


class PGCursorWrapper:
    def __init__(self, cur):
        self._cur = cur
    def fetchone(self):
        try: return self._cur.fetchone()
        except Exception: return None
    def fetchall(self):
        try: return self._cur.fetchall()
        except Exception: return []


class PGConnectionWrapper:
    """Wraps psycopg2 connection for sqlite3-compatible API."""
    def __init__(self, conn):
        self._conn = conn

    def execute(self, sql, params=None):
        import psycopg2.extras
        sql = _translate_sql(sql)
        params = _translate_params(params)
        cur = self._conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        try:
            cur.execute(sql, params or None)
        except Exception as e:
            self._conn.rollback()
            raise e
        return PGCursorWrapper(cur)

    def executescript(self, sql):
        sql = _translate_schema(sql)
        cur = self._conn.cursor()
        cur.execute(sql)
        self._conn.commit()
        cur.close()

    def commit(self):
        self._conn.commit()

    def close(self):
        self._conn.close()

def _translate_sql(sql: str) -> str:
    if "INSERT OR IGNORE" in sql:
        sql = sql.replace("INSERT OR IGNORE", "INSERT")
        sql = sql.rstrip().rstrip(";")
        sql += " ON CONFLICT DO NOTHING"
    sql = sql.replace("?", "%s")
    sql = re.sub(r'(?<!:):(\w+)', r'%(\1)s', sql)
    return sql


def _translate_params(params):
    if params is None: return None
    if isinstance(params, (list, tuple)): return tuple(params)
    return params


def _translate_schema(sql: str) -> str:
    sql = sql.replace("INTEGER PRIMARY KEY AUTOINCREMENT", "SERIAL PRIMARY KEY")
    sql = sql.replace(
        "INSERT OR IGNORE INTO tsi_counter (id, counter) VALUES (1, 0)",
        "INSERT INTO tsi_counter (id, counter) VALUES (1, 0) ON CONFLICT (id) DO NOTHING"
    )
    return sql

SCHEMA_SQLITE = """
CREATE TABLE IF NOT EXISTS tst (
    tst_id TEXT PRIMARY KEY,
    tst_code TEXT NOT NULL,
    tst_name TEXT NOT NULL,
    tst_level INTEGER NOT NULL,
    my_parent_task TEXT,
    description TEXT,
    sla_days INTEGER,
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS tnt (
    tnt_id TEXT PRIMARY KEY,
    from_tst_id TEXT NOT NULL,
    to_tst_id TEXT NOT NULL,
    condition_expression TEXT,
    condition_description TEXT,
    priority INTEGER,
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS tdt (
    tdt_id TEXT PRIMARY KEY,
    tdt_code TEXT NOT NULL,
    tdt_name TEXT NOT NULL,
    description TEXT,
    file_extensions TEXT,
    max_file_size_mb INTEGER,
    is_required INTEGER DEFAULT 0,
    tdtp_id TEXT,
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS tdtp (
    tdtp_id TEXT PRIMARY KEY,
    tdt_id TEXT NOT NULL,
    tdtp_code TEXT NOT NULL,
    tdtp_name TEXT NOT NULL,
    description TEXT,
    template_file_ref TEXT,
    template_structure TEXT,
    sample_data TEXT,
    version INTEGER NOT NULL DEFAULT 1,
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS trt (
    trt_id TEXT PRIMARY KEY,
    trt_code TEXT NOT NULL,
    trt_name TEXT NOT NULL,
    description TEXT,
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS tst_trt (
    tst_id TEXT NOT NULL,
    trt_id TEXT NOT NULL,
    is_required INTEGER DEFAULT 0,
    PRIMARY KEY (tst_id, trt_id)
);

CREATE TABLE IF NOT EXISTS emp (
    emp_id TEXT PRIMARY KEY,
    emp_code TEXT NOT NULL UNIQUE,
    emp_name TEXT NOT NULL,
    email TEXT NOT NULL,
    department TEXT,
    position TEXT,
    grade_code TEXT,
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS tsi (
    tsi_id TEXT PRIMARY KEY,
    tsi_code TEXT NOT NULL,
    tst_id TEXT NOT NULL,
    my_parent_task TEXT,
    title TEXT NOT NULL,
    description TEXT,
    status TEXT NOT NULL,
    priority TEXT,
    requested_by TEXT,
    assigned_to TEXT,
    due_date TEXT,
    actual_completion_date TEXT,
    current_tst_level INTEGER,
    current_tst_id TEXT,
    metadata TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS tsi_counter (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    counter INTEGER NOT NULL DEFAULT 0
);
INSERT OR IGNORE INTO tsi_counter (id, counter) VALUES (1, 0);

CREATE TABLE IF NOT EXISTS tdi (
    tdi_id TEXT PRIMARY KEY,
    tdt_id TEXT NOT NULL,
    tsi_id TEXT NOT NULL,
    file_name TEXT NOT NULL,
    file_url TEXT NOT NULL,
    file_size_bytes INTEGER,
    version INTEGER NOT NULL DEFAULT 1,
    uploaded_by TEXT NOT NULL,
    uploaded_at TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'ACTIVE',
    notes TEXT,
    link_url TEXT
);

CREATE TABLE IF NOT EXISTS tsev (
    tsev_id TEXT PRIMARY KEY,
    tsi_id TEXT NOT NULL,
    event_type TEXT NOT NULL,
    emp_id TEXT NOT NULL,
    event_data TEXT,
    tdi_id TEXT,
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS tri (
    tri_id TEXT PRIMARY KEY,
    trt_id TEXT NOT NULL,
    tsi_id TEXT,
    emp_id TEXT NOT NULL,
    assigned_at TEXT NOT NULL,
    is_active INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS tsi_filter (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tsi_id TEXT NOT NULL,
    filter_type TEXT NOT NULL,
    filter_code TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS tst_filter (
    tst_id TEXT NOT NULL,
    filter_type TEXT NOT NULL,
    filter_code TEXT NOT NULL,
    PRIMARY KEY (tst_id, filter_type, filter_code)
);

CREATE TABLE IF NOT EXISTS tst_tdt (
    tst_id TEXT NOT NULL,
    tdt_id TEXT NOT NULL,
    is_required INTEGER DEFAULT 0,
    PRIMARY KEY (tst_id, tdt_id)
);
"""

SCHEMA_PG = """
CREATE TABLE IF NOT EXISTS tst (
    tst_id TEXT PRIMARY KEY,
    tst_code TEXT NOT NULL,
    tst_name TEXT NOT NULL,
    tst_level INTEGER NOT NULL,
    my_parent_task TEXT,
    description TEXT,
    sla_days INTEGER,
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS tnt (
    tnt_id TEXT PRIMARY KEY,
    from_tst_id TEXT NOT NULL,
    to_tst_id TEXT NOT NULL,
    condition_expression TEXT,
    condition_description TEXT,
    priority INTEGER,
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS tdt (
    tdt_id TEXT PRIMARY KEY,
    tdt_code TEXT NOT NULL,
    tdt_name TEXT NOT NULL,
    description TEXT,
    file_extensions TEXT,
    max_file_size_mb INTEGER,
    is_required INTEGER DEFAULT 0,
    tdtp_id TEXT,
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS tdtp (
    tdtp_id TEXT PRIMARY KEY,
    tdt_id TEXT NOT NULL,
    tdtp_code TEXT NOT NULL,
    tdtp_name TEXT NOT NULL,
    description TEXT,
    template_file_ref TEXT,
    template_structure TEXT,
    sample_data TEXT,
    version INTEGER NOT NULL DEFAULT 1,
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS trt (
    trt_id TEXT PRIMARY KEY,
    trt_code TEXT NOT NULL,
    trt_name TEXT NOT NULL,
    description TEXT,
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS tst_trt (
    tst_id TEXT NOT NULL,
    trt_id TEXT NOT NULL,
    is_required INTEGER DEFAULT 0,
    PRIMARY KEY (tst_id, trt_id)
);

CREATE TABLE IF NOT EXISTS emp (
    emp_id TEXT PRIMARY KEY,
    emp_code TEXT NOT NULL UNIQUE,
    emp_name TEXT NOT NULL,
    email TEXT NOT NULL,
    department TEXT,
    position TEXT,
    grade_code TEXT,
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS tsi (
    tsi_id TEXT PRIMARY KEY,
    tsi_code TEXT NOT NULL,
    tst_id TEXT NOT NULL,
    my_parent_task TEXT,
    title TEXT NOT NULL,
    description TEXT,
    status TEXT NOT NULL,
    priority TEXT,
    requested_by TEXT,
    assigned_to TEXT,
    due_date TEXT,
    actual_completion_date TEXT,
    current_tst_level INTEGER,
    current_tst_id TEXT,
    metadata TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS tsi_counter (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    counter INTEGER NOT NULL DEFAULT 0
);
INSERT INTO tsi_counter (id, counter) VALUES (1, 0) ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS tdi (
    tdi_id TEXT PRIMARY KEY,
    tdt_id TEXT NOT NULL,
    tsi_id TEXT NOT NULL,
    file_name TEXT NOT NULL,
    file_url TEXT NOT NULL,
    file_size_bytes INTEGER,
    version INTEGER NOT NULL DEFAULT 1,
    uploaded_by TEXT NOT NULL,
    uploaded_at TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'ACTIVE',
    notes TEXT,
    link_url TEXT
);

CREATE TABLE IF NOT EXISTS tsev (
    tsev_id TEXT PRIMARY KEY,
    tsi_id TEXT NOT NULL,
    event_type TEXT NOT NULL,
    emp_id TEXT NOT NULL,
    event_data TEXT,
    tdi_id TEXT,
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS tri (
    tri_id TEXT PRIMARY KEY,
    trt_id TEXT NOT NULL,
    tsi_id TEXT,
    emp_id TEXT NOT NULL,
    assigned_at TEXT NOT NULL,
    is_active INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS tsi_filter (
    id SERIAL PRIMARY KEY,
    tsi_id TEXT NOT NULL,
    filter_type TEXT NOT NULL,
    filter_code TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS tst_filter (
    tst_id TEXT NOT NULL,
    filter_type TEXT NOT NULL,
    filter_code TEXT NOT NULL,
    PRIMARY KEY (tst_id, filter_type, filter_code)
);

CREATE TABLE IF NOT EXISTS tst_tdt (
    tst_id TEXT NOT NULL,
    tdt_id TEXT NOT NULL,
    is_required INTEGER DEFAULT 0,
    PRIMARY KEY (tst_id, tdt_id)
);
"""

SCHEMA = SCHEMA_SQLITE
