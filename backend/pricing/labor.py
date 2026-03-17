"""Labor pricing calculation."""
from __future__ import annotations

from backend.models.database import get_db, get_config_float
from backend.models.schemas import PriceRange


def calculate_labor_cost(
    product_type: str,
    total_units: int,
) -> PriceRange | None:
    """Calculate labor cost per unit.

    C_labor = (direct_labor + indirect_labor + overhead) / total_units
    Returns None if no labor rates configured.
    """
    with get_db() as conn:
        rates = conn.execute("SELECT * FROM labor_rates").fetchall()

    if not rates:
        return None

    if total_units <= 0:
        return PriceRange(low=0.0, mid=0.0, high=0.0)

    overhead_low = get_config_float("overhead_low", 0.15)
    overhead_mid = get_config_float("overhead_mid", 0.25)
    overhead_high = get_config_float("overhead_high", 0.35)

    # Calculate for each role
    direct_labor = 0.0
    indirect_labor = 0.0

    for rate in rates:
        hours_per_10k = rate["est_hours_per_10k_units"] or 4.5
        headcount = rate["headcount_per_line"] or 1
        hourly = rate["hourly_rate"]

        hours = (total_units / 10000) * hours_per_10k
        cost = headcount * hourly * hours

        role = (rate["role"] or "").lower()
        if "qc" in role or "supervisor" in role or "inspector" in role:
            indirect_labor += cost
        else:
            direct_labor += cost

    def calc(overhead_pct: float) -> float:
        base_labor = direct_labor + indirect_labor
        total = base_labor * (1 + overhead_pct)
        return total / total_units

    return PriceRange(
        low=round(calc(overhead_low), 6),
        mid=round(calc(overhead_mid), 6),
        high=round(calc(overhead_high), 6),
    )
