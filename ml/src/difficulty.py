"""Model #2: predict a LeetCode problem's difficulty rating from its text.

Labels: zerotrac's contest ratings (MIT), joined to LeetCodeDataset text by
slug. Split by release date like Model #1. The difficulty label (Easy /
Medium / Hard) is known for every problem, so the bar to beat is "the average
rating for that label"; the metric that matters is how well a model ranks
problems *within* a label, which the label alone cannot do.

Writes reports/difficulty_v1.json. The shipped model then rates the catalog
problems that have no contest rating (see rate_catalog).

Usage (from ml/): .venv/Scripts/python -m src.difficulty [--score-test]
                  .venv/Scripts/python -m src.difficulty --rate-catalog
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import numpy as np
import pandas as pd
from scipy.sparse import csr_matrix, hstack
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import Ridge

from src.prepare_data import clean_text, temporal_split

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "data" / "raw"
VERSION = "v1"
LABELS = ["easy", "medium", "hard"]
ALPHAS = [0.3, 1, 3, 10, 30]


def load_joined() -> pd.DataFrame:
    rows = [json.loads(l) for s in ("train", "test") for l in open(RAW / f"LeetCodeDataset-{s}.jsonl", encoding="utf-8")]
    text = pd.DataFrame(
        {
            "slug": [r["task_id"] for r in rows],
            "question_id": [int(r["question_id"]) for r in rows],
            "date": pd.to_datetime([r["estimated_date"] for r in rows]),
            "difficulty": [r["difficulty"].lower() for r in rows],
            "tags": [r["tags"] for r in rows],
            "text": [clean_text(r["problem_description"]) for r in rows],
        }
    ).drop_duplicates("slug")
    ratings = pd.read_csv(RAW / "zerotrac_ratings.txt", sep="\t").rename(columns={"Title Slug": "slug", "Rating": "rating"})
    return text.merge(ratings[["slug", "rating"]], on="slug")


def metrics(df: pd.DataFrame, pred: np.ndarray) -> dict:
    y = df["rating"].to_numpy()
    within = {}
    for label in LABELS:
        m = (df["difficulty"] == label).to_numpy()
        if m.sum() < 3:
            continue
        # A constant prediction (e.g. the label mean) ranks nothing: score 0, not NaN.
        # (Its std can be ~1e-13 from rounding, so compare with a tolerance.)
        rho = 0.0 if np.ptp(pred[m]) < 1e-9 else pd.Series(y[m]).corr(pd.Series(pred[m]), method="spearman")
        within[label] = round(float(rho), 4)
    return {
        "spearman": round(float(pd.Series(y).corr(pd.Series(pred), method="spearman")), 4),
        "mae": round(float(np.abs(y - pred).mean()), 1),
        # How well it orders problems inside one label: the part the label can't explain.
        "spearman_within_label_mean": round(float(np.mean(list(within.values()))), 4) if within else 0.0,
        "spearman_within_label": within,
        "rows": int(len(df)),
    }


class LabelMean:
    """Baseline: the average training rating for the problem's difficulty label."""

    def fit(self, df: pd.DataFrame):
        self.means = df.groupby("difficulty")["rating"].mean().to_dict()
        return self

    def predict(self, df: pd.DataFrame) -> np.ndarray:
        return df["difficulty"].map(self.means).to_numpy()


class TagMean:
    """Baseline from the plan: label mean, nudged by the average residual of the problem's LeetCode tags."""

    def fit(self, df: pd.DataFrame):
        self.label = LabelMean().fit(df)
        resid = df["rating"] - self.label.predict(df)
        per_tag: dict[str, list[float]] = {}
        for tags, r in zip(df["tags"], resid):
            for t in tags:
                per_tag.setdefault(t, []).append(r)
        self.tag = {t: float(np.mean(v)) for t, v in per_tag.items() if len(v) >= 5}
        return self

    def predict(self, df: pd.DataFrame) -> np.ndarray:
        base = self.label.predict(df)
        adj = [np.mean([self.tag[t] for t in tags if t in self.tag]) if any(t in self.tag for t in tags) else 0.0 for tags in df["tags"]]
        return base + np.array(adj)


