#!/bin/bash

# Test script for semantic release
# This script helps verify the release configuration locally

echo "🚀 Testing Semantic Release Configuration"
echo "========================================"

# Check if required packages are installed
echo "📦 Checking dependencies..."
if ! npm list semantic-release > /dev/null 2>&1; then
    echo "❌ semantic-release not installed"
    exit 1
fi

echo "✅ semantic-release installed"

# Check configuration
echo "📋 Checking configuration..."
if [ ! -f ".releaserc.json" ]; then
    echo "❌ .releaserc.json not found"
    exit 1
fi

echo "✅ .releaserc.json found"

# Dry run semantic release
echo "🧪 Running semantic-release in dry-run mode..."
npx semantic-release --dry-run

echo ""
echo "✅ Test completed!"
echo ""
echo "To perform an actual release, push to main branch with conventional commits:"
echo "  git commit -m 'feat: add new feature'"
echo "  git push origin main"
