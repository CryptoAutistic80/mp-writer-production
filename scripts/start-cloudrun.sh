#!/bin/sh
# Don't use set -e - we need to handle errors gracefully

# ============================================================================
# Cloud Run Startup Script
# Starts both backend API and Next.js frontend in a single container
# ============================================================================

echo "🚀 Starting MP Writer services for Cloud Run..."

# Environment variables
BACKEND_PORT="${BACKEND_PORT:-4000}"
FRONTEND_PORT="${PORT:-8080}"
BACKEND_DIR="/app/backend"
FRONTEND_DIR="/app/frontend"

# Track PIDs for graceful shutdown
BACKEND_PID=""
FRONTEND_PID=""

# Cleanup function for graceful shutdown
cleanup() {
    echo "🛑 Received shutdown signal, stopping services..."
    
    # Stop frontend first (it depends on backend)
    if [ -n "$FRONTEND_PID" ]; then
        echo "Stopping frontend (PID: $FRONTEND_PID)..."
        kill -TERM "$FRONTEND_PID" 2>/dev/null || true
        wait "$FRONTEND_PID" 2>/dev/null || true
    fi
    
    # Stop backend
    if [ -n "$BACKEND_PID" ]; then
        echo "Stopping backend (PID: $BACKEND_PID)..."
        kill -TERM "$BACKEND_PID" 2>/dev/null || true
        wait "$BACKEND_PID" 2>/dev/null || true
    fi
    
    echo "✅ Graceful shutdown completed"
    exit 0
}

# Trap signals for graceful shutdown
trap cleanup SIGTERM SIGINT

# ============================================================================
# Start Backend API
# ============================================================================
echo "📦 Starting backend API on port $BACKEND_PORT..."
cd "$BACKEND_DIR" || { echo "❌ Failed to change to backend directory"; exit 1; }

# Start backend in background
PORT="$BACKEND_PORT" node main.js > /tmp/backend.log 2>&1 &
BACKEND_PID=$!
echo "Backend started with PID: $BACKEND_PID"

# Wait a moment for backend to start
sleep 5

# Verify backend process is still running
if ! kill -0 "$BACKEND_PID" 2>/dev/null; then
    echo "❌ Backend process failed to start"
    echo "Backend logs:"
    cat /tmp/backend.log 2>/dev/null || true
    exit 1
fi

# Wait for backend to be responsive (simple HTTP check, not full health)
echo "⏳ Waiting for backend to be responsive..."
MAX_RETRIES=60
RETRY_COUNT=0
BACKEND_READY=0
while [ $RETRY_COUNT -lt $MAX_RETRIES ]; do
    # Check if backend is listening on the port (even if health check fails)
    if nc -z localhost "$BACKEND_PORT" 2>/dev/null; then
        # Backend is listening, check if it responds
        if curl -sf --max-time 2 "http://localhost:$BACKEND_PORT/api" >/dev/null 2>&1; then
            echo "✅ Backend is responsive"
            BACKEND_READY=1
            break
        fi
    fi
    RETRY_COUNT=$((RETRY_COUNT + 1))
    if [ $RETRY_COUNT -eq $MAX_RETRIES ]; then
        echo "⚠️  Backend not fully responsive, but continuing anyway..."
        echo "Backend logs:"
        tail -20 /tmp/backend.log 2>/dev/null || true
        # Don't exit - backend might still work even if health check fails
        break
    fi
    if [ $((RETRY_COUNT % 5)) -eq 0 ]; then
        echo "Attempt $RETRY_COUNT/$MAX_RETRIES: Backend not ready yet..."
    fi
    sleep 2
done

if [ $BACKEND_READY -eq 0 ]; then
    echo "⚠️  Continuing with backend startup despite incomplete readiness check"
fi

# ============================================================================
# Start Next.js Frontend
# ============================================================================
echo "🌐 Starting frontend on port $FRONTEND_PORT..."
cd "$FRONTEND_DIR" || { echo "❌ Failed to change to frontend directory"; exit 1; }

# Start frontend in background
PORT="$FRONTEND_PORT" npx next start --hostname 0.0.0.0 --port "$FRONTEND_PORT" > /tmp/frontend.log 2>&1 &
FRONTEND_PID=$!
echo "Frontend started with PID: $FRONTEND_PID"

# Wait for frontend to start and listen on port
echo "⏳ Waiting for frontend to be ready..."
MAX_RETRIES=60
RETRY_COUNT=0
FRONTEND_READY=0

while [ $RETRY_COUNT -lt $MAX_RETRIES ]; do
    # Check if frontend process is still running
    if ! kill -0 "$FRONTEND_PID" 2>/dev/null; then
        echo "❌ Frontend process died"
        echo "Frontend logs:"
        cat /tmp/frontend.log 2>/dev/null || true
        kill "$BACKEND_PID" 2>/dev/null || true
        exit 1
    fi
    
    # Check if frontend is listening on the port
    if nc -z localhost "$FRONTEND_PORT" 2>/dev/null; then
        # Try to make a request to verify it's responding
        if curl -sf --max-time 2 "http://localhost:$FRONTEND_PORT" >/dev/null 2>&1; then
            echo "✅ Frontend is ready and listening on port $FRONTEND_PORT"
            FRONTEND_READY=1
            break
        fi
    fi
    
    RETRY_COUNT=$((RETRY_COUNT + 1))
    if [ $((RETRY_COUNT % 5)) -eq 0 ]; then
        echo "Attempt $RETRY_COUNT/$MAX_RETRIES: Frontend not ready yet..."
    fi
    sleep 2
done

if [ $FRONTEND_READY -eq 0 ]; then
    echo "❌ Frontend failed to become ready after $MAX_RETRIES attempts"
    echo "Frontend logs:"
    tail -50 /tmp/frontend.log 2>/dev/null || true
    kill "$BACKEND_PID" 2>/dev/null || true
    exit 1
fi

echo "✅ All services started successfully"
echo "   Backend:  http://localhost:$BACKEND_PORT/api"
echo "   Frontend: http://localhost:$FRONTEND_PORT"
echo "   Cloud Run will route traffic to port $FRONTEND_PORT"

# ============================================================================
# Keep script running and monitor processes
# ============================================================================
# Wait for either process to exit
while true; do
    # Check if backend is still running
    if ! kill -0 "$BACKEND_PID" 2>/dev/null; then
        echo "❌ Backend process died unexpectedly"
        kill "$FRONTEND_PID" 2>/dev/null || true
        exit 1
    fi
    
    # Check if frontend is still running
    if ! kill -0 "$FRONTEND_PID" 2>/dev/null; then
        echo "❌ Frontend process died unexpectedly"
        kill "$BACKEND_PID" 2>/dev/null || true
        exit 1
    fi
    
    # Sleep and check again
    sleep 10
done

