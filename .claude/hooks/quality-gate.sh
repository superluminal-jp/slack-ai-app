#!/bin/bash
# Quality gate hook
# Automated quality checks on code changes

set -e

echo "🎯 Running quality gate checks..."
echo ""

PASSED=0
FAILED=0
SKIPPED=0

run_check() {
    local name=$1
    local command=$2
    
    echo -n "  $name... "
    
    if eval "$command" >/dev/null 2>&1; then
        echo "✓"
        PASSED=$((PASSED + 1))
        return 0
    else
        echo "✗"
        FAILED=$((FAILED + 1))
        return 1
    fi
}

skip_check() {
    local name=$1
    local reason=$2
    
    echo "  $name... ⊘ (skipped: $reason)"
    SKIPPED=$((SKIPPED + 1))
}

# TypeScript/JavaScript checks
if [ -f "package.json" ]; then
    echo "JavaScript/TypeScript:"
    
    if [ -f "tsconfig.json" ]; then
        if command -v tsc >/dev/null 2>&1; then
            run_check "TypeScript compilation" "tsc --noEmit"
        else
            skip_check "TypeScript compilation" "tsc not found"
        fi
    fi
    
    if command -v eslint >/dev/null 2>&1; then
        run_check "ESLint" "eslint . --ext .js,.jsx,.ts,.tsx --max-warnings 0"
    else
        skip_check "ESLint" "eslint not found"
    fi
    
    if command -v prettier >/dev/null 2>&1; then
        run_check "Prettier formatting" "prettier --check ."
    else
        skip_check "Prettier formatting" "prettier not found"
    fi
    
    if npm run test --if-present >/dev/null 2>&1; then
        run_check "Unit tests" "npm test"
    else
        skip_check "Unit tests" "no test script"
    fi
    
    echo ""
fi

# Python checks
if [ -f "requirements.txt" ] || [ -f "pyproject.toml" ]; then
    echo "Python:"
    
    if command -v black >/dev/null 2>&1; then
        run_check "Black formatting" "black --check ."
    else
        skip_check "Black formatting" "black not found"
    fi
    
    if command -v ruff >/dev/null 2>&1; then
        run_check "Ruff linting" "ruff check ."
    elif command -v flake8 >/dev/null 2>&1; then
        run_check "Flake8 linting" "flake8 ."
    else
        skip_check "Python linting" "ruff/flake8 not found"
    fi
    
    if command -v mypy >/dev/null 2>&1; then
        run_check "MyPy type checking" "mypy ."
    else
        skip_check "MyPy type checking" "mypy not found"
    fi
    
    if command -v pytest >/dev/null 2>&1; then
        run_check "Pytest" "pytest"
    else
        skip_check "Pytest" "pytest not found"
    fi
    
    echo ""
fi

# Rust checks
if [ -f "Cargo.toml" ]; then
    echo "Rust:"
    
    if command -v cargo >/dev/null 2>&1; then
        run_check "Cargo build" "cargo build"
        run_check "Cargo clippy" "cargo clippy -- -D warnings"
        run_check "Cargo test" "cargo test"
        run_check "Cargo fmt" "cargo fmt -- --check"
    else
        skip_check "Rust checks" "cargo not found"
    fi
    
    echo ""
fi

# Go checks
if [ -f "go.mod" ]; then
    echo "Go:"
    
    if command -v go >/dev/null 2>&1; then
        run_check "Go build" "go build ./..."
        run_check "Go test" "go test ./..."
        run_check "Go vet" "go vet ./..."
        run_check "Go fmt" "test -z \$(gofmt -l .)"
    else
        skip_check "Go checks" "go not found"
    fi
    
    echo ""
fi

# Security checks
echo "Security:"

if command -v git >/dev/null 2>&1; then
    # Check for secrets
    if git diff --cached 2>/dev/null | grep -iE 'api[_-]?key|secret[_-]?key|password|private[_-]?key' >/dev/null; then
        echo "  Secret detection... ⚠️  (potential secrets found)"
        FAILED=$((FAILED + 1))
    else
        echo "  Secret detection... ✓"
        PASSED=$((PASSED + 1))
    fi
fi

echo ""

# Summary
echo "═══════════════════════════════════════"
echo "Quality Gate Summary"
echo "═══════════════════════════════════════"
echo "  Passed:  $PASSED"
echo "  Failed:  $FAILED"
echo "  Skipped: $SKIPPED"
echo ""

if [ $FAILED -gt 0 ]; then
    echo "❌ Quality gate FAILED"
    echo "   Fix issues above before proceeding"
    exit 1
else
    echo "✅ Quality gate PASSED"
fi

exit 0
