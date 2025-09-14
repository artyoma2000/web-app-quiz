#!/bin/sh
set -e
CERT_DIR=/certs
mkdir -p "$CERT_DIR"
if [ -f "$CERT_DIR/cert.pem" ] && [ -f "$CERT_DIR/key.pem" ]; then
  echo "Certs already exist in $CERT_DIR"
  ls -l "$CERT_DIR"
  exit 0
fi

echo "Generating self-signed certificate for localhost..."
apk add --no-cache openssl > /dev/null 2>&1 || true
openssl req -x509 -newkey rsa:4096 -keyout "$CERT_DIR/key.pem" -out "$CERT_DIR/cert.pem" -days 365 -nodes -subj "/CN=localhost"
chmod 444 "$CERT_DIR/cert.pem" "$CERT_DIR/key.pem"
ls -l "$CERT_DIR"
echo "Done. Certificates created in $CERT_DIR"
