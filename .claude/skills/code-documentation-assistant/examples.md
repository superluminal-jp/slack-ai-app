# Code Documentation Assistant - Examples

## Example 1: Function Documentation

**User**: "Document this function"

```python
def calculate_tax(amount, rate):
    return amount * rate
```

**Assistant Output**:

```python
def calculate_tax(amount: float, rate: float) -> float:
    """
    Calculate tax amount by multiplying amount by rate.
    
    Args:
        amount: The base amount to calculate tax on (must be non-negative)
        rate: The tax rate as a decimal (e.g., 0.1 for 10%, must be between 0 and 1)
    
    Returns:
        The calculated tax amount
    
    Raises:
        ValueError: If amount is negative or rate is outside valid range
    
    Example:
        >>> calculate_tax(100.0, 0.1)
        10.0
        >>> calculate_tax(50.0, 0.05)
        2.5
    """
    if amount < 0:
        raise ValueError("Amount must be non-negative")
    if not (0 <= rate <= 1):
        raise ValueError("Rate must be between 0 and 1")
    return amount * rate
```

## Example 2: API Documentation

**User**: "Create API documentation for the user login endpoint"

**Assistant Output**: [See api-documentation-template.md for full example]

## Example 3: Architecture Decision Record

**User**: "Document our decision to use microservices"

**Assistant Output**:

```markdown
# ADR-001: Adopt Microservices Architecture

**Status**: Accepted  
**Date**: 2025-01-15  
**Deciders**: Engineering Leadership Team  
**Technical Story**: PROJ-123

## Context

Our monolithic application has grown to over 500,000 lines of code with 15 development teams working on it. Deployment cycles take 2+ hours, and teams frequently block each other when making changes. We need to improve deployment speed and team independence while maintaining system reliability.

## Decision

We have decided to migrate to a microservices architecture, starting with extracting the payment processing and user authentication services. This decision affects all engineering teams and requires new infrastructure for service discovery, API gateways, and distributed tracing.

## Alternatives Considered

### Alternative 1: Modular Monolith
- **Pros**: 
  - Simpler deployment and operations
  - Easier debugging and testing
  - Lower infrastructure complexity
- **Cons**: 
  - Still requires coordinated deployments
  - Teams still share codebase
- **Why not chosen**: Doesn't solve team independence problem

### Alternative 2: Improve CI/CD Only
- **Pros**: 
  - Lower risk and cost
  - Faster to implement
- **Cons**: 
  - Doesn't address architectural constraints
  - Teams still block each other
- **Why not chosen**: Doesn't address root cause

## Consequences

### Positive Outcomes
- Teams can deploy independently
- Services can scale independently
- Technology diversity per service
- Faster deployment cycles (target: <15 minutes)

### Negative Outcomes or Trade-offs
- Increased operational complexity
- Network latency between services
- Distributed system challenges (eventual consistency, etc.)
- Higher infrastructure costs initially

### Technical Debt or Future Work
- Implement comprehensive service mesh
- Establish distributed tracing standards
- Create service template and onboarding process
- Document inter-service communication patterns

## References

- [Microservices Patterns Book](https://example.com)
- [Internal Architecture Discussion](https://wiki.example.com/arch)
```

