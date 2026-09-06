"""
In-memory data store for RescueGrid.

Design note: for hackathon demo reliability (see product principle "reliability
over sophistication"), the simulation state lives in a single in-process Python
object rather than a networked database. This guarantees the app boots and runs
deterministically with zero external services. Swapping this module for a real
Postgres-backed repository later is a drop-in change because every other module
only talks to `DB` through the methods below.
"""
import math
import random
import time
from itertools import count

_ids = count(1)


def next_id(prefix: str) -> str:
    return f"{prefix}{next(_ids):04d}"


def haversine_km(lat1, lon1, lat2, lon2):
    R = 6371.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlambda = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dlambda / 2) ** 2
    return 2 * R * math.asin(math.sqrt(a))


CAPABILITIES = {
    "ambulance": {"medical_transport", "critical_patients"},
    "rescue_team": {"trapped_rescue", "evacuation", "medical_assistance"},
    "boat": {"flood_rescue", "evacuation"},
    "medical_unit": {"medical_transport", "critical_patients", "medical_assistance"},
    "supply_truck": {"supply_delivery"},
}

SPEED_KMH = {
    "ambulance": 45,
    "rescue_team": 25,
    "boat": 15,
    "medical_unit": 40,
    "supply_truck": 35,
}

RISK_LEVELS = ["LOW", "GUARDED", "ELEVATED", "HIGH", "CRITICAL"]


