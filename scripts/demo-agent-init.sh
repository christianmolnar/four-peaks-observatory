#!/bin/bash

# Example: How an AI Agent Should Load Context at Session Start
# This demonstrates the proper workflow for context-aware agents

echo "🤖 AI Agent Session Initialization"
echo "=================================="

CONTEXT_DIR="/Users/christian/Repos/MapleValleyObservatory/docs/context"

# Step 1: Load current session context
echo "📋 Loading current session context..."
if [ -f "$CONTEXT_DIR/active-sessions/current-context.json" ]; then
    CURRENT_ISSUE=$(jq -r '.currentIssue' "$CONTEXT_DIR/active-sessions/current-context.json")
    PRIMARY_GOAL=$(jq -r '.activeWork.primaryGoal' "$CONTEXT_DIR/active-sessions/current-context.json")
    CURRENT_PHASE=$(jq -r '.activeWork.currentPhase' "$CONTEXT_DIR/active-sessions/current-context.json")
    
    echo "  ✅ Current Issue: $CURRENT_ISSUE"
    echo "  ✅ Primary Goal: $PRIMARY_GOAL" 
    echo "  ✅ Current Phase: $CURRENT_PHASE"
else
    echo "  ❌ No current context found - starting fresh session"
    CURRENT_ISSUE="Unknown"
    PRIMARY_GOAL="Assess project state"
    CURRENT_PHASE="Discovery"
fi

# Step 2: Check for critical issues
echo ""
echo "🚨 Checking critical issues..."
if [ -f "$CONTEXT_DIR/project-state/current-issues.json" ]; then
    CRITICAL_COUNT=$(jq '.criticalIssues | length' "$CONTEXT_DIR/project-state/current-issues.json")
    echo "  ⚠️  Found $CRITICAL_COUNT critical issue(s)"
    
    if [ "$CRITICAL_COUNT" -gt 0 ]; then
        echo "  📋 Critical Issues:"
        jq -r '.criticalIssues[] | "    - \(.title) (\(.status))"' "$CONTEXT_DIR/project-state/current-issues.json"
    fi
else
    echo "  ❌ No critical issues file found"
fi

# Step 3: Review recent changes
echo ""
echo "📝 Reviewing recent changes..."
if [ -f "$CONTEXT_DIR/project-state/recent-changes.json" ]; then
    RECENT_COUNT=$(jq '.recentChanges | length' "$CONTEXT_DIR/project-state/recent-changes.json")
    echo "  📊 Found $RECENT_COUNT recent change(s)"
    
    if [ "$RECENT_COUNT" -gt 0 ]; then
        echo "  📋 Latest Changes:"
        jq -r '.recentChanges[0:3][] | "    - \(.description)"' "$CONTEXT_DIR/project-state/recent-changes.json"
    fi
else
    echo "  ❌ No recent changes file found"
fi

# Step 4: Load debugging patterns
echo ""
echo "🧠 Loading learned patterns..."
if [ -f "$CONTEXT_DIR/agent-memory/debugging-patterns.json" ]; then
    PATTERN_COUNT=$(jq '.debuggingPatterns | length' "$CONTEXT_DIR/agent-memory/debugging-patterns.json")
    echo "  🔍 Found $PATTERN_COUNT debugging pattern(s)"
    echo "  📚 Found $(jq '.solvedProblems | length' "$CONTEXT_DIR/agent-memory/debugging-patterns.json") solved problem(s)"
else
    echo "  ❌ No debugging patterns found"
fi

# Step 5: Generate agent initialization summary
echo ""
echo "🎯 Agent Initialization Complete"
echo "================================="
echo "Ready to assist with: $PRIMARY_GOAL"
echo "Current focus: $CURRENT_PHASE"
echo "Context loaded: ✅"
echo ""
echo "Agent should now:"
echo "1. Reference current issue: $CURRENT_ISSUE"
echo "2. Continue work on primary goal"
echo "3. Update context as work progresses"
echo "4. Apply learned patterns from memory"
echo ""
echo "🚀 Session ready to begin!"
