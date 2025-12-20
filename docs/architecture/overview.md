# アーキテクチャ概要

## 2.1 ハイレベルアーキテクチャ

```
┌─────────────────────────────────────────────────────────────┐
│ Slackワークスペース                                           │
│ ユーザートリガー: /ask "質問" または @bot 質問を投げる        │
└────────────────────┬────────────────────────────────────────┘
                     │ [1] HTTPS POST (同期)
                     │ X-Slack-Signature (HMAC SHA256)
                     │ X-Slack-Request-Timestamp
                     │ + response_url (Webhook URL)
                     ↓
┌─────────────────────────────────────────────────────────────┐
│ Verification Zone (検証層)                                   │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ SlackEventHandler Function URL                          │ │
│ │ (パブリックリージョナルエンドポイント)                     │ │
│ │ - 認証なし（署名検証はLambda内で実施）                   │ │
│ │ - CloudWatch Logs: 完全なリクエスト/レスポンスログ        │ │
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
│ │   * team_id, user_id, channel_id のホワイトリスト確認 │ │
│ │   * DynamoDB/Secrets Manager/環境変数から読み込み     │ │
│ │   * メモリ内キャッシュ (5分TTL)                       │ │
│ │ - イベント重複排除（DynamoDB: slack-event-dedupe）    │ │
│ │ - 添付ファイルメタデータ抽出                          │ │
│ │ - 構造化JSONログ（相関ID）                            │ │
│ │ [2] → Slackに即座に応答 "考え中です..."（3秒以内）    │ │
│ │ [3] → ExecutionApi (API Gateway) を呼び出し           │ │
│ └──────────────────────┬──────────────────────────────────┘ │
└────────────────────────┼────────────────────────────────────┘
                         │ [3] API Gateway呼び出し (IAM認証)
                         │ POST /execute
                         │ Payload: {channel, text, bot_token, thread_ts, attachments}
                         ↓
┌─────────────────────────────────────────────────────────────┐
│ Execution Zone (実行層)                                      │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ ExecutionApi (Execution Layer API)                      │ │
│ │ API Gateway REST API (プライベート / IAM認証)             │ │
│ │ - IAM認証のみ                                           │ │
│ │ - リソースポリシー: SlackEventHandlerロールのみ         │ │
│ │ - Lambda Proxy統合                                      │ │
│ └──────────────────────┬──────────────────────────────────┘ │
│                        │                                     │
│ ┌─────────────────────▼──────────────────────────────────┐ │
│ │ BedrockProcessor (実行層 Execution Layer)              │ │
│ │ タイムアウト: 30秒                                      │ │
│ │ 責任範囲:                                              │ │
│ │ - AWS Bedrock Converse API呼び出し                     │ │
│ │   * 統一インターフェース、マルチモーダル対応            │ │
│ │   * バイナリ画像データ（Base64不要）                   │ │
│ │ - スレッド履歴取得 (conversations.replies)              │ │
│ │ - スレッド返信 (chat.postMessage with thread_ts)       │ │
│ │ - **添付ファイル処理**: 画像とドキュメントのダウンロード│ │
│ │ - **画像分析**: Bedrock Converse API視覚機能            │ │
│ │ - **ドキュメント抽出**: PDF, DOCX, CSV, XLSX, PPTX, TXT│ │
│ │ - **PPTX変換**: LibreOfficeを使用したスライド画像変換 │ │
│ │ - **複数添付ファイル**: 複数ファイルの順次処理         │ │
│ │ [4] → Slack APIにHTTP POSTでレスポンス投稿             │ │
│ │   (スレッド内に投稿)                                     │ │
│ │ - CloudTrail監査（すべてのBedrock呼び出し）           │ │
│ │ - 会話、画像生成、コード生成、データ分析など対応      │ │
│ └────────────────────┬───────────────────────────────────┘ │
│                      │ [4] HTTPS POST                       │
│                      │ to Slack API (chat.postMessage)      │
│                      │ with thread_ts                       │
│                      ↓                                       │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ AWS Bedrock Converse API                                 │ │
│ │ - Foundation Model: 要件に応じて選択（Claude、Nova等）   │ │
│ │ - 統一インターフェース                                  │ │
│ │ - マルチモーダル入力（テキスト+画像）                   │ │
│ │ - Model Invocation Logging                             │ │
│ └─────────────────────────────────────────────────────────┘ │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ↓
┌──────────────────────────────────────────────────────────────┐
│ Slackワークスペース                                           │
│ [5] BedrockProcessorからSlack APIへのPOSTを受信              │
│ → スレッド内にAIレスポンスを表示                             │
└──────────────────────────────────────────────────────────────┘

フロー:
[1] ユーザーが /ask "リクエスト" を実行（添付ファイル可）
[2] SlackEventHandlerが即座に "処理中です..." を返す（3秒以内）
[3] SlackEventHandlerがExecutionApi (API Gateway) を呼び出し（IAM認証）
[4] BedrockProcessorがBedrock Converse APIを呼び出し、Slack APIにPOST（スレッド返信）
[5] Slackスレッド内に最終レスポンスが表示される（5〜30秒後）
```

