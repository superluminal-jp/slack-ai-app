#!/bin/bash
# Pre-commit validation hook
# Comprehensive checks before committing changes

set -e

echo "🔍 Running pre-commit validation..."
echo ""

ERRORS=0
WARNINGS=0

# Function to check if file exists and has content
check_file_updated() {
    local file=$1
    local description=$2
    
    if [ ! -f "$file" ]; then
        echo "❌ $description not found: $file"
        ERRORS=$((ERRORS + 1))
        return 1
    fi
    
    # Check if file was modified recently (within last 24 hours or in staged changes)
    if git diff --cached --name-only 2>/dev/null | grep -q "^$file$"; then
        echo "✓ $description updated: $file"
        return 0
    elif [ -f "$file" ]; then
        # Check if file was modified in last 24 hours
        if [ "$(find "$file" -mtime -1 2>/dev/null)" ]; then
            echo "✓ $description recently modified: $file"
            return 0
        fi
    fi
    
    return 1
}

# Check 1: Documentation synchronization
echo "📝 Checking documentation..."

# Check if code files changed
CODE_CHANGED=$(git diff --cached --name-only 2>/dev/null | grep -E '\.(ts|js|py|rs|go|java)$' | wc -l)

if [ "$CODE_CHANGED" -gt 0 ]; then
    echo "  Code files changed: $CODE_CHANGED"
    
    # Check if CHANGELOG updated
    if ! check_file_updated "CHANGELOG.md" "CHANGELOG"; then
        echo "  ⚠️  Warning: Code changed but CHANGELOG not updated"
        echo "     Run: /update-changelog"
        WARNINGS=$((WARNINGS + 1))
    fi
    
    # Check if README might need update
    if git diff --cached --name-only 2>/dev/null | grep -qE 'package\.json|requirements\.txt|Cargo\.toml'; then
        if ! check_file_updated "README.md" "README"; then
            echo "  ⚠️  Warning: Dependencies changed, consider updating README"
            echo "     Run: /update-readme"
            WARNINGS=$((WARNINGS + 1))
        fi
    fi
fi

echo ""

# Check 2: Test files
echo "🧪 Checking tests..."

if [ "$CODE_CHANGED" -gt 0 ]; then
    # Look for test files
    TEST_FILES=$(git diff --cached --name-only 2>/dev/null | grep -E 'test|spec' | wc -l)
    
    if [ "$TEST_FILES" -eq 0 ]; then
        echo "  ⚠️  Warning: Code changed but no test files modified"
        echo "     Consider adding tests for new functionality"
        WARNINGS=$((WARNINGS + 1))
    else
        echo "  ✓ Test files updated: $TEST_FILES"
    fi
fi

echo ""

# Check 3: Syntax validation
echo "🔧 Checking syntax..."

SYNTAX_OK=true

# Check JSON files
for file in $(git diff --cached --name-only 2>/dev/null | grep '\.json$'); do
    if [ -f "$file" ]; then
        if command -v jq >/dev/null 2>&1; then
            if ! jq empty "$file" 2>/dev/null; then
                echo "  ❌ Invalid JSON: $file"
                ERRORS=$((ERRORS + 1))
                SYNTAX_OK=false
            fi
        fi
    fi
done

# Check YAML files
for file in $(git diff --cached --name-only 2>/dev/null | grep -E '\.(yaml|yml)$'); do
    if [ -f "$file" ]; then
        if command -v yamllint >/dev/null 2>&1; then
            if ! yamllint "$file" >/dev/null 2>&1; then
                echo "  ⚠️  YAML lint warnings: $file"
                WARNINGS=$((WARNINGS + 1))
            fi
        fi
    fi
done

if $SYNTAX_OK; then
    echo "  ✓ Syntax checks passed"
fi

echo ""

# Check 4: File size warnings
echo "📦 Checking file sizes..."

LARGE_FILES=$(git diff --cached --name-only 2>/dev/null | while read file; do
    if [ -f "$file" ]; then
        size=$(wc -c < "$file" 2>/dev/null || echo 0)
        if [ "$size" -gt 1048576 ]; then  # > 1MB
            echo "$file ($(($size / 1024))KB)"
        fi
    fi
done)

if [ -n "$LARGE_FILES" ]; then
    echo "  ⚠️  Warning: Large files detected:"
    echo "$LARGE_FILES" | sed 's/^/     /'
    echo "     Consider: Git LFS, compression, or exclusion"
    WARNINGS=$((WARNINGS + 1))
else
    echo "  ✓ No unusually large files"
fi

echo ""

# Check 5: Sensitive data detection
echo "🔒 Checking for sensitive data..."

SENSITIVE_PATTERNS=(
    "api[_-]?key"
    "secret[_-]?key"
    "password"
    "private[_-]?key"
    "aws[_-]?secret"
    "BEGIN RSA PRIVATE KEY"
)

SENSITIVE_FOUND=false

for pattern in "${SENSITIVE_PATTERNS[@]}"; do
    if git diff --cached 2>/dev/null | grep -iE "$pattern" >/dev/null; then
        if ! $SENSITIVE_FOUND; then
            echo "  ⚠️  Warning: Potential sensitive data detected"
            SENSITIVE_FOUND=true
        fi
        echo "     Pattern found: $pattern"
        WARNINGS=$((WARNINGS + 1))
    fi
done

if ! $SENSITIVE_FOUND; then
    echo "  ✓ No obvious sensitive data detected"
fi

echo ""

# Summary
echo "═══════════════════════════════════════"
echo "Validation Summary"
echo "═══════════════════════════════════════"

if [ $ERRORS -gt 0 ]; then
    echo "❌ Errors: $ERRORS"
fi

if [ $WARNINGS -gt 0 ]; then
    echo "⚠️  Warnings: $WARNINGS"
fi

if [ $ERRORS -eq 0 ] && [ $WARNINGS -eq 0 ]; then
    echo "✅ All checks passed!"
fi

echo ""

# Exit with error if critical issues found
if [ $ERRORS -gt 0 ]; then
    echo "❌ Please fix errors before committing"
    exit 1
fi

if [ $WARNINGS -gt 3 ]; then
    echo "⚠️  Multiple warnings detected. Review before committing."
fi

echo "✓ Pre-commit validation complete"
exit 0
