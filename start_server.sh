#!/bin/bash
# Start a simple HTTP server to serve the YouTube Sync Player
# This is necessary because YouTube IFrame API has restrictions on file:// protocol

PORT=8000
DIRECTORY="/Users/shf/.gemini/antigravity/scratch/youtube-sync-player"

echo "Starting YouTube Sync Player on http://localhost:$PORT..."

# Check if python3 is available
if command -v python3 &> /dev/null; then
    cd "$DIRECTORY"
    # Start server in background
    python3 -m http.server $PORT &
    SERVER_PID=$!
    echo "Server started with PID $SERVER_PID"
    
    # Wait a moment for server to start
    sleep 2
    
    # Open valid URL
    open "http://localhost:$PORT"
    
    echo "Press Ctrl+C to stop the server"
    wait $SERVER_PID
else
    echo "Error: Python3 is required to start the local server."
    exit 1
fi