## 2.2 システムコンポーネント

| レイヤー          | 主な機能                 | 技術スタック           | 責任範囲                                                                                                                                     |
| ----------------- | ------------------------ | ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Slack             | ユーザーインターフェース | Slack API              | コマンド受付、メッセージ表示、スレッド管理                                                                                                   |
| SlackEventHandler | 検証層処理               | Python 3.11            | 署名検証（鍵 1）、Existence Check（鍵 2）、API Gateway 呼び出し、即座応答、添付ファイルメタデータ抽出                                        |
| Function URL      | パブリックエンドポイント | Lambda Function URL    | リクエスト受付、SlackEventHandler へのルーティング                                                                                           |
| ExecutionApi      | 内部 API                 | API Gateway (IAM 認証) | 内部通信の保護（IAM 認証による）、Lambda Proxy 統合                                                                                          |
| BedrockProcessor  | AI 処理                  | Python 3.11            | Bedrock Converse API 呼び出し、スレッド履歴取得、スレッド返信、添付ファイル処理                                                              |
| Bedrock Converse  | AI モデル                | Foundation Model       | 統一インターフェース、マルチモーダル入力（テキスト+画像）、多様な AI 機能（会話、画像生成、コード生成、データ分析など、モデル選択可能）      |
| DynamoDB          | データストア             | DynamoDB               | トークンストレージ (slack-workspace-tokens)、イベント重複排除 (slack-event-dedupe)、Existence Check キャッシュ (slack-existence-check-cache) |
| LibreOffice Layer | PPTX 変換                | Lambda Layer           | PowerPoint スライドを画像に変換（オプション）                                                                                                |

**データフロー**: Slack → SlackEventHandler Function URL → SlackEventHandler（署名検証、Existence Check、即座応答、添付ファイルメタデータ抽出）→ ExecutionApi (API Gateway, IAM 認証) → BedrockProcessor（スレッド履歴取得、添付ファイルダウンロード・処理）→ Bedrock Converse API（テキスト+画像分析）→ Slack API（スレッド返信）→ Slack

**スレッド処理フロー**: Slack Event (`event.thread_ts` or `event.ts`) → BedrockProcessor（`conversations.replies`で履歴取得）→ Bedrock Converse API（会話履歴を含む）→ Slack API（`chat.postMessage` with `thread_ts`）→ Slack スレッド内に表示

**添付ファイル処理フロー**: Slack Event (`event.files`) → SlackEventHandler（メタデータ抽出）→ BedrockProcessor（Slack CDN からダウンロード、画像/ドキュメント処理）→ Bedrock Converse API（バイナリ画像データ、テキスト抽出）→ 統合された AI 応答 → Slack API（スレッド返信）

**非同期処理の利点**: Slack の 3 秒タイムアウト制約を回避し、ユーザーに即座のフィードバックを提供しながら、バックグラウンドで AI 処理を実行できます。

## 2.3 セキュリティ設計の原則

本システムは、AI の特性を考慮した**多層防御（Defense in Depth）**を採用しています：

### 認証・認可の基本方針

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

### 多層防御による攻撃対応

各レイヤーが特定の脅威に対応：

- **レイヤー 1-2 (Slack/Function URL)**: T-02 (アカウント乗っ取り)、T-07 (DDoS)
- **レイヤー 3 (SlackEventHandler)**: T-01 (シークレット漏洩)、T-03 (リプレイ)、T-08 (権限昇格)、Two-Key Defense
- **レイヤー 4 (ExecutionApi IAM 認証)**: T-05 (IAM 侵害)、内部 API 保護
- **レイヤー 5-6 (Bedrock Converse API)**: T-11 (モデル乱用)

詳細は [セキュリティ要件](../security/requirements.md) を参照してください。

---

## 関連ドキュメント

- [機能要件](../requirements/functional-requirements.md) - ビジネス要件と機能仕様
- [ユーザー体験](./user-experience.md) - エンドユーザーフローと UX
- [実装詳細](./implementation-details.md) - Lambda 構成とデータフロー
- [セキュリティ要件](../security/requirements.md) - 機能的・非機能的セキュリティ要件
- [脅威モデル](../security/threat-model.md) - リスク分析とアクター
- [セキュリティ実装](../security/implementation.md) - 多層防御の実装詳細
