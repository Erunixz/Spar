"""Export the shipped Model #1 for the browser and check nothing was lost.

1. Distilled MiniLM -> ONNX (fp32) -> dynamic per-channel 8-bit quantization, laid out the
   way Transformers.js expects (config + tokenizer + onnx/model_quantized.onnx).
2. Fidelity: probabilities from PyTorch vs ONNX fp32 vs ONNX int8, and
   validation metrics of the shipped blend with each.
3. The TF-IDF half as compact JSON (vocabulary, idf, per-pattern weights), so
   the browser can run it without scikit-learn.
4. Parity fixtures from Spar's own drill prompts (never LeetCode text) so the
   browser implementation can be tested against these exact numbers.

Outputs: artifacts/pattern-classifier-v1/ (git-ignored), reports/export_v1.json.
Usage (from ml/): .venv/Scripts/python -m src.export_onnx
"""

from __future__ import annotations

import json
import shutil
from pathlib import Path

import numpy as np
import onnxruntime as ort
import torch
import yaml
from onnxruntime.quantization import QuantType, quantize_dynamic
from transformers import AutoModelForSequenceClassification, AutoTokenizer

from src.evaluate_final import SELECTION
from src.metrics import evaluate, label_matrix
from src.patterns import PATTERNS
from src.tfidf_export import export_tfidf
from src.train_baseline import build
from src.train_classifier import DATA_VERSION, ROOT, load

MAX_LEN = 384
OUT = ROOT / "artifacts" / f"pattern-classifier-{DATA_VERSION}"
REPO = ROOT.parent


def sigmoid(x: np.ndarray) -> np.ndarray:
    return 1 / (1 + np.exp(-x))


def torch_probs(model, tok, texts: list[str]) -> np.ndarray:
    out = []
    with torch.no_grad():
        for i in range(0, len(texts), 32):
            enc = tok(texts[i : i + 32], truncation=True, max_length=MAX_LEN, padding=True, return_tensors="pt")
            out.append(torch.sigmoid(model(input_ids=enc["input_ids"], attention_mask=enc["attention_mask"]).logits).numpy())
    return np.concatenate(out)


def onnx_probs(path: Path, tok, texts: list[str], batch: int = 32) -> np.ndarray:
    # Dynamic int8 quantization scales activations per tensor, so a padded batch
    # gives slightly different outputs than one text at a time. The browser runs
    # one text at a time: use batch=1 wherever int8 numbers must match it.
    sess = ort.InferenceSession(str(path), providers=["CPUExecutionProvider"])
    out = []
    for i in range(0, len(texts), batch):
        enc = tok(texts[i : i + batch], truncation=True, max_length=MAX_LEN, padding=True, return_tensors="np")
        (logits,) = sess.run(["logits"], {"input_ids": enc["input_ids"].astype(np.int64), "attention_mask": enc["attention_mask"].astype(np.int64)})
        out.append(sigmoid(logits))
    return np.concatenate(out)


def drill_prompts() -> list[str]:
    """Spar's own pattern-item prompts: safe to commit as test fixtures."""
    prompts = []
    for f in sorted((REPO / "content" / "items").glob("pat-*.yaml"))[:24]:
        prompts.append(yaml.safe_load(f.read_text(encoding="utf-8"))["prompt"].strip())
    return prompts


