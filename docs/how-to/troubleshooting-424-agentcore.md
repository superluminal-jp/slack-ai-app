# AgentCore Runtime 424 エラー調査報告

**調査日**: 2026-02-08
**対象**: SlackAI-Verification-Dev スタック — Verification Agent Runtime
**ステータス**: 根本原因特定済み

---

## 概要

エコーモードを有効にした状態で Verification Zone の AgentCore Runtime を呼び出すと、`InvokeAgentRuntime` API が 424 `RuntimeClientError` を返す。Agent Card（GET）は正常応答するが、タスク実行（POST）が全件失敗する。

---

## 根本原因

**A2A プロトコルのルーティングパスと `BedrockAgentCoreApp` SDK のパス不一致**

AWS 公式 Service Contract で定義されたプロトコル別のマウントパス:

| プロトコル | マウントパス | ポート |
|-----------|------------|--------|
| HTTP      | `/invocations` | 8080 |
| MCP       | `/mcp`         | 8000 |
| **A2A**   | **`/` (ルート)** | **9000** |

`BedrockAgentCoreApp` SDK（`bedrock-agentcore` v1.2.0）は HTTP プロトコル向けに設計されており、POST ハンドラを `/invocations` にのみ登録する:

```python
# bedrock_agentcore/runtime/app.py:101
routes = [
    Route("/invocations", self._handle_invocation, methods=["POST"]),
    Route("/ping", self._handle_ping, methods=["GET"]),
    WebSocketRoute("/ws", self._handle_websocket),
]
```

A2A プロトコルでは AgentCore サービスが POST を `/`（ルート）に送信するため、Starlette が 404 を返し、AgentCore がこれを 424 `RuntimeClientError` にマッピングする。

---

## 証拠

### 1. Agent Card は成功、Invoke は失敗

```bash
# Agent Card: 200 OK（/.well-known/agent-card.json はカスタムルートで登録済み）
$ aws bedrock-agentcore get-agent-card \
    --agent-runtime-arn "arn:aws:bedrock-agentcore:ap-northeast-1:471112852670:runtime/SlackAI_VerificationAgent-ri0uod5LdE"
# → statusCode: 200

# Invoke: 424 RuntimeClientError（POST / にハンドラなし）
$ aws bedrock-agentcore invoke-agent-runtime \
    --agent-runtime-arn "arn:aws:bedrock-agentcore:ap-northeast-1:471112852670:runtime/SlackAI_VerificationAgent-ri0uod5LdE" \
    --runtime-session-id "$(uuidgen)" \
    --payload "$(echo '{"prompt": "test"}' | base64)" \
    --cli-binary-format base64 /tmp/response.json
# → An error occurred (424) when calling the InvokeAgentRuntime operation:
```

### 2. コンテナログが空

ロググループ `/aws/bedrock-agentcore/runtimes/SlackAI_VerificationAgent-ri0uod5LdE-DEFAULT` の唯一のストリーム `otel-rt-logs` にイベントが0件。リクエストがアプリケーションコードに到達せず、Starlette レベルで 404 が返されるため。

### 3. Agent Invoker Lambda の一貫した 424 エラー

```json
{"level": "ERROR", "event": "agent_invocation_failed",
 "error": "An error occurred (424) when calling the InvokeAgentRuntime operation: ",
 "error_code": "424", "error_message": "", "http_status": 424}
```

直近3時間で10件以上の連続失敗。Duration パターン:
- 初期: ~62秒（コールドスタート + タイムアウト待ち）
- 最近: ~2秒（AgentCore がキャッシュ済み失敗を即返却）

### 4. ランタイム自体は READY

```bash
$ aws bedrock-agentcore-control get-agent-runtime \
    --agent-runtime-id "SlackAI_VerificationAgent-ri0uod5LdE"
# → status: "READY", protocolConfiguration: { serverProtocol: "A2A" }
# → エンドポイント DEFAULT も READY
```

### 5. Execution Agent にも同様の問題

```bash
$ aws bedrock-agentcore get-agent-card \
    --agent-runtime-arn "arn:aws:bedrock-agentcore:ap-northeast-1:471112852670:runtime/SlackAI_ExecutionAgent-QQDzjl2E45"
# → 502 (Received error (502) from agent card endpoint)
```

Execution Agent は `app.run()` でデフォルトポート 8080 を使用（A2A 要件は 9000）。ポートもパスも不一致。

---

## 影響範囲

