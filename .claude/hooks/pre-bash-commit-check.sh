#!/bin/bash
# Pre-Bash commit check hook (PreToolUse, matcher: Bash)
# Intercepts git commit commands and blocks when documentation is not updated.
# Input: JSON on stdin with tool_input.command
# Exit 0 = allow, Exit 2 + JSON stderr = block

set -e

# --- Parse command from hook input ---
COMMAND=""
if [ ! -t 0 ]; then
    HOOK_INPUT="$(cat 2>/dev/null || true)"
    if [ -n "$HOOK_INPUT" ] && command -v jq >/dev/null 2>&1; then
        COMMAND="$(echo "$HOOK_INPUT" | jq -r '.tool_input.command // empty' 2>/dev/null || true)"
    fi
fi
[ -z "$COMMAND" ] && COMMAND="${CLAUDE_TOOL_INPUT_COMMAND:-}"

# --- Early exit for non-commit commands ---
if ! echo "$COMMAND" | grep -qE 'git\s+commit\b'; then
    exit 0
fi

# --- Allow --no-verify bypass ---
if echo "$COMMAND" | grep -qE '\-\-no-verify'; then
    exit 0
fi

# --- Validate documentation for staged files ---
STAGED_CODE_FILES=$(git diff --cached --name-only --diff-filter=ACM 2>/dev/null | grep -E '\.(ts|tsx|js|jsx|py|rs|go|java|c|cpp|h|hpp|rb|php|swift|kt)$' || true)
STAGED_DOC_FILES=$(git diff --cached --name-only --diff-filter=ACM 2>/dev/null | grep -E '(README\.md|CHANGELOG\.md|docs/)' || true)

# If no code files staged, allow commit
if [ -z "$STAGED_CODE_FILES" ]; then
    exit 0
fi

CODE_FILE_COUNT=$(echo "$STAGED_CODE_FILES" | wc -l)
WARNINGS=()

# Check CHANGELOG.md
if ! echo "$STAGED_DOC_FILES" | grep -q "CHANGELOG\.md"; then
    WARNINGS+=("CHANGELOG.md not updated ($CODE_FILE_COUNT code file(s) staged)")
fi

# Check API docs
if echo "$STAGED_CODE_FILES" | grep -qE '(api|routes|endpoints|handlers)/'; then
    if ! echo "$STAGED_DOC_FILES" | grep -q "docs/"; then
        WARNINGS+=("API code changed but docs/ not updated")
    fi
fi

# Check README for core file changes
if echo "$STAGED_CODE_FILES" | grep -qE '(index|main|app|server)\.(ts|js|py|rs|go)'; then
    if ! echo "$STAGED_DOC_FILES" | grep -q "README\.md"; then
        WARNINGS+=("Core files changed but README.md not updated")
    fi
fi

# --- Block if warnings exist ---
if [ ${#WARNINGS[@]} -gt 0 ]; then
    # Build warning message
    WARNING_MSG="Documentation updates required before commit:\\n\\n"
    for w in "${WARNINGS[@]}"; do
        WARNING_MSG+="  - ${w}\\n"
    done
    WARNING_MSG+="\\nRemediation:\\n"
    WARNING_MSG+="  1. Update the relevant documentation files\\n"
    WARNING_MSG+="  2. Stage them: git add CHANGELOG.md README.md docs/\\n"
    WARNING_MSG+="  3. Re-run git commit\\n"
    WARNING_MSG+="\\nTo bypass: add --no-verify to the commit command."

    # Output block JSON to stderr (Claude Code hook protocol)
    echo "{\"decision\":\"block\",\"reason\":\"$(echo -e "$WARNING_MSG")\"}" >&2
    exit 2
fi

echo "Documentation validation passed"
exit 0
