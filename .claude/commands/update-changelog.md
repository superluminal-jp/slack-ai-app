---
name: update-changelog
description: Add entry to CHANGELOG.md [Unreleased] section
---

# Update CHANGELOG

Add properly categorized entry to CHANGELOG.md.

## Categories

- **Added**: New features
- **Changed**: Modifications
- **Deprecated**: Soon removed
- **Removed**: Deleted features
- **Fixed**: Bug fixes
- **Security**: Vulnerabilities

## Usage

Describe the change and I'll categorize and format it:

```
/update-changelog Add user authentication with OAuth 2.0
→ Added to [Unreleased] > Added

/update-changelog Fix memory leak in handler
→ Added to [Unreleased] > Fixed
```

## Format

Follows Keep a Changelog (keepachangelog.com):

```markdown
## [Unreleased]

### Added
- Your change here

### Fixed
- Bug fix here
```

**Output**: Updated CHANGELOG.md