class TextRidge:
    """TF-IDF of the statement + the difficulty label, ridge regression on the rating."""

    def __init__(self, alpha: float):
        self.alpha = alpha

    def _x(self, df: pd.DataFrame, fit: bool = False):
        words = self.vec.fit_transform(df["text"]) if fit else self.vec.transform(df["text"])
        onehot = csr_matrix(np.stack([(df["difficulty"] == l).to_numpy(float) for l in LABELS], axis=1) * 3.0)
        return hstack([words, onehot]).tocsr()

    def fit(self, df: pd.DataFrame):
        self.vec = TfidfVectorizer(ngram_range=(1, 2), min_df=2, max_df=0.9, sublinear_tf=True, strip_accents="unicode")
        self.model = Ridge(alpha=self.alpha).fit(self._x(df, fit=True), df["rating"])
        return self

    def predict(self, df: pd.DataFrame) -> np.ndarray:
        return self.model.predict(self._x(df))


class TagRidge:
    """Ridge on the difficulty label + LeetCode tags (public metadata), optionally + TF-IDF text."""

    def __init__(self, alpha: float, text_weight: float = 0.0):
        self.alpha = alpha
        self.text_weight = text_weight

    def _x(self, df: pd.DataFrame, fit: bool = False):
        onehot = np.stack([(df["difficulty"] == l).to_numpy(float) for l in LABELS], axis=1)
        tag_rows = [[self.tag_index[t] for t in tags if t in self.tag_index] for tags in df["tags"]]
        tags = np.zeros((len(df), len(self.tag_index)))
        for i, idx in enumerate(tag_rows):
            tags[i, idx] = 1.0
        blocks = [csr_matrix(onehot * 3.0), csr_matrix(tags)]
        if self.text_weight > 0:
            words = self.vec.fit_transform(df["text"]) if fit else self.vec.transform(df["text"])
            blocks.append(words * self.text_weight)
        return hstack(blocks).tocsr()

    def fit(self, df: pd.DataFrame):
        counts = pd.Series([t for tags in df["tags"] for t in tags]).value_counts()
        self.tag_index = {t: i for i, t in enumerate(sorted(counts[counts >= 5].index))}
        self.vec = TfidfVectorizer(ngram_range=(1, 2), min_df=2, max_df=0.9, sublinear_tf=True, strip_accents="unicode")
        self.model = Ridge(alpha=self.alpha).fit(self._x(df, fit=True), df["rating"])
        return self

    def predict(self, df: pd.DataFrame) -> np.ndarray:
        return self.model.predict(self._x(df))


def splits() -> dict[str, pd.DataFrame]:
    return temporal_split(load_joined(), {"train": 0.75, "val": 0.10, "test": 0.15})


CATALOG = ROOT.parent / "content" / "lc_catalog.yaml"


def rate_catalog() -> None:
    """Add `rating` and `rating_source` to every catalog entry. Numbers only: no text leaves ml/.

    contest = zerotrac's rating; model = the selected model, refit on every rated problem;
    label = average for the difficulty label (no statement available).
    """
    import re

    report = json.loads((ROOT / "reports" / f"difficulty_{VERSION}.json").read_text(encoding="utf-8"))
    sel = report["selected"]
    rated = load_joined()
    model = TagRidge(sel["alpha"], sel["text_weight"]).fit(rated)
    label_mean = LabelMean().fit(rated)
    contest = dict(zip(rated["slug"], rated["rating"]))

    rows = [json.loads(l) for s in ("train", "test") for l in open(RAW / f"LeetCodeDataset-{s}.jsonl", encoding="utf-8")]
    meta = {r["task_id"]: r for r in rows}
    out, counts = [], {"contest": 0, "model": 0, "label": 0}
    for line in CATALOG.read_text(encoding="utf-8").splitlines():
        m = re.match(r"^- \{ slug: ([a-z0-9-]+), number: \d+, difficulty: (easy|medium|hard),", line)
        if not m:
            out.append(line)
            continue
        slug, label = m.group(1), m.group(2)
        line = re.sub(r", rating: \d+, rating_source: \w+", "", line)
        if slug in contest:
            rating, source = contest[slug], "contest"
        elif slug in meta:
            r = meta[slug]
            one = pd.DataFrame({"difficulty": [label], "tags": [r["tags"]], "text": [clean_text(r["problem_description"])]})
            rating, source = float(model.predict(one)[0]), "model"
        else:
            rating, source = float(label_mean.means[label]), "label"
        counts[source] += 1
        out.append(line[:-2] + f", rating: {round(rating)}, rating_source: {source} }}")
    CATALOG.write_text("\n".join(out) + "\n", encoding="utf-8", newline="\n")
    print("rated catalog:", counts)


