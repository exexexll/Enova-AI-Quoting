"""Machine wear pricing calculation."""
from __future__ import annotations

from backend.models.database import get_db, get_config_float
from backend.models.schemas import PriceRange


def calculate_machine_cost(
    product_type: str,
    total_units: int,
    capsules_per_unit: int = 180,
) -> PriceRange | None:
    """Calculate machine wear cost per unit.

    C_machine = (setup + hourly_rate * run_hours + cleaning + maintenance) / total_units
    Returns None if no machine rates configured.
    """
    with get_db() as conn:
        # Find matching machine rate
        rows = conn.execute(
            "SELECT * FROM machine_rates WHERE LOWER(machine_type) LIKE ? OR LOWER(notes) LIKE ? LIMIT 1",
            (f"%{product_type.lower()}%", f"%{product_type.lower()}%"),
        ).fetchall()

        if not rows:
            # Try generic encapsulator
            rows = conn.execute(
                "SELECT * FROM machine_rates LIMIT 1"
            ).fetchall()

    if not rows:
        return None

    if total_units <= 0:
        return PriceRange(low=0.0, mid=0.0, high=0.0)

    rate = rows[0]
    hourly_rate = rate["hourly_rate"]
    setup_cost = rate["setup_cost"] or 0
    cleaning_cost = rate["cleaning_cost"] or 0
    throughput = rate["throughput_per_hour"] or 50000
    maint_pct = rate["maintenance_pct"] or 0.05

    # Guard against zero/negative throughput
    if throughput <= 0:
        throughput = 50000

    total_capsules = total_units * capsules_per_unit

    eff_low = get_config_float("efficiency_low", 0.95)
    eff_mid = get_config_float("efficiency_mid", 0.85)
    eff_high = get_config_float("efficiency_high", 0.75)

    def calc(efficiency: float, maint_mult: float = 1.0) -> float:
        run_hours = total_capsules / (throughput * efficiency)
        maint_reserve = hourly_rate * run_hours * maint_pct * maint_mult
        total_cost = setup_cost + hourly_rate * run_hours + cleaning_cost + maint_reserve
        return total_cost / total_units

    return PriceRange(
        low=round(calc(eff_low, 1.0), 6),
        mid=round(calc(eff_mid, 1.0), 6),
        high=round(calc(eff_high, 1.5), 6),
    )
