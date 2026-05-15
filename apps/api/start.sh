#!/bin/sh
set -e

echo "Running database migrations..."
alembic upgrade head
echo "Migrations complete. Starting API server..."

exec python -m uvicorn main:app --host 0.0.0.0 --port "${PORT:-8000}"
