# Code Review Assistant - Reference Guide

## Review Checklist Quick Reference

### Code Quality

**SOLID Principles**:
- ✅ Single Responsibility: One clear purpose per class/function
- ✅ Open/Closed: Open for extension, closed for modification
- ✅ Liskov Substitution: Subtypes substitutable for base types
- ✅ Interface Segregation: Specific, not bloated interfaces
- ✅ Dependency Inversion: Depend on abstractions

**Complexity Limits**:
- Function length: ≤20 lines
- Cognitive complexity: ≤15
- Cyclomatic complexity: ≤10 per function
- Nesting depth: ≤3 levels

### Security Checklist

**Input Validation**:
- ✅ All user inputs validated
- ✅ SQL injection prevention (parameterized queries)
- ✅ XSS prevention (output encoding)
- ✅ Path traversal prevention
- ✅ Type validation and sanitization

**Authentication & Authorization**:
- ✅ Proper authentication checks
- ✅ Authorization verified before sensitive operations
- ✅ No hardcoded credentials
- ✅ Secrets stored securely
- ✅ Secure session management

**Data Protection**:
- ✅ PII handled per regulations (GDPR, HIPAA)
- ✅ Sensitive data encrypted (at rest and in transit)
- ✅ No sensitive data in logs
- ✅ Proper error handling (no information leakage)

### Testing Standards

**Coverage Requirements**:
- Unit tests: ≥80% line coverage
- Branch coverage: ≥70%
- Edge cases tested
- Error conditions tested
- Integration tests for critical paths

**Test Quality**:
- Tests independent and isolated
- Tests readable and maintainable
- AAA pattern (Arrange, Act, Assert)
- Clear test names describing behavior
- No test interdependencies

### Architecture Patterns

**Clean Architecture**:
- Dependencies point inward
- Business logic separated from infrastructure
- Presentation separated from business logic
- Data access separated from business logic

**Common Issues**:
- Circular dependencies
- Violation of module boundaries
- Business logic in wrong layer
- Tight coupling between layers

## Language-Specific Standards

### Python
- PEP 8 compliance
- Type hints for all functions
- Docstrings (Google or NumPy style)
- Proper exception handling
- Context managers for resources

### TypeScript/JavaScript
- ESLint compliance
- TypeScript strict mode
- Proper async/await usage
- No `any` types
- Consistent formatting

### Java
- Java coding conventions
- Proper exception handling
- Resource management (try-with-resources)
- Immutability where appropriate
- Dependency injection

## Feedback Format Template

```
**Issue Type**: [Critical/Important/Suggestion]
**Location**: [File:Line]
**Description**: [What's wrong]
**Impact**: [Why it matters]
**Suggestion**: [How to fix]
**Example**: [Code example if helpful]
```

## Common Anti-Patterns

1. **Nitpicking**: Style over substance
2. **Personal Preferences**: Enforcing personal style
3. **Inconsistent Standards**: Different rules for different code
4. **Harsh Tone**: Demeaning feedback
5. **Vague Feedback**: "This is wrong" without explanation
6. **Missing Context**: Not considering project constraints
7. **Over-Engineering**: Complex solutions for simple problems
8. **Ignoring Tests**: Reviewing only code, not tests

