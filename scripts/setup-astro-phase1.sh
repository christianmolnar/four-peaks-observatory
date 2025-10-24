#!/bin/bash

echo "🚀 Phase 1: Astro Migration Setup - Solving VS Code Freeze Issues"
echo "This script sets up Astro alongside your Next.js project for image optimization"

# Check if we're in the right directory
if [ ! -f "package.json" ]; then
  echo "❌ Error: Please run this script from the project root directory"
  exit 1
fi

# Create astro-mvo directory for parallel development
if [ ! -d "astro-mvo" ]; then
  echo "📁 Creating Astro project directory..."
  npm create astro@latest astro-mvo -- --template minimal --typescript strict --yes
  
  cd astro-mvo
  
  echo "📦 Installing Astro integrations..."
  npx astro add react tailwind --yes
  npm install sharp @astrojs/image
  
  cd ..
fi

# Create enhanced VS Code workspace settings specifically for Astro development
echo "⚙️  Creating Astro-optimized workspace configuration..."

cat > .vscode/astro-workspace.code-workspace << 'EOF'
{
  "folders": [
    {
      "name": "Next.js (Current)",
      "path": "."
    },
    {
      "name": "Astro (Migration)",
      "path": "./astro-mvo"
    }
  ],
  "settings": {
    "files.watcherExclude": {
      "**/public/images/**": true,
      "**/src/assets/images/**": false,
      "**/*.jpg": true,
      "**/*.png": true,
      "**/*.gif": true,
      "**/*.webp": true,
      "**/*.avif": true,
      "**/node_modules/**": true,
      "**/.next/**": true,
      "**/.astro/**": true,
      "**/dist/**": true
    },
    "search.exclude": {
      "**/public/images/**": true,
      "**/*.jpg": true,
      "**/*.png": true,
      "**/*.gif": true,
      "**/*.webp": true,
      "**/*.avif": true
    },
    "typescript.validate.enable": false,
    "editor.tokenColorization": false,
    "workbench.startupEditor": "none"
  },
  "tasks": {
    "version": "2.0.0",
    "tasks": [
      {
        "label": "Start Next.js Dev",
        "type": "shell",
        "command": "npm run dev",
        "group": "build",
        "options": {
          "cwd": "${workspaceFolder}"
        }
      },
      {
        "label": "Start Astro Dev",
        "type": "shell",
        "command": "npm run dev",
        "group": "build",
        "options": {
          "cwd": "${workspaceFolder}/astro-mvo"
        }
      },
      {
        "label": "Emergency Image Backup",
        "type": "shell",
        "command": "./scripts/emergency-freeze-fix.sh",
        "group": "build"
      }
    ]
  }
}
EOF

echo "✅ Phase 1 setup complete!"
echo ""
echo "🎯 Next Steps to Eliminate Freezes:"
echo "1. Close VS Code completely"
echo "2. Run emergency script if needed: ./scripts/emergency-freeze-fix.sh"
echo "3. Open the new workspace: code .vscode/astro-workspace.code-workspace"
echo "4. Start Astro development: cd astro-mvo && npm run dev"
echo ""
echo "🚀 The Astro version will have build-time image optimization instead of runtime indexing"
echo "📊 This should eliminate the 20-second freezes you're experiencing"
