"""Excel export services for R&D sample requests and client info recording."""
from __future__ import annotations

import json
import logging
from datetime import datetime
from pathlib import Path

import openpyxl
from openpyxl.styles import Font, PatternFill, Alignment

from backend.config import EXPORTS_DIR, CLIENT_RECORDS_DIR
from backend.models.database import get_db

logger = logging.getLogger(__name__)

_HEADER_FONT = Font(bold=True, size=11)
_HEADER_FILL = PatternFill(start_color="4472C4", end_color="4472C4", fill_type="solid")
_HEADER_FONT_WHITE = Font(bold=True, size=11, color="FFFFFF")


def _add_header_row(ws, headers: list[str], row: int = 1):
    for col, header in enumerate(headers, 1):
        cell = ws.cell(row=row, column=col, value=header)
        cell.font = _HEADER_FONT_WHITE
        cell.fill = _HEADER_FILL
        cell.alignment = Alignment(horizontal="center")


def export_sample_request(session_id: str, special_notes: str = "") -> str:
    """Export a sample request Excel for R&D team.

    Returns path to generated file.
    """
    with get_db() as conn:
        session = conn.execute("SELECT * FROM sessions WHERE id=?", (session_id,)).fetchone()
        ingredients = conn.execute(
            "SELECT * FROM session_ingredients WHERE session_id=?", (session_id,),
        ).fetchall()
        messages = conn.execute(
            "SELECT * FROM chat_messages WHERE session_id=? AND role='user' ORDER BY timestamp",
            (session_id,),
        ).fetchall()

    wb = openpyxl.Workbook()

    # Sheet 1: Client Info
    ws = wb.active
    ws.title = "Client Info"
    _add_header_row(ws, ["Field", "Value"])
    info_data = [
        ("Session ID", session_id),
        ("Client Name", (session["client_name"] or "") if session else ""),
        ("Company", (session["client_company"] or "") if session else ""),
        ("Email", (session["client_email"] or "") if session else ""),
        ("Date", datetime.now().strftime("%Y-%m-%d %H:%M")),
        ("Special Notes", special_notes),
    ]
    for r, (field, value) in enumerate(info_data, 2):
        ws.cell(row=r, column=1, value=field)
        ws.cell(row=r, column=2, value=value)

    # Sheet 2: Ingredients
    ws2 = wb.create_sheet("Ingredients")
    _add_header_row(ws2, ["Ingredient", "mg/serving", "Label Claim", "UOM", "Unit Cost", "Source", "Notes"])
    for r, ing in enumerate(ingredients, 2):
        ws2.cell(row=r, column=1, value=ing["ingredient_name"])
        ws2.cell(row=r, column=2, value=ing["mg_per_serving"])
        ws2.cell(row=r, column=3, value=ing["label_claim"])
        ws2.cell(row=r, column=4, value=ing["uom"])
        ws2.cell(row=r, column=5, value=ing["unit_cost"])
        ws2.cell(row=r, column=6, value=ing["cost_source"])

    # Sheet 3: Client Requirements (from chat)
    ws3 = wb.create_sheet("Client Requirements")
    _add_header_row(ws3, ["Timestamp", "Message"])
    for r, msg in enumerate(messages, 2):
        ws3.cell(row=r, column=1, value=msg["timestamp"])
        ws3.cell(row=r, column=2, value=msg["content"])

    # Auto-size columns
    for ws_obj in [ws, ws2, ws3]:
        for col in ws_obj.columns:
            max_len = max((len(str(cell.value or "")) for cell in col), default=10)
            ws_obj.column_dimensions[col[0].column_letter].width = min(max_len + 2, 50)

    filename = f"sample_request_{session_id}_{datetime.now().strftime('%Y%m%d_%H%M')}.xlsx"
    filepath = EXPORTS_DIR / filename
    wb.save(str(filepath))
    logger.info("Exported sample request to %s", filepath)
    return str(filepath)


