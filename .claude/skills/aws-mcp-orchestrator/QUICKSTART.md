# AWS MCP Orchestrator - Quick Start Guide

## What This Is

The AWS MCP Orchestrator is an intelligent assistant that automatically selects the right AWS MCP server for your queries. Think of it as a smart router that:

1. Understands what you're asking
2. Picks the best tool to answer
3. Keeps you safe from accidental mistakes
4. Explains what it's doing

## 5-Minute Quick Start

### Step 1: Prerequisites

Make sure you have:

- ✅ AWS MCP servers configured (see main README.md)
- ✅ `uv` package manager installed
- ✅ AWS credentials configured (for account operations)

### Step 2: How It Works

Simply ask AWS-related questions naturally. The orchestrator automatically activates and routes your query.

**No special commands needed** - just ask your question!

### Step 3: Try These Examples

#### Example 1: Documentation Lookup (Safest)

```
You: How do I configure Lambda environment variables?

Orchestrator:
📋 Intent: DOCUMENTATION_LOOKUP
🔍 Server: knowledge-mcp
💡 Reason: General AWS concept, stable documentation
✅ Safety: No auth required, read-only

Lambda environment variables can be configured in several ways:

1. **Using AWS Console**:
   - Navigate to your Lambda function
   - Go to Configuration → Environment variables
   - Click Edit → Add environment variable
   - Enter key-value pairs

2. **Using AWS CLI**:
   ```bash
   aws lambda update-function-configuration \
     --function-name my-function \
     --environment Variables={KEY1=value1,KEY2=value2}
   ```

3. **Using AWS CDK** (for this project):
   ```typescript
   const fn = new lambda.Function(this, 'MyFunction', {
     environment: {
       KEY1: 'value1',
       KEY2: 'value2'
     }
   });
   ```

---
Powered by knowledge-mcp
```

**What happened**:
- Detected "how to configure" → DOCUMENTATION_LOOKUP intent
- Routed to knowledge-mcp (fast, cached, no auth)
- Provided comprehensive answer with code examples

#### Example 2: Latest Information

```
You: What are the latest Lambda runtime versions in 2025?

Orchestrator:
📋 Intent: LATEST_INFORMATION
🔍 Server: documentation-mcp
💡 Reason: Query contains "latest" and "2025" - requires fresh data
✅ Safety: No auth required, read-only

Latest Lambda Runtime Versions (as of December 2025):

**Python**:
- Python 3.13 (latest)
- Python 3.12
- Python 3.11
- Python 3.10
- Python 3.9 (deprecated soon)

**Node.js**:
- Node.js 22.x (latest)
- Node.js 20.x
- Node.js 18.x
- Node.js 16.x (deprecated)

**For this Slack AI App project**: Currently using Python 3.11, which is supported and recommended.

---
Powered by documentation-mcp
```

**What happened**:
- Detected "latest" + "2025" → LATEST_INFORMATION intent
- Routed to documentation-mcp (fresh, up-to-date)
- Added project context (Python 3.11)

#### Example 3: Infrastructure as Code

```
You: Generate CDK code for API Gateway with API key authentication

Orchestrator:
📋 Intent: IAC_ASSISTANCE
🔍 Server: iac-mcp
💡 Reason: CDK code generation request
✅ Safety: Code generation only, no resource creation

Here's CDK TypeScript code for API Gateway with API key authentication:

```typescript
import * as cdk from 'aws-cdk-lib';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import { Construct } from 'constructs';

export class ApiGatewayStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // Create API Gateway REST API
    const api = new apigateway.RestApi(this, 'MyApi', {
      restApiName: 'My Service API',
      description: 'API with API key authentication',
    });

    // Create API Key
    const apiKey = api.addApiKey('ApiKey', {
      apiKeyName: 'MyApiKey',
      description: 'API Key for external access',
    });

    // Create Usage Plan
    const usagePlan = api.addUsagePlan('UsagePlan', {
      name: 'Standard Usage Plan',
      throttle: {
        rateLimit: 10,
        burstLimit: 20,
      },
      quota: {
        limit: 1000,
        period: apigateway.Period.DAY,
      },
    });

    // Associate API key with usage plan
    usagePlan.addApiKey(apiKey);

    // Add API stage to usage plan
    usagePlan.addApiStage({
      stage: api.deploymentStage,
    });

    // Create a resource and method with API key required
    const items = api.root.addResource('items');
    items.addMethod('GET', new apigateway.MockIntegration(), {
      apiKeyRequired: true,  // Require API key for this method
    });

    // Output the API endpoint and key ID
    new cdk.CfnOutput(this, 'ApiEndpoint', {
      value: api.url,
      description: 'API Gateway endpoint URL',
    });

    new cdk.CfnOutput(this, 'ApiKeyId', {
      value: apiKey.keyId,
      description: 'API Key ID',
    });
  }
}
```

**Usage**:
```bash
# Deploy
cdk deploy

