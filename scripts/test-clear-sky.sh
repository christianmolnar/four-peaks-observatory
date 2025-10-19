#!/bin/bash

echo "🔍 Testing Clear Sky Chart Analysis API..."
echo ""

# Test the Dyersburg chart URL
CHART_URL="http://www.cleardarksky.com/c/DyrsbrgTNcsk.gif?c=928805"

echo "📊 Analyzing chart: $CHART_URL"
echo ""

# Test the API endpoint
curl -X POST http://localhost:3000/api/test-clear-sky \
  -H "Content-Type: application/json" \
  -d "{\"chartUrl\": \"$CHART_URL\"}" \
  | jq '.'

echo ""
echo "✨ Test completed!"
