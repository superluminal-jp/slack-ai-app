# IAM / Bedrock / AgentCore 権限監査（026 ベースライン）

**Feature Branch**: `026-best-practices-alignment`
**Date**: 2026-02-11
**Purpose**: US1（Bedrock セキュリティ）の監査ベースライン。最小権限のレビューに使用。

---

## 1. ロール一覧と Bedrock/AgentCore 権限

| ロール | 定義ファイル | Bedrock/AgentCore 権限 | リソーススコープ |
|--------|---------------|------------------------|------------------|
| Agent Invoker Lambda | `cdk/lib/verification/constructs/agent-invoker.ts` | `bedrock-agentcore:InvokeAgentRuntime` | `verificationAgentArn`, `runtimeEndpointArn`（具体的な ARN） |
| Slack Event Handler Lambda | `cdk/lib/verification/constructs/slack-event-handler.ts` | `bedrock-agentcore:InvokeAgentRuntime` | `verificationAgentArn`, `runtimeEndpointArn`（具体的な ARN） |
| Verification Agent Runtime | `cdk/lib/verification/constructs/verification-agent-runtime.ts` | `bedrock-agentcore:InvokeAgentRuntime`, `bedrock-agentcore:GetAsyncTaskResult` | `executionAgentArn` または `arn:aws:bedrock-agentcore:{region}:*:runtime/*` |
| Execution Agent Runtime | `cdk/lib/execution/constructs/execution-agent-runtime.ts` | `bedrock:InvokeModel`, `bedrock:InvokeModelWithResponseStream` | `*` |

---

## 2. 権限の詳細

### 2.1 Agent Invoker Lambda（agent-invoker.ts L76–83）

```typescript
actions: ["bedrock-agentcore:InvokeAgentRuntime"],
resources: [props.verificationAgentArn, runtimeEndpointArn],
```

- **最小権限**: ✓ 必要な InvokeAgentRuntime のみ
- **リソーススコープ**: ✓ 特定の Verification Agent ARN とエンドポイントに限定
- **grant メソッド**: 手動 `addToRolePolicy` を使用（AgentCore は grant 非対応のため妥当）

### 2.2 Slack Event Handler Lambda（slack-event-handler.ts L131–137）

```typescript
actions: ["bedrock-agentcore:InvokeAgentRuntime"],
resources: [props.verificationAgentArn, runtimeEndpointArn],
```

- **最小権限**: ✓ 必要な InvokeAgentRuntime のみ
- **リソーススコープ**: ✓ 特定の Verification Agent ARN に限定
- **補足**: AGENT_INVOCATION_QUEUE_URL 設定時は SQS 経由で Agent Invoker が呼ぶため、直接 Invoke しない。両方のパスで同じ権限が必要。

### 2.3 Verification Agent Runtime（verification-agent-runtime.ts L171–186）

```typescript
actions: [
  "bedrock-agentcore:InvokeAgentRuntime",
  "bedrock-agentcore:GetAsyncTaskResult",
],
resources: props.executionAgentArn ? [props.executionAgentArn] : ["arn:aws:bedrock-agentcore:{region}:*:runtime/*"],
```

- **最小権限**: ✓ InvokeAgentRuntime と GetAsyncTaskResult（非同期タスク用）のみ
- **リソーススコープ**: ✓ クロスアカウント時は `executionAgentArn` に限定。同一アカウント時は `runtime/*` ワイルドカード（要確認: 自スタックの Execution Agent のみに絞れないか）

### 2.4 Execution Agent Runtime（execution-agent-runtime.ts L124–134）

```typescript
actions: [
  "bedrock:InvokeModel",
  "bedrock:InvokeModelWithResponseStream",
],
resources: ["*"],
```

- **最小権限**: ✓ Bedrock モデル呼び出しに必要な 2 アクションのみ
- **リソーススコープ**: ⚠ `*` — Bedrock の InvokeModel はリージョン・モデル ID でスコープ可能なら検討（AWS ドキュメントで制約確認）

---

## 3. CloudWatch メトリクス権限

| ロール | 条件 | 備考 |
|--------|------|------|
| Verification Agent Runtime | `cloudwatch:namespace`: `SlackEventHandler`, `SlackAI/*` | 021 で修正済み。SlackAI/VerificationAgent, SlackAI/ExecutionAgent が `SlackAI/*` にマッチ |
| Execution Agent Runtime | 同上 | 同上 |
| Slack Event Handler | `cloudwatch:namespace`: `SlackEventHandler` | 存在チェック用メトリクス |

---

## 4. HTTPS / 通信

- **全 Bedrock / AgentCore 呼び出し**: boto3 クライアント経由（`bedrock-agentcore`, `bedrock-runtime`）。AWS SDK はデフォルトで HTTPS を使用。
- **確認**: PrivateLink / VPC Endpoint の利用は現状なし。必要に応じて検討。

---

## 5. PII 非含有

- **エージェントリソース名**: `SlackAI_VerificationAgent`, `SlackAI_ExecutionAgent` — 一般名のみ、PII なし
- **アクション名・知識ベース名**: 本プロジェクトは Bedrock Agents のアクショングループ／知識ベースを未使用。AgentCore Runtime はコンテナベースで、リソース名にユーザーデータは含めない。

---

## 6. 推奨アクション（US1 用）— 適用状況

| 項目 | 現状 | 優先アクション | 適用済み |
|------|------|----------------|----------|
| Agent Invoker | 最小権限 ✓ | 変更不要 | コメント追加（026 トレース） |
| Slack Event Handler | 最小権限 ✓ | 変更不要 | コメント追加（026 トレース） |
| Verification Agent | 最小権限 ✓ | 同一アカウント時は executionAgentArn を明示指定 | cdk.ts で既に渡している。コメント追加 |
| Execution Agent | 最小権限 ✓ | Bedrock InvokeModel のリソーススコープ | AWS ドキュメント確認済み（foundation-model ARN 対応）。CDK addToPolicy は現状 `*` 出力。raw CFn 利用時は `arn:aws:bedrock:{region}::foundation-model/{modelId}` でスコープ可能 |
| その他 | 権限は grant メソッドと addToRolePolicy の併用 | 妥当 | — |
