# Research: AgentCore A2A ゾーン間通信

**Branch**: `013-agentcore-a2a-zones` | **Date**: 2026-02-07

---

## R-001: AgentCore Runtime のリージョン可用性と CloudFormation サポート

**Decision**: Amazon Bedrock AgentCore Runtime は `ap-northeast-1`（東京）で利用可能。`AWS::BedrockAgentCore::Runtime` CloudFormation リソースタイプも同リージョンで利用可能。

**Rationale**: AWS リージョナル可用性 API で確認済み。AgentCore Runtime は GA（2025 年 10 月）として 9 リージョンで提供されており、東京リージョンは対象に含まれる。CloudFormation リソースタイプ `AWS::BedrockAgentCore::Runtime` も `ap-northeast-1` で利用可能であることを確認。

**Alternatives considered**:
- us-east-1 へのリージョン変更: 不要（東京リージョンで利用可能）
- CDK L2 コンストラクト: 現時点では L2 コンストラクトは未提供。CDK L1（`CfnRuntime`, `CfnRuntimeEndpoint`）を使用する

---

## R-002: A2A プロトコルのコンテナ要件と実装パターン

**Decision**: A2A サーバーは ARM64 コンテナとしてポート 9000 で実装。`strands-agents[a2a]` + `fastapi` + `bedrock-agentcore` SDK を使用。

**Rationale**: AWS ドキュメント（A2A protocol contract）で以下が確認された:
- **ホスト**: `0.0.0.0`
- **ポート**: `9000`（A2A 専用。HTTP は 8080、MCP は 8000）
- **プラットフォーム**: `linux/arm64`（必須）
- **必須エンドポイント**:
  - `POST /` — JSON-RPC 2.0 メッセージ受信
  - `GET /.well-known/agent-card.json` — Agent Discovery
  - `GET /ping` — ヘルスチェック
- **セッション管理**: `X-Amzn-Bedrock-AgentCore-Runtime-Session-Id` ヘッダーが自動付与
- **SDK**: `bedrock-agentcore` パッケージ（`pip install bedrock-agentcore`）

**Alternatives considered**:
- HTTP プロトコル（ポート 8080）: A2A のエージェント間通信機能（Agent Card、JSON-RPC 2.0 標準化）が利用不可
- MCP プロトコル（ポート 8000）: ツール提供に特化。エージェント間のタスク委任には A2A が適切
- カスタム gRPC: AWS 非対応、AgentCore のセッション管理・オブザーバビリティが利用不可

---

## R-003: クロスアカウント A2A 通信の認証方式

**Decision**: SigV4 認証 + リソースベースポリシーを使用。Runtime と Endpoint の両方にリソースベースポリシーを設定する。

**Rationale**: AWS ドキュメント（resource-based-policies）で以下が確認された:
- クロスアカウントアクセスには、**Runtime** と **Endpoint** の両方にリソースベースポリシーを設定する必要がある
- 許可するアクション: `bedrock-agentcore:InvokeAgentRuntime`
- Principal: 呼び出し元アカウントの IAM ロール ARN
- 管理 API: `put-resource-policy` / `get-resource-policy` / `delete-resource-policy`
- 認証タイプ制約: SigV4 と OAuth は同時に使用不可（Runtime 作成時に選択）

**ポリシー例（Execution Agent 側に設定）**:
```json
{
  "Effect": "Allow",
  "Principal": {
    "AWS": "arn:aws:iam::<VERIFICATION_ACCOUNT>:role/VerificationAgentRole"
  },
  "Action": "bedrock-agentcore:InvokeAgentRuntime",
  "Resource": "*"
}
```

**Alternatives considered**:
- OAuth 2.0: 外部 IdP 統合が必要で過剰。既存システムは AWS IAM ベースのため SigV4 が自然
- API キー認証: AgentCore Runtime では直接サポートされない。SigV4 または OAuth のみ
- VPC Endpoint + PrivateLink: 追加のネットワーク設定が複雑。SigV4 でパブリックエンドポイントを保護する方がシンプル

