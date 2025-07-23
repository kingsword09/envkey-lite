#!/bin/bash

# Generate self-signed SSL certificates for development/testing
# DO NOT use these certificates in production!

set -e

CERT_DIR="./certs"
CERT_FILE="$CERT_DIR/server.crt"
KEY_FILE="$CERT_DIR/server.key"

# Create certs directory if it doesn't exist
mkdir -p "$CERT_DIR"

# Check if certificates already exist
if [ -f "$CERT_FILE" ] && [ -f "$KEY_FILE" ]; then
    echo "SSL certificates already exist in $CERT_DIR"
    echo "To regenerate, delete the existing files and run this script again."
    exit 0
fi

echo "Generating self-signed SSL certificates for development..."

# Generate private key
openssl genrsa -out "$KEY_FILE" 2048

# Generate certificate signing request
openssl req -new -key "$KEY_FILE" -out "$CERT_DIR/server.csr" -subj "/C=US/ST=Development/L=Development/O=EnvKey Lite/OU=Development/CN=localhost"

# Generate self-signed certificate
openssl x509 -req -in "$CERT_DIR/server.csr" -signkey "$KEY_FILE" -out "$CERT_FILE" -days 365 -extensions v3_req -extfile <(
cat <<EOF
[v3_req]
keyUsage = keyEncipherment, dataEncipherment
extendedKeyUsage = serverAuth
subjectAltName = @alt_names

[alt_names]
DNS.1 = localhost
DNS.2 = 127.0.0.1
IP.1 = 127.0.0.1
IP.2 = ::1
EOF
)

# Clean up CSR file
rm "$CERT_DIR/server.csr"

# Set appropriate permissions
chmod 600 "$KEY_FILE"
chmod 644 "$CERT_FILE"

echo "✅ SSL certificates generated successfully!"
echo "📁 Certificate: $CERT_FILE"
echo "🔑 Private Key: $KEY_FILE"
echo ""
echo "⚠️  WARNING: These are self-signed certificates for development only!"
echo "   Do not use these certificates in production environments."
echo ""
echo "To enable HTTPS, update your .env file:"
echo "HTTPS_ENABLED=true"
echo "SSL_CERT_PATH=$CERT_FILE"
echo "SSL_KEY_PATH=$KEY_FILE"
echo "HTTPS_PORT=3443"
echo "FORCE_HTTPS=false"