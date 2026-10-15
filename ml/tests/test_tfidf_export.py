import json

import numpy as np

from src.metrics import label_matrix
from src.tfidf_export import export_tfidf, score_from_json, tokenize
from src.train_baseline import build

# Toy, self-written texts: enough to fit every pattern's classifier.
TEXTS = [
    "Use a hash map to count frequencies and find duplicates quickly.",
    "Keep running totals so any range sum is a subtraction; prefix sums.",
    "Two pointers start at both ends of the sorted array and move inward.",
    "Grow and shrink a sliding window over the contiguous substring.",
    "Binary search on the answer: the smallest capacity that works.",
    "A monotonic stack finds the next greater element for each day.",
    "Sort the intervals by start, then merge overlapping meetings.",
    "Greedy: always take the locally best choice, like the earliest finish.",
    "Reverse the linked list in place by rewiring next pointers.",
    "Recurse on the binary tree's left and right subtrees for the depth.",
    "A min-heap keeps the k largest values from the stream.",
    "BFS over the grid graph counts connected islands of land.",
    "Backtracking lists every subset by choosing and undoing.",
    "Dynamic programming reuses overlapping subproblems with a memo table.",
] * 2
LABELS = [[p] for p in [
    "arrays-hashing", "prefix-sum", "two-pointers", "sliding-window", "binary-search", "monotonic-stack",
    "intervals", "greedy", "linked-list", "trees", "heap", "graphs", "backtracking", "dynamic-programming",
]] * 2


def fitted():
    # min_df=2 holds because every text appears twice.
    return build(4).fit(TEXTS, label_matrix(LABELS))


def test_reference_scorer_matches_sklearn():
    model = fitted()
    exported = json.loads(json.dumps(export_tfidf(model, digits=9)))
    probes = TEXTS[:14] + ["Café résumé: naïve accents, a HASH MAP and two pointers!", "nothing known here"]
    expected = model.predict_proba(probes)
    got = np.array([score_from_json(exported, t) for t in probes])
    assert np.abs(got - expected).max() < 1e-6


def test_rounded_export_stays_close():
    model = fitted()
    exported = export_tfidf(model)  # the shipped 5-digit rounding
    got = np.array([score_from_json(exported, t) for t in TEXTS[:14]])
    assert np.abs(got - model.predict_proba(TEXTS[:14])).max() < 1e-3


def test_tokenize_strips_accents_lowercases_and_builds_bigrams():
    pre = {"strip_accents": "unicode", "lowercase": True, "token_pattern": r"(?u)\b\w\w+\b", "ngram_range": [1, 2]}
    assert tokenize("Café A Résumé", pre) == ["cafe", "resume", "cafe resume"]
