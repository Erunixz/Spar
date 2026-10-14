"""Fine-tune a transformer encoder as Model #1 (multi-label pattern classifier).

Model selection uses the validation split only. The newest-problems test split
is scored only with --score-test, once, for the model we ship.

With --distill, the loss mixes the true labels with a teacher's soft
probabilities (out-of-fold, from src.teacher_oof), so a small model can learn
from the larger blend.

Usage (from ml/):
  .venv/Scripts/python -m src.train_classifier --model sentence-transformers/all-MiniLM-L6-v2 --name minilm
  .venv/Scripts/python -m src.train_classifier --model FacebookAI/roberta-base --name roberta --lr 3e-5
  .venv/Scripts/python -m src.train_classifier ... --distill data/v1/teacher_train.npy --alpha 0.5
  .venv/Scripts/python -m src.train_classifier ... --score-test        # final run only
"""

from __future__ import annotations

import argparse
import json
import random
import time
from collections.abc import Callable
from pathlib import Path

import numpy as np
import pandas as pd
import torch
from torch.utils.data import DataLoader, TensorDataset
from transformers import AutoModelForSequenceClassification, AutoTokenizer, get_linear_schedule_with_warmup

from src.metrics import best_threshold, evaluate, label_matrix
from src.patterns import PATTERNS

DATA_VERSION = "v1"
ROOT = Path(__file__).resolve().parents[1]


def seed_everything(seed: int) -> None:
    random.seed(seed)
    np.random.seed(seed)
    torch.manual_seed(seed)
    torch.cuda.manual_seed_all(seed)


def load(split: str) -> pd.DataFrame:
    return pd.read_parquet(ROOT / "data" / DATA_VERSION / f"{split}.parquet")


def device() -> torch.device:
    return torch.device("cuda" if torch.cuda.is_available() else "cpu")


def encode(tokenizer, texts: list[str], labels: np.ndarray, max_len: int, soft: np.ndarray | None = None) -> TensorDataset:
    enc = tokenizer(texts, truncation=True, max_length=max_len, padding="max_length", return_tensors="pt")
    tensors = [enc["input_ids"], enc["attention_mask"], torch.tensor(labels, dtype=torch.float32)]
    if soft is not None:
        tensors.append(torch.tensor(soft, dtype=torch.float32))
    return TensorDataset(*tensors)


def new_model(name: str):
    return AutoModelForSequenceClassification.from_pretrained(
        name,
        num_labels=len(PATTERNS),
        problem_type="multi_label_classification",
        id2label=dict(enumerate(PATTERNS)),
        label2id={p: i for i, p in enumerate(PATTERNS)},
    )


@torch.no_grad()
def predict_probs(model, loader, dev) -> np.ndarray:
    model.eval()
    out = []
    for batch in loader:
        ids, mask = batch[0], batch[1]
        with torch.autocast(device_type=dev.type, dtype=torch.float16, enabled=dev.type == "cuda"):
            logits = model(input_ids=ids.to(dev), attention_mask=mask.to(dev)).logits
        out.append(torch.sigmoid(logits.float()).cpu().numpy())
    return np.concatenate(out)


