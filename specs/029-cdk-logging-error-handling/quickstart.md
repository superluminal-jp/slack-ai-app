# Quickstart: CDK Logging, Comments, and Error Handling

**Feature**: 029-cdk-logging-error-handling  
**Purpose**: Get the CDK app built, synthesized, and deployed so you can verify logging, documentation, and error behavior.

## Prerequisites

- Node.js 18+
- AWS CLI configured (for deploy)
- Repository root: `slack-ai-app`

## Build and Test

```bash
cd cdk
npm ci
npm run build
npm test
```

## Synthesize (see lifecycle output)

Synthesis runs the app and produces CloudFormation templates. After this feature is implemented, key lifecycle events (config load, stack creation) will be logged in a consistent format.

```bash
cd cdk
npx cdk synth
```

- Output: `cdk.out/` with template(s) for each stack.
- Logs: stdout/stderr from `bin/cdk.ts` and CDK CLI; redirect to a file if needed, e.g. `npx cdk synth 2>&1 | tee synth.log`.

## Deploy (optional)

Deploy one or both stacks. Requires bootstrapped CDK and valid AWS credentials.

```bash
cd cdk
npx cdk deploy --all --require-approval never   # or select stack
```

Deployment logs and any deployment-time errors will appear on stdout; error messages will follow the error-report contract (cause, context, remediation where applicable).

## Where to Find Documentation and Logs

| What | Where |
|------|--------|
| App entry and config | `cdk/bin/cdk.ts` — JSDoc and comments describe env, config priority, stack creation |
| Stack definitions | `cdk/lib/execution/execution-stack.ts`, `cdk/lib/verification/verification-stack.ts` — module-level JSDoc and tagged resources |
| Constructs | `cdk/lib/*/constructs/*.ts` — each construct should have purpose and main props documented |
| Log format | See `specs/029-cdk-logging-error-handling/contracts/log-event.schema.json` |
| Error shape | See `specs/029-cdk-logging-error-handling/contracts/error-report.schema.json` |

## Triggering Validation Errors (after implementation)

- **Invalid environment**: Set `DEPLOYMENT_ENV=invalid` and run `npx cdk synth` — entry point should throw a clear error with allowed values.
- **Aspect validation**: If Aspects are added (e.g., encryption or naming checks), introduce a construct that violates the rule and run `npx cdk synth` — error should point to the construct and message.

## Next Steps

- Implement logging and error shape in `bin/cdk.ts` and key construct paths (see [plan.md](./plan.md), [research.md](./research.md)).
- Add or extend JSDoc and comments per [data-model.md](./data-model.md) (Documented unit).
- Break down work via `/speckit.tasks` to generate `tasks.md`.
