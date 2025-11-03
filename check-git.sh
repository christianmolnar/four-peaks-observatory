#!/bin/bash

# 🔍 Git Repository Status Checker
# Maple Valley Observatory Project

echo "🔍 Git Repository Status Check"
echo "=============================="

# Check if we're in a git repository
if ! git rev-parse --git-dir > /dev/null 2>&1; then
    echo "❌ Not in a Git repository"
    exit 1
fi

# Current branch
echo "📍 Current Branch:"
git branch --show-current

echo ""

# Repository status
echo "📊 Repository Status:"
git status --porcelain | head -20

echo ""

# Recent commits
echo "📜 Recent Commits:"
git log --oneline -5

echo ""

# Check for uncommitted changes
if [ -n "$(git status --porcelain)" ]; then
    echo "⚠️  You have uncommitted changes"
    echo "📝 Files changed:"
    git status --short
else
    echo "✅ Working directory is clean"
fi

echo ""

# Check for unpushed commits
UNPUSHED=$(git log @{u}.. --oneline 2>/dev/null)
if [ -n "$UNPUSHED" ]; then
    echo "📤 Unpushed commits:"
    echo "$UNPUSHED"
else
    echo "✅ All commits are pushed"
fi

echo ""

# Remote information
echo "🌐 Remote Information:"
git remote -v

echo ""
echo "✅ Git status check complete!"
