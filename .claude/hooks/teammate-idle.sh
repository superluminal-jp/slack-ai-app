#!/bin/bash
# TeammateIdle hook: runs when an agent-team teammate is about to go idle.
# Exit 0 = allow idle. Exit 2 = keep teammate working; stderr is fed back as feedback.
# Input: JSON on stdin (hook_event_name, teammate_name, etc.). See https://code.claude.com/docs/en/hooks#teammateidle

set -e

if [ -n "${CLAUDE_PROJECT_DIR:-}" ] && [ -d "$CLAUDE_PROJECT_DIR" ]; then
    cd "$CLAUDE_PROJECT_DIR" || true
fi

HOOK_INPUT=""
if [ ! -t 0 ]; then
    HOOK_INPUT="$(cat 2>/dev/null || true)"
fi

# Optional: extend with conditions that block idle (exit 2 + message to stderr).
# Example: check for uncommitted changes, or pending tasks in shared task list.
# if command -v jq >/dev/null 2>&1 && [ -n "$HOOK_INPUT" ]; then
#     TEAMMATE_NAME="$(echo "$HOOK_INPUT" | jq -r '.teammate_name // empty' 2>/dev/null || true)"
#     # if ...; then echo "Please commit your changes before going idle." >&2; exit 2; fi
# fi

exit 0
