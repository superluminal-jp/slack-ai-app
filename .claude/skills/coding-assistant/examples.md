# Coding Assistant - Examples

## Example 1: Feature Implementation with SDD/TDD

**User Request**: "I need to add user authentication to my app"

**Assistant Response**:

Before writing any code, let's create a complete specification:

1. **Gherkin Scenarios**:

```gherkin
Feature: User Authentication
  Scenario: Successful login
    Given a user exists with email "user@example.com" and password "password123"
    When the user submits credentials "user@example.com" and "password123"
    Then the user should be authenticated
    And a session token should be created
    And the user should be redirected to the dashboard

  Scenario: Failed login with wrong password
    Given a user exists with email "user@example.com" and password "password123"
    When the user submits credentials "user@example.com" and "wrongpassword"
    Then authentication should fail
    And an error message "Invalid credentials" should be displayed
    And no session token should be created
```

2. **API Contract** (OpenAPI 3.0):

```yaml
paths:
  /api/auth/login:
    post:
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              properties:
                email:
                  type: string
                  format: email
                password:
                  type: string
                  minLength: 8
      responses:
        "200":
          description: Successful authentication
          content:
            application/json:
              schema:
                type: object
                properties:
                  token:
                    type: string
                  user:
                    $ref: "#/components/schemas/User"
        "401":
          description: Invalid credentials
```

3. **Test First** (RED phase):

```python
def test_successful_login():
    # Arrange
    user = create_user(email="user@example.com", password="password123")

    # Act
    response = client.post("/api/auth/login", json={
        "email": "user@example.com",
        "password": "password123"
    })

    # Assert
    assert response.status_code == 200
    assert "token" in response.json()
    assert response.json()["user"]["email"] == "user@example.com"
```

Now we can implement the code to make this test pass.

## Example 2: Architecture Pattern Selection

**User Request**: "I'm building a new e-commerce platform with 5 developers. What architecture should I use?"

**Assistant Response**:

Based on your team size (5 developers) and complexity (e-commerce platform), I recommend:

**Recommended**: **Modular Monolith**

**Rationale**:

- Team size (5 devs) fits the 3-10 developer range for Modular Monolith
- E-commerce has moderate complexity (not simple CRUD, but not enterprise-level yet)
- Allows clear module boundaries (Products, Orders, Payments, Shipping)
- Single deployment simplifies operations
- Can evolve to microservices later if needed

**Folder Structure**:

```
src/
├── modules/
│   ├── products/
│   │   ├── domain/
│   │   ├── application/
│   │   └── infrastructure/
│   ├── orders/
│   │   ├── domain/
│   │   ├── application/
│   │   └── infrastructure/
│   └── shared/
│       └── kernel/
└── host/
    └── Program.cs
```

**Next Steps**:

1. Create ADR documenting this decision
2. Set up module boundaries
3. Define inter-module communication (events or facades)

## Example 3: Quality Gate Enforcement

**User Request**: "Here's my function, can you review it?"

```python
def process_data(items):
    results = []
    for item in items:
        if item.status == 'active':
            if item.value > 100:
                if item.category == 'premium':
                    discount = item.value * 0.1
                    final_price = item.value - discount
                    results.append({'id': item.id, 'price': final_price})
    return results
```

**Assistant Response**:

I notice several quality gate violations:

1. **Function Length**: 13 lines (exceeds 20-line limit, but close)
2. **Cognitive Complexity**: 4 nested if statements = complexity 8 (within limit of 15)
3. **Magic Numbers**: `100`, `0.1` should be constants
4. **Missing Type Hints**: No type annotations
5. **No Tests**: No test coverage

**Refactored Version**:

```python
MIN_PREMIUM_VALUE = 100
PREMIUM_DISCOUNT_RATE = 0.1

def process_data(items: list[Item]) -> list[dict[str, Any]]:
    """Process active premium items with discount calculation."""
    return [
        _calculate_discounted_price(item)
        for item in items
        if _is_eligible_for_discount(item)
    ]

def _is_eligible_for_discount(item: Item) -> bool:
    """Check if item qualifies for premium discount."""
    return (
        item.status == 'active'
        and item.value > MIN_PREMIUM_VALUE
        and item.category == 'premium'
    )

def _calculate_discounted_price(item: Item) -> dict[str, Any]:
    """Calculate final price with discount applied."""
    discount = item.value * PREMIUM_DISCOUNT_RATE
    return {
        'id': item.id,
        'price': item.value - discount
    }
```

**Test Coverage**:

```python
def test_process_data_with_eligible_items():
    items = [
        Item(id=1, status='active', value=150, category='premium'),
        Item(id=2, status='active', value=50, category='premium'),
    ]
    results = process_data(items)
    assert len(results) == 1
    assert results[0]['price'] == 135.0  # 150 - (150 * 0.1)
```
