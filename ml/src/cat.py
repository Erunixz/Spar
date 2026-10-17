"""Python mirror of the app's adaptive placement test (apps/web/src/engine/irt.ts + cat.ts).

Used for the simulation study. Written to match the TypeScript line for line
(same grid formula, same tie tolerance, same order of operations); a parity
fixture checks the two agree, and tests cross-check the IRT formulas with catsim.
"""

from __future__ import annotations

import math
import re
from dataclasses import dataclass
from pathlib import Path

import yaml

REPO = Path(__file__).resolve().parents[2]
TIE = 1e-9

# Must equal PARAMS.placement and PARAMS.elo.difficultyPrior in apps/web/src/engine/params.ts (tested).
PLACEMENT = {
    "grid": {"min": -4, "max": 4, "points": 61},
    "generalPriorSd": 1,
    "patternSd": 0.8,
    "weakTilt": 0,  # chosen by src/cat_sim.py
    "seStop": 0.6,
    "maxItems": 20,
    "minItems": 8,
}
DIFFICULTY_PRIOR = {"easy": -1, "medium": 0, "hard": 1}


@dataclass(frozen=True)
class Item:
    id: str
    patterns: tuple[str, ...]
    a: float
    b: float


def icc(theta: float, a: float, b: float) -> float:
    return 1 / (1 + math.exp(-a * (theta - b)))


def information(theta: float, a: float, b: float) -> float:
    p = icc(theta, a, b)
    return a * a * p * (1 - p)


def log_likelihood(theta: float, answers: list[tuple[float, float, bool]]) -> float:
    ll = 0.0
    for a, b, correct in answers:
        p = icc(theta, a, b)
        ll += math.log(p) if correct else math.log(1 - p)
    return ll


def grid(lo: float, hi: float, points: int) -> list[float]:
    # Same formula as the TypeScript (not numpy.linspace), so nodes match bit for bit.
    return [lo + ((hi - lo) * i) / (points - 1) for i in range(points)]


def eap(answers: list[tuple[float, float, bool]], mean: float, sd: float, nodes: list[float]) -> tuple[float, float]:
    log_post = [-0.5 * ((t - mean) / sd) ** 2 + log_likelihood(t, answers) for t in nodes]
    top = max(log_post)
    w = [math.exp(v - top) for v in log_post]
    total = sum(w)
    theta = sum(t * wi for t, wi in zip(nodes, w)) / total
    var = sum((t - theta) ** 2 * wi for t, wi in zip(nodes, w)) / total
    return theta, math.sqrt(var)


def estimate_all(bank: dict[str, Item], patterns: list[str], responses: list[tuple[str, bool]], cfg: dict = PLACEMENT):
    g = cfg["grid"]
    nodes = grid(g["min"], g["max"], g["points"])
    answered = [(bank[i], c) for i, c in responses if i in bank]
    general = eap([(it.a, it.b, c) for it, c in answered], 0, cfg["generalPriorSd"], nodes)
    per = {}
    for p in patterns:
        mine = [(it.a, it.b, c) for it, c in answered if p in it.patterns]
        per[p] = eap(mine, general[0], cfg["patternSd"], nodes)
    return general, per


def next_item(items: list[Item], patterns: list[str], responses: list[tuple[str, bool]], cfg: dict = PLACEMENT, estimates=None):
    bank = {i.id: i for i in items}
    general, per = estimates or estimate_all(bank, patterns, responses, cfg)
    asked = {i for i, _ in responses}

    def unseen(p: str) -> list[Item]:
        return [i for i in items if i.id not in asked and p in i.patterns]

    best_p, best_score = None, -math.inf
    for p in patterns:
        if not unseen(p):
            continue
        theta, se = per[p]
        score = se + cfg["weakTilt"] * (general[0] - theta)
        if score > best_score + TIE:
            best_p, best_score = p, score
    if best_p is None:
        return None
    theta = per[best_p][0]
    candidates = sorted(unseen(best_p), key=lambda i: i.id)
    best, best_info = candidates[0], information(theta, candidates[0].a, candidates[0].b)
    for it in candidates[1:]:
        info = information(theta, it.a, it.b)
        if info > best_info + TIE:
            best, best_info = it, info
    return best, best_p


def stop_reason(responses, per: dict, has_next: bool, cfg: dict = PLACEMENT):
    if not has_next:
        return "bank-exhausted"
    if len(responses) >= cfg["maxItems"]:
        return "max-items"
    worst = max(se for _, se in per.values())
    if len(responses) >= cfg["minItems"] and worst <= cfg["seStop"]:
        return "precise"
    return None


def load_bank() -> tuple[list[Item], list[str]]:
    """The real drill bank: item difficulty from its label (a = 1) until items are calibrated."""
    patterns = [p["id"] for p in yaml.safe_load((REPO / "content" / "patterns.yaml").read_text(encoding="utf-8"))]
    items = []
    for f in sorted((REPO / "content" / "items").glob("*.yaml")):
        d = yaml.safe_load(f.read_text(encoding="utf-8"))
        items.append(Item(d["id"], tuple(d["pattern_ids"]), 1.0, float(DIFFICULTY_PRIOR[d["difficulty"]])))
    items.sort(key=lambda i: i.id)
    return items, patterns


def params_ts_numbers() -> dict[str, float]:
    """Numbers from the placement block of params.ts, for the drift test."""
    text = (REPO / "apps" / "web" / "src" / "engine" / "params.ts").read_text(encoding="utf-8")
    block = text[text.index("placement: {") : text.index("session: {")]
    nums = dict(re.findall(r"(\w+): (-?[\d.]+)", block))
    return {k: float(v) for k, v in nums.items()}