def fit(
    model,
    train_ds: TensorDataset,
    y_train: np.ndarray,
    *,
    epochs: int,
    lr: float,
    batch: int,
    seed: int,
    alpha: float = 1.0,
    on_epoch: Callable[[int, float], None] | None = None,
) -> None:
    """Train in place. alpha weights the true-label loss; 1 - alpha weights the soft-target loss."""
    dev = device()
    model.to(dev)
    loader = DataLoader(train_ds, batch_size=batch, shuffle=True, generator=torch.Generator().manual_seed(seed))
    # Up-weight rare patterns: pos_weight = sqrt(negatives / positives), capped.
    pos = y_train.sum(axis=0).clip(min=1)
    pos_weight = torch.tensor(np.minimum(np.sqrt((len(y_train) - pos) / pos), 10.0), dtype=torch.float32, device=dev)
    hard_loss = torch.nn.BCEWithLogitsLoss(pos_weight=pos_weight)
    soft_loss = torch.nn.BCEWithLogitsLoss()

    optimizer = torch.optim.AdamW(model.parameters(), lr=lr, weight_decay=0.01)
    total = len(loader) * epochs
    scheduler = get_linear_schedule_with_warmup(optimizer, int(0.06 * total), total)
    scaler = torch.amp.GradScaler(enabled=dev.type == "cuda")
    for epoch in range(1, epochs + 1):
        model.train()
        running = 0.0
        for batch_t in loader:
            ids, mask, labels = (t.to(dev) for t in batch_t[:3])
            optimizer.zero_grad(set_to_none=True)
            with torch.autocast(device_type=dev.type, dtype=torch.float16, enabled=dev.type == "cuda"):
                logits = model(input_ids=ids, attention_mask=mask).logits
            logits = logits.float()
            loss = alpha * hard_loss(logits, labels)
            if alpha < 1.0:
                loss = loss + (1 - alpha) * soft_loss(logits, batch_t[3].to(dev))
            scaler.scale(loss).backward()
            scaler.unscale_(optimizer)
            torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0)
            scaler.step(optimizer)
            scaler.update()
            scheduler.step()
            running += loss.item()
        if on_epoch:
            on_epoch(epoch, running / len(loader))


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--model", required=True)
    ap.add_argument("--name", required=True)
    ap.add_argument("--epochs", type=int, default=8)
    ap.add_argument("--lr", type=float, default=5e-5)
    ap.add_argument("--batch", type=int, default=16)
    ap.add_argument("--max-len", type=int, default=384)
    ap.add_argument("--seed", type=int, default=13)
    ap.add_argument("--distill", help="npy of teacher probabilities for the train split (from src.teacher_oof)")
    ap.add_argument("--alpha", type=float, default=0.5, help="with --distill: weight of the true-label loss")
    ap.add_argument("--score-test", action="store_true", help="score the held-out test split (final model only)")
    args = ap.parse_args()

    seed_everything(args.seed)
    dev = device()
    train, val, test = load("train"), load("val"), load("test")
    y_train, y_val, y_test = (label_matrix(list(d["labels"])) for d in (train, val, test))
    soft = np.load(ROOT / args.distill) if args.distill else None
    alpha = args.alpha if soft is not None else 1.0

    tokenizer = AutoTokenizer.from_pretrained(args.model)
    model = new_model(args.model)
    train_ds = encode(tokenizer, list(train["text"]), y_train, args.max_len, soft)
    val_loader = DataLoader(encode(tokenizer, list(val["text"]), y_val, args.max_len), batch_size=64)

    ckpt = ROOT / "checkpoints" / args.name
    history: list[dict] = []
    best: dict | None = None

    def on_epoch(epoch: int, train_loss: float) -> None:
        nonlocal best
        probs = predict_probs(model, val_loader, dev)
        t = best_threshold(y_val, probs)
        m = evaluate(y_val, probs, t)
        row = {"epoch": epoch, "train_loss": round(train_loss, 4), "threshold": t, "val_macro_f1": m["macro_f1"], "val_top1": m["top1_accuracy"]}
        history.append(row)
        print(json.dumps(row), flush=True)
        if best is None or m["macro_f1"] > best["val_macro_f1"]:
            best = row
            model.save_pretrained(ckpt)
            tokenizer.save_pretrained(ckpt)

    start = time.perf_counter()
    fit(model, train_ds, y_train, epochs=args.epochs, lr=args.lr, batch=args.batch, seed=args.seed, alpha=alpha, on_epoch=on_epoch)
    train_seconds = round(time.perf_counter() - start, 1)
    assert best is not None

    # Reload the best epoch for the final numbers.
    model = AutoModelForSequenceClassification.from_pretrained(ckpt).to(dev)
    report = {
        "base_model": args.model,
        "data_version": DATA_VERSION,
        "params": {k: v for k, v in vars(args).items() if k != "score_test"},
        "parameters_millions": round(sum(p.numel() for p in model.parameters()) / 1e6, 1),
        "device": torch.cuda.get_device_name(0) if dev.type == "cuda" else "cpu",
        "train_seconds": train_seconds,
        "best_epoch": best["epoch"],
        "threshold": best["threshold"],
        "history": history,
        "val": evaluate(y_val, predict_probs(model, val_loader, dev), best["threshold"]),
    }
    if args.score_test:
        test_loader = DataLoader(encode(tokenizer, list(test["text"]), y_test, args.max_len), batch_size=64)
        report["test"] = evaluate(y_test, predict_probs(model, test_loader, dev), best["threshold"])
    (ckpt / "spar_threshold.json").write_text(json.dumps({"threshold": best["threshold"], "patterns": PATTERNS}) + "\n")
    out = ROOT / "reports" / f"finetune_{args.name}_{DATA_VERSION}.json"
    out.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    v = report["val"]
    print(f"best epoch {best['epoch']} | VAL macro-F1 {v['macro_f1']} top-1 {v['top1_accuracy']} | {train_seconds}s")
    if "test" in report:
        t = report["test"]
        print(f"TEST macro-F1 {t['macro_f1']} (support>=5: {t['macro_f1_support_ge_5']}) micro-F1 {t['micro_f1']} top-1 {t['top1_accuracy']}")


if __name__ == "__main__":
    main()
