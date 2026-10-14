"""Out-of-fold teacher probabilities for distilling Model #1.

The teacher is a blend of the TF-IDF baseline and fine-tuned RoBERTa. A teacher
that has seen a problem during training just echoes its labels, so each train
problem's soft targets come from models trained on the other folds.

Writes data/v1/teacher_train.npy (git-ignored) and reports/teacher_oof_v1.json.
Usage (from ml/): .venv/Scripts/python -m src.teacher_oof
"""

from __future__ import annotations

import json
import time

import numpy as np
from sklearn.model_selection import KFold
from transformers import AutoTokenizer

from src.metrics import best_threshold, evaluate, label_matrix
from src.train_baseline import build
from src.train_classifier import DATA_VERSION, ROOT, device, encode, fit, load, new_model, predict_probs, seed_everything
from torch.utils.data import DataLoader

FOLDS = 5
ROBERTA = "FacebookAI/roberta-base"
ROBERTA_EPOCHS = 8  # best validation epoch of the full RoBERTa run
WEIGHT_ON_ROBERTA = 0.4  # chosen on validation (blend search)
SEED = 13


def main() -> None:
    seed_everything(SEED)
    train = load("train")
    y = label_matrix(list(train["labels"]))
    texts = list(train["text"])
    c = json.load(open(ROOT / "reports" / f"baseline_{DATA_VERSION}.json"))["selected"]["C"]
    tokenizer = AutoTokenizer.from_pretrained(ROBERTA)

    p_tfidf = np.zeros(y.shape, dtype=np.float32)
    p_roberta = np.zeros(y.shape, dtype=np.float32)
    start = time.perf_counter()
    for k, (fit_idx, held_idx) in enumerate(KFold(FOLDS, shuffle=True, random_state=SEED).split(texts), 1):
        fit_texts = [texts[i] for i in fit_idx]
        held_texts = [texts[i] for i in held_idx]
        p_tfidf[held_idx] = build(c).fit(fit_texts, y[fit_idx]).predict_proba(held_texts)

        model = new_model(ROBERTA)
        fit(model, encode(tokenizer, fit_texts, y[fit_idx], 384), y[fit_idx], epochs=ROBERTA_EPOCHS, lr=3e-5, batch=16, seed=SEED + k)
        held = DataLoader(encode(tokenizer, held_texts, y[held_idx], 384), batch_size=64)
        p_roberta[held_idx] = predict_probs(model, held, device())
        del model
        print(f"fold {k}/{FOLDS} done ({time.perf_counter() - start:.0f}s)", flush=True)

    teacher = WEIGHT_ON_ROBERTA * p_roberta + (1 - WEIGHT_ON_ROBERTA) * p_tfidf
    np.save(ROOT / "data" / DATA_VERSION / "teacher_train.npy", teacher)

    def score(p: np.ndarray) -> dict:
        m = evaluate(y, p, best_threshold(y, p))
        return {k: m[k] for k in ("macro_f1", "micro_f1", "top1_accuracy")}

    report = {
        "folds": FOLDS,
        "teacher": f"{WEIGHT_ON_ROBERTA} * roberta + {1 - WEIGHT_ON_ROBERTA:.1f} * tfidf",
        "seconds": round(time.perf_counter() - start, 1),
        # Out-of-fold quality on train: how good the soft targets are.
        "oof_train": {"tfidf": score(p_tfidf), "roberta": score(p_roberta), "blend": score(teacher)},
    }
    (ROOT / "reports" / f"teacher_oof_{DATA_VERSION}.json").write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report["oof_train"], indent=2))


if __name__ == "__main__":
    main()
