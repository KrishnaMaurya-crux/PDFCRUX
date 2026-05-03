#!/bin/bash
cd /home/z/my-project
while true; do
  echo "=== Starting Next.js dev server ===" 
  npx next dev -p 3000 2>&1
  EXIT_CODE=$?
  echo "=== Server exited with code $EXIT_CODE, restarting in 1s ==="
  sleep 1
done
