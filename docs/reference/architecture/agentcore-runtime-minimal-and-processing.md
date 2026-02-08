# AgentCore Runtime 最小実装と残存処理

Verification Agent の AgentCore Runtime 実装を**公式ドキュメント・サンプル通り**の最小構成にし、その上で **Runtime 上で行う残りの処理**を解説する。

---

## 1. 公式契約との対応（最小実装）

[A2A protocol contract](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/runtime-a2a-protocol-contract.html) および [Service contract](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/runtime-service-contract.html) に従い、次の 3 点だけを実装している。

| 契約要件 | 実装 | ファイル |
|----------|------|----------|
| **POST /** | InvokeAgentRuntime のペイロードを受けるエントリポイント | `main.py`: `@app.entrypoint` → `handle_message(payload)` |
| **GET /.well-known/agent-card.json** | Agent Card（Discovery） | `main.py`: `@app.route` → `get_agent_card()` |
| **GET /ping** | ヘルスチェック | `main.py`: `@app.route` → `get_health_status(is_busy=...)` |

### main.py の役割（約 50 行）

- **BedrockAgentCoreApp** の作成と **app.run()**（[Stream agent responses](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/response-streaming.html) など公式サンプルと同じパターン）。
- 上記 3 エンドポイントの登録のみ。**ビジネスロジックは一切含まない。**
- エントリポイントは受け取った `payload` をそのまま **pipeline.run(payload)** に渡し、戻り値をそのまま返す。

```python
# main.py のエントリポイント（抜粋）
@app.entrypoint
def handle_message(payload):
    return run_pipeline(payload)
```

これにより「公式ドキュメント・サンプル通りの動くことが保証されている実装」を満たしつつ、処理内容はすべて `pipeline` に集約している。

---

## 2. AgentCore Runtime 上で行う残りの処理

すべて **pipeline.run()** 内で実行される。呼び出し元は main のエントリポイントのみ。

### 2.1 処理の流れ（概要）

1. **ペイロード解釈**  
   `payload["prompt"]` を JSON としてパースし、`task_payload`（channel, text, bot_token, thread_ts, team_id, user_id, attachments 等）を得る。

2. **セキュリティ検証パイプライン（3 段階）**  
   - **Existence Check**  
     Slack API（bot_token）で team_id / user_id / channel の実在確認。DynamoDB キャッシュあり。  
   - **Whitelist Authorization**  
     team_id / user_id / channel_id のホワイトリスト認可。DynamoDB 等で設定を参照。  
   - **Rate Limiting**  
     チーム／ユーザー単位のレート制限。DynamoDB でカウント。

3. **エコーモード（018）**  
   `VALIDATION_ZONE_ECHO_MODE=true` のときは、Execution Agent を呼ばず、`[Echo] ` + 本文を **Slack 投稿リクエスト** として SQS（slack-post-request）に送信し、`{"status": "completed"}` を返して終了。

4. **Execution Agent への委任（通常モード）**  
   検証済みの task を **A2A（InvokeAgentRuntime）** で Execution Agent に送り、結果（成功時の response_text / file_artifact、失敗時の error_code）を受け取る。

5. **Slack 投稿リクエストの送信（019）**  
   Slack には直接投稿しない。結果（テキスト・ファイル・エラーメッセージ）を **send_slack_post_request(...)** で SQS に送り、Slack Poster Lambda が実際に投稿する。

6. **応答**  
   いずれの経路でも、A2A の応答として `{"status": "completed" | "error", "correlation_id": ...}` を返す。

### 2.2 Runtime 上で使うリソース

| リソース | 用途 |
|----------|------|
| **DynamoDB** | 存在確認キャッシュ、ホワイトリスト設定、レート制限カウント、イベント重複排除（参照のみのテーブルあり） |
| **Secrets Manager** | ホワイトリスト設定（オプション）、Slack Bot Token（existence check 用の読み取りのみ） |
| **Slack API** | Existence Check 用の**読み取りのみ**（users.info, conversations.info 等）。投稿は行わない。 |
| **SQS** | slack-post-request キューへの送信（投稿内容の依頼） |
| **AgentCore（InvokeAgentRuntime）** | Execution Agent の呼び出し（A2A） |

### 2.3 Runtime 上で行わないこと

- **Slack への投稿**  
  投稿は Slack Poster Lambda が担当。Runtime は SQS に「投稿リクエスト」を送るだけ。
- **Slack 署名検証**  
  署名検証は Slack Event Handler Lambda で実施済み。Runtime では行わない。
- **イベント重複排除**  
  重複排除は Lambda 側（DynamoDB）で実施。Runtime では行わない。

---

## 3. ファイル構成（Runtime コンテナ内）

| ファイル | 役割 |
|----------|------|
| **main.py** | 公式契約の最小実装のみ。BedrockAgentCoreApp、entrypoint、agent-card、ping、app.run()。 |
| **pipeline.py** | 上記「残りの処理」すべて。run(payload) がエントリポイントから呼ばれる唯一のビジネスロジック。 |
| **agent_card.py** | Agent Card と /ping のレスポンス内容。 |
| **existence_check.py** | Slack API を使った実在性チェック。 |
| **authorization.py** | ホワイトリスト認可。 |
| **rate_limiter.py** | レート制限。 |
| **a2a_client.py** | Execution Agent への A2A 呼び出し。 |
| **slack_post_request.py** | SQS への Slack 投稿リクエスト送信。 |

---

## 4. 参照（AWS 公式）

- [A2A protocol contract](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/runtime-a2a-protocol-contract.html)
- [Runtime service contract](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/runtime-service-contract.html)
- [Deploy A2A servers in AgentCore Runtime](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/runtime-a2a.html)
- [Stream agent responses (BedrockAgentCoreApp + entrypoint)](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/response-streaming.html)
