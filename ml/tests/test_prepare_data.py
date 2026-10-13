import pandas as pd

from src.prepare_data import clean_text, temporal_split


def frame(dates):
    return pd.DataFrame({"date": pd.to_datetime(dates), "question_id": range(len(dates)), "x": range(len(dates))})


def test_temporal_split_puts_the_newest_rows_last_and_covers_everything():
    df = frame([f"2020-01-{d:02d}" for d in range(20, 0, -1)])  # given newest first
    parts = temporal_split(df, {"train": 0.75, "val": 0.10, "test": 0.15})
    assert [len(p) for p in parts.values()] == [15, 2, 3]
    assert parts["train"]["date"].max() <= parts["val"]["date"].min()
    assert parts["val"]["date"].max() <= parts["test"]["date"].min()
    assert sorted(pd.concat(parts.values())["x"]) == list(range(20))


def test_temporal_split_is_deterministic_on_date_ties():
    df = frame(["2021-05-01"] * 10)
    a = temporal_split(df.sample(frac=1, random_state=1), {"train": 0.5, "test": 0.5})
    b = temporal_split(df.sample(frac=1, random_state=2), {"train": 0.5, "test": 0.5})
    assert list(a["test"]["question_id"]) == list(b["test"]["question_id"])


def test_clean_text_normalizes_spaces_and_blank_lines():
    assert clean_text("a\xa0 b\n\n\n\nc  ") == "a b\n\nc"
