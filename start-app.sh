#!/bin/sh
# Start PANNA on this computer: API server + web app.
# Run:  ./start-app.sh   then open http://localhost:3000
# Press Ctrl+C to stop everything.
cd "$(dirname "$0")"

export DATABASE_URL="pglite://$(pwd)/.pglite-data"

PORT=5000 pnpm --filter @workspace/api-server run dev &
API_PID=$!

PORT=3000 BASE_PATH=/ API_PROXY_TARGET=http://localhost:5000 \
  pnpm --filter @workspace/soccer-trainer run dev &
WEB_PID=$!

trap 'kill $API_PID $WEB_PID 2>/dev/null' INT TERM
wait
