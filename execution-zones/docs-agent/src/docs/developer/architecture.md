# アーキテクチャ

**目的**: システムの全体構成、コンポーネント、データフロー、クロスアカウント構成を説明する。
**対象読者**: 開発者、アーキテクト
**最終更新日**: 2026-02-14

---

## 1. 概要

現在の本番パスは **AgentCore A2A** のみです。Slack → SlackEventHandler → Verification Agent (A2A) → Execution Agent (A2A) → Bedrock。

注: 以前の API Gateway + SQS 構成から AgentCore A2A に移行済み。

### 1.1 現行アーキテクチャ（AgentCore A2A）

```
┌─────────────────────────────────────────────────────────────┐
│ Slackワークスペース                                           │
│ ユーザートリガー: @AIアプリ名 質問を投げる                     │
│ または問い合わせチャンネルでの自動一次回答                    │
└────────────────────┬────────────────────────────────────────┘
                     │ [1] HTTPS POST (同期)
                     │ X-Slack-Signature (HMAC SHA256)
                     │ X-Slack-Request-Timestamp
                     ↓
┌─────────────────────────────────────────────────────────────┐
│ Verification Zone (検証層)                                   │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ SlackEventHandler Function URL                          │ │
│ │ (パブリックリージョナルエンドポイント)                     │ │
│ └──────────────────────┬──────────────────────────────────┘ │
│                        │                                     │
│ ┌─────────────────────▼──────────────────────────────────┐ │
│ │ SlackEventHandler (検証層 Verification Layer)          │ │
│ │ タイムアウト: 10秒                                       │ │
│ │ 責任範囲:                                              │ │
│ │ - Slack署名検証 (HMAC SHA256) - 鍵1                   │ │
│ │ - Slack API Existence Check (Bot Token) - 鍵2         │ │
│ │ - DynamoDBキャッシュ (5分TTL)                        │ │
│ │ - タイムスタンプ検証 (±5分)                           │ │
│ │ - ホワイトリスト認可 (3c)                             │ │
│ │ - イベント重複排除（DynamoDB: slack-event-dedupe）    │ │
│ │ - 添付ファイルメタデータ抽出                          │ │
│ │ - 構造化JSONログ（相関ID）                            │ │
│ │ [2] → Slackにリアクション（👀）で応答                 │ │
│ │ [3] → Execution Agent (A2A) を呼び出し               │ │
│ └──────────────────────┬──────────────────────────────────┘ │
└────────────────────────┼────────────────────────────────────┘
                         │ [3] A2A呼び出し (SigV4)
                         ↓
┌─────────────────────────────────────────────────────────────┐
│ Execution Zone (実行層)                                      │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ Execution Agent (AgentCore Runtime)                     │ │
│ │ タイムアウト: 30秒                                      │ │
│ │ 責任範囲:                                              │ │
│ │ - AWS Bedrock Converse API呼び出し                     │ │
│ │   * 統一インターフェース、マルチモーダル対応            │ │
│ │   * バイナリ画像データ（Base64不要）                   │ │
│ │ - 添付ファイル処理: 画像とドキュメントのダウンロード    │ │
│ │ - 画像分析: Bedrock Converse API視覚機能               │ │
│ │ - ドキュメント抽出: PDF, DOCX, CSV, XLSX, PPTX, TXT   │ │
│ │ - PPTX変換: LibreOfficeを使用したスライド画像変換     │ │
│ │ - 複数添付ファイル: 複数ファイルの順次処理             │ │
│ └────────────────────┬───────────────────────────────────┘ │
│                      │                                       │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ AWS Bedrock Converse API                                 │ │
│ │ - Foundation Model: 要件に応じて選択（Claude、Nova等）   │ │
│ │ - 統一インターフェース                                  │ │
│ │ - マルチモーダル入力（テキスト+画像）                   │ │
│ │ - Model Invocation Logging                             │ │
│ └─────────────────────────────────────────────────────────┘ │
└──────────────────────┬──────────────────────────────────────┘
                       │ [4] A2A レスポンス
                       ↓
┌─────────────────────────────────────────────────────────────┐
│ Verification Zone (検証層) - 継続                          │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ SlackResponseHandler (Verification Agent)               │ │
│ │ タイムアウト: 30秒                                      │ │
│ │ 責任範囲:                                              │ │
│ │ - A2A レスポンスを処理                                  │ │
│ │ - Slack API にレスポンスを投稿                          │ │
│ │   (chat.postMessage with thread_ts)                    │ │
│ │ - メッセージ分割（4000文字制限対応）                    │ │
│ │ - リトライロジック（一時的エラー対応）                  │ │
│ │ - CloudWatch メトリクス発行                             │ │
│ │ [5] → Slack APIにHTTP POSTでレスポンス投稿             │ │
│ └──────────────────────┬──────────────────────────────────┘ │
└────────────────────────┼────────────────────────────────────┘
                         │ [5] HTTPS POST to Slack API
                         │ (chat.postMessage with thread_ts)
                         ↓
┌──────────────────────────────────────────────────────────────┐
│ Slackワークスペース                                           │
│ → スレッド内にAIレスポンスを表示                             │
│ → 👀 リアクションを ✅ に更新                                │
└──────────────────────────────────────────────────────────────┘
```

