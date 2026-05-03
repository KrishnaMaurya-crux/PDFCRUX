#!/bin/bash
while true; do
  cd /home/z/my-project
  npx next dev -p 3000 >> /home/z/my-project/dev.log 2>&1
  echo "$(date): Server crashed, restarting in 2s..." >> /home/z/my-project/dev.log
  sleep 2
done
