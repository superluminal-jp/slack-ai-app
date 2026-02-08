# Contract: Echo at Runtime (Verification Agent が Slack に投稿する内容)

**Feature**: 018-echo-at-agentcore-runtime  
**Date**: 2026-02-08

## Overview

エコーモード有効時、Verification Agent (AgentCore Runtime) が Slack API `chat.postMessage` でスレッドに投稿する内容の仕様。017 の Lambda 側エコーと同一の投稿形式を用い、投稿主体のみ Runtime に移す。

## Request (Slack API chat.postMessage)

| パラメータ | 型 | 必須 | 説明 |
|------------|-----|------|------|
| channel | string | はい | A2A タスクの `channel` |
| text | string | はい | エコー本文（下記 Echo Text を参照） |
| thread_ts | string | 条件付き | スレッド返信する場合はタスクの `thread_ts`。省略時は channel への通常投稿 |

## Echo Text（text の内容）

- **MVP**: タスクの `text`（ユーザーが送ったメッセージ本文）の先頭に `[Echo] ` を付与。例: `"[Echo] " + text`。空の場合は `"[Echo]"`。
- **制約**: Slack メッセージ長制限（40,000 文字）を超えないこと。超える場合は切り詰めまたは要約を実装で定義する。

## A2A 応答（Verification Agent の戻り値）

エコーモードで処理を完了した場合、Verification Agent は A2A プロトコルに従い、成功を示す応答を返す（Execution Agent を呼んだ場合と同様の成功形式）。例: `{"status": "success", ...}`。InvokeAgentRuntime の呼び出し元（Agent Invoker）はこの応答を受け取り、正常終了とみなす。

## Test Requirements

- エコーモード有効時、`channel` と `thread_ts` が当該 A2A タスクのそれと一致し、他スレッドに投稿されないこと。
- 投稿される `text` が、当該タスクの `text` に `[Echo] ` を付けたものと一致すること。
- Execution Agent は呼ばれないこと。
