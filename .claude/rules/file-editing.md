# File Editing Strategy

**Purpose**: Efficient, reviewable file modifications. Change only what needs to change.

---

## Decision Tree

```
File < 100 lines?
└─ Either approach acceptable

File ≥ 100 lines?
├─ Complete restructure (>50% changing)? → Full rewrite
├─ Multiple sections? → Incremental targeted edits (top-to-bottom, test between)
└─ Single section? → Surgical targeted edit
```

## Targeted Edits (Default for >100 lines)

**Benefits**: 70–90% token reduction, clear diffs, lower risk, faster review.

**Requirements**:
- Include enough surrounding context for unique identification
- Maintain indentation, spacing, and code structure
- Change only what's needed — no unrelated reformatting
- Test after each edit in multi-edit workflows

## Full Rewrite (Exception)

Only when: >50% of file changing, complete restructuring, initial file creation, or file <100 lines.

## Anti-Patterns

- **Rewrite for minor change**: Full rewrite of 500-line file for 1-line fix
- **Mixed concerns**: Bug fix combined with unrelated refactoring in same edit
- **Insufficient context**: Edit targets ambiguous location (multiple possible matches)
- **Unnecessary changes**: Reformatting untouched code, reordering imports

---

**Last Updated**: 2026-02-10