def export_client_record(session_id: str) -> str:
    """Export comprehensive client record Excel with all session data.

    Returns path to generated file.
    """
    with get_db() as conn:
        session = conn.execute("SELECT * FROM sessions WHERE id=?", (session_id,)).fetchone()
        ingredients = conn.execute(
            "SELECT * FROM session_ingredients WHERE session_id=?", (session_id,),
        ).fetchall()
        messages = conn.execute(
            "SELECT * FROM chat_messages WHERE session_id=? ORDER BY timestamp",
            (session_id,),
        ).fetchall()
        quotes = conn.execute(
            "SELECT * FROM quotes WHERE session_id=? ORDER BY version DESC LIMIT 1",
            (session_id,),
        ).fetchall()
        escalations = conn.execute(
            "SELECT * FROM escalation_queue WHERE session_id=?",
            (session_id,),
        ).fetchall()

    wb = openpyxl.Workbook()
    ctx = json.loads(session["context_json"]) if session and session["context_json"] else {}
    specs = ctx.get("product_specs", {})

    # Sheet 1: Client Info
    ws = wb.active
    ws.title = "Client Info"
    _add_header_row(ws, ["Field", "Value"])
    client_data = [
        ("Session ID", session_id),
        ("Timestamp", session["created_at"] if session else ""),
        ("Client Name", session["client_name"] if session else ""),
        ("Company", session["client_company"] if session else ""),
        ("Email", session["client_email"] if session else ""),
        ("Phone", session["client_phone"] if session else ""),
        ("Address", session["client_address"] if session else ""),
    ]
    for r, (f, v) in enumerate(client_data, 2):
        ws.cell(row=r, column=1, value=f)
        ws.cell(row=r, column=2, value=v)

    # Sheet 2: Product Specs
    ws2 = wb.create_sheet("Product Specs")
    _add_header_row(ws2, ["Field", "Value"])
    spec_data = [
        ("Product Name", specs.get("product_name", "")),
        ("Product Type", specs.get("product_type", "")),
        ("Serving Size", specs.get("serving_size", "")),
        ("Servings/Unit", specs.get("servings_per_unit", "")),
        ("Total Count", specs.get("total_count", "")),
        ("Capsule Type", specs.get("capsule_type", "")),
        ("Order Quantity", specs.get("order_quantity", "")),
    ]
    for r, (f, v) in enumerate(spec_data, 2):
        ws2.cell(row=r, column=1, value=f)
        ws2.cell(row=r, column=2, value=v)

    # Sheet 3: Ingredients
    ws3 = wb.create_sheet("Ingredients")
    _add_header_row(ws3, ["Ingredient", "Source Tab", "Supplier", "mg/serving", "Label Claim", "UOM", "Unit Cost", "Total Cost"])
    for r, ing in enumerate(ingredients, 2):
        ws3.cell(row=r, column=1, value=ing["ingredient_name"])
        ws3.cell(row=r, column=2, value=ing["cost_source"])
        ws3.cell(row=r, column=4, value=ing["mg_per_serving"])
        ws3.cell(row=r, column=5, value=ing["label_claim"])
        ws3.cell(row=r, column=6, value=ing["uom"])
        ws3.cell(row=r, column=7, value=ing["unit_cost"])

    # Sheet 4: Pricing Summary
    ws4 = wb.create_sheet("Pricing Summary")
    _add_header_row(ws4, ["Line Item", "Low Estimate", "Mid Estimate", "High Estimate", "Data Source"])
    if quotes:
        q = quotes[0]
        pricing_rows = [
            ("Ingredients", q["ingredient_cost_low"], q["ingredient_cost_mid"], q["ingredient_cost_high"], "DB"),
            ("Machine Wear", q["machine_cost_low"], q["machine_cost_mid"], q["machine_cost_high"], "Config"),
            ("Labor", q["labor_cost_low"], q["labor_cost_mid"], q["labor_cost_high"], "Config"),
            ("Packaging", q["packaging_cost_low"], q["packaging_cost_mid"], q["packaging_cost_high"], "DB/Default"),
            ("Transportation", q["transport_cost_low"], q["transport_cost_mid"], q["transport_cost_high"], "Rate table"),
            ("TOTAL (with margin)", q["total_low"], q["total_mid"], q["total_high"], f"Margin: {q['margin_pct']}"),
        ]
        for r, (item, low, mid, high, src) in enumerate(pricing_rows, 2):
            ws4.cell(row=r, column=1, value=item)
            ws4.cell(row=r, column=2, value=low)
            ws4.cell(row=r, column=3, value=mid)
            ws4.cell(row=r, column=4, value=high)
            ws4.cell(row=r, column=5, value=src)

    # Sheet 5: Chat Transcript
    ws5 = wb.create_sheet("Chat Transcript")
    _add_header_row(ws5, ["Timestamp", "Speaker", "Phase", "Message"])
    for r, msg in enumerate(messages, 2):
        ws5.cell(row=r, column=1, value=msg["timestamp"])
        ws5.cell(row=r, column=2, value=msg["role"])
        ws5.cell(row=r, column=3, value=msg["phase"])
        ws5.cell(row=r, column=4, value=(msg["content"] or "")[:500])

    # Sheet 6: Escalated Items
    ws6 = wb.create_sheet("Escalated Items")
    _add_header_row(ws6, ["Item", "Source", "Requested Date", "Status", "Admin Response", "Confirmed Price"])
    for r, esc in enumerate(escalations, 2):
        ws6.cell(row=r, column=1, value=esc["item_requested"])
        ws6.cell(row=r, column=2, value=esc["source"])
        ws6.cell(row=r, column=3, value=esc["created_at"])
        ws6.cell(row=r, column=4, value=esc["status"])
        ws6.cell(row=r, column=5, value=esc["admin_notes"])
        ws6.cell(row=r, column=6, value=esc["confirmed_price"])

    filename = f"client_record_{session_id}_{datetime.now().strftime('%Y%m%d_%H%M')}.xlsx"
    filepath = CLIENT_RECORDS_DIR / filename
    wb.save(str(filepath))
    logger.info("Exported client record to %s", filepath)
    return str(filepath)
