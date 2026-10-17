"""Simulation study for the adaptive placement test.

Simulated test-takers (general ability ~ N(0, 1); each pattern = general +
N(0, PATTERN_SPREAD^2)) answer items from the real 120-item bank under the 2PL
model. Three ways of choosing questions are compared, all scored with the same
EAP estimator, so only the question choice differs:
  adaptive : Spar's CAT rule (src/cat.py, vectorized here)
  fixed    : one 20-item form for everyone, balanced across patterns, middle difficulty first
  random   : random unseen items
After every item we record per-pattern RMSE, rank correlation, and how many of
the person's true three weakest patterns the test's three lowest estimates catch.

Writes reports/cat_sim_v1.json.
Usage (from ml/): .venv/Scripts/python -m src.cat_sim [--n 2000]
"""

from __future__ import annotations

import argparse
import json
import time

import numpy as np

from src import cat

ROOT = cat.REPO / "ml"
PATTERN_SPREAD = 0.8  # how far true pattern abilities sit from general ability
TIE = cat.TIE


class FastCat:
    """Vectorized twin of src/cat.py (tested to make identical choices and estimates)."""

    def __init__(self, items: list[cat.Item], patterns: list[str], cfg: dict):
        self.items, self.patterns, self.cfg = items, patterns, cfg
        g = cfg["grid"]
        self.nodes = np.array(cat.grid(g["min"], g["max"], g["points"]))
        self.a = np.array([i.a for i in items])
        self.b = np.array([i.b for i in items])
        p = 1 / (1 + np.exp(-self.a[:, None] * (self.nodes[None, :] - self.b[:, None])))
        self.log_p, self.log_q = np.log(p), np.log(1 - p)
        self.member = np.array([[pat in it.patterns for pat in patterns] for it in items])  # items x patterns
        self.order = np.argsort([i.id for i in items], kind="stable")  # tie-break by id

    def _eap(self, loglik: np.ndarray, mean: float, sd: float) -> tuple[float, float]:
        lp = -0.5 * ((self.nodes - mean) / sd) ** 2 + loglik
        w = np.exp(lp - lp.max())
        w /= w.sum()
        theta = float((self.nodes * w).sum())
        return theta, float(np.sqrt(((self.nodes - theta) ** 2 * w).sum()))

    def estimate(self, asked: list[int], correct: list[bool]):
        rows = np.where(np.array(correct)[:, None], self.log_p[asked], self.log_q[asked]) if asked else np.zeros((0, len(self.nodes)))
        general = self._eap(rows.sum(axis=0) if asked else np.zeros(len(self.nodes)), 0.0, self.cfg["generalPriorSd"])
        per = np.zeros((len(self.patterns), 2))
        for k in range(len(self.patterns)):
            mask = self.member[asked, k] if asked else np.zeros(0, dtype=bool)
            ll = rows[mask].sum(axis=0) if mask.any() else np.zeros(len(self.nodes))
            per[k] = self._eap(ll, general[0], self.cfg["patternSd"])
        return general, per

    def next_adaptive(self, asked: list[int], general, per) -> int | None:
        unseen = np.ones(len(self.items), dtype=bool)
        unseen[asked] = False
        best_k, best = None, -np.inf
        for k in range(len(self.patterns)):
            if not (unseen & self.member[:, k]).any():
                continue
            score = per[k, 1] + self.cfg["weakTilt"] * (general[0] - per[k, 0])
            if score > best + TIE:
                best_k, best = k, score
        if best_k is None:
            return None
        theta = per[best_k, 0]
        best_i, best_info = None, -np.inf
        for i in self.order:
            if not (unseen[i] and self.member[i, best_k]):
                continue
            pr = 1 / (1 + np.exp(-self.a[i] * (theta - self.b[i])))
            info = self.a[i] ** 2 * pr * (1 - pr)
            if info > best_info + TIE:
                best_i, best_info = int(i), info
        return best_i


def fixed_form(items: list[cat.Item], patterns: list[str], length: int) -> list[int]:
    """One form for everyone: round-robin over patterns, middle difficulty first, then easy, then hard."""
    pref = {0.0: 0, -1.0: 1, 1.0: 2}
    by_pattern = {p: sorted([i for i, it in enumerate(items) if it.patterns[0] == p], key=lambda i: (pref.get(items[i].b, 3), items[i].id)) for p in patterns}
    form, round_ = [], 0
    while len(form) < length:
        for p in patterns:
            if round_ < len(by_pattern[p]) and len(form) < length:
                form.append(by_pattern[p][round_])
        round_ += 1
    return form


def weak3_hits(true: np.ndarray, est: np.ndarray) -> float:
    return len(set(np.argsort(true)[:3]) & set(np.argsort(est)[:3])) / 3


def spearman(x: np.ndarray, y: np.ndarray) -> float:
    rx, ry = np.argsort(np.argsort(x)), np.argsort(np.argsort(y))
    return float(np.corrcoef(rx, ry)[0, 1])


def run(policy: str, sim: FastCat, true_theta: np.ndarray, rng: np.random.Generator, length: int, form: list[int]):
    """One test-taker, one policy: metrics after each item (index 0 = after 1 item)."""
    asked, correct, curve = [], [], []
    for step in range(length):
        general, per = sim.estimate(asked, correct)
        if policy == "adaptive":
            i = sim.next_adaptive(asked, general, per)
        elif policy == "fixed":
            i = form[step]
        else:
            i = int(rng.choice([j for j in range(len(sim.items)) if j not in asked]))
        theta = true_theta[sim.member[i]].mean()
        p = 1 / (1 + np.exp(-sim.a[i] * (theta - sim.b[i])))
        asked.append(i)
        correct.append(bool(rng.random() < p))
        _, per = sim.estimate(asked, correct)
        est = per[:, 0]
        curve.append(
            (
                float(np.sqrt(((est - true_theta) ** 2).mean())),
                spearman(true_theta, est),
                weak3_hits(true_theta, est),
                float(per[:, 1].max()),
            )
        )
    return np.array(curve)  # length x 4


