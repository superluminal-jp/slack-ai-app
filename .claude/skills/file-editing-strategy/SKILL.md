---
name: file-editing-strategy
description: Provides guidance on surgical, targeted edits for large files instead of full rewrites. Use when editing files over 100 lines.
user-invocable: false
---

# File Editing Strategy

**Auto-activates for**: Editing files >100 lines, refactoring, bug fixes in large files.

---

## Quick Decision

```
File < 100 lines?
└─ Either approach OK

File ≥ 100 lines?
├─ Complete restructure (>50% changing)? → Full rewrite
├─ Multiple sections? → Incremental targeted edits
└─ Single section? → Surgical targeted edit
```

---

## Surgical Edits (Preferred)

**When**:
- Modifying specific functions
- Fixing bugs in known locations
- Updating configuration
- Adding/removing code blocks

**How**:
1. Identify exact location
2. Provide sufficient context
3. Change only what's needed
4. Preserve surrounding code

**Benefits**:
- 70-90% token reduction
- Clear diffs
- Faster execution
- Easy review

---

## Multi-Section Edits

**For multiple changes**:

1. List all changes
2. Apply sequentially (top to bottom)
3. Test after each edit
4. Verify before next edit

**Example**:
```
Change 1: Add import
Change 2: Update function signature  
Change 3: Add validation logic
Change 4: Update callers
```

---

## Full Rewrite Only When

- Complete restructuring
- Reformatting entire file  
- Initial file creation
- Changing fundamental architecture

---

## Examples

### ❌ Inefficient
```
File: 600 lines
Change: Update 1 function
Approach: Rewrite entire file
Result: 600-line diff, 18K tokens
```

### ✅ Efficient
```
File: 600 lines
Change: Update 1 function
Approach: Targeted edit
Result: 15-line diff, 500 tokens (97% reduction)
```

---

**Applied Rule**: `rules/file-editing.md` (constraints and decision tree)
