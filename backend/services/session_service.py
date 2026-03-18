"""Session management and chat history persistence."""
from __future__ import annotations

import json
from typing import Optional

from backend.models.database import get_db
from backend.models.schemas import SessionOut, ChatMessageOut


def _extract_product_specs(row) -> Optional[dict]:
    """Parse product_specs from context_json."""
    ctx_raw = row["context_json"] if row else None
    if not ctx_raw:
        return None
    try:
        ctx = json.loads(ctx_raw)
        specs = ctx.get("product_specs")
        return specs if specs else None
    except (json.JSONDecodeError, TypeError):
        return None


def get_session(session_id: str) -> Optional[SessionOut]:
    with get_db() as conn:
        row = conn.execute("SELECT * FROM sessions WHERE id=?", (session_id,)).fetchone()
    if not row:
        return None
    return SessionOut(
        id=row["id"],
        client_name=row["client_name"],
        client_email=row["client_email"],
        client_company=row["client_company"],
        client_phone=row["client_phone"],
        client_address=row["client_address"],
        status=row["status"],
        workflow_state=row["workflow_state"],
        contract_status=row["contract_status"],
        product_specs=_extract_product_specs(row),
        created_at=row["created_at"],
        updated_at=row["updated_at"],
    )


def list_sessions(status: str | None = None, limit: int = 50) -> list[SessionOut]:
    with get_db() as conn:
        if status:
            rows = conn.execute(
                "SELECT * FROM sessions WHERE status=? ORDER BY updated_at DESC LIMIT ?",
                (status, limit),
            ).fetchall()
        else:
            rows = conn.execute(
                "SELECT * FROM sessions ORDER BY updated_at DESC LIMIT ?",
                (limit,),
            ).fetchall()
    return [
        SessionOut(
            id=r["id"], client_name=r["client_name"], client_email=r["client_email"],
            client_company=r["client_company"], client_phone=r["client_phone"],
            client_address=r["client_address"], status=r["status"],
            workflow_state=r["workflow_state"], contract_status=r["contract_status"],
            product_specs=_extract_product_specs(r),
            created_at=r["created_at"], updated_at=r["updated_at"],
        )
        for r in rows
    ]


def get_chat_history(session_id: str) -> list[ChatMessageOut]:
    with get_db() as conn:
        rows = conn.execute(
            "SELECT * FROM chat_messages WHERE session_id=? ORDER BY timestamp ASC",
            (session_id,),
        ).fetchall()
    return [
        ChatMessageOut(
            id=r["id"], session_id=r["session_id"], timestamp=r["timestamp"],
            role=r["role"], phase=r["phase"], content=r["content"],
            metadata_json=r["metadata_json"],
        )
        for r in rows
    ]
