"""Transportation pricing calculation."""
from __future__ import annotations

from backend.models.database import get_db
from backend.models.schemas import PriceRange


# Default rate tables (used when no admin-imported rates)
_DEFAULT_RATES = {
    "fedex_ground": {"per_lb": 1.25, "min_charge": 12.0},
    "ups_ground": {"per_lb": 1.30, "min_charge": 12.0},
    "fedex_express": {"per_lb": 3.50, "min_charge": 25.0},
    "ups_express": {"per_lb": 3.75, "min_charge": 25.0},
    "air_freight": {"per_kg": 6.00, "min_charge": 100.0},
    "sea_freight": {"per_cbm": 225.0, "min_charge": 500.0},
    "ltl": {"per_cwt_per_100mi": 3.50, "min_charge": 150.0},
    "ftl": {"per_mile": 2.25, "min_charge": 500.0},
}


def estimate_unit_weight_lbs(capsules_per_unit: int = 180, fill_weight_mg: float = 1000) -> float:
    """Estimate weight of a single finished unit in pounds."""
    capsule_weight_g = capsules_per_unit * fill_weight_mg / 1000.0
    # Add packaging weight (~100-200g for bottle, cap, label, etc.)
    total_g = capsule_weight_g + 150
    return total_g / 453.592  # grams to lbs


def calculate_transport_cost(
    total_units: int,
    carrier: str = "fedex_ground",
    destination_miles: float = 1000,
    capsules_per_unit: int = 180,
    fill_weight_mg: float = 1000,
) -> PriceRange:
    """Calculate transportation cost per unit.

    C_transport = shipping_cost_per_shipment / total_units
    """
    if total_units <= 0:
        return PriceRange(low=0.0, mid=0.0, high=0.0)

    unit_weight = estimate_unit_weight_lbs(capsules_per_unit, fill_weight_mg)
    total_weight_lbs = unit_weight * total_units
    total_weight_kg = total_weight_lbs * 0.453592

    # Try admin-imported rates first
    with get_db() as conn:
        db_rates = conn.execute(
            "SELECT * FROM transport_rates WHERE LOWER(carrier) LIKE ? LIMIT 1",
            (f"%{carrier.lower().replace('_', '%')}%",),
        ).fetchall()

    if db_rates:
        rate = db_rates[0]
        rate_type = rate["rate_type"]
        rate_value = rate["rate_value"]
        surcharge = rate["surcharges_pct"] or 0

        if rate_type == "per_lb":
            base_cost = total_weight_lbs * rate_value
        elif rate_type == "per_kg":
            base_cost = total_weight_kg * rate_value
        elif rate_type == "per_mile":
            base_cost = destination_miles * rate_value
        elif rate_type == "flat":
            base_cost = rate_value
        else:
            base_cost = total_weight_lbs * rate_value

        total_cost = base_cost * (1 + surcharge / 100)
        per_unit = total_cost / total_units

        return PriceRange(
            low=round(per_unit * 0.85, 6),
            mid=round(per_unit, 6),
            high=round(per_unit * 1.20, 6),
        )

    # Use defaults
    carrier_key = carrier.lower().replace(" ", "_")
    if carrier_key not in _DEFAULT_RATES:
        carrier_key = "fedex_ground"

    rates = _DEFAULT_RATES[carrier_key]

    if "per_lb" in rates:
        base_cost = max(total_weight_lbs * rates["per_lb"], rates["min_charge"])
    elif "per_kg" in rates:
        base_cost = max(total_weight_kg * rates["per_kg"], rates["min_charge"])
    elif "per_mile" in rates:
        base_cost = max(destination_miles * rates["per_mile"], rates["min_charge"])
    elif "per_cwt_per_100mi" in rates:
        cwt = total_weight_lbs / 100
        hundreds_of_miles = destination_miles / 100
        base_cost = max(cwt * hundreds_of_miles * rates["per_cwt_per_100mi"], rates["min_charge"])
    elif "per_cbm" in rates:
        # Rough CBM estimate: 1 pallet ≈ 1.5 CBM
        cbm = max(total_weight_kg / 300, 1.0)  # rough density estimate
        base_cost = max(cbm * rates["per_cbm"], rates["min_charge"])
    else:
        base_cost = total_weight_lbs * 1.25

    per_unit = base_cost / total_units

    return PriceRange(
        low=round(per_unit * 0.85, 6),
        mid=round(per_unit, 6),
        high=round(per_unit * 1.20, 6),
    )
