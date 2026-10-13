from pathlib import Path

import pytest

from src.patterns import PATTERNS, TAG_TO_PATTERN, map_patterns

REPO = Path(__file__).resolve().parents[2]


def test_pattern_ids_match_the_app_taxonomy():
    yaml_text = (REPO / "content" / "patterns.yaml").read_text(encoding="utf-8")
    app_ids = [line.split(":", 1)[1].strip() for line in yaml_text.splitlines() if line.startswith("- id:")]
    assert sorted(PATTERNS) == sorted(app_ids)


def test_every_mapped_tag_targets_a_known_pattern():
    assert set(TAG_TO_PATTERN.values()) <= set(PATTERNS)


@pytest.mark.parametrize(
    "tags, slug, expected",
    [
        (["Array", "Hash Table"], "two-sum", ["arrays-hashing"]),
        (["Array", "String"], "some-problem", []),
        (["Tree", "Depth-First Search", "Binary Tree"], "maximum-depth-of-binary-tree", ["trees"]),
        (["Array", "Depth-First Search", "Matrix"], "number-of-islands", ["graphs"]),
        (["Array", "Sorting"], "merge-intervals", ["intervals"]),
        (["Design", "Binary Search"], "my-calendar-ii", ["binary-search", "intervals"]),
        (["Math", "Sorting"], "best-meeting-point", []),
        (["Array", "Dynamic Programming", "Memoization"], "climbing-stairs", ["dynamic-programming"]),
        (["Stack", "Monotonic Stack", "Array"], "daily-temperatures", ["monotonic-stack"]),
    ],
)
def test_map_patterns(tags, slug, expected):
    assert map_patterns(tags, slug) == expected


def test_output_follows_pattern_order_without_duplicates():
    got = map_patterns(["Greedy", "Hash Table", "Counting", "Greedy"], "x")
    assert got == ["arrays-hashing", "greedy"]
