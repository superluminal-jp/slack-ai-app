#!/bin/bash
# Subagent stop guidance hook
# Provides next steps after subagent completes

set -e

SUBAGENT_NAME="${CLAUDE_SUBAGENT_NAME:-unknown}"

echo ""
echo "═══════════════════════════════════════"
echo "✓ Subagent Complete: $SUBAGENT_NAME"
echo "═══════════════════════════════════════"
echo ""

# Provide context-specific guidance based on subagent
case "$SUBAGENT_NAME" in
    doc-updater|documentation*)
        echo "📝 Documentation updated"
        echo ""
        echo "Next steps:"
        echo "  1. Review changes: git diff"
        echo "  2. Test examples: Run commands from README"
        echo "  3. Validate links: /validate-docs"
        echo "  4. Commit: git add . && git commit -m 'docs: Update documentation'"
        ;;
        
    quality-checker|quality*)
        echo "✓ Quality check complete"
        echo ""
        echo "Review the results above and:"
        echo "  1. Address any errors or warnings"
        echo "  2. Run tests if code changes made"
        echo "  3. Commit when satisfied with quality"
        ;;
        
    architecture-reviewer|architect*)
        echo "🏗️  Architecture review complete"
        echo ""
        echo "Next steps:"
        echo "  1. Review architecture recommendations"
        echo "  2. Update docs/architecture.md if needed"
        echo "  3. Proceed with implementation"
        echo "  4. Consider creating ADR (Architecture Decision Record)"
        ;;
        
    *speckit*|*spec*)
        echo "📋 Spec-kit / spec workflow complete"
        echo ""
        echo "Next steps:"
        echo "  1. Run /speckit.analyze to check spec–plan–implementation consistency"
        echo "  2. Run /speckit.checklist for final quality validation"
        echo "  3. Proceed with implementation or update .speckit/ artifacts as needed"
        ;;
        
    *test*|*tester*)
        echo "🧪 Testing complete"
        echo ""
        echo "Next steps:"
        echo "  1. Review test results above"
        echo "  2. Fix any failing tests"
        echo "  3. Add more tests if coverage gaps"
        echo "  4. Commit passing tests"
        ;;
        
    *implement*|*build*)
        echo "🔨 Implementation complete"
        echo ""
        echo "Next steps:"
        echo "  1. Review code changes: git diff"
        echo "  2. Run tests: npm test (or appropriate)"
        echo "  3. Update documentation if needed"
        echo "  4. Commit: git commit -m 'feat: Description'"
        ;;
        
    *research*|*explore*|*scan*)
        echo "🔍 Research complete"
        echo ""
        echo "The subagent has gathered information."
        echo "Review findings above and decide:"
        echo "  • Proceed with implementation?"
        echo "  • Need more research?"
        echo "  • Update documentation?"
        ;;
        
    *)
        echo "Review subagent results above and:"
        echo "  • Verify outputs meet requirements"
        echo "  • Test changes if code modified"
        echo "  • Update documentation if needed"
        echo "  • Proceed to next task"
        ;;
esac

echo ""

# Check if there are uncommitted changes
if git status --short 2>/dev/null | grep -q '^'; then
    echo "📋 Uncommitted changes detected:"
    git status --short 2>/dev/null | head -5
    echo ""
    echo "Remember to commit when ready:"
    echo "  git add ."
    echo "  git commit -m 'Your message'"
fi

echo ""
exit 0
