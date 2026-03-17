"""Master pricing engine — calculates 5-part pricing with confidence gating."""
from __future__ import annotations

import json
import logging
from typing import Optional

from backend.models.database import get_db, get_config_float
from backend.models.schemas import PriceRange, PricingBreakdown, ProductSpecs
from backend.pricing.confidence import IngredientConfidence
from backend.pricing.ingredients import calculate_ingredient_cost
from backend.pricing.machine import calculate_machine_cost
from backend.pricing.labor import calculate_labor_cost
from backend.pricing.packaging import calculate_packaging_cost
from backend.pricing.transportation import calculate_transport_cost

logger = logging.getLogger(__name__)


def can_calculate_price(
    ingredient_costs: list[IngredientConfidence],
    product_type: str = "capsule",
) -> tuple[bool, list[str], list[str]]:
    """Check if we have enough data to calculate pricing.

    Returns (can_calculate, hard_blockers, soft_warnings).
    """
    blockers: list[str] = []
    warnings: list[str] = []

    for ic in ingredient_costs:
        if ic.confidence == "NONE":
            blockers.append(
                f"Missing price: {ic.ingredient_name} (escalated, no similar items)"
            )
        elif ic.confidence == "MEDIUM":
            warnings.append(
                f"Estimated price: {ic.ingredient_name} "
                f"(${ic.est_low:.4f}-${ic.est_high:.4f}/gm, "
                f"based on {', '.join(ic.similar_items_cited[:3])})"
            )

    # Machine and labor rates are optional — we use defaults/None if not configured
    # so they don't block calculation

    return (len(blockers) == 0, blockers, warnings)


def calculate_full_pricing(
    ingredient_costs: list[IngredientConfidence],
    specs: ProductSpecs,
    carrier: str = "fedex_ground",
    destination_miles: float = 1000,
    custom_packaging_price: float | None = None,
) -> PricingBreakdown:
    """Calculate the complete 5-part pricing breakdown.

    Returns PricingBreakdown with all components and total range.
    """
    ok, blockers, warnings = can_calculate_price(ingredient_costs, specs.product_type or "capsule")

    if not ok:
        # Return empty breakdown with blockers
        zero = PriceRange(low=0, mid=0, high=0)
        return PricingBreakdown(
            ingredient=zero,
            machine=zero,
            labor=zero,
            packaging=zero,
            transport=zero,
            margin_pct=0,
            total=zero,
            warnings=warnings,
            blockers=blockers,
        )

    servings_per_unit = specs.servings_per_unit or 90
    capsules_per_unit = specs.total_count or 180
    capsules_per_serving = specs.serving_size or 2
    total_units = specs.order_quantity or 10000
    product_type = specs.product_type or "capsule"

    # ===== Part 1: Ingredient Cost =====
    ingredient_price = calculate_ingredient_cost(
        ingredient_costs, servings_per_unit, capsules_per_serving,
    )

    # ===== Part 2: Machine Wear =====
    machine_price = calculate_machine_cost(
        product_type, total_units, capsules_per_unit,
    )
    if machine_price is None:
        machine_price = PriceRange(low=0, mid=0, high=0)
        warnings.append("No machine rates configured — machine cost excluded from estimate.")

    # ===== Part 3: Labor =====
    labor_price = calculate_labor_cost(product_type, total_units)
    if labor_price is None:
        labor_price = PriceRange(low=0, mid=0, high=0)
        warnings.append("No labor rates configured — labor cost excluded from estimate.")

    # ===== Part 4: Packaging =====
    packaging_price = calculate_packaging_cost(
        capsules_per_unit=capsules_per_unit,
        custom_price_per_unit=custom_packaging_price,
    )

    # ===== Part 5: Transportation =====
    # Estimate fill weight PER CAPSULE (not total).
    # calculate_transport_cost multiplies by capsules_per_unit internally.
    # Standard capsule fill: 400-600mg for size 00, 200-400mg for size 0
    fill_weight_mg_per_capsule = 500  # conservative default for size 00

    transport_price = calculate_transport_cost(
        total_units=total_units,
        carrier=carrier,
        destination_miles=destination_miles,
        capsules_per_unit=capsules_per_unit,
        fill_weight_mg=fill_weight_mg_per_capsule,
    )

    # ===== Apply margin =====
    margin_pct = get_config_float("margin_pct", 0.30)

    total_low = (ingredient_price.low + machine_price.low + labor_price.low
                 + packaging_price.low + transport_price.low) * (1 + margin_pct)
    total_mid = (ingredient_price.mid + machine_price.mid + labor_price.mid
                 + packaging_price.mid + transport_price.mid) * (1 + margin_pct)
    total_high = (ingredient_price.high + machine_price.high + labor_price.high
                  + packaging_price.high + transport_price.high) * (1 + margin_pct)

    return PricingBreakdown(
        ingredient=ingredient_price,
        machine=machine_price,
        labor=labor_price,
        packaging=packaging_price,
        transport=transport_price,
        margin_pct=margin_pct,
        total=PriceRange(
            low=round(total_low, 4),
            mid=round(total_mid, 4),
            high=round(total_high, 4),
        ),
        warnings=warnings,
        blockers=blockers,
    )


def save_quote(session_id: str, breakdown: PricingBreakdown) -> int:
    """Save a pricing quote to the database. Returns quote ID."""
    with get_db() as conn:
        # Get next version for this session
        row = conn.execute(
            "SELECT COALESCE(MAX(version), 0) + 1 as next_ver FROM quotes WHERE session_id=?",
            (session_id,),
        ).fetchone()
        version = row["next_ver"]

        return conn.execute_returning_id(
            """INSERT INTO quotes (
                session_id, version,
                ingredient_cost_low, ingredient_cost_mid, ingredient_cost_high,
                machine_cost_low, machine_cost_mid, machine_cost_high,
                labor_cost_low, labor_cost_mid, labor_cost_high,
                packaging_cost_low, packaging_cost_mid, packaging_cost_high,
                transport_cost_low, transport_cost_mid, transport_cost_high,
                total_low, total_mid, total_high,
                margin_pct, breakdown_json, warnings_json, blockers_json
            ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
            (
                session_id, version,
                breakdown.ingredient.low, breakdown.ingredient.mid, breakdown.ingredient.high,
                breakdown.machine.low, breakdown.machine.mid, breakdown.machine.high,
                breakdown.labor.low, breakdown.labor.mid, breakdown.labor.high,
                breakdown.packaging.low, breakdown.packaging.mid, breakdown.packaging.high,
                breakdown.transport.low, breakdown.transport.mid, breakdown.transport.high,
                breakdown.total.low, breakdown.total.mid, breakdown.total.high,
                breakdown.margin_pct,
                json.dumps(breakdown.model_dump()),
                json.dumps(breakdown.warnings),
                json.dumps(breakdown.blockers),
            ),
        )
