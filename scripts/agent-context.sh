#!/bin/bash

# Context Management Helper Script for AI Agents
# This script helps agents quickly load and update project context

CONTEXT_DIR="/Users/christian/Repos/MapleValleyObservatory/docs/context"

show_help() {
    echo "🤖 AI Agent Context Management Helper"
    echo ""
    echo "Usage: $0 [command]"
    echo ""
    echo "Commands:"
    echo "  load     - Display current context for agent loading"
    echo "  update   - Update current context (interactive)"
    echo "  summary  - Show current session summary"
    echo "  history  - Show recent conversation history"
    echo "  issues   - Show current project issues"
    echo "  help     - Show this help message"
    echo ""
}

load_context() {
    echo "📋 Current Session Context"
    echo "=========================="
    if [ -f "$CONTEXT_DIR/active-sessions/current-context.json" ]; then
        echo "Current Issue:" $(jq -r '.currentIssue' "$CONTEXT_DIR/active-sessions/current-context.json")
        echo "Active Work:" $(jq -r '.activeWork.primaryGoal' "$CONTEXT_DIR/active-sessions/current-context.json")
        echo "Phase:" $(jq -r '.activeWork.currentPhase' "$CONTEXT_DIR/active-sessions/current-context.json")
        echo ""
        echo "Next Actions:"
        jq -r '.activeWork.nextActions[]' "$CONTEXT_DIR/active-sessions/current-context.json" | sed 's/^/  - /'
    else
        echo "❌ No current context found"
    fi
    
    echo ""
    echo "🚨 Critical Issues"
    echo "=================="
    if [ -f "$CONTEXT_DIR/project-state/current-issues.json" ]; then
        jq -r '.criticalIssues[] | "- \(.title) (\(.status))"' "$CONTEXT_DIR/project-state/current-issues.json"
    fi
    
    echo ""
    echo "📝 Recent Changes"
    echo "================="
    if [ -f "$CONTEXT_DIR/project-state/recent-changes.json" ]; then
        jq -r '.recentChanges[0:3][] | "- \(.description) (\(.files[0]))"' "$CONTEXT_DIR/project-state/recent-changes.json"
    fi
}

show_issues() {
    echo "🚨 Current Project Issues"
    echo "========================="
    if [ -f "$CONTEXT_DIR/project-state/current-issues.json" ]; then
        jq -r '.criticalIssues[] | "\(.title)\n  Status: \(.status)\n  Cause: \(.rootCause)\n  Impact: \(.impact)\n"' "$CONTEXT_DIR/project-state/current-issues.json"
    fi
}

show_summary() {
    echo "📊 Session Summary"
    echo "=================="
    if [ -f "$CONTEXT_DIR/conversation-history/2025-10-22-summary.md" ]; then
        head -20 "$CONTEXT_DIR/conversation-history/2025-10-22-summary.md"
        echo ""
        echo "... (see full file for complete summary)"
    fi
}

update_context() {
    echo "📝 Update Context (Manual editing)"
    echo "================================="
    echo "Context files to edit:"
    echo "1. Current session: $CONTEXT_DIR/active-sessions/current-context.json"
    echo "2. Project issues: $CONTEXT_DIR/project-state/current-issues.json" 
    echo "3. Recent changes: $CONTEXT_DIR/project-state/recent-changes.json"
    echo ""
    echo "Use your preferred editor to update these files with new information."
}

case "$1" in
    "load")
        load_context
        ;;
    "issues")
        show_issues
        ;;
    "summary")
        show_summary
        ;;
    "update")
        update_context
        ;;
    "help"|"")
        show_help
        ;;
    *)
        echo "❌ Unknown command: $1"
        show_help
        exit 1
        ;;
esac
