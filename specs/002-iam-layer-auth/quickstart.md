# Quickstart: Authenticated Communication Between Layers

**Feature**: 002-iam-layer-auth  
**Date**: 2025-01-27  
**Purpose**: Migration guide for implementing API Gateway IAM authentication between Verification Layer and Execution Layer

## Overview

This guide walks through migrating from direct Lambda invocation to API Gateway with IAM authentication. The migration uses a feature flag approach for zero-downtime deployment.

## Prerequisites

- AWS CDK CLI installed and configured
- AWS credentials with permissions to create API Gateway, Lambda, and IAM resources
- Existing deployment of slack-ai-app (001-slack-bedrock-mvp)
- Python 3.11+ environment for Lambda functions
- Node.js/TypeScript environment for CDK

## Migration Steps

### Step 1: Deploy API Gateway Infrastructure

**1.1 Create Execution API Gateway Construct**

Create `cdk/lib/constructs/execution-api.ts`:

```typescript
import * as cdk from "aws-cdk-lib";
import * as apigateway from "aws-cdk-lib/aws-apigateway";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as iam from "aws-cdk-lib/aws-iam";
import { Construct } from "constructs";

export interface ExecutionApiProps {
  executionLambda: lambda.Function;
  verificationLambdaRoleArn: string;
}

export class ExecutionApi extends Construct {
  public readonly api: apigateway.RestApi;
  public readonly apiUrl: string;

  constructor(scope: Construct, id: string, props: ExecutionApiProps) {
    super(scope, id);

    // Create REST API
    this.api = new apigateway.RestApi(this, "ExecutionApi", {
      restApiName: "Execution Layer API",
      description: "Internal API Gateway for Execution Layer with IAM authentication",
      endpointConfiguration: {
        types: [apigateway.EndpointType.REGIONAL],
      },
      policy: new iam.PolicyDocument({
        statements: [
          new iam.PolicyStatement({
            effect: iam.Effect.ALLOW,
            principals: [new iam.ArnPrincipal(props.verificationLambdaRoleArn)],
            actions: ["execute-api:Invoke"],
            resources: ["*"],
          }),
        ],
      }),
    });

    // Create Lambda integration
    const integration = new apigateway.LambdaIntegration(props.executionLambda, {
      proxy: true,
    });

    // Create /execute endpoint
    const executeResource = this.api.root.addResource("execute");
    executeResource.addMethod("POST", integration, {
      authorizationType: apigateway.AuthorizationType.IAM,
    });

    // Output API URL
    this.apiUrl = this.api.url;
  }
}
```

**1.2 Update Slack Bedrock Stack**

Modify `cdk/lib/slack-bedrock-stack.ts`:

```typescript
// Add import
import { ExecutionApi } from "./constructs/execution-api";

// After bedrockProcessor creation, add:
const executionApi = new ExecutionApi(this, "ExecutionApi", {
  executionLambda: bedrockProcessor.function,
  verificationLambdaRoleArn: slackEventHandler.function.role!.roleArn,
});

// Add output
new cdk.CfnOutput(this, "ExecutionApiUrl", {
  value: executionApi.apiUrl,
  description: "Execution Layer API Gateway URL",
});
```

**1.3 Deploy Infrastructure**

```bash
cd cdk
npm install
cdk deploy
```

**Expected Output**:
- API Gateway REST API created
- `/execute` endpoint with IAM authentication
- Resource policy restricting access to Verification Layer role
- API Gateway URL output

**Verification**:
```bash
# Check API Gateway exists
aws apigateway get-rest-apis --query "items[?name=='Execution Layer API']"

# Check resource policy
aws apigateway get-rest-api --rest-api-id <API_ID> --query "policy"
```

---

### Step 2: Implement API Gateway Client

**2.1 Create API Gateway Client Module**

Create `lambda/slack-event-handler/api_gateway_client.py`:

```python
"""
API Gateway client with IAM authentication (SigV4 signing).

This module provides a client for calling API Gateway endpoints
using AWS Signature Version 4 authentication.
"""

import json
import os
from typing import Dict, Any, Optional
import boto3
from botocore.awsrequest import AWSRequest
from botocore.auth import SigV4Auth
from botocore.credentials import Credentials
import requests


def invoke_execution_api(
    api_url: str,
    payload: Dict[str, Any],
    region: str = "ap-northeast-1",
) -> requests.Response:
    """
    Invoke Execution Layer API Gateway endpoint with IAM authentication.

    Args:
        api_url: API Gateway endpoint URL (e.g., https://abc123xyz.execute-api.ap-northeast-1.amazonaws.com/prod/execute)
        payload: Request payload dictionary
        region: AWS region name

    Returns:
        requests.Response: HTTP response from API Gateway

    Raises:
        requests.RequestException: If request fails
    """
    # Get AWS credentials from Lambda execution role
    session = boto3.Session()
    credentials = session.get_credentials()

    if not credentials:
        raise ValueError("No AWS credentials available")

    # Create SigV4 signer
    signer = SigV4Auth(credentials, "execute-api", region)

    # Prepare request
    url = f"{api_url}/execute"
    method = "POST"
    headers = {
        "Content-Type": "application/json",
    }
    body = json.dumps(payload)

    # Create AWS request for signing
    request = AWSRequest(method=method, url=url, data=body, headers=headers)
    signer.add_auth(request)

    # Send signed request
    response = requests.post(
        url,
        headers=dict(request.headers),
        data=body,
        timeout=30,
    )

    return response
```