class Store:
    def __init__(self):
        self.reset()

    # ------------------------------------------------------------------ #
    def reset(self, seed: int = 42):
        random.seed(seed)
        self.center = (13.0827, 80.2707)  # Chennai coastal area — plausible cyclone setting
        self.disaster_name = "CYCLONE ARYA"
        self.disaster_type = "Cyclone"
        self.sim_time_min = 0
        self.sim_running = False
        self.sim_speed = 1
        self.system_status = "OPERATIONAL"

        self.priority_weights = {
            "population": 0.30,
            "critical": 0.25,
            "trapped": 0.20,
            "accessibility": 0.15,
            "waiting": 0.10,
        }
        self.allocation_weights = {
            "priority": 0.40,
            "suitability": 0.25,
            "distance": 0.20,
            "urgency": 0.10,
            "availability": 0.05,
        }

        self.zones = {}
        self.resources = {}
        self.roads = {}
        self.zone_routes = {}  # zone_id -> [ {id, road_ids:[...], distance_km} , ... ]
        self.shelters = {}
        self.hospitals = {}
        self.depots = {}
        self.assignments = {}
        self.events = []
        self.audit_log = []
        self.baseline_metrics = None

        # --- Live data (Section 3+): populated by live_data_service, never
        # reset by scenario re-generation so a live feed doesn't have to
        # re-warm every time the operator resets the demo scenario. ---
        if not hasattr(self, "live_weather"):
            self.live_weather = None          # latest normalized Open-Meteo reading
            self.live_earthquakes = []        # latest USGS features near DB.center
            self.route_cache = {}             # (resource_id, zone_id, blocked_state) -> route dict
            self.data_sources = {
                "weather": {"status": "OFFLINE", "provider": "Open-Meteo", "updated": None},
                "earthquakes": {"status": "OFFLINE", "provider": "USGS", "updated": None},
                "road_network": {"status": "OFFLINE", "provider": "OSRM", "updated": None},
                "facilities": {"status": "SIMULATION", "provider": "Seeded scenario data", "updated": None},
                "resources": {"status": "SIMULATION", "provider": "Seeded scenario data", "updated": None},
                "population": {"status": "SIMULATION", "provider": "Seeded scenario data", "updated": None},
                "shelter_beds": {"status": "SIMULATION", "provider": "Seeded scenario data", "updated": None},
            }

        self._seed_scenario()
        self.log_event("SYSTEM", "Scenario loaded: " + self.disaster_name)

    # ------------------------------------------------------------------ #
    def _offset(self, i, spread=0.09):
        ang = random.uniform(0, 2 * math.pi)
        r = random.uniform(0.01, spread)
        return self.center[0] + r * math.sin(ang), self.center[1] + r * math.cos(ang)

    def _seed_scenario(self):
        zone_names = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L",
                      "M", "N", "O", "P", "Q", "R"]
        for name in zone_names:
            lat, lng = self._offset(name)
            population = random.randint(300, 2200)
            injured = int(population * random.uniform(0.02, 0.12))
            critical = int(injured * random.uniform(0.15, 0.4))
            trapped = random.randint(0, 400) if random.random() < 0.6 else 0
            water_level = round(random.uniform(0, 2.5), 1)
            accessibility = random.choice(["FULL", "PARTIAL", "BLOCKED"])
            waiting = random.randint(2, 60)
            zid = next_id("Z")
            zone = {
                "id": zid, "name": f"Zone {name}", "lat": lat, "lng": lng,
                "population": population, "injured": injured, "critical": critical,
                "trapped": trapped, "water_level": water_level,
                "accessibility": accessibility, "waiting_time": waiting,
                "status": "ACTIVE", "priority_score": 0, "priority_breakdown": {},
                "risk_level": "LOW",
            }
            self.zones[zid] = zone

        # Roads: two named roads feeding each zone (primary + alternate)
        for zid, zone in self.zones.items():
            r1, r2 = next_id("R"), next_id("R")
            self.roads[r1] = {"id": r1, "label": f"Road {r1}", "blocked": False,
                               "distance_km": round(random.uniform(2, 9), 1)}
            self.roads[r2] = {"id": r2, "label": f"Road {r2}", "blocked": False,
                               "distance_km": round(random.uniform(6, 15), 1)}
            self.zone_routes[zid] = [
                {"id": next_id("RT"), "label": "Primary", "road_ids": [r1]},
                {"id": next_id("RT"), "label": "Alternate", "road_ids": [r2]},
            ]

        resource_defs = [
            ("ambulance", 10, 4),
            ("rescue_team", 12, 6),
            ("boat", 8, 8),
            ("medical_unit", 6, 20),
            ("supply_truck", 9, 40),
        ]
        for rtype, count_, capacity in resource_defs:
            for _ in range(count_):
                lat, lng = self._offset(rtype)
                rid = next_id(rtype[0].upper())
                self.resources[rid] = {
                    "id": rid, "name": f"{rtype.replace('_', ' ').title()} {rid}",
                    "type": rtype, "lat": lat, "lng": lng,
                    "status": "AVAILABLE", "capacity": capacity,
                    "capabilities": sorted(CAPABILITIES[rtype]),
                    "current_assignment": None,
                }

        for i, name in enumerate(["Shelter A", "Shelter B", "Shelter C", "Shelter D"]):
            lat, lng = self._offset(name)
            capacity = random.choice([300, 400, 500, 600])
            occ = int(capacity * random.uniform(0.3, 0.85))
            sid = next_id("SH")
            self.shelters[sid] = {
                "id": sid, "name": name, "lat": lat, "lng": lng,
                "capacity": capacity, "occupancy": occ,
                "medical_support": random.random() > 0.3,
                "water": True, "food": random.random() > 0.2,
            }

        for name in ["City Hospital", "Riverside Medical", "St. Anne's"]:
            lat, lng = self._offset(name)
            hid = next_id("H")
            er_total = random.choice([40, 50, 60])
            icu_total = random.choice([10, 12, 16])
            self.hospitals[hid] = {
                "id": hid, "name": name, "lat": lat, "lng": lng,
                "emergency_beds_total": er_total,
                "emergency_beds_used": int(er_total * random.uniform(0.4, 0.8)),
                "icu_beds_total": icu_total,
                "icu_beds_used": int(icu_total * random.uniform(0.3, 0.8)),
                "status": "OPERATIONAL",
            }

        for name in ["Depot North", "Depot South"]:
            lat, lng = self._offset(name)
            did = next_id("D")
            self.depots[did] = {
                "id": did, "name": name, "lat": lat, "lng": lng,
                "food_stock": random.randint(4000, 9000),
                "water_stock_l": random.randint(6000, 15000),
                "medicine_stock": random.randint(500, 2000),
            }

        self.assignments = {}

    # ------------------------------------------------------------------ #
    def log_event(self, etype, message, meta=None):
        evt = {
            "id": next_id("EV"), "type": etype, "message": message,
            "meta": meta or {}, "sim_time": self.sim_time_min,
            "ts": time.time(),
        }
        self.events.append(evt)
        self.audit_log.append({"ts": time.time(), "sim_time": self.sim_time_min,
                                "message": message})
        return evt

    def zone_needed_capabilities(self, zone):
        needed = set()
        if zone["critical"] > 0:
            needed.add("critical_patients")
        if zone["injured"] > 0:
            needed.add("medical_transport")
        if zone["trapped"] > 0:
            needed.add("trapped_rescue")
        if zone["water_level"] and zone["water_level"] > 0.5:
            needed.add("flood_rescue")
        if not needed:
            needed.add("evacuation")
        return needed


DB = Store()
