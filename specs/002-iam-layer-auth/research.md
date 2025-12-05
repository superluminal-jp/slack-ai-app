# Research: Authenticated Communication Between Layers

**Feature**: 002-iam-layer-auth  
**Date**: 2025-01-27  
**Purpose**: Resolve technical decisions for implementing API Gateway IAM authentication between Verification Layer and Execution Layer

## Research Questions

### RQ-01: API Gateway Type Selection (REST API vs HTTP API)

**Question**: Should we use REST API or HTTP API for Execution Layer endpoint?

**Decision**: REST API

**Rationale**:
- REST API supports IAM authentication natively
- HTTP API does not support IAM authentication (only supports Lambda authorizers, JWT, OIDC)
- REST API provides resource policies for fine-grained access control
- REST API integrates seamlessly with Lambda proxy integration
- Cost difference is minimal ($3.50 per million requests for REST API vs $1.00 for HTTP API)

**Alternatives Considered**:
- **HTTP API**: Rejected because it doesn't support IAM authentication
- **Lambda Function URL with IAM auth**: Rejected because Function URLs don't support resource policies for IAM role restrictions

**References**:
- AWS API Gateway IAM authentication: https://docs.aws.amazon.com/apigateway/latest/developerguide/api-gateway-control-access-using-iam-policies-to-invoke-api.html
- REST API vs HTTP API comparison: https://docs.aws.amazon.com/apigateway/latest/developerguide/http-api-vs-rest.html

---

### RQ-02: IAM Authentication Method (SigV4 Signing)

**Question**: How should Verification Layer sign API Gateway requests with IAM credentials?

**Decision**: Use AWS Signature Version 4 (SigV4) signing via boto3's request signer

**Rationale**:
- boto3 provides `botocore.auth.SigV4Auth` for automatic request signing
- Lambda execution role credentials are automatically used by boto3
- No need to manually construct SigV4 signatures
- boto3 handles credential refresh and expiration automatically
- Standard AWS SDK pattern for IAM-authenticated API calls

**Alternatives Considered**:
- **Manual SigV4 signing**: Rejected - too complex, error-prone, requires credential management
- **requests library with custom signer**: Rejected - boto3 provides built-in signing
- **boto3 client with custom endpoint**: Accepted - uses boto3's SigV4Auth internally

**Implementation Pattern**:
```python
import boto3
from botocore.awsrequest import AWSRequest
from botocore.auth import SigV4Auth
import requests

# Create SigV4 signer using Lambda execution role credentials
session = boto3.Session()
credentials = session.get_credentials()
signer = SigV4Auth(credentials, 'execute-api', session.region_name)

# Sign request
request = AWSRequest(method='POST', url=api_gateway_url, data=payload)
signer.add_auth(request)

# Send signed request
response = requests.post(
    request.url,
    headers=dict(request.headers),
    data=payload
)
```

**References**:
- boto3 SigV4 signing: https://boto3.amazonaws.com/v1/documentation/api/latest/reference/core/auth.html
- API Gateway IAM request signing: https://docs.aws.amazon.com/apigateway/latest/developerguide/api-gateway-control-access-using-iam-policies-to-invoke-api.html

---

### RQ-03: API Gateway Resource Policy Configuration

**Question**: How should we restrict API Gateway access to only Verification Layer's IAM role?

**Decision**: Use API Gateway resource policy with IAM role ARN condition

**Rationale**:
- API Gateway resource policies support `aws:PrincipalArn` condition for role-based access
- More secure than API keys or Lambda authorizers (no shared secrets)
- Policy is attached to API Gateway stage, not individual endpoints
- CloudTrail logs all resource policy evaluations for audit
- Supports least privilege principle (only Verification Layer role can invoke)

