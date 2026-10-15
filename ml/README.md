# ml

Training and evaluation for Spar's in-browser models. Trains on a local NVIDIA GPU
(developed on an RTX 4060 laptop GPU, 8 GB); Kaggle/Colab free GPUs are the fallback.

## Setup

```sh
cd ml
python -m venv .venv
.venv/Scripts/python -m pip install torch==2.14.1 --index-url https://download.pytorch.org/whl/cu126
.venv/Scripts/python -m pip install -r requirements.txt
.venv/Scripts/python -m pytest -q
```

Without an NVIDIA GPU, install plain `torch==2.14.1` (CPU); the baseline doesn't need a GPU at all.

## Model #1: pattern classifier

| Step | Command | Output |
|---|---|---|
| Data | `.venv/Scripts/python -m src.prepare_data` | `data/v1/*.parquet` (git-ignored), `reports/data_v1.json` |
| Baseline | `.venv/Scripts/python -m src.train_baseline` | `reports/baseline_v1.json` |
| Fine-tune | `.venv/Scripts/python -m src.train_classifier --model <hf id> --name <name>` | `checkpoints/<name>/`, `reports/finetune_<name>_v1.json` |
| Teacher | `.venv/Scripts/python -m src.teacher_oof` (5-fold, ~16 min on an RTX 4060) | `data/v1/teacher_train.npy`, `reports/teacher_oof_v1.json` |
| Distil | `... src.train_classifier --model sentence-transformers/all-MiniLM-L6-v2 --name minilm-distilled --lr 1e-4 --batch 32 --epochs 30 --distill data/v1/teacher_train.npy --alpha 0.5` | `checkpoints/minilm-distilled/` |
| Final test | `.venv/Scripts/python -m src.evaluate_final` (run once) | `reports/final_v1.json` |
| Export | `.venv/Scripts/python -m src.export_onnx` | `artifacts/pattern-classifier-v1/` (git-ignored), `reports/export_v1.json` |

- **Labels:** LeetCode topic tags mapped onto Spar's 14 patterns in `src/patterns.py` (tested against `content/patterns.yaml`). Problems that map to no pattern are dropped.
- **Split:** by release date, so the test set is the newest problems the model could not have seen: oldest 75% train, next 10% validation, newest 15% test.
- **Metrics** (`src/metrics.py`, shared by every model): micro and macro F1, macro F1 over patterns with at least 5 test examples, top-1 accuracy (the drills ask for one answer), and per-pattern precision, recall and F1. Thresholds and hyperparameters are tuned on validation only.

### Results

Model selection used the validation split only; the shipped configuration was frozen before the
test split (340 newest problems, Dec 2023 to Mar 2025) was scored once.

| Model (test set) | Size in browser | Macro-F1 | Macro-F1 (n >= 5) | Micro-F1 | Top-1 |
|---|---|---|---|---|---|
| TF-IDF + logistic regression | ~2 MB | 0.480 | 0.421 | 0.455 | 0.509 |
| Distilled MiniLM-L6 alone | ~25 MB | 0.411 | 0.397 | 0.424 | 0.488 |
| **Shipped: distilled MiniLM + TF-IDF (0.4 / 0.6)** | ~27 MB | **0.492** | **0.435** | **0.475** | **0.521** |
| Teacher: RoBERTa-base + TF-IDF (0.4 / 0.6), reference | ~127 MB | 0.511 | 0.457 | 0.485 | 0.559 |

Validation ablation (MiniLM, 30 epochs): distillation from the out-of-fold teacher lifts macro-F1
from 0.436 to 0.489 and top-1 from 0.518 to 0.549.

Honest reading: with ~1,700 training problems and noisy tag-derived labels, a fine-tuned transformer
alone does not beat TF-IDF; blending them does. Test differences of 1 to 2 points are within the
noise of a 340-problem set. Keyword patterns (trees, linked lists, graphs) are easy for every model;
shape patterns (two pointers, monotonic stack, prefix sum) remain hard.

### Browser export

