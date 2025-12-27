# Research: Verification Zone Slack Response Handling

**Feature**: 011-verification-slack-response  
**Date**: 2025-01-30  
**Purpose**: 実行ゾーンからのレスポンスを検証ゾーン経由で Slack に投稿するアーキテクチャパターンの調査

## Research Questions

### RQ-01: 検証ゾーンが実行ゾーンからのレスポンスを待機する方法

**Question**: 検証ゾーンは実行ゾーンからのレスポンスをどのように受け取るべきか？同期待機か非同期コールバックか？

**Decision**: **非同期コールバックパターン（SQS キュー経由）**を採用

**Rationale**:

1. **Slack の 3 秒タイムアウト制約**:

   - 検証ゾーンは Slack からのリクエストに対して 3 秒以内に応答する必要がある
   - 実行ゾーンの Bedrock API 呼び出しは 5〜30 秒かかるため、同期待機は不可能
   - 検証ゾーンは即座に 200 OK を返し、実行ゾーンからのレスポンスを非同期で受け取る必要がある

2. **既存の非同期パターンとの整合性**:

   - 現在のアーキテクチャ（ADR-003）は非同期パターンを採用
   - 検証ゾーンは即座に応答し、実行ゾーンが後で Slack に直接投稿している
   - 今回の変更では、実行ゾーンが Slack に直接投稿する代わりに、検証ゾーンにレスポンスを返す

3. **非同期コールバックの選択肢**:

   | 手法                         | 長所                                         | 短所                                                                         | 評価                |
   | ---------------------------- | -------------------------------------------- | ---------------------------------------------------------------------------- | ------------------- |
   | **SQS キュー**               | シンプル、信頼性高い、既存インフラで利用可能 | 追加の SQS キューが必要                                                      | ✅ 推奨             |
   | **EventBridge**              | イベント駆動、柔軟                           | 設定複雑、オーバーエンジニアリング                                           | ⚠️ 過剰             |
   | **DynamoDB Streams**         | 既存テーブル活用可能                         | ストリーム処理の複雑性                                                       | ⚠️ 複雑             |
   | **Lambda 非同期呼び出し**    | シンプル                                     | 実行ゾーンから検証ゾーンへの直接呼び出しが必要（クロスアカウント対応が複雑） | ⚠️ 制約あり         |
   | **API Gateway コールバック** | RESTful                                      | 検証ゾーンがエンドポイントを公開する必要がある                               | ⚠️ セキュリティ懸念 |

4. **SQS キューパターンの詳細**:
   - 実行ゾーンは Bedrock API 呼び出し完了後、SQS キューにレスポンスを送信
   - 検証ゾーンは SQS キューからメッセージを受信し、Slack API に投稿
   - 利点:
     - 信頼性: SQS のメッセージ配信保証（少なくとも 1 回配信）
     - スケーラビリティ: 自動スケーリング
     - エラーハンドリング: DLQ（Dead Letter Queue）で失敗メッセージを処理
     - クロスアカウント対応: SQS キューへのアクセス権限を設定可能

**Alternatives Considered**:

- **同期パターン（同期待機）**: 検証ゾーンが実行ゾーンからのレスポンスを同期的に待機
  - 不採用理由: Slack の 3 秒タイムアウト制約により不可能
- **EventBridge**: イベント駆動アーキテクチャ
  - 不採用理由: オーバーエンジニアリング、設定が複雑
- **DynamoDB Streams**: 既存テーブルを活用
  - 不採用理由: ストリーム処理の複雑性、既存テーブル構造への影響

**Configuration**:

- SQS キュー名: `execution-response-queue`（検証スタックに配置）
- メッセージ形式: JSON（ExecutionResponse エンティティ）
- 可視性タイムアウト: 30 秒（Bedrock API 呼び出し時間を考慮）
- メッセージ保持期間: 14 日（デフォルト）
- DLQ: `execution-response-dlq`（失敗メッセージの処理）

