#!/bin/bash
# Install Little Finger Native Messaging Host for Chrome
# Run this script once to register the native host.

set -e

HOST_DIR="$(cd "$(dirname "$0")" && pwd)"
HOST_SCRIPT="$HOST_DIR/little-finger-host.py"
MANIFEST_DIR="$HOME/.config/google-chrome/NativeMessagingHosts"
# For Chromium: ~/.config/chromium/NativeMessagingHosts
# For Edge: ~/.config/microsoft-edge/NativeMessagingHosts

mkdir -p "$MANIFEST_DIR"

MANIFEST_FILE="$MANIFEST_DIR/com.littlefinger.json"

cat > "$MANIFEST_FILE" << EOF
{
  "name": "com.littlefinger",
  "description": "Little Finger Browser Automation",
  "path": "$HOST_SCRIPT",
  "type": "stdio",
  "allowed_origins": [
    "chrome-extension://*"
  ]
}
EOF

chmod +x "$HOST_SCRIPT"
chmod +x "$HOST_DIR/little-finger-cli.py"

echo "✅ Little Finger Native Host installed"
echo "   Manifest: $MANIFEST_FILE"
echo "   Host:     $HOST_SCRIPT"
echo ""
echo "Test with:"
echo "   python3 $HOST_DIR/little-finger-cli.py '{\"action\":\"publish_article\",\"platform\":\"zhihu\",\"title\":\"Test\",\"content\":\"Hello from CLI\"}'"
