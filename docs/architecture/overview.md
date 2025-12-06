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
│ │ - Slack署名検証 (HMAC SHA256)                          │ │
│ │ - タイムスタンプ検証 (±5分)                           │ │
│ │ - team_id、user_id、channel_idの認可                 │ │
│ │ - 入力のサニタイズと検証                               │ │
│ │ - プロンプトインジェクション検出（基本）               │ │
│ │ - ユーザー単位レート制限（10リクエスト/分）            │ │
│ │ - 構造化JSONログ（相関ID、PIIなし）                   │ │
│ │ - イベント重複排除（DynamoDB: slack-event-dedupe）    │ │
│ │ [2] → Slackに即座に応答 "考え中です..."（3秒以内）    │ │
│ │ [3] → ExecutionApi (API Gateway) を呼び出し           │ │
│ └──────────────────────┬──────────────────────────────────┘ │
└────────────────────────┼────────────────────────────────────┘
                         │ [3] API Gateway呼び出し (IAM認証)
                         │ POST /execute
                         │ Payload: {channel, text, bot_token}
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
│ │ - AWS Bedrock APIの呼び出し（Foundation Model選択可能）│ │
│ │ - Bedrock Guardrails適用（60言語、99%精度検証）       │ │
│ │ - コンテキスト履歴管理（DynamoDB）                     │ │
│ │ - AIレスポンスのPIIフィルタリング（正規表現ベース）   │ │
│ │ - トークン数制限の強制（4000トークン/リクエスト）      │ │
│ │ - **添付ファイル処理**: 画像とドキュメントのダウンロード│ │
│ │ - **画像分析**: Bedrock視覚機能を使用した画像分析     │ │
│ │ - **ドキュメント抽出**: PDF, DOCX, CSV, XLSX, PPTX, TXT│ │
│ │ - **PPTX変換**: LibreOfficeを使用したスライド画像変換 │ │
│ │ - **複数添付ファイル**: 複数ファイルの順次処理         │ │
│ │ [4] → Slack APIにHTTP POSTでレスポンス投稿             │ │
│ │ - CloudTrail監査（すべてのBedrock呼び出し）           │ │
│ │ - 会話、画像生成、コード生成、データ分析など対応      │ │
│ └────────────────────┬───────────────────────────────────┘ │
│                      │ [4] HTTPS POST                       │
│                      │ to response_url                      │
│                      ↓                                       │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ AWS Bedrock                                             │ │
│ │ - Foundation Model: 要件に応じて選択（Claude、Titan等） │ │
│ │ - Guardrails: Automated Reasoning (99%精度)            │ │
│ │ - Model Invocation Logging                             │ │
│ └─────────────────────────────────────────────────────────┘ │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ↓
┌──────────────────────────────────────────────────────────────┐
│ Slackワークスペース                                           │
│ [5] BedrockProcessorからSlack APIへのPOSTを受信                     │
│ → チャネルにAIレスポンスを表示                                │
└──────────────────────────────────────────────────────────────┘

