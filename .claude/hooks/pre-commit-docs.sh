#!/bin/bash
# Pre-commit hook: Validate documentation is updated with code changes

set -e

# Get staged files
STAGED_CODE_FILES=$(git diff --cached --name-only --diff-filter=ACM | grep -E '\.(ts|tsx|js|jsx|py)$' || true)
STAGED_DOC_FILES=$(git diff --cached --name-only --diff-filter=ACM | grep -E '(README\.md|CHANGELOG\.md|docs/)' || true)

# If no code files changed, skip
if [ -z "$STAGED_CODE_FILES" ]; then
  echo "✅ No code files changed, skipping documentation check"
  exit 0
fi

# Code files changed - check documentation
WARNINGS=()

# Check if CHANGELOG updated
if ! echo "$STAGED_DOC_FILES" | grep -q "CHANGELOG\.md"; then
  WARNINGS+=("⚠️  Code changed but CHANGELOG.md not updated")
fi

# Check if API files changed
if echo "$STAGED_CODE_FILES" | grep -qE 'src/api/'; then
  if ! echo "$STAGED_DOC_FILES" | grep -q "docs/api/"; then
    WARNINGS+=("⚠️  API code changed but docs/api/ not updated")
  fi
fi

# Check if major structure change
if echo "$STAGED_CODE_FILES" | grep -qE 'src/.*/(index|main)\.(ts|js|py)'; then
  if ! echo "$STAGED_DOC_FILES" | grep -q "README\.md"; then
    WARNINGS+=("⚠️  Core files changed but README.md not updated")
  fi
fi

# Report warnings
if [ ${#WARNINGS[@]} -gt 0 ]; then
  echo ""
  echo "📝 Documentation Update Recommendations:"
  echo ""
  for warning in "${WARNINGS[@]}"; do
    echo "  $warning"
  done
  echo ""
  echo "Consider updating documentation before committing."
  echo "Run: git add [documentation files]"
  echo ""
  echo "To proceed anyway: git commit --no-verify"
  echo ""
  
  # Exit with warning (code 1) to block commit
  # Change to 'exit 0' if you want warnings only
  exit 1
fi

echo "✅ Documentation check passed"
exit 0