def main() -> None:
    ckpt = ROOT / "checkpoints" / SELECTION["student_checkpoint"]
    w, threshold = SELECTION["weight_on_student"], SELECTION["threshold"]
    if OUT.exists():
        shutil.rmtree(OUT)
    (OUT / "onnx").mkdir(parents=True)

    tok = AutoTokenizer.from_pretrained(ckpt)
    model = AutoModelForSequenceClassification.from_pretrained(ckpt).eval()
    model.config.save_pretrained(OUT)
    tok.save_pretrained(OUT)

    # 1. ONNX export + 8-bit quantization.
    fp32, int8 = OUT / "onnx" / "model.onnx", OUT / "onnx" / "model_quantized.onnx"
    dummy = tok(["two pointers on a sorted array"], return_tensors="pt")
    torch.onnx.export(
        model,
        (dummy["input_ids"], dummy["attention_mask"]),
        fp32,
        input_names=["input_ids", "attention_mask"],
        output_names=["logits"],
        dynamic_axes={"input_ids": {0: "batch", 1: "sequence"}, "attention_mask": {0: "batch", 1: "sequence"}, "logits": {0: "batch"}},
        opset_version=17,
        dynamo=False,
    )
    # Per-channel scales: same size as per-tensor, but matches fp32 on validation
    # (per-tensor lost ~1 point of macro-F1; see reports/export_v1.json).
    quantize_dynamic(fp32, int8, weight_type=QuantType.QUInt8, per_channel=True)

    # 2. Fidelity on the validation split.
    train, val = load("train"), load("val")
    y_train, y_val = label_matrix(list(train["labels"])), label_matrix(list(val["labels"]))
    texts = list(val["text"])
    p_torch = torch_probs(model, tok, texts)
    p_fp32 = onnx_probs(fp32, tok, texts)
    p_int8 = onnx_probs(int8, tok, texts, batch=1)  # as the browser runs it

    c = json.load(open(ROOT / "reports" / f"baseline_{DATA_VERSION}.json"))["selected"]["C"]
    tfidf = build(c).fit(train["text"], y_train)
    p_tfidf = tfidf.predict_proba(texts)
    blend = lambda p: w * p + (1 - w) * p_tfidf  # noqa: E731
    def summary(p: np.ndarray) -> dict:
        m = evaluate(y_val, blend(p), threshold)
        return {k: m[k] for k in ("macro_f1", "micro_f1", "top1_accuracy")}

    # 3. TF-IDF as JSON.
    tfidf_json = export_tfidf(tfidf)
    (OUT / "tfidf.json").write_text(json.dumps(tfidf_json, separators=(",", ":")), encoding="utf-8")
    spar = {"patterns": PATTERNS, "weight_on_student": w, "threshold": threshold, "max_length": MAX_LEN, "data_version": DATA_VERSION}
    (OUT / "spar.json").write_text(json.dumps(spar, indent=2) + "\n", encoding="utf-8")

    # 4. Parity fixtures from Spar's own prompts.
    prompts = drill_prompts()
    fixture = {
        "note": "Generated by ml/src/export_onnx.py from Spar's own drill prompts. Do not edit by hand.",
        "weight_on_student": w,
        "cases": [
            {"text": t, "tfidf": [round(float(x), 6) for x in pt], "student_int8": [round(float(x), 6) for x in ps]}
            for t, pt, ps in zip(prompts, tfidf.predict_proba(prompts), onnx_probs(int8, tok, prompts, batch=1))
        ],
    }
    (OUT / "parity_fixture.json").write_text(json.dumps(fixture, indent=1) + "\n", encoding="utf-8")

    mb = lambda p: round(p.stat().st_size / 2**20, 2)  # noqa: E731
    report = {
        "student_checkpoint": SELECTION["student_checkpoint"],
        "quantization": "onnxruntime dynamic, weights QUInt8, per-channel",
        "sizes_mb": {"onnx_fp32": mb(fp32), "onnx_int8": mb(int8), "tfidf_json": mb(OUT / "tfidf.json")},
        "max_abs_prob_diff_vs_torch": {
            "onnx_fp32": round(float(np.abs(p_fp32 - p_torch).max()), 6),
            "onnx_int8": round(float(np.abs(p_int8 - p_torch).max()), 6),
            "onnx_int8_mean": round(float(np.abs(p_int8 - p_torch).mean()), 6),
        },
        "top1_agreement_int8_vs_torch": round(float((p_int8.argmax(1) == p_torch.argmax(1)).mean()), 4),
        "val_shipped_blend": {"torch": summary(p_torch), "onnx_fp32": summary(p_fp32), "onnx_int8": summary(p_int8)},
        "tfidf_terms": len(tfidf_json["terms"]),
        "parity_cases": len(fixture["cases"]),
    }
    (ROOT / "reports" / f"export_{DATA_VERSION}.json").write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
