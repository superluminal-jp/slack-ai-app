# AWS MCP Orchestrator

## Overview

The AWS MCP Orchestrator is a specialized skill that intelligently routes AWS-related queries to the most appropriate AWS MCP server(s) with built-in safety gates and transparency. It serves as an intelligent middleware layer between user queries and AWS MCP servers.

## Purpose

This skill optimizes AWS operations by:
- **Routing queries** to the right MCP server based on intent classification
- **Enforcing safety gates** for write operations with preview and confirmation
- **Providing transparency** about which servers are being used and why
- **Managing fallback chains** for rate limiting and error scenarios
- **Optimizing for project context** (Slack AI App: Lambda, DynamoDB, API Gateway, CDK, Secrets Manager, Bedrock)

## Design Priorities

1. **Safety** - Prevent accidental resource modifications
2. **Accuracy** - Route to the correct server for accurate responses
3. **Freshness** - Prefer live data when needed
4. **Transparency** - Always explain routing decisions
5. **Speed** - Efficient server selection
6. **Cost** - Optimize API call usage

## Available AWS MCP Servers

This orchestrator can route to the following servers:

1. **knowledge-mcp** (Primary)
   - General AWS knowledge and best practices
   - Cached documentation and patterns
   - Fast, cost-effective for common queries
   - No live AWS account access

2. **documentation-mcp** (Fallback)
   - Latest AWS documentation
   - Up-to-date API references
   - Used when knowledge-mcp lacks information
   - Rate limited, slower

3. **iac-mcp** (Infrastructure as Code)
   - CDK/CloudFormation generation
   - Infrastructure code validation
   - Best practices for IaC

4. **account-mcp** (Read-Only)
   - Live AWS account inspection
   - Resource state querying
   - Cost analysis
   - **Read-only operations only**

5. **resource-mcp** (Write Operations)
   - Resource creation/modification
   - **Requires safety gates**
   - **Requires explicit confirmation**

## Intent Classification

The orchestrator classifies queries into six intent types:

### 1. DOCUMENTATION_LOOKUP
**Keywords**: "how to", "what is", "explain", "documentation", "guide", "tutorial"

**Routing**: knowledge-mcp → documentation-mcp (fallback)

**Example**:
- "How do I configure Lambda environment variables?"
- "What is DynamoDB GSI?"

### 2. LATEST_INFORMATION
**Keywords**: "latest", "new", "recent", "current", "2025", "updated"

**Routing**: documentation-mcp (primary for freshness)

**Example**:
- "What are the latest Lambda runtime versions in 2025?"
- "New Bedrock model releases"

### 3. IAC_ASSISTANCE
**Keywords**: "CDK", "CloudFormation", "infrastructure", "IaC", "template", "stack"

**Routing**: iac-mcp (with knowledge-mcp for context)

**Example**:
- "Generate CDK code for Lambda with DynamoDB"
- "Review my CloudFormation template"

### 4. ACCOUNT_INSPECTION
**Keywords**: "my account", "current state", "list resources", "show me", "what resources"

**Routing**: account-mcp (read-only)

**Example**:
- "List my Lambda functions"
- "What DynamoDB tables exist in my account?"

### 5. RESOURCE_MODIFICATION
**Keywords**: "create", "delete", "update", "modify", "deploy", "change"

**Routing**: resource-mcp (with safety gates)

**Example**:
- "Create a new DynamoDB table"
- "Update Lambda memory to 1024MB"

### 6. ARCHITECTURAL_GUIDANCE
**Keywords**: "architecture", "design", "pattern", "best practice", "should I", "recommend"

**Routing**: knowledge-mcp (with thinking-assistant coordination)

**Example**:
- "What's the best way to structure Lambda functions?"
- "Should I use DynamoDB or RDS for my use case?"

## Safety Gates

### Write Operation Safety Protocol

For all RESOURCE_MODIFICATION intent queries:

