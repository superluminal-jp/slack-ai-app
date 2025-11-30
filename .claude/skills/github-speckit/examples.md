# GitHub Speckit - Examples

## Example 1: Complete Workflow - Photo Album Organizer

### Step 1: Constitution

```
/speckit.constitution

React + TypeScript SPA:
- Vite build system
- No external UI libraries (custom components)
- Local storage for data persistence
- Drag-and-drop with react-beautiful-dnd
```

**Output**: `.specify/memory/constitution.md` created with project principles

### Step 2: Specification

```
/speckit.specify

Photo album organizer:
- Albums grouped by date (auto-detect from photo metadata)
- Drag-and-drop to reorganize albums on main page
- Albums are flat (no nesting)
- Click album to view photos
- Photos display in grid layout
```

**Output**: `.specify/001-photo-album-organizer/spec.md` created

### Step 3: Clarification (if needed)

```
/speckit.clarify

[Claude asks questions like:]
- How should photos be uploaded? (file picker, drag-and-drop, or both?)
- What image formats are supported? (JPEG, PNG, WebP?)
- Should there be a limit on photos per album?
- What happens when storage quota is exceeded?
```

**Output**: Spec updated with Clarifications section

### Step 4: Technical Plan

```
/speckit.plan

Implementation:
- Use File API for photo uploads
- EXIF.js for metadata extraction
- IndexedDB for local storage
- CSS Grid for photo layout
- No backend required (client-side only)
```

**Output**: 
- `.specify/001-photo-album-organizer/plan/implementation-plan.md`
- `.specify/001-photo-album-organizer/plan/implementation-detail-storage.md`
- `.specify/001-photo-album-organizer/plan/implementation-detail-ui.md`

### Step 5: Task Breakdown

```
/speckit.tasks

[Claude generates tasks like:]
## User Story 1: Album Management
### Task 1.1: Set up project structure
- Type: Infrastructure
- Dependencies: None
- Acceptance: Vite project runs, TypeScript configured

### Task 1.2: Create Album data model [P]
- Type: Frontend
- Dependencies: 1.1
- Acceptance: Album interface defined, unit tests pass
- Parallel: Can run with 1.3

### Task 1.3: Create Photo data model [P]
- Type: Frontend
- Dependencies: 1.1
- Acceptance: Photo interface defined, unit tests pass
```

**Output**: `.specify/001-photo-album-organizer/plan/tasks.md`

### Step 6: Analysis (optional)

```
/speckit.analyze

[Claude validates:]
✅ Spec aligns with constitution (React + TypeScript, no external UI libs)
✅ Plan uses allowed technologies (File API, IndexedDB, CSS Grid)
✅ Tasks cover all spec requirements
✅ No conflicting requirements found
```

### Step 7: Implementation

```
/speckit.implement

[Claude executes tasks sequentially:]
1. ✅ Set up project structure
2. ✅ Create Album data model
3. ✅ Create Photo data model
4. ✅ Implement photo upload
5. ✅ Implement metadata extraction
6. ✅ Implement IndexedDB storage
7. ✅ Implement album grid view
8. ✅ Implement drag-and-drop
9. ✅ Update Review & Acceptance Checklist
```

## Example 2: Adding Feature to Existing Project

**Context**: Project already has constitution and Feature 001 (User Authentication) completed.

```
/speckit.specify

Build user profile page:
- Display user's name, email, avatar
- Allow editing name and avatar
- Show account creation date
- Display last login time
```

**Claude Action**:
1. Reads `.specify/memory/constitution.md` to understand constraints
2. Checks if Feature 001 (User Authentication) is complete (dependency)
3. Generates spec aligned with existing architecture
4. Creates `.specify/002-user-profile/spec.md`

Then proceeds with `/speckit.plan` → `/speckit.tasks` → `/speckit.implement`

## Example 3: Conflict Resolution

### Scenario: Spec-Constitution Conflict

**Constitution states**: "Use React only, no other frameworks"

**Spec requests**: "Use Vue.js for this feature"

**Claude Response**:

```
⚠️ CONFLICT DETECTED

Spec requires Vue.js, but constitution mandates React only.

Options:
1. Update constitution (requires justification)
   - Reason: Vue.js better suited for this specific feature
   - Impact: Changes project-wide constraint

2. Revise spec to use React
   - Aligns with existing architecture
   - Maintains consistency

3. Split feature (React for main, Vue for specific component)
   - Hybrid approach
   - May increase complexity

Please choose an option before proceeding.
```

**User Decision**: Option 2 - Revise spec to use React

**Claude Action**: Updates spec to use React, then proceeds with plan

## Example 4: Clarification Process

**Initial Spec** (vague):
```
/speckit.specify

Build a shopping cart feature
```

**Claude Clarification Questions**:

1. "What items can be added to the cart? (products only, or also services/subscriptions?)"
2. "What's the maximum number of items per cart?"
3. "Should the cart persist across sessions? (localStorage, server-side, or both?)"
4. "What happens when an item goes out of stock while in cart?"
5. "Can users save multiple carts? (wishlist functionality?)"
6. "What's the cart expiration policy? (time-based, session-based?)"

**User Answers**:
1. Products only
2. Maximum 50 items
3. Both localStorage and server-side sync
4. Show warning, allow removal but not checkout
5. No wishlist in v1
6. Cart expires after 30 days of inactivity

**Claude Action**: Updates spec with Clarifications section, then proceeds

## Example 5: Task Dependency Management

**Generated Tasks**:

```markdown
## User Story 1: User Authentication
### Task 1.1: Create database schema
- Type: Backend
- Dependencies: None
- Acceptance: Migrations run successfully

### Task 1.2: Create User model [P]
- Type: Backend
- Dependencies: 1.1
- Acceptance: Unit tests pass
- Parallel: Can run with 1.3

### Task 1.3: Create Auth service [P]
- Type: Backend
- Dependencies: 1.1
- Acceptance: Unit tests pass
- Parallel: Can run with 1.2

### Task 1.4: Create login endpoint
- Type: Backend
- Dependencies: 1.2, 1.3
- Acceptance: Integration tests pass

### Task 1.5: Create login UI component
- Type: Frontend
- Dependencies: 1.4
- Acceptance: E2E test passes
```

**Claude's Implementation Order**:
1. Task 1.1 (no dependencies)
2. Tasks 1.2 and 1.3 in parallel (both depend on 1.1)
3. Task 1.4 (depends on 1.2 and 1.3)
4. Task 1.5 (depends on 1.4)

## Example 6: Analysis Validation

```
/speckit.analyze

Analyzing artifacts for Feature 003: Payment Processing...

✅ Spec-Constitution Alignment:
   - Uses React (constitution requirement) ✓
   - Uses TypeScript (constitution requirement) ✓
   - No external UI libraries (constitution requirement) ✓

✅ Plan-Spec Completeness:
   - All spec requirements covered in plan ✓
   - No over-engineering detected ✓

⚠️  Potential Issues:
   - Plan mentions Stripe SDK, but spec doesn't specify payment provider
   - Recommendation: Add payment provider to spec or justify in plan

✅ Task-Plan Coverage:
   - All plan components have corresponding tasks ✓
   - Dependencies correctly ordered ✓

✅ No Duplicated Requirements:
   - No duplicate functionality found ✓

**Result**: Ready for implementation after addressing payment provider specification.
```