---

## R-004: 非同期タスク管理の実装パターン

**Decision**: AgentCore SDK の `add_async_task` / `complete_async_task` API を使用。`@app.entrypoint` からバックグラウンドスレッドでタスクを実行。

**Rationale**: AWS ドキュメント（runtime-long-run）で以下が確認された:
- 非同期処理は `add_async_task(task_name, metadata)` でタスク追跡を開始
- `complete_async_task(task_id)` でタスク完了を通知
- ヘルスチェック `/ping` が自動的に `HealthyBusy` を返す（タスク進行中）
- セッションは `HealthyBusy` 状態中も維持される（15 分アイドルタイムアウトはリセット）
- 最大 8 時間の実行が可能
- **重要**: `@app.entrypoint` ハンドラはブロッキング操作を行ってはならない（`/ping` エンドポイントもブロックされるため）
- バックグラウンドスレッドまたは async メソッドでブロッキング操作を実行する

**実装パターン**:
```python
@app.entrypoint
def main(payload):
    task_id = app.add_async_task("bedrock_processing")
    
    def background_work():
        try:
            result = process_with_bedrock(payload)
            # A2A レスポンスを Verification Agent に返却
            send_a2a_response(result)
        finally:
            app.complete_async_task(task_id)
    
    threading.Thread(target=background_work, daemon=True).start()
    return {"status": "accepted", "task_id": task_id}
```

**Alternatives considered**:
- SQS キュー（現行方式）: AgentCore の非同期機能を使わない場合、追加のインフラ管理が必要。AgentCore のセッション管理・ヘルスチェックとの統合メリットがない
- Step Functions: オーバーエンジニアリング。2 エージェント間の単純な非同期処理には不要
- EventBridge: イベントルーティングには有用だが、A2A 直接通信の方がレイテンシが低い

---

## R-005: Slack Function URL → AgentCore Runtime への接続パターン

**Decision**: Slack Function URL + SlackEventHandler Lambda を維持し、Lambda 内から AgentCore Verification Agent を `InvokeAgentRuntime` API で呼び出す（フェーズ 1）。将来的に Lambda を薄いプロキシ化し、ロジックをエージェントに移行する（フェーズ 2）。

**Rationale**:
- Slack は HTTPS POST（Function URL）でイベントを送信する。AgentCore Runtime のエンドポイントは `https://bedrock-agentcore.{region}.amazonaws.com/runtimes/{ARN}/invocations/` 形式であり、Slack の Event Subscriptions に直接登録できない
- Slack 署名検証（HMAC SHA256）は Slack 固有のプロトコルであり、AgentCore の SigV4/OAuth 認証とは異なる
- **段階的移行戦略**: Lambda を Slack → AgentCore へのブリッジとして維持することで、リスクを最小化する

**接続フロー**:
```
Slack → Function URL → SlackEventHandler Lambda（署名検証・即時応答）
  → InvokeAgentRuntime(Verification Agent) via A2A
    → Verification Agent（Existence Check、ホワイトリスト、レート制限）
      → InvokeAgentRuntime(Execution Agent) via A2A（クロスアカウント SigV4）
        → Execution Agent（Bedrock 処理、非同期タスク）
          → A2A レスポンス → Verification Agent → Slack API（chat.postMessage）
```

**Alternatives considered**:
- AgentCore Inbound Auth で Slack 署名を代替: AgentCore は SigV4/OAuth のみ。Slack HMAC SHA256 には非対応
- Lambda Layer を AgentCore コンテナに統合: コンテナ化することで Layer が不要になるが、移行リスクが大きい
- 全ロジックを Lambda に残し AgentCore は Execution のみ: A2A の利点（Agent Discovery、標準化されたプロトコル）が活かせない

---

