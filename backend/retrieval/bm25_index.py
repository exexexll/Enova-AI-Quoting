"""Hybrid keyword search: BM25 + SQLite LIKE prefix matching for fast, accurate results."""
from __future__ import annotations

import logging
import re
from typing import Optional

from rank_bm25 import BM25Okapi

from backend.models.database import get_db

logger = logging.getLogger(__name__)


def _tokenize(text: str) -> list[str]:
    """Tokenizer: lowercase, split on non-alphanum, keep tokens >= 2 chars for BM25."""
    text = text.lower()
    tokens = re.split(r"[^a-z0-9\u4e00-\u9fff]+", text)
    return [t for t in tokens if len(t) >= 2]


class BM25Index:
    """In-memory BM25 index + SQLite prefix fallback for ingredient search."""

    def __init__(self):
        self._corpus_tokens: list[list[str]] = []
        self._item_ids: list[int] = []
        self._bm25: Optional[BM25Okapi] = None

    def build(self):
        """Load all ingredients from DB and build BM25 index."""
        with get_db() as conn:
            rows = conn.execute(
                "SELECT id, item_name, item_id, chinese_name, supplier FROM ingredients"
            ).fetchall()

        self._corpus_tokens = []
        self._item_ids = []

        for row in rows:
            parts = [row["item_name"] or ""]
            if row["item_id"]:
                parts.append(row["item_id"])
            if row["chinese_name"]:
                parts.append(row["chinese_name"])
            if row["supplier"]:
                parts.append(row["supplier"])

            tokens = _tokenize(" ".join(parts))
            self._corpus_tokens.append(tokens)
            self._item_ids.append(row["id"])

        if self._corpus_tokens:
            self._bm25 = BM25Okapi(self._corpus_tokens)
            logger.info("BM25 index built with %d documents.", len(self._corpus_tokens))
        else:
            logger.warning("No documents to index for BM25.")

    def search(self, query: str, top_n: int = 50) -> list[tuple[int, float]]:
        """Combined search: BM25 for full-word matches + SQL LIKE for prefix/partial matches.

        Returns list of (ingredient_id, score) sorted descending.
        """
        results_map: dict[int, float] = {}

        # === Strategy 1: BM25 keyword search (good for full words) ===
        if self._bm25 is not None:
            tokens = _tokenize(query)
            if tokens:
                scores = self._bm25.get_scores(tokens)
                for i in range(len(scores)):
                    if scores[i] > 0:
                        results_map[self._item_ids[i]] = float(scores[i])

        # === Strategy 2: SQL LIKE prefix search with relevance scoring ===
        q = query.strip().lower()
        if q:
            with get_db() as conn:
                # Three tiers of matching:
                # Tier 1 (score 10): Name STARTS with the query ("vita" → "Vitamin C")
                # Tier 2 (score 5):  A word in the name starts with query ("vita" → "B Vitamin Complex")
                # Tier 3 (score 2):  Query appears anywhere ("vita" → "Nutravative label")
                tiers = [
                    (f"{q}%", 10.0),       # starts with
                    (f"% {q}%", 5.0),      # word boundary
                    (f"%{q}%", 2.0),       # contains
                ]
                for pattern, score in tiers:
                    rows = conn.execute(
                        "SELECT id FROM ingredients WHERE LOWER(item_name) LIKE ? LIMIT 30",
                        (pattern,),
                    ).fetchall()
                    for row in rows:
                        item_id = row["id"]
                        if item_id not in results_map:
                            results_map[item_id] = score
                        elif results_map[item_id] < score + 2:
                            # Boost items matching multiple tiers or both BM25 + LIKE
                            results_map[item_id] += score

        # Sort by score descending
        sorted_results = sorted(results_map.items(), key=lambda x: x[1], reverse=True)
        return sorted_results[:top_n]

    @property
    def size(self) -> int:
        return len(self._item_ids)


# Singleton instance
_index = BM25Index()


def get_bm25_index() -> BM25Index:
    return _index
