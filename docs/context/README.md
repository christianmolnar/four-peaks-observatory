# Context Management System for AI Agents

## Overview
This system provides persistent context storage and retrieval for AI agents working on the Maple Valley Observatory project. It helps maintain conversation continuity across VS Code restarts and chat session interruptions.

## Directory Structure
```
docs/context/
├── README.md                 # This file
├── active-sessions/          # Current work sessions
│   ├── session-YYYYMMDD-HHMM.json
│   └── current-context.json  # Latest session context
├── project-state/           # Project state snapshots
│   ├── current-issues.json
│   ├── recent-changes.json
│   └── work-in-progress.json
├── conversation-history/    # Chat summaries
│   ├── YYYYMMDD-summary.md
│   └── key-decisions.json
└── agent-memory/           # Agent-specific memory
    ├── debugging-patterns.json
    ├── solved-problems.json
    └── code-patterns.json
```

## Usage for AI Agents

### 1. Loading Context on Session Start
```markdown
When starting a new chat session, agents should:
1. Read `docs/context/active-sessions/current-context.json`
2. Review `docs/context/project-state/current-issues.json`
3. Check `docs/context/conversation-history/` for recent summaries
4. Load relevant patterns from `docs/context/agent-memory/`
```

### 2. Saving Context During Work
```markdown
Agents should update context files when:
- Solving significant problems
- Making important code changes
- Discovering new patterns or solutions
- Completing major tasks
- Before the user might restart VS Code
```

### 3. Context File Formats
See individual files for specific schemas and examples.

## Implementation

### For Users
- Context is automatically maintained by AI agents
- No manual intervention required
- Context persists across VS Code restarts and system issues

### For AI Agents
- Always check for existing context on session start
- Update context files as work progresses
- Follow the schemas defined in this system
- Use context to provide continuity across sessions

## Benefits
- **Session Continuity**: Pick up where you left off after interruptions
- **Knowledge Retention**: Learn from previous solutions and patterns
- **Debugging History**: Track what's been tried and what worked
- **Project State Awareness**: Understand current project status immediately
- **Pattern Recognition**: Apply successful solutions to similar problems
