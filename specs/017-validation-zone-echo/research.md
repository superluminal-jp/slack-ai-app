# Research: Validation Zone Echo for AgentCore Verification

**Branch**: `017-validation-zone-echo` | **Date**: 2026-02-08

## 1. エコーモードの切り替え方法（MVP）

**Decision**: 環境変数 `VALIDATION_ZONE_ECHO_MODE` で有効/無効を切り替える。値が `"true"`（小文字）のときのみエコーモード有効とする。

**Rationale**:
- [AWS Lambda – Working with environment variables](https://docs.aws.amazon.com/lambda/latest/dg/configuration-envvars.html): "You can use environment variables to adjust your function's behavior without updating code." 設定の切り替えに環境変数を使うのは AWS の一般的な使い方。
- MVP として「まず動くこと」を最優先するため、AppConfig や Powertools の Feature Flags は導入しない。デプロイ時に CDK で環境変数を渡すだけで切り替え可能にし、実装と検証を短時間で完了させる。
- 機密情報ではないため Secrets Manager は不要。環境変数は Lambda で at-rest 暗号化される。

**Alternatives considered**:
- **AWS AppConfig + Powertools Feature Flags**: 動的切り替えやルールエンジンが使えるが、MVP では過剰。必要になったら後から導入可能。
- **SSM Parameter Store**: 環境変数と同様に「デプロイ/設定変更」で切り替え可能だが、Lambda から取得する 1 回の呼び出しが増える。MVP では環境変数で十分。

---

## 2. エコー処理を置く場所

**Decision**: SlackEventHandler Lambda 内でエコー分岐を実装する。SQS 送信または InvokeAgentRuntime の前に「エコーモードなら chat_postMessage で本文を投稿して return」する。

**Rationale**:
- 検証ゾーン「内」で完結するという spec の要件を満たす。Slack 受信（SlackEventHandler）→ 認証・認可・レート制限まで既にここで実施済み。
- 既に `WebClient` と `bot_token` があり、`chat_postMessage` はバリデーションエラー投稿で使用済み。追加ライブラリ不要で、Slack API のベストプラクティス（トークンは Secrets Manager 等から取得）も維持している。
- Verification Agent（AgentCore）を経由しないため、「AgentCore を呼ばずに Validation zone の入口〜Slack 返信までが動くか」の確認に使える。

**Alternatives considered**:
- **Verification Agent 内でエコー**: AgentCore の動作確認が主目的なら「Agent まで届いてからエコー」も一案だが、その場合は SQS → Agent Invoker → Verification Agent まで動かす必要がある。spec は「実行ゾーンへの通信を保留」して「検証ゾーン内で受け取った内容を返す」ことを求めているため、Lambda で完結させる方が要件に合う。
- **別 Lambda に分離**: 責務は明確になるが、デプロイ・設定が増え MVP が重くなる。今回は 1 Lambda 内の分岐で十分。

---

## 3. エコーする内容と形式

**Decision**: ユーザーが送ったメッセージ本文（`user_text`。メンション除去・前後空白 strip 済み）をそのままスレッドに投稿する。オプションで先頭に `[Echo] ` を付与して、通常の AI 返信と区別しやすくする（実装時にどちらにするか選択可能）。

**Rationale**:
- Spec: 「受信した内容をそのまま返す」「判読可能な形で返す」。本文テキストはそのまま返すのが最も分かりやすい。
- チャンネル・スレッド・ユーザー識別子は、Slack のスレッドに投稿する時点で同じスレッドに返るため混在しない。デバッグ用にメタデータを追加する場合は、本文の前後に 1 行ずつ付ける程度にとどめ、Slack のメッセージ長制限（40,000 文字等）を超えないようにする。

**Alternatives considered**:
- **生のペイロード全体を JSON で投稿**: デバッグには有用だが、可読性が落ち、ペイロードが大きいと Slack の制限に触れる。MVP では本文エコーに限定し、必要なら後から「デバッグモード」で要約付きメタデータを追加する。

---

## 4. Slack 3 秒制約との関係

**Decision**: エコーモード時も、まず 200 を返すか、`chat_postMessage` を同期的に実行してから 200 を返す。いずれにしても 3 秒以内に HTTP 応答を返す。

**Rationale**:
- 既存フローでは SQS 送信または InvokeAgentRuntime のあと即 200 を返している。エコー時は `chat_postMessage` 1 回（通常 500ms 未満）のあと 200 を返せば、Slack の再試行を招かない。
- Spec FR-005: 「即時応答（リアクション等）の後にエコー内容がスレッドに投稿される」も、リアクション 👀 は既存どおり付与し、その後にエコー投稿して 200 を返す形で満たせる。

---

## 5. まとめ

| 項目 | 選択 | 根拠 |
|------|------|------|
| モード切り替え | 環境変数 `VALIDATION_ZONE_ECHO_MODE` | AWS 推奨の「振る舞いの切り替え」、MVP で最小実装 |
| 実装場所 | SlackEventHandler Lambda | 検証ゾーン内完結、既存の Slack 投稿・認証を再利用 |
| エコー内容 | メッセージ本文（`user_text`） | spec の「そのまま返す」に合致、シンプル |
| Slack 制約 | 即時 200 + 同期的な echo 投稿 | 3 秒以内応答を維持 |
