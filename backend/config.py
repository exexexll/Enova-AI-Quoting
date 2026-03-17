"""Application configuration and API keys."""
import os
from pathlib import Path

# Paths
BASE_DIR = Path(__file__).resolve().parent.parent
# Data dir can be overridden for deployment (e.g. mounted volume)
_DATA_DIR = os.getenv("DATA_DIR")
DATA_DIR = Path(_DATA_DIR) if _DATA_DIR else BASE_DIR / "data"
EXPORTS_DIR = DATA_DIR / "exports"
CLIENT_RECORDS_DIR = DATA_DIR / "client_records"
ADMIN_IMPORTS_DIR = DATA_DIR / "admin_imports"
ESCALATION_DIR = DATA_DIR / "escalation_queue"
INGREDIENT_IMAGES_DIR = DATA_DIR / "ingredient_images"
CLIENT_UPLOADS_DIR = DATA_DIR / "client_uploads"
CONTRACTS_DIR = DATA_DIR / "contracts"
DB_PATH = DATA_DIR / "enova.db"

# Ensure dirs exist
for d in [EXPORTS_DIR, CLIENT_RECORDS_DIR, ADMIN_IMPORTS_DIR, ESCALATION_DIR,
          INGREDIENT_IMAGES_DIR, CLIENT_UPLOADS_DIR, CONTRACTS_DIR]:
    d.mkdir(parents=True, exist_ok=True)

# OpenAI (no default in production; set OPENAI_API_KEY in env)
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "")
OPENAI_MODEL = os.getenv("OPENAI_MODEL", "gpt-5.2")
EMBEDDING_MODEL = os.getenv("EMBEDDING_MODEL", "text-embedding-3-small")
EMBEDDING_DIM = 1536

# Source data (paths configurable via env for deployment)
INGREDIENT_MASTER_PATH = Path(os.getenv(
    "INGREDIENT_MASTER_PATH",
    str(BASE_DIR / "ingredient-master.xlsx")
    if (BASE_DIR / "ingredient-master.xlsx").exists()
    else str(BASE_DIR / "Ingredient Master(条包模板） 2.xlsx"),
))
MFSO_TEMPLATE_PATH = Path(os.getenv("MFSO_TEMPLATE_PATH", str(BASE_DIR / "MFSO P25267-V2 Red Ginseng Powder Capsules 180ct 12-18-25 Copy.pdf")))

# PostgreSQL (production); leave unset for SQLite (local dev)
DATABASE_URL = os.getenv("DATABASE_URL", "")

# SerpAPI (no default in production; set SERPAPI_KEY in env)
SERPAPI_KEY = os.getenv("SERPAPI_KEY", "")

# CORS: comma-separated allowed origins; default "*" for dev, set explicit domains in production
CORS_ORIGINS = os.getenv("CORS_ORIGINS", "*")

# Enova address (origin for shipping)
ENOVA_ADDRESS = "4740 S Cleveland Ave, Fort Myers, FL 33907"

# Pricing defaults
DEFAULT_MARGIN_PCT = 0.30
DEFAULT_WASTE_FACTOR_LOW = 0.03
DEFAULT_WASTE_FACTOR_MID = 0.07
DEFAULT_WASTE_FACTOR_HIGH = 0.12
