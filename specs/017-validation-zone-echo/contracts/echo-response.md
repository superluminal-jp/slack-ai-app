# Contract: Echo Response (Slack への投稿内容)

**Feature**: 017-validation-zone-echo  
**Date**: 2026-02-08

## Overview

エコーモード有効時、SlackEventHandler が Slack API `chat.postMessage` でスレッドに投稿する内容の仕様。

## Request (Slack API chat.postMessage)

| パラメータ | 型 | 必須 | 説明 |
|------------|-----|------|------|
| channel | string | はい | 受信イベントの `event.channel` |
| text | string | はい | エコー本文（下記 Echo Text を参照） |
| thread_ts | string | 条件付き | スレッド返信する場合は `event.thread_ts` または `event.ts`。DM や非スレッドの場合は省略可 |

## Echo Text（text の内容）

- **MVP**: ユーザーが送ったメッセージ本文（`user_text`）。メンション除去・前後空白 strip 済み。
- **オプション**: 先頭に `[Echo] ` を付与して通常の AI 返信と区別する。実装で選択可能。
- **制約**: Slack メッセージ長制限（40,000 文字）を超えないこと。超える場合は切り詰めまたは要約を実装で定義する。

## Response (Slack API)

- 成功時: HTTP 200、Slack の通常の `chat.postMessage` レスポンス。
- 失敗時: Slack API エラーに応じた例外処理。Lambda は 200 を返して Slack の再試行を防ぎ、ログにエラーを記録する。

## Test Requirements

- エコーモード有効時、`channel` と `thread_ts` が受信イベントのそれと一致し、他スレッドに投稿されないこと。
- 投稿される `text` が、当該イベントの `user_text` と一致（または [Echo] プレフィックス付きで一致）すること。
