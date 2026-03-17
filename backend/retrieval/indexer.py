"""Build all retrieval indices (BM25 + embeddings) from the database."""
from __future__ import annotations

import logging

from backend.retrieval.bm25_index import get_bm25_index
from backend.retrieval.embeddings import build_embedding_index

logger = logging.getLogger(__name__)


def build_all_indices(skip_embeddings: bool = False) -> dict[str, int]:
    """Build BM25 and embedding indices.

    Args:
        skip_embeddings: If True, skip embedding generation (for faster startup).

    Returns:
        Dict with counts of indexed items.
    """
    results = {}

    # Build BM25 index (fast, in-memory)
    bm25 = get_bm25_index()
    bm25.build()
    results["bm25"] = bm25.size
    logger.info("BM25 index: %d documents", bm25.size)

    # Build embedding index (slower, calls OpenAI API)
    if not skip_embeddings:
        count = build_embedding_index()
        results["embeddings_generated"] = count
        logger.info("Embeddings: %d new embeddings generated", count)
    else:
        results["embeddings_generated"] = 0
        logger.info("Embedding generation skipped.")

    return results
