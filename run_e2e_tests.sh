#!/bin/bash

# Run E2E tests with backend and frontend servers

echo "Starting Mony E2E Test Suite..."
echo ""

# Kill any existing processes
pkill -f "run_test_server.py" 2>/dev/null || true
pkill -f "npm run dev" 2>/dev/null || true

sleep 2

# Start backend server in background
echo "Starting backend server (SQLite mode)..."
cd apps/api
python run_test_server.py > /tmp/backend.log 2>&1 &
BACKEND_PID=$!
echo "Backend PID: $BACKEND_PID"

sleep 3

# Check if backend is responding
echo "Checking backend health..."
if curl -s http://localhost:8000/health > /dev/null 2>&1; then
  echo "Backend is healthy!"
else
  echo "Warning: Backend health check failed"
  cat /tmp/backend.log
fi

# Start frontend in background
cd ../web
echo "Starting frontend dev server..."
npm run dev > /tmp/frontend.log 2>&1 &
FRONTEND_PID=$!
echo "Frontend PID: $FRONTEND_PID"

sleep 5

# Check if frontend is responding
echo "Checking frontend..."
if curl -s http://localhost:3000 > /dev/null 2>&1; then
  echo "Frontend is responding!"
else
  echo "Warning: Frontend not responding yet, E2E tests will wait..."
fi

echo ""
echo "Running Playwright E2E tests..."
echo ""

# Run E2E tests
npm run test:e2e

# Cleanup
echo ""
echo "Cleaning up..."
kill $BACKEND_PID 2>/dev/null || true
kill $FRONTEND_PID 2>/dev/null || true

echo "Done!"
