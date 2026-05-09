#!/bin/bash
echo "Starting Local Link..."
cd "$(dirname "$0")/backend"
node server.js
