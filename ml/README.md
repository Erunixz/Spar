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

- **Labels:** LeetCode topic tags mapped onto Spar's 14 patterns in `src/patterns.py` (tested against `content/patterns.yaml`). Problems that map to no pattern are dropped.
- **Split:** by release date, so the test set is the newest problems the model could not have seen: oldest 75% train, next 10% validation, newest 15% test.
- **Metrics** (`src/metrics.py`, shared by every model): micro and macro F1, macro F1 over patterns with at least 5 test examples, top-1 accuracy (the drills ask for one answer), and per-pattern precision, recall and F1. Thresholds and hyperparameters are tuned on validation only.

### Results so far (test = 340 newest problems)

| Model | Macro-F1 | Macro-F1 (support >= 5) | Micro-F1 | Top-1 accuracy |
|---|---|---|---|---|
| TF-IDF + logistic regression | 0.48 | 0.42 | 0.46 | 0.51 |

## Data and licensing

- LeetCodeDataset (`newfacade/LeetCodeDataset`, Apache-2.0 per its card) contains LeetCode problem text. It is used **for training only**: never committed, never shown in the app, never redistributed. A dataset license can't grant rights LeetCode claims, so model cards flag this.
- `data/`, `checkpoints/`, `.venv/` and `*.onnx` are git-ignored. Only code, tests and `reports/*.json` (counts and metrics, no problem text) are committed.

## Layout

- `src/` data prep, training, metrics
- `tests/` pytest (run in CI with `requirements-test.txt`, no PyTorch)
- `reports/` committed metrics and data manifests
- `notebooks/`, `eval/`, `model_cards/` filled in as the models land
