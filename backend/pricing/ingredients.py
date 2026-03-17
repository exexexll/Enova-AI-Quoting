"""Ingredient cost calculation."""
from __future__ import annotations

from backend.models.database import get_config_float
from backend.models.schemas import PriceRange
from backend.pricing.confidence import IngredientConfidence


def calculate_ingredient_cost(
    ingredient_costs: list[IngredientConfidence],
    servings_per_unit: int,
    capsules_per_serving: int = 1,
) -> PriceRange:
    """Calculate total ingredient cost per unit.

    Each ic.cost_per_gram has already been scaled to cost_per_serving for that
    ingredient (mg * cost_per_gram / 1000) by the tools layer.

    C_ingredient = SUM(per_serving_cost) * (1 + waste%) * servings_per_unit
    """
    # Fetch all config values in one batch to avoid N DB queries
    waste_low = get_config_float("waste_factor_low", 0.03)
    waste_mid = get_config_float("waste_factor_mid", 0.07)
    waste_high = get_config_float("waste_factor_high", 0.12)

    raw_cost_low = 0.0
    raw_cost_mid = 0.0
    raw_cost_high = 0.0

    for ic in ingredient_costs:
        if ic.confidence == "HIGH":
            # Tight range — same base cost, spread only from waste factor
            raw_cost_low += ic.cost_per_gram
            raw_cost_mid += ic.cost_per_gram
            raw_cost_high += ic.cost_per_gram
        elif ic.confidence == "MEDIUM":
            # Wider range from similar item extrapolation
            raw_cost_low += ic.est_low if ic.est_low else ic.cost_per_gram * 0.9
            raw_cost_mid += ic.cost_per_gram
            raw_cost_high += ic.est_high if ic.est_high else ic.cost_per_gram * 1.2
        # NONE items: blocked upstream, should never reach here
        elif ic.confidence == "NONE":
            # Safety: if somehow a NONE slips through, use 0 (don't crash)
            pass

    # Apply waste factors and scale by servings per unit
    cost_low = raw_cost_low * (1 + waste_low) * servings_per_unit
    cost_mid = raw_cost_mid * (1 + waste_mid) * servings_per_unit
    cost_high = raw_cost_high * (1 + waste_high) * servings_per_unit

    return PriceRange(low=round(cost_low, 6), mid=round(cost_mid, 6), high=round(cost_high, 6))
