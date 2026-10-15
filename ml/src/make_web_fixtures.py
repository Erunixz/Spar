"""Fixtures for the web app's Model #1 tests (committed under apps/web).

- tfidf-toy.json: a tiny TF-IDF model fitted on self-written texts, with
  scikit-learn's probabilities for probe texts (accents, case, punctuation,
  unknown words), so CI can test the TypeScript port without the real model.
- parity.json: a copy of the real export's parity fixture (Spar's own drill
  prompts and expected outputs), used when the real model is present locally.

Usage (from ml/): .venv/Scripts/python -m src.make_web_fixtures
"""

from __future__ import annotations

import json
import shutil

from src.tfidf_export import export_tfidf
from src.train_baseline import build
from src.train_classifier import ROOT
from tests.test_tfidf_export import LABELS, TEXTS
from src.metrics import label_matrix

OUT = ROOT.parent / "apps" / "web" / "src" / "features" / "patterns" / "__fixtures__"
PROBES = [
    "Use a hash map to count frequencies and find duplicates quickly.",
    "Two pointers start at both ends of the sorted array and move inward.",
    "Café résumé: naïve ACCENTS, a Hash-Map and two_pointers!",
    "BFS over the grid graph; DFS on the tree's subtrees.",
    "x",
    "",
]


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    model = build(4).fit(TEXTS, label_matrix(LABELS))
    toy = export_tfidf(model, digits=9)
    toy["expected"] = [{"text": t, "probs": [round(float(p), 9) for p in row]} for t, row in zip(PROBES, model.predict_proba(PROBES))]
    (OUT / "tfidf-toy.json").write_text(json.dumps(toy, indent=1) + "\n", encoding="utf-8")
    parity = ROOT / "artifacts" / "pattern-classifier-v1" / "parity_fixture.json"
    if parity.exists():
        shutil.copy(parity, OUT / "parity.json")
    print("wrote", sorted(p.name for p in OUT.iterdir()))


if __name__ == "__main__":
    main()
