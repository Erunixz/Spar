"""Shared evaluation for the pattern classifier, so the baseline and the
fine-tuned model are scored exactly the same way."""

from __future__ import annotations

import numpy as np
from sklearn.metrics import f1_score, precision_recall_fscore_support

from src.patterns import PATTERNS

# Per-class F1 on fewer test examples than this is too noisy to average in.
MIN_SUPPORT = 5


def label_matrix(labels: list[list[str]]) -> np.ndarray:
    y = np.zeros((len(labels), len(PATTERNS)), dtype=int)
    index = {p: i for i, p in enumerate(PATTERNS)}
    for row, ls in enumerate(labels):
        for p in ls:
            y[row, index[p]] = 1
    return y


def predict(probs: np.ndarray, threshold: float) -> np.ndarray:
    """Threshold each class; always predict at least the top class (every problem has a pattern)."""
    pred = (probs >= threshold).astype(int)
    pred[np.arange(len(probs)), probs.argmax(axis=1)] = 1
    return pred


def evaluate(y_true: np.ndarray, probs: np.ndarray, threshold: float) -> dict:
    y_pred = predict(probs, threshold)
    p, r, f, support = precision_recall_fscore_support(y_true, y_pred, average=None, zero_division=0)
    reliable = support >= MIN_SUPPORT
    return {
        "threshold": threshold,
        "micro_f1": round(float(f1_score(y_true, y_pred, average="micro", zero_division=0)), 4),
        "macro_f1": round(float(f1_score(y_true, y_pred, average="macro", zero_division=0)), 4),
        f"macro_f1_support_ge_{MIN_SUPPORT}": round(float(f[reliable].mean()), 4) if reliable.any() else None,
        # The drills ask for one answer: is the single most likely pattern one of the true ones?
        "top1_accuracy": round(float(y_true[np.arange(len(probs)), probs.argmax(axis=1)].mean()), 4),
        "per_pattern": {
            name: {"precision": round(float(p[i]), 3), "recall": round(float(r[i]), 3), "f1": round(float(f[i]), 3), "support": int(support[i])}
            for i, name in enumerate(PATTERNS)
        },
    }


def best_threshold(y_true: np.ndarray, probs: np.ndarray, grid=np.arange(0.1, 0.71, 0.05)) -> float:
    """Global threshold maximizing macro-F1 (over classes present in y_true); tune on validation only."""
    present = y_true.sum(axis=0) > 0
    scores = [f1_score(y_true[:, present], predict(probs, t)[:, present], average="macro", zero_division=0) for t in grid]
    return round(float(grid[int(np.argmax(scores))]), 2)
