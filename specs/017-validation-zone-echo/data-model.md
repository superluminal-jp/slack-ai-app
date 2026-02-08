# Data Model: Validation Zone Echo for AgentCore Verification

**Feature**: 017-validation-zone-echo  
**Date**: 2026-02-08

## Entities

### EchoMode (effective configuration)

**Purpose**: エコーモードが有効かどうかを表す。永続化はせず、Lambda の環境変数から毎リクエストで判定する。

| 属性 | 型 | 説明 |
|------|-----|------|
| enabled | boolean | 環境変数 `VALIDATION_ZONE_ECHO_MODE` が `"true"` のとき true、それ以外は false |

**Validation**:
- 大文字小文字を区別しない場合は実装で `os.environ.get("VALIDATION_ZONE_ECHO_MODE", "").strip().lower() == "true"` とする。

---

### EchoContent (posted to Slack)

**Purpose**: エコーモード有効時に Slack スレッドに投稿する内容。受信イベントからその場で組み立てる。

| 属性 | 型 | 必須 | 説明 |
|------|-----|------|------|
| text | string | はい | ユーザーが送ったメッセージ本文（メンション除去・strip 済みの `user_text`）。そのまま、または先頭に `[Echo] ` を付与して投稿する。 |
| channel | string | はい | 投稿先チャンネル ID（受信イベントの channel） |
| thread_ts | string \| null | いいえ | スレッドタイムスタンプ。指定時はそのスレッドに返信する。 |

**Validation**:
- text は空文字でも可（ユーザーが空メッセージを送った場合）。Slack のメッセージ長制限（実装側で 40,000 文字等）を超えないようにする。
- channel, thread_ts は受信イベントから取得した値そのまま使用し、混在しない（FR-003）。

## Relationships

- **Slack イベント**（event_callback, message/app_mention）→ 検証・認可・重複排除の後 → **EchoMode.enabled が true** の場合のみ → **EchoContent** を組み立て → **Slack API chat_postMessage** でスレッドに投稿 → HTTP 200 を返す。
- **EchoMode.enabled が false** の場合は、既存と同様に AgentInvocationRequest を SQS に送るか、InvokeAgentRuntime を呼ぶ。本機能ではこれらのエンティティは変更しない。

## State Transitions

- EchoMode はリクエストごとに環境変数から読み、永続状態は持たない。
- EchoContent は 1 リクエスト 1 投稿で消費され、保存しない。