フロー:
- [1] ユーザーが @AIアプリ名 リクエスト を実行（添付ファイル可）
- [2] SlackEventHandler がリアクション（👀）で応答（タイムアウト: 10秒）
- [3] SlackEventHandler が Execution Agent を A2A (SigV4) で呼び出し
- [4] Execution Agent が Bedrock API を呼び出し、結果を A2A レスポンスとして返す
- [5] SlackResponseHandler が Slack API に投稿、リアクションを ✅ に更新

### 1.2 システムコンポーネント一覧

| レイヤー          | 主な機能                 | 技術スタック               | 責任範囲                                                                                                                                     |
| ----------------- | ------------------------ | -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Slack             | ユーザーインターフェース | Slack API                  | コマンド受付、メッセージ表示、スレッド管理                                                                                                   |
| SlackEventHandler | 検証層処理               | Python 3.11                | 署名検証（鍵 1）、Existence Check（鍵 2）、ホワイトリスト認可（3c）、Execution Agent 呼び出し、即座応答、添付ファイルメタデータ抽出              |
| Function URL      | パブリックエンドポイント | Lambda Function URL        | リクエスト受付、SlackEventHandler へのルーティング                                                                                           |
| Execution Agent   | 実行層エージェント       | AgentCore Runtime (ARM64)  | A2A エンドポイント提供、Bedrock Converse API 呼び出し、添付ファイル処理                                                                       |
| Bedrock Converse  | AI モデル                | Foundation Model           | 統一インターフェース、マルチモーダル入力（テキスト+画像）、多様な AI 機能（会話、画像生成、コード生成、データ分析など、モデル選択可能）      |
| DynamoDB          | データストア             | DynamoDB                   | トークンストレージ (slack-workspace-tokens)、イベント重複排除 (slack-event-dedupe)、Existence Check キャッシュ (slack-existence-check-cache) |
| LibreOffice Layer | PPTX 変換                | Lambda Layer               | PowerPoint スライドを画像に変換（オプション）                                                                                                |

### 1.3 主要データフロー

**標準フロー**: Slack → SlackEventHandler Function URL → SlackEventHandler（署名検証、Existence Check、即座応答、添付ファイルメタデータ抽出）→ Execution Agent (A2A, SigV4) → Bedrock Converse API（テキスト+画像分析）→ A2A レスポンス → SlackResponseHandler → Slack API（スレッド返信・リアクション更新）→ Slack

**スレッド処理フロー**: Slack Event (`event.thread_ts` or `event.ts`) → Execution Agent（`conversations.replies`で履歴取得）→ Bedrock Converse API（会話履歴を含む）→ A2A レスポンス → SlackResponseHandler → Slack API（`chat.postMessage` with `thread_ts`）→ Slack スレッド内に表示

**添付ファイル処理フロー**: Slack Event (`event.files`) → SlackEventHandler（メタデータ抽出）→ Execution Agent（Slack CDN からダウンロード、画像/ドキュメント処理）→ Bedrock Converse API（バイナリ画像データ、テキスト抽出）→ 統合された AI 応答 → SlackResponseHandler → Slack API（スレッド返信）

**非同期処理の利点**: Slack の 3 秒タイムアウト制約を回避し、ユーザーに即座のフィードバックを提供しながら、バックグラウンドで AI 処理を実行できます。

---

## 2. コンポーネントとデータフロー

### 2.1 セキュリティ設計の原則

本システムは、AI の特性を考慮した**多層防御（Defense in Depth）**を採用しています。

#### 認証・認可の基本方針

1. **2 鍵防御モデル**: Signing Secret と Bot Token の両方が必要

   - **鍵 1 (Signing Secret)**: HMAC SHA256 署名検証でリクエストの真正性を確認
   - **鍵 2 (Bot Token)**: Slack API Existence Check で team_id, user_id, channel_id の実在性を動的に確認
   - Signing Secret 漏洩時も Bot Token がなければ攻撃不可（Existence Check が失敗）
   - Bot Token 漏洩時も署名検証で偽造リクエストを検出
   - DynamoDB キャッシュ（5 分 TTL）でパフォーマンスを最適化
   - **防げる攻撃**: T-01 (署名シークレット漏洩)、T-04 (API Gateway URL 漏洩)

