# Contract: `executionAgentArns` (verification CDK config)

**Consumer**: `verification-zones/verification-agent/cdk` synthesis (and root `scripts/deploy.sh` writers).  
**Format**: JSON object embedded in `cdk.config.<env>.json` under key `executionAgentArns`.

## Shape

| Key            | Value type | Required after standard deploy (this feature) |
| -------------- | ---------- | ----------------------------------------------- |
| `file-creator` | string (ARN) | Yes |
| `docs`         | string (ARN) | Yes (when docs stack is part of standard deploy) |
| `time`         | string (ARN) | **No — must not be present** |
| `fetch-url`    | string (ARN) | **No — must not be present** |

## Rules

- Writers **must** omit keys for agents not included in the current deployment posture. Omitting is preferred over empty strings so CDK logic can distinguish “not deployed” from “invalid ARN”.
- The root deploy script’s `build_execution_agent_arns_json` helper already builds optional keys only when ARNs are non-empty; standard deploy passes empty inputs for Time and Web Fetch so those keys are not emitted.

## Versioning

Backward compatibility: Existing environments may still have legacy keys until the next standard deploy runs and saves the updated object.
