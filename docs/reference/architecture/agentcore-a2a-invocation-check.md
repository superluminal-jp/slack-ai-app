# AgentCore A2A 呼び出し仕様との照合

Amazon Bedrock AgentCore を A2A 契約どおりに呼び出せているかを、公式ドキュメントと実装で照合した結果。

---

## 1. 参照ドキュメント

| ドキュメント | URL |
|-------------|-----|
| Invoke an AgentCore Runtime agent | https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/runtime-invoke-agent.html |
| InvokeAgentRuntime API Reference | https://docs.aws.amazon.com/bedrock-agentcore/latest/APIReference/API_InvokeAgentRuntime.html |
| A2A protocol contract | https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/runtime-a2a-protocol-contract.html |
| Deploy A2A servers in AgentCore Runtime | https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/runtime-a2a.html |

---

## 2. InvokeAgentRuntime API 仕様（呼び出し側）

| 項目 | 仕様 | 実装（Agent Invoker Lambda） | 判定 |
|------|------|------------------------------|------|
| **クライアント** | Data Plane: `bedrock-agentcore`（boto3） | `boto3.client("bedrock-agentcore", region_name=region)` | ✅ |
| **操作** | `invoke_agent_runtime` | `client.invoke_agent_runtime(...)` | ✅ |
| **agentRuntimeArn** | 必須。Runtime の ARN | `os.environ.get("VERIFICATION_AGENT_ARN")` | ✅ |
| **runtimeSessionId** | 必須。長さ 33–256 文字（ヘッダ `X-Amzn-Bedrock-AgentCore-Runtime-Session-Id`） | `str(uuid.uuid4())`（36 文字） | ✅ |
| **payload** | 必須。バイナリ、最大 100 MB。JSON の場合は `json.dumps(...).encode()` | `json.dumps({"prompt": json.dumps(task_data)}).encode("utf-8")` | ✅ |
| **権限** | `bedrock-agentcore:InvokeAgentRuntime` | Agent Invoker ロールに付与済み | ✅ |

**結論**: **Agent Invoker は A2A/InvokeAgentRuntime の呼び出し仕様どおり実装されている。**

---

## 3. A2A コンテナ契約（Runtime 側）

| 項目 | 契約 | 実装（Verification Agent） | 判定 |
|------|------|----------------------------|------|
| **ポート** | 9000（A2A 専用） | `app.run(port=9000)`（main.py） | ✅ |
| **プラットフォーム** | ARM64 | Dockerfile `FROM --platform=linux/arm64` | ✅ |
| **GET /.well-known/agent-card.json** | Agent Card。Content-Type: application/json | `get_agent_card()` を JSON で返却 | ✅ |
| **GET /ping** | ヘルスチェック。200, application/json。例: `{"status": "Healthy", "time_of_last_update": ...}` | `get_health_status()` → `{"status": "Healthy"\|"HealthyBusy", ...}` | ✅ |
| **POST /** | JSON-RPC 2.0 または InvokeAgentRuntime のペイロードのパススルー | `@app.entrypoint` で payload を受信し `run_pipeline(payload)`。`{"prompt": "<JSON>"}` を想定 | ✅ |

**GET /ping と GET /.well-known/agent-card.json の 200 確認**

両エンドポイントは 200 を返す。検証方法:

```bash
cd cdk/lib/verification/agent/verification-agent
python scripts/verify_a2a_endpoints.py
```

期待出力: `OK   GET /ping -> 200` と `OK   GET /.well-known/agent-card.json -> 200`（pytest の conftest は bedrock_agentcore をモックするため、このスクリプトは pytest 外で実行すること）。

**ペイロード形式**: 公式例では `{"prompt": prompt}` をバイナリ化して送る方式が記載されている。当実装は `{"prompt": json.dumps(task_data)}` で統一しており、Runtime 側で `payload.get("prompt")` から task を復元している。契約上の「JSON-RPC 2.0 message/send」は A2A サーバが解釈する形式であり、プラットフォームがそのままバイナリをコンテナに渡す前提であれば、現在の prompt ラッパーは許容される。

---

## 4. エラー 424 (RuntimeClientError)

[API Reference](https://docs.aws.amazon.com/bedrock-agentcore/latest/APIReference/API_InvokeAgentRuntime.html) より:

- **RuntimeClientError**: HTTP 424。Runtime（コンテナ）側のエラー。CloudWatch ログ確認を推奨。

考えられる原因:

1. コンテナがポート 9000 で listen していない（解消済み: `app.run(port=9000)`）
2. GET /ping または GET /.well-known/agent-card.json が 200 を返していない、または形式不備
3. コンテナの起動遅延・ヘルスチェック失敗
4. イメージが未デプロイ／古いイメージが使われている（キャッシュなしビルドで対応）

---

## 5. Verification Agent → Execution Agent 呼び出し（a2a_client）

Verification Agent が Execution Agent を呼ぶ場合も、同じ InvokeAgentRuntime 仕様に揃える。

| 項目 | 仕様 | 修正前（a2a_client） | 修正後 |
|------|------|----------------------|--------|
| クライアント | `bedrock-agentcore` | `bedrock-agentcore-runtime` | `bedrock-agentcore` |
| パラメータ | `agentRuntimeArn`, `runtimeSessionId`, `payload` | `agentRuntimeArn`, `sessionId`, `prompt` | `agentRuntimeArn`, `runtimeSessionId`, `payload` |
| レスポンス | `response["response"]` (StreamingBody)、`contentType` | `response["body"]` | `response.get("response")` をストリームとして読み取り |

a2a_client は上記のとおり API 仕様に合わせて修正する（別タスクで実施）。

---

## 6. 照合まとめ

- **Agent Invoker → Verification Agent**: InvokeAgentRuntime のパラメータ・ペイロード・クライアントは **A2A の使用どおり**。
- **Verification Agent コンテナ**: ポート 9000・agent-card・ping・entrypoint は **A2A 契約どおり**。
- 424 が続く場合は、Runtime のヘルス（ping/agent-card）とコンテナログを確認する。
