# Execution Agent

A2A サーバー（FastAPI on port 9000）。Verification Agent から委譲されたペイロードを Bedrock Converse API で処理し、Slack 投稿用のレスポンスを返す。

## Scope（担当範囲）

| 対象 | 内容 |
|------|------|
| AI 推論 | Bedrock Converse API によるテキスト・マルチモーダル推論 |
| マルチモーダル入力 | テキスト・画像・ドキュメント（024 添付ファイル）の処理 |
| レスポンスフォーマット | Slack 投稿用 JSON の生成 |
| ファイル生成（025 将来） | 014 などで生成したファイルの file_artifact 形式での返却 |

## Non-Scope（非担当範囲）

| 対象 | 委譲先・理由 |
|------|--------------|
| セキュリティチェック | Verification Agent — 存在確認・認可・レート制限 |
| Slack API への直接投稿 | slack-event-handler Lambda — SQS 経由で投稿 |
| イベント受信・ルーティング | agent-invoker Lambda — InvokeAgentRuntime の呼び出し元 |
| 署名検証 | slack-event-handler Lambda — Lambda 層で実施 |

## Architecture

```
Verification Agent (A2A)
    → Execution Agent (this)
        → process_attachments → 画像・ドキュメント準備
        → invoke_bedrock → Bedrock Converse API
        → format_success_response / format_error_response
    → レスポンス返却
```

## Zone-to-zone protocol (032)

Verification からの受信は **JSON-RPC 2.0** で、単一メソッド `execute_task` を提供します。リクエストは `jsonrpc`, `method`, `params`（channel, text, bot_token 等）, `id` を持ち、レスポンスは `result`（status, response_text 等）または `error`（code, message）で返します。トランスポート（例: InvokeAgentRuntime）に依存しないアプリケーション層の契約です。

## 026 Best Practices

- **E1 スコープ定義**: 本 README に担当・非担当を明記
- **計装**: Structured JSON ログ（event_type, correlation_id）、CloudWatch メトリクス
- **マルチモーダル**: Bedrock Converse content block 形式（text, document, image）で渡す（024 実装済み）

---

Module README follows project [Documentation Standards](../../../../../docs/DOCUMENTATION_STANDARDS.md).  
**Last updated**: 2026-02-14
