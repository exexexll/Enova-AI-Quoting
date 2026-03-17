"""Hybrid search: Embeddings + BM25 + Reciprocal Rank Fusion."""
from __future__ import annotations

import logging
from typing import Optional

from backend.models.database import get_db
from backend.models.schemas import IngredientOut, IngredientSearchResult
from backend.retrieval.bm25_index import get_bm25_index
from backend.retrieval.embeddings import embed_text, search_by_embedding
from backend.retrieval.rrf import reciprocal_rank_fusion

logger = logging.getLogger(__name__)


def _row_to_ingredient(row) -> IngredientOut:
    return IngredientOut(
        id=row["id"],
        item_name=row["item_name"],
        item_id=row["item_id"],
        supplier=row["supplier"] or None,
        uom=row["uom"],
        sum_cavg=row["sum_cavg"] or 0,
        cost_kg=row["cost_kg"] or 0,
        on_hand=row["on_hand"] or 0,
        source_tab=row["source_tab"],
        category=row["category"],
        chinese_name=row["chinese_name"],
        potency=row["potency"],
        form=row["form"],
        price_per_kg=row["price_per_kg"],
        needs_manual_price=bool(row["needs_manual_price"]),
    )


def hybrid_search(
    query: str,
    top_k: int = 10,
    source_filter: Optional[str] = None,
    use_embeddings: bool = True,
) -> list[IngredientSearchResult]:
    """Perform hybrid search combining BM25 + embeddings via RRF.

    Args:
        query: Natural language search query
        top_k: Number of results to return
        source_filter: Optional filter by source_tab (e.g., 'enova_data')
        use_embeddings: Whether to use embedding search (set False if embeddings not built)

    Returns:
        List of IngredientSearchResult with ingredient details and fusion score.
    """
    # Stage 1: BM25 keyword search
    bm25_index = get_bm25_index()
    bm25_results = bm25_index.search(query, top_n=50)

    # Stage 2: Embedding semantic search
    if use_embeddings:
        try:
            query_emb = embed_text(query)
            embed_results = search_by_embedding(query_emb, top_n=50)
        except Exception as e:
            logger.warning("Embedding search failed, falling back to BM25 only: %s", e)
            embed_results = []
    else:
        embed_results = []

    # Stage 3: RRF fusion
    if embed_results:
        fused = reciprocal_rank_fusion(bm25_results, embed_results, k=60)
    else:
        # BM25 only
        fused = bm25_results

    if not fused:
        return []

    # Stage 4: Fetch full ingredient data and apply filters
    item_ids = [item_id for item_id, _ in fused[:top_k * 3]]  # Fetch extra for filtering
    if not item_ids:
        return []

    placeholders = ",".join("?" * len(item_ids))
    query_sql = f"SELECT * FROM ingredients WHERE id IN ({placeholders})"
    params: list = list(item_ids)

    if source_filter:
        query_sql += " AND source_tab = ?"
        params.append(source_filter)

    with get_db() as conn:
        rows = conn.execute(query_sql, params).fetchall()

    # Build lookup
    row_map = {row["id"]: row for row in rows}

    # Build results preserving RRF order
    results: list[IngredientSearchResult] = []
    for item_id, score in fused:
        if item_id in row_map and len(results) < top_k:
            results.append(IngredientSearchResult(
                ingredient=_row_to_ingredient(row_map[item_id]),
                score=score,
            ))

    return results


def search_similar_priced(
    item_name: str,
    min_matches: int = 2,
    max_spread: float = 10.0,
) -> tuple[list[IngredientOut], Optional[float], Optional[float]]:
    """Find similar ingredients that have pricing, for MEDIUM confidence estimation.

    Uses BM25 only (fast, no API call) to avoid blocking during pricing calculations.

    Returns:
        (similar_items, est_low, est_high) or ([], None, None) if insufficient matches.
    """
    # BM25-only search to avoid slow embedding API calls during pricing
    results = hybrid_search(item_name, top_k=20, use_embeddings=False)

    # Filter to items that have actual pricing (and exclude the queried item itself)
    item_name_lower = item_name.lower().strip()
    priced_similar: list[IngredientOut] = []
    for r in results:
        ing = r.ingredient
        # Skip exact match (we're looking for SIMILAR items, not the same item)
        if ing.item_name.lower().strip() == item_name_lower:
            continue
        # Must have a real price
        cost = ing.sum_cavg if ing.uom == "gm" and ing.sum_cavg > 0 else (
            (ing.cost_kg / 1000) if ing.cost_kg and ing.cost_kg > 0 else (
                (ing.price_per_kg / 1000) if ing.price_per_kg and ing.price_per_kg > 0 else 0
            )
        )
        if cost > 0:
            priced_similar.append(ing)

    if len(priced_similar) < min_matches:
        return [], None, None

    # Extract costs per gram
    costs: list[float] = []
    for ing in priced_similar:
        if ing.uom == "gm" and ing.sum_cavg > 0:
            costs.append(ing.sum_cavg)
        elif ing.cost_kg and ing.cost_kg > 0:
            costs.append(ing.cost_kg / 1000)
        elif ing.price_per_kg and ing.price_per_kg > 0:
            costs.append(ing.price_per_kg / 1000)

    if len(costs) < min_matches:
        return [], None, None

    # Check spread
    if max(costs) / min(costs) > max_spread:
        return [], None, None

    est_low = min(costs) * 0.9   # 10% below floor
    est_high = max(costs) * 1.2  # 20% above ceiling

    return priced_similar[:5], est_low, est_high
