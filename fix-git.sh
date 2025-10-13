#!/bin/bash

# Force quit any running git processes
killall git 2>/dev/null

# Reset git to a clean state
git reset --hard HEAD~3

# Remove the problematic test file
rm -f tests/sms-service.test.ts

# Rename the clean test file
mv tests/sms-service-clean.test.ts tests/sms-service.test.ts

# Add all changes
git add .

# Commit with clean changes
git commit -m "Add SMS automation with clean test credentials"

echo "Git history cleaned successfully"
