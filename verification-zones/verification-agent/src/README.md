# Verification Agent

A2A サーバー（FastAPI on port 9000）。Slack イベント受信後のセキュリティチェックと Execution Agent への委譲を行う。

## Scope（担当範囲）

| 対象 | 内容 |
|------|------|
| エンティティ存在確認 | チャンネル・チームが Slack で存在するか確認 |
| 認可 | ホワイトリストによる送信元検証 |
| レート制限 | チーム単位のリクエスト制限 |
| Execution Agent 委譲 | A2A 経由で AI 推論を Execution Agent に委譲 |
| Slack 投稿リクエスト enqueue | SQS への投稿リクエスト送信 |
| エラーマッピング | ユーザー向けエラーメッセージの統一 |

## Non-Scope（非担当範囲）

| 対象 | 委譲先・理由 |
|------|--------------|
| AI 推論 | Execution Agent — Bedrock 呼び出しは Execution ゾーン側で実施 |
| Slack API への直接投稿 | slack-event-handler Lambda — SQS から非同期で投稿 |
| Slack 署名検証 | slack-event-handler Lambda — HMAC 検証は Lambda で実施 |
| 初期イベント受信 | agent-invoker Lambda — InvokeAgentRuntime の呼び出し元 |

## Architecture

```
agent-invoker (Lambda)
    → InvokeAgentRuntime → Verification Agent (this)
        → 存在確認・認可・レート制限
        → A2A invoke → Execution Agent
        → SQS enqueue → slack-event-handler
```

## Zone-to-zone protocol (032)

Verification → Execution 間のアプリケーション層プロトコルは **JSON-RPC 2.0**（CSP 非依存 A2A）です。トランスポート（例: InvokeAgentRuntime）は実装詳細であり、単一メソッド `execute_task` で channel / text / bot_token 等を params として送受信します。成功時は `result`、エラー時は `error`（code, message）で返却し、Slack にはアンラップされたペイロードのみ渡します。

## 026 Best Practices

- **E1 スコープ定義**: 本 README に担当・非担当を明記
- **計装**: Structured JSON ログ（event_type, correlation_id）、CloudWatch メトリクス
- **ツール戦略**: A2A の handle_message_tool 相当は Execution Agent 側で実装

---

Module README follows project [Documentation Standards](../../../../../docs/DOCUMENTATION_STANDARDS.md).  
**Last updated**: 2026-02-14
