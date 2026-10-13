"""Baseline for Model #1: TF-IDF + one-vs-rest logistic regression.

C and the decision threshold are chosen on the validation split; the test
split (newest problems) is scored once at the end.

Usage (from ml/): .venv/Scripts/python -m src.train_baseline
"""

from __future__ import annotations

import json
import time
from pathlib import Path

import pandas as pd
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.multiclass import OneVsRestClassifier
from sklearn.pipeline import make_pipeline

from src.metrics import best_threshold, evaluate, label_matrix

DATA_VERSION = "v1"
ROOT = Path(__file__).resolve().parents[1]
C_GRID = [0.5, 1, 2, 4, 8, 16]


def load(split: str) -> pd.DataFrame:
    return pd.read_parquet(ROOT / "data" / DATA_VERSION / f"{split}.parquet")


def build(c: float):
    return make_pipeline(
        TfidfVectorizer(ngram_range=(1, 2), min_df=2, max_df=0.9, sublinear_tf=True, strip_accents="unicode"),
        OneVsRestClassifier(LogisticRegression(C=c, class_weight="balanced", max_iter=2000)),
    )


def main() -> None:
    train, val, test = load("train"), load("val"), load("test")
    y_train, y_val, y_test = (label_matrix(list(d["labels"])) for d in (train, val, test))

    search = []
    for c in C_GRID:
        model = build(c).fit(train["text"], y_train)
        probs = model.predict_proba(val["text"])
        t = best_threshold(y_val, probs)
        search.append({"C": c, "threshold": t, "val_macro_f1": evaluate(y_val, probs, t)["macro_f1"]})
    best = max(search, key=lambda s: s["val_macro_f1"])

    start = time.perf_counter()
    model = build(best["C"]).fit(train["text"], y_train)
    fit_seconds = round(time.perf_counter() - start, 2)
    report = {
        "model": "tfidf-word-1-2gram + one-vs-rest logistic regression (class_weight=balanced)",
        "data_version": DATA_VERSION,
        "selected": best,
        "search": search,
        "fit_seconds": fit_seconds,
        "val": evaluate(y_val, model.predict_proba(val["text"]), best["threshold"]),
        "test": evaluate(y_test, model.predict_proba(test["text"]), best["threshold"]),
    }
    out = ROOT / "reports" / f"baseline_{DATA_VERSION}.json"
    out.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")

    t = report["test"]
    print(f"selected C={best['C']} threshold={best['threshold']} (val macro-F1 {best['val_macro_f1']})")
    print(f"TEST  micro-F1 {t['micro_f1']}  macro-F1 {t['macro_f1']}  macro-F1(support>=5) {t['macro_f1_support_ge_5']}  top-1 acc {t['top1_accuracy']}")
    for name, m in t["per_pattern"].items():
        print(f"  {name:20s} P {m['precision']:.2f}  R {m['recall']:.2f}  F1 {m['f1']:.2f}  n={m['support']}")


if __name__ == "__main__":
    main()