## R-006: ECR イメージビルドとデプロイメントパイプライン

**Decision**: CDK の `DockerImageAsset` を使用して ECR にイメージをプッシュ。`--platform linux/arm64` でビルド。

**Rationale**:
- AgentCore Runtime は ARM64 コンテナイメージを ECR から取得する
- CDK `DockerImageAsset` は自動的に ECR リポジトリを作成し、`cdk deploy` 時にイメージをビルド・プッシュする
- `AWS::BedrockAgentCore::Runtime` の `ContainerUri` に ECR イメージ URI を渡す

**Dockerfile パターン**:
```dockerfile
FROM --platform=linux/arm64 python:3.11-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
EXPOSE 9000
CMD ["python", "main.py"]
```

**Alternatives considered**:
- CodeBuild パイプライン: CI/CD には有用だが、CDK deploy だけでデプロイしたい場合は `DockerImageAsset` で十分
- AgentCore CLI (`agentcore configure` + `agentcore launch`): 開発時には便利だが、CDK/CloudFormation による宣言的デプロイの方が本番運用に適切
- Lambda コンテナイメージ: AgentCore Runtime は Lambda ではないため不適切

---

## R-007: AgentCore IAM 実行ロールの権限設計

**Decision**: 各エージェント専用の IAM 実行ロールを作成。信頼ポリシーで `bedrock-agentcore.amazonaws.com` を Principal に設定。

**Rationale**: AWS ドキュメント（runtime-permissions）で以下が確認された:

**Verification Agent 実行ロール**:
| 権限カテゴリ | アクション | 理由 |
|-------------|-----------|------|
| ECR イメージ | `ecr:BatchGetImage`, `ecr:GetDownloadUrlForLayer`, `ecr:GetAuthorizationToken` | コンテナイメージ取得 |
| CloudWatch Logs | `logs:Create*`, `logs:PutLogEvents`, `logs:Describe*` | ログ出力 |
| X-Ray | `xray:PutTraceSegments`, `xray:PutTelemetryRecords`, `xray:GetSampling*` | トレーシング |
| CloudWatch Metrics | `cloudwatch:PutMetricData` (namespace: `bedrock-agentcore`) | メトリクス |
| DynamoDB | 5 テーブルへの ReadWrite | 既存セキュリティ機能 |
| Secrets Manager | `GetSecretValue` | Slack シークレット |
| Slack API | N/A（Outbound HTTPS） | Slack API 呼び出し |
| AgentCore Invoke | `bedrock-agentcore:InvokeAgentRuntime` | Execution Agent 呼び出し |

**Execution Agent 実行ロール**:
| 権限カテゴリ | アクション | 理由 |
|-------------|-----------|------|
| ECR/CloudWatch/X-Ray | 上記と同様 | 基本インフラ |
| Bedrock | `bedrock:InvokeModel`, `bedrock:InvokeModelWithResponseStream` | AI 処理 |
| Slack API | N/A（Outbound HTTPS） | 添付ファイルダウンロード、スレッド履歴 |

**信頼ポリシー**:
```json
{
  "Principal": { "Service": "bedrock-agentcore.amazonaws.com" },
  "Action": "sts:AssumeRole",
  "Condition": {
    "StringEquals": { "aws:SourceAccount": "<ACCOUNT_ID>" },
    "ArnLike": { "aws:SourceArn": "arn:aws:bedrock-agentcore:<REGION>:<ACCOUNT_ID>:*" }
  }
}
```

**Alternatives considered**:
- 共通ロール: 最小権限の原則に違反。各エージェントは異なるリソースにアクセスするため専用ロールが必要
- `BedrockAgentCoreFullAccess` 管理ポリシー: 本番環境には過剰。カスタムポリシーを推奨

---

## R-008: 既存 SQS / API Gateway の移行戦略