2. **動的検証**: Slack API による実在性確認

   - 静的ホワイトリストではなく、動的に team_id, user_id, channel_id を検証
   - Slack API (`team.info`, `users.info`, `conversations.info`) を使用して実在性を確認
   - 削除されたユーザー/チャンネルからのリクエストを即座に検出
   - DynamoDB キャッシュ（5 分 TTL）でパフォーマンスを最適化
   - **防げる攻撃**: 偽造リクエスト、削除済みエンティティからの攻撃

3. **fail-closed 原則**: 認証・認可失敗時は即座に拒否

   - Slack API ダウン時もリクエストを拒否（セキュリティ優先）
   - **防げる攻撃**: タイミング攻撃、障害時の攻撃

4. **最小権限の原則**: IAM ロールは必要最小限の権限のみ付与
   - **防げる攻撃**: T-08 (権限昇格)、T-05 (IAM ロール侵害)

#### 多層防御による攻撃対応

各レイヤーが特定の脅威に対応：

- **レイヤー 1-2 (Slack/Function URL)**: T-02 (アカウント乗っ取り)、T-07 (DDoS)
- **レイヤー 3 (SlackEventHandler)**: T-01 (シークレット漏洩)、T-03 (リプレイ)、T-08 (権限昇格)、Two-Key Defense
- **レイヤー 4 (Execution Agent A2A)**: T-05 (IAM 侵害)、内部 API 保護
- **レイヤー 5-6 (Bedrock Converse API)**: T-11 (モデル乱用)

詳細は [セキュリティ](./security.md) を参照してください。

### 2.2 デプロイメントアーキテクチャ

#### 単一スタック構成（レガシー）

すべてのリソースを 1 つの CloudFormation スタックにデプロイ。シンプルだがクロスアカウント対応は不可。

```
SlackBedrockStack
├── Verification Zone リソース
└── Execution Zone リソース
```

#### 分離スタック構成（推奨）

Verification Zone と Execution Zone を独立したスタックに分離。クロスアカウントデプロイに対応。

```
┌─────────────────────────────┐    ┌─────────────────────────────┐
│ VerificationStack           │    │ ExecutionStack              │
│ (Account A)                 │    │ (Account B)                 │
│                             │    │                             │
│ - SlackEventHandler Lambda  │───▶│ - Execution Agent           │
│ - Function URL              │    │   (AgentCore Runtime)       │
│ - DynamoDB tables (5)       │    │ - CloudWatch Alarms         │
│ - Secrets Manager           │    │                             │
│ - CloudWatch Alarms         │    │                             │
└─────────────────────────────┘    └─────────────────────────────┘
```

**利点**:

- クロスアカウントデプロイ対応
- 独立したライフサイクル管理
- セキュリティ境界の強化
- 個別のスタック更新が可能

---

## 3. クロスアカウント構成

### 3.1 概要

Slack AI アプリケーションは、Verification Zone（検証層）と Execution Zone（実行層）を異なる AWS アカウントにデプロイ可能な設計になっています。

```
┌─────────────────────────────────────────────────────────────┐
│ Account A (Verification Zone)                                │
│                                                              │
│  Slack → Function URL → SlackEventHandler Lambda            │
│                              │                               │
│                              ├─→ DynamoDB (5 tables)        │
│                              └─→ Secrets Manager            │
│                                                              │
│  IAM Role: SlackEventHandlerRole                            │
│    └─→ agentcore:InvokeRuntime (Account B Agent)            │
└──────────────────────────────┼──────────────────────────────┘
                               │ HTTPS + SigV4 署名 (A2A)
                               ↓
┌─────────────────────────────────────────────────────────────┐
│ Account B (Execution Zone)                                   │
│                                                              │
│  Execution Agent (AgentCore Runtime)                         │
│    └─→ Allow: Account A / SlackEventHandlerRole             │
│                              │                               │
│                              ↓                               │
│  Bedrock Converse API                                        │
└─────────────────────────────────────────────────────────────┘
```

### 3.2 認証パターン（デュアル認証: IAM と API キー）

Execution API は IAM 認証と API キー認証の両方をサポートしています。デフォルトは API キー認証です。

#### IAM 認証パターン

SlackEventHandler Lambda には、Execution API を呼び出すための IAM ポリシーが付与されています：

```json
{
  "Effect": "Allow",
  "Action": "execute-api:Invoke",
  "Resource": "arn:aws:execute-api:REGION:ACCOUNT_B:API_ID/*"
}
```

Lambda は AWS SDK を使用して SigV4 署名付きリクエストを送信します。

