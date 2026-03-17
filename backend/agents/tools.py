"""Tool definitions for GPT-5.2 function calling."""
from __future__ import annotations

import json
import logging
from typing import Any

from backend.models.database import get_db
from backend.retrieval.hybrid_search import hybrid_search, search_similar_priced
from backend.pricing.confidence import assess_ingredient_confidence, IngredientConfidence
from backend.pricing.engine import calculate_full_pricing, save_quote, can_calculate_price
from backend.models.schemas import ProductSpecs, PricingBreakdown

logger = logging.getLogger(__name__)

# ==================== Tool Schemas for OpenAI ====================

TOOL_DEFINITIONS = [
    {
        "type": "function",
        "function": {
            "name": "search_ingredients",
            "description": "Search the ingredient database for items matching a query. Returns ingredient names, costs, stock levels, and supplier info.",
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {
                        "type": "string",
                        "description": "Ingredient name or description to search for",
                    },
                    "top_k": {
                        "type": "integer",
                        "description": "Number of results to return (default 5)",
                        "default": 5,
                    },
                },
                "required": ["query"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_ingredient_details",
            "description": "Get full details for a specific ingredient by ID.",
            "parameters": {
                "type": "object",
                "properties": {
                    "ingredient_id": {
                        "type": "integer",
                        "description": "The ingredient database ID",
                    },
                },
                "required": ["ingredient_id"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "calculate_pricing",
            "description": "Calculate the full 5-part pricing breakdown for a product formulation. Call this when you have enough info about the ingredients, product specs, and shipping.",
            "parameters": {
                "type": "object",
                "properties": {
                    "ingredients": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "properties": {
                                "name": {"type": "string"},
                                "ingredient_id": {"type": "integer"},
                                "mg_per_serving": {"type": "number"},
                            },
                            "required": ["name", "mg_per_serving"],
                        },
                        "description": "List of ingredients with mg per serving",
                    },
                    "product_type": {"type": "string", "enum": ["capsule", "tablet", "powder", "gummy", "liquid"]},
                    "serving_size": {"type": "integer", "description": "Capsules per serving"},
                    "servings_per_unit": {"type": "integer"},
                    "total_count": {"type": "integer", "description": "Total capsules per unit"},
                    "order_quantity": {"type": "integer", "description": "Number of units to produce"},
                    "carrier": {"type": "string", "default": "fedex_ground"},
                },
                "required": ["ingredients", "product_type", "order_quantity"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "trigger_ingredient_popup",
            "description": "Show the ingredient selector popup to the client. Call this when you want the client to browse and select ingredients from the database.",
            "parameters": {
                "type": "object",
                "properties": {
                    "pre_search": {
                        "type": "string",
                        "description": "Optional pre-filled search term for the popup",
                    },
                    "category_filter": {
                        "type": "string",
                        "description": "Optional category to filter (e.g., 'powder', 'capsule_shell')",
                    },
                },
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "escalate_ingredient",
            "description": "Escalate an ingredient to the admin queue when pricing is unavailable. Creates a request for the admin team to provide pricing.",
            "parameters": {
                "type": "object",
                "properties": {
                    "ingredient_name": {"type": "string"},
                    "reason": {"type": "string", "enum": ["missing", "$0-cost"]},
                    "quantity_needed": {"type": "string"},
                    "similar_items": {
                        "type": "array",
                        "items": {"type": "string"},
                        "description": "Names of similar items found for reference",
                    },
                    "est_low": {"type": "number", "description": "Estimated low price per gram (if MEDIUM confidence)"},
                    "est_high": {"type": "number", "description": "Estimated high price per gram (if MEDIUM confidence)"},
                },
                "required": ["ingredient_name", "reason"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "generate_contract",
            "description": "Generate an MFSO contract PDF with the current session data. Call this after pricing is complete and client approves.",
            "parameters": {
                "type": "object",
                "properties": {
                    "session_id": {"type": "string"},
                },
                "required": ["session_id"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "export_sample_request",
            "description": "Export a sample request Excel file for the R&D team. Includes ingredient list, client info, and special notes.",
            "parameters": {
                "type": "object",
                "properties": {
                    "session_id": {"type": "string"},
                    "special_notes": {"type": "string"},
                },
                "required": ["session_id"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "update_session_info",
            "description": "Record or update client information in the session (name, email, company, phone, address, product specs).",
            "parameters": {
                "type": "object",
                "properties": {
                    "client_name": {"type": "string"},
                    "client_email": {"type": "string"},
                    "client_company": {"type": "string"},
                    "client_phone": {"type": "string"},
                    "client_address": {"type": "string"},
                    "product_name": {"type": "string"},
                    "product_type": {"type": "string"},
                    "serving_size": {"type": "integer"},
                    "servings_per_unit": {"type": "integer"},
                    "total_count": {"type": "integer"},
                    "capsule_type": {"type": "string"},
                    "order_quantity": {"type": "integer"},
                },
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_session_info",
            "description": "Retrieve the current session state: client info, product specs, workflow state, and contract status. Call this to check what info has already been collected.",
            "parameters": {
                "type": "object",
                "properties": {},
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "validate_formula",
            "description": "Validate a capsule/tablet formula: checks total fill weight against capsule size, flags overfill, and recommends serving size adjustments. Call this before calculate_pricing.",
            "parameters": {
                "type": "object",
                "properties": {
                    "ingredients": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "properties": {
                                "name": {"type": "string"},
                                "mg_per_serving": {"type": "number"},
                            },
                            "required": ["name", "mg_per_serving"],
                        },
                    },
                    "capsule_size": {
                        "type": "string",
                        "enum": ["000", "00", "0", "1", "2", "3", "4"],
                        "description": "Capsule size (000 is largest, 4 is smallest)",
                    },
                    "capsules_per_serving": {
                        "type": "integer",
                        "description": "Number of capsules per serving (default 2)",
                        "default": 2,
                    },
                },
                "required": ["ingredients"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "advance_workflow",
            "description": "Move the session to the next workflow state. Call this at each stage transition to keep the workflow on track. Valid states: intake, evaluation, customer_registration, technical_review, cost_calculation, quotation, sample_decision, sample_payment, sample_production, sample_confirmation, order_confirmation, production, closed.",
            "parameters": {
                "type": "object",
                "properties": {
                    "next_state": {
                        "type": "string",
                        "enum": [
                            "intake", "evaluation", "customer_registration",
                            "technical_review", "cost_calculation", "quotation",
                            "sample_decision", "sample_payment", "sample_production",
                            "sample_confirmation", "order_confirmation", "production", "closed",
                        ],
                        "description": "The workflow state to transition to",
                    },
                    "reason": {
                        "type": "string",
                        "description": "Brief reason for the transition (e.g., 'Client confirmed formula', 'Feasibility check passed')",
                    },
                },
                "required": ["next_state"],
            },
        },
    },
]


# ==================== Tool Execution ====================

async def execute_tool(tool_name: str, arguments: dict[str, Any], session_id: str) -> str:
    """Execute a tool call and return the result as a JSON string."""
    try:
        if tool_name == "search_ingredients":
            return _search_ingredients(arguments)
        elif tool_name == "get_ingredient_details":
            return _get_ingredient_details(arguments)
        elif tool_name == "calculate_pricing":
            return _calculate_pricing(arguments, session_id)
        elif tool_name == "trigger_ingredient_popup":
            return json.dumps({"action": "show_ingredient_popup", **arguments})
        elif tool_name == "escalate_ingredient":
            return _escalate_ingredient(arguments, session_id)
        elif tool_name == "generate_contract":
            return _generate_contract(arguments, session_id)
        elif tool_name == "export_sample_request":
            return _export_sample_request(arguments, session_id)
        elif tool_name == "update_session_info":
            return _update_session_info(arguments, session_id)
        elif tool_name == "get_session_info":
            return _get_session_info(session_id)
        elif tool_name == "validate_formula":
            return _validate_formula(arguments)
        elif tool_name == "advance_workflow":
            return _advance_workflow(arguments, session_id)
        else:
            return json.dumps({"error": f"Unknown tool: {tool_name}"})
    except Exception as e:
        logger.exception("Tool execution error: %s", e)
        return json.dumps({"error": str(e)})


def _search_ingredients(args: dict) -> str:
    query = args["query"]
    top_k = args.get("top_k", 5)
    results = hybrid_search(query, top_k=top_k, use_embeddings=False)  # BM25-only for speed during chat
    items = []
    for r in results:
        ing = r.ingredient
        cost_display = ""
        if ing.sum_cavg > 0:
            cost_display = f"${ing.sum_cavg:.4f}/{ing.uom}"
        elif ing.cost_kg > 0:
            cost_display = f"${ing.cost_kg:.2f}/kg"
        elif ing.price_per_kg:
            cost_display = f"${ing.price_per_kg:.2f}/kg (supplier)"
        else:
            cost_display = "pricing pending"

        items.append({
            "id": ing.id,
            "name": ing.item_name,
            "supplier": ing.supplier or "",
            "uom": ing.uom,
            "cost": cost_display,
            "on_hand": ing.on_hand,
            "source": ing.source_tab,
            "needs_manual_price": ing.needs_manual_price,
        })
    return json.dumps({"results": items, "count": len(items)})


def _get_ingredient_details(args: dict) -> str:
    with get_db() as conn:
        row = conn.execute("SELECT * FROM ingredients WHERE id=?", (args["ingredient_id"],)).fetchone()
    if not row:
        return json.dumps({"error": "Ingredient not found"})
    return json.dumps({
        "id": row["id"],
        "name": row["item_name"],
        "supplier": row["supplier"],
        "uom": row["uom"],
        "sum_cavg": row["sum_cavg"],
        "cost_kg": row["cost_kg"],
        "price_per_kg": row["price_per_kg"],
        "on_hand": row["on_hand"],
        "source": row["source_tab"],
        "chinese_name": row["chinese_name"],
        "potency": row["potency"],
        "form": row["form"],
        "needs_manual_price": bool(row["needs_manual_price"]),
    })


def _calculate_pricing(args: dict, session_id: str) -> str:
    ingredients = args["ingredients"]
    product_type = args.get("product_type", "capsule")
    serving_size = args.get("serving_size", 2)
    servings_per_unit = args.get("servings_per_unit", 90)
    total_count = args.get("total_count", 180)
    order_quantity = args.get("order_quantity", 10000)
    carrier = args.get("carrier", "fedex_ground")

    # Assess confidence for each ingredient
    # Pre-fetch all ingredients in a single DB connection to avoid N connections
    ingredient_rows: dict[str, Any] = {}
    with get_db() as conn:
        for ing in ingredients:
            name = ing["name"]
            ing_id = ing.get("ingredient_id")
            if ing_id:
                row = conn.execute("SELECT * FROM ingredients WHERE id=?", (ing_id,)).fetchone()
            else:
                row = conn.execute(
                    "SELECT * FROM ingredients WHERE item_name LIKE ? ORDER BY needs_manual_price ASC LIMIT 1",
                    (f"%{name}%",),
                ).fetchone()
            ingredient_rows[name] = row

    confidence_list: list[IngredientConfidence] = []
    for ing in ingredients:
        name = ing["name"]
        ing_id = ing.get("ingredient_id")
        mg = ing["mg_per_serving"]

        row = ingredient_rows.get(name)

        if row:
            # Check for similar items if no pricing
            similar, est_l, est_h = None, None, None
            if row["needs_manual_price"]:
                similar_items, est_l, est_h = search_similar_priced(name)
                similar = similar_items if similar_items else None

            ic = assess_ingredient_confidence(
                ingredient_name=name,
                ingredient_id=row["id"],
                sum_cavg=row["sum_cavg"] or 0,
                cost_kg=row["cost_kg"] or 0,
                price_per_kg=row["price_per_kg"],
                uom=row["uom"] or "gm",
                needs_manual_price=bool(row["needs_manual_price"]),
                similar_priced=similar,
                similar_est_low=est_l,
                similar_est_high=est_h,
            )
        else:
            # Not found at all
            similar_items, est_l, est_h = search_similar_priced(name)
            ic = assess_ingredient_confidence(
                ingredient_name=name,
                ingredient_id=None,
                sum_cavg=0, cost_kg=0, price_per_kg=None,
                uom="gm", needs_manual_price=True,
                similar_priced=similar_items if similar_items else None,
                similar_est_low=est_l, similar_est_high=est_h,
            )

        # Scale cost to per-serving cost.
        # For weight-based (gm/kg): cost_per_gram * mg / 1000 = cost for that serving's weight
        # For "ea" items (capsule shells, etc.): cost_per_each * quantity (mg field = count)
        if ic.cost_per_gram:
            if ic.uom == "ea":
                # For "ea" items, mg_per_serving is really the count per serving
                ic.cost_per_gram = ic.cost_per_gram * mg
            else:
                ic.cost_per_gram = ic.cost_per_gram * mg / 1000.0
        else:
            ic.cost_per_gram = 0
        if ic.est_low:
            if ic.uom == "ea":
                ic.est_low = ic.est_low * mg
            else:
                ic.est_low = ic.est_low * mg / 1000.0
        if ic.est_high:
            if ic.uom == "ea":
                ic.est_high = ic.est_high * mg
            else:
                ic.est_high = ic.est_high * mg / 1000.0

        confidence_list.append(ic)

    # Persist ingredient selections to session_ingredients table
    # (used by contract generation and Excel export)
    with get_db() as conn:
        # Clear previous selections for this session (recalculation replaces them)
        conn.execute("DELETE FROM session_ingredients WHERE session_id=?", (session_id,))
        for ing_data, ic in zip(ingredients, confidence_list):
            conn.execute(
                """INSERT INTO session_ingredients
                   (session_id, ingredient_id, ingredient_name, mg_per_serving,
                    label_claim, uom, unit_cost, cost_source, confidence,
                    est_low, est_high, similar_items)
                   VALUES (?,?,?,?,?,?,?,?,?,?,?,?)""",
                (
                    session_id,
                    ic.ingredient_id,
                    ic.ingredient_name,
                    ing_data["mg_per_serving"],
                    str(ing_data["mg_per_serving"]),  # label_claim defaults to mg
                    "mg",
                    ic.cost_per_gram,  # already scaled to per-serving cost
                    ic.cost_source,
                    ic.confidence,
                    ic.est_low,
                    ic.est_high,
                    json.dumps(ic.similar_items_cited) if ic.similar_items_cited else None,
                ),
            )

    specs = ProductSpecs(
        product_type=product_type,
        serving_size=serving_size,
        servings_per_unit=servings_per_unit,
        total_count=total_count,
        order_quantity=order_quantity,
    )

    breakdown = calculate_full_pricing(confidence_list, specs, carrier=carrier)
    save_quote(session_id, breakdown)

    return json.dumps(breakdown.model_dump())


def _escalate_ingredient(args: dict, session_id: str) -> str:
    with get_db() as conn:
        # Get client name from session
        session = conn.execute("SELECT client_name FROM sessions WHERE id=?", (session_id,)).fetchone()
        client_name = session["client_name"] if session else None

        conn.execute(
            """INSERT INTO escalation_queue
               (session_id, client_name, item_requested, source, quantity_needed,
                similar_items, est_low, est_high)
               VALUES (?,?,?,?,?,?,?,?)""",
            (
                session_id,
                client_name,
                args["ingredient_name"],
                args.get("reason", "missing"),
                args.get("quantity_needed"),
                json.dumps(args.get("similar_items", [])),
                args.get("est_low"),
                args.get("est_high"),
            ),
        )
    return json.dumps({"status": "escalated", "ingredient": args["ingredient_name"]})


def _update_session_info(args: dict, session_id: str) -> str:
    field_map = {
        "client_name": "client_name",
        "client_email": "client_email",
        "client_company": "client_company",
        "client_phone": "client_phone",
        "client_address": "client_address",
    }
    product_fields = ["product_name", "product_type", "serving_size", "servings_per_unit",
                      "total_count", "capsule_type", "order_quantity"]
    product_data = {k: args[k] for k in product_fields if k in args and args[k] is not None}

    # Single atomic transaction for all updates
    with get_db() as conn:
        # Update direct session fields
        updates = []
        params: list[Any] = []
        for key, col in field_map.items():
            if key in args and args[key]:
                updates.append(f"{col}=?")
                params.append(args[key])

        # Update context_json with product specs
        if product_data:
            row = conn.execute("SELECT context_json FROM sessions WHERE id=?", (session_id,)).fetchone()
            ctx = json.loads(row["context_json"]) if row and row["context_json"] else {}
            ctx["product_specs"] = {**ctx.get("product_specs", {}), **product_data}
            updates.append("context_json=?")
            params.append(json.dumps(ctx))

        if updates:
            updates.append("updated_at=datetime('now')")
            params.append(session_id)
            conn.execute(f"UPDATE sessions SET {', '.join(updates)} WHERE id=?", params)

    return json.dumps({"status": "updated", "fields": list(args.keys())})


def _generate_contract(args: dict, session_id: str) -> str:
    from backend.services.contract_service import generate_contract
    try:
        pdf_path = generate_contract(session_id)
        return json.dumps({
            "action": "generate_contract",
            "status": "success",
            "session_id": session_id,
            "pdf_path": pdf_path,
        })
    except Exception as e:
        logger.exception("Contract generation failed: %s", e)
        return json.dumps({"action": "generate_contract", "status": "error", "error": str(e)})


def _export_sample_request(args: dict, session_id: str) -> str:
    from backend.services.excel_export import export_sample_request
    try:
        notes = args.get("special_notes", "")
        path = export_sample_request(session_id, notes)
        return json.dumps({
            "action": "export_sample",
            "status": "success",
            "session_id": session_id,
            "file_path": path,
        })
    except Exception as e:
        logger.exception("Sample export failed: %s", e)
        return json.dumps({"action": "export_sample", "status": "error", "error": str(e)})


def _get_session_info(session_id: str) -> str:
    """Return current session state so the agent knows what's been collected."""
    with get_db() as conn:
        row = conn.execute("SELECT * FROM sessions WHERE id=?", (session_id,)).fetchone()
        if not row:
            return json.dumps({"error": "Session not found"})

        ctx = json.loads(row["context_json"]) if row["context_json"] else {}
        ingredients = conn.execute(
            "SELECT ingredient_name, mg_per_serving, confidence, cost_source FROM session_ingredients WHERE session_id=?",
            (session_id,),
        ).fetchall()

        escalations = conn.execute(
            "SELECT item_requested, status FROM escalation_queue WHERE session_id=?",
            (session_id,),
        ).fetchall()

    return json.dumps({
        "session_id": session_id,
        "client_name": row["client_name"],
        "client_email": row["client_email"],
        "client_company": row["client_company"],
        "client_phone": row["client_phone"],
        "client_address": row["client_address"],
        "workflow_state": row["workflow_state"],
        "status": row["status"],
        "contract_status": row["contract_status"],
        "product_specs": ctx.get("product_specs", {}),
        "ingredients_selected": [
            {"name": r["ingredient_name"], "mg": r["mg_per_serving"],
             "confidence": r["confidence"], "source": r["cost_source"]}
            for r in ingredients
        ],
        "escalations": [
            {"item": r["item_requested"], "status": r["status"]}
            for r in escalations
        ],
    })


# Capsule fill capacities in mg (approximate, with excipient space)
_CAPSULE_FILL_MG = {
    "000": 1000, "00": 735, "0": 500, "1": 400, "2": 300, "3": 200, "4": 120,
}


def _validate_formula(args: dict) -> str:
    """Check if ingredients fit the capsule size and flag issues."""
    ingredients = args.get("ingredients", [])
    capsule_size = args.get("capsule_size", "00")
    caps_per_serving = args.get("capsules_per_serving", 2)

    max_fill = _CAPSULE_FILL_MG.get(capsule_size, 735)
    total_fill_capacity = max_fill * caps_per_serving

    total_active_mg = sum(ing.get("mg_per_serving", 0) for ing in ingredients)
    # Excipients typically fill 10-25% of remaining space
    excipient_estimate = max(total_fill_capacity * 0.10, 50)

    total_with_excipients = total_active_mg + excipient_estimate
    fill_pct = (total_with_excipients / total_fill_capacity * 100) if total_fill_capacity > 0 else 0

    issues: list[str] = []
    suggestions: list[str] = []

    if total_with_excipients > total_fill_capacity:
        overfill = total_with_excipients - total_fill_capacity
        issues.append(
            f"Overfill by ~{overfill:.0f}mg. Total {total_with_excipients:.0f}mg "
            f"exceeds {caps_per_serving}x size-{capsule_size} capacity of {total_fill_capacity}mg."
        )
        # Suggest fixes
        if caps_per_serving < 4:
            needed_caps = -(-int(total_with_excipients) // max_fill)  # ceiling division
            suggestions.append(f"Increase to {needed_caps} capsules per serving")
        bigger_sizes = [s for s, cap in sorted(_CAPSULE_FILL_MG.items(), key=lambda x: -x[1])
                        if cap * caps_per_serving >= total_with_excipients and s != capsule_size]
        if bigger_sizes:
            suggestions.append(f"Use larger capsule size: {bigger_sizes[0]}")
        suggestions.append("Reduce ingredient dosages")
    elif fill_pct < 50:
        suggestions.append(
            f"Only {fill_pct:.0f}% fill. Consider size-down to save cost, or add excipients for proper fill."
        )

    return json.dumps({
        "valid": len(issues) == 0,
        "capsule_size": capsule_size,
        "capsules_per_serving": caps_per_serving,
        "total_active_mg": round(total_active_mg, 1),
        "estimated_excipient_mg": round(excipient_estimate, 1),
        "total_fill_mg": round(total_with_excipients, 1),
        "capacity_mg": total_fill_capacity,
        "fill_percentage": round(fill_pct, 1),
        "issues": issues,
        "suggestions": suggestions,
    })


_VALID_WORKFLOW_STATES = {
    "intake", "evaluation", "customer_registration",
    "technical_review", "cost_calculation", "quotation",
    "sample_decision", "sample_payment", "sample_production",
    "sample_confirmation", "order_confirmation", "production", "closed",
}

_VALID_TRANSITIONS: dict[str, set[str]] = {
    "intake":                {"evaluation", "customer_registration", "closed"},
    "evaluation":            {"customer_registration", "closed"},
    "customer_registration": {"technical_review", "closed"},
    "technical_review":      {"cost_calculation", "closed"},
    "cost_calculation":      {"quotation", "technical_review"},              # can loop back if pricing fails
    "quotation":             {"sample_decision", "cost_calculation", "technical_review", "closed"},
    "sample_decision":       {"sample_payment", "order_confirmation"},
    "sample_payment":        {"sample_production"},
    "sample_production":     {"sample_confirmation"},
    "sample_confirmation":   {"order_confirmation", "sample_payment", "technical_review"},  # reject → re-sample
    "order_confirmation":    {"production"},
    "production":            {"closed"},
    "closed":                set(),
}


def _advance_workflow(args: dict, session_id: str) -> str:
    next_state = args["next_state"]
    reason = args.get("reason", "")

    if next_state not in _VALID_WORKFLOW_STATES:
        return json.dumps({"error": f"Invalid workflow state: {next_state}"})

    with get_db() as conn:
        row = conn.execute("SELECT workflow_state, status FROM sessions WHERE id=?", (session_id,)).fetchone()
        if not row:
            return json.dumps({"error": "Session not found"})

        current_state = row["workflow_state"]

        # Validate transition
        allowed = _VALID_TRANSITIONS.get(current_state, set())
        if next_state == current_state:
            return json.dumps({"workflow_state": current_state, "status": "already_in_state"})
        if next_state not in allowed:
            logger.warning(
                "Rejected workflow transition: %s → %s (allowed: %s)",
                current_state, next_state, allowed,
            )
            return json.dumps({
                "error": f"Cannot transition from '{current_state}' to '{next_state}'.",
                "allowed_transitions": sorted(allowed),
                "current_state": current_state,
            })

        # Update state
        session_status = "completed" if next_state == "production" else (
            "abandoned" if next_state == "closed" else "active"
        )
        conn.execute(
            "UPDATE sessions SET workflow_state=?, status=?, updated_at=datetime('now') WHERE id=?",
            (next_state, session_status, session_id),
        )

    logger.info("Workflow transition: %s → %s (session=%s, reason=%s)", current_state, next_state, session_id, reason)

    return json.dumps({
        "workflow_state": next_state,
        "previous_state": current_state,
        "reason": reason,
        "status": "transitioned",
    })
