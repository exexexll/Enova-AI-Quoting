"""Generate and store OpenAI embeddings for ingredients."""
from __future__ import annotations

import logging
import struct
from typing import Optional

import numpy as np
from openai import OpenAI

from backend.config import OPENAI_API_KEY, EMBEDDING_MODEL, EMBEDDING_DIM
from backend.models.database import get_db

logger = logging.getLogger(__name__)

_client: Optional[OpenAI] = None


def _get_client() -> OpenAI:
    global _client
    if _client is None:
        _client = OpenAI(api_key=OPENAI_API_KEY)
    return _client


def embed_text(text: str) -> np.ndarray:
    """Generate an embedding for a single text string."""
    client = _get_client()
    resp = client.embeddings.create(input=[text], model=EMBEDDING_MODEL)
    return np.array(resp.data[0].embedding, dtype=np.float32)


def embed_texts_batch(texts: list[str], batch_size: int = 100) -> list[np.ndarray]:
    """Generate embeddings for a batch of texts."""
    client = _get_client()
    all_embeddings: list[np.ndarray] = []

    for i in range(0, len(texts), batch_size):
        batch = texts[i : i + batch_size]
        resp = client.embeddings.create(input=batch, model=EMBEDDING_MODEL)
        for item in resp.data:
            all_embeddings.append(np.array(item.embedding, dtype=np.float32))
        logger.info("Embedded batch %d-%d of %d", i, i + len(batch), len(texts))

    return all_embeddings


def embedding_to_blob(embedding: np.ndarray) -> bytes:
    """Serialize a numpy embedding to bytes for SQLite storage."""
    return embedding.astype(np.float32).tobytes()


def blob_to_embedding(blob: bytes) -> np.ndarray:
    """Deserialize bytes from SQLite to a numpy embedding."""
    return np.frombuffer(blob, dtype=np.float32)


def cosine_similarity(a: np.ndarray, b: np.ndarray) -> float:
    """Compute cosine similarity between two vectors."""
    dot = np.dot(a, b)
    norm_a = np.linalg.norm(a)
    norm_b = np.linalg.norm(b)
    if norm_a == 0 or norm_b == 0:
        return 0.0
    return float(dot / (norm_a * norm_b))


def build_embedding_index() -> int:
    """Generate embeddings for all ingredients that don't have them yet.

    Returns number of embeddings generated.
    """
    with get_db() as conn:
        rows = conn.execute(
            "SELECT id, item_name, item_id, source_tab, chinese_name "
            "FROM ingredients WHERE embedding IS NULL"
        ).fetchall()

    if not rows:
        logger.info("All ingredients already have embeddings.")
        return 0

    logger.info("Generating embeddings for %d ingredients...", len(rows))

    # Build description strings for embedding
    texts = []
    ids = []
    for row in rows:
        parts = [row["item_name"]]
        if row["item_id"]:
            parts.append(row["item_id"])
        if row["chinese_name"]:
            parts.append(row["chinese_name"])
        parts.append(f"source:{row['source_tab']}")
        texts.append(" | ".join(parts))
        ids.append(row["id"])

    embeddings = embed_texts_batch(texts)

    with get_db() as conn:
        for item_id, emb in zip(ids, embeddings):
            conn.execute(
                "UPDATE ingredients SET embedding=? WHERE id=?",
                (embedding_to_blob(emb), item_id),
            )

    logger.info("Generated %d embeddings.", len(embeddings))
    return len(embeddings)


def search_by_embedding(
    query_embedding: np.ndarray,
    top_n: int = 50,
) -> list[tuple[int, float]]:
    """Search ingredients by embedding similarity.

    Returns list of (ingredient_id, similarity_score) sorted descending.
    """
    with get_db() as conn:
        rows = conn.execute(
            "SELECT id, embedding FROM ingredients WHERE embedding IS NOT NULL"
        ).fetchall()

    results: list[tuple[int, float]] = []
    for row in rows:
        emb = blob_to_embedding(row["embedding"])
        sim = cosine_similarity(query_embedding, emb)
        results.append((row["id"], sim))

    results.sort(key=lambda x: x[1], reverse=True)
    return results[:top_n]
