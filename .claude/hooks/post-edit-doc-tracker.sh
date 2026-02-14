#!/bin/bash
# Post-edit documentation tracker hook (PostToolUse)
# Tracks source code file edits in a session-level accumulator
# and periodically reminds about documentation updates.
# Input: JSON on stdin (tool_input.path or tool_input.file_path)

set -e

# --- Parse file path from hook input ---
FILE_PATH=""
if [ ! -t 0 ]; then
    HOOK_INPUT="$(cat 2>/dev/null || true)"
    if [ -n "$HOOK_INPUT" ] && command -v jq >/dev/null 2>&1; then
        FILE_PATH="$(echo "$HOOK_INPUT" | jq -r '.tool_input.path // .tool_input.file_path // empty' 2>/dev/null || true)"
    fi
fi
[ -z "$FILE_PATH" ] && FILE_PATH="${CLAUDE_TOOL_INPUT_PATH:-}"

if [ -z "$FILE_PATH" ]; then
    exit 0
fi

# --- Check if this is a source code file ---
is_source_code() {
    local f="$1"
    case "$f" in
        *.ts|*.tsx|*.js|*.jsx|*.py|*.rs|*.go|*.java|*.c|*.cpp|*.h|*.hpp|*.rb|*.php|*.swift|*.kt)
            return 0
            ;;
        *)
            return 1
            ;;
    esac
}

# --- Exclude non-source paths ---
is_excluded_path() {
    local f="$1"
    case "$f" in
        */docs/*|*/doc/*|*/.claude/*|*/.speckit/*|*/.git/*|*/node_modules/*|*/vendor/*|*/dist/*|*/build/*)
            return 0
            ;;
        *test*.*|*spec*.*|*Test*.*|*Spec*.*)
            return 0
            ;;
        *.md|*.json|*.yaml|*.yml|*.toml|*.lock|*.cfg|*.ini|*.env*)
            return 0
            ;;
        *)
            return 1
            ;;
    esac
}

# Skip if not a source code file or is in excluded path
if ! is_source_code "$FILE_PATH" || is_excluded_path "$FILE_PATH"; then
    exit 0
fi

# --- Session tracker ---
PROJECT_HASH=$(echo "${CLAUDE_PROJECT_DIR:-$PWD}" | cksum | cut -d' ' -f1)
TRACKER_FILE="/tmp/.claude-doc-tracker-${PROJECT_HASH}"

# Reset stale tracker (older than 24 hours)
if [ -f "$TRACKER_FILE" ]; then
    TRACKER_AGE=$(( $(date +%s) - $(stat -c %Y "$TRACKER_FILE" 2>/dev/null || echo 0) ))
    if [ "$TRACKER_AGE" -gt 86400 ]; then
        : > "$TRACKER_FILE"
    fi
fi

# Append this file to tracker
echo "$FILE_PATH" >> "$TRACKER_FILE"

# Count unique source files edited this session
UNIQUE_COUNT=$(sort -u "$TRACKER_FILE" | wc -l)

# --- Emit reminders periodically (1st edit, then every 3rd) ---
should_remind() {
    local count=$1
    if [ "$count" -eq 1 ] || [ $(( count % 3 )) -eq 0 ]; then
        return 0
    fi
    return 1
}

if should_remind "$UNIQUE_COUNT"; then
    echo ""
    echo "📝 Doc Reminder: ${UNIQUE_COUNT} source file(s) edited this session"
    echo "   Remember to update CHANGELOG.md before committing"

    # Context-specific hints
    case "$FILE_PATH" in
        */api/*|*/routes/*|*/endpoints/*|*/handlers/*)
            echo "   → API code changed: also update docs/api/"
            ;;
    esac

    case "$FILE_PATH" in
        */index.*|*/main.*|*/app.*|*/server.*)
            echo "   → Core file changed: consider updating README.md"
            ;;
    esac

    echo ""
fi

exit 0
