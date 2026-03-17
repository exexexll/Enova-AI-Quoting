"""Confidence gating for pricing calculations.

Determines whether we can price an ingredient (HIGH/MEDIUM/NONE).
This is strictly internal logic — never exposed in client UI.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Optional

from backend.models.database import get_db, get_config_float


@dataclass
class IngredientConfidence:
    """Internal confidence assessment for a single ingredient."""
    ingredient_name: str
    ingredient_id: Optional[int] = None
    confidence: str = "NONE"  # HIGH, MEDIUM, NONE
    cost_per_gram: float = 0.0
    uom: str = "gm"  # original UoM: "gm", "kg", "ea"
    cost_source: str = ""
    # For MEDIUM confidence
    est_low: float = 0.0
    est_high: float = 0.0
    similar_items_cited: list[str] = field(default_factory=list)


def assess_ingredient_confidence(
    ingredient_name: str,
    ingredient_id: Optional[int],
    sum_cavg: float,
    cost_kg: float,
    price_per_kg: Optional[float],
    uom: str,
    needs_manual_price: bool,
    similar_priced: Optional[list] = None,
    similar_est_low: Optional[float] = None,
    similar_est_high: Optional[float] = None,
) -> IngredientConfidence:
    """Assess confidence level for an ingredient's pricing.

    Returns IngredientConfidence with level and cost details.
    """
    result = IngredientConfidence(
        ingredient_name=ingredient_name,
        ingredient_id=ingredient_id,
        uom=uom,
    )

    # Priority 1: Enova Data cAvg (per-unit cost, could be per-gram or per-each)
    if sum_cavg > 0:
        result.confidence = "HIGH"
        if uom == "gm":
            result.cost_per_gram = sum_cavg           # already per-gram
        elif uom == "kg":
            result.cost_per_gram = sum_cavg / 1000.0  # per-kg → per-gram
        else:
            # "ea" items (capsule shells, etc.) — cost is per-each, not per-gram.
            # The tools layer must handle this differently (multiply by count, not mg/1000).
            result.cost_per_gram = sum_cavg
        result.cost_source = "enova_data_cavg"
        return result

    # Priority 2: Enova Data Cost KG
    if cost_kg > 0:
        result.confidence = "HIGH"
        result.cost_per_gram = cost_kg / 1000.0
        result.cost_source = "enova_data_costkg"
        return result

    # Priority 3: Master tab price/kg
    if price_per_kg is not None and price_per_kg > 0:
        result.confidence = "HIGH"
        result.cost_per_gram = price_per_kg / 1000.0
        result.cost_source = "master_price"
        return result

    # Priority 4: Similar items extrapolation (MEDIUM)
    if similar_priced and similar_est_low and similar_est_high:
        result.confidence = "MEDIUM"
        result.est_low = similar_est_low
        result.est_high = similar_est_high
        result.cost_per_gram = (similar_est_low + similar_est_high) / 2.0
        result.cost_source = "estimated_from_similar"
        result.similar_items_cited = [
            getattr(item, "item_name", str(item)) for item in similar_priced[:3]
        ]
        return result

    # Priority 5: No data — NONE
    result.confidence = "NONE"
    result.cost_source = "none"
    return result