# Get API key value
aws apigateway get-api-key --api-key <keyId> --include-value
```

**Note**: This matches the pattern used in your Slack AI App Execution Stack (see `cdk/lib/execution/execution-stack.ts`).

---
Powered by iac-mcp
```

**What happened**:
- Detected "CDK" + "generate" → IAC_ASSISTANCE intent
- Routed to iac-mcp (specialized for infrastructure code)
- Provided complete code with project context reference

#### Example 4: Account Inspection (Read-Only)

```
You: List my Lambda functions in ap-northeast-1

Orchestrator:
📋 Intent: ACCOUNT_INSPECTION
🔍 Server: account-mcp
💡 Reason: Query for live AWS account resources
⚠️  Safety: Requires AWS credentials, read-only operation

🔍 Querying your AWS account (ap-northeast-1)...

Lambda Functions in ap-northeast-1:

1. **slack-event-handler-dev**
   - Runtime: python3.11
   - Memory: 256 MB
   - Timeout: 30 seconds
   - Last Modified: 2025-12-28

2. **bedrock-processor-dev**
   - Runtime: python3.11
   - Memory: 512 MB
   - Timeout: 60 seconds
   - Last Modified: 2025-12-28

3. **slack-response-handler-dev**
   - Runtime: python3.11
   - Memory: 256 MB
   - Timeout: 30 seconds
   - Last Modified: 2025-12-28

Total: 3 functions

💡 Tip: These are your Slack AI App Lambda functions. To inspect specific function configuration:
   "Get configuration for slack-event-handler-dev"

---
Powered by account-mcp
```

**What happened**:
- Detected "list my" + AWS resource → ACCOUNT_INSPECTION intent
- Routed to account-mcp (live account access)
- Required AWS credentials
- Showed read-only results

#### Example 5: Resource Modification (SAFETY GATE)

```
You: Update Lambda function timeout to 60 seconds for bedrock-processor-dev

Orchestrator:
⚠️  RESOURCE MODIFICATION DETECTED

📋 Intent: RESOURCE_MODIFICATION
🔍 Server: resource-mcp
💡 Reason: Modify AWS resource configuration
🛡️  Safety: REQUIRES CONFIRMATION

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
OPERATION PREVIEW
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Operation: UpdateFunctionConfiguration
Service: AWS Lambda
Resource: bedrock-processor-dev
Region: ap-northeast-1

Current State:
  Timeout: 30 seconds

Proposed Change:
  Timeout: 60 seconds → 30 seconds

Impact Analysis:
  ✅ Reversible (can change back)
  ✅ Low cost (configuration change only)
  ✅ No downtime (takes effect immediately)
  ⚠️  May affect in-flight requests

Risk Level: MEDIUM

API Call:
  aws lambda update-function-configuration \
    --function-name bedrock-processor-dev \
    --timeout 60 \
    --region ap-northeast-1

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Actions:
  INSPECT - View current configuration
  CONFIRM - Execute this operation
  CANCEL  - Cancel operation

Type your choice (INSPECT/CONFIRM/CANCEL):
```

**What happened**:
- Detected "update" + Lambda resource → RESOURCE_MODIFICATION intent
- SAFETY GATE ACTIVATED
- Showed detailed preview with impact analysis
- Waiting for explicit confirmation

```
You: CONFIRM

Orchestrator:
✅ Executing operation...

Lambda function configuration updated successfully:
  Function: bedrock-processor-dev
  Timeout: 30s → 60s
  Updated: 2025-12-29 10:30:15 JST

Next steps:
  - Test the function to ensure it works as expected
  - Monitor CloudWatch Logs for any timeout-related issues
  - Consider updating infrastructure code (CDK) to match:
    File: cdk/lib/execution/lambda/bedrock-processor/index.ts
    Update: timeout: cdk.Duration.seconds(60)

---
Powered by resource-mcp
```

