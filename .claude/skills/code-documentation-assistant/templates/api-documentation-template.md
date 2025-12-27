# API Documentation: [Endpoint Name]

## Overview

[1-2 sentences describing what this endpoint does and when to use it]

## Endpoint

```
[HTTP Method] /api/[path]
```

## Authentication

[Required / Optional / Not Required]

If required, specify:
- Authentication type: [Bearer Token / API Key / OAuth]
- Header format: `Authorization: Bearer <token>`

## Request

### Parameters

#### Path Parameters
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `id` | string | Yes | Unique identifier |

#### Query Parameters
| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `page` | integer | No | 1 | Page number |
| `limit` | integer | No | 20 | Items per page |

#### Request Body
```json
{
  "field1": "value1",
  "field2": 123
}
```

| Field | Type | Required | Constraints | Description |
|-------|------|----------|------------|-------------|
| `field1` | string | Yes | minLength: 1, maxLength: 100 | Description |
| `field2` | integer | No | min: 0, max: 1000 | Description |

## Response

### Success Response (200 OK)
```json
{
  "status": "success",
  "data": {
    "id": "123",
    "field1": "value1"
  }
}
```

| Field | Type | Description |
|-------|------|-------------|
| `status` | string | Response status |
| `data` | object | Response payload |

### Error Responses

#### 400 Bad Request
```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid input parameters",
    "details": [
      {
        "field": "field1",
        "message": "Field is required"
      }
    ]
  }
}
```

#### 401 Unauthorized
```json
{
  "error": {
    "code": "UNAUTHORIZED",
    "message": "Authentication required"
  }
}
```

#### 404 Not Found
```json
{
  "error": {
    "code": "NOT_FOUND",
    "message": "Resource not found"
  }
}
```

## Examples

### Example 1: Basic Usage
```bash
curl -X GET "https://api.example.com/v1/users/123" \
  -H "Authorization: Bearer <token>"
```

### Example 2: With Query Parameters
```bash
curl -X GET "https://api.example.com/v1/users?page=2&limit=50" \
  -H "Authorization: Bearer <token>"
```

### Example 3: Creating a Resource
```bash
curl -X POST "https://api.example.com/v1/users" \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "field1": "value1",
    "field2": 123
  }'
```

## Rate Limits

- **Limit**: 100 requests per minute per API key
- **Headers**: 
  - `X-RateLimit-Limit`: Maximum requests allowed
  - `X-RateLimit-Remaining`: Remaining requests
  - `X-RateLimit-Reset`: Time when limit resets (Unix timestamp)

## Notes

- [Important caveats or limitations]
- [Performance considerations]
- [Related endpoints or resources]

## Changelog

| Version | Date | Changes |
|---------|------|---------|
| 1.0.0 | 2025-01-01 | Initial release |

