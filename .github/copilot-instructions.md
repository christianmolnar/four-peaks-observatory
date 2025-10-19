# Arizona Observatory Project - Repository Instructions

## Project Overview
This is a Next.js web application for the Maple Valley Observatory, focused on automated astrophotography operations. The project provides weather forecasting, observation planning, and equipment management for a fully automated observatory system.

## Critical File Organization Rules

### NEVER CREATE FILES IN ROOT DIRECTORY
- **NEVER create documentation files in root** - Use `/docs/` subdirectories
- **NEVER create test files in root** - Use `/tests/` directory  
- **NEVER create script files in root** - Use `/scripts/` directory
- **NEVER create asset files in root** - Use `/public/assets/` directory

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

### Current Organization

#### `/docs/project/`
- OBSERVATORY_EQUIPMENT_PLANS.md - Equipment research and planning

#### `/docs/development/`
- Technical fixes and implementation details
- Analysis results and configuration templates

#### `/docs/setup/`
- Installation guides and setup procedures

#### `/tests/`
- All test files consolidated here
- Testing documentation

#### `/scripts/`
- All automation and utility scripts

#### `/public/assets/`
- Images, icons, fonts, and other static assets

### Enforcement
These rules are enforced by GitHub Copilot agent instructions in:
- `.github/copilot-instructions.md`
- `.github/instructions/memory.instructions.md`

**Any AI agent that creates files in the root directory is violating critical organizational rules.**

## Critical Agent Instructions

### Server Management Rules:
- **NEVER start development servers automatically** (npm run dev, npm start, etc.)
- **NEVER restart servers** without explicit user permission
- **ALWAYS notify user when changes are complete** and let them restart the server
- **User prefers to control server lifecycle** due to port conflicts and system management
- When work is finished, simply state: "Changes complete. Please restart your server to see the updates."

### Code Complexity Rules:
- **ALWAYS opt for simplifying and removing unnecessary complexity**
- **NEVER stack conversions on top of existing conversions**
- **Question every data transformation - eliminate intermediate steps**
- **Use the simplest, most direct approach possible**

## Technical Stack
- **Frontend**: Next.js 14 with TypeScript
- **Styling**: Tailwind CSS with design tokens
- **Language**: TypeScript throughout
- **Build**: Standard Next.js build process

## Project Structure
- `/src/app/`: Next.js App Router pages and layouts
- `/src/components/`: Reusable React components
- `/src/config/`: Configuration files
- `/src/styles/`: CSS and design tokens
- `/public/`: Static assets including observatory images

## Build Commands
- `npm install`: Install dependencies
- `npm run build`: Build production version
- `npm run dev`: Start development server (user-controlled only)
- `npm run lint`: Check code quality

## Observatory Context
This system supports automated astrophotography operations with focus on:
- Weather monitoring and Clear Sky Chart integration
- Equipment automation (mount, focuser, camera control)
- Observation planning and scheduling
- Phoenix area specific astronomical conditions

## Evidence-Based Systematic Debugging Principles

### Meta-Prime Principle Framework
1. **Evidence Collection**: Gather concrete data before theorizing
2. **Systematic Validation**: Test each hypothesis methodically  
3. **Root Cause Analysis**: Trace problems to their fundamental source
4. **Pattern Recognition**: Extract transferable principles from specific cases
5. **Documentation**: Record findings for future reference

### Universal Debugging Process
1. **Define the Problem**: Specific, measurable symptoms
2. **Collect Evidence**: Error messages, logs, behavior patterns
3. **Form Hypotheses**: Based on evidence, not assumptions
4. **Test Systematically**: One variable at a time
5. **Validate Solutions**: Confirm the fix addresses root cause
6. **Extract Principles**: Identify patterns applicable to future problems

### Prime Debugging Principles
- **Parameter Mapping**: Always verify data transformations match expected formats
- **Interface Contracts**: Validate inputs/outputs at system boundaries
- **Evidence Over Assumption**: Debug with concrete data, not theories
- **Systematic Over Random**: Follow methodical processes, avoid trial-and-error
- **Root Cause Focus**: Fix underlying issues, not just symptoms

## Coding Standards
- Use TypeScript with strict typing
- Follow Next.js best practices
- Implement responsive design with Tailwind CSS
- Maintain clean component architecture
- Prioritize performance and user experience
