#!/bin/bash
cd /Users/christian/Repos/MapleValleyObservatory
git status 2>/dev/null
if [ -d ".git/rebase-merge" ]; then
  echo "Aborting rebase..."
  git rebase --abort 2>/dev/null
fi
echo "Current status:"
git status