**What happened**:
- User confirmed with "CONFIRM"
- Operation executed
- Provided next steps and reminders

### Step 4: Understanding Intent Classification

The orchestrator classifies your queries automatically:

| Your Words | Detected Intent |
|------------|----------------|
| "How do I...", "What is...", "Explain..." | DOCUMENTATION_LOOKUP |
| "Latest...", "New...", "2025...", "Current..." | LATEST_INFORMATION |
| "Generate CDK...", "CloudFormation template..." | IAC_ASSISTANCE |
| "List my...", "Show my...", "Get my..." | ACCOUNT_INSPECTION |
| "Create...", "Update...", "Delete...", "Modify..." | RESOURCE_MODIFICATION |
| "How to implement...", "Best way to...", "Design..." | ARCHITECTURAL_GUIDANCE |

### Step 5: Safety Levels

Different operations have different safety levels:

| Safety Level | What It Means | Confirmation |
|--------------|---------------|--------------|
| ✅ **SAFE** | Read-only, no AWS account access | None |
| ✅ **LOW** | Read-only, AWS account access | None |
| ⚠️  **MEDIUM** | Modifies configuration, reversible | Required |
| 🛑 **HIGH** | Deletes resources, irreversible | Required + Enhanced warnings |

## Common Use Cases for Slack AI App Development

### Use Case 1: Understanding Project Architecture

```
"Explain DynamoDB query patterns for Slack message threading"

→ Routes to: knowledge-mcp
→ Provides: General patterns + Project-specific examples
```

### Use Case 2: Updating Infrastructure

```
"How do I add a new Lambda environment variable for API key?"

→ Routes to: knowledge-mcp (concept) → iac-mcp (CDK code)
→ Provides: Multi-step guidance
```

### Use Case 3: Debugging Production Issues

```
"Show recent errors for slack-event-handler-dev Lambda function"

→ Routes to: account-mcp (CloudWatch Logs)
→ Provides: Live error logs
```

### Use Case 4: Optimizing Costs

```
"Analyze DynamoDB read/write capacity usage for my tables"

→ Routes to: account-mcp (metrics) → knowledge-mcp (optimization tips)
→ Provides: Current usage + Recommendations
```

### Use Case 5: Security Best Practices

```
"Best practices for storing Slack secrets in AWS"

→ Routes to: knowledge-mcp (concepts) → iac-mcp (implementation)
→ Provides: Secrets Manager patterns matching project
```

## Tips for Best Results

### Do This ✅

- **Be specific**: "Update Lambda timeout to 60s for bedrock-processor-dev" (not just "change timeout")
- **Mention versions**: "Latest Lambda Python runtime in 2025" (not just "Python runtime")
- **Include project context**: "For this Slack AI App" helps the orchestrator optimize
- **Use clear intent**: "List my..." (read), "Generate CDK..." (code), "Delete..." (modify)

### Avoid This ❌

- **Vague questions**: "Make it faster" → Unclear intent
- **Mixed intents**: "List my functions and delete the old ones" → Separate into two queries
- **Skipping context**: "Update the function" → Which function?
- **Implicit assumptions**: "Change the region" → Change what to which region?

## Fallback Behavior

If the orchestrator encounters issues:

### Rate Limiting

```
⚠️ documentation-mcp is rate-limited (10/10 requests used)
🔄 Falling back to knowledge-mcp (cached documentation)

Note: Response may not reflect latest AWS updates
```

**What to do**: Wait a few minutes or accept cached results

### Auth Failure

```
❌ AWS credentials not configured
ℹ️  Cannot access your AWS account

Alternative: I can provide documentation instead
Would you like general guidance on this topic?
```

**What to do**: Configure AWS credentials or accept documentation

### Service Error

```
❌ iac-mcp service error: Template validation failed
🔄 Falling back to knowledge-mcp for best practices

I'll provide general guidance instead of specific validation.
```

**What to do**: Check service status or retry later

## Troubleshooting

### Issue 1: Orchestrator Not Activating

**Symptom**: Normal Claude responses without orchestrator routing