**References**:

- AWS SQS ドキュメント: https://docs.aws.amazon.com/sqs/
- SQS クロスアカウントアクセス: https://docs.aws.amazon.com/sqs/latest/dg/sqs-customer-managed-policy-examples.html
- ADR-003: response_url 非同期パターンの採用

---

### RQ-02: 実行ゾーンからのレスポンス形式

**Question**: 実行ゾーンから検証ゾーンに返すレスポンス形式はどのようにすべきか？

**Decision**: **構造化された JSON 形式**を採用

**Rationale**:

1. **必要な情報**:

   - AI レスポンステキスト（成功時）
   - エラーメッセージ（エラー時）
   - エラーコード（エラー時）
   - チャンネル ID（Slack 投稿に必要）
   - スレッドタイムスタンプ（スレッド返信に必要）
   - 相関 ID（トレーシング用）
   - Bot Token（検証ゾーンが Slack API に投稿する際に必要）

2. **既存のリクエスト形式との整合性**:

   - 検証ゾーンから実行ゾーンへのリクエストには既に `channel`, `bot_token`, `thread_ts`, `correlation_id` が含まれている
   - レスポンスにはこれらの情報を返す必要がある（特に `bot_token` は検証ゾーンが Slack API に投稿する際に必要）

3. **エラーハンドリング**:
   - 成功時とエラー時で異なる形式を返す
   - エラー時は `error_code` と `error_message` を含める
   - 検証ゾーンはエラー形式を検出し、ユーザーフレンドリーなメッセージに変換

**Response Format**:

```json
{
  "status": "success" | "error",
  "channel": "C01234567",
  "thread_ts": "1234567890.123456",
  "correlation_id": "550e8400-e29b-41d4-a716-446655440000",
  "bot_token": "xoxb-...",
  "response_text": "AI generated response...",
  "error_code": "bedrock_timeout" | "bedrock_throttling" | ...,
  "error_message": "User-friendly error message..."
}
```

**Alternatives Considered**:

- **シンプルなテキスト形式**: レスポンステキストのみ
  - 不採用理由: エラーハンドリング、メタデータ（channel, thread_ts）が必要
- **既存の ExecutionResponse 形式を拡張**: statusCode と body のみ
  - 不採用理由: 構造化された形式の方が検証ゾーンでの処理が容易

**References**:

- 既存の ExecutionRequest 形式: `specs/002-iam-layer-auth/data-model.md`
- Slack API chat.postMessage: https://api.slack.com/methods/chat.postMessage

---

### RQ-03: 実行ゾーンから SQS へのアクセス方法

**Question**: 実行ゾーンはどのように SQS キューにメッセージを送信するか？

**Decision**: **boto3 SQS クライアントを使用して直接送信**

**Rationale**:

1. **シンプルさ**: boto3 は既に実行ゾーンで使用されている（Bedrock API 呼び出し）
2. **信頼性**: SQS のメッセージ配信保証
3. **クロスアカウント対応**: SQS キューのリソースポリシーで実行ゾーンのロール ARN を許可可能
4. **エラーハンドリング**: SQS 送信失敗時は既存のエラーハンドリングロジックを使用

**Configuration**:

- 実行ゾーンの IAM ロールに SQS 送信権限を追加:
  ```json
  {
    "Effect": "Allow",
    "Action": "sqs:SendMessage",
    "Resource": "arn:aws:sqs:REGION:ACCOUNT_ID:execution-response-queue"
  }
  ```
- SQS キューのリソースポリシーで実行ゾーンのロール ARN を許可（クロスアカウント対応）

**Alternatives Considered**:

- **API Gateway 経由**: 実行ゾーンから検証ゾーンの API Gateway エンドポイントを呼び出す
  - 不採用理由: 検証ゾーンがエンドポイントを公開する必要があり、セキュリティ懸念。また、API Gateway のタイムアウト制約（29 秒）がある
