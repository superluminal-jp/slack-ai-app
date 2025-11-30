# Implementation Plan: [Feature Name]

**Feature ID**: [NNN-feature-name]  
**Created**: [Date]  
**Last Updated**: [Date]

## Architecture Overview

[High-level technical approach - 2-3 paragraphs describing the overall architecture]

## Components

### Component A: [Name]
- **Responsibility**: [What it does]
- **Dependencies**: [What it needs from other components]
- **Interface**: [How others interact with it]
- **Technology**: [Specific tech used]

### Component B: [Name]
[Same structure as above]

## Data Model

[Schema, relationships, constraints]

### Tables/Collections

**Table/Collection Name**: [Name]
- `field1` (type): [Description, constraints]
- `field2` (type): [Description, constraints]

### Relationships

- [Relationship description, e.g., User has many Orders]

### Constraints

- [Constraint 1, e.g., email must be unique]
- [Constraint 2, e.g., price must be positive]

## API Design

[Endpoints, parameters, responses]

### Endpoint 1: [Method] /api/[path]

**Purpose**: [What it does]

**Parameters**:
- `param1` (type, required): [Description]

**Request Body**:
```json
{
  "field1": "value1"
}
```

**Response** (200 OK):
```json
{
  "status": "success",
  "data": {}
}
```

**Error Responses**:
- 400 Bad Request: [When and why]
- 401 Unauthorized: [When and why]
- 404 Not Found: [When and why]

## Implementation Details

[Technology-specific decisions]

### Frontend
- [Component structure]
- [State management approach]
- [Routing strategy]
- [Styling approach]

### Backend
- [API structure]
- [Business logic organization]
- [Data access patterns]
- [Error handling strategy]

### Infrastructure
- [Deployment approach]
- [Database setup]
- [Caching strategy]
- [Monitoring setup]

## Testing Strategy

### Unit Tests
- [What will be unit tested]
- [Coverage target, e.g., ≥80%]

### Integration Tests
- [What will be integration tested]
- [Test scenarios]

### E2E Tests
- [What will be E2E tested]
- [Critical user flows]

## Deployment Considerations

### Build Process
- [Build steps]
- [Dependencies]

### Deployment Steps
- [Deployment sequence]
- [Rollback plan]

### Environment Variables
- `VAR1`: [Description]
- `VAR2`: [Description]

## Security Considerations

- [Security measures, e.g., input validation, authentication]
- [Compliance requirements, e.g., GDPR, HIPAA]

## Performance Considerations

- [Performance optimizations]
- [Caching strategy]
- [Load considerations]

## Constitutional Alignment

✅ Uses required tech stack  
✅ Follows testing standards  
✅ Respects security constraints  
✅ Adheres to code style guidelines

---

**Reviewed by**: [Name, Role]  
**Review Date**: [Date]

