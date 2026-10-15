"""The TF-IDF half of Model #1 as plain JSON, plus a reference scorer.

`score_from_json` re-implements scikit-learn's TfidfVectorizer + one-vs-rest
logistic regression using only the exported JSON. It is the spec for the
browser's TypeScript port: tests check it against scikit-learn, and the
browser is checked against fixtures produced from it.
"""

from __future__ import annotations

import math
import re
import unicodedata
from collections import Counter

from src.patterns import PATTERNS

FORMAT = "spar-tfidf-ovr-logreg/1"


def export_tfidf(pipeline, digits: int = 5) -> dict:
    vec = pipeline.named_steps["tfidfvectorizer"]
    clf = pipeline.named_steps["onevsrestclassifier"]
    terms = sorted(vec.vocabulary_, key=vec.vocabulary_.get)  # position = feature index
    return {
        "format": FORMAT,
        "patterns": PATTERNS,
        "preprocess": {
            "lowercase": vec.lowercase,
            "strip_accents": vec.strip_accents,
            "token_pattern": vec.token_pattern,
            "ngram_range": list(vec.ngram_range),
            "sublinear_tf": vec.sublinear_tf,
            "norm": vec.norm,
        },
        "terms": terms,
        "idf": [round(float(v), digits) for v in vec.idf_],
        "coef": [[round(float(v), digits) for v in est.coef_[0]] for est in clf.estimators_],
        "intercept": [round(float(est.intercept_[0]), digits) for est in clf.estimators_],
    }


def _strip_accents_unicode(s: str) -> str:
    # Same as sklearn's strip_accents_unicode: NFKD, then drop combining marks.
    normalized = unicodedata.normalize("NFKD", s)
    return "".join(c for c in normalized if not unicodedata.combining(c))


def tokenize(text: str, pre: dict) -> list[str]:
    if pre["strip_accents"] == "unicode":
        text = _strip_accents_unicode(text)
    if pre["lowercase"]:
        text = text.lower()
    words = re.findall(pre["token_pattern"], text)
    lo, hi = pre["ngram_range"]
    grams = []
    for n in range(lo, hi + 1):
        grams.extend(" ".join(words[i : i + n]) for i in range(len(words) - n + 1))
    return grams


def score_from_json(model: dict, text: str) -> list[float]:
    """Per-pattern probabilities, computed from the exported JSON alone."""
    pre = model["preprocess"]
    index = {t: i for i, t in enumerate(model["terms"])}
    counts = Counter(index[g] for g in tokenize(text, pre) if g in index)
    weights = {}
    for i, tf in counts.items():
        tf = 1 + math.log(tf) if pre["sublinear_tf"] else tf
        weights[i] = tf * model["idf"][i]
    norm = math.sqrt(sum(v * v for v in weights.values())) if pre["norm"] == "l2" else 1.0
    if norm > 0:
        weights = {i: v / norm for i, v in weights.items()}
    probs = []
    for coef, b in zip(model["coef"], model["intercept"]):
        z = b + sum(coef[i] * v for i, v in weights.items())
        probs.append(1 / (1 + math.exp(-z)))
    return probs