**Cause**: Query not recognized as AWS-related

**Solution**: Include AWS service names explicitly
```
Instead of: "How do I store secrets?"
Try: "How do I store secrets in AWS Secrets Manager?"
```

### Issue 2: Wrong Server Selected

**Symptom**: Orchestrator chooses unexpected server

**Cause**: Ambiguous intent classification

**Solution**: Use clearer keywords
```
Instead of: "Show me the database"
Try: "List my DynamoDB tables" (ACCOUNT_INSPECTION)
  or: "Explain DynamoDB tables" (DOCUMENTATION_LOOKUP)
```

### Issue 3: Safety Gate Blocking Needed Operation

**Symptom**: Confirmation required but you want to skip

**Cause**: Safety gate protecting against accidental modifications

**Solution**: This is by design for safety. Confirm explicitly:
```
Type exactly: CONFIRM
```

### Issue 4: Rate Limiting

**Symptom**: "documentation-mcp is rate-limited"

**Cause**: Hit 10 requests/minute limit

**Solution**:
- Wait 1 minute for rate limit reset
- Accept fallback to knowledge-mcp (cached)
- Prioritize most important queries

## Next Steps

1. **Read examples**: `.claude/skills/aws-mcp-orchestrator/examples.md` has 28 detailed examples
2. **Understand design**: `.claude/skills/aws-mcp-orchestrator/README.md` explains the routing logic
3. **Customize**: Modify `.claude/skills/aws-mcp-orchestrator/SKILL.md` for your needs
4. **Integrate**: Use with other skills (coding-assistant, code-review-assistant)

## Advanced Usage

### Multi-Server Orchestration

For complex architectural questions, the orchestrator uses multiple servers:

```
You: "Best way to implement API authentication for this Slack app?"

Orchestrator:
📋 Intent: ARCHITECTURAL_GUIDANCE
🔍 Servers: knowledge-mcp + iac-mcp + account-mcp
💡 Reason: Multi-faceted architectural decision

Step 1/3: Understanding Options (knowledge-mcp)
Step 2/3: Generating Code (iac-mcp)
Step 3/3: Analyzing Current Setup (account-mcp)

[Comprehensive multi-part response]
```

### Project Context Learning

The orchestrator learns from project files:

- Reads `CLAUDE.md` for technologies
- Checks `cdk/` for infrastructure patterns
- Analyzes `README.md` for project context

This means it automatically knows:
- You're using Python 3.11 for Lambda
- You're using TypeScript for CDK
- You're deploying to ap-northeast-1
- You're using API key authentication

### Integration with Other Skills

Combine orchestrator with other skills:

```
# 1. Ask AWS question
"Latest Bedrock Claude models in 2025"
→ Orchestrator routes to documentation-mcp

# 2. Generate code
"Generate CDK code for Bedrock integration"
→ Orchestrator routes to iac-mcp

# 3. Review code
"Review this code for security issues"
→ code-review-assistant

# 4. Document decision
"Create ADR for Bedrock model selection"
→ code-documentation-assistant
```

## FAQ

**Q: Do I need to install anything special?**
A: No, if you have AWS MCP servers configured, the orchestrator works automatically.

**Q: Can I disable the orchestrator?**
A: Yes, ask non-AWS questions, or disable the skill in `.claude/skills/`.

**Q: How do I know which server was used?**
A: Every response includes a footer: "Powered by [server-name]"

**Q: Can I override the routing decision?**
A: Yes, explicitly request: "Use iac-mcp to generate CDK code..."

**Q: What if I make a mistake in CONFIRM?**
A: You can type CANCEL to abort. Once executed, some operations are irreversible.

**Q: Does this cost money?**
A: AWS MCP servers are free. You pay for AWS resources created/modified.

**Q: How do I report issues?**
A: Create GitHub issue with example query and expected vs. actual routing.

## Support

- **Documentation**: `.claude/skills/aws-mcp-orchestrator/README.md`
- **Examples**: `.claude/skills/aws-mcp-orchestrator/examples.md`
- **Skill Source**: `.claude/skills/aws-mcp-orchestrator/SKILL.md`
- **Project Issues**: [GitHub Issues](https://github.com/yourusername/slack-ai-app/issues)

---

**Last Updated**: 2025-12-29

**Version**: 1.0.0
