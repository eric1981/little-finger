#!/bin/bash
# Install Little Finger Native Messaging Host for Linux
set -e

HOST_DIR="$(cd "$(dirname "$0")" && pwd)"
HOST_SCRIPT="$HOST_DIR/little-finger-host.py"
MANIFEST_DIR="$HOME/.config/google-chrome/NativeMessagingHosts"
# Chromium: ~/.config/chromium/NativeMessagingHosts
# Brave: ~/.config/BraveSoftware/Brave-Browser/NativeMessagingHosts

mkdir -p "$MANIFEST_DIR"
chmod +x "$HOST_SCRIPT"

MANIFEST_FILE="$MANIFEST_DIR/com.littlefinger.json"

# Get extension ID — replace with actual ID or prompt
EXT_ID="${1:-YOUR_EXTENSION_ID}"

cat > "$MANIFEST_FILE" << EOF
{
  "name": "com.littlefinger",
  "description": "Little Finger Browser Automation",
  "path": "$HOST_SCRIPT",
  "type": "stdio",
  "allowed_origins": [
    "chrome-extension://$EXT_ID/"
  ]
}
EOF

echo "✅ Little Finger Native Host installed (Linux)"
echo "   Manifest: $MANIFEST_FILE"
echo "   Host:     $HOST_SCRIPT"
echo ""
echo "Test: python3 $HOST_DIR/little-finger-cli.py '{\"action\":\"publish_article\",\"platform\":\"zhihu\",\"title\":\"Test\",\"content\":\"Hello\"}'"
