# Quickstart: DynamoDB Agent Registry Migration

**Feature**: 055-dynamodb-agent-registry
**Date**: 2026-03-25

## Verification Scenarios

### Scenario 1: Registry Load at Startup

```
1. DynamoDB table `{stack}-agent-registry` contains 5 items (env=dev)
2. Verification agent starts with AGENT_REGISTRY_TABLE and AGENT_REGISTRY_ENV set
3. agent_registry.initialize_registry() calls DynamoDB Query(PK=dev)
4. All 5 agents loaded into _AGENT_ARNS and _AGENT_CARDS
5. get_agent_arn("time") returns the time agent's ARN
6. get_all_cards() returns dict with 5 entries
```

### Scenario 2: Fail-Open on DynamoDB Error

```
1. DynamoDB table is unavailable or Query fails
2. agent_registry.initialize_registry() catches the exception
3. WARNING log emitted with error details
4. _AGENT_ARNS and _AGENT_CARDS set to empty dicts
5. Orchestrator continues without agent tools (graceful degradation)
```

### Scenario 3: Deploy-Time Registration

```
1. time-agent CDK deploy succeeds → runtime ARN available in stack outputs
2. deploy.sh calls register_agent_in_dynamodb()
3. Gets table name from AGENT_REGISTRY_TABLE env var or CloudFormation output
4. Gets runtime ARN from own stack's CloudFormation output
5. aws dynamodb put-item writes: env=dev, agent_id=time, arn=..., etc.
6. Registration failure is non-fatal (warning only)
```

### Scenario 4: Registry Refresh

```
1. Registry loaded with 4 agents at startup
2. New agent deployed and registered in DynamoDB
3. refresh_registry() called
4. Fresh DynamoDB Query returns 5 agents
5. _AGENT_ARNS and _AGENT_CARDS updated with new state
```

### Scenario 5: CDK Synth Validation

```
1. Run `npx cdk synth` in verification-agent CDK
2. Template contains AWS::DynamoDB::Table for agent-registry
3. Template does NOT contain AWS::S3::Bucket for agent-registry
4. EnvironmentVariables contain AGENT_REGISTRY_TABLE and AGENT_REGISTRY_ENV
5. EnvironmentVariables do NOT contain AGENT_REGISTRY_BUCKET or AGENT_REGISTRY_KEY_PREFIX
6. IAM policy contains dynamodb:Query (via grantReadData)
7. IAM policy does NOT contain s3:GetObject for agent-registry bucket
```

## Test Commands

```bash
# Python agent tests
cd verification-zones/verification-agent && python -m pytest tests/test_agent_registry.py -v

# CDK tests
cd verification-zones/verification-agent/cdk && npm test

# All verification-agent Python tests
cd verification-zones/verification-agent && python -m pytest tests/ -v
```