フロー:
[1] ユーザーが /ask "リクエスト" を実行
[2] SlackEventHandlerが即座に "処理中です..." を返す（3秒以内）
[3] SlackEventHandlerがExecutionApi (API Gateway) を呼び出し（IAM認証）
[4] BedrockProcessorがBedrockを呼び出し、Slack APIにPOST
[5] Slackに最終レスポンスが表示される（5〜30秒後）
```

## 2.2 システムコンポーネント

| レイヤー          | 主な機能                 | 技術スタック           | 責任範囲                                                                           |
| ----------------- | ------------------------ | ---------------------- | ---------------------------------------------------------------------------------- |
| Slack             | ユーザーインターフェース | Slack API              | コマンド受付、メッセージ表示                                                       |
| SlackEventHandler | 検証層処理               | Python 3.11            | 署名検証、認可、API Gateway 呼び出し、即座応答、添付ファイルメタデータ抽出       |
| Function URL      | パブリックエンドポイント | Lambda Function URL    | リクエスト受付、SlackEventHandler へのルーティング                                 |
| ExecutionApi      | 内部 API                 | API Gateway (IAM 認証) | 内部通信の保護（IAM 認証による）                                                   |
| BedrockProcessor  | AI 処理                  | Python 3.11            | Bedrock 呼び出し、コンテキスト履歴管理、Slack API 投稿、添付ファイル処理          |
| Bedrock           | AI モデル                | Foundation Model       | 多様な AI 機能（会話、画像生成、コード生成、データ分析など、モデル選択可能）、視覚分析 |
| DynamoDB          | データストア             | DynamoDB               | トークンストレージ (slack-workspace-tokens)、イベント重複排除 (slack-event-dedupe) |
| LibreOffice Layer | PPTX変換                 | Lambda Layer           | PowerPoint スライドを画像に変換（オプション）                                      |

**データフロー**: Slack → SlackEventHandler Function URL → SlackEventHandler（即座応答、添付ファイルメタデータ抽出）→ ExecutionApi (API Gateway, IAM 認証) → BedrockProcessor（添付ファイルダウンロード・処理）→ Bedrock（テキスト+画像分析）→ Slack API → Slack

**添付ファイル処理フロー**: Slack Event (`event.files`) → SlackEventHandler（メタデータ抽出）→ BedrockProcessor（Slack CDN からダウンロード、画像/ドキュメント処理）→ Bedrock（視覚分析/テキスト抽出）→ 統合された AI 応答

**非同期処理の利点**: Slack の 3 秒タイムアウト制約を回避し、ユーザーに即座のフィードバックを提供しながら、バックグラウンドで AI 処理を実行できます。

## 2.3 セキュリティ設計の原則

本システムは、AI の特性を考慮した**多層防御（Defense in Depth）**を採用しています：

### 認証・認可の基本方針

1. **2 鍵防御モデル**: Signing Secret と Bot Token の両方が必要

   - Signing Secret 漏洩時も Bot Token がなければ攻撃不可
   - Bot Token 漏洩時も署名検証で偽造リクエストを検出
   - **防げる攻撃**: T-01 (署名シークレット漏洩)、T-04 (API Gateway URL 漏洩)

2. **動的検証**: Slack API による実在性確認

   - 静的ホワイトリストではなく、動的に team_id, user_id, channel_id を検証
   - 削除されたユーザー/チャンネルからのリクエストを即座に検出
   - **防げる攻撃**: 偽造リクエスト、削除済みエンティティからの攻撃

3. **fail-closed 原則**: 認証・認可失敗時は即座に拒否

   - Slack API ダウン時もリクエストを拒否（セキュリティ優先）
   - **防げる攻撃**: タイミング攻撃、障害時の攻撃

4. **最小権限の原則**: IAM ロールは必要最小限の権限のみ付与
   - **防げる攻撃**: T-08 (権限昇格)、T-05 (IAM ロール侵害)

### 多層防御による攻撃対応

各レイヤーが特定の脅威に対応：

- **レイヤー 1-2 (Slack/Function URL)**: T-02 (アカウント乗っ取り)、T-07 (DDoS)
- **レイヤー 3 (SlackEventHandler)**: T-01 (シークレット漏洩)、T-03 (リプレイ)、T-08 (権限昇格)
- **レイヤー 4 (ExecutionApi IAM 認証)**: T-05 (IAM 侵害)、内部 API 保護
- **レイヤー 5-6 (Guardrails/Bedrock)**: T-09 (プロンプトインジェクション)、T-10 (PII 漏洩)、T-11 (モデル乱用)

詳細は [セキュリティ要件](../security/requirements.md) を参照してください。

---

## 関連ドキュメント

- [機能要件](../requirements/functional-requirements.md) - ビジネス要件と機能仕様
- [ユーザー体験](./user-experience.md) - エンドユーザーフローと UX
- [実装詳細](./implementation-details.md) - Lambda 構成とデータフロー
- [セキュリティ要件](../security/requirements.md) - 機能的・非機能的セキュリティ要件
- [脅威モデル](../security/threat-model.md) - リスク分析とアクター
- [セキュリティ実装](../security/implementation.md) - 多層防御の実装詳細
