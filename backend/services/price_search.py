"""Web search-based ingredient price estimation using SerpAPI + GPT extraction."""
from __future__ import annotations

import json
import logging
import re
from typing import Optional

from backend.config import SERPAPI_KEY, OPENAI_API_KEY, OPENAI_MODEL

logger = logging.getLogger(__name__)

_cache: dict[str, dict] = {}


def search_ingredient_price(ingredient_name: str) -> dict:
    """Search the web for ingredient bulk/wholesale pricing.

    Returns dict with est_low, est_high (per kg), source, and raw_text.
    Uses SerpAPI for search and GPT to extract structured pricing from results.
    """
    cache_key = ingredient_name.lower().strip()
    if cache_key in _cache:
        return _cache[cache_key]

    result = {"est_low": None, "est_high": None, "source": "web", "raw_text": ""}

    if not SERPAPI_KEY or not OPENAI_API_KEY:
        return result

    try:
        search_text = _serpapi_search(ingredient_name)
        if not search_text:
            _cache[cache_key] = result
            return result

        pricing = _gpt_extract_price(ingredient_name, search_text)
        if pricing:
            result.update(pricing)

    except Exception as e:
        logger.warning("Web price search failed for '%s': %s", ingredient_name, e)

    _cache[cache_key] = result
    return result


def _serpapi_search(ingredient_name: str) -> str:
    """Search Google for bulk supplement ingredient pricing."""
    try:
        from serpapi import GoogleSearch
    except ImportError:
        logger.warning("serpapi not installed")
        return ""

    clean_name = re.sub(r'["\']', '', ingredient_name)

    params = {
        "engine": "google",
        "q": f"{clean_name} bulk powder wholesale price per kg supplement ingredient",
        "api_key": SERPAPI_KEY,
        "num": 5,
    }
    search = GoogleSearch(params)
    results = search.get_dict()

    snippets: list[str] = []
    for r in results.get("organic_results", [])[:5]:
        title = r.get("title", "")
        snippet = r.get("snippet", "")
        if title or snippet:
            snippets.append(f"{title}: {snippet}")

    for r in results.get("shopping_results", [])[:5]:
        title = r.get("title", "")
        price = r.get("price", "")
        source = r.get("source", "")
        if title:
            snippets.append(f"{title} - {price} ({source})")

    return "\n".join(snippets)[:3000]


def _gpt_extract_price(ingredient_name: str, search_text: str) -> Optional[dict]:
    """Use GPT to extract a price range from search results."""
    from openai import OpenAI

    client = OpenAI(api_key=OPENAI_API_KEY)
    response = client.chat.completions.create(
        model="gpt-4o-mini",
        messages=[
            {
                "role": "system",
                "content": (
                    "You extract bulk/wholesale ingredient pricing from search results. "
                    "Return a JSON object with: "
                    "est_low_per_kg (number, lowest reasonable price in USD per kg), "
                    "est_high_per_kg (number, highest reasonable price in USD per kg), "
                    "confidence (high/medium/low), "
                    "notes (brief explanation of sources). "
                    "If you can't determine pricing, return null values. "
                    "Focus on BULK/wholesale prices, not retail consumer prices. "
                    "Common ranges: vitamins $10-100/kg, amino acids $20-200/kg, "
                    "herbal extracts $30-500/kg, specialty ingredients $100-2000/kg."
                ),
            },
            {
                "role": "user",
                "content": f"Ingredient: {ingredient_name}\n\nSearch results:\n{search_text}\n\nExtract the bulk/wholesale price range per kg in USD.",
            },
        ],
        max_completion_tokens=300,
        response_format={"type": "json_object"},
    )

    text = response.choices[0].message.content or "{}"
    try:
        data = json.loads(text)
        low = data.get("est_low_per_kg")
        high = data.get("est_high_per_kg")
        if low is not None and high is not None and low > 0 and high > 0:
            return {
                "est_low": round(low / 1000, 6),
                "est_high": round(high / 1000, 6),
                "source": "web",
                "confidence": data.get("confidence", "low"),
                "notes": data.get("notes", ""),
                "raw_text": search_text[:200],
            }
    except (json.JSONDecodeError, TypeError, ValueError):
        pass

    return None
