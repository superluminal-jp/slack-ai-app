# AWS MCP Orchestrator - Query Examples

This document provides comprehensive examples of queries and expected routing decisions for the AWS MCP Orchestrator skill.

## Table of Contents

1. [Documentation Lookup Examples](#documentation-lookup-examples)
2. [Latest Information Examples](#latest-information-examples)
3. [IAC Assistance Examples](#iac-assistance-examples)
4. [Account Inspection Examples](#account-inspection-examples)
5. [Resource Modification Examples](#resource-modification-examples)
6. [Architectural Guidance Examples](#architectural-guidance-examples)
7. [Multi-Server Orchestration Examples](#multi-server-orchestration-examples)
8. [Fallback Chain Examples](#fallback-chain-examples)
9. [Error Handling Examples](#error-handling-examples)
10. [Edge Cases](#edge-cases)

---

## Documentation Lookup Examples

### Example 1: Lambda Environment Variables

**User Query**:
```
How do I configure environment variables for my Lambda function in CDK?
```

**Expected Routing**:
```
[Intent] DOCUMENTATION_LOOKUP
[Server] knowledge-mcp
[Reason] Common CDK pattern, cached knowledge sufficient
[Safety] Not Required
[Keywords Detected] "how do I", "configure", "CDK"
```

**Expected Response Structure**:
```markdown
[Intent] DOCUMENTATION_LOOKUP
[Server] knowledge-mcp
[Reason] Common Lambda/CDK pattern with well-established best practices

## Configuring Lambda Environment Variables in CDK

In AWS CDK (TypeScript), you configure Lambda environment variables using the `environment` property:

```typescript
import * as lambda from 'aws-cdk-lib/aws-lambda';

const myFunction = new lambda.Function(this, 'MyFunction', {
  runtime: lambda.Runtime.PYTHON_3_11,
  handler: 'index.handler',
  code: lambda.Code.fromAsset('lambda'),
  environment: {
    TABLE_NAME: dynamoTable.tableName,
    API_KEY: 'your-api-key', // Not recommended for secrets
    LOG_LEVEL: 'INFO'
  }
});
```

**Best Practices**:
1. Use Secrets Manager for sensitive data
2. Reference other resource properties (e.g., `table.tableName`)
3. Keep environment variables under 4 KB total

---
ℹ️ Response from knowledge-mcp (cached CDK patterns)
```

---

### Example 2: DynamoDB GSI

**User Query**:
```
What is a DynamoDB Global Secondary Index?
```

**Expected Routing**:
```
[Intent] DOCUMENTATION_LOOKUP
[Server] knowledge-mcp
[Reason] Fundamental DynamoDB concept
[Safety] Not Required
[Keywords Detected] "what is", "DynamoDB"
```

**Expected Response**:
```markdown
[Intent] DOCUMENTATION_LOOKUP
[Server] knowledge-mcp
[Reason] Core DynamoDB concept with stable documentation

## DynamoDB Global Secondary Index (GSI)

A Global Secondary Index is an index with a partition key and optional sort key that can be different from those on the base table.

**Key Characteristics**:
- Different partition and sort keys from base table
- Queries span all partitions
- Eventually consistent reads
- Can be created/deleted after table creation
- Has its own provisioned throughput (if not using on-demand)

**Use Cases**:
- Query data using different access patterns
- Support multiple query patterns on same data
- Enable queries on non-key attributes

**Example**:
```python
# Base table: PK=user_id, SK=timestamp
# GSI: PK=workspace_id, SK=timestamp
# Enables querying all messages in a workspace
```

**Limitations**:
- Max 20 GSIs per table
- Projection size impacts costs
- Eventually consistent (no strongly consistent reads)

---
ℹ️ Response from knowledge-mcp
```

---

### Example 3: API Gateway Authentication

**User Query**:
```
Explain API Gateway authentication methods
```

**Expected Routing**:
```
[Intent] DOCUMENTATION_LOOKUP
[Server] knowledge-mcp
[Reason] Well-documented authentication concepts
[Safety] Not Required
[Keywords Detected] "explain", "authentication"
```

---

## Latest Information Examples

### Example 4: Latest Lambda Runtimes

**User Query**:
```
What are the latest Lambda runtime versions available in 2025?
```

**Expected Routing**:
```
[Intent] LATEST_INFORMATION
[Server] documentation-mcp
[Reason] User explicitly requested latest information (2025)
[Safety] Not Required
[Keywords Detected] "latest", "2025", "available"
[Caveat] Subject to rate limiting
```

**Expected Response**:
```markdown
[Intent] LATEST_INFORMATION
[Server] documentation-mcp
[Reason] Freshness priority for current runtime versions

## Latest Lambda Runtime Versions (2025)

**Python**:
- Python 3.12 (Recommended)
- Python 3.11 (Supported)
- Python 3.10 (Supported)
- Python 3.9 (Deprecated - migrate by Dec 2025)

**Node.js**:
- Node.js 20.x (Recommended)
- Node.js 18.x (Supported)

**Java**:
- Java 21 (Corretto)
- Java 17 (Corretto)
- Java 11 (Corretto)

**Other**:
- .NET 8
- Ruby 3.2
- Go 1.x (custom runtime)

**Deprecation Schedule**:
- Python 3.9: December 2025
- Node.js 16: March 2025

---
ℹ️ Response from documentation-mcp (latest official AWS documentation)
⚠️ Deprecation dates are subject to change - check AWS console for updates
```

---

### Example 5: New Bedrock Models

**User Query**:
```
What new Claude models were released in Bedrock recently?
```

**Expected Routing**:
```
[Intent] LATEST_INFORMATION
[Server] documentation-mcp
[Reason] User requested recent releases
[Safety] Not Required
[Keywords Detected] "new", "recently", "released"
```

---

### Example 6: Current API Gateway Features

**User Query**:
```
What are the newest API Gateway features?
```

**Expected Routing**:
```
[Intent] LATEST_INFORMATION
[Server] documentation-mcp
[Reason] User requested newest features
[Safety] Not Required
[Keywords Detected] "newest", "features"
[Fallback] knowledge-mcp if rate limited
```

---

## IAC Assistance Examples

### Example 7: Lambda with DynamoDB CDK

**User Query**:
```
Generate CDK code for a Lambda function that reads from DynamoDB
```

**Expected Routing**:
```
[Intent] IAC_ASSISTANCE
[Server] iac-mcp + knowledge-mcp
[Reason] Infrastructure code generation with best practices context
[Safety] Not Required (code generation only, no deployment)
[Keywords Detected] "generate", "CDK", "Lambda", "DynamoDB"
[Project Context] Slack AI App (Python Lambda, DynamoDB ConversationHistory)
```

**Expected Response**:
```markdown
[Intent] IAC_ASSISTANCE
[Server] iac-mcp + knowledge-mcp
[Reason] CDK code generation optimized for Slack AI App context
[Project Context] Python 3.11 Lambda with DynamoDB access

## CDK Code for Lambda with DynamoDB Access

```typescript
import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import { Construct } from 'constructs';

export class LambdaDynamoStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // DynamoDB Table
    const table = new dynamodb.Table(this, 'ConversationHistory', {
      partitionKey: {
        name: 'workspace_channel_id',
        type: dynamodb.AttributeType.STRING
      },
      sortKey: {
        name: 'timestamp_message_id',
        type: dynamodb.AttributeType.STRING
      },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      timeToLiveAttribute: 'ttl',
      pointInTimeRecovery: true,
      removalPolicy: cdk.RemovalPolicy.RETAIN
    });

    // Lambda Function
    const handler = new lambda.Function(this, 'SlackAiHandler', {
      runtime: lambda.Runtime.PYTHON_3_11,
      handler: 'index.handler',
      code: lambda.Code.fromAsset('lambda'),
      environment: {
        TABLE_NAME: table.tableName,
        LOG_LEVEL: 'INFO'
      },
      timeout: cdk.Duration.seconds(30),
      memorySize: 256
    });

    // Grant Lambda read permissions
    table.grantReadData(handler);
  }
}
```

**Best Practices Applied**:
1. ✅ Pay-per-request billing for variable workload
2. ✅ Point-in-time recovery for data protection
3. ✅ TTL for automatic data lifecycle
4. ✅ RETAIN policy to prevent accidental deletion
5. ✅ Least privilege (read-only access)
6. ✅ Environment variable for table name
7. ✅ Python 3.11 runtime (latest stable)

**Next Steps**:
1. Review code with code-review-assistant
2. Implement Lambda handler with coding-assistant
3. Deploy with safety confirmation

---
ℹ️ Response from iac-mcp + knowledge-mcp
📋 Project context: Slack AI App patterns applied
```

---

### Example 8: API Gateway REST API CDK

**User Query**:
```
Create API Gateway REST API with API key authentication in CDK
```

**Expected Routing**:
```
[Intent] IAC_ASSISTANCE
[Server] iac-mcp + knowledge-mcp
[Reason] API Gateway CDK code with authentication patterns
[Safety] Not Required
[Keywords Detected] "create", "API Gateway", "CDK"
[Project Context] Slack AI App uses API key authentication
```

---

### Example 9: CloudFormation Template Review

**User Query**:
```
Review this CloudFormation template for best practices
```

**Expected Routing**:
```
[Intent] IAC_ASSISTANCE
[Server] iac-mcp + knowledge-mcp
[Reason] Template validation and best practices check
[Safety] Not Required
[Keywords Detected] "review", "CloudFormation"
[Note] May coordinate with code-review-assistant for thorough review
```

---

## Account Inspection Examples

### Example 10: List Lambda Functions

**User Query**:
```
List all Lambda functions in my account
```

**Expected Routing**:
```
[Intent] ACCOUNT_INSPECTION
[Server] account-mcp (read-only)
[Account] Current AWS account
[Region] us-east-1 (default or detected)
[Reason] Requires live account access
[Safety] Read-only operation, no modifications
[Keywords Detected] "list", "my account"
```

**Expected Response**:
```markdown
[Intent] ACCOUNT_INSPECTION
[Server] account-mcp (read-only)
[Account] AWS Account: 123456789012
[Region] us-east-1
[Safety] Read-only operation

## Lambda Functions in Account

**Slack AI App Functions**:
1. **slack-ai-handler-dev**
   - Runtime: python3.11
   - Memory: 256 MB
   - Timeout: 30s
   - Last Modified: 2025-12-28

2. **slack-ai-handler-staging**
   - Runtime: python3.11
   - Memory: 512 MB
   - Timeout: 30s
   - Last Modified: 2025-12-27

3. **slack-ai-handler-prod**
   - Runtime: python3.11
   - Memory: 512 MB
   - Timeout: 30s
   - Last Modified: 2025-12-20

**Other Functions**:
4. test-function
5. legacy-processor

**Total**: 5 functions

---
ℹ️ Response from account-mcp (live account data)
🔒 Read-only operation - no resources modified
```

---

### Example 11: Show DynamoDB Tables

**User Query**:
```
What DynamoDB tables exist in my account?
```

**Expected Routing**:
```
[Intent] ACCOUNT_INSPECTION
[Server] account-mcp (read-only)
[Reason] Live account resource listing
[Safety] Read-only
[Keywords Detected] "what", "exist", "my account"
```

---

### Example 12: API Gateway Endpoints

**User Query**:
```
Show me my API Gateway REST APIs
```

**Expected Routing**:
```
[Intent] ACCOUNT_INSPECTION
[Server] account-mcp (read-only)
[Reason] Live API inspection
[Safety] Read-only
[Keywords Detected] "show me", "my"
```

---

## Resource Modification Examples

### Example 13: Create Lambda Function

**User Query**:
```
Create a Lambda function called test-processor
```

**Expected Routing**:
```
[Intent] RESOURCE_MODIFICATION
[Server] resource-mcp (pending confirmation)
[Safety Gate] ACTIVATED
[Reason] Will create new AWS resource
[Keywords Detected] "create"
```

**Expected Safety Gate Response**:
```markdown
[Intent] RESOURCE_MODIFICATION
[Safety Gate] ACTIVATED

⚠️  WARNING: This query will MODIFY AWS resources.

## Resource Details
- **Type**: AWS Lambda Function
- **Name**: test-processor
- **Region**: us-east-1 (default)

## Action
**CREATE**

## Current State
Function 'test-processor' does not exist

## Proposed Changes
Create new Lambda function with:
- Name: test-processor
- Runtime: (not specified - requires specification)
- Memory: (not specified - default 128 MB)
- Timeout: (not specified - default 3 seconds)
- Handler: (not specified - requires specification)
- Code: (not specified - requires specification)

## Impact Analysis

**Reversibility**: Yes
- Can be deleted after creation
- No data loss risk (new resource)

**Cost Impact**: Low
- Free tier: 1M requests/month, 400,000 GB-seconds compute
- Pay only for invocations beyond free tier
- Est. cost: $0-5/month for low usage

**Downtime Risk**: None
- New resource, no existing dependencies

**Dependencies**: None identified

## Missing Specifications
⚠️ The following must be specified before creation:
1. **Runtime** (e.g., python3.11, nodejs20.x)
2. **Handler** (e.g., index.handler)
3. **Code source** (S3, inline, or ZIP)
4. **IAM role** (or create new with basic permissions)

## Required Action

Please provide missing specifications first, then type:
- `CONFIRM` - Proceed with creation (after specifications provided)
- `CANCEL` - Abort operation

**Provide specifications or cancel:**
```

---

### Example 14: Update Lambda Memory

**User Query**:
```
Update slack-ai-handler Lambda memory to 512MB
```

**Expected Routing**:
```
[Intent] RESOURCE_MODIFICATION
[Server] resource-mcp (pending confirmation)
[Safety Gate] ACTIVATED
[Reason] Will modify existing AWS resource
[Keywords Detected] "update", "memory"
```

**Expected Safety Gate Response**:
```markdown
[Intent] RESOURCE_MODIFICATION
[Safety Gate] ACTIVATED

⚠️  WARNING: This query will MODIFY AWS resources.

## Resource Details
- **Type**: AWS Lambda Function
- **Name**: slack-ai-handler
- **Region**: us-east-1

## Action
**UPDATE** - Memory configuration

## Current State
Inspecting current configuration...

[Querying account-mcp...]

Current configuration:
- Memory: 256 MB
- Timeout: 30 seconds
- Runtime: python3.11

## Proposed Changes
```diff
- Memory: 256 MB
+ Memory: 512 MB
```

Other settings unchanged:
- Timeout: 30 seconds (unchanged)
- Runtime: python3.11 (unchanged)

## Impact Analysis

**Reversibility**: Yes
- Can change back to 256 MB anytime
- No data loss risk

**Cost Impact**: Medium
- Current cost: ~$0.000000833/GB-second
- New cost: ~$0.000001667/GB-second (2x)
- Est. monthly increase: $5-10 for typical Slack app usage

**Downtime Risk**: Low
- Brief moment during update (<1 second)
- Existing connections not affected
- No cold start penalty increase

**Performance Impact**: Positive
- May reduce execution time
- Better for memory-intensive operations
- May reduce cold starts

**Dependencies**: None
- No other resources affected
- API Gateway integration unchanged

## Preview
```json
{
  "FunctionName": "slack-ai-handler",
  "MemorySize": 512,
  "Runtime": "python3.11",
  "Timeout": 30
}
```

## Safety Checklist
- [x] Current state inspected
- [x] Impact analyzed
- [ ] Ready to proceed

## Required Action

Type one of:
- `CONFIRM` - Proceed with memory update to 512 MB
- `CANCEL` - Abort operation

**Your choice:**
```

---

### Example 15: Delete DynamoDB Table

**User Query**:
```
Delete the old-conversation-history DynamoDB table
```

**Expected Routing**:
```
[Intent] RESOURCE_MODIFICATION
[Server] resource-mcp (pending confirmation)
[Safety Gate] ACTIVATED
[Reason] Will DELETE AWS resource (HIGH RISK)
[Keywords Detected] "delete"
```

**Expected Safety Gate Response**:
```markdown
[Intent] RESOURCE_MODIFICATION
[Safety Gate] ACTIVATED - HIGH RISK OPERATION

🛑 CRITICAL WARNING: This query will DELETE AWS resources with DATA LOSS.

## Resource Details
- **Type**: DynamoDB Table
- **Name**: old-conversation-history
- **Region**: us-east-1

## Action
**DELETE** ⚠️  IRREVERSIBLE

## Current State
Inspecting table...

[Querying account-mcp...]

Table details:
- Status: ACTIVE
- Item count: ~15,234 items
- Size: ~45 MB
- Billing mode: PAY_PER_REQUEST
- Point-in-time recovery: ENABLED (last backup: 2025-12-28)

## Proposed Changes
**PERMANENT DELETION** of:
- Table: old-conversation-history
- All data: ~15,234 conversation records
- All indexes: 2 GSIs
- Backups: Will be retained for 35 days (PITR)

## Impact Analysis

**Reversibility**: Limited
- ❌ Cannot undo deletion
- ✅ Can restore from PITR backup (if within 35 days)
- ✅ Latest backup: 2025-12-28 23:45 UTC
- ⚠️ Restore creates NEW table, not in-place

**Data Loss Risk**: HIGH
- Will lose all data if no backup exists
- PITR backup available: Yes (35 days retention)
- Manual backups: (checking...)

**Cost Impact**: Negative (saves cost)
- Current cost: ~$2/month (PAY_PER_REQUEST)
- After deletion: $0
- Backup retention cost: $0.20/GB/month for 35 days

**Downtime Risk**: High (if in use)
- Any applications using this table will FAIL
- No automatic migration path

**Dependencies**:
(Checking Lambda functions, API Gateway...)
- ⚠️  Used by: lambda-old-processor (last invocation: 90 days ago)
- ✅ Not used by current Slack AI app

## Recommendations

Before deletion:
1. ✅ Verify data is no longer needed
2. ✅ Export data to S3 (if needed for archival)
3. ✅ Update any applications still referencing this table
4. ✅ Consider disabling instead of deleting

## Required Actions

**STOP**: Consider these safer alternatives:
1. **Export data first**: Create on-demand backup to S3
2. **Disable access**: Remove IAM permissions instead
3. **Wait**: Delay deletion for 30 days

**To proceed with deletion:**
1. Type `EXPORT` to export data to S3 first
2. Type `CONFIRM DELETE old-conversation-history` (exact match required)
3. Type `CANCEL` to abort

**Your choice:**
```

---

## Architectural Guidance Examples

### Example 16: DynamoDB vs RDS

**User Query**:
```
Should I use DynamoDB or RDS for my Slack conversation history?
```

**Expected Routing**:
```
[Intent] ARCHITECTURAL_GUIDANCE
[Server] knowledge-mcp + thinking-assistant
[Reason] Requires both AWS database knowledge and trade-off analysis
[Approach] Two-phase: AWS patterns → Decision analysis
[Keywords Detected] "should I", "vs"
[Project Context] Slack AI App conversation history
```

**Expected Response**:
```markdown
[Intent] ARCHITECTURAL_GUIDANCE
[Servers] knowledge-mcp + thinking-assistant
[Approach] Sequential analysis
[Reason] Database selection requires both AWS knowledge and design trade-offs
[Project Context] Slack AI App conversation history

## Phase 1: AWS Database Patterns (knowledge-mcp)

### DynamoDB Characteristics
**Strengths**:
- Serverless (no infrastructure management)
- Predictable single-digit millisecond latency
- Built-in TTL for automatic data expiration
- Pay-per-request pricing (cost-efficient for variable load)
- Seamless scaling to any workload
- Native AWS integration (Lambda, IAM)

**Weaknesses**:
- Complex queries require GSI (Global Secondary Index)
- No joins (denormalization required)
- Learning curve for single-table design
- Limited transaction support

**Best For**:
- Key-value access patterns
- Time-series data
- Variable, unpredictable load
- Serverless architectures

### RDS (PostgreSQL/MySQL) Characteristics
**Strengths**:
- Familiar SQL queries
- Complex joins and aggregations
- ACID transactions
- Mature ecosystem and tools

**Weaknesses**:
- Instance-based (not serverless)
- Requires capacity planning
- Cold start for infrequent access
- Higher operational overhead
- Fixed cost (even when idle)

**Best For**:
- Complex relational queries
- Existing SQL knowledge
- Consistent, predictable load

## Phase 2: Decision Analysis (thinking-assistant)

### Slack Conversation History Access Patterns

**Primary Queries**:
1. Get recent messages for channel (by timestamp)
2. Get user's messages across channels
3. Search messages by thread_id
4. Retrieve conversation context (last N messages)

**Analysis**:
- ✅ All queries are key-based or time-based (DynamoDB strength)
- ❌ No complex joins needed
- ✅ Variable load (Slack events are unpredictable)
- ✅ Time-series data (natural sort by timestamp)

### Workload Characteristics

**Slack AI App Load**:
- Unpredictable spikes (when Slack messages arrive)
- Idle periods (nights, weekends)
- Read-heavy (context retrieval for AI)
- TTL needed (90-day retention for compliance)

**Analysis**:
- ✅ DynamoDB pay-per-request perfect for variable load
- ❌ RDS fixed instance cost wasteful during idle periods
- ✅ DynamoDB TTL built-in
- ❌ RDS would need scheduled cleanup

### Cost Comparison (Estimated)

**DynamoDB** (Pay-per-request):
- Low usage: $0-2/month
- Medium usage: $5-10/month
- High usage: $20-30/month
- Scales with actual usage

**RDS** (db.t3.micro):
- Fixed: ~$15/month (even when idle)
- Backup storage: +$2-5/month
- No elasticity

### Trade-Off Matrix

| Criteria | DynamoDB | RDS | Winner |
|----------|----------|-----|--------|
| Serverless | ✅ Yes | ❌ No | DynamoDB |
| Cost (variable load) | ✅ Low | ❌ High | DynamoDB |
| Latency | ✅ <10ms | ⚠️ ~20ms | DynamoDB |
| Query complexity | ⚠️ Simple | ✅ Complex | Tie (simple OK) |
| TTL support | ✅ Native | ❌ Manual | DynamoDB |
| Lambda integration | ✅ Excellent | ⚠️ Connection pooling | DynamoDB |
| Operational overhead | ✅ None | ❌ High | DynamoDB |

## Recommendation

**Use DynamoDB** for Slack conversation history.

**Rationale**:
1. ✅ Access patterns match DynamoDB strengths (key-value, time-series)
2. ✅ Variable load suits pay-per-request pricing
3. ✅ Native TTL for compliance (90-day retention)
4. ✅ Serverless aligns with Lambda architecture
5. ✅ Lower cost for unpredictable Slack workload
6. ✅ No operational overhead

**Recommended Design**:
```
Table: ConversationHistory

PK: workspace_id#channel_id
SK: timestamp#message_id

GSI-1:
PK: workspace_id#user_id
SK: timestamp

Attributes:
- message_text
- thread_ts
- user_name
- ttl (90 days)
```

**When RDS Would Be Better**:
- ❌ Need complex joins across multiple entities
- ❌ Require ACID transactions across tables
- ❌ Have consistent, predictable 24/7 load
- ❌ Team only knows SQL (but learning DynamoDB is worthwhile)

## Next Steps

1. Review design with code-documentation-assistant (create ADR)
2. Generate CDK code with iac-mcp
3. Implement with coding-assistant
4. Set up monitoring with CloudWatch

---
ℹ️ Response from knowledge-mcp + thinking-assistant
📊 Decision: DynamoDB (serverless, cost-efficient, perfect fit)
📋 Project context: Slack AI App requirements applied
```

---

### Example 17: Lambda Architecture Pattern

**User Query**:
```
What's the best way to structure my Lambda functions for the Slack app?
```

**Expected Routing**:
```
[Intent] ARCHITECTURAL_GUIDANCE
[Server] knowledge-mcp + thinking-assistant
[Reason] Lambda architecture requires both patterns and design analysis
[Keywords Detected] "best way", "structure"
[Project Context] Slack AI App
```

---

### Example 18: API Gateway vs ALB

**User Query**:
```
Should I use API Gateway or Application Load Balancer?
```

**Expected Routing**:
```
[Intent] ARCHITECTURAL_GUIDANCE
[Server] knowledge-mcp + thinking-assistant
[Reason] Infrastructure decision requires trade-off analysis
[Keywords Detected] "should I", "vs"
```

---

## Multi-Server Orchestration Examples

### Example 19: Security Audit

**User Query**:
```
Review the security of my Lambda function and API Gateway setup
```

**Expected Routing**:
```
[Intent] Multi-faceted (ACCOUNT_INSPECTION + ARCHITECTURAL_GUIDANCE)
[Servers] account-mcp + knowledge-mcp + code-review-assistant
[Approach] Sequential
[Phase 1] account-mcp - Inspect current configuration
[Phase 2] knowledge-mcp - Security best practices
[Phase 3] code-review-assistant - Security audit
[Reason] Requires live config, best practices, and security review
```

**Expected Response**:
```markdown
[Intent] Security Audit (Multi-phase)
[Servers] account-mcp → knowledge-mcp → code-review-assistant
[Approach] Sequential analysis

## Phase 1: Current Configuration (account-mcp)

Inspecting Lambda and API Gateway...

**Lambda: slack-ai-handler**
- Runtime: python3.11 ✅
- IAM Role: slack-ai-handler-role
- Environment Variables: 5 variables (some may contain secrets)
- VPC: None (public Lambda)
- Timeout: 30s
- Memory: 256 MB

**API Gateway: slack-ai-api**
- Type: REST API
- Authentication: API Key + IAM
- Encryption: TLS 1.2
- Logging: Enabled
- Throttling: Default (10,000 rps)

## Phase 2: Security Best Practices (knowledge-mcp)

### Lambda Security
✅ **Recommended**:
1. Store secrets in Secrets Manager (not env vars)
2. Enable X-Ray tracing
3. Use least privilege IAM roles
4. Enable function-level concurrent execution limits
5. Validate all inputs

### API Gateway Security
✅ **Recommended**:
1. Enable WAF for DDoS protection
2. Implement request validation
3. Use usage plans with rate limiting
4. Enable CloudWatch Logs for auditing
5. Rotate API keys regularly

## Phase 3: Security Findings (code-review-assistant)

Coordinating with code-review-assistant for detailed security audit...

### Critical Issues
🔴 **HIGH**: API keys detected in Lambda environment variables
- Location: Environment variable `SLACK_API_KEY`
- Risk: Exposed in console, logs, and CloudFormation
- Fix: Move to Secrets Manager

🔴 **HIGH**: No input validation on API Gateway
- Risk: SQL injection, XSS, malformed requests
- Fix: Add request validators and JSON schema

### Medium Issues
🟡 **MEDIUM**: Overly permissive IAM role
- Current: `dynamodb:*` on all tables
- Risk: Lateral movement if compromised
- Fix: Restrict to specific tables and actions (GetItem, PutItem)

🟡 **MEDIUM**: No WAF configured
- Risk: DDoS, bot attacks
- Fix: Enable AWS WAF with rate limiting rules

### Low Issues
🟢 **LOW**: CloudWatch Logs retention not set
- Current: Never expire
- Risk: Unnecessary cost and compliance issues
- Fix: Set 90-day retention

🟢 **LOW**: No X-Ray tracing
- Risk: Difficult debugging
- Fix: Enable X-Ray

## Recommendations

**Immediate Actions (Critical)**:
1. Move all secrets to Secrets Manager
   ```bash
   # Use this approach
   import boto3
   secrets_client = boto3.client('secretsmanager')
   secret = secrets_client.get_secret_value(SecretId='slack-api-key')
   ```

2. Add API Gateway request validation
   ```typescript
   // CDK example
   const requestValidator = new apigateway.RequestValidator(this, 'Validator', {
     restApi: api,
     validateRequestBody: true,
     validateRequestParameters: true
   });
   ```

**Next Steps (Medium Priority)**:
3. Restrict IAM permissions
4. Enable WAF
5. Set log retention policies

**Long-term (Low Priority)**:
6. Enable X-Ray tracing
7. Implement automated security scanning

## Next Steps

1. Fix critical issues immediately
2. Create ADR for security decisions (code-documentation-assistant)
3. Implement fixes with coding-assistant
4. Re-audit after fixes

---
ℹ️ Multi-server orchestration: account-mcp → knowledge-mcp → code-review-assistant
🔒 Security audit complete - 2 critical, 2 medium, 2 low issues found
```

---

### Example 20: Full Stack Implementation Guidance

**User Query**:
```
Help me implement a new feature: store Slack reactions in DynamoDB and retrieve them
```

**Expected Routing**:
```
[Intent] Multi-faceted (ARCHITECTURAL_GUIDANCE + IAC_ASSISTANCE)
[Servers] knowledge-mcp → thinking-assistant → iac-mcp → coding-assistant
[Approach] Sequential workflow
[Phase 1] Architecture design
[Phase 2] CDK code generation
[Phase 3] Implementation guidance
```

---

## Fallback Chain Examples

### Example 21: Rate Limit Fallback

**User Query**:
```
What are the latest Bedrock pricing changes in 2025?
```

**Expected Routing**:
```
[Intent] LATEST_INFORMATION
[Server] documentation-mcp (primary)
[Fallback] knowledge-mcp (if rate limited)
[Reason] Freshness required but fallback available
```

**Expected Response (with fallback)**:
```markdown
[Intent] LATEST_INFORMATION
[Server] documentation-mcp → knowledge-mcp (fallback)

[Querying documentation-mcp...]
[Status] ❌ Rate limit exceeded
[Error] 429 Too Many Requests - Limit: 10 req/min
[Retry After] 45 seconds
[Fallback] Routing to knowledge-mcp...

[Querying knowledge-mcp...]
[Status] ✅ Success

## Bedrock Pricing (as of January 2025)

**Claude Models**:
- Claude 3.5 Haiku: $0.25/1M input tokens, $1.25/1M output tokens
- Claude 3.5 Sonnet: $3/1M input tokens, $15/1M output tokens
- Claude 3 Opus: $15/1M input tokens, $75/1M output tokens

**Other Models**:
- Titan Text: $0.20/1M tokens
- Jurassic-2: $0.80/1M tokens

---
⚠️ Note: This response is from knowledge-mcp due to documentation-mcp rate limiting.
Information is current as of January 2025 but may not include very recent changes.

For guaranteed latest pricing:
- Wait 45 seconds and retry
- Check AWS Pricing Calculator: https://calculator.aws
- View AWS Console: Bedrock → Pricing
```

---

### Example 22: Server Unavailable Fallback

**User Query**:
```
How do I optimize Lambda cold starts?
```

**Expected Routing (with failure)**:
```
[Intent] DOCUMENTATION_LOOKUP
[Server] knowledge-mcp → documentation-mcp (fallback)

[Querying knowledge-mcp...]
[Status] ❌ Service unavailable
[Error] 503 Service Temporarily Unavailable
[Fallback] Routing to documentation-mcp...

[Querying documentation-mcp...]
[Status] ✅ Success

{response from documentation-mcp}

---
ℹ️ Response from documentation-mcp (knowledge-mcp temporarily unavailable)
```

---

## Error Handling Examples

### Example 23: Ambiguous Query

**User Query**:
```
Create function
```

**Expected Response**:
```markdown
[Error] Query ambiguous - insufficient context

I need more information to route your request appropriately.

**Possible interpretations**:
1. Create AWS Lambda function → resource-mcp (with safety gate)
2. Generate CDK function code → iac-mcp
3. Explain how to create functions → knowledge-mcp

**Please clarify**:
- What type of resource? (Lambda, DynamoDB, API Gateway?)
- Do you want to actually create it (requires safety gate) or just learn how?
- What specifications? (runtime, name, configuration?)

**Example clarifications**:
- "Create Lambda function called test-handler with Python 3.11"
- "Show me how to create Lambda functions in CDK"
- "Generate CDK code for Lambda function"
```

---

### Example 24: Missing Specifications

**User Query**:
```
Create a DynamoDB table
```

**Expected Response**:
```markdown
[Intent] RESOURCE_MODIFICATION
[Safety Gate] ACTIVATED

⚠️  This query will create AWS resources but is missing required specifications.

## Missing Information

To create a DynamoDB table, I need:

**Required**:
1. **Table name** (e.g., "ConversationHistory")
2. **Partition key** name and type (STRING, NUMBER, BINARY)
3. **Sort key** (optional) name and type

**Optional (recommended)**:
4. Billing mode (PAY_PER_REQUEST or PROVISIONED)
5. Global Secondary Indexes (GSI)
6. Time-to-Live (TTL) attribute
7. Point-in-time recovery (enabled/disabled)
8. Encryption settings

## Examples

**Simple table**:
```
Create DynamoDB table called UserProfiles with partition key user_id (STRING)
```

**Complex table**:
```
Create DynamoDB table called ConversationHistory with:
- Partition key: workspace_channel_id (STRING)
- Sort key: timestamp_message_id (STRING)
- Billing: PAY_PER_REQUEST
- TTL attribute: expiry_time
- Point-in-time recovery: enabled
```

**Please provide specifications and resubmit your request.**
```

---

### Example 25: Invalid Confirmation

**User Query** (after safety gate):
```
yes please do it
```

**Expected Response**:
```markdown
[Error] Invalid confirmation response

**Expected**: Exactly one of these commands:
- `INSPECT` - View current resource state
- `CONFIRM` - Proceed with modification
- `CANCEL` - Abort operation

**Received**: "yes please do it"

⚠️ For safety, resource modifications require **exact** keyword matching.

**Please type exactly**:
- `CONFIRM` (to proceed)
- `CANCEL` (to abort)
```

---

## Edge Cases

### Example 26: Multi-Intent Query

**User Query**:
```
List my Lambda functions and help me decide if I should migrate to Python 3.12
```

**Expected Response**:
```markdown
[Intent] Multiple intents detected
[Intents] ACCOUNT_INSPECTION + ARCHITECTURAL_GUIDANCE
[Approach] Sequential two-phase

I'll handle this in two phases:

## Phase 1: Account Inspection

[Server] account-mcp
[Action] Listing Lambda functions...

{list of Lambda functions with current runtimes}

## Phase 2: Architectural Guidance

[Server] knowledge-mcp + thinking-assistant
[Action] Analyzing migration decision...

### Python 3.12 Migration Analysis

**Current State**: {X} functions using Python 3.11

**Benefits of Python 3.12**:
- Performance improvements (10-15% faster)
- Better error messages
- New typing features
- Latest security patches

**Migration Effort**: Low
- Code changes: Minimal (mostly compatible)
- Testing required: Yes (regression testing)
- Downtime: None (rolling deployment)

**Recommendation**: {based on analysis}

---
ℹ️ Multi-intent orchestration: account-mcp → knowledge-mcp + thinking-assistant
```

---

### Example 27: Project Context Override

**User Query**:
```
I'm working on a different project (not Slack app). How do I design a DynamoDB table for IoT sensor data?
```

**Expected Response**:
```markdown
[Intent] ARCHITECTURAL_GUIDANCE
[Server] knowledge-mcp + thinking-assistant
[Project Context] Override detected - IoT sensor data (not Slack AI App)
[Reason] User explicitly specified different use case

## IoT Sensor Data in DynamoDB

{Response tailored to IoT use case, not Slack app}

---
ℹ️ Response for IoT sensor data (not Slack AI App context)
```

---

### Example 28: Dry Run Request

**User Query**:
```
What would happen if I deleted my ConversationHistory table? Don't actually delete it.
```

**Expected Response**:
```markdown
[Intent] HYPOTHETICAL_ANALYSIS (not RESOURCE_MODIFICATION)
[Server] account-mcp (read-only) + knowledge-mcp
[Safety Gate] Not activated (hypothetical query only)
[Reason] User explicitly requested simulation, not execution

## Hypothetical: Deleting ConversationHistory Table

### Current State (account-mcp)
{current table details}

### Impact Analysis (knowledge-mcp)

**If deleted**:
- ❌ All conversation history lost (~X items)
- ❌ Slack AI app would fail (cannot retrieve context)
- ✅ Could restore from PITR backup (if within 35 days)
- 💰 Would save ~$X/month

**Applications Affected**:
- slack-ai-handler Lambda (critical)
- conversation-analytics Lambda (minor)

**Recovery Options**:
1. Restore from PITR (creates new table)
2. Restore from on-demand backup (if exists)
3. Cannot recover if >35 days

**Recommendation**: Do NOT delete unless:
- [ ] Data backed up to S3
- [ ] Application migrated to new table
- [ ] 30-day waiting period observed

---
ℹ️ Hypothetical analysis only - no resources modified
🔒 To actually delete, omit "don't delete" and go through safety gate
```

---

## Summary Statistics

**Total Examples**: 28

**By Intent Type**:
- DOCUMENTATION_LOOKUP: 3 examples
- LATEST_INFORMATION: 3 examples
- IAC_ASSISTANCE: 3 examples
- ACCOUNT_INSPECTION: 3 examples
- RESOURCE_MODIFICATION: 3 examples
- ARCHITECTURAL_GUIDANCE: 3 examples
- Multi-Server: 3 examples
- Fallback Chain: 2 examples
- Error Handling: 3 examples
- Edge Cases: 3 examples

**Safety Gates Activated**: 5 examples (all RESOURCE_MODIFICATION)

**Multi-Server Orchestration**: 7 examples

**Fallback Chains**: 2 examples

---

**Version**: 1.0
**Last Updated**: 2025-12-29
**Coverage**: All intent types, safety gates, fallbacks, errors, edge cases
