# Testing Documentation

This directory contains all documentation related to testing the Maple Valley Observatory website.

## Files

### `TEST_DOCUMENTATION.md`
Comprehensive guide to the test suite including:
- Test categories and their purposes
- How to run different types of tests
- Pre-commit hook configuration
- Test philosophy and best practices
- Adding new tests

### `DATE_VALIDATION_SUMMARY.md`
Detailed documentation of the date validation system:
- Implementation details for date validation logic
- Test cases and edge cases
- Performance considerations
- Validation rules and exceptions

## Quick Test Commands

```bash
# Run all tests
npm test

# Run specific test categories
npm run test:unit
npm run test:data
npm run test:integration

# Run tests in watch mode
npm run test:watch

# Generate coverage report
npm run test:coverage
```

## Pre-commit Testing

Tests are automatically run before each commit via Husky hooks. See `TEST_DOCUMENTATION.md` for complete details on the automated testing workflow.
