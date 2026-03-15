# Research: Slack Search Agent for Verification Zone

**Date**: 2026-03-15 | **Branch**: `038-slack-search-agent`

## 1. Slack API — 検索と履歴取得

### Decision: `conversations.history` を主軸として使用
**Rationale**: 既存の bot token (`xoxb-`) で `channels:history` スコープがあれば動作する。スコープ追加不要。チャンネル指定は必須だが、仕様のスコープ（呼び出し元チャンネル + 公開チャンネル）に適合する。
**Alternatives considered**:
- `search.messages`: ワークスペース全体の全文検索が可能だが、user token (`xoxp-`) または拡張スコープが必要な場合がある。将来の拡張として保留。

### Decision: `conversations.info` でチャンネル種別を判定
**Rationale**: `is_private` フィールドで公開/プライベートを判定できる。既存コード（`existence_check.py`）でも同 API を使用しており、一貫性がある。
**Alternatives considered**:
- チャンネル名先頭の `#` で判定: 不確実（カスタム命名の場合に誤判定）。

### Decision: クライアントサイドフィルタリングで検索を補完
**Rationale**: `conversations.history` は時系列取得のみ。キーワード検索は取得後にテキストマッチで補完する。20件上限のため大量データ処理リスクは低い。

## 2. エージェントのデプロイ先

### Decision: `verification-zones/slack-search-agent/` に独立 CDK スタック
**Rationale**: verification agent の CDK スタックに組み込む（オプション）と比較して、独立スタックは単独デプロイ・ロールバックが可能で疎結合を維持できる。Constitution Principle V（Zone-Isolated）に準拠。
**Alternatives considered**:
- verification-agent CDK スタックに組み込む: デプロイが1ステップで完結するが、verification agent の CDK スタックが肥大化し、独立デプロイができなくなる。
- execution-zones に配置: アクセス制御ロジック（calling channel 判定）が verification 層の責務であり不適切。

## 3. verification agent への統合方法

### Decision: 専用環境変数 `SLACK_SEARCH_AGENT_ARN` + `slack_search_client.py`
**Rationale**: `EXECUTION_AGENT_ARNS` に混ぜると「execution agent」との概念混濁が生じる。専用変数で意図が明確になり、IAM ポリシーも独立して管理できる。
**Alternatives considered**:
- `EXECUTION_AGENT_ARNS` に `slack-search` キーを追加: 実装が簡単だが、router が Slack 検索エージェントを execution agent として扱う可能性があり意図しないルーティングが生じる。

## 4. bot_token の受け渡し

### Decision: A2A params の `bot_token` フィールドで渡す（既存パターン踏襲）
**Rationale**: 他の execution agent と同一パターン。Secrets Manager へのアクセス権限を Slack Search Agent の IAM role に追加する必要がなく、最小権限を維持できる。
**Alternatives considered**:
- Slack Search Agent が直接 Secrets Manager から bot_token を取得: 権限範囲が広がる。verification agent がトークンを管理するという既存設計と一貫性がない。

## 5. 既存 slack_url_resolver.py との関係

### Decision: 既存コードは変更せず、本機能は完全に追加
**Rationale**: `slack_url_resolver.py` はパイプライン起動時の静的 URL 解析（ユーザーメッセージ内の URL を pre-processing で展開する）。本機能は会話の流れの中で verification agent が能動的に呼び出す動的検索。用途・タイミングが異なるため共存する。将来的な統合は別スペックで検討。

## 6. Strands Agent の使用

### Decision: Strands Agent を使用（LLM がツール選択を判断）
**Rationale**: time-agent と同一パターン。verification agent が自然言語で「チャンネルを検索して」と指示すると、Slack Search Agent 内の LLM がどのツールを呼ぶかを決定する。固定ディスパッチロジック不要でメンテナンスコストが低い。
**Alternatives considered**:
- 固定ルールでツール呼び出しを振り分ける: 柔軟性がなく、新しい検索パターンへの対応が困難。

## 7. テスト戦略

### Decision: Slack API は全てモックしてユニットテストを実施
**Rationale**: 実環境への依存を排除し、CI でも実行可能にする。`unittest.mock.patch` で `slack_sdk.WebClient` のメソッドをモック。`channel_access.py` の判定ロジックは独立テスト可能。
**References**:
- 既存パターン: `verification-agent/tests/conftest.py` — boto3, slack_sdk を mock
- 既存パターン: `file-creator-agent/tests/` — Strands Agent を mock

