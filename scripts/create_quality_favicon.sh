#!/bin/bash

# Create high-quality favicon with better scaling
SOURCE="/Users/christian/Repos/MapleValleyObservatory/public/images/assets/MVO-Favicon.jpg"
OUTPUT_DIR="/Users/christian/Repos/MapleValleyObservatory/src/app"

echo "Creating high-quality favicons from: $SOURCE"

# Step 1: Create a clean 256x256 base (good intermediate size)
echo "Creating 256x256 base image..."
sips -z 256 256 "$SOURCE" --out /tmp/mvo-base-256.png

# Step 2: Create Apple Touch Icon (180x180) - highest quality for iOS
echo "Creating Apple Touch Icon (180x180)..."
sips -z 180 180 /tmp/mvo-base-256.png --out "${OUTPUT_DIR}/apple-touch-icon.png"

# Step 3: Create 32x32 favicon with better quality
echo "Creating 32x32 favicon..."
sips -z 32 32 /tmp/mvo-base-256.png --out "${OUTPUT_DIR}/favicon-32x32.png"

# Step 4: Create 16x16 favicon - most critical for browser tabs
echo "Creating 16x16 favicon..."
# Use the 32x32 as source for better quality when scaling to 16x16
sips -z 16 16 "${OUTPUT_DIR}/favicon-32x32.png" --out /tmp/favicon-16-temp.png

# Step 5: Create ICO file
echo "Converting to ICO format..."
sips -s format ico /tmp/favicon-16-temp.png --out "${OUTPUT_DIR}/favicon.ico"

# Step 6: Also save the 16x16 PNG version
cp /tmp/favicon-16-temp.png "${OUTPUT_DIR}/favicon-16x16.png"

# Clean up temp files
rm -f /tmp/mvo-base-256.png /tmp/favicon-16-temp.png

echo ""
echo "✅ High-quality favicon files created:"
echo "   📱 apple-touch-icon.png (180x180) - for iOS devices"
echo "   🖼️  favicon-32x32.png (32x32) - for high-DPI displays"
echo "   🌐 favicon.ico (16x16) - for browser tabs"
echo "   📄 favicon-16x16.png (16x16) - PNG version"
echo ""
echo "💡 Pro tip: The smaller sizes should now have better clarity!"
echo "   The key was using progressive scaling: source → 256px → final sizes"
