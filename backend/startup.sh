#!/bin/bash
# Azure App Service startup script
# Installs ffmpeg for audio processing

echo "🔧 Installing ffmpeg..."
apt-get update && apt-get install -y ffmpeg

echo "✅ ffmpeg installed:"
ffmpeg -version | head -1

echo "🚀 Starting application..."
gunicorn app.main:app -w 2 -k uvicorn.workers.UvicornWorker --bind 0.0.0.0:8000 --timeout 120
