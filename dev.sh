#!/bin/bash

# HeyGen Avatar App Development Server
# Runs both backend and frontend concurrently

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${GREEN}[DEV]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_backend() {
    echo -e "${BLUE}[BACKEND]${NC} $1"
}

print_frontend() {
    echo -e "${YELLOW}[FRONTEND]${NC} $1"
}

# Cleanup function to be called on exit
cleanup() {
    print_status "Shutting down development servers..."
    
    # Kill backend process if it exists
    if [[ -n $BACKEND_PID ]]; then
        print_backend "Stopping backend server (PID: $BACKEND_PID)"
        kill $BACKEND_PID 2>/dev/null || true
        
        # Call cleanup endpoint to stop HeyGen sessions
        curl -s -X POST http://localhost:4001/api/heygen/cleanup > /dev/null 2>&1 || true
    fi
    
    # Kill frontend process if it exists
    if [[ -n $FRONTEND_PID ]]; then
        print_frontend "Stopping frontend server (PID: $FRONTEND_PID)"
        kill $FRONTEND_PID 2>/dev/null || true
    fi
    
    # Kill any remaining processes on port 4001
    lsof -ti:4001 | xargs kill -9 2>/dev/null || true
    
    print_status "Development servers stopped"
    exit 0
}

# Set up signal handlers
trap cleanup SIGINT SIGTERM EXIT

print_status "Starting HeyGen Avatar App Development Environment"
print_status "Backend will run on http://localhost:4001"
print_status "Frontend will run on Expo dev server"
print_status "Press Ctrl+C to stop both servers"
echo ""

# Check if node is available
if ! command -v node &> /dev/null; then
    print_error "Node.js is not installed or not in PATH"
    exit 1
fi

# Check if expo CLI is available
if ! command -v expo &> /dev/null && ! npx expo --version &> /dev/null; then
    print_error "Expo CLI is not available. Install with: npm install -g @expo/cli"
    exit 1
fi

# Start backend server in background
print_backend "Starting backend server..."
node server/index.js &
BACKEND_PID=$!

# Give backend time to start
sleep 2

# Check if backend started successfully
if ! curl -s http://localhost:4001/ > /dev/null; then
    print_error "Backend failed to start on port 4001"
    kill $BACKEND_PID 2>/dev/null || true
    exit 1
fi

print_backend "Backend server started successfully (PID: $BACKEND_PID)"

# Start frontend in foreground
print_frontend "Starting Expo development server..."
echo ""

# Use npx expo if expo is not globally installed
if command -v expo &> /dev/null; then
    expo start
else
    npx expo start
fi