# AWS APIs Used in Investigation

**Branch**: `051-investigate-agentcore-idle-costs`

## Bedrock AgentCore APIs

| API | Purpose |
|-----|---------|
| `bedrock-agentcore list-agent-runtimes` | 対象エージェントのARN一覧取得 |
| `bedrock-agentcore get-agent-runtime` | エージェント設定詳細（lifecycleConfiguration等）取得 |
| `bedrock-agentcore list-agent-runtime-sessions` | セッション記録一覧取得 |

## CloudWatch Logs APIs

| API | Purpose |
|-----|---------|
| `logs describe-log-groups` | AgentCore ロググループ一覧確認 |
| `logs filter-log-events` | セッション起動ログの検索・triger source 確認 |

## Cost Explorer APIs

| API | Purpose |
|-----|---------|
| `ce get-cost-and-usage` | エージェント別コスト・使用量の詳細取得 |

## STS APIs

| API | Purpose |
|-----|---------|
| `sts get-caller-identity` | 認証セッション確認 |
