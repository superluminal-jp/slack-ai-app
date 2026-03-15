# Data Model: Slack Search Agent

**Date**: 2026-03-15 | **Branch**: `038-slack-search-agent`

## Entities

### SlackMessage
Slack チャンネルから取得した1件のメッセージ。

| Field | Type | Description |
|-------|------|-------------|
| `channel_id` | str | チャンネル ID（例: `C1234567890`） |
| `channel_name` | str | チャンネル名（例: `general`） |
| `ts` | str | メッセージのタイムスタンプ（Slack 形式: `1234567890.123456`） |
| `user` | str \| None | 投稿者のユーザー ID（bot 投稿の場合 None） |
| `text` | str | メッセージ本文 |
| `thread_ts` | str \| None | スレッド親メッセージの ts（スレッド内返信の場合のみ） |
| `reply_count` | int | スレッド返信数（親メッセージのみ） |

### SearchResult
`search_messages` ツールの返戻値。

| Field | Type | Description |
|-------|------|-------------|
| `query` | str | 使用した検索クエリ |
| `channel_id` | str \| None | 検索対象チャンネル ID（None の場合は全公開チャンネル） |
| `messages` | list[SlackMessage] | 一致したメッセージ一覧（最大 20 件） |
| `total_retrieved` | int | 取得件数 |
| `truncated` | bool | 20 件上限で打ち切られた場合 True |

### ThreadResult
`get_thread` ツールの返戻値。

| Field | Type | Description |
|-------|------|-------------|
| `url` | str | 取得に使用した Slack URL |
| `channel_id` | str | チャンネル ID |
| `thread_ts` | str | スレッド親メッセージの ts |
| `messages` | list[SlackMessage] | 親メッセージ + 全返信（最大 20 件） |
| `total_retrieved` | int | 取得件数 |

### ChannelHistoryResult
`get_channel_history` ツールの返戻値。

| Field | Type | Description |
|-------|------|-------------|
| `channel_id` | str | チャンネル ID |
| `channel_name` | str | チャンネル名 |
| `messages` | list[SlackMessage] | 最新メッセージ一覧（最大 20 件、新しい順） |
| `total_retrieved` | int | 取得件数 |

### ChannelAccessDecision
`channel_access.py` の判定結果。

| Field | Type | Description |
|-------|------|-------------|
| `channel_id` | str | 判定対象チャンネル ID |
| `allowed` | bool | アクセス許可 True / 拒否 False |
| `reason` | str | 許可理由（`"calling_channel"` / `"public_channel"`）または拒否理由（`"private_channel"`） |

## Validation Rules

- `query` は空文字列不可（最小 1 文字）
- `limit` は 1〜20 の範囲（デフォルト 20）
- `channel_id` の形式: `C` で始まる英数字（例: `C1234567890`）
- Slack URL の形式: `https://*.slack.com/archives/[CHANNEL_ID]/p[TIMESTAMP]`
- `bot_token` は `xoxb-` プレフィックス必須

## New Storage

なし。本機能は新規ストレージを使用しない。

