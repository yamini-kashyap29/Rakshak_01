"""
Deterministic priority scoring — Section 9 of the spec.

Priority Score = 30% Population Impact + 25% Critical Patients
               + 20% Trapped Population + 15% Accessibility/Risk
               + 10% Waiting Time

Every sub-score is normalized to 0-100 *relative to the current scenario*
(min-max across all active zones) so the score is comparable across very
different disaster sizes, then blended with the configurable weights.
"""
from app.database.store import DB, RISK_LEVELS

ACCESS_SCORE = {"FULL": 20, "PARTIAL": 60, "BLOCKED": 100}  # higher = more urgent


def _normalize(value, values):
    lo, hi = min(values), max(values)
    if hi == lo:
        return 50.0
    return round((value - lo) / (hi - lo) * 100, 1)


def _weather_access_delta():
    """How much live weather should push up a zone's accessibility-risk score.

    Rainfall and wind gusts each contribute up to a capped amount; this keeps
    the effect visible without letting one noisy reading dominate the whole
    priority score. Returns (delta, human-readable note) — note is None when
    the effect is negligible (<3 points) or no live weather is available.
    """
    w = DB.live_weather
    if not w:
        return 0.0, None
    rain = w.get("precipitation_mm") or 0
    gusts = w.get("wind_gusts_kmh") or 0
    rain_component = min(30.0, rain / 20.0 * 30.0)
    wind_component = min(15.0, max(0.0, gusts - 30.0) / 40.0 * 15.0)
    delta = round(rain_component + wind_component, 1)
    if delta < 3:
        return 0.0, None
    note = f"Live weather ({rain}mm rainfall, {gusts}km/h gusts) increased accessibility risk"
    return delta, note


def recalculate_all(weights: dict | None = None):
    w = weights or DB.priority_weights
    zones = list(DB.zones.values())
    if not zones:
        return []

    pop_vals = [z["population"] for z in zones]
    crit_vals = [z["critical"] for z in zones]
    trapped_vals = [z["trapped"] for z in zones]
    wait_vals = [z["waiting_time"] for z in zones]
    weather_delta, weather_note = _weather_access_delta()

    for z in zones:
        pop_score = _normalize(z["population"], pop_vals)
        crit_score = _normalize(z["critical"], crit_vals)
        trapped_score = _normalize(z["trapped"], trapped_vals)
        base_access = ACCESS_SCORE.get(z["accessibility"], 50)
        access_score = min(100.0, base_access + weather_delta)
        wait_score = _normalize(z["waiting_time"], wait_vals)

        final = (
            w["population"] * pop_score
            + w["critical"] * crit_score
            + w["trapped"] * trapped_score
            + w["accessibility"] * access_score
            + w["waiting"] * wait_score
        )
        breakdown = {
            "population_impact": pop_score,
            "critical_patients": crit_score,
            "trapped_population": trapped_score,
            "accessibility_risk": round(access_score, 1),
            "waiting_time": wait_score,
            "weights": w,
        }
        if weather_note:
            breakdown["change_reason"] = (
                f"{weather_note} from {base_access} to {round(access_score, 1)}."
            )
        z["priority_breakdown"] = breakdown
        z["priority_score"] = round(final, 1)
        z["risk_level"] = _risk_bucket(final)

    return sorted(zones, key=lambda z: z["priority_score"], reverse=True)


def _risk_bucket(score):
    if score >= 80:
        return "CRITICAL"
    if score >= 60:
        return "HIGH"
    if score >= 40:
        return "ELEVATED"
    if score >= 20:
        return "GUARDED"
    return "LOW"
