# Quickstart: Async AgentCore Invocation (016)

**Feature**: 016-async-agentcore-invocation  
**Purpose**: Slack イベント受信をブロックせず、AgentCore 実行を SQS 経由で非同期に起動する。

## 前提

- 015 完了済み（AgentCore A2A 一本化、SlackEventHandler が Verification Agent を同期的に InvokeAgentRuntime で呼び出している状態）。
- Slack アプリの Event Subscriptions は SlackEventHandler の Function URL を指している。

## アーキテクチャ概要

1. **Slack** → Event → **SlackEventHandler Lambda**（検証・認可 → **SQS に実行リクエストを送信** → 即 200 返却）
2. **agent-invocation-request** SQS キュー → **Agent Invoker Lambda**（メッセージ受信 → **InvokeAgentRuntime(Verification Agent)**）
3. **Verification Agent**（既存）→ 実行完了後 **Slack** に投稿

## 実装の流れ

### Phase 1: SQS と Agent Invoker の追加

1. **SQS キュー作成**（検証スタック）  
   - キュー名（論理）: `agent-invocation-request`  
   - 可視性タイムアウト: 900 秒以上（Agent Invoker Lambda のタイムアウトに合わせる）  
   - メッセージ保持: 14 日  
   - DLQ を関連付け、最大受信回数（例: 3）を設定  

2. **Agent Invoker Lambda 作成**  
   - ランタイム: Python 3.11  
   - トリガー: 上記 SQS キュー（バッチサイズ 1 推奨）  
   - タイムアウト: 900 秒（15 分）  
   - 環境変数: VERIFICATION_AGENT_ARN, AWS_REGION_NAME  
   - IAM: `bedrock-agentcore:InvokeAgentRuntime`（Verification Agent の runtime ARN および runtime-endpoint/DEFAULT）、SQS の ReceiveMessage / DeleteMessage  

3. **SlackEventHandler の変更**  
   - InvokeAgentRuntime の同期呼び出しを削除  
   - 代わりに AgentInvocationRequest（channel, text, thread_ts, event_id, correlation_id, team_id, user_id, bot_token, attachments）を組み立て、SQS に送信  
   - 送信成功後に 200 を返却。送信失敗時はログ＋500 を返却（Slack が再送、重複排除で二重実行を防止）  
   - SlackEventHandler の IAM に SQS 送信権限を追加  

4. **重複排除の維持**  
   - 既存の Event Dedupe（DynamoDB）はそのまま利用。SlackEventHandler がイベント処理の入口で event_id をチェックするため、SQS 投入前に重複は排除される。  

### Phase 2: テストと検証

1. **単体テスト**  
   - SlackEventHandler: メンション受信時に SQS 送信が呼ばれ、InvokeAgentRuntime が呼ばれないことを確認  
   - Agent Invoker: SQS イベントから AgentInvocationRequest を復元し、InvokeAgentRuntime に正しい payload を渡すことを確認  

2. **結合テスト**  
   - Slack でメンション → 数秒以内に 200 が返ることを確認（Slack の再送が発生しないこと）  
   - エージェント実行が 60 秒超の場合でも、完了後にスレッドに返信が届くことを確認  
   - CloudWatch Logs で「キュー投入」「Agent Invoker 受信」「InvokeAgentRuntime 開始/完了」の流れを確認  

3. **失敗シナリオ**  
   - SQS 送信失敗時: SlackEventHandler が 500 を返すこと、ログにエラーが残ることを確認  
   - Agent Invoker が InvokeAgentRuntime で失敗した場合: メッセージが再表示されリトライされること、最大回数後に DLQ に移ることを確認  

## 設定・環境変数

| コンポーネント | 変数・設定 | 説明 |
|----------------|------------|------|
| SlackEventHandler | AGENT_INVOCATION_QUEUE_URL | agent-invocation-request キューの URL |
| SlackEventHandler | VERIFICATION_AGENT_ARN | （SQS 送信のみに変えるため、Invoke 用 ARN は Agent Invoker 側に移す） |
| Agent Invoker | VERIFICATION_AGENT_ARN | Verification Agent Runtime ARN |
| Agent Invoker | AWS_REGION_NAME | ap-northeast-1 等 |

## トラブルシューティング

- **メンションしても返信がこない**  
  - SlackEventHandler のログで SQS 送信が成功しているか確認  
  - Agent Invoker のログで InvokeAgentRuntime が呼ばれているか、エラーがないか確認  
  - Verification Agent の AgentCore ログで実行完了と Slack 投稿が行われているか確認  

- **SQS にメッセージが溜まる**  
  - Agent Invoker Lambda のエラー・タイムアウトを確認  
  - キューの可視性タイムアウトが Lambda タイムアウト以上か確認  

- **DLQ にメッセージが移る**  
  - Agent Invoker のエラーログと DLQ メッセージ本文を照合  
  - InvokeAgentRuntime の IAM・ARN（runtime-endpoint/DEFAULT）を再確認  

## 参照

- [spec.md](./spec.md) — 機能要件と成功基準  
- [research.md](./research.md) — SQS 採用理由と設定方針  
- [data-model.md](./data-model.md) — AgentInvocationRequest エンティティ  
- [contracts/agent-invocation-request.yaml](./contracts/agent-invocation-request.yaml) — SQS メッセージスキーマ  
- specs/011-verification-slack-response — 実行ゾーン → SQS → 検証ゾーンの非同期パターン