GRID = [(tw, a) for tw in (0.0, 0.5, 1.0, 2.0) for a in (3, 10, 30, 100, 300)]


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--score-test", action="store_true")
    ap.add_argument("--rate-catalog", action="store_true", help="write ratings into content/lc_catalog.yaml")
    args = ap.parse_args()
    if args.rate_catalog:
        return rate_catalog()
    parts = splits()
    train, val, test = parts["train"], parts["val"], parts["test"]

    # Model selection on validation only: within-label Spearman is the target.
    search = []
    for tw, a in GRID:
        m = metrics(val, TagRidge(a, tw).fit(train).predict(val))
        search.append({"text_weight": tw, "alpha": a, **{k: m[k] for k in ("spearman", "mae", "spearman_within_label_mean")}})
    best = max(search, key=lambda s: s["spearman_within_label_mean"])
    best_no_text = max((s for s in search if s["text_weight"] == 0), key=lambda s: s["spearman_within_label_mean"])
    text_alpha = max(({"alpha": a, "w": metrics(val, TextRidge(a).fit(train).predict(val))["spearman_within_label_mean"]} for a in ALPHAS), key=lambda s: s["w"])["alpha"]

    models = {
        "label_mean": LabelMean(),
        "tag_mean": TagMean(),
        "text_ridge": TextRidge(text_alpha),
        "tag_ridge": TagRidge(best_no_text["alpha"]),
        "tag_text_ridge": TagRidge(best["alpha"], best["text_weight"]),
    }
    fitted = {k: m.fit(train) for k, m in models.items()}
    report = {
        "version": VERSION,
        "labels": "zerotrac contest ratings (MIT), joined to LeetCodeDataset text by slug",
        "features": "difficulty label, LeetCode tags (public metadata) and, for text models, TF-IDF of the statement",
        "split": {k: {"rows": len(v), "date_from": v["date"].min().date().isoformat(), "date_to": v["date"].max().date().isoformat()} for k, v in parts.items()},
        "search": search,
        "selected": {"model": "tag_text_ridge", "alpha": best["alpha"], "text_weight": best["text_weight"], "chosen_by": "validation within-label Spearman"},
        "val": {k: metrics(val, m.predict(val)) for k, m in fitted.items()},
    }
    if args.score_test:
        report["test"] = {k: metrics(test, m.predict(test)) for k, m in fitted.items()}
    (ROOT / "reports" / f"difficulty_{VERSION}.json").write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")

    print(f"rows: { {k: v['rows'] for k, v in report['split'].items()} } | selected text_weight={best['text_weight']} alpha={best['alpha']}")
    for split in ("val", "test") if args.score_test else ("val",):
        print(f"{split.upper():5s} {'model':15s} spearman  MAE    within-label spearman (easy / medium / hard)")
        for k, m in report[split].items():
            w = m["spearman_within_label"]
            print(f"      {k:15s} {m['spearman']:.3f}   {m['mae']:6.1f}  {m['spearman_within_label_mean']:.3f}  ({' / '.join(f'{w.get(l, 0):.2f}' for l in LABELS)})")


if __name__ == "__main__":
    main()