API Gateway には、特定の IAM ロールからのアクセスのみを許可するリソースポリシーが設定されています：

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "AWS": "arn:aws:iam::ACCOUNT_A:role/SlackEventHandlerRole"
      },
      "Action": "execute-api:Invoke",
      "Resource": "arn:aws:execute-api:REGION:ACCOUNT_B:API_ID/*",
      "Condition": {
        "StringEquals": {
          "aws:PrincipalAccount": "ACCOUNT_A"
        }
      }
    }
  ]
}
```

IAM 認証フロー:

```
1. Slack → SlackEventHandler Lambda
2. Lambda が IAM ロールを使用して SigV4 署名を生成
3. SigV4 署名付き HTTPS リクエストを Execution API に送信
4. API Gateway がリソースポリシーを検証
   - Principal (IAM ロール ARN) をチェック
   - アカウント ID をチェック（オプション）
5. 検証成功 → Execution Agent を呼び出し
6. 検証失敗 → 403 Forbidden を返却
```

#### API キー認証パターン（デフォルト）

SlackEventHandler Lambda には、Secrets Manager から API キーを取得する権限が付与されています：

```json
{
  "Effect": "Allow",
  "Action": "secretsmanager:GetSecretValue",
  "Resource": "arn:aws:secretsmanager:REGION:ACCOUNT_A:secret:execution-api-key*"
}
```

Lambda は環境変数 `EXECUTION_API_AUTH_METHOD=api_key` で API キー認証を使用するように設定されています。

API キー認証フロー:

```
1. Slack → SlackEventHandler Lambda
2. Lambda が Secrets Manager から API キーを取得
3. x-api-key ヘッダーに API キーを含めて HTTPS リクエストを送信
4. API Gateway が API キーを検証（使用量プランと関連付け）
5. 検証成功 → Execution Agent を呼び出し
6. 検証失敗 → 403 Forbidden を返却
```

#### 認証方法の選択

認証方法は環境変数 `EXECUTION_API_AUTH_METHOD` で制御されます：

- `iam`: IAM 認証を使用（既存の動作）
- `api_key`: API キー認証を使用（デフォルト）

API キー認証を使用する場合、`EXECUTION_API_KEY_SECRET_NAME` 環境変数で Secrets Manager のシークレット名を指定します（デフォルト: `execution-api-key`）。

### 3.3 デプロイフロー

#### Phase 1: Execution Stack のデプロイ

```bash
# デプロイ環境を設定
export DEPLOYMENT_ENV=dev  # または 'prod'

# デプロイ
npx cdk deploy SlackAI-Execution-Dev

# 出力から API URL と API ARN を取得
```

#### Phase 2: Verification Stack のデプロイ

```bash
# 設定ファイル (cdk.config.{env}.json) に API URL を設定
# または --context で指定
npx cdk deploy SlackAI-Verification-Dev \
  --context executionApiUrl=https://xxx.execute-api.ap-northeast-1.amazonaws.com/prod/

# 出力から Lambda ロール ARN を取得
```

#### Phase 3: Execution Stack の更新

```bash
# cdk.config.{env}.json に Lambda ロール ARN を設定
{
  "verificationLambdaRoleArn": "arn:aws:iam::123456789012:role/..."
}

# 再デプロイ（リソースポリシーを更新）
npx cdk deploy SlackAI-Execution-Dev
```

### 3.4 クロスアカウント CDK 設定

異なる AWS アカウントにデプロイする場合の追加設定：

```json
{
  "verificationAccountId": "111111111111",
  "executionAccountId": "222222222222"
}
```

または、コマンドラインで指定：

```bash
npx cdk deploy SlackAI-Execution-Dev \
  --context verificationAccountId=111111111111 \
  --context executionAccountId=222222222222
```

各アカウントへのデプロイには、適切な AWS 認証情報が必要です：

```bash
# Account A (Verification)
export AWS_PROFILE=account-a
npx cdk deploy SlackAI-Verification

