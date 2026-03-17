#!/bin/bash
# Start all Enova AI Quoting System services
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

echo "=== Enova AI Quoting System ==="
echo ""

# Activate Python venv
source .venv/bin/activate

# Start backend
echo "[1/3] Starting backend (FastAPI) on port 8000..."
python -m uvicorn backend.main:app --host 0.0.0.0 --port 8000 --reload &
BACKEND_PID=$!
sleep 2

# Start client frontend
echo "[2/3] Starting client frontend on port 3000..."
cd frontend && npm run dev -- --host 0.0.0.0 &
FRONTEND_PID=$!
cd ..

# Start admin panel
echo "[3/3] Starting admin panel on port 3001..."
cd admin && npm run dev -- --host 0.0.0.0 --port 3001 &
ADMIN_PID=$!
cd ..

echo ""
echo "=== All services started ==="
echo "  Backend API:      http://localhost:8000"
echo "  Client Frontend:  http://localhost:3000"
echo "  Admin Panel:      http://localhost:3001"
echo "  API Docs:         http://localhost:8000/docs"
echo ""
echo "Press Ctrl+C to stop all services."

# Wait and cleanup
trap "echo 'Stopping...'; kill $BACKEND_PID $FRONTEND_PID $ADMIN_PID 2>/dev/null; exit" INT TERM
wait
