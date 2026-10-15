import numpy as np
import pandas as pd

from src.difficulty import LabelMean, TagMean, TagRidge, metrics


def frame():
    rng = np.random.default_rng(0)
    rows = []
    for label, base in (("easy", 1250), ("medium", 1650), ("hard", 2250)):
        for i in range(30):
            hard_tag = i % 2 == 0
            tags = ["Dynamic Programming"] if hard_tag else ["Array"]
            text = "dp table over states" if hard_tag else "simple array scan"
            rows.append({"difficulty": label, "tags": tags, "text": text, "rating": base + (150 if hard_tag else -150) + rng.normal(0, 20)})
    return pd.DataFrame(rows)


def test_label_mean_has_no_within_label_signal():
    df = frame()
    m = metrics(df, LabelMean().fit(df).predict(df))
    assert m["spearman"] > 0.8  # the label alone orders easy < medium < hard
    assert m["spearman_within_label_mean"] == 0.0  # but can't rank inside a label


def test_tags_and_text_rank_within_a_label():
    df = frame()
    for model in (TagMean(), TagRidge(1.0), TagRidge(1.0, text_weight=1.0)):
        m = metrics(df, model.fit(df).predict(df))
        assert m["spearman_within_label_mean"] > 0.7, type(model).__name__


def test_metrics_report_mae_and_per_label_spearman():
    df = frame()
    m = metrics(df, df["rating"].to_numpy())
    assert m["mae"] == 0.0
    assert set(m["spearman_within_label"]) == {"easy", "medium", "hard"}
