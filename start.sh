#!/bin/sh
# Sobe a API em segundo plano e o site em primeiro plano (usado pelo Dockerfile).
set -e
cd /app/apps/api && python -m uvicorn api:app --host 127.0.0.1 --port 8000 &
cd /app/apps/web && exec node /app/node_modules/next/dist/bin/next start -H 0.0.0.0 -p "${PORT:-3000}"
