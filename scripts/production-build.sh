#!/bin/bash

# Build script that excludes admin routes in production
echo "Starting production build..."

# Check if this is a production build
if [ "$VERCEL_ENV" = "production" ] || [ "$NODE_ENV" = "production" ]; then
  echo "Production build detected - excluding admin routes"
  
  # Create temporary backup directory
  mkdir -p .backup/admin
  
  # Move admin route files temporarily
  if [ -d "src/app/api/admin" ]; then
    mv src/app/api/admin .backup/admin/
    echo "Admin routes moved to backup"
  fi
  
  # Run the build
  node scripts/capture-file-times.js && npx next build
  
  # Restore admin routes after build
  if [ -d ".backup/admin" ]; then
    mv .backup/admin src/app/api/admin
    echo "Admin routes restored"
  fi
  
  # Cleanup
  rm -rf .backup
  
else
  echo "Development build - including all routes"
  node scripts/capture-file-times.js && npx next build
fi
