# 🧪 Test Suite Documentation

## Overview

The Maple Valley Observatory website includes a comprehensive test suite designed to ensure data integrity, site functionality, and maintain quality standards. The tests are organized into three main categories for better maintainability and focused testing.

## Test Structure

```
tests/
├── unit/           # Unit tests for individual components and configs
├── data/           # Data validation and metadata tests  
├── integration/    # Cross-system consistency tests
└── __mocks__/      # Mock files for testing (future)
```

## Test Categories

### 🔧 Unit Tests (`tests/unit/`)

**Purpose**: Test individual components, configurations, and isolated functionality.

- **`config.test.ts`**: Validates observatory configuration settings
  - Observatory name, location, contact information
  - SEO metadata completeness
  - Equipment configuration
  - Mission statement validation

- **`structure.test.ts`**: Ensures proper file and directory structure
  - Required directories exist
  - Essential configuration files present
  - Main page files available
  - Package.json has required scripts

### 📊 Data Tests (`tests/data/`)

**Purpose**: Validate metadata integrity and data consistency.

- **`metadata.test.ts`**: Comprehensive metadata validation
  - All images have required metadata fields
  - Date validation (prevents nonsense dates like "1984")
  - Astronomical object naming consistency
  - YouTube link format validation
  - Eclipse photo date accuracy

### 🔗 Integration Tests (`tests/integration/`)

**Purpose**: Test cross-system consistency and file relationships.

- **`consistency.test.ts`**: End-to-end data consistency
  - Image files exist for metadata entries
  - Valid file extensions only
  - Catalog designation format validation
  - Equipment naming consistency
  - Location format validation
  - Duplicate detection with reasonable thresholds

## Running Tests

### Quick Commands

```bash
# Run all tests
npm test

# Run specific test categories
npm run test:unit
npm run test:data  
npm run test:integration

# Development workflow
npm run test:watch     # Watch mode for development
npm run test:coverage  # Generate coverage report
npm run test:ci       # CI/CD optimized run
```

### Pre-commit Hook

Tests automatically run before every commit via Husky:
- Runs full test suite
- Runs ESLint
- Prevents commit if tests fail

### Manual Test Execution

```bash
# Update metadata before testing
npm run update-metadata

# Verify everything works
npm run verify  # tests + lint + build
```

## Test Configuration

### Jest Setup
- **Environment**: jsdom (for React components)
- **TypeScript**: Full support with ts-jest
- **Module Resolution**: @ alias for src/ directory
- **Coverage**: Excludes layout and loading files

### Key Features
- Validates 148+ image metadata entries
- Checks 26+ essential configuration fields
- Monitors file system consistency
- Prevents data corruption via validation

## Data Quality Standards

### ✅ What Tests Validate

1. **Date Accuracy**
   - No dates before 1995 (pre-digital photography)
   - No dates more than 1 year in future
   - Eclipse photos have correct August 2017 dates

2. **Catalog Designations**
   - Standard formats: M31, NGC7000, IC1396
   - Complex entries: "NGC7000 and IC5070"
   - Group designations: "M65, M66, NGC3628"

3. **File Consistency**
   - Less than 20% missing image files allowed
   - Valid image extensions only (.jpg, .png, .webp, etc.)
   - Reasonable duplicate ratios (< 70% for series)

4. **Equipment & Locations**
   - Consistent equipment naming
   - Valid location formats (includes state/region)
   - YouTube link validation

### ⚠️ Warning Systems

Tests use console warnings for non-critical issues:
- Missing image files (tracked but not failed)
- Future dates in eclipse photos
- Typos in equipment names
- Invalid catalog designations

## Maintenance

### Adding New Tests

1. **Unit Tests**: Add to `tests/unit/` for isolated functionality
2. **Data Tests**: Add to `tests/data/` for metadata validation  
3. **Integration Tests**: Add to `tests/integration/` for cross-system checks

### Test Data Updates

When adding new images or metadata:
1. Run `npm run update-metadata` to refresh metadata
2. Run `npm test` to validate new entries
3. Update test thresholds if needed (e.g., missing image ratio)

### Continuous Integration

The test suite is designed for CI/CD workflows:
- Fast execution (< 2 seconds typical)
- Clear pass/fail indicators
- Detailed logging for debugging
- Coverage reporting for code quality

## Troubleshooting

### Common Issues

**"Missing images" warnings**: Normal for development, indicates metadata entries without corresponding image files.

**Catalog designation failures**: Add new patterns to `consistency.test.ts` catalog patterns array.

**Date validation errors**: Check `../docs/testing/DATE_VALIDATION_SUMMARY.md` for date fixing procedures.

### Performance

- **Typical runtime**: < 2 seconds
- **Full coverage**: < 5 seconds  
- **Watch mode**: Near-instant feedback

The test suite prioritizes speed and reliability to encourage frequent usage during development.
