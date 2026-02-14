#!/bin/bash
# TaskCompleted hook: runs when a task is being marked complete in an agent team.
# Exit 0 = allow completion. Exit 2 = block completion; stderr is fed back as reason.
# Input: JSON on stdin (task name, etc.). See https://code.claude.com/docs/en/hooks#taskcompleted

set -e

if [ -n "${CLAUDE_PROJECT_DIR:-}" ] && [ -d "$CLAUDE_PROJECT_DIR" ]; then
    cd "$CLAUDE_PROJECT_DIR" || true
fi

HOOK_INPUT=""
if [ ! -t 0 ]; then
    HOOK_INPUT="$(cat 2>/dev/null || true)"
fi

# Optional: run quality checks (e.g. quality-gate.sh) and exit 2 if they fail.
# Example: run tests/lint for the current project and block task completion if failed.
# if [ -f "package.json" ] && ! npm run test --if-present 2>/dev/null; then
#   echo "Task completion blocked: tests failed. Run tests and fix before marking complete." >&2
#   exit 2
# fi

exit 0
