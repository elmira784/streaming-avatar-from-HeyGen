#!/bin/bash

# HeyGen Avatar App Stop Script
# Cleanly shuts down backend and frontend processes and cleans up HeyGen sessions

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${GREEN}[STOP]${NC} $1"
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

print_status "Stopping HeyGen Avatar App Development Environment"

# Function to cleanup HeyGen sessions
cleanup_heygen_sessions() {
    print_backend "Cleaning up HeyGen sessions..."
    
    # Try to call the cleanup endpoint
    if curl -s -f -X POST http://localhost:4001/api/heygen/cleanup > /dev/null 2>&1; then
        print_backend "HeyGen sessions cleaned up successfully"
    else
        print_warning "Could not reach backend cleanup endpoint (server may already be down)"
    fi
}

# Function to stop backend processes
stop_backend() {
    print_backend "Stopping backend processes..."
    
    # Find processes running on port 4001
    BACKEND_PIDS=$(lsof -ti:4001 2>/dev/null || true)
    
    if [[ -n "$BACKEND_PIDS" ]]; then
        # First try to cleanup HeyGen sessions
        cleanup_heygen_sessions
        
        # Give it a moment to process cleanup
        sleep 1
        
        # Then kill the backend processes
        for PID in $BACKEND_PIDS; do
            if kill -0 $PID 2>/dev/null; then
                print_backend "Terminating backend process (PID: $PID)"
                kill $PID 2>/dev/null || true
                
                # Wait a bit for graceful shutdown
                sleep 2
                
                # Force kill if still running
                if kill -0 $PID 2>/dev/null; then
                    print_backend "Force killing backend process (PID: $PID)"
                    kill -9 $PID 2>/dev/null || true
                fi
            fi
        done
        print_backend "Backend processes stopped"
    else
        print_backend "No backend processes found on port 4001"
    fi
}

# Function to stop frontend processes
stop_frontend() {
    print_frontend "Stopping frontend processes..."
    
    # Find Expo processes
    EXPO_PIDS=$(pgrep -f "expo start" 2>/dev/null || true)
    
    if [[ -n "$EXPO_PIDS" ]]; then
        for PID in $EXPO_PIDS; do
            if kill -0 $PID 2>/dev/null; then
                print_frontend "Terminating Expo process (PID: $PID)"
                kill $PID 2>/dev/null || true
                
                # Wait a bit for graceful shutdown
                sleep 2
                
                # Force kill if still running
                if kill -0 $PID 2>/dev/null; then
                    print_frontend "Force killing Expo process (PID: $PID)"
                    kill -9 $PID 2>/dev/null || true
                fi
            fi
        done
        print_frontend "Expo processes stopped"
    else
        print_frontend "No Expo processes found"
    fi
    
    # Also check for node processes that might be related to our app
    NODE_PIDS=$(pgrep -f "node.*server/index.js" 2>/dev/null || true)
    if [[ -n "$NODE_PIDS" ]]; then
        for PID in $NODE_PIDS; do
            if kill -0 $PID 2>/dev/null; then
                print_backend "Terminating Node.js server process (PID: $PID)"
                kill $PID 2>/dev/null || true
                sleep 1
                if kill -0 $PID 2>/dev/null; then
                    kill -9 $PID 2>/dev/null || true
                fi
            fi
        done
    fi
}

# Function to cleanup any remaining processes
cleanup_remaining() {
    print_status "Cleaning up any remaining processes..."
    
    # Kill any remaining processes on port 4001
    REMAINING_4001=$(lsof -ti:4001 2>/dev/null || true)
    if [[ -n "$REMAINING_4001" ]]; then
        print_warning "Force killing remaining processes on port 4001"
        echo $REMAINING_4001 | xargs kill -9 2>/dev/null || true
    fi
    
    # Kill any remaining Metro bundler processes (React Native)
    METRO_PIDS=$(pgrep -f "metro" 2>/dev/null || true)
    if [[ -n "$METRO_PIDS" ]]; then
        print_frontend "Stopping Metro bundler processes"
        echo $METRO_PIDS | xargs kill 2>/dev/null || true
    fi
}

# Main execution
stop_backend
stop_frontend
cleanup_remaining

print_status "All development processes stopped successfully"

# Check if ports are free
if ! lsof -ti:4001 > /dev/null 2>&1; then
    print_status "Port 4001 is now free"
else
    print_warning "Port 4001 may still be in use"
fi

echo ""
print_status "You can now run './dev.sh' to start the development environment again"