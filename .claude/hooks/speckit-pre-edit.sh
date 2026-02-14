#!/bin/bash
# spec-kit Pre-Edit Hook
# Purpose: Check for spec-kit artifacts before code modifications.
# Warns when specs are missing or outdated, encouraging spec-first development.

set -euo pipefail

# --- Configuration ---
PROJECT_DIR="${CLAUDE_PROJECT_DIR:-.}"
SPECKIT_DIR="${PROJECT_DIR}/.speckit"

# --- Color Output ---
YELLOW='\033[0;33m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# --- Determine File Being Edited ---
EDIT_FILE="${1:-}"

# Skip non-source files (configs, docs, etc.)
skip_patterns=(
    "*.md"
    "*.txt"
    "*.json"
    "*.yaml"
    "*.yml"
    "*.toml"
    "*.lock"
    "*.log"
    ".speckit/*"
    ".claude/*"
    ".git/*"
    "node_modules/*"
    "__pycache__/*"
    ".venv/*"
)

for pattern in "${skip_patterns[@]}"; do
    if [[ "$EDIT_FILE" == $pattern ]]; then
        exit 0
    fi
done

# --- Check for spec-kit Artifacts ---

# 1. Check if .speckit directory exists
if [ ! -d "$SPECKIT_DIR" ]; then
    echo -e "${YELLOW}⚠️  spec-kit: No .speckit/ directory found${NC}"
    echo "   Spec-driven development recommends creating specs before coding."
    echo ""
    echo "   Initialize with:"
    echo "     /speckit.constitution  — Define project governance"
    echo "     /speckit.specify       — Create requirements spec"
    echo ""
    echo "   Or run: /speckit to start the full workflow"
    echo ""
    # Warning only, do not block
    exit 0
fi

# 2. Check for constitution
if [ ! -f "$SPECKIT_DIR/constitution.md" ]; then
    echo -e "${YELLOW}⚠️  spec-kit: No constitution.md found${NC}"
    echo "   Run /speckit.constitution to define project governance."
    echo ""
fi

# 3. Check for spec
if [ ! -f "$SPECKIT_DIR/spec.md" ]; then
    echo -e "${YELLOW}⚠️  spec-kit: No spec.md found${NC}"
    echo "   Run /speckit.specify to define requirements before implementing."
    echo ""
fi

# 4. Check for plan
if [ ! -f "$SPECKIT_DIR/plan.md" ]; then
    echo -e "${YELLOW}⚠️  spec-kit: No plan.md found${NC}"
    echo "   Run /speckit.plan to define the technical approach."
    echo ""
fi

# 5. Check for tasks
if [ ! -f "$SPECKIT_DIR/tasks.md" ]; then
    echo -e "${YELLOW}⚠️  spec-kit: No tasks.md found${NC}"
    echo "   Run /speckit.tasks to decompose into implementation tasks."
    echo ""
fi

# 6. Check spec freshness (warn if spec is older than 7 days)
if [ -f "$SPECKIT_DIR/spec.md" ]; then
    SPEC_AGE_DAYS=0
    if command -v stat &>/dev/null; then
        if [[ "$OSTYPE" == "darwin"* ]]; then
            SPEC_MTIME=$(stat -f %m "$SPECKIT_DIR/spec.md" 2>/dev/null || echo 0)
        else
            SPEC_MTIME=$(stat -c %Y "$SPECKIT_DIR/spec.md" 2>/dev/null || echo 0)
        fi
        NOW=$(date +%s)
        SPEC_AGE_DAYS=$(( (NOW - SPEC_MTIME) / 86400 ))
    fi

    if [ "$SPEC_AGE_DAYS" -gt 7 ]; then
        echo -e "${YELLOW}⚠️  spec-kit: spec.md is ${SPEC_AGE_DAYS} days old${NC}"
        echo "   Consider updating with /speckit.specify if requirements have changed."
        echo ""
    fi
fi

# 7. Summary if all artifacts present
if [ -f "$SPECKIT_DIR/constitution.md" ] && \
   [ -f "$SPECKIT_DIR/spec.md" ] && \
   [ -f "$SPECKIT_DIR/plan.md" ] && \
   [ -f "$SPECKIT_DIR/tasks.md" ]; then
    echo -e "${GREEN}✓ spec-kit: All artifacts present${NC}"
    echo -e "  ${BLUE}constitution.md${NC} | ${BLUE}spec.md${NC} | ${BLUE}plan.md${NC} | ${BLUE}tasks.md${NC}"
fi

exit 0