def simulate(n: int, cfg: dict, seed: int, policies=("adaptive", "fixed", "random"), length: int = 20) -> dict:
    items, patterns = cat.load_bank()
    sim = FastCat(items, patterns, cfg)
    form = fixed_form(items, patterns, length)
    rng = np.random.default_rng(seed)
    takers = [rng.normal(0, 1) + rng.normal(0, PATTERN_SPREAD, len(patterns)) for _ in range(n)]
    out = {}
    for policy in policies:
        prng = np.random.default_rng(seed + 1)  # same answer randomness stream per policy
        curves = np.stack([run(policy, sim, t, prng, length, form) for t in takers])  # n x length x 4
        mean = curves.mean(axis=0)
        sem = curves.std(axis=0, ddof=1) / np.sqrt(n)
        out[policy] = {
            "rmse": mean[:, 0].round(4).tolist(),
            "spearman": mean[:, 1].round(4).tolist(),
            "weak3": mean[:, 2].round(4).tolist(),
            "weak3_sem": sem[:, 2].round(4).tolist(),
            "max_se": mean[:, 3].round(4).tolist(),
        }
    return out


def items_to_match(curve: list[float], target: float) -> int | None:
    """Fewest items at which a (higher-is-better) curve reaches target."""
    for k, v in enumerate(curve, 1):
        if v >= target:
            return k
    return None


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--n", type=int, default=2000)
    ap.add_argument("--horizon", type=int, default=60, help="longer test length for the items-to-target study")
    args = ap.parse_args()
    start = time.time()

    # 1. Tune the weak-pattern tilt on its own seed (selection data), then evaluate on a fresh one.
    tilts = [0.0, 0.25, 0.5, 1.0]
    tuning = {}
    for t in tilts:
        res = simulate(max(400, args.n // 4), {**cat.PLACEMENT, "weakTilt": t}, seed=1, policies=("adaptive",))
        tuning[t] = {"weak3_at_10": res["adaptive"]["weak3"][9], "weak3_at_20": res["adaptive"]["weak3"][19], "rmse_at_20": res["adaptive"]["rmse"][19]}
    best_tilt = max(tilts, key=lambda t: (tuning[t]["weak3_at_20"], tuning[t]["weak3_at_10"]))

    # 2. Evaluation on a fresh seed.
    cfg = {**cat.PLACEMENT, "weakTilt": best_tilt}
    res = simulate(args.n, cfg, seed=7)
    fixed20 = res["fixed"]["weak3"][19]
    headline = {
        "fixed_form_weak3_at_20": fixed20,
        "adaptive_items_to_match_fixed20": items_to_match(res["adaptive"]["weak3"], fixed20),
        "adaptive_weak3_at_20": res["adaptive"]["weak3"][19],
        "random_weak3_at_20": res["random"]["weak3"][19],
        "chance_weak3": round(3 / len(cat.load_bank()[1]), 4),
        "spearman_at_20": {p: res[p]["spearman"][19] for p in res},
        "rmse_at_20": {p: res[p]["rmse"][19] for p in res},
    }

    # 3. Longer tests on another fresh seed: how many items until half the weak-3 are caught?
    long = simulate(max(500, args.n // 2), cfg, seed=11, length=args.horizon)
    horizon = {
        "length": args.horizon,
        "n_takers": max(500, args.n // 2),
        "items_to_weak3_half": {p: items_to_match(long[p]["weak3"], 0.5) for p in long},
        # Adaptive items needed to match what the fixed form reaches at 30 and at the full horizon.
        "adaptive_items_to_match_fixed": {str(k): items_to_match(long["adaptive"]["weak3"], long["fixed"]["weak3"][k - 1]) for k in (30, args.horizon)},
        "weak3": {p: long[p]["weak3"] for p in long},
        "rmse": {p: long[p]["rmse"] for p in long},
    }
    report = {
        "n_takers": args.n,
        "population": {"general": "N(0, 1)", "pattern_spread_sd": PATTERN_SPREAD},
        "bank": "content/items: 120 items, b from difficulty label (-1/0/1), a = 1",
        "estimator": {k: cfg[k] for k in ("generalPriorSd", "patternSd")},
        "tilt_tuning": {str(k): v for k, v in tuning.items()},
        "selected_weak_tilt": best_tilt,
        "headline": headline,
        "curves": res,
        "horizon": horizon,
        "seconds": round(time.time() - start, 1),
    }
    (ROOT / "reports" / "cat_sim_v1.json").write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"tilt_tuning": report["tilt_tuning"], "selected": best_tilt, "headline": headline, "items_to_weak3_half": horizon["items_to_weak3_half"]}, indent=2))
    for k in range(10, args.horizon + 1, 10):
        print(f"horizon {k:2d} items  weak-3: " + "  ".join(f"{p} {long[p]['weak3'][k - 1]:.3f}" for p in long))
    for k in (5, 10, 15, 20):
        print(f"after {k:2d} items  weak-3 caught: " + "  ".join(f"{p} {res[p]['weak3'][k - 1]:.3f}" for p in res) + "   | RMSE: " + "  ".join(f"{p} {res[p]['rmse'][k - 1]:.3f}" for p in res))
    print(f"{report['seconds']}s")


if __name__ == "__main__":
    main()
