# Data Model: AgentCore Idle Billing Investigation

**Branch**: `051-investigate-agentcore-idle-costs`
**Date**: 2026-03-22

## Entities to Collect

### RuntimeSession

| Field | Type | Description |
|-------|------|-------------|
| agentRuntimeArn | string | エージェントARN |
| sessionId | string | セッションID |
| startTime | datetime | セッション開始時刻 |
| endTime | datetime | セッション終了時刻 |
| durationSeconds | number | 継続時間（秒） |
| memoryGbHrs | number | Memory consumption (GB-hrs) |
| vcpuHrs | number | vCPU consumption (vCPU-hrs) |
| triggerSource | string | 起動トリガー（internal/external/unknown） |

### AgentRuntimeConfig

| Field | Type | Description |
|-------|------|-------------|
| agentRuntimeName | string | エージェント名 |
| agentRuntimeArn | string | ARN |
| status | string | 現在のステータス |
| idleTimeoutSeconds | number | IdleRuntimeSessionTimeout |
| maxLifetimeSeconds | number | MaxLifetime |
| networkMode | string | PUBLIC/PRIVATE |
| createdAt | datetime | デプロイ日時 |

### CostRecord

| Field | Type | Description |
|-------|------|-------------|
| agentRuntimeArn | string | エージェントARN |
| period | string | 計上期間 (YYYY-MM-DD) |
| totalCostUsd | number | 合計コスト (USD) |
| memoryGbHrs | number | メモリ使用量 |
| vcpuHrs | number | vCPU使用量 |
| billingType | string | 課金モデル（provisioned/per-session） |
