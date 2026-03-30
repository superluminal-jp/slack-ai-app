# Quickstart: Default deploy without Time and Web Fetch

**Audience**: Operators running the unified deploy for normal releases.

## Standard deployment

1. Set `DEPLOYMENT_ENV` to `dev` or `prod` and ensure Slack tokens are configured (env or `cdk.config.<env>.json`).
2. From the repository root, run:

   ```bash
   DEPLOYMENT_ENV=dev ./scripts/deploy.sh deploy
   ```

3. **Expected**: The pipeline deploys File Creator, Docs, Slack Search, and Verification (plus policy/validation steps). It **does not** deploy the Time execution stack or the Web Fetch execution stack.
4. **Expected**: Agent registry entries for `time` and `fetch-url` are **removed** for the target environment so the assistant does not route to those capabilities.

## Optional: deploy Time or Web Fetch separately

Use only when a non-production or experimental setup needs these agents:

- Time: `execution-zones/time-agent/scripts/deploy.sh`
- Web Fetch: `execution-zones/fetch-url-agent/scripts/deploy.sh`

Each script registers its agent in DynamoDB when the registry table is available. Coordinate with security review before enabling Web Fetch (arbitrary URL retrieval).

## Verify

- Check unified deploy summary output: Time and Fetch URL lines should show `excluded from default deploy`.
- In Slack, confirm behavior matches spec FR-002 (no routing to excluded capabilities under default configuration).
