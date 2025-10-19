# File Organization Rules - CRITICAL FOR ALL AI AGENTS

## NEVER CREATE FILES IN ROOT DIRECTORY

### Required Directory Structure
- **Documentation**: `/docs/project/`, `/docs/development/`, `/docs/setup/`
- **Test files**: `/tests/` (NOT `/docs/testing/`)
- **Scripts**: `/scripts/` 
- **Assets**: `/public/assets/`
- **Agent files**: Root only (required by GitHub Copilot)

### File Placement Rules
- `.md` documentation → `/docs/[appropriate-subdirectory]/`
- `test-*.js` or `*-test.js` → `/tests/`
- `*.js` scripts → `/scripts/`
- `*.png`, `*.ico`, `*.svg` → `/public/assets/`
- `*.json` config/data → `/docs/development/` or appropriate location

## Current Organization

### `/docs/project/`
- OBSERVATORY_EQUIPMENT_PLANS.md - Equipment research and planning

### `/docs/development/`
- Technical fixes and implementation details
- Analysis results and configuration templates

### `/docs/setup/`
- Installation guides and setup procedures

### `/tests/`
- All test files consolidated here
- Testing documentation

### `/scripts/`
- All automation and utility scripts

### `/public/assets/`
- Images, icons, fonts, and other static assets

## Enforcement

These rules are enforced by GitHub Copilot agent instructions in:
- `.github/copilot-instructions.md`
- `AGENTS.md`
- `CLAUDE.md` 
- `GEMINI.md`

**Any AI agent that creates files in the root directory is violating critical organizational rules.**
