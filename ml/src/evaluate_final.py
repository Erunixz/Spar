"""Final, one-time test-set evaluation for Model #1.

The shipped configuration was chosen on validation before this script ran
(SELECTION below). Other candidates are scored on test only for the /lab
comparison table; they cannot change the choice.

Writes reports/final_v1.json.
Usage (from ml/): .venv/Scripts/python -m src.evaluate_final
"""

from __future__ import annotations

import json

import numpy as np
from torch.utils.data import DataLoader
from transformers import AutoModelForSequenceClassification, AutoTokenizer

from src.metrics import evaluate, label_matrix
from src.train_baseline import build
from src.train_classifier import DATA_VERSION, ROOT, device, encode, load, predict_probs

# Frozen on validation (see reports/finetune_*.json and the blend searches) before test was scored.
SELECTION = {
    "shipped": "distilled MiniLM + TF-IDF",
    "student_checkpoint": "minilm-distilled",
    "weight_on_student": 0.4,
    "threshold": 0.35,
    "chosen_by": "validation macro-F1; size budget ~30 MB for the browser",
}
TEACHER = {"checkpoint": "roberta", "weight": 0.4, "threshold": 0.4}


def probs_for(checkpoint: str, texts: list[str], y: np.ndarray) -> np.ndarray:
    path = ROOT / "checkpoints" / checkpoint
    tok = AutoTokenizer.from_pretrained(path)
    model = AutoModelForSequenceClassification.from_pretrained(path).to(device())
    return predict_probs(model, DataLoader(encode(tok, texts, y, 384), batch_size=64), device())


def main() -> None:
    train, test = load("train"), load("test")
    y_train, y_test = label_matrix(list(train["labels"])), label_matrix(list(test["labels"]))
    texts = list(test["text"])
    baseline_cfg = json.load(open(ROOT / "reports" / f"baseline_{DATA_VERSION}.json"))["selected"]

    p_tfidf = build(baseline_cfg["C"]).fit(train["text"], y_train).predict_proba(texts)
    p_student = probs_for(SELECTION["student_checkpoint"], texts, y_test)
    p_roberta = probs_for(TEACHER["checkpoint"], texts, y_test)
    w = SELECTION["weight_on_student"]
    student_thr = json.load(open(ROOT / "checkpoints" / SELECTION["student_checkpoint"] / "spar_threshold.json"))["threshold"]

    candidates = {
        "tfidf_baseline": evaluate(y_test, p_tfidf, baseline_cfg["threshold"]),
        "minilm_distilled": evaluate(y_test, p_student, student_thr),
        "shipped_minilm_distilled_plus_tfidf": evaluate(y_test, w * p_student + (1 - w) * p_tfidf, SELECTION["threshold"]),
        "teacher_roberta_plus_tfidf": evaluate(
            y_test, TEACHER["weight"] * p_roberta + (1 - TEACHER["weight"]) * p_tfidf, TEACHER["threshold"]
        ),
    }
    report = {"data_version": DATA_VERSION, "test_rows": len(test), "selection": SELECTION, "test": candidates}
    (ROOT / "reports" / f"final_{DATA_VERSION}.json").write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")

    print(f"TEST ({len(test)} newest problems)     macro-F1  macro(n>=5)  micro-F1  top-1")
    for name, m in candidates.items():
        print(f"  {name:38s} {m['macro_f1']:.3f}    {m['macro_f1_support_ge_5']:.3f}      {m['micro_f1']:.3f}   {m['top1_accuracy']:.3f}")


if __name__ == "__main__":
    main()
