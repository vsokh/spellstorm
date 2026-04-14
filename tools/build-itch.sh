#!/usr/bin/env bash
set -euo pipefail

# Build the project
echo "Building project..."
npm run build

# Read version from package.json
VERSION=$(node -p "require('./package.json').version")
echo "Version: $VERSION"

# Create builds directory if it doesn't exist
mkdir -p builds

# Zip the contents of dist/ (not the folder itself) excluding source maps
OUTPUT="builds/spellstorm-v${VERSION}.zip"
echo "Creating $OUTPUT ..."
cd dist
zip -r "../$OUTPUT" . -x '*.map'
cd ..

# Print result
SIZE=$(du -h "$OUTPUT" | cut -f1)
echo ""
echo "Done! Output: $OUTPUT ($SIZE)"
