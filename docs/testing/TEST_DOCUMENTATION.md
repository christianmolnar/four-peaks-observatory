# Test Suite Documentation

## Overview
This test suite provides comprehensive validation for the Maple Valley Observatory website to ensure quality and consistency before deployments.

## Test Categories

### 1. Configuration Tests (`config.test.ts`)
- **Purpose**: Validates observatory configuration settings
- **Tests**:
  - Basic information (name, tagline, location)
  - Owner information and contact details
  - SEO metadata completeness
  - Equipment configuration

### 2. Metadata Tests (`metadata.test.ts`)
- **Purpose**: Validates image metadata for accuracy and completeness
- **Tests**:
  - Required fields existence (objectName/name, location, protected status)
  - Date validation (no nonsense dates like 1984)
  - Astronomical object catalog designations
  - YouTube link format validation
  - Location format consistency

### 3. Structure Tests (`structure.test.ts`)
- **Purpose**: Validates file system structure and essential files
- **Tests**:
  - Required directories exist
  - Essential configuration files present
  - Main page files available
  - Core component files exist
  - Package.json has required scripts

### 4. Consistency Tests (`consistency.test.ts`)
- **Purpose**: Cross-validates metadata against file system
- **Tests**:
  - Image files exist for metadata entries
  - Valid file extensions
  - Catalog designation patterns
  - Equipment naming consistency
  - Location format validation

## Test Execution

### Run All Tests
```bash
npm test
```

### Watch Mode (for development)
```bash
npm run test:watch
```

### Coverage Report
```bash
npm run test:coverage
```

### Pre-commit Validation
```bash
npm run precommit
```

## Pre-commit Hooks

The test suite is automatically run before commits via Husky:
- Tests must pass before commit is allowed
- Linting is also enforced
- Helps prevent bad data from entering the repository

## Test Philosophy

- **Non-breaking**: Tests warn about issues but allow reasonable variations
- **Fast execution**: Focus on data validation rather than UI testing
- **Practical**: Designed for real-world usage with existing data
- **Informative**: Console warnings help identify data quality issues

## Common Warnings

Tests may show warnings for:
- Missing image files (some metadata may reference future uploads)
- Future dates in metadata (photos may be processed after capture)
- Minor formatting inconsistencies in equipment names
- Complex catalog designations for object groups

These warnings help maintain data quality but don't fail the build.

## Adding New Tests

When adding new tests:
1. Place in appropriate category file
2. Use descriptive test names
3. Prefer warnings over hard failures for data quality
4. Include helpful console output for debugging
5. Test both positive and negative cases
