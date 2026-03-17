"""Packaging pricing calculation."""
from __future__ import annotations

from backend.models.database import get_db
from backend.models.schemas import PriceRange


# Default packaging component costs (used when no DB rates configured)
_DEFAULT_PACKAGING = {
    "capsule_shell": (0.005, 0.007, 0.014),   # per capsule (low, mid, high)
    "container": (0.10, 0.18, 0.35),           # per unit
    "closure": (0.03, 0.06, 0.12),             # per unit
    "label": (0.03, 0.08, 0.15),               # per unit
    "desiccant": (0.01, 0.02, 0.05),           # per unit
    "neckband": (0.005, 0.01, 0.02),           # per unit
    "master_case": (0.30, 0.50, 0.80),         # per case
    "pallet": (20.0, 25.0, 35.0),              # per pallet
}


def calculate_packaging_cost(
    capsules_per_unit: int = 180,
    units_per_case: int = 24,
    units_per_pallet: int = 1200,
    custom_price_per_unit: float | None = None,
) -> PriceRange:
    """Calculate packaging cost per unit.

    If custom_price_per_unit is provided (client supplies own packaging), use that directly.
    Otherwise, calculate from DB rates or defaults.
    """
    if custom_price_per_unit is not None:
        return PriceRange(
            low=custom_price_per_unit,
            mid=custom_price_per_unit,
            high=custom_price_per_unit,
        )

    # Try to load from admin-imported packaging DB
    with get_db() as conn:
        db_rates = conn.execute("SELECT * FROM packaging_rates").fetchall()

    components: dict[str, tuple[float, float, float]] = dict(_DEFAULT_PACKAGING)

    if db_rates:
        # Override defaults with DB rates
        for rate in db_rates:
            comp_type = (rate["component_type"] or "").lower().replace(" ", "_")
            cost = rate["cost_per_unit"]
            # Use DB cost as mid, derive low/high
            if comp_type in components:
                components[comp_type] = (cost * 0.85, cost, cost * 1.15)

    if units_per_case <= 0:
        units_per_case = 24
    if units_per_pallet <= 0:
        units_per_pallet = 1200

    # Calculate per-unit cost
    cap_l, cap_m, cap_h = components["capsule_shell"]
    capsule_cost = (cap_l * capsules_per_unit, cap_m * capsules_per_unit, cap_h * capsules_per_unit)

    cont_l, cont_m, cont_h = components["container"]
    clos_l, clos_m, clos_h = components["closure"]
    lab_l, lab_m, lab_h = components["label"]
    des_l, des_m, des_h = components["desiccant"]
    nb_l, nb_m, nb_h = components["neckband"]
    mc_l, mc_m, mc_h = components["master_case"]
    pal_l, pal_m, pal_h = components["pallet"]

    low = (capsule_cost[0] + cont_l + clos_l + lab_l + des_l + nb_l
           + mc_l / units_per_case + pal_l / units_per_pallet)
    mid = (capsule_cost[1] + cont_m + clos_m + lab_m + des_m + nb_m
           + mc_m / units_per_case + pal_m / units_per_pallet)
    high = (capsule_cost[2] + cont_h + clos_h + lab_h + des_h + nb_h
            + mc_h / units_per_case + pal_h / units_per_pallet)

    return PriceRange(low=round(low, 4), mid=round(mid, 4), high=round(high, 4))
