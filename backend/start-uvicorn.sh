#!/bin/sh
set -e
HOST="0.0.0.0"
PORT="8000"
if [ -n "$SSL_CERT_FILE" ] && [ -n "$SSL_KEY_FILE" ] && [ -f "$SSL_CERT_FILE" ] && [ -f "$SSL_KEY_FILE" ]; then
  echo "Starting Uvicorn with SSL"
  exec uvicorn app.main:app --host $HOST --port $PORT --ssl-certfile "$SSL_CERT_FILE" --ssl-keyfile "$SSL_KEY_FILE"
else
  echo "Starting Uvicorn without SSL"
  exec uvicorn app.main:app --host $HOST --port $PORT
fi
