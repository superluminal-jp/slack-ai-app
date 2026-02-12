# Data Model: strands-agents 移行とインフラ整備

**Date**: 2026-02-08
**Feature**: 021-strands-migration-cleanup

## Entities

### Agent Runtime

A2A プロトコルで動作するコンテナ化されたエージェント。

| Attribute | Type | Description |
|-----------|------|-------------|
| name | string | エージェント識別名（例: `SlackAI_VerificationAgent`） |
| protocol | enum | `A2A` (固定) |
| port | integer | `9000` (A2A プロトコル契約) |
| role_arn | string | IAM 実行ロール ARN |
| container_uri | string | ECR コンテナイメージ URI |

**Variants**: VerificationAgent, ExecutionAgent

### A2A Message

エージェント間で交換される JSON-RPC 2.0 メッセージ。

| Attribute | Type | Description |
|-----------|------|-------------|
| jsonrpc | string | `"2.0"` (固定) |
| method | string | `"message/send"`, `"message/stream"` |
| id | string | リクエスト ID |
| params | object | メッセージ本文（TextPart, FilePart, DataPart） |

### Deploy Configuration

CDK デプロイに使用する設定パラメータ。

| Attribute | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| awsRegion | string | yes | - | デプロイリージョン |
| deploymentEnv | string | yes | - | 環境識別子（dev, staging, prod） |
| validationZoneEchoMode | boolean | no | `false` | エコーモードの有効/無効 |
| executionAgentArn | string | no | - | Execution Agent の ARN（クロスアカウント用） |

### CloudWatch Metric Namespace

メトリクス送信に使用する名前空間。

| Namespace | Component | Purpose |
|-----------|-----------|---------|
| `SlackEventHandler` | Verification Agent (authorization, rate_limiter, existence_check) | リクエスト処理メトリクス |
| `SlackAI/VerificationAgent` | Verification Agent (cloudwatch_metrics) | エージェント固有メトリクス |
| `SlackAI/ExecutionAgent` | Execution Agent (cloudwatch_metrics) | エージェント固有メトリクス |

## Relationships

```
DeployConfiguration --[configures]--> AgentRuntime
AgentRuntime(Verification) --[sends A2A message]--> AgentRuntime(Execution)
AgentRuntime --[emits metrics]--> CloudWatch(Namespace)
IAM Policy --[allows namespace]--> CloudWatch(Namespace)
```

## State Transitions

### A2A Task Lifecycle (strands-agents)

```
submitted → working → completed
                   → failed
                   → canceled (未実装)
```

strands-agents の `StrandsA2AExecutor` がライフサイクルを自動管理。
`InMemoryTaskStore` がデフォルトのタスク状態管理。
