# Documentation Management

**Purpose**: Keep documentation synchronized with code changes.

**Principle**: Code is source of truth. Documentation reflects implementation.

---

## Core Rules

### 1. Atomic Updates

**Same commit updates code AND docs**:
```bash
# Good
git add src/feature.ts docs/api/feature.md CHANGELOG.md
git commit -m "feat: Add feature with documentation"

# Bad  
git commit -m "feat: Add feature" # Missing docs
# ... later ...
git commit -m "docs: Update docs" # Separated
```

### 2. Test All Examples

**Every code example must work**:
```markdown
# ✅ Good (tested 2025-02-07)
npm install
npm start
# Output: Server running on http://localhost:3000

# ❌ Bad (untested)
npm start
```

### 3. Auto-Generate Where Possible

**Generate from code**:
- API docs from JSDoc/docstrings
- Dependency lists from package.json
- Project structure from directories

---

## Update Triggers

### README.md
- Project structure changes → Update structure section
- Dependencies change → Update prerequisites
- Setup changes → Update installation
- Features added → Update features list

### CHANGELOG.md
- Code committed → Add to [Unreleased]
- Release created → Move to version section

### API Documentation  
- Function signatures change → Regenerate
- New APIs added → Document
- Examples break → Fix or remove

---

## Documentation Hierarchy

```
/
├── README.md           # Project overview (auto-update)
├── CHANGELOG.md        # Version history (Keep a Changelog format)
└── docs/
    ├── architecture.md # System design
    ├── api/            # API reference (auto-generate)
    └── guides/         # User documentation
```

---

## Quality Checklist

**Before committing**:
```
[ ] README reflects current state
[ ] CHANGELOG updated
[ ] API docs synchronized
[ ] All examples tested
[ ] Links validated
[ ] Version numbers current
```

---

**For comprehensive guidance, use `doc-updater` subagent or `/update-readme` command.**

**Last Updated**: 2025-02-07
