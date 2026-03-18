# verification-agent CDK (Security Scanning)

This directory is the standalone AWS CDK app for the Verification Zone.

## Security scanning (cdk-nag)

This CDK app applies **AWS Solutions checks** via `cdk-nag`:

- **During synthesis**: `applyNagPacks(app)` is called in `bin/cdk.ts`, so `cdk synth` fails on unresolved violations.
- **During tests**: Jest includes a `"cdk-nag security scan"` assertion that requires **zero** unresolved `cdk-nag` errors.

### Suppressions policy

Suppressions are only used when the wildcard is an **AWS service constraint** (or a documented, intentional trade-off). Every suppression includes a written justification.

## IAM least privilege (Bedrock)

Bedrock `InvokeModel` permissions are scoped to:

- `arn:aws:bedrock:${region}::foundation-model/*`
- `arn:aws:bedrock:${region}:${account}:inference-profile/*`

## Commands

```bash
cd verification-zones/verification-agent/cdk

npm install
npm run build
npx cdk synth
npm test
```

