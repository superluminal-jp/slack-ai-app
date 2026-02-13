# Data Model: Echo at Verification Agent (AgentCore Runtime)

**Feature**: 018-echo-at-agentcore-runtime  
**Date**: 2026-02-08

## 概要

018 では永続ストレージは追加しない。エコーモードの設定と、既存の A2A タスクペイロード（リクエストコンテキスト）のみを扱う。

## エンティティ

### エコーモード設定（ランタイム設定）

| 属性 | 型 | 説明 |
|------|-----|------|
| 名前 | 文字列 | `VALIDATION_ZONE_ECHO_MODE`（環境変数名） |
| 値 | 文字列 | `"true"` のときのみエコーモード有効。大文字小文字は正規化して判定。 |
| 適用先 | Verification Agent (AgentCore Runtime) | CDK の EnvironmentVariables で Runtime に渡す。 |

- **検証ルール**: 値は文字列。空または未設定の場合はエコーモード無効。
- **関係**: Lambda 側では 018 適用後はこの設定に依存せず「常に SQS に送る」。Runtime 側でのみ参照する。

### リクエストコンテキスト（A2A タスクペイロード）

既存の 016 の A2A タスク形式をそのまま使用する。エコー投稿に必要な項目のみ記載する。

| 属性 | 型 | 説明 |
|------|-----|------|
| channel | 文字列 | Slack チャンネル ID。エコー投稿の宛先。 |
| thread_ts | 文字列 (任意) | スレッドのタイムスタンプ。省略時は channel への通常投稿。 |
| text | 文字列 | ユーザーが送ったメッセージ本文。エコー本文の元。 |
| bot_token | 文字列 | Slack Bot Token。post_to_slack に必要。 |

- **検証ルール**: 既存の Agent Invoker が Lambda から受け取ったペイロードをそのまま Verification Agent に渡す。追加のバリデーションは既存どおり。
- **状態遷移**: なし（リクエストごとの読み取り専用データ）。

## 状態遷移

なし。エコーモードはデプロイ時または設定変更で切り替えるのみで、リクエスト単位の状態機械は持たない。
