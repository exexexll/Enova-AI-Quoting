"""Reciprocal Rank Fusion (RRF) for combining ranked result lists."""
from __future__ import annotations


def reciprocal_rank_fusion(
    *ranked_lists: list[tuple[int, float]],
    k: int = 60,
) -> list[tuple[int, float]]:
    """Merge multiple ranked lists using RRF.

    Each list is a list of (item_id, score) tuples sorted by score descending.
    k=60 is the standard RRF constant (higher k = more weight to lower ranks).

    Returns a single merged list of (item_id, rrf_score) sorted descending.
    """
    scores: dict[int, float] = {}

    for ranked_list in ranked_lists:
        for rank, (item_id, _original_score) in enumerate(ranked_list):
            if item_id not in scores:
                scores[item_id] = 0.0
            scores[item_id] += 1.0 / (k + rank + 1)

    result = sorted(scores.items(), key=lambda x: x[1], reverse=True)
    return result
