# AI Agents Instructions - Arizona Observatory Project

## Universal Agent Guidelines

All AI agents working on this project must follow these core principles:

### CRITICAL FILE ORGANIZATION RULES
- **NEVER create files in root directory** except agent files (AGENTS.md, CLAUDE.md, GEMINI.md)
- **Documentation** → `/docs/project/`, `/docs/development/`, `/docs/setup/`
- **Test files** → `/tests/` directory (NOT `/docs/testing/`)
- **Scripts** → `/scripts/` directory
- **Assets** → `/public/assets/` directory
- **Always check existing directory structure before creating files**

### Critical Server Management Rules
- **NEVER start development servers automatically** (npm run dev, npm start, etc.)
- **NEVER restart servers** without explicit user permission
- **ALWAYS end work sessions with**: "Changes complete. Please restart your server to see the updates."
- Respect user's preference for manual server lifecycle control

### Code Complexity Philosophy
- **Simplify, don't complicate** - Remove unnecessary steps
- **Direct solutions preferred** - Avoid stacking conversions
- **Question every transformation** - Eliminate intermediate steps
- **Readable over clever** - Clear TypeScript code

## Evidence-Based Systematic Debugging

### Meta-Prime Principles
Apply these universal debugging principles to any technical problem:

1. **Evidence Collection First**: Gather concrete data before forming theories
2. **Systematic Validation**: Test hypotheses methodically, one at a time
3. **Root Cause Analysis**: Trace issues to fundamental sources, not symptoms
4. **Pattern Recognition**: Extract transferable principles from specific cases
5. **Documentation**: Record findings for future application

### Universal Debugging Process
1. **Define Problem**: Specific, measurable symptoms
2. **Collect Evidence**: Error messages, logs, actual vs expected behavior
3. **Form Hypotheses**: Based on evidence, not assumptions
4. **Test Systematically**: Isolate variables, controlled testing
5. **Validate Solutions**: Confirm fixes address root causes
6. **Extract Principles**: Identify patterns applicable beyond current case

### Key Debugging Principles
- **Parameter Mapping Verification**: Always validate data transformations (e.g., `seeing` vs `seeingRating`)
- **Interface Contract Validation**: Check inputs/outputs at system boundaries
- **Evidence Over Assumption**: Debug with concrete data, not theories
- **Systematic Over Random**: Follow methodical processes, avoid trial-and-error
- **Root Cause Focus**: Fix underlying issues, not just symptoms

### Meta-Learning Framework
When solving any problem:
1. **Document the specific solution** (what worked)
2. **Extract the universal pattern** (why it worked)
3. **Identify application domains** (where else it applies)
4. **Formalize the principle** (how to apply it generally)
5. **Validate transferability** (test in different contexts)

## Project Context: Automated Observatory

### Mission
Create a fully automated astrophotography system that operates unattended from sunset to sunrise in the Phoenix area.

### Current Challenge
- Existing Meade LX75 mount requires manual polar alignment each session
- Goal: Achieve true unattended operation through equipment upgrades and software

### Solution Paths
1. **ZWO ASIAir Plus System**: Complete automation ($2000-3000 investment)
2. **NINA Software Solution**: Work with existing equipment ($300-500 investment)  
3. **Progressive Upgrade**: Phased approach over time

## Technical Foundation

### Technology Stack
- **Framework**: Next.js 14 with App Router
- **Language**: TypeScript throughout
- **Styling**: Tailwind CSS with design tokens
- **Build Tool**: Standard Next.js toolchain

### Project Structure
```
src/
├── app/           # Next.js App Router
├── components/    # React components
├── config/        # Configuration
└── styles/        # CSS and design tokens
public/
└── images/        # Observatory photos
```

### Key Features
- Weather monitoring and Clear Sky Chart integration
- Observation planning and scheduling
- Equipment control interfaces
- Phoenix area astronomical condition tracking

## Development Standards

### Code Quality
- Use TypeScript with strict typing
- Follow Next.js 14 best practices
- Implement responsive design patterns
- Maintain clean component architecture
- Optimize for performance

### Build Process
- `npm install` - Install dependencies
- `npm run build` - Production build
- `npm run dev` - Development server (user-controlled only)
- `npm run lint` - Code quality checks

## Agent Behavior

### Communication
- Be direct and practical
- Focus on observatory automation goals
- Provide actionable technical solutions
- Consider both immediate needs and long-term automation objectives

### Problem Solving
- Understand the astronomical context
- Consider equipment limitations and upgrade paths
- Balance cost vs. automation benefits
- Think in terms of unattended operation requirements

## Success Criteria
The system should enable:
- Automated observation planning based on weather and sky conditions
- Equipment control without manual intervention
- Complete astrophotography sessions from sunset to sunrise
- Remote monitoring and control capabilities

Every development decision should advance the goal of fully automated, unattended observatory operations.
