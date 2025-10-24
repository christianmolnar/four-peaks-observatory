# AI Agents Instructions - Arizona Observatory Project

## Universal Agent Guidelines

All AI agents working on this project must follow these core principles:

### CRITICAL FILE ORGANIZATION RULES
- **NEVER create files in root directory** except agent files (AGENTS.md, CLAUDE.md, GEMINI.md)
- **Documentation** → `/docs/project/`, `/docs/development/`, `/docs/setup/`
- **Test files** → `/tests/` directory (NOT `/docs/testing/`)
- **Scripts** → `/scripts/` directory
- **Assets** → `/public/assets/` directory
- **Context files** → `/docs/context/` directory (MANDATORY for session continuity)
- **Always check existing directory structure before creating files**

### MANDATORY CONTEXT LOADING
**FIRST ACTION**: Every AI agent MUST load existing context before beginning work:
```bash
# Quick context check - agents should understand this information
./scripts/agent-context.sh load
```
**Key files to check**:
- `docs/context/active-sessions/current-context.json` - Current work session
- `docs/context/project-state/current-issues.json` - Active problems  
- `docs/context/project-state/recent-changes.json` - What's been done recently

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

## Context Management System

### Loading Context on Session Start
**MANDATORY**: All agents must check for existing context before beginning work:

1. **Read current context**: `docs/context/active-sessions/current-context.json`
2. **Check project state**: `docs/context/project-state/current-issues.json` 
3. **Review recent changes**: `docs/context/project-state/recent-changes.json`
4. **Load conversation history**: `docs/context/conversation-history/[latest].md`
5. **Apply learned patterns**: `docs/context/agent-memory/debugging-patterns.json`

### Updating Context During Work
**REQUIRED**: Update context files when:
- Solving significant problems
- Making important code changes  
- Discovering new patterns or solutions
- Before user might restart VS Code (freeze issues)
- Completing major tasks

### Context File Locations
```
docs/context/
├── active-sessions/current-context.json    # Current work session
├── project-state/current-issues.json      # Active problems
├── project-state/recent-changes.json      # Recent modifications
├── conversation-history/YYYY-MM-DD-summary.md # Chat summaries
└── agent-memory/debugging-patterns.json   # Learned solutions
```

## Agent Behavior

### Session Continuity
- **Always load context first** - Check existing context before asking questions
- **Maintain conversation flow** - Reference previous work and decisions
- **Update context proactively** - Don't wait for session end
- **Handle interruptions gracefully** - Prepare for VS Code freezes/restarts

### Communication
- Be direct and practical
- Focus on observatory automation goals
- Provide actionable technical solutions
- Consider both immediate needs and long-term automation objectives
- Reference previous context when relevant

### Problem Solving
- **Apply evidence-based debugging** using stored patterns
- Understand the astronomical context
- Consider equipment limitations and upgrade paths
- Balance cost vs. automation benefits
- Think in terms of unattended operation requirements
- **Learn from previous solutions** in agent memory

## Success Criteria
The system should enable:
- Automated observation planning based on weather and sky conditions
- Equipment control without manual intervention
- Complete astrophotography sessions from sunset to sunrise
- Remote monitoring and control capabilities

Every development decision should advance the goal of fully automated, unattended observatory operations.