- **EventBridge**: イベント駆動アーキテクチャ
  - 不採用理由: オーバーエンジニアリング

**References**:

- AWS SQS boto3 ドキュメント: https://boto3.amazonaws.com/v1/documentation/api/latest/reference/services/sqs.html
- SQS リソースポリシー: https://docs.aws.amazon.com/sqs/latest/dg/sqs-customer-managed-policy-examples.html

---

### RQ-04: 検証ゾーンでの SQS メッセージ受信方法

**Question**: 検証ゾーンはどのように SQS キューからメッセージを受信するか？

**Decision**: **Lambda 関数を SQS イベントソースとして設定**

**Rationale**:

1. **サーバーレス**: 追加のインフラ不要
2. **自動スケーリング**: SQS メッセージ数に応じて Lambda が自動スケール
3. **エラーハンドリング**: Lambda が失敗した場合、SQS が自動的にリトライ
4. **既存パターン**: 既存の Lambda 関数構造を活用

**Configuration**:

- 新しい Lambda 関数: `slack-response-handler`（検証スタックに配置）
- SQS イベントソースマッピング: `execution-response-queue` → `slack-response-handler`
- バッチサイズ: 1（1 メッセージずつ処理）
- 可視性タイムアウト: 30 秒（Slack API 呼び出し時間を考慮）
- 最大受信試行回数: 3（DLQ に送信）

**Alternatives Considered**:

- **既存の SlackEventHandler Lambda 内でポーリング**: 定期的に SQS をポーリング
  - 不採用理由: 非効率、追加のロジックが必要
- **Step Functions**: オーケストレーション
  - 不採用理由: オーバーエンジニアリング、コスト増

**References**:

- Lambda SQS イベントソース: https://docs.aws.amazon.com/lambda/latest/dg/with-sqs.html
- SQS バッチ処理: https://docs.aws.amazon.com/lambda/latest/dg/with-sqs.html#services-sqs-batchfailurereporting

---

### RQ-05: 既存の API Gateway パターンの維持

**Question**: 既存の API Gateway 経由の通信パターンは維持すべきか？

**Decision**: **維持する（検証ゾーンから実行ゾーンへのリクエストは既存のまま）**

**Rationale**:

1. **後方互換性**: 既存のリクエストフローは変更不要
2. **責任分離**:
   - 検証ゾーン → 実行ゾーン: API Gateway 経由（既存）
   - 実行ゾーン → 検証ゾーン: SQS 経由（新規）
3. **シンプルさ**: 既存の API Gateway 設定を維持

**Configuration**:

- 検証ゾーンから実行ゾーンへのリクエスト: 既存の API Gateway エンドポイントを使用（変更なし）
- 実行ゾーンから検証ゾーンへのレスポンス: SQS キュー経由（新規）

**Alternatives Considered**:

- **API Gateway を双方向に使用**: 実行ゾーンから検証ゾーンの API Gateway エンドポイントを呼び出す
  - 不採用理由: 検証ゾーンがエンドポイントを公開する必要があり、セキュリティ懸念。また、API Gateway のタイムアウト制約がある

**References**:

- 既存の API Gateway パターン: `specs/002-iam-layer-auth/data-model.md`

---

## Summary

1. **非同期コールバックパターン（SQS）**: 検証ゾーンは即座に 200 OK を返し、実行ゾーンからのレスポンスを SQS キュー経由で非同期に受け取る
2. **構造化された JSON レスポンス**: 実行ゾーンは AI レスポンス、エラー情報、メタデータを含む構造化された JSON 形式で SQS に送信
3. **boto3 SQS クライアント**: 実行ゾーンは boto3 を使用して SQS キューに直接メッセージを送信
4. **Lambda SQS イベントソース**: 検証ゾーンは新しい Lambda 関数（slack-response-handler）を SQS イベントソースとして設定
5. **既存の API Gateway パターン維持**: 検証ゾーンから実行ゾーンへのリクエストは既存の API Gateway 経由を維持
