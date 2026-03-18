"""Pydantic schemas for API request/response models."""
from __future__ import annotations

from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field


# ==================== Ingredients ====================

class IngredientOut(BaseModel):
    id: int
    item_name: str
    item_id: Optional[str] = None
    supplier: Optional[str] = None
    uom: Optional[str] = None
    sum_cavg: float = 0
    cost_kg: float = 0
    on_hand: float = 0
    source_tab: str = ""
    category: Optional[str] = None
    chinese_name: Optional[str] = None
    potency: Optional[str] = None
    form: Optional[str] = None
    price_per_kg: Optional[float] = None
    needs_manual_price: bool = False


class IngredientSearchResult(BaseModel):
    ingredient: IngredientOut
    score: float = 0.0


class IngredientSelection(BaseModel):
    ingredient_name: str
    ingredient_id: Optional[int] = None
    mg_per_serving: float
    label_claim: Optional[str] = None


# ==================== Sessions ====================

class SessionCreate(BaseModel):
    client_name: Optional[str] = None
    client_email: Optional[str] = None
    client_company: Optional[str] = None
    pre_selected_ingredient: Optional[str] = None


class SessionOut(BaseModel):
    id: str
    client_name: Optional[str] = None
    client_email: Optional[str] = None
    client_company: Optional[str] = None
    client_phone: Optional[str] = None
    client_address: Optional[str] = None
    status: str = "active"
    workflow_state: str = "intake"
    contract_status: Optional[str] = None
    product_specs: Optional[dict] = None
    created_at: str
    updated_at: str


class ChatMessageOut(BaseModel):
    id: int
    session_id: str
    timestamp: str
    role: str
    phase: Optional[str] = None
    content: Optional[str] = None
    metadata_json: Optional[str] = None


# ==================== Chat ====================

class ChatRequest(BaseModel):
    message: str
    session_id: str


# ==================== Pricing ====================

class PriceRange(BaseModel):
    low: float
    mid: float
    high: float


class PricingBreakdown(BaseModel):
    ingredient: PriceRange
    machine: PriceRange
    labor: PriceRange
    packaging: PriceRange
    transport: PriceRange
    margin_pct: float
    total: PriceRange
    warnings: list[str] = []
    blockers: list[str] = []


class ProductSpecs(BaseModel):
    product_name: Optional[str] = None
    product_type: Optional[str] = None  # capsule, tablet, powder, gummy, liquid
    serving_size: Optional[int] = None  # number of capsules per serving
    servings_per_unit: Optional[int] = None
    total_count: Optional[int] = None  # total capsules/tablets per unit
    capsule_type: Optional[str] = None  # "00" NATURAL VEGGIE, etc.
    order_quantity: int = 10000  # MOQ


# ==================== Escalation ====================

class EscalationOut(BaseModel):
    id: int
    session_id: str
    client_name: Optional[str] = None
    item_requested: str
    source: str
    quantity_needed: Optional[str] = None
    similar_items: Optional[str] = None
    est_low: Optional[float] = None
    est_high: Optional[float] = None
    status: str
    confirmed_price: Optional[float] = None
    admin_notes: Optional[str] = None
    created_at: str


class EscalationCreate(BaseModel):
    session_id: str = ""
    item_requested: str
    source: str = "missing"
    quantity_needed: Optional[str] = None
    similar_items: Optional[str] = None

class EscalationResolve(BaseModel):
    confirmed_price: float
    admin_notes: Optional[str] = None


# ==================== Contracts ====================

class ContractOut(BaseModel):
    id: int
    session_id: str
    version: int
    status: str
    pdf_path: Optional[str] = None
    client_name_sig: Optional[str] = None
    client_comments: Optional[str] = None
    admin_notes: Optional[str] = None
    submitted_at: Optional[str] = None
    accepted_at: Optional[str] = None
    created_at: str


class ContractSubmit(BaseModel):
    client_name_sig: str
    client_comments: Optional[str] = None


# ==================== Admin DB Import ====================

class ImportResult(BaseModel):
    rows_imported: int
    errors: list[str] = []


# ==================== Config ====================

class ConfigItem(BaseModel):
    key: str
    value: str
    description: Optional[str] = None


# ==================== File Upload ====================

class FileUploadOut(BaseModel):
    id: int
    session_id: str
    filename: str
    content_type: Optional[str] = None
    extraction_json: Optional[str] = None
    created_at: str
