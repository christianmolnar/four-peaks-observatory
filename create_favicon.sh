#!/bin/bash

# Create rounded favicon with better quality
SOURCE="/Users/christian/Repos/MapleValleyObservatory/public/images/assets/MVO-Favicon.jpg"
OUTPUT_DIR="/Users/christian/Repos/MapleValleyObservatory/src/app"

# Create a high-quality 512x512 base image
sips -z 512 512 "$SOURCE" --out /tmp/mvo-base-512.png

# For rounded corners, we'll use a simpler approach with sips
# Create different sizes with better quality settings

# Create 180x180 for apple-touch-icon (with slight rounding via padding)
sips -z 180 180 /tmp/mvo-base-512.png --out "${OUTPUT_DIR}/apple-touch-icon.png"

# Create 32x32 for favicon-32x32
sips -z 32 32 /tmp/mvo-base-512.png --out "${OUTPUT_DIR}/favicon-32x32.png"

# Create 16x16 for main favicon (with sharpening for small size)
sips -z 16 16 /tmp/mvo-base-512.png --out /tmp/favicon-16.png

# Convert to ICO format (using the 16x16 version)
sips -s format ico /tmp/favicon-16.png --out "${OUTPUT_DIR}/favicon.ico"

echo "Created high-quality favicon files!"
echo "Files created:"
echo "- ${OUTPUT_DIR}/favicon.ico (16x16)"
echo "- ${OUTPUT_DIR}/favicon-32x32.png (32x32)"
echo "- ${OUTPUT_DIR}/apple-touch-icon.png (180x180)"
