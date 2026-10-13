"""Build the versioned, time-split dataset for Model #1 (pattern classifier).

Reads LeetCodeDataset (downloaded to ml/data/raw, git-ignored), labels each
problem with Spar patterns, drops problems with none, and splits by release
date: oldest 75% train, next 10% validation, newest 15% test.

Outputs:
  ml/data/<version>/{train,val,test}.parquet   problem text: training only, never committed
  ml/reports/data_<version>.json              counts and date cut-offs only: committed

Usage (from ml/): .venv/Scripts/python -m src.prepare_data
"""

from __future__ import annotations

import hashlib
import json
import re
from pathlib import Path

import pandas as pd
from huggingface_hub import hf_hub_download

from src.patterns import PATTERNS, map_patterns

VERSION = "v1"
DATASET = "newfacade/LeetCodeDataset"
ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "data" / "raw"
SPLITS = {"train": 0.75, "val": 0.10, "test": 0.15}


def clean_text(text: str) -> str:
    text = text.replace("\xa0", " ")
    text = re.sub(r"[ \t]+", " ", text)
    return re.sub(r"\n{3,}", "\n\n", text).strip()


def temporal_split(df: pd.DataFrame, fractions: dict[str, float]) -> dict[str, pd.DataFrame]:
    """Oldest rows go to the first split, newest to the last. Deterministic: ties break on question_id."""
    ordered = df.sort_values(["date", "question_id"], kind="mergesort").reset_index(drop=True)
    out, start = {}, 0
    names = list(fractions)
    for i, name in enumerate(names):
        end = len(ordered) if i == len(names) - 1 else start + round(fractions[name] * len(ordered))
        out[name] = ordered.iloc[start:end].reset_index(drop=True)
        start = end
    return out


def load_raw() -> pd.DataFrame:
    rows = []
    for split in ("train", "test"):  # the dataset's own split is ignored; we split by date
        path = hf_hub_download(DATASET, f"LeetCodeDataset-{split}.jsonl", repo_type="dataset", local_dir=RAW)
        with open(path, encoding="utf-8") as f:
            rows.extend(json.loads(line) for line in f)
    return pd.DataFrame(rows)


def file_sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main() -> None:
    raw = load_raw()
    df = pd.DataFrame(
        {
            "task_id": raw["task_id"],
            "question_id": raw["question_id"].astype(int),
            "date": pd.to_datetime(raw["estimated_date"]),
            "difficulty": raw["difficulty"].str.lower(),
            "text": raw["problem_description"].map(clean_text),
            "labels": [map_patterns(t, s) for t, s in zip(raw["tags"], raw["task_id"])],
        }
    ).drop_duplicates("task_id")
    unlabeled = int((df["labels"].str.len() == 0).sum())
    df = df[df["labels"].str.len() > 0]
    splits = temporal_split(df, SPLITS)

    out_dir = ROOT / "data" / VERSION
    out_dir.mkdir(parents=True, exist_ok=True)
    for name, part in splits.items():
        part.to_parquet(out_dir / f"{name}.parquet", index=False)

    manifest = {
        "version": VERSION,
        "source": {
            "dataset": DATASET,
            "files_sha256": {p.name: file_sha256(p) for p in sorted(RAW.glob("*.jsonl"))},
            "note": "Problem text is used for training only and is never committed or shown in the app.",
        },
        "labelling": {"mapping_sha256": file_sha256(ROOT / "src" / "patterns.py"), "patterns": PATTERNS},
        "problems_total": int(len(raw)),
        "dropped_no_pattern": unlabeled,
        "splits": {
            name: {
                "rows": int(len(part)),
                "date_from": part["date"].min().date().isoformat(),
                "date_to": part["date"].max().date().isoformat(),
                "label_counts": {p: int(part["labels"].map(lambda ls, p=p: p in ls).sum()) for p in PATTERNS},
                "mean_labels_per_problem": round(float(part["labels"].str.len().mean()), 2),
            }
            for name, part in splits.items()
        },
    }
    reports = ROOT / "reports"
    reports.mkdir(exist_ok=True)
    (reports / f"data_{VERSION}.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({k: v["rows"] for k, v in manifest["splits"].items()}), "| dropped:", unlabeled)
    for name, s in manifest["splits"].items():
        print(f"  {name}: {s['date_from']} .. {s['date_to']}")


if __name__ == "__main__":
    main()