1. **Intent Confirmation**: Verify user wants to modify resources
2. **Preview Generation**: Show what will be changed
3. **Explicit Confirmation**: Require user to type "CONFIRM"
4. **Execution**: Only proceed after confirmation
5. **Result Verification**: Confirm success/failure

**Example Flow**:
```
User: "Create a Lambda function called test-function"

Orchestrator:
[SAFETY GATE] This query will MODIFY AWS resources.

Intent: Create Lambda function
Resource: Lambda function named 'test-function'
Action: CREATE

Preview:
- Function Name: test-function
- Runtime: (needs specification)
- Memory: (needs specification)
- Region: (current account default)

To proceed, please:
1. Review the preview above
2. Provide missing specifications (runtime, memory, etc.)
3. Type "CONFIRM" to execute

Type "CANCEL" to abort.
```

### Read Operation Transparency

For ACCOUNT_INSPECTION queries, always show:
- Which account/region is being queried
- What data will be accessed
- Why this server is being used

## Routing Decision Tree

```
Query received
    │
    ├─> Classify Intent
    │   ├─> DOCUMENTATION_LOOKUP
    │   │   └─> knowledge-mcp → documentation-mcp (fallback)
    │   │
    │   ├─> LATEST_INFORMATION
    │   │   └─> documentation-mcp
    │   │
    │   ├─> IAC_ASSISTANCE
    │   │   └─> iac-mcp + knowledge-mcp
    │   │
    │   ├─> ACCOUNT_INSPECTION
    │   │   └─> account-mcp (read-only)
    │   │
    │   ├─> RESOURCE_MODIFICATION
    │   │   └─> Safety Gate → resource-mcp
    │   │
    │   └─> ARCHITECTURAL_GUIDANCE
    │       └─> knowledge-mcp + thinking-assistant
    │
    └─> Execute with transparency messages
```

## Fallback Chain

When a server fails or rate limits:

1. **Primary server fails** → Show error message
2. **Check fallback availability** → Route to fallback server
3. **Transparency message** → Explain why fallback is being used
4. **Execute on fallback** → Attempt query
5. **Report result** → Include which server succeeded

**Example**:
```
[Transparency] Querying knowledge-mcp for Lambda best practices...
[Error] knowledge-mcp rate limited (10 requests/min exceeded)
[Fallback] Routing to documentation-mcp instead...
[Success] Retrieved answer from documentation-mcp
```

## Project Context Awareness

This orchestrator is optimized for the **Slack AI App** project:

### Key Technologies
- **Lambda functions** (Python 3.11+)
- **DynamoDB** (ConversationHistory table)
- **API Gateway** (REST API with IAM/API key auth)
- **CDK** (Infrastructure as Code)
- **Secrets Manager** (API keys, tokens)
- **Bedrock** (Claude models)

### Common Query Patterns

**Lambda-related**:
- "How to configure Lambda environment variables?" → knowledge-mcp
- "Show my Lambda functions" → account-mcp
- "Update Lambda memory" → resource-mcp (safety gate)

**DynamoDB-related**:
- "DynamoDB best practices for conversation history" → knowledge-mcp
- "List DynamoDB tables" → account-mcp
- "Create GSI on ConversationHistory" → resource-mcp (safety gate)

**Bedrock-related**:
- "Latest Claude models in Bedrock" → documentation-mcp
- "Bedrock pricing" → knowledge-mcp

**CDK-related**:
- "Generate CDK for API Gateway" → iac-mcp
- "CDK best practices" → knowledge-mcp

## Usage Examples

### Example 1: Documentation Lookup
```
User: "How do I add environment variables to my Lambda function in CDK?"

Orchestrator:
[Intent] DOCUMENTATION_LOOKUP
[Server] knowledge-mcp (fast, cached best practices)
[Reason] Common CDK pattern, no need for latest docs

[Querying knowledge-mcp...]
[Response from knowledge-mcp with code example]
```

### Example 2: Account Inspection
```
User: "What Lambda functions are deployed in my account?"

Orchestrator:
[Intent] ACCOUNT_INSPECTION
[Server] account-mcp (read-only)
[Account] Current AWS account (us-east-1)
[Reason] Requires live account access

[Querying account-mcp...]
[Response with list of Lambda functions]
```