| コンポーネント | ポート | パス | 問題 |
|--------------|--------|------|------|
| Verification Agent | 9000（正） | `/invocations`（誤） | POST `/` 未登録 → 424 |
| Execution Agent | 8080（誤） | `/invocations`（誤） | ポート + パス両方不一致 → 502 |

---

## 副次的発見

### VALIDATION_ZONE_ECHO_MODE 未設定

ランタイム環境変数に `VALIDATION_ZONE_ECHO_MODE` が含まれていない。CDK の `validationZoneEchoMode` プロパティが `false` で渡されている:

```typescript
// cdk/lib/verification/constructs/verification-agent-runtime.ts:201
if (props.validationZoneEchoMode === true) {
  environmentVariables.VALIDATION_ZONE_ECHO_MODE = "true";
}
```

デプロイ時に `validationZoneEchoMode: true` を明示的に指定する必要がある。

### CloudWatch Metrics のパーミッション不一致

CDK の IAM ポリシー:
```typescript
conditions: { StringEquals: { "cloudwatch:namespace": "bedrock-agentcore" } }
```

アプリケーションコード:
```python
client.put_metric_data(Namespace="SlackEventHandler", ...)
```

名前空間が一致しないため、カスタムメトリクスの発行が `AccessDenied` で失敗する（ただしコード内で例外キャッチ済みのため動作には影響なし）。

---

## 修正方針

### 方針 1: ルートパスにルートを追加（最小変更）

`main.py` にルートパスのハンドラを追加:

```python
# A2A protocol: POST / (root) → same handler as /invocations
@app.route("/", methods=["POST"])
async def a2a_root_handler(request):
    return await app._handle_invocation(request)
```

### 方針 2: strands-agents の A2AServer を使用（公式推奨パターン）

`strands-agents[a2a]` の `A2AServer` クラスを使用:

```python
from strands.a2a import A2AServer
a2a_server = A2AServer(agent=..., serve_at_root=True)
uvicorn.run(a2a_server.app, host="0.0.0.0", port=9000)
```

### 方針 3: 両パスを登録（互換性重視）

`/` と `/invocations` の両方にハンドラを登録してプロトコル非依存にする。

### Execution Agent の追加修正

`app.run()` → `app.run(port=9000)` に変更。

---

## 検証手順

修正デプロイ後:

```bash
# 1. ランタイムステータス確認
aws bedrock-agentcore-control get-agent-runtime \
  --agent-runtime-id "SlackAI_VerificationAgent-ri0uod5LdE" \
  --query 'status'

# 2. Agent Card 確認
aws bedrock-agentcore get-agent-card \
  --agent-runtime-arn "arn:aws:bedrock-agentcore:ap-northeast-1:471112852670:runtime/SlackAI_VerificationAgent-ri0uod5LdE"

# 3. Invoke テスト
aws bedrock-agentcore invoke-agent-runtime \
  --agent-runtime-arn "arn:aws:bedrock-agentcore:ap-northeast-1:471112852670:runtime/SlackAI_VerificationAgent-ri0uod5LdE" \
  --runtime-session-id "$(python3 -c 'import uuid; print(str(uuid.uuid4()))')" \
  --payload "$(echo '{"prompt": "{\"channel\": \"C_TEST\", \"text\": \"hello\"}"}' | base64)" \
  --cli-binary-format base64 \
  /tmp/response.json

# 4. コンテナログ確認（修正後はログが出力されるはず）
aws logs filter-log-events \
  --log-group-name "/aws/bedrock-agentcore/runtimes/SlackAI_VerificationAgent-ri0uod5LdE-DEFAULT" \
  --start-time $(python3 -c "import time; print(int((time.time() - 600) * 1000))") \
  --query 'events[*].message' --output text
```

---

## 参照

- [AgentCore Service Contract](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/runtime-service-contract.html) — プロトコル別マウントパス定義
- [A2A Protocol Contract](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/runtime-a2a-protocol-contract.html) — A2A 固有の要件
- [Troubleshoot AgentCore Runtime](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/runtime-troubleshooting.html) — 公式トラブルシューティング
- [InvokeAgentRuntime API](https://docs.aws.amazon.com/bedrock-agentcore/latest/APIReference/API_InvokeAgentRuntime.html) — 424 RuntimeClientError 定義
- [GitHub Issue #314](https://github.com/awslabs/amazon-bedrock-agentcore-samples/issues/314) — 類似の 424 エラー報告
- [Strands Agents A2A Deployment](https://strandsagents.com/latest/documentation/docs/user-guide/deploy/deploy_to_bedrock_agentcore/python/) — 公式 A2A デプロイパターン
