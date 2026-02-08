# InvokeAgentRuntime 利用の検証（AWS 公式との比較）

Agent Invoker Lambda が Verification Agent を呼ぶ際に **InvokeAgentRuntime** を使うことが適切か、AWS 公式ドキュメントと照らして検証した結果です。

## 結論

**InvokeAgentRuntime の利用は適切です。** 現状の実装は AWS 公式の使い方・推奨と一致しています。

---

## 1. AWS 公式での位置づけ

- **API**: [InvokeAgentRuntime](https://docs.aws.amazon.com/bedrock-agentcore/latest/APIReference/API_InvokeAgentRuntime.html)（Bedrock AgentCore Data API）
- **ガイド**: [Invoke an AgentCore Runtime agent](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/runtime-invoke-agent.html)
- **用途**: AgentCore Runtime 上でホストされているエージェント（またはツール）にリクエストを送り、ストリーミングまたは通常応答を受け取る。
- **認可**: `bedrock-agentcore:InvokeAgentRuntime` が必要。OAuth 連携時は AWS SDK ではなく HTTPS で呼ぶ必要あり（本システムは SigV4 のみ使用）。

---

## 2. 公式ドキュメントの呼び出し方（boto3）

```python
import boto3
import json

agent_core_client = boto3.client('bedrock-agentcore')
payload = json.dumps({"prompt": prompt}).encode()

response = agent_core_client.invoke_agent_runtime(
    agentRuntimeArn=agent_arn,
    runtimeSessionId=session_id,
    payload=payload
)
```

- **クライアント**: `boto3.client('bedrock-agentcore')`
- **必須パラメータ**: `agentRuntimeArn`, `runtimeSessionId`, `payload`（バイナリ、最大 100 MB）
- **sessionId**: 33〜256 文字（公式では UUID 推奨）
- **ペイロード**: 多くのエージェントでは JSON の `{"prompt": ...}` をバイナリエンコードして送る形式。

---

## 3. 現状実装との比較

| 項目 | AWS 公式 | 現状（Agent Invoker） | 一致 |
|------|----------|------------------------|------|
| クライアント | `boto3.client('bedrock-agentcore')` | `boto3.client("bedrock-agentcore", region_name=region)` | ✅ |
| メソッド | `invoke_agent_runtime(...)` | `client.invoke_agent_runtime(...)` | ✅ |
| agentRuntimeArn | Runtime の ARN | `os.environ["VERIFICATION_AGENT_ARN"]` | ✅ |
| runtimeSessionId | 33–256 文字（UUID 推奨） | `str(uuid.uuid4())`（36 文字） | ✅ |
| payload | `json.dumps({"prompt": ...}).encode()` | `json.dumps({"prompt": json.dumps(task_data)}).encode("utf-8")` | ✅ |
| リトライ | ThrottlingException 時に exponential backoff 推奨 | `_invoke_with_retry` で最大 3 回、指数バックオフ | ✅ |
| boto3 バージョン | 1.39.8+ / botocore 1.33.8+（トラブルシューティング） | `requirements.txt`: `boto3>=1.39.8` | ✅ |

### ペイロードの中身

- **公式例**: `{"prompt": prompt}` の 1 段階。
- **現状**: `{"prompt": json.dumps(task_data)}`。`task_data` に `channel`, `text`, `bot_token`, `thread_ts`, `attachments`, `correlation_id`, `team_id`, `user_id`, `event_id` を含める。
- Verification Agent（`main.py`）は `payload.get("prompt")` を JSON としてパースし `task_payload` として利用しているため、この形式で整合している。

### IAM・リソース

- Agent Invoker のロールに `bedrock-agentcore:InvokeAgentRuntime` を付与。
- リソースは Runtime ARN および `${runtimeArn}/runtime-endpoint/DEFAULT` を指定（`agent-invoker.ts`）。qualifier 未指定のため DEFAULT エンドポイントで問題なし。

---

## 4. 補足（A2A との関係）

- Verification Agent は **A2A プロトコル**（port 9000, JSON-RPC 2.0）でコンテナを公開。
- [A2A protocol contract](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/runtime-a2a-protocol-contract.html) には「InvokeAgentRuntime API payload の完全なパススルー」とあり、呼び出し側は **InvokeAgentRuntime** でバイナリペイロードを送ればよい。
- コンテナ内では Bedrock AgentCore SDK（`BedrockAgentCoreApp`）がリクエストを受け、`handle_message(payload)` に `payload["prompt"]` が渡る形で整合している。

---

## 5. 参照リンク（AWS 公式）

- [Invoke an AgentCore Runtime agent](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/runtime-invoke-agent.html)
- [InvokeAgentRuntime API Reference](https://docs.aws.amazon.com/bedrock-agentcore/latest/APIReference/API_InvokeAgentRuntime.html)
- [Troubleshoot AgentCore Runtime](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/runtime-troubleshooting.html)（boto3 バージョン・424 等）
- [A2A protocol contract](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/runtime-a2a-protocol-contract.html)