### Example 3: Resource Modification with Safety Gate
```
User: "Update slack-ai-handler Lambda memory to 512MB"

Orchestrator:
[Intent] RESOURCE_MODIFICATION
[Safety Gate] ACTIVATED

⚠️  This query will MODIFY AWS resources.

Resource: Lambda function 'slack-ai-handler'
Action: UPDATE memory configuration
Current: (needs inspection)
New: 512MB

Preview:
- Function: slack-ai-handler
- Change: Memory 256MB → 512MB (estimated)
- Impact: May affect cost, performance
- Reversible: Yes (can change back)

To proceed:
1. Type "INSPECT" to view current configuration first
2. Type "CONFIRM" to proceed with update
3. Type "CANCEL" to abort

Your choice:
```

### Example 4: Multi-Server Orchestration
```
User: "What's the best way to implement conversation history in DynamoDB for my Slack app?"

Orchestrator:
[Intent] ARCHITECTURAL_GUIDANCE
[Servers] knowledge-mcp + thinking-assistant
[Reason] Requires both AWS knowledge and architectural reasoning

[Step 1] Querying knowledge-mcp for DynamoDB patterns...
[Step 2] Coordinating with thinking-assistant for design analysis...
[Response with architectural recommendations]
```

### Example 5: Fallback Chain
```
User: "What are the Lambda runtime versions released in 2025?"

Orchestrator:
[Intent] LATEST_INFORMATION
[Server] documentation-mcp (freshness priority)

[Querying documentation-mcp...]
[Error] Rate limit exceeded (10 req/min)
[Fallback] Switching to knowledge-mcp...
[Note] Response may not include very recent updates

[Querying knowledge-mcp...]
[Response from knowledge-mcp with caveat about freshness]
```

## When to Use This Skill

Use the AWS MCP Orchestrator when:
- ✅ Asking AWS-related questions
- ✅ Needing infrastructure guidance
- ✅ Inspecting AWS account resources
- ✅ Modifying AWS resources (with safety)
- ✅ Generating IaC code (CDK, CloudFormation)
- ✅ Unsure which AWS MCP server to use

Don't use this skill for:
- ❌ Non-AWS related queries
- ❌ Code implementation (use coding-assistant)
- ❌ Code review (use code-review-assistant)
- ❌ Documentation creation (use code-documentation-assistant)

## Integration with Other Skills

### With coding-assistant
When implementing AWS-related features:
1. Use aws-mcp-orchestrator for AWS guidance
2. Use coding-assistant for code implementation

### With code-documentation-assistant
When documenting AWS decisions:
1. Use aws-mcp-orchestrator for technical details
2. Use code-documentation-assistant for ADR creation

### With thinking-assistant
For complex architectural decisions:
1. Use aws-mcp-orchestrator for AWS specifics
2. Use thinking-assistant for trade-off analysis

## Limitations

1. **No direct MCP tool access**: This is a routing skill, not an MCP client
2. **Requires manual confirmation**: Safety gates need human interaction
3. **Project-specific optimization**: Tuned for Slack AI App patterns
4. **No cost estimation**: Cannot calculate AWS costs before execution
5. **Limited context**: Cannot access full project codebase for validation

## Success Criteria

This skill succeeds when:
- ✅ Queries routed to correct server 95%+ of the time
- ✅ Safety gates prevent accidental modifications
- ✅ Transparency messages explain all decisions
- ✅ Fallback chains handle errors gracefully
- ✅ User understands which server is being used and why

## References

- AWS MCP Server Documentation: https://github.com/aws/mcp-servers
- Model Context Protocol: https://modelcontextprotocol.io/
- AWS CDK Documentation: https://docs.aws.amazon.com/cdk/
- Slack AI App Project: /Users/taikiogihara/work/slack-ai-app/

---

**Version**: 1.0
**Last Updated**: 2025-12-29
**Author**: Coding Agent + Thinking Agent
