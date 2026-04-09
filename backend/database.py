"""SQLite persistence for agent commission configs and per-deal equity overrides."""

import os
import sqlite3
from datetime import datetime

DB_PATH = os.environ.get(
    "DATABASE_PATH",
    os.path.join(os.path.dirname(os.path.abspath(__file__)), "dashboard.db"),
)


def _conn():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    conn = _conn()
    conn.executescript(
        """
        CREATE TABLE IF NOT EXISTS agent_configs (
            user_id       TEXT PRIMARY KEY,
            commission_rate REAL NOT NULL DEFAULT 0.15,
            agent_type    TEXT DEFAULT 'default',
            updated_at    TEXT
        );
        CREATE TABLE IF NOT EXISTS deal_overrides (
            opportunity_id TEXT PRIMARY KEY,
            equity_amount  REAL NOT NULL,
            updated_at     TEXT
        );
        """
    )
    conn.commit()
    conn.close()


# ── Agent configs ────────────────────────────────────────────────────

def get_agent_config(user_id):
    conn = _conn()
    row = conn.execute(
        "SELECT * FROM agent_configs WHERE user_id = ?", (user_id,)
    ).fetchone()
    conn.close()
    if row:
        return dict(row)
    return {"user_id": user_id, "commission_rate": 0.15, "agent_type": "default"}


def get_all_agent_configs():
    conn = _conn()
    rows = conn.execute("SELECT * FROM agent_configs").fetchall()
    conn.close()
    return {r["user_id"]: dict(r) for r in rows}


def set_agent_config(user_id, commission_rate, agent_type="default"):
    conn = _conn()
    conn.execute(
        """INSERT INTO agent_configs (user_id, commission_rate, agent_type, updated_at)
           VALUES (?, ?, ?, ?)
           ON CONFLICT(user_id) DO UPDATE SET
               commission_rate = excluded.commission_rate,
               agent_type     = excluded.agent_type,
               updated_at     = excluded.updated_at""",
        (user_id, commission_rate, agent_type, datetime.utcnow().isoformat()),
    )
    conn.commit()
    conn.close()


# ── Deal equity overrides ────────────────────────────────────────────

def get_all_deal_overrides():
    conn = _conn()
    rows = conn.execute("SELECT * FROM deal_overrides").fetchall()
    conn.close()
    return {r["opportunity_id"]: r["equity_amount"] for r in rows}


def set_deal_override(opportunity_id, equity_amount):
    conn = _conn()
    conn.execute(
        """INSERT INTO deal_overrides (opportunity_id, equity_amount, updated_at)
           VALUES (?, ?, ?)
           ON CONFLICT(opportunity_id) DO UPDATE SET
               equity_amount = excluded.equity_amount,
               updated_at    = excluded.updated_at""",
        (opportunity_id, equity_amount, datetime.utcnow().isoformat()),
    )
    conn.commit()
    conn.close()
