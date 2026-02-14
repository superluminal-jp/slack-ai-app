---
name: documentation-management
description: Ensures docs stay synchronized with code (README, CHANGELOG, API docs) following Keep a Changelog and best practices. Use when updating README, CHANGELOG, or API documentation.
allowed-tools: Read, Write, Grep, Glob
user-invocable: true
---

# Documentation Management

**Auto-activates for**: README updates, CHANGELOG entries, API doc generation, documentation synchronization.

---

## Quick Reference

### Update Triggers

**Code change → Documentation action**:

| Change | Update |
|--------|--------|
| New feature | README (features), CHANGELOG (Added), API docs |
| Dependency changed | README (prerequisites), CHANGELOG (Changed) |
| Bug fixed | CHANGELOG (Fixed), API docs (if behavior changed) |
| Setup changed | README (installation), development docs |
| Architecture changed | Architecture docs, diagrams |
| Release | CHANGELOG ([Unreleased] → [Version]) |

---

## README.md Updates

**Synchronize when**:
- Project structure changes
- Installation steps change
- Dependencies update  
- Features added
- Usage examples change

**Test all commands before documenting**.

---

## CHANGELOG.md Format

**Follow Keep a Changelog**:

```markdown
## [Unreleased]

### Added
- New feature description

### Changed
- Modified behavior description

### Fixed
- Bug fix description

## [1.2.0] - 2025-02-07
...
```

**Categories**: Added, Changed, Deprecated, Removed, Fixed, Security

---

## API Documentation

**Auto-generate from**:
- JSDoc comments (JavaScript/TypeScript)
- Docstrings (Python)
- RDoc/YARD (Ruby)
- Javadoc (Java)

**Update when**:
- Function signatures change
- New APIs added
- Parameters modified
- Examples become invalid

---

## Quality Checklist

```
[ ] README reflects current state
[ ] CHANGELOG entry added
[ ] API docs synchronized
[ ] Examples tested
[ ] Links validated
[ ] Version numbers current
```

---

**Applied Rule**: `rules/documentation.md` (constraints and quality checklist)

**Or use**:
- `/update-readme` command
- `/update-changelog` command  
- `doc-updater` subagent
