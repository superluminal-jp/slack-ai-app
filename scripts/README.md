# deploy.sh

Unified CLI for deploying and operating the Slack AI application on AWS.

## Prerequisites

| Tool | Purpose |
|------|---------|
| `aws` CLI | CloudFormation / CloudWatch / IAM |
| `node` | CDK CLI runtime |
| `jq` | JSON processing |
| `python3` | Resource policy application |
| CDK CLI | `node_modules/.bin/cdk` (project root) or zone-local |

## Environment variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `DEPLOYMENT_ENV` | Yes (deploy) | `dev` | Target environment: `dev` or `prod` |
| `SLACK_BOT_TOKEN` | Yes (deploy) | — | Slack bot token; falls back to `cdk.config.<env>.json` |
| `SLACK_SIGNING_SECRET` | Yes (deploy) | — | Slack signing secret; falls back to `cdk.config.<env>.json` |
| `AWS_REGION` | No | `ap-northeast-1` | AWS region |
| `AWS_PROFILE` | No | — | AWS CLI named profile |
| `FORCE_EXECUTION_IMAGE_REBUILD` | No | — | Force file-creator image rebuild (any non-empty value) |
| `FORCE_DOCS_IMAGE_REBUILD` | No | — | Force docs-agent image rebuild |
| `FORCE_TIME_IMAGE_REBUILD` | No | — | Force time-agent image rebuild |
| `FORCE_WEB_FETCH_IMAGE_REBUILD` | No | — | Force fetch-url-agent image rebuild |
| `FORCE_SLACK_SEARCH_IMAGE_REBUILD` | No | — | Force slack-search-agent image rebuild |

## Subcommands

```
./scripts/deploy.sh [SUBCOMMAND] [OPTIONS]
```

### `all` (default)

Full pipeline: force-rebuilds all container images, deploys all stacks, then runs `status` and `check-access`.

```bash
DEPLOYMENT_ENV=dev ./scripts/deploy.sh
```

### `deploy [--force-rebuild]`

Deploy all stacks only (no diagnostics). `--force-rebuild` forces container image rebuilds for every execution agent.

```bash
DEPLOYMENT_ENV=dev ./scripts/deploy.sh deploy
DEPLOYMENT_ENV=dev ./scripts/deploy.sh deploy --force-rebuild
```

**Deployment order** (8 phases):

| Phase | Stack | Script |
|-------|-------|--------|
| Preflight | Verification | `verification-zones/verification-agent/scripts/deploy.sh` (current ARNs) |
| 1 | file-creator-agent | `execution-zones/file-creator-agent/scripts/deploy.sh` |
| 2 | docs-agent | `execution-zones/docs-agent/scripts/deploy.sh` |
| 3 | time-agent | `execution-zones/time-agent/scripts/deploy.sh` |
| 4 | slack-search-agent | `verification-zones/slack-search-agent/scripts/deploy.sh` |
| 5 | fetch-url-agent | `execution-zones/fetch-url-agent/scripts/deploy.sh` |
| 6 | verification-agent | `verification-zones/verification-agent/scripts/deploy.sh` (new ARNs) |
| 7 | Resource policy | Grants Verification IAM role access to each execution runtime |
| 8 | AgentCore validation | Polls each runtime until `READY` (120 s timeout) |

Each zone script can also be run independently for targeted re-deployment:

```bash
# Deploy a single agent zone
DEPLOYMENT_ENV=dev ./execution-zones/time-agent/scripts/deploy.sh
DEPLOYMENT_ENV=dev ./execution-zones/time-agent/scripts/deploy.sh --force-rebuild

# Deploy verification agent with explicit ARNs
DEPLOYMENT_ENV=dev \
  EXECUTION_AGENT_ARNS_JSON='{"file-creator":"arn:...","docs":"arn:...","time":"arn:..."}' \
  ./verification-zones/verification-agent/scripts/deploy.sh
```

### `status`

Shows CloudFormation stack status and the deployed container image tag for each stack.

```bash
./scripts/deploy.sh status
```

### `check-access`

Diagnoses A2A authorization: verifies the Bedrock AgentCore resource policy on the Execution Agent and the `AgentCoreInvoke` IAM statement on the Verification role.

```bash
./scripts/deploy.sh check-access
```

### `logs [OPTIONS]`

Traces a Slack request across all CloudWatch log groups.

```bash
./scripts/deploy.sh logs --latest               # most recent request (default)
./scripts/deploy.sh logs --latest --since 2h    # extend lookback window
./scripts/deploy.sh logs --correlation-id <ID>  # specific request
./scripts/deploy.sh logs --list-log-groups      # show discovered log groups
```

| Option | Default | Description |
|--------|---------|-------------|
| `--latest` | — | Traces the most recent Slack request |
| `--correlation-id ID` | — | Traces a specific request by ID |
| `--list-log-groups` | — | Lists all discovered CloudWatch log groups |
| `--since DURATION` | `1h` | Lookback window (`1h`, `30m`, `3600`) |
| `--limit N` | `50` | Max events per log group |

**Trace order:**

1. Slack Event Handler (Lambda)
2. Agent Invoker (Lambda)
3. Verification Agent (AgentCore)
4. Execution Agent (AgentCore)
5. Docs Agent (AgentCore)
6. Time Agent (AgentCore)
7. Slack Search Agent (AgentCore)
8. Slack Poster (Lambda)

### `policy [--dry-run]`

Applies Bedrock AgentCore resource policies to all execution agent runtimes. Invokes `scripts/apply-resource-policy.py`.

```bash
./scripts/deploy.sh policy             # apply
./scripts/deploy.sh policy --dry-run   # print policy without applying
```

`--dry-run` prints the policy JSON without making any AWS API calls.

### `help`

```bash
./scripts/deploy.sh help
```

## Stack names

Stack names are constructed as `<base>-<Env>` where `Env` is `Dev` or `Prod`.

| Stack | Default base name | Override variable |
|-------|-------------------|-------------------|
| File Creator | `SlackAI-FileCreator` | `FILE_CREATOR_STACK_NAME` |
| Docs Execution | `SlackAI-DocsExecution` | `DOCS_EXECUTION_STACK_NAME` |
| Time Execution | `SlackAI-TimeExecution` | `TIME_EXECUTION_STACK_NAME` |
| Web Fetch | `SlackAI-WebFetch` | `WEB_FETCH_EXECUTION_STACK_NAME` |
| Slack Search | `SlackAI-SlackSearch` | `SLACK_SEARCH_STACK_NAME` |
| Verification | `SlackAI-Verification` | `VERIFICATION_STACK_NAME` |

## Typical workflows

### First deploy

```bash
export DEPLOYMENT_ENV=dev
export SLACK_BOT_TOKEN=xoxb-...
export SLACK_SIGNING_SECRET=...
./scripts/deploy.sh
```

### Re-deploy with image rebuild

```bash
DEPLOYMENT_ENV=dev ./scripts/deploy.sh deploy --force-rebuild
```

### Trace a failed request

```bash
# Find the most recent request in the last 2 hours
./scripts/deploy.sh logs --latest --since 2h

# Trace by correlation ID
./scripts/deploy.sh logs --correlation-id <ID>
```

### Fix resource policy after manual changes

```bash
DEPLOYMENT_ENV=dev ./scripts/deploy.sh policy
```
