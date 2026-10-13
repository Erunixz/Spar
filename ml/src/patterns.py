"""Map LeetCode topic tags onto Spar's 14 interview patterns (content/patterns.yaml).

The mapping is the labelling function for Model #1. It is deliberately
conservative: a pattern is assigned only when a tag (or, for intervals, a
problem name) clearly says so. "Array" and "String" are dropped because they
sit on most problems and carry no pattern signal.
"""

from __future__ import annotations

import re

# Must match the ids in content/patterns.yaml (checked by tests).
PATTERNS = [
    "arrays-hashing",
    "prefix-sum",
    "two-pointers",
    "sliding-window",
    "binary-search",
    "monotonic-stack",
    "intervals",
    "greedy",
    "linked-list",
    "trees",
    "heap",
    "graphs",
    "backtracking",
    "dynamic-programming",
]

TAG_TO_PATTERN: dict[str, str] = {
    "Hash Table": "arrays-hashing",
    "Counting": "arrays-hashing",
    "Prefix Sum": "prefix-sum",
    "Two Pointers": "two-pointers",
    "Sliding Window": "sliding-window",
    "Binary Search": "binary-search",
    "Stack": "monotonic-stack",
    "Monotonic Stack": "monotonic-stack",
    "Monotonic Queue": "monotonic-stack",
    "Line Sweep": "intervals",
    "Greedy": "greedy",
    "Linked List": "linked-list",
    "Tree": "trees",
    "Binary Tree": "trees",
    "Binary Search Tree": "trees",
    "Heap (Priority Queue)": "heap",
    "Graph": "graphs",
    "Topological Sort": "graphs",
    "Shortest Path": "graphs",
    "Union Find": "graphs",
    "Strongly Connected Component": "graphs",
    "Biconnected Component": "graphs",
    "Eulerian Circuit": "graphs",
    "Minimum Spanning Tree": "graphs",
    "Backtracking": "backtracking",
    "Dynamic Programming": "dynamic-programming",
    "Memoization": "dynamic-programming",
}

SEARCH_TAGS = {"Depth-First Search", "Breadth-First Search"}
TREE_TAGS = {"Tree", "Binary Tree", "Binary Search Tree"}

# LeetCode has no "Intervals" tag; use problem names, minus known false friends.
INTERVAL_SLUG = re.compile(r"(^|-)(intervals?|meeting-rooms(-ii)?|meeting-scheduler|my-calendar(-i{1,3})?)($|-)")
INTERVAL_SLUG_DENY = {"best-meeting-point", "longest-well-performing-interval", "partition-array-into-disjoint-intervals"}


def map_patterns(tags: list[str], slug: str) -> list[str]:
    """Spar pattern ids for one problem, in PATTERNS order (may be empty)."""
    found = {TAG_TO_PATTERN[t] for t in tags if t in TAG_TO_PATTERN}
    # DFS/BFS on a tree is tree recursion; anywhere else (graphs, grids) it's graph search.
    if SEARCH_TAGS & set(tags):
        found.add("trees" if TREE_TAGS & set(tags) else "graphs")
    if slug not in INTERVAL_SLUG_DENY and INTERVAL_SLUG.search(slug):
        found.add("intervals")
    return [p for p in PATTERNS if p in found]
