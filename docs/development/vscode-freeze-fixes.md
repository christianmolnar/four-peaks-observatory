# VS Code Freeze Fix - Emergency Solutions

## The Problem
You're experiencing 20-second freezes in VS Code when working with your image-heavy observatory project. This is caused by VS Code trying to index and process all the large astrophotography images in your `public/images` directory.

## Immediate Solutions Applied

### 1. Enhanced VS Code Settings
- **Location**: `.vscode/settings.json`
- **Changes**: Added maximum aggressive file watching exclusions and performance optimizations
- **Effect**: Should reduce freezing by preventing VS Code from indexing image files

### 2. Emergency Image Backup Script
- **Location**: `scripts/emergency-freeze-fix.sh`
- **Usage**: `./scripts/emergency-freeze-fix.sh`
- **Purpose**: Temporarily moves large images (>5MB) out of the workspace during development
- **Restoration**: Creates a `restore.sh` script to put images back when needed

### 3. Astro Migration Setup Script
- **Location**: `scripts/setup-astro-phase1.sh`
- **Usage**: `./scripts/setup-astro-phase1.sh`
- **Purpose**: Sets up Astro development environment with build-time image optimization

## Immediate Action Plan

### Option A: Quick Fix (Temporary)
1. Close VS Code completely
2. Run: `./scripts/emergency-freeze-fix.sh`
3. Restart VS Code
4. Work without freezes (images temporarily moved)
5. Restore images before committing: `./temp-image-backup-*/restore.sh`

### Option B: Astro Migration (Permanent Solution)
1. Close VS Code completely
2. Run: `./scripts/setup-astro-phase1.sh`
3. Open workspace: `code .vscode/astro-workspace.code-workspace`
4. Start Astro development: `cd astro-mvo && npm run dev`
5. Begin migrating components to Astro for freeze-free development

## Why This Happens
- VS Code tries to index all files for search, IntelliSense, and Git tracking
- Large image collections (especially your astrophotography images) consume massive memory
- File watching becomes overwhelmed with binary image data
- TypeScript language server struggles with large file trees

## Long-term Solution: Astro Migration
- **Build-time image processing**: Images optimized during build, not development
- **Reduced JavaScript bundles**: 90% less client-side code
- **Static site generation**: Better performance for your observatory content
- **Intelligent caching**: Faster builds and development cycles

## Recovery Steps if Issues Persist
1. **Force close VS Code**: `pkill "Visual Studio Code"`
2. **Clear VS Code cache**: `rm -rf ~/Library/Caches/com.microsoft.VSCode`
3. **Restart with safe mode**: `code --disable-extensions`
4. **Use emergency backup script**

## Next Steps
- Test the current fixes
- If freezes continue, run the emergency backup script
- Begin Phase 1 of Astro migration for permanent solution
- Follow the migration plan in `docs/design/Astro-MVO-Overhaul/README.md`
