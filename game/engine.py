"""Pure game rules: routes, validated options, totals and scoring. No I/O.

A route is {"stops": [choice per stop], "modes": [mode per leg]}. stops[i] == 0 means the
journey's own stop i, k > 0 means stop i's alts[k-1]. The first and last stops never change.
"""
import json
import os

from . import planner

HERE = os.path.dirname(os.path.abspath(__file__))
CHANGE_MIN = 3  # documented allowance per change between legs, same for every route


def load_journeys():
    return json.load(open(os.path.join(HERE, "journeys.json"), encoding="utf-8"))


def base_route(j):
    return {"stops": [0] * len(j["stops"]), "modes": [lg["mode"] for lg in j["legs"]]}


def stop(j, i, choice):
    s = j["stops"][i]
    return s if choice == 0 else s["alts"][choice - 1]


def leg_key(j, r, i, mode=None, stops=None):
    st = stops or r["stops"]
    return planner.key(stop(j, i, st[i])["ll"], stop(j, i + 1, st[i + 1])["ll"], mode or r["modes"][i])


def route_total(j, r, table):
    tot = 0
    for i in range(len(j["legs"])):
        leg = table.get(leg_key(j, r, i))
        if leg is None:
            return None
        tot += leg["minutes"]
    return tot + CHANGE_MIN * (len(j["legs"]) - 1)


def journey_ok(j, table):
    return route_total(j, base_route(j), table) is not None


def build_options(j, r, table):
    """Options a player may pick right now. Only combinations with a known time are offered,
    and options that duplicate the current way of travelling are dropped."""
    legs = []
    for i, lg in enumerate(j["legs"]):
        cur = table.get(leg_key(j, r, i))
        seen = {cur["label"]} if cur else set()
        opts = []
        for m in [lg["mode"]] + lg.get("alts", []):
            if m == r["modes"][i]:
                continue
            res = table.get(leg_key(j, r, i, mode=m))
            if not res or res["label"] in seen:
                continue
            seen.add(res["label"])
            opts.append({"id": m, "label": res["label"], "mode": m, "parts": res["parts"]})
        legs.append(opts)
    changes = []
    for si in range(1, len(j["stops"]) - 1):
        s = j["stops"][si]
        opts = []
        for k in range(0, len(s.get("alts", [])) + 1):
            if k == r["stops"][si]:
                continue
            st = list(r["stops"])
            st[si] = k
            if table.get(leg_key(j, r, si - 1, stops=st)) and table.get(leg_key(j, r, si, stops=st)):
                opts.append({"id": str(k), "label": "Change at " + stop(j, si, k)["name"], "name": stop(j, si, k)["name"]})
        changes.append(opts)
    return {"legs": legs, "changes": changes}


def apply_edit(j, r, kind, index, option_id, table):
    """Returns the new route, or raises ValueError if the option isn't currently offered."""
    opts = build_options(j, r, table)
    new = {"stops": list(r["stops"]), "modes": list(r["modes"])}
    if kind == "leg":
        if not (0 <= index < len(opts["legs"])) or option_id not in [o["id"] for o in opts["legs"][index]]:
            raise ValueError("That option isn't available")
        new["modes"][index] = option_id
    elif kind == "change":
        if not (0 <= index < len(opts["changes"])) or option_id not in [o["id"] for o in opts["changes"][index]]:
            raise ValueError("That option isn't available")
        new["stops"][index + 1] = int(option_id)
    else:
        raise ValueError("Unknown edit")
    return new


def describe(j, r, table, with_times):
    legs = []
    for i in range(len(j["legs"])):
        res = table.get(leg_key(j, r, i)) or {}
        leg = {"from": stop(j, i, r["stops"][i])["name"], "to": stop(j, i + 1, r["stops"][i + 1])["name"],
               "mode": r["modes"][i], "label": res.get("label", "?"), "parts": res.get("parts", [])}
        if with_times:
            leg["minutes"] = res.get("minutes")
            leg["source"] = res.get("source")
        legs.append(leg)
    out = {"legs": legs, "changes": [stop(j, i, r["stops"][i])["name"] for i in range(1, len(j["stops"]) - 1)]}
    if with_times:
        out["total"] = route_total(j, r, table)
        out["changeMinutes"] = CHANGE_MIN * (len(j["legs"]) - 1)
    return out


def why(j, base, r, table):
    """One line explaining how this route differs from the original."""
    if r == base:
        return "Back on the original route: same time."
    diffs = []
    for i in range(len(j["legs"])):
        a, b = table.get(leg_key(j, base, i)), table.get(leg_key(j, r, i))
        if a and b and (r["modes"][i] != base["modes"][i] or leg_key(j, r, i) != leg_key(j, base, i)):
            diffs.append((b["minutes"] - a["minutes"], i, a, b))
    moved = [stop(j, si, r["stops"][si])["name"] for si in range(1, len(j["stops"]) - 1) if r["stops"][si] != base["stops"][si]]
    if not diffs:
        return ""
    total = sum(d for d, *_ in diffs)
    if len(diffs) == 1:
        d, i, a, b = diffs[0]
        word = "slower" if d > 0 else "faster"
        if d == 0:
            return f"{b['label']} takes the same time as {a['label']} on leg {i + 1}."
        if moved and b["label"] == a["label"]:
            return f"Changing at {moved[0]} makes leg {i + 1} {abs(d)} min {word}."
        return f"{b['label']} is {abs(d)} min {word} than {a['label']} on leg {i + 1}."
    parts = ", ".join(f"leg {i + 1} {'+' if d > 0 else ''}{d} min ({b['label']})" for d, i, a, b in diffs)
    lead = f"Changing at {moved[0]}: " if moved else ""
    return f"{lead}{parts}. Net {'+' if total > 0 else ''}{total} min."