**Decision**: 段階的移行（フェーズ制）。フェーズ 1 では API Gateway と SQS を維持しつつ AgentCore を並行稼働。フェーズ 2 で API Gateway / SQS を削除。

**Rationale**:
- 一度に全てを置き換えるとリスクが高い（ビッグバン移行の回避）
- フェーズ 1: AgentCore Runtime を追加デプロイ。Feature flag で新旧を切り替え可能にする
  - SlackEventHandler Lambda 内で `USE_AGENTCORE=true/false` 環境変数を参照
  - `true`: AgentCore Verification Agent を `InvokeAgentRuntime` で呼び出し
  - `false`: 既存 API Gateway `/execute` を呼び出し（フォールバック）
- フェーズ 2: AgentCore 経由の動作が安定後、API Gateway / SQS / SlackResponseHandler を削除
- フェーズ 3: SlackEventHandler Lambda のロジックも Verification Agent に統合（Lambda は薄いプロキシに）

**Alternatives considered**:
- ビッグバン移行: リスクが高すぎる。ロールバック不可
- Blue/Green デプロイ: 2 つのシステムを完全並行稼働は管理コストが高い
- カナリアデプロイ: Feature flag ベースで実質的にカナリアデプロイを実現

---

## R-009: A2A 通信の JSON-RPC 2.0 メッセージ設計

**Decision**: 既存の ExecutionResponse 形式を A2A JSON-RPC 2.0 メッセージの `parts` にマッピングする。

**Rationale**: A2A プロトコルは JSON-RPC 2.0 を使用し、メッセージは `parts` 配列で構成される。既存の API Gateway ペイロード（channel, text, bot_token, thread_ts, attachments）と ExecutionResponse（status, response_text, error_code 等）を A2A メッセージに変換する。

**リクエスト（Verification → Execution）**:
```json
{
  "jsonrpc": "2.0",
  "id": "correlation-id-uuid",
  "method": "message/send",
  "params": {
    "message": {
      "role": "user",
      "parts": [
        {
          "kind": "text",
          "text": "{\"channel\":\"C01234567\",\"text\":\"ユーザーの質問\",\"bot_token\":\"xoxb-...\",\"thread_ts\":\"1234567890.123456\",\"attachments\":[...]}"
        }
      ],
      "messageId": "unique-message-id"
    }
  }
}
```

**レスポンス（Execution → Verification）**:
```json
{
  "jsonrpc": "2.0",
  "id": "correlation-id-uuid",
  "result": {
    "artifacts": [
      {
        "artifactId": "response-artifact-id",
        "name": "execution_response",
        "parts": [
          {
            "kind": "text",
            "text": "{\"status\":\"success\",\"channel\":\"C01234567\",\"thread_ts\":\"...\",\"bot_token\":\"xoxb-...\",\"response_text\":\"AI 回答\"}"
          }
        ]
      }
    ]
  }
}
```

**Alternatives considered**:
- A2A ストリーミング: 将来の拡張として検討。初回はリクエスト/レスポンスパターンでシンプルに実装
- バイナリペイロード: A2A は `text`/`file` parts をサポート。初回はテキスト JSON で統一

---

## R-010: コスト比較（AgentCore vs Lambda + API Gateway + SQS）

**Decision**: AgentCore はコンサンプションベース料金。CPU 使用時間のみ課金（I/O 待機中は課金なし）。正確なコスト比較は PoC 後に実施。

**Rationale**:
- AgentCore Runtime: CPU 使用時間ベース。LLM レスポンス待機中は課金されない
- 現行: Lambda 実行時間 + API Gateway リクエスト数 + SQS メッセージ数
- AgentCore は API Gateway と SQS のコストを削除するが、ECR ストレージと microVM の起動時間が追加コスト
- セッションのアイドルタイムアウト（15 分）により、低頻度のリクエストではコールドスタートのオーバーヘッドが発生する可能性あり

**Next Step**: PoC 環境で 1 週間の実トラフィックで比較測定を実施
