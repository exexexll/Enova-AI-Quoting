"""MFSO contract PDF generation."""
from __future__ import annotations

import json
import logging
from datetime import datetime
from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import inch
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle

from backend.config import CONTRACTS_DIR
from backend.models.database import get_db

logger = logging.getLogger(__name__)


def generate_contract(session_id: str) -> str:
    """Generate an MFSO contract PDF for a session.

    Returns path to generated PDF.
    """
    with get_db() as conn:
        session = conn.execute("SELECT * FROM sessions WHERE id=?", (session_id,)).fetchone()
        if not session:
            raise ValueError(f"Session {session_id} not found")
        ingredients = conn.execute(
            "SELECT * FROM session_ingredients WHERE session_id=?", (session_id,),
        ).fetchall()
        quotes = conn.execute(
            "SELECT * FROM quotes WHERE session_id=? ORDER BY version DESC LIMIT 1",
            (session_id,),
        ).fetchall()

    ctx = json.loads(session["context_json"]) if session["context_json"] else {}
    specs = ctx.get("product_specs", {})
    quote = quotes[0] if quotes else None

    filename = f"MFSO_{session_id}_v{(quote['version'] if quote else 1)}_{datetime.now().strftime('%Y%m%d')}.pdf"
    filepath = CONTRACTS_DIR / filename

    doc = SimpleDocTemplate(str(filepath), pagesize=letter,
                            topMargin=0.5 * inch, bottomMargin=0.5 * inch)
    styles = getSampleStyleSheet()

    title_style = ParagraphStyle("Title2", parent=styles["Title"], fontSize=14, spaceAfter=6)
    heading_style = ParagraphStyle("Heading2b", parent=styles["Heading2"], fontSize=11, spaceAfter=4)
    normal = styles["Normal"]

    elements = []

    # Header
    elements.append(Paragraph("ENOVA SCIENCE", title_style))
    elements.append(Paragraph("4740 S CLEVELAND AVE, FORT MYERS, FL 33907", normal))
    elements.append(Spacer(1, 12))
    elements.append(Paragraph("<b>MASTER FORMULA SIGN OFF APPROVAL</b>", title_style))
    elements.append(Spacer(1, 8))

    # Customer info
    info_data = [
        ["Customer:", session["client_name"] or "TBD", "Date:", datetime.now().strftime("%m/%d/%Y")],
        ["Product Name:", specs.get("product_name", "TBD"), "Enova Item #:", "TBD"],
    ]
    info_table = Table(info_data, colWidths=[1.2 * inch, 2.5 * inch, 1.2 * inch, 1.8 * inch])
    info_table.setStyle(TableStyle([
        ("FONTSIZE", (0, 0), (-1, -1), 9),
        ("FONTNAME", (0, 0), (0, -1), "Helvetica-Bold"),
        ("FONTNAME", (2, 0), (2, -1), "Helvetica-Bold"),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
    ]))
    elements.append(info_table)
    elements.append(Spacer(1, 12))

    # Section 1: Product Specification
    elements.append(Paragraph("SECTION 1. PRODUCT SPECIFICATION", heading_style))
    elements.append(Paragraph("1.1 COMPOSITION", normal))

    if ingredients:
        ing_headers = ["Ingredient", "Input (mg)", "Label Claim", "UOM"]
        ing_data = [ing_headers]
        for ing in ingredients:
            ing_data.append([
                ing["ingredient_name"],
                str(ing["mg_per_serving"] or ""),
                ing["label_claim"] or "",
                ing["uom"] or "mg",
            ])
        ing_table = Table(ing_data, colWidths=[3 * inch, 1.2 * inch, 1.2 * inch, 0.8 * inch])
        ing_table.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#4472C4")),
            ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
            ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
            ("FONTSIZE", (0, 0), (-1, -1), 8),
            ("GRID", (0, 0), (-1, -1), 0.5, colors.grey),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
            ("TOPPADDING", (0, 0), (-1, -1), 3),
        ]))
        elements.append(ing_table)
    elements.append(Spacer(1, 8))

    # Section 1.2: General Spec
    elements.append(Paragraph("1.2 GENERAL SPECIFICATION", normal))
    spec_data = [
        ["Serving Size", f"{specs.get('serving_size', 2)} Capsule(s)"],
        ["Servings / Unit", str(specs.get("servings_per_unit", 90))],
        ["Total UoM", f"{specs.get('total_count', 180)} Capsule(s)"],
        ["Capsule Type", specs.get("capsule_type", "TBD")],
    ]
    spec_table = Table(spec_data, colWidths=[2 * inch, 4 * inch])
    spec_table.setStyle(TableStyle([
        ("FONTSIZE", (0, 0), (-1, -1), 9),
        ("FONTNAME", (0, 0), (0, -1), "Helvetica-Bold"),
        ("GRID", (0, 0), (-1, -1), 0.5, colors.grey),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
    ]))
    elements.append(spec_table)
    elements.append(Spacer(1, 12))

    # Section 7: Fees
    elements.append(Paragraph("SECTION 7. FEES", heading_style))
    if quote:
        price_text = f"${quote['total_low']:.3f} – ${quote['total_high']:.3f} per unit"
        moq = specs.get("order_quantity", 10000)
        elements.append(Paragraph(f"<b>Price/MOQ:</b> {price_text} / {moq:,} units", normal))
        elements.append(Paragraph("<b>Pay Terms:</b> 50% Deposit, Remaining 50% Due on Completion Prior to Shipping", normal))
    elements.append(Spacer(1, 20))

    # Signature block
    elements.append(Paragraph("<b>FOR GOOD AND VALUABLE CONSIDERATION</b>, the undersigned hereby agrees to the terms.", normal))
    elements.append(Spacer(1, 20))
    sig_data = [
        ["Printed Name:", "____________________", "Signature:", "____________________"],
        ["Date:", "____________________", "", ""],
    ]
    sig_table = Table(sig_data, colWidths=[1.2 * inch, 2 * inch, 1 * inch, 2 * inch])
    sig_table.setStyle(TableStyle([
        ("FONTSIZE", (0, 0), (-1, -1), 9),
        ("FONTNAME", (0, 0), (0, -1), "Helvetica-Bold"),
        ("FONTNAME", (2, 0), (2, -1), "Helvetica-Bold"),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
    ]))
    elements.append(sig_table)

    doc.build(elements)

    # Save contract record to DB
    with get_db() as conn:
        conn.execute(
            """INSERT INTO contracts (session_id, version, status, pdf_path, data_json)
               VALUES (?,?,?,?,?)""",
            (
                session_id,
                quote["version"] if quote else 1,
                "draft",
                str(filepath),
                json.dumps({"specs": specs, "ingredients": [dict(i) for i in ingredients] if ingredients else []}),
            ),
        )
        conn.execute(
            "UPDATE sessions SET contract_status='draft', updated_at=datetime('now') WHERE id=?",
            (session_id,),
        )

    logger.info("Generated contract PDF: %s", filepath)
    return str(filepath)
