#!/bin/bash

# Emergency script to temporarily move large images during development
# Run this when experiencing VS Code freezes

echo "🚨 Emergency VS Code Freeze Prevention Script"
echo "This will temporarily move large images to prevent development freezes"

# Create backup directory
BACKUP_DIR="./temp-image-backup-$(date +%Y%m%d-%H%M%S)"
mkdir -p "$BACKUP_DIR"

echo "📦 Creating backup directory: $BACKUP_DIR"

# Find and move large image files (>5MB)
echo "🔍 Finding large image files (>5MB)..."
find public/images -name "*.jpg" -o -name "*.jpeg" -o -name "*.png" -o -name "*.gif" -o -name "*.webp" -o -name "*.avif" | while read file; do
  if [ -f "$file" ]; then
    size=$(stat -f%z "$file" 2>/dev/null || stat -c%s "$file" 2>/dev/null)
    if [ "$size" -gt 5242880 ]; then  # 5MB in bytes
      echo "📁 Moving large file: $file ($(numfmt --to=iec $size))"
      mkdir -p "$BACKUP_DIR/$(dirname "$file")"
      mv "$file" "$BACKUP_DIR/$file"
    fi
  fi
done

# Create a restoration script
cat > "$BACKUP_DIR/restore.sh" << 'EOF'
#!/bin/bash
echo "🔄 Restoring images from backup..."
find . -name "*.jpg" -o -name "*.jpeg" -o -name "*.png" -o -name "*.gif" -o -name "*.webp" -o -name "*.avif" | while read file; do
  if [ -f "$file" ]; then
    target="../${file#./}"
    mkdir -p "$(dirname "$target")"
    mv "$file" "$target"
    echo "✅ Restored: $target"
  fi
done
cd ..
rmdir "$BACKUP_DIR" 2>/dev/null || echo "Backup directory not empty"
echo "🎉 Image restoration complete!"
EOF

chmod +x "$BACKUP_DIR/restore.sh"

echo ""
echo "✅ Emergency backup complete!"
echo "📝 Large images moved to: $BACKUP_DIR"
echo "🔄 To restore images later, run: $BACKUP_DIR/restore.sh"
echo ""
echo "🚀 Now restart VS Code - it should be much faster!"
echo "⚠️  Remember to restore images before committing changes"
