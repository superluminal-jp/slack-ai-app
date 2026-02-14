#!/bin/bash
# Stop final check hook
# Dynamic documentation validation based on actual git changes.
# Replaces static checklist with computed results.
# Per Claude Code docs: when stop_hook_active is true, skip output to avoid infinite loop.

set -e

# Read stdin (hook input JSON); if stop_hook_active is true, exit immediately to avoid infinite loop
if [ ! -t 0 ]; then
    HOOK_INPUT="$(cat 2>/dev/null || true)"
    if [ -n "$HOOK_INPUT" ] && command -v jq >/dev/null 2>&1; then
        STOP_HOOK_ACTIVE="$(echo "$HOOK_INPUT" | jq -r '.stop_hook_active // empty' 2>/dev/null || true)"
        if [ "$STOP_HOOK_ACTIVE" = "true" ]; then
            exit 0
        fi
    fi
fi

echo ""
echo "═══════════════════════════════════════"
echo "  Task Complete - Documentation Check"
echo "═══════════════════════════════════════"
echo ""

# --- Gather all changed files (staged + unstaged + untracked) ---
CHANGED_FILES=""
STAGED=$(git diff --cached --name-only 2>/dev/null || true)
UNSTAGED=$(git diff --name-only HEAD 2>/dev/null || true)
UNTRACKED=$(git ls-files --others --exclude-standard 2>/dev/null || true)

# Combine and deduplicate
CHANGED_FILES=$(printf '%s\n%s\n%s' "$STAGED" "$UNSTAGED" "$UNTRACKED" | sort -u | grep -v '^$' || true)

if [ -z "$CHANGED_FILES" ]; then
    echo "  No uncommitted changes detected."
    echo ""
    echo "═══════════════════════════════════════"
    echo ""
    exit 0
fi

# --- Display change summary ---
CHANGE_COUNT=$(echo "$CHANGED_FILES" | wc -l)
echo "📝 Changed Files ($CHANGE_COUNT):"
echo "$CHANGED_FILES" | head -15 | sed 's/^/   /'
if [ "$CHANGE_COUNT" -gt 15 ]; then
    echo "   ... and $((CHANGE_COUNT - 15)) more"
fi
echo ""

# --- Classify files ---
CODE_FILES=$(echo "$CHANGED_FILES" | grep -E '\.(ts|tsx|js|jsx|py|rs|go|java|c|cpp|h|hpp|rb|php|swift|kt)$' | grep -vE '(test|spec|Test|Spec)' || true)
DOC_FILES=$(echo "$CHANGED_FILES" | grep -E '(README\.md|CHANGELOG\.md|docs/)' || true)
TEST_FILES=$(echo "$CHANGED_FILES" | grep -iE '(test|spec)\.' || true)

CODE_COUNT=0
[ -n "$CODE_FILES" ] && CODE_COUNT=$(echo "$CODE_FILES" | wc -l)

# If no code files changed, minimal check
if [ "$CODE_COUNT" -eq 0 ]; then
    echo "  No source code files changed. Documentation check skipped."
    echo ""
    echo "═══════════════════════════════════════"
    echo ""
    exit 0
fi

echo "📋 Documentation Checklist ($CODE_COUNT code file(s) changed):"
echo ""

# --- Dynamic checks ---
ISSUES=0

# Check 1: CHANGELOG.md
if echo "$DOC_FILES" | grep -q "CHANGELOG\.md"; then
    echo "  [x] CHANGELOG.md updated"
else
    echo "  [ ] CHANGELOG.md NOT updated"
    echo "      → Run: /update-changelog"
    ISSUES=$((ISSUES + 1))
fi

# Check 2: README.md (if core files changed)
CORE_CHANGED=$(echo "$CODE_FILES" | grep -E '(index|main|app|server)\.' || true)
if [ -n "$CORE_CHANGED" ]; then
    if echo "$DOC_FILES" | grep -q "README\.md"; then
        echo "  [x] README.md updated (core files changed)"
    else
        echo "  [ ] README.md NOT updated (core files changed)"
        echo "      → Run: /update-readme"
        ISSUES=$((ISSUES + 1))
    fi
else
    echo "  [-] README.md (no core file changes, skip)"
fi

# Check 3: API docs (if API-related files changed)
API_CHANGED=$(echo "$CODE_FILES" | grep -E '(api|routes|endpoints|handlers)/' || true)
if [ -n "$API_CHANGED" ]; then
    if echo "$DOC_FILES" | grep -q "docs/"; then
        echo "  [x] API docs updated (API code changed)"
    else
        echo "  [ ] API docs NOT updated (API code changed)"
        echo "      → Update docs/api/ to reflect API changes"
        ISSUES=$((ISSUES + 1))
    fi
else
    echo "  [-] API docs (no API code changes, skip)"
fi

# Check 4: Tests
if [ -n "$TEST_FILES" ]; then
    TEST_COUNT=$(echo "$TEST_FILES" | wc -l)
    echo "  [x] Tests updated ($TEST_COUNT test file(s))"
else
    echo "  [ ] No test files changed"
    echo "      → Consider adding tests for new functionality"
    ISSUES=$((ISSUES + 1))
fi

echo ""

# --- Session tracker summary ---
PROJECT_HASH=$(echo "${CLAUDE_PROJECT_DIR:-$PWD}" | cksum | cut -d' ' -f1)
TRACKER_FILE="/tmp/.claude-doc-tracker-${PROJECT_HASH}"

if [ -f "$TRACKER_FILE" ]; then
    TRACKED_COUNT=$(sort -u "$TRACKER_FILE" | wc -l)
    echo "📊 Session Summary: $TRACKED_COUNT source file(s) edited"
    sort -u "$TRACKER_FILE" | head -5 | sed 's/^/   /'
    if [ "$TRACKED_COUNT" -gt 5 ]; then
        echo "   ... and $((TRACKED_COUNT - 5)) more"
    fi
    echo ""
    # Cleanup tracker
    rm -f "$TRACKER_FILE"
fi

# --- Result summary ---
if [ "$ISSUES" -eq 0 ]; then
    echo "✅ All documentation checks passed!"
else
    echo "⚠️  $ISSUES documentation issue(s) detected"
    echo ""
    echo "  Suggested commands:"
    echo "    /update-changelog   # Add CHANGELOG entry"
    echo "    /update-readme      # Regenerate README"
    echo "    /validate-docs      # Full documentation check"
fi

echo ""
echo "═══════════════════════════════════════"
echo ""

exit 0