# Account B (Execution)
export AWS_PROFILE=account-b
npx cdk deploy SlackAI-Execution
```

### 3.5 セキュリティ考慮事項

**最小権限の原則**:
- Verification Lambda には `execute-api:Invoke` 権限のみ付与
- API Gateway リソースポリシーは特定のロール ARN のみを許可
- アカウント ID 条件でさらにスコープを制限

**監査**:
- CloudTrail で API Gateway 呼び出しを記録
- CloudWatch Logs で Lambda 実行を記録
- 相関 ID でリクエストをトレース可能

**障害対応**:
- Execution API が利用不可の場合、Verification Lambda はタイムアウトを適切に処理
- ユーザーには「サービス一時停止中」のメッセージを返却
- CloudWatch アラームで障害を検知

### 3.6 トラブルシューティング

**403 Forbidden エラー**:

1. リソースポリシーを確認 — `verificationLambdaRoleArn` が正しく設定されているか、Execution Stack を再デプロイしたか
2. IAM ポリシーを確認 — Verification Lambda に `execute-api:Invoke` 権限があるか、リソース ARN が正しいか
3. アカウント ID を確認 — クロスアカウントの場合、`verificationAccountId` が正しいか

**タイムアウトエラー**:

1. API Gateway URL を確認 — `executionApiUrl` が正しく設定されているか、URL が有効でアクセス可能か
2. ネットワーク設定を確認 — VPC 設定がある場合、NAT Gateway が設定されているか

詳細なデプロイ手順は [ランブック](./runbook.md)、一般的なトラブルシューティングは [トラブルシューティングガイド](../how-to/troubleshooting.md) を参照してください。

---

## 4. 実装詳細

### 4.1 Existence Check 実装（Two-Key Defense - 鍵2）

**ファイル**: `cdk/lib/verification/lambda/slack-event-handler/existence_check.py`

Existence Check は Two-Key Defense モデルの第二の鍵として、Slack API を使用して team_id, user_id, channel_id の実在性を動的に確認します。

**実装フロー**:

1. **キャッシュチェック**: DynamoDB からキャッシュエントリを取得（5分TTL）
2. **Slack API 呼び出し**: キャッシュミスの場合、以下の API を順次呼び出し:
   - `team.info(team=team_id)`: ワークスペースの存在確認
   - `users.info(user=user_id)`: ユーザーの存在確認
   - `conversations.info(channel=channel_id)`: チャンネルの存在確認
3. **エラーハンドリング**:
   - レート制限（429）: 指数バックオフで最大3回リトライ（1s, 2s, 4s）
   - タイムアウト: 2秒でタイムアウト、fail-closed（リクエスト拒否）
   - その他のエラー: fail-closed（リクエスト拒否）
4. **キャッシュ保存**: 検証成功時、DynamoDB に5分TTLで保存

**DynamoDB テーブル**: `slack-existence-check-cache`
- Partition Key: `cache_key` (String, 形式: `{team_id}#{user_id}#{channel_id}`)
- TTL Attribute: `ttl` (Number, Unix timestamp)
- Billing Mode: PAY_PER_REQUEST

**CloudWatch メトリクス**:
- `ExistenceCheckFailed`: 失敗回数
- `ExistenceCheckCacheHit`: キャッシュヒット回数
- `ExistenceCheckCacheMiss`: キャッシュミス回数
- `SlackAPILatency`: Slack API 呼び出しレイテンシ（ミリ秒）

**CloudWatch アラーム**:
- `ExistenceCheckFailedAlarm`: 5分間に5回以上失敗した場合にトリガー

### 4.2 SlackEventHandler（検証層）

**ファイル**: `cdk/lib/verification/lambda/slack-event-handler/handler.py`

SlackEventHandler は署名検証、Existence Check、認可を行い、即座に応答を返してから Execution Agent (A2A) を呼び出します。

**Two-Key Defense 実装**:
- **鍵1**: HMAC SHA256 署名検証（Signing Secret）
- **鍵2**: Slack API Existence Check（Bot Token）— team_id, user_id, channel_id の実在性確認

**Execution API 認証**:
- **デフォルト**: APIキー認証（環境変数 `EXECUTION_API_AUTH_METHOD=api_key`）
- **代替**: IAM認証（環境変数 `EXECUTION_API_AUTH_METHOD=iam`）
- APIキーは AWS Secrets Manager から取得（`secrets_manager_client.py`）
- IAM認証の場合は SigV4 署名を使用（`api_gateway_client.py`）

**署名検証の核心部分**:

```python
def verify_slack_signature(signing_secret, timestamp, body, signature):
    # タイムスタンプの新鮮さを検証（リプレイアタック防止）
    current_time = int(time.time())
    if abs(current_time - int(timestamp)) > 300:  # 5分
        raise SignatureVerificationError("タイムスタンプが古すぎます")

    # 期待される署名を計算
    basestring = f"v0:{timestamp}:{body}".encode("utf-8")
    expected_signature = "v0=" + hmac.new(
        signing_secret.encode("utf-8"), basestring, hashlib.sha256
    ).hexdigest()

    # 定数時間比較（タイミング攻撃を防止）
    return hmac.compare_digest(expected_signature, signature)
```

**ホワイトリスト認可ロジック**:

