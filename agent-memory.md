# Agent Memory: TypeScript Error Checking Protocol

## CRITICAL RULE: Always Verify TypeScript Compilation

Before declaring that TypeScript errors are fixed, **ALWAYS** run:

```bash
npx tsc --noEmit
```

This command performs a complete TypeScript compilation check without emitting files and will catch ALL TypeScript errors across the entire project.

## Process Checklist:

1. **Initial Check**: Run `npx tsc --noEmit` to identify all TypeScript errors
2. **Fix Errors**: Address each error systematically 
3. **Verification**: Run `npx tsc --noEmit` again after fixes
4. **Final Build**: Run `npm run build` to ensure complete compilation success
5. **Only then**: Declare TypeScript errors are resolved

## Why This Matters:

- The regular build process may not catch all TypeScript errors immediately
- Some errors only surface during full type checking
- `npx tsc --noEmit` provides the most comprehensive error detection
- This prevents claiming fixes are complete when errors remain

## Recent Example:

When cleaning up 8-factor to 3-factor conversion:
- Initial fixes seemed complete based on individual file checks
- Running `npx tsc --noEmit` revealed hidden errors in test files and missing implementations
- Only after systematic fixing and re-running `npx tsc --noEmit` were all errors truly resolved

**REMEMBER**: "No TypeScript errors" means `npx tsc --noEmit` returns with exit code 0 and no error output.
