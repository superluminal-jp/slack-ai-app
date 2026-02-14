#!/bin/bash
# Post-edit formatting hook
# Runs after any Edit/Write tool use
# Input: JSON on stdin (tool_input.path or tool_input.file_path); fallback: CLAUDE_TOOL_INPUT_PATH

set -e

FILE_PATH=""
if [ ! -t 0 ]; then
    HOOK_INPUT="$(cat 2>/dev/null || true)"
    if [ -n "$HOOK_INPUT" ] && command -v jq >/dev/null 2>&1; then
        FILE_PATH="$(echo "$HOOK_INPUT" | jq -r '.tool_input.path // .tool_input.file_path // empty' 2>/dev/null || true)"
    fi
fi
[ -z "$FILE_PATH" ] && FILE_PATH="${CLAUDE_TOOL_INPUT_PATH:-}"

if [ -z "$FILE_PATH" ]; then
    echo "✓ Edit complete"
    exit 0
fi

echo "✓ File edited: $FILE_PATH"

# Auto-format based on file type
case "$FILE_PATH" in
    *.js|*.jsx|*.ts|*.tsx|*.json|*.css|*.scss|*.html)
        if command -v prettier >/dev/null 2>&1; then
            if [ -f "$FILE_PATH" ]; then
                echo "  Formatting with prettier..."
                prettier --write "$FILE_PATH" 2>/dev/null || true
            fi
        fi
        ;;
    *.py)
        if command -v black >/dev/null 2>&1; then
            if [ -f "$FILE_PATH" ]; then
                echo "  Formatting with black..."
                black "$FILE_PATH" 2>/dev/null || true
            fi
        fi
        ;;
    *.rs)
        if command -v rustfmt >/dev/null 2>&1; then
            if [ -f "$FILE_PATH" ]; then
                echo "  Formatting with rustfmt..."
                rustfmt "$FILE_PATH" 2>/dev/null || true
            fi
        fi
        ;;
    *.go)
        if command -v gofmt >/dev/null 2>&1; then
            if [ -f "$FILE_PATH" ]; then
                echo "  Formatting with gofmt..."
                gofmt -w "$FILE_PATH" 2>/dev/null || true
            fi
        fi
        ;;
esac

# Quick syntax check
case "$FILE_PATH" in
    *.json)
        if command -v jq >/dev/null 2>&1; then
            if ! jq empty "$FILE_PATH" 2>/dev/null; then
                echo "  ⚠️  Warning: JSON syntax may be invalid"
            fi
        fi
        ;;
    *.yaml|*.yml)
        if command -v yamllint >/dev/null 2>&1; then
            yamllint "$FILE_PATH" 2>/dev/null || true
        fi
        ;;
esac

# Suggest next steps based on file type
case "$FILE_PATH" in
    *test*.*)
        echo "  → Run tests: npm test (or appropriate test command)"
        ;;
    */src/*|*/lib/*|*/api/*|*/routes/*|*/handlers/*)
        echo "  → Consider running tests for affected modules"
        echo "  → Remember: update CHANGELOG.md before committing"
        ;;
    README.md|CHANGELOG.md)
        echo "  → Validate documentation: /validate-docs"
        ;;
    package.json|requirements.txt|Cargo.toml)
        echo "  → Install dependencies and test"
        echo "  → Update README.md if dependencies changed"
        ;;
esac

exit 0