**Policy Structure**:
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "AWS": "arn:aws:iam::ACCOUNT_ID:role/verification-lambda-role"
      },
      "Action": "execute-api:Invoke",
      "Resource": "arn:aws:execute-api:REGION:ACCOUNT_ID:API_ID/*"
    }
  ]
}
```

**Alternatives Considered**:
- **Lambda authorizer**: Rejected - adds latency, requires custom code, less secure than IAM
- **API keys**: Rejected - shared secret management, no role-based access
- **VPC endpoint**: Considered but rejected - adds complexity, not required for IAM authentication

**References**:
- API Gateway resource policies: https://docs.aws.amazon.com/apigateway/latest/developerguide/apigateway-resource-policies.html
- IAM condition keys: https://docs.aws.amazon.com/IAM/latest/UserGuide/reference_policies_condition-keys.html

---

### RQ-04: API Gateway Integration Type

**Question**: What integration type should API Gateway use to invoke Execution Layer Lambda?

**Decision**: Lambda proxy integration

**Rationale**:
- Lambda proxy integration passes entire request to Lambda function unchanged
- Preserves existing Lambda handler interface (no code changes required)
- Request/response format matches current direct Lambda invocation
- Simplifies migration (Execution Layer Lambda function remains unchanged)
- Supports async invocation pattern (API Gateway doesn't wait for Lambda response)

**Alternatives Considered**:
- **Lambda non-proxy integration**: Rejected - requires request/response transformation, changes Lambda handler interface
- **HTTP integration**: Not applicable - Execution Layer is Lambda function

**Configuration**:
- Integration type: AWS_PROXY
- Integration URI: Execution Layer Lambda function ARN
- No request/response transformation needed

**References**:
- Lambda proxy integration: https://docs.aws.amazon.com/apigateway/latest/developerguide/set-up-lambda-proxy-integrations.html

---

### RQ-05: Error Handling for Authentication Failures

**Question**: How should Verification Layer handle API Gateway IAM authentication failures?

**Decision**: Log authentication failures and return graceful error response to Slack

**Rationale**:
- Authentication failures indicate security issues (should be logged for monitoring)
- Don't expose internal error details to end users
- Return user-friendly error message via Slack response_url
- CloudWatch alarms can be configured for authentication failure rate
- Fail-closed approach (reject request if authentication fails)

**Error Handling Flow**:
1. API Gateway returns 403 Forbidden for IAM authentication failures
2. Verification Layer logs error with correlation ID and IAM role ARN
3. Verification Layer posts error message to Slack response_url (if available)
4. CloudWatch alarm triggers if authentication failure rate exceeds threshold

**Error Messages**:
- User-facing: "AI処理中にエラーが発生しました。しばらくしてから再度お試しください。"
- Log message: "API Gateway IAM authentication failed: {error_details}"

**Alternatives Considered**:
- **Retry on authentication failure**: Rejected - authentication failures are not transient
- **Fallback to direct Lambda invocation**: Rejected - defeats security purpose

**References**:
- API Gateway error responses: https://docs.aws.amazon.com/apigateway/latest/developerguide/handle-errors-in-lambda-integration.html

---

### RQ-06: Migration Strategy (Zero-Downtime)

**Question**: How should we migrate from direct Lambda invocation to API Gateway without downtime?

**Decision**: Feature flag approach with gradual rollout

**Rationale**:
- Feature flag allows toggling between old and new invocation methods
- Gradual rollout reduces risk (test with small percentage of requests)
- Can rollback immediately if issues detected
- Both methods can coexist during migration period
- No code changes required for Execution Layer (backward compatible)

**Migration Steps**:
1. Deploy API Gateway infrastructure (no traffic yet)
2. Deploy Verification Layer code with feature flag (default: use old method)
3. Enable feature flag for test environment
4. Verify API Gateway authentication works correctly
5. Enable feature flag for production (gradual rollout: 10% → 50% → 100%)
6. Monitor authentication success rate and error rates
7. Remove old Lambda invoke code after 100% migration

**Feature Flag Implementation**:
```python
USE_API_GATEWAY = os.environ.get('USE_API_GATEWAY', 'false').lower() == 'true'
API_GATEWAY_URL = os.environ.get('EXECUTION_API_GATEWAY_URL', '')

if USE_API_GATEWAY and API_GATEWAY_URL:
    # Use API Gateway
    invoke_via_api_gateway(payload)
else:
    # Use direct Lambda invocation (fallback)
    lambda_client.invoke(...)
```

**Alternatives Considered**:
- **Big bang migration**: Rejected - too risky, no rollback path
- **Blue-green deployment**: Considered but rejected - adds complexity, feature flag simpler

**References**:
- Feature flags best practices: https://docs.aws.amazon.com/lambda/latest/dg/configuration-feature-flags.html

---

### RQ-07: Performance Impact Measurement

**Question**: How should we measure the performance impact of API Gateway authentication?

**Decision**: CloudWatch metrics comparison (before/after)

**Rationale**:
- CloudWatch provides detailed API Gateway metrics (latency, error rate)
- Lambda invocation metrics available for comparison
- Can measure authentication overhead separately from API Gateway latency
- p95 latency comparison ensures performance targets are met

**Metrics to Monitor**:
- API Gateway: `IntegrationLatency`, `Latency`, `4XXError`, `5XXError`
- Lambda: `Duration` (p95), `Errors`
- End-to-end: Total time from Verification Layer start to Execution Layer completion

**Performance Targets**:
- API Gateway authentication overhead: ≤200ms (p95)
- Total end-to-end latency increase: ≤5% compared to direct invocation (p95)
- Authentication success rate: ≥99.9%

**Alternatives Considered**:
- **X-Ray tracing**: Considered but not required - CloudWatch metrics sufficient
- **Custom performance testing**: Considered but CloudWatch provides production metrics

**References**:
- API Gateway CloudWatch metrics: https://docs.aws.amazon.com/apigateway/latest/developerguide/api-gateway-metrics-and-dimensions.html

---

## Summary of Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| API Gateway Type | REST API | Supports IAM authentication, resource policies |
| Authentication Method | SigV4 via boto3 | Automatic signing, standard AWS pattern |
| Resource Policy | IAM role ARN condition | Least privilege, role-based access |
| Integration Type | Lambda proxy | Preserves existing Lambda handler interface |
| Error Handling | Log + graceful response | Security monitoring, user-friendly errors |
| Migration Strategy | Feature flag + gradual rollout | Zero-downtime, rollback capability |
| Performance Measurement | CloudWatch metrics | Production metrics, p95 comparison |

## Open Questions Resolved

All technical questions have been resolved. No NEEDS CLARIFICATION markers remain.

## Next Steps

Proceed to Phase 1 (Design & Contracts):
1. Create data-model.md with request/response entities
2. Create contracts/execution-api.yaml OpenAPI specification
3. Create quickstart.md with migration guide

