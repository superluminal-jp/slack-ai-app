# Code Review Assistant - Examples

## Example 1: Security Issue Review

**Code Under Review**:
```python
def get_user(user_id):
    query = f"SELECT * FROM users WHERE id = {user_id}"
    result = db.execute(query)
    return result.fetchone()
```

**Review Feedback**:

```
**Issue Type**: Critical
**Location**: user_service.py:15
**Description**: SQL injection vulnerability - user input directly concatenated into SQL query
**Impact**: Attackers could execute arbitrary SQL commands, potentially accessing or deleting all user data
**Suggestion**: Use parameterized queries to safely handle user input

**Example**:
```python
def get_user(user_id: int):
    query = "SELECT * FROM users WHERE id = ?"
    result = db.execute(query, (user_id,))
    return result.fetchone()
```

**Additional Notes**: Consider adding input validation to ensure user_id is a positive integer.
```

## Example 2: Code Quality Issue

**Code Under Review**:
```python
def process_order(order):
    if order.status == 'pending':
        if order.total > 100:
            if order.customer.is_vip:
                discount = order.total * 0.1
                final_price = order.total - discount
                order.final_price = final_price
                order.status = 'processed'
                send_notification(order.customer, order)
                update_inventory(order.items)
                return order
            else:
                order.final_price = order.total
                order.status = 'processed'
                send_notification(order.customer, order)
                update_inventory(order.items)
                return order
        else:
            order.final_price = order.total
            order.status = 'processed'
            send_notification(order.customer, order)
            update_inventory(order.items)
            return order
    return order
```

**Review Feedback**:

```
**Issue Type**: Important
**Location**: order_processor.py:10-35
**Description**: Function exceeds complexity limits (25 lines, cognitive complexity 12, nesting depth 4)
**Impact**: Difficult to test, maintain, and understand. Violates single responsibility principle.
**Suggestion**: Extract discount calculation and order processing into separate functions

**Example**:
```python
def calculate_discount(order: Order) -> float:
    """Calculate discount for eligible orders."""
    if order.total > 100 and order.customer.is_vip:
        return order.total * 0.1
    return 0.0

def process_order(order: Order) -> Order:
    """Process pending orders."""
    if order.status != 'pending':
        return order
    
    discount = calculate_discount(order)
    order.final_price = order.total - discount
    order.status = 'processed'
    
    _complete_order_processing(order)
    return order

def _complete_order_processing(order: Order) -> None:
    """Send notifications and update inventory."""
    send_notification(order.customer, order)
    update_inventory(order.items)
```

**Benefits**: 
- Reduced complexity (each function <10 lines)
- Easier to test discount logic independently
- Clearer separation of concerns
```

## Example 3: Test Coverage Issue

**Code Under Review**:
```python
def validate_email(email: str) -> bool:
    if '@' not in email:
        return False
    if '.' not in email.split('@')[1]:
        return False
    return True
```

**Review Feedback**:

```
**Issue Type**: Important
**Location**: validation.py:5
**Description**: Missing test coverage for edge cases and error conditions
**Impact**: Function may fail silently or return incorrect results for edge cases
**Suggestion**: Add comprehensive test coverage

**Example Tests**:
```python
def test_validate_email_valid():
    assert validate_email("user@example.com") == True

def test_validate_email_no_at():
    assert validate_email("userexample.com") == False

def test_validate_email_no_dot():
    assert validate_email("user@examplecom") == False

def test_validate_email_empty_string():
    assert validate_email("") == False

def test_validate_email_multiple_at():
    assert validate_email("user@exam@ple.com") == False  # Current impl may pass incorrectly

def test_validate_email_only_at():
    assert validate_email("@") == False
```

**Additional Suggestion**: Consider using a proper email validation library (e.g., `email-validator`) instead of manual validation to handle RFC 5322 compliance.
```

## Example 4: Positive Feedback

**Code Under Review**:
```python
def calculate_tax(amount: float, rate: float) -> float:
    """
    Calculate tax amount by multiplying amount by rate.
    
    Args:
        amount: The base amount (must be non-negative)
        rate: The tax rate as decimal (0.0 to 1.0)
    
    Returns:
        The calculated tax amount
    
    Raises:
        ValueError: If amount is negative or rate is outside valid range
    """
    if amount < 0:
        raise ValueError("Amount must be non-negative")
    if not (0 <= rate <= 1):
        raise ValueError("Rate must be between 0 and 1")
    return amount * rate
```

**Review Feedback**:

```
✅ **Excellent Work**: 
- Clear type hints and comprehensive docstring
- Proper input validation with descriptive error messages
- Function is simple, focused, and easy to test
- Follows all quality standards

**Minor Suggestion** (Nice to Have):
Consider adding examples to the docstring:
```python
    Example:
        >>> calculate_tax(100.0, 0.1)
        10.0
```
```

