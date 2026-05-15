#!/bin/sh
set -e

echo "==> Running migrations..."
python migrate.py
echo "==> Starting server..."
exec python -m uvicorn main:app --host 0.0.0.0 --port "${PORT:-8000}"
