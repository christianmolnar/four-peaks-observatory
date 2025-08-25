# 🛠️ Scripts Documentation

## Overview

This directory contains automation scripts for maintaining the Maple Valley Observatory website.

## Directory Structure

```
scripts/
├── capture-file-times.js    # Build-time file timestamp capture
├── test-runner.js           # Enhanced test execution
└── maintenance/            # Data maintenance scripts
    ├── update-metadata.js  # EXIF metadata extraction & validation
    ├── fix-metadata.py     # Python metadata utilities
    ├── debug-parse.js      # Debug astronomical object parsing
    └── test-parsing.js     # Test object name parsing
```

## Core Scripts

### `capture-file-times.js`
**Purpose**: Captures file modification times during build process for static generation.

```bash
npm run capture-timestamps
```

**Usage**: Automatically run during `npm run build`

### `test-runner.js`
**Purpose**: Enhanced test execution with organized test categories.

```bash
# Available via npm scripts:
npm run test:unit
npm run test:data
npm run test:integration
```

## Maintenance Scripts

### `maintenance/update-metadata.js`
**Purpose**: Primary metadata management tool with EXIF reading and date validation.

```bash
npm run update-metadata
```

**Features**:
- Reads EXIF metadata from image files
- Validates dates (rejects pre-1995 or future dates)
- Astronomical object name detection
- Equipment information extraction
- Force updates existing metadata

**Configuration**: Modify `FORCE_UPDATE` variable to refresh existing entries.

### `maintenance/fix-metadata.py`
**Purpose**: Python utilities for metadata manipulation and cleanup.

**Usage**: Python-based metadata processing for complex operations.

### `maintenance/debug-parse.js`
**Purpose**: Debug astronomical object name parsing and recognition.

**Usage**: Troubleshoot object name detection and catalog assignment.

### `maintenance/test-parsing.js`  
**Purpose**: Test and validate object name parsing logic.

**Usage**: Verify parsing accuracy for new object types.

## Usage Workflows

### 🖼️ Adding New Images

1. Add image files to appropriate directories
2. Run metadata extraction:
   ```bash
   npm run update-metadata
   ```
3. Verify with tests:
   ```bash
   npm run test:data
   ```

### 🔍 Debugging Metadata Issues

1. Check parsing logic:
   ```bash
   node scripts/maintenance/debug-parse.js
   ```
2. Test specific objects:
   ```bash
   node scripts/maintenance/test-parsing.js
   ```
3. Force metadata refresh:
   ```bash
   # Edit update-metadata.js: FORCE_UPDATE = true
   npm run update-metadata
   ```

### 🧪 Development Testing

1. Run specific test categories:
   ```bash
   npm run test:unit      # Fast component tests
   npm run test:data      # Metadata validation  
   npm run test:integration # Cross-system checks
   ```

2. Continuous testing:
   ```bash
   npm run test:watch
   ```

## Script Configuration

### Environment Variables
Scripts respect standard Node.js environment variables:
- `NODE_ENV`: Controls logging verbosity
- `DEBUG`: Enables detailed debug output

### File Paths
Scripts use relative paths from project root:
- `src/data/metadata.json`: Primary metadata store
- `public/images/`: Image file locations
- Base directory: Project root

## Maintenance Schedule

### Regular Tasks
- **Weekly**: Run `npm run update-metadata` for new images
- **Before commits**: Automatic via pre-commit hooks
- **After major changes**: Full test suite via `npm run verify`

### Periodic Tasks  
- **Monthly**: Review test output for warnings
- **Quarterly**: Update metadata validation rules as needed

## Adding New Scripts

### Guidelines
1. Place utility scripts in `maintenance/` subdirectory
2. Add npm script aliases in `package.json`
3. Include JSDoc comments for complex logic
4. Follow error handling patterns from existing scripts

### Template Structure
```javascript
#!/usr/bin/env node
/**
 * Script Purpose Description
 * Usage: node scripts/maintenance/script-name.js
 */

// Configuration
const CONFIG = {
  // Script-specific settings
};

// Main execution
async function main() {
  try {
    // Script logic
    console.log('✅ Script completed successfully');
  } catch (error) {
    console.error('❌ Script failed:', error.message);
    process.exit(1);
  }
}

// Execute if run directly
if (require.main === module) {
  main();
}
```

This structure ensures consistency and maintainability across all project scripts.