The student is exported to ONNX and quantized to 8 bits per channel (ONNX Runtime dynamic
quantization); the TF-IDF half ships as JSON. Validation, shipped blend:

| Student weights | Size | Macro-F1 | Top-1 | Mean prob. change vs PyTorch |
|---|---|---|---|---|
| PyTorch / ONNX fp32 | 87 MB | 0.501 | 0.611 | ~0 |
| 8-bit, per-tensor scales | 22.0 MB | 0.490 | 0.606 | 0.016 |
| **8-bit, per-channel scales (shipped)** | **22.1 MB** | **0.503** | **0.611** | 0.009 |

`src/tfidf_export.py` holds a pure-Python reference scorer that reads only the JSON; tests check
it against scikit-learn (< 1e-6), and it is the spec for the browser's TypeScript port.
`parity_fixture.json` records expected outputs on Spar's own drill prompts for the browser tests.

### In the browser

The app runs the blend in a Web Worker: Transformers.js 4.3 (ONNX Runtime Web, WebAssembly) for the
student, and a TypeScript port of the TF-IDF scorer (`apps/web/src/features/patterns/`), both checked
against Python's outputs on the parity fixture. Measured in Edge on the development laptop:

| | |
|---|---|
| First answer, including model download from the local server | ~2 s |
| Inference per problem (median / p90 of 20) | 20 ms / 24 ms |
| Download: model + tokenizer + TF-IDF + ONNX Runtime | ~22 + 0.7 + 2.9 (0.9 gzipped) + 25.6 MB |

WebGPU is available but not used: the 8-bit dynamically quantized model is a WebAssembly format, and
at 20 ms per problem there is nothing to gain.

## Model #2: difficulty rating

| Step | Command | Output |
|---|---|---|
| Ratings | download `ratings.txt` from [zerotrac/leetcode_problem_rating](https://github.com/zerotrac/leetcode_problem_rating) (MIT) to `data/raw/zerotrac_ratings.txt` | |
| Train + select | `.venv/Scripts/python -m src.difficulty` (validation only) | `reports/difficulty_v1.json` |
| Final test | `.venv/Scripts/python -m src.difficulty --score-test` (once) | `reports/difficulty_v1.json` |
| Rate catalog | `.venv/Scripts/python -m src.difficulty --rate-catalog` | `rating` + `rating_source` in `content/lc_catalog.yaml` |

2,045 problems have both a contest rating and a statement; split by date (1,534 / 204 / 307).
Because the Easy / Medium / Hard label is always known, the yardstick is **Spearman within a label**.

| Model (test) | Spearman | MAE | Within-label Spearman | Easy / Medium / Hard |
|---|---|---|---|---|
| Label mean | 0.886 | 222 | 0.000 | 0 / 0 / 0 |
| Label + tag means (plan's baseline) | 0.863 | 213 | 0.145 | 0.10 / 0.32 / 0.02 |
| Ridge: label + tags | 0.878 | 214 | 0.220 | 0.18 / 0.43 / 0.05 |
| **Ridge: label + tags + text (shipped)** | 0.881 | 218 | **0.258** | 0.28 / 0.45 / 0.05 |

The app maps a rating to the skill scale as b = (rating - 1271) / 500 (`params.ts`), so recommendations and
mastery updates use each problem's own difficulty instead of an Easy/Medium/Hard bucket.

## Data and licensing

- LeetCodeDataset (`newfacade/LeetCodeDataset`, Apache-2.0 per its card) contains LeetCode problem text. It is used **for training only**: never committed, never shown in the app, never redistributed. A dataset license can't grant rights LeetCode claims, so model cards flag this.
- `data/`, `checkpoints/`, `.venv/` and `*.onnx` are git-ignored. Only code, tests and `reports/*.json` (counts and metrics, no problem text) are committed.

## Layout

- `src/` data prep, training, metrics
- `tests/` pytest (run in CI with `requirements-test.txt`, no PyTorch)
- `reports/` committed metrics and data manifests
- `notebooks/`, `eval/`, `model_cards/` filled in as the models land
