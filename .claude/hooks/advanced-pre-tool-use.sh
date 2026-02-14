#!/bin/bash
# Advanced pre-tool-use hook
# Comprehensive validation before tool execution
# Input: JSON on stdin (tool_name, tool_input); fallback: CLAUDE_TOOL_* env vars.
# When blocking: use exit 2 and write reason to stderr (do not mix JSON on stdout with exit 2).

set -e

TOOL_NAME=""
FILE_PATH=""
COMMAND=""
if [ ! -t 0 ]; then
    HOOK_INPUT="$(cat 2>/dev/null || true)"
    if [ -n "$HOOK_INPUT" ] && command -v jq >/dev/null 2>&1; then
        TOOL_NAME="$(echo "$HOOK_INPUT" | jq -r '.tool_name // empty' 2>/dev/null || true)"
        FILE_PATH="$(echo "$HOOK_INPUT" | jq -r '.tool_input.path // .tool_input.file_path // empty' 2>/dev/null || true)"
        COMMAND="$(echo "$HOOK_INPUT" | jq -r '.tool_input.command // empty' 2>/dev/null || true)"
    fi
fi
[ -z "$TOOL_NAME" ] && TOOL_NAME="${CLAUDE_TOOL_NAME:-}"
[ -z "$FILE_PATH" ] && FILE_PATH="${CLAUDE_TOOL_INPUT_PATH:-}"
[ -z "$COMMAND" ] && COMMAND="${CLAUDE_TOOL_INPUT_COMMAND:-}"

# Exit early if no tool name
if [ -z "$TOOL_NAME" ]; then
    exit 0
fi

# Check for dangerous Bash commands
if [ "$TOOL_NAME" = "Bash" ]; then
    # Block dangerous commands
    DANGEROUS_PATTERNS=(
        "rm -rf /"
        "rm -rf \*"
        "> /dev/sda"
        "mkfs"
        "dd if=/dev/zero"
        ":(){ :|:& };:"  # Fork bomb
    )
    
    for pattern in "${DANGEROUS_PATTERNS[@]}"; do
        if echo "$COMMAND" | grep -qF "$pattern"; then
            echo '{
                "block": true,
                "message": "❌ Dangerous command blocked: '"$pattern"'\n\nThis command could cause system damage."
            }' >&2
            exit 2
        fi
    done
    
    # Warn for potentially risky commands
    RISKY_PATTERNS=(
        "rm -rf"
        "sudo rm"
        "chmod -R 777"
        "curl.*|.*sh"
        "wget.*|.*sh"
    )
    
    for pattern in "${RISKY_PATTERNS[@]}"; do
        if echo "$COMMAND" | grep -qE "$pattern"; then
            echo "⚠️  Warning: Potentially risky command detected: $pattern"
            echo "   Review command carefully: $COMMAND"
        fi
    done
fi

# Check for Edit/Write on critical files
if [ "$TOOL_NAME" = "Edit" ] || [ "$TOOL_NAME" = "Write" ]; then
    if [ -n "$FILE_PATH" ]; then
        # Block editing .git directory
        if echo "$FILE_PATH" | grep -q "^\.git/"; then
            echo '{
                "block": true,
                "message": "❌ Cannot edit .git directory\n\nDirect modification of .git/ is not allowed."
            }' >&2
            exit 2
        fi
        
        # Block editing node_modules (should use package.json)
        if echo "$FILE_PATH" | grep -q "node_modules/"; then
            echo '{
                "block": true,
                "message": "❌ Cannot edit node_modules\n\nModify package.json instead and run npm install."
            }' >&2
            exit 2
        fi
        
        # Warn for production config files
        case "$FILE_PATH" in
            *.prod.*|*production.*|*.env.production)
                echo "⚠️  Warning: Editing production configuration: $FILE_PATH"
                echo "   Ensure changes are thoroughly tested"
                ;;
        esac
    fi
fi

# Check branch for destructive operations (only when project dir is known)
# Skip check if CLAUDE_PROJECT_DIR is unset to avoid using the hook's CWD repo (e.g. .claude) and blocking feature branches by mistake
if [ "$TOOL_NAME" = "Edit" ] || [ "$TOOL_NAME" = "Write" ] || [ "$TOOL_NAME" = "Delete" ]; then
    PROJECT_DIR=""
    if [ -n "${CLAUDE_PROJECT_DIR:-}" ] && [ -d "$CLAUDE_PROJECT_DIR" ]; then
        PROJECT_DIR="$CLAUDE_PROJECT_DIR"
    fi
    if [ -n "$PROJECT_DIR" ]; then
        if ! (cd "$PROJECT_DIR" && git rev-parse --git-dir >/dev/null 2>&1); then
            : # not a git repo, skip branch check
        else
            CURRENT_BRANCH=$(cd "$PROJECT_DIR" && git branch --show-current 2>/dev/null || echo "")
            if [ "$CURRENT_BRANCH" = "main" ] || [ "$CURRENT_BRANCH" = "master" ]; then
                echo '{
                    "block": true,
                    "message": "❌ Cannot '"$TOOL_NAME"' on '"$CURRENT_BRANCH"' branch\n\nCreate a feature branch first:\n  git checkout -b feature/your-feature"
                }' >&2
                exit 2
            fi
        fi
    fi
fi

# Success - allow tool use
exit 0
