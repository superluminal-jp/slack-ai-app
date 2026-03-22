# Quickstart: AgentCore Idle Billing Investigation

**Branch**: `051-investigate-agentcore-idle-costs`
**Date**: 2026-03-22
**Purpose**: 未呼び出しエージェントのコスト発生原因を調査する再現可能な手順

## Prerequisites

- AWS SSO ログイン済み（`aws sts get-caller-identity` で確認）
- ap-northeast-1 リージョンのアクセス権限

## Step 1: 認証確認

```bash
aws sts get-caller-identity
```

## Step 2: 対象エージェントのARN確認

```bash
aws bedrock-agentcore list-agent-runtimes --region ap-northeast-1 \
  --query 'agentRuntimes[?contains(agentRuntimeName, `Dev`)].[agentRuntimeName,agentRuntimeArn,status]' \
  --output table
```

対象エージェント:
- `SlackAI_WebFetchAgent_Dev`
- `SlackAI_TimeAgent_Dev`
- `SlackAI_DocsAgent_Dev`
- `SlackAI_FileCreatorAgent_Dev`

## Step 3: ランタイムセッション一覧取得

```bash
# 各エージェントARNを変数に設定して実行
AGENT_ARN="<エージェントARN>"

aws bedrock-agentcore list-agent-runtime-sessions \
  --agent-runtime-identifier "$AGENT_ARN" \
  --region ap-northeast-1 \
  --output json
```

## Step 4: エージェント設定詳細確認

```bash
aws bedrock-agentcore get-agent-runtime \
  --agent-runtime-identifier "$AGENT_ARN" \
  --region ap-northeast-1 \
  --output json
```

確認ポイント:
- `lifecycleConfiguration.idleRuntimeSessionTimeoutSeconds`
- `lifecycleConfiguration.maxLifetimeSeconds`
- `status`

## Step 5: CloudWatch ログ確認

```bash
# ロググループ一覧 (AgentCore 関連)
aws logs describe-log-groups \
  --log-group-name-prefix /aws/bedrock-agentcore \
  --region ap-northeast-1 \
  --query 'logGroups[].logGroupName'

# セッション起動ログ検索
aws logs filter-log-events \
  --log-group-name "/aws/bedrock-agentcore/<エージェント名>" \
  --region ap-northeast-1 \
  --filter-pattern "session" \
  --start-time $(date -d '7 days ago' +%s)000 \
  --output json | jq '.events[].message'
```

## Step 6: コスト確認 (Cost Explorer)

```bash
START_DATE="2026-03-01"  # デプロイ日に合わせて変更
END_DATE=$(date +%Y-%m-%d)

aws ce get-cost-and-usage \
  --time-period Start=$START_DATE,End=$END_DATE \
  --granularity DAILY \
  --filter '{"Dimensions":{"Key":"SERVICE","Values":["Amazon Bedrock"]}}' \
  --metrics "BlendedCost" "UsageQuantity" \
  --group-by Type=DIMENSION,Key=USAGE_TYPE \
  --region us-east-1 \
  --output json | jq '.ResultsByTime[] | {date: .TimePeriod.Start, costs: .Groups[]}'
```

> Note: Cost Explorer API は us-east-1 から呼び出す必要がある

## Expected Findings

調査の判定基準:

| パターン | 判定 | 推奨アクション |
|----------|------|----------------|
| セッション開始時刻がデプロイ直後 + 定期的に繰り返す | 仮説A: Warm Session 自動起動 | `idleTimeoutSeconds` を削減 or エージェント削除 |
| セッション数が少ない + 短時間 | 仮説B/C: ヘルスチェック or 初期化 | AgentCore の仕様として受け入れ or 設定変更 |
| セッションがなく Cost Explorer のみ計上 | 仮説D: Provisioned Capacity 課金 | AgentCore の課金モデルを確認、不要なら削除 |