**2.2 Update Requirements**

Add to `lambda/slack-event-handler/requirements.txt`:

```
requests>=2.31.0
```

---

### Step 3: Update Verification Layer Handler

**3.1 Modify Handler with Feature Flag**

Update `lambda/slack-event-handler/handler.py`:

```python
# Add import
from api_gateway_client import invoke_execution_api

# Add feature flag check
USE_API_GATEWAY = os.environ.get("USE_API_GATEWAY", "false").lower() == "true"
EXECUTION_API_URL = os.environ.get("EXECUTION_API_URL", "")

# Replace lambda_client.invoke() section with:
if USE_API_GATEWAY and EXECUTION_API_URL:
    # Use API Gateway with IAM authentication
    try:
        log_event(
            "INFO",
            "execution_api_invocation_started",
            {
                "api_url": EXECUTION_API_URL,
                "channel": channel,
                "text_length": len(user_text),
            },
            context,
        )

        response = invoke_execution_api(
            api_url=EXECUTION_API_URL,
            payload=payload,
            region=os.environ.get("AWS_REGION_NAME", "ap-northeast-1"),
        )

        if response.status_code == 202:
            log_event(
                "INFO",
                "execution_api_invocation_success",
                {
                    "api_url": EXECUTION_API_URL,
                    "status_code": response.status_code,
                },
                context,
            )
        else:
            log_event(
                "WARN",
                "execution_api_invocation_error",
                {
                    "api_url": EXECUTION_API_URL,
                    "status_code": response.status_code,
                    "response_body": response.text,
                },
                context,
            )
    except Exception as e:
        log_event(
            "ERROR",
            "execution_api_invocation_failed",
            {
                "api_url": EXECUTION_API_URL,
                "error": str(e),
            },
            context,
        )
        # Fallback to direct Lambda invocation on error
        lambda_client = boto3.client("lambda")
        lambda_client.invoke(
            FunctionName=bedrock_processor_arn,
            InvocationType="Event",
            Payload=json.dumps(payload),
        )
else:
    # Use direct Lambda invocation (fallback/legacy)
    lambda_client = boto3.client("lambda")
    lambda_client.invoke(
        FunctionName=bedrock_processor_arn,
        InvocationType="Event",
        Payload=json.dumps(payload),
    )
```

**3.2 Update CDK Stack Environment Variables**

Modify `cdk/lib/constructs/slack-event-handler.ts`:

```typescript
environment: {
  // ... existing variables ...
  USE_API_GATEWAY: "false", // Feature flag (set to "true" after testing)
  EXECUTION_API_URL: executionApi?.apiUrl || "", // API Gateway URL
},
```

---

### Step 4: Test in Development Environment

**4.1 Deploy with Feature Flag Disabled**

```bash
cd cdk
cdk deploy
```

**4.2 Enable Feature Flag for Testing**

```bash
# Update Lambda environment variable
aws lambda update-function-configuration \
  --function-name <verification-lambda-name> \
  --environment Variables="{USE_API_GATEWAY=true,EXECUTION_API_URL=<api-gateway-url>,...}"
```

**4.3 Test API Gateway Authentication**

```bash
# Test API Gateway endpoint (should fail without IAM auth)
curl -X POST https://<api-id>.execute-api.<region>.amazonaws.com/prod/execute \
  -H "Content-Type: application/json" \
  -d '{"channel":"C123","text":"test","bot_token":"xoxb-test"}'
# Expected: 403 Forbidden

# Test from Lambda (should succeed)
# Send a Slack message and verify it processes correctly
```

**4.4 Verify CloudWatch Logs**

```bash
# Check Verification Layer logs
aws logs tail /aws/lambda/<verification-lambda-name> --follow

# Check API Gateway logs
aws logs tail /aws/apigateway/<api-id> --follow

# Look for:
# - "execution_api_invocation_started"
# - "execution_api_invocation_success"
# - Authentication errors (if any)
```

---

### Step 5: Gradual Production Rollout

**5.1 Enable Feature Flag for 10% of Requests**

Modify handler to use feature flag with percentage:

```python
import random

USE_API_GATEWAY_PERCENTAGE = float(os.environ.get("USE_API_GATEWAY_PERCENTAGE", "0"))

if random.random() < USE_API_GATEWAY_PERCENTAGE / 100.0:
    # Use API Gateway
else:
    # Use direct Lambda invocation
```

**5.2 Monitor Metrics**

```bash
# Check API Gateway metrics
aws cloudwatch get-metric-statistics \
  --namespace AWS/ApiGateway \
  --metric-name Count \
  --dimensions Name=ApiName,Value=<api-name> \
  --start-time $(date -u -d '1 hour ago' +%Y-%m-%dT%H:%M:%S) \
  --end-time $(date -u +%Y-%m-%dT%H:%M:%S) \
  --period 300 \
  --statistics Sum

# Check error rate
aws cloudwatch get-metric-statistics \
  --namespace AWS/ApiGateway \
  --metric-name 4XXError \
  --dimensions Name=ApiName,Value=<api-name> \
  --start-time $(date -u -d '1 hour ago' +%Y-%m-%dT%H:%M:%S) \
  --end-time $(date -u +%Y-%m-%dT%H:%M:%S) \
  --period 300 \
  --statistics Sum
```

**5.3 Increase Rollout Percentage**

Gradually increase `USE_API_GATEWAY_PERCENTAGE`:
- 10% → Monitor for 1 hour
- 50% → Monitor for 1 hour
- 100% → Monitor for 24 hours

**5.4 Remove Fallback Code**

After 100% migration and verification:
1. Remove direct Lambda invocation code
2. Remove feature flag logic
3. Remove `BEDROCK_PROCESSOR_ARN` environment variable
4. Remove Lambda invoke permissions from Verification Layer role

---

## Troubleshooting

### Issue: 403 Forbidden from API Gateway

**Symptoms**: API Gateway returns 403 Forbidden

**Causes**:
- IAM role ARN mismatch in resource policy
- Missing `execute-api:Invoke` permission
- Incorrect SigV4 signing

**Solutions**:
```bash
# Verify resource policy
aws apigateway get-rest-api --rest-api-id <api-id> --query "policy"

# Verify Lambda role has execute-api permission
aws iam get-role-policy --role-name <role-name> --policy-name <policy-name>

# Check SigV4 signing in Lambda logs
aws logs tail /aws/lambda/<verification-lambda-name> --filter-pattern "execution_api"
```

### Issue: Timeout Errors

**Symptoms**: API Gateway requests timeout

**Causes**:
- API Gateway timeout (29 seconds)
- Lambda function timeout
- Network issues

**Solutions**:
- Verify Execution Layer Lambda timeout is <29 seconds
- Check API Gateway integration timeout
- Verify network connectivity from Lambda to API Gateway

### Issue: Authentication Failures

**Symptoms**: SigV4 signing errors in logs

**Causes**:
- Missing AWS credentials
- Incorrect region
- Clock skew

**Solutions**:
- Verify Lambda execution role has credentials
- Check region matches API Gateway region
- Verify system clock is synchronized (NTP)

---

## Rollback Procedure

If issues occur during migration:

**1. Disable Feature Flag**

```bash
aws lambda update-function-configuration \
  --function-name <verification-lambda-name> \
  --environment Variables="{USE_API_GATEWAY=false,...}"
```

**2. Verify Direct Lambda Invocation**

Send test Slack message and verify it processes correctly.

**3. Investigate Issues**

Check CloudWatch logs and API Gateway metrics to identify root cause.

**4. Fix and Retry**

After fixing issues, retry migration from Step 4.

---

## Verification Checklist

- [ ] API Gateway created and accessible
- [ ] Resource policy restricts access to Verification Layer role only
- [ ] API Gateway client module implemented and tested
- [ ] Feature flag logic implemented in Verification Layer
- [ ] Test requests succeed with IAM authentication
- [ ] CloudWatch logs show successful API Gateway invocations
- [ ] Performance metrics meet targets (≤5% latency increase)
- [ ] Error handling works correctly
- [ ] Gradual rollout completed (10% → 50% → 100%)
- [ ] Fallback code removed after 100% migration

---

## Next Steps

After successful migration:

1. **Monitor**: Set up CloudWatch alarms for authentication failures
2. **Optimize**: Review API Gateway caching if needed
3. **Document**: Update architecture documentation
4. **Cleanup**: Remove unused Lambda invoke permissions

## References

- [API Gateway IAM Authentication](https://docs.aws.amazon.com/apigateway/latest/developerguide/api-gateway-control-access-using-iam-policies-to-invoke-api.html)
- [boto3 SigV4 Signing](https://boto3.amazonaws.com/v1/documentation/api/latest/reference/core/auth.html)
- [API Gateway Resource Policies](https://docs.aws.amazon.com/apigateway/latest/developerguide/apigateway-resource-policies.html)

