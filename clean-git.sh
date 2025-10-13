#!/bin/bash

# Clean up any git rebase state
rm -rf .git/rebase-merge 2>/dev/null
rm -rf .git/rebase-apply 2>/dev/null

# Reset to HEAD to clean state
git reset --hard HEAD 2>/dev/null

# Show current status
echo "Git status after cleanup:"
git status

echo "Ready for VS Code operations!"