```python
def authorize_request(team_id, user_id, channel_id):
    whitelist = load_whitelist_config()

    # 空のホワイトリスト = すべてのリクエストを許可
    total_entries = len(whitelist["team_ids"]) + len(whitelist["user_ids"]) + len(whitelist["channel_ids"])
    if total_entries == 0:
        return AuthorizationResult(authorized=True, ...)

    # 条件付きAND条件: 設定されているエンティティのみをチェック
    unauthorized_entities = []
    if len(whitelist["team_ids"]) > 0 and team_id not in whitelist["team_ids"]:
        unauthorized_entities.append("team_id")
    if len(whitelist["user_ids"]) > 0 and user_id not in whitelist["user_ids"]:
        unauthorized_entities.append("user_id")
    if len(whitelist["channel_ids"]) > 0 and channel_id not in whitelist["channel_ids"]:
        unauthorized_entities.append("channel_id")

    return AuthorizationResult(authorized=(len(unauthorized_entities) == 0), ...)
```

**非機能要件**:

| ID     | 要件                           | 目標値               | 測定方法              |
| ------ | ------------------------------ | -------------------- | --------------------- |
| NFR-01 | 署名検証レイテンシ             | ≤50ms（p99）         | CloudWatch メトリクス |
| NFR-02 | シークレットローテーション     | 90 日ごと            | AWS Secrets Manager   |
| NFR-08 | Bedrock 呼び出しレイテンシ     | ≤5 秒（p95）         | CloudWatch メトリクス |
| NFR-09 | ユーザー単位 Bedrock コスト    | ≤$10/月              | Cost Explorer         |
| NFR-10 | コンテキスト履歴暗号化         | すべての DynamoDB データ | KMS 暗号化確認    |

### 4.3 BedrockProcessor（実行層）

**ファイル**: `cdk/lib/execution/lambda/bedrock-processor/handler.py`

**目的**: Bedrock API を呼び出して AI 機能を提供（会話、画像生成、コード生成、データ分析など）

**セキュリティ管理**:
- 最小権限 IAM ロール（Bedrock 呼び出しのみ）
- Bedrock Guardrails 適用（60 言語対応、Automated Reasoning 99%精度）
- トークン数制限（モデル最大値: Claude 4.5/Nova Pro は 8192 トークン）
- コンテキスト履歴の暗号化（DynamoDB + KMS）
- CloudTrail ログ（すべての Bedrock API 呼び出し）

**主な処理フロー**:
1. ペイロード検証（channel, text, bot_token）
2. 添付ファイル処理（process_attachments）
3. スレッド履歴取得（get_thread_history if thread_ts）
4. Bedrock Converse API 呼び出し（invoke_bedrock）
5. A2A レスポンスとして返却（SlackResponseHandler が Slack API に投稿）

**Bedrock Converse API 呼び出しの核心部分**:

```python
def invoke_bedrock(prompt, conversation_history=None, images=None, image_formats=None, document_texts=None):
    content_parts = []
    if prompt and prompt.strip():
        content_parts.append({"text": prompt.strip()})
    if document_texts:
        for doc_text in document_texts:
            content_parts.append({"text": f"\n\n[Document content]\n{doc_text}"})
    if images:
        formats = image_formats if image_formats else ["png"] * len(images)
        for image_bytes, image_format in zip(images, formats):
            content_parts.append({
                "image": {"format": image_format, "source": {"bytes": image_bytes}}
            })

    messages = list(conversation_history) if conversation_history else []
    messages.append({"role": "user", "content": content_parts})

    response = bedrock_runtime.converse(
        modelId=model_id,
        messages=messages,
        inferenceConfig={"maxTokens": max_tokens, "temperature": TEMPERATURE}
    )
    return response["output"]["message"]["content"][0]["text"].strip()
```

**トークン数制限**（モデルごとの自動決定）:
- Claude 4.5 系（Sonnet/Haiku/Opus）: 8192 tokens
- Amazon Nova Pro: 8192 tokens
- Amazon Nova Lite: 4096 tokens
- 環境変数 `BEDROCK_MAX_TOKENS` で上書き可能

### 4.4 添付ファイル処理パイプライン

システムは Slack メッセージに添付された画像とドキュメントを処理し、AI 分析に含めます。処理は 3 段階で実行されます：

1. **メタデータ抽出** (SlackEventHandler): Slack イベントから添付ファイル情報を抽出
2. **ダウンロードと処理** (Execution Agent): Slack CDN からファイルをダウンロードし、内容を抽出
3. **AI 統合** (Execution Agent): 抽出した内容を Bedrock API に送信

**対応ファイル形式**:
- **画像**: PNG, JPEG, GIF, WebP（最大 10MB）
- **ドキュメント**: PDF (PyPDF2), DOCX (python-docx), CSV, XLSX (openpyxl), PPTX (python-pptx + LibreOffice), TXT（最大 5MB）

**メタデータ抽出** (`attachment_extractor.py`):

```python
def extract_attachment_metadata(event):
    files = event.get("files", [])
    attachments = []
    for file_info in files:
        attachment = {
            "id": file_info.get("id"),
            "name": file_info.get("name"),
            "mimetype": file_info.get("mimetype"),
            "size": file_info.get("size"),
            "url_private_download": file_info.get("url_private_download"),
        }
        attachments.append(attachment)
    return attachments
```

**エラーコードとユーザー向けメッセージ**:

| エラーコード       | ユーザー向けメッセージ                                                                                           |
| ------------------ | ---------------------------------------------------------------------------------------------------------------- |
| `unsupported_type` | このファイル形式には対応していません。画像（PNG, JPEG, GIF, WebP）またはドキュメント（PDF, DOCX, CSV, XLSX, PPTX, TXT）を送信してください。 |
| `file_too_large`   | ファイルが大きすぎます（画像: 最大 10MB、ドキュメント: 最大 5MB）。                                               |
| `download_failed`  | ファイルのダウンロードに失敗しました。ボットがチャンネルに追加されているか確認してください。                      |
| `extraction_failed`| ドキュメントの内容を読み取れませんでした。別のファイルを試してください。                                          |

**パフォーマンス考慮事項**:
- タイムアウト: 添付ファイル処理は 30 秒以内に完了する必要がある
- 部分成功: 複数添付ファイルがある場合、一部が失敗しても成功したファイルは処理を継続
- 並列処理: 現在は順次処理（将来の最適化で並列処理を検討）

### 4.5 レート制限の実装

**ファイル**: `cdk/lib/verification/lambda/slack-event-handler/rate_limiter.py`

レート制限は、DynamoDB ベースのトークンバケットアルゴリズムを使用して、ユーザー単位のスロットリングを実装します。

**DynamoDB テーブル**: `slack-rate-limit`
- Partition Key: `rate_limit_key` (String, 形式: `{team_id}#{user_id}#{window_start}`)
- TTL Attribute: `ttl` (Number, Unix timestamp)
- Billing Mode: PAY_PER_REQUEST

**環境変数**:
- `RATE_LIMIT_PER_MINUTE`: レート制限値（デフォルト: 10）
- `RATE_LIMIT_TABLE_NAME`: DynamoDB テーブル名（デフォルト: `slack-rate-limit`）

**CloudWatch メトリクス**:
- `RateLimitExceeded`: レート制限超過回数（Sum）
- `RateLimitRequests`: レート制限チェック回数（Sum）

**CloudWatch アラーム**:
- `RateLimitExceededAlarm`: 5分間に10回以上のレート制限超過でトリガー

---

## 5. ユーザー体験

### 5.1 エンドユーザーフロー（正常系）

**@メンションによる直接利用**:

1. ユーザーが `@AIアプリ名 質問内容` をメッセージに入力して送信（0秒）
2. SlackEventHandler が 3 秒以内に「処理中です... 少々お待ちください」と即座のフィードバックを返す（0.5〜2秒）
3. バックグラウンドで Execution Agent が Bedrock Foundation Model を呼び出す（処理時間はモデル・入力長・負荷状況に依存）
4. AI 応答が元のメッセージへのスレッド返信として表示される（Bedrock 処理完了後）
5. 👀 リアクションが ✅ に更新される

**問い合わせチャンネルでの自動一次回答**:

ユーザーが問い合わせ系チャンネルに質問を投稿すると、専用の AI アプリが自動的にスレッド内に一次回答を返信します。職員は複雑な質問に集中でき、24 時間対応が可能になります。

**タイミングサマリー**:

| ステップ    | 時間              | ユーザーの状態          |
| ----------- | ----------------- | ----------------------- |
| コマンド送信 | 0 秒             | アクティブ              |
| 初期応答    | 0.5〜2 秒         | 確認完了                |
| 処理中      | Bedrock の処理時間に依存 | 待機（他作業可能） |
| 最終レスポンス | Bedrock 完了後  | レスポンス確認          |

### 5.2 エラーシナリオ

| シナリオ                          | ユーザー向けメッセージ例                                                         | 頻度   |
| --------------------------------- | -------------------------------------------------------------------------------- | ------ |
| タイムアウト（300秒超過）         | エラー: 処理がタイムアウトしました。もう一度お試しください。                      | 稀     |
| 署名検証失敗（鍵1）               | 401 Unauthorized: Invalid signature                                              | 極稀   |
| Existence Check 失敗（鍵2）       | 403 Forbidden: Entity verification failed                                        | 攻撃時 |
| トークン数超過                    | エラー: リクエストが長すぎます。`/reset` コマンドでコンテキストをリセットしてください。 | 長セッション後 |
| 添付ファイルダウンロード失敗      | エラー: ファイルのダウンロードに失敗しました。ボットがチャンネルに追加されているか確認してください。 | ボット未追加時 |
| 未対応ファイル形式                | エラー: このファイル形式には対応していません。                                    | 非対応形式送信時 |
| ファイルサイズ超過（例: 15MB画像）| エラー: 画像が大きすぎます（最大 10MB）。                                        | サイズ超過時 |

**セキュリティシナリオ（Existence Check キャッシュ動作）**:
- 同じ team/user/channel からの2回目以降のリクエスト（5分以内）は DynamoDB キャッシュからヒット（<50ms）
- CloudWatch Logs に `existence_check_cache_hit` イベントとして記録
- 攻撃者が偽造 team_id を送信した場合、署名は通過するが Existence Check（鍵2）で 403 を返す

### 5.3 監査・ログ（開発者視点）

管理者が CloudWatch Logs で確認できる情報:

```json
{
  "correlation_id": "req-abc123",
  "timestamp": "2025-11-30T10:15:30Z",
  "event": "slack_request_received",
  "team_id": "T12345",
  "user_id": "U67890",
  "channel_id": "C11111",
  "user_message_hash": "sha256:...",
  "bedrock_model_id": "us.anthropic.claude-sonnet-4-5-20250929-v1:0",
  "ai_function_type": "conversation",
  "bedrock_latency_ms": 5234,
  "guardrail_action": "NONE",
  "response_posted": true
}
```

追跡可能な情報: 誰が・いつ・どのチャンネルで・どの AI 機能タイプを・何秒かけて使用したか、エラーやタイムアウト、コスト追跡（トークン数、リクエスト数）。

### 5.4 パフォーマンス期待値

| メトリクス            | 目標値                              | 測定方法             |
| --------------------- | ----------------------------------- | -------------------- |
| 初期応答時間          | ≤2 秒（p95）                        | CloudWatch Logs      |
| Bedrock 処理時間      | モデル・入力長・負荷状況に依存      | CloudWatch Metrics   |
| 全体レイテンシ        | ≤35 秒（p99）                       | エンドツーエンド測定 |
| 成功率                | ≥99.5%                              | CloudWatch Metrics   |
| Guardrails ブロック率 | <1%（通常使用）                     | CloudWatch Logs      |
| Existence Check（キャッシュヒット時） | <50ms          | CloudWatch Logs      |

---

## 6. 用語集

| 用語                             | 定義                                                                                                                                      |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| **HMAC SHA256**                  | SHA-256 ハッシュ関数を使用したハッシュベースメッセージ認証コード                                                                          |
| **IAM SigV4**                    | AWS Signature Version 4、AWS API リクエストの暗号化署名プロトコル                                                                        |
| **Two-Key Defense (2鍵防御)**   | Signing Secret と Bot Token の両方を使用した多層認証モデル。いずれか漏洩時も攻撃面を縮小                                                  |
| **Existence Check**              | Slack API を使用して team_id, user_id, channel_id の実在性を動的に確認するセキュリティ機能                                                |
| **Bedrock Guardrails**           | AWS Bedrock の安全機能。有害コンテンツを検出                                                                                              |
| **fail-closed**                  | セキュリティ失敗時にリクエストを拒否する原則（セキュリティを可用性より優先）                                                              |
| **AgentCore Runtime**            | Amazon Bedrock AgentCore が提供するマネージドコンテナランタイム。ARM64 Docker イメージを実行。エージェントは FastAPI + uvicorn でルートを定義 |
| **A2A (Agent-to-Agent)**         | AgentCore のエージェント間通信プロトコル。`invoke_agent_runtime` API が raw JSON POST を送信                                              |
| **Agent Card**                   | A2A 仕様に準拠したエージェントのメタデータ（`/.well-known/agent-card.json`）。Agent Discovery に使用                                     |
| **SigV4 (Signature Version 4)**  | AWS の標準的なリクエスト署名プロトコル。AgentCore A2A 通信の認証にも使用                                                                  |
| **JSON-RPC 2.0**                 | JSON ベースの Remote Procedure Call プロトコル。Google A2A 仕様の基盤プロトコル（注: AWS AgentCore は raw JSON POST を使用し、JSON-RPC 2.0 ではない） |

---

## 関連ドキュメント

- [セキュリティ](./security.md) — 認証・認可の詳細、脅威モデル
- [トラブルシューティング](../how-to/troubleshooting.md) — 一般的なエラーと解決手順
- [ランブック](./runbook.md) — デプロイ・運用手順
- [機能要件](../reference/requirements/functional-requirements.md) — ビジネス要件と機能仕様
- [CDK README](../../cdk/README.md) — CDK スタックの詳細

---

**最終更新日**: 2026-02-14
