# 処理フローと現状の検証

デプロイ後のエンドツーエンド処理がどこまで正しく進んでいるかを確認する手順と、現状の確認結果をまとめる。

---

## 1. 処理フロー（現行構成）

```
[Slack] メンション/メッセージ
    │
    ▼ [A] HTTPS POST (X-Slack-Signature)
[Slack Event Handler] Lambda (Function URL)
    │ 署名検証・Existence Check・ホワイトリスト・レート制限・重複排除
    │ → リアクション 👀 を付与して 200 返却
    ▼ [B] SQS SendMessage (agent-invocation-request)
[Agent Invoker] Lambda (SQS トリガー)
    │
    ▼ [C] InvokeAgentRuntime (Verification Agent)
[Verification Agent] AgentCore Runtime (コンテナ)
    │ pipeline: 存在確認・認可・レート制限 → エコー or Execution 呼び出し
    │
    ├─ エコーモード時: SQS (slack-post-request) に [Echo] 投稿依頼 → 終了
    │
    └─ 通常時: [D] InvokeAgentRuntime (Execution Agent)
              [Execution Agent] AgentCore Runtime
              → 結果を SQS (slack-post-request) に投稿依頼
    │
    ▼ [E] SQS SendMessage (slack-post-request)
[Slack Poster] Lambda (SQS トリガー)
    │
    ▼ [F] Slack API (chat.postMessage / files.upload_v2)
    │ 投稿成功後: リアクション 👀 を削除して ✅ を付与
    ▼
[Slack] スレッドに返信
```

| 経路 | 起点 | 終点 | 確認方法 |
|------|------|------|----------|
| A | Slack | Slack Event Handler | Slack でメンション → CloudWatch: `event_received`, `signature_verification_success` |
| B | Slack Event Handler | SQS (agent-invocation-request) | Lambda ログに SQS 送信成功、Agent Invoker が起動 |
| C | Agent Invoker | Verification Agent | Agent Invoker ログに `InvokeAgentRuntime` 成功 or エラー (424 等) |
| D | Verification Agent | Execution Agent | Verification Agent の AgentCore ログ |
| E | Verification Agent | SQS (slack-post-request) | Slack Poster Lambda が起動 |
| F | Slack Poster | Slack | Slack スレッドに投稿表示 |

---

## 2. 現状確認結果（デプロイ直後の例）

以下は **2026-02-08 時点** の確認例。環境に合わせてスタック名・リージョンを読み替える。

### 2.1 スタック・リソース

| 確認項目 | コマンド例 | 結果例 |
|----------|------------|--------|
| Verification Stack 出力 | `aws cloudformation describe-stacks --stack-name SlackAI-Verification-Dev --region ap-northeast-1 --query 'Stacks[0].Outputs'` | SlackEventHandlerUrl, VerificationAgentRuntimeArn が出力される |
| Execution Stack 出力 | `aws cloudformation describe-stacks --stack-name SlackAI-Execution-Dev --region ap-northeast-1 --query 'Stacks[0].Outputs'` | ExecutionAgentRuntimeArn が出力される |
| Slack Event Handler 環境変数 | `aws lambda get-function-configuration --function-name <SlackEventHandler名> --query 'Environment.Variables'` | `VERIFICATION_AGENT_ARN`, `AGENT_INVOCATION_QUEUE_URL` が設定されている |
| SQS キュー | `aws sqs list-queues --queue-name-prefix SlackAI-Verification-Dev` | agent-invocation-request, slack-post-request, agent-invocation-dlq が存在 |

### 2.2 ホワイトリスト（必須）

**重要**: ホワイトリストが空のままでは、Slack Event Handler の認可で **すべて 403** になる（fail-closed）。

```bash
# 件数確認（0 の場合は 1 件以上を追加する必要あり）
aws dynamodb scan --table-name SlackAI-Verification-Dev-whitelist-config --select COUNT --region ap-northeast-1
```

- **0 件**: 全リクエストが認可で拒否。`team_id` / `user_id` / `channel_id` を DynamoDB または Secrets Manager で設定する。
- 設定方法: [quickstart.md ステップ 3: ホワイトリストの設定](../quickstart.md#ステップ-3-ホワイトリストの設定必須)

### 2.3 ログで見る「どこまで進んでいるか」

| 段階 | ロググループ例 | 見るイベント | 意味 |
|------|----------------|-------------|------|
| [A] Slack → Handler | `/aws/lambda/SlackAI-Verification-Dev-SlackEventHandler...` | `event_received`, `signature_verification_success` | Slack からリクエスト受信・署名 OK |
| | | `authorization_failed` / `existence_check_failed` | 認可または存在確認で 403 |
| | | SQS 送信ログ（実装次第） | Handler が SQS にメッセージを送った |
| [B]→[C] SQS → Agent Invoker | `/aws/lambda/SlackAI-Verification-Dev-AgentInvoker...` | `InvokeAgentRuntime` 呼び出し | Verification Agent を呼んでいる |
| | | `agent_invocation_failed` + **424** | Verification Agent が未起動 or 依存失敗 (Failed Dependency) |
| | | 正常時は 200 相当で終了 | Verification Agent が応答した |
| [D] Verification → Execution | AgentCore のログ (`/aws/bedrock-agentcore/...`) | Runtime 内ログ | pipeline 実行・Execution 呼び出し有無 |
| [E]→[F] Slack Poster | `/aws/lambda/SlackAI-Verification-Dev-SlackPoster...` | 起動ログ | slack-post-request キューからメッセージを受信し投稿処理 |

---

## 3. よくある停止ポイントと対処

### 3.1 403 で返る（Slack に何も返らない / エラー）

- **署名検証失敗**: `SLACK_SIGNING_SECRET` が Slack アプリの Signing Secret と一致しているか確認。
- **ホワイトリスト認可失敗**: 上記のとおりホワイトリストが空だと全拒否。使用する `team_id` / `user_id` / `channel_id` を登録する。
- **Existence Check 失敗**: Bot Token のスコープ（`users:read`, `conversations:read` 等）と、実在するチーム・ユーザー・チャンネルか確認。

### 3.2 デプロイスクリプトの「Runtime が ACTIVE にならない」

- **原因**: ステータス取得に **Data Plane** (`aws bedrock-agentcore`) を使っていたが、`get-agent-runtime` は **Control Plane** (`aws bedrock-agentcore-control`) にしかない。また Control Plane の状態値は **READY**（コンソールの Ready と一致）であり、**ACTIVE** ではない。
- **対応**: デプロイスクリプトでは `bedrock-agentcore-control get-agent-runtime --agent-runtime-id <ID>` で ARN から取り出した Runtime ID を渡し、ステータスが **READY** になるまで待つように変更済み。コンソールで Ready になっていれば、次回デプロイから検証で正しく READY と判定される。

### 3.3 Agent Invoker で 424 (Failed Dependency)

- **意味**: InvokeAgentRuntime(Verification Agent) が失敗。Runtime またはその依存リソースが未準備・エラーの可能性。
- **確認**:
  - Verification Agent の AgentCore Runtime が **ACTIVE** になっているか（デプロイ直後は UNKNOWN のまま数分かかることがある）。
  - Runtime の環境変数（`EXECUTION_AGENT_ARN`, DynamoDB テーブル名、Secrets Manager 名など）が正しいか。
  - AgentCore の CloudWatch ログでランタイム内エラーが出ていないか。
- **対処**: 数分待って再試行。それでも 424 の場合は Runtime のログと IAM/ネットワーク設定を確認。

### 3.4 424 が出ずに「何も返ってこない」

- Execution Agent の呼び出し失敗や Bedrock モデル権限の可能性。
- Verification Agent の pipeline がエラーで SQS (slack-post-request) に送っていない可能性。
- AgentCore のログと Slack Poster のログの有無を確認。

### 3.5 Slack Poster まで届いているが Slack に表示されない

- Slack Poster のログで `chat.postMessage` / `files.upload_v2` の成功・失敗を確認。
- Bot Token の `chat:write`, `files:write` 等のスコープと、チャンネルへの参加状況を確認。

---

## 4. クイック確認コマンド一覧

```bash
# リージョン
REGION=ap-northeast-1
STACK=SlackAI-Verification-Dev

# スタック出力（Function URL / Verification Agent ARN）
aws cloudformation describe-stacks --stack-name $STACK --region $REGION --query 'Stacks[0].Outputs'

# ホワイトリスト件数（0 なら要設定）
aws dynamodb scan --table-name ${STACK}-whitelist-config --region $REGION --select COUNT

# 直近の Slack Event Handler ログ（5 件）
aws logs filter-log-events --log-group-name /aws/lambda/${STACK}-SlackEventHandler898FE80E-eZpefJLA6NWi \
  --region $REGION --limit 5

# 直近の Agent Invoker ログ（5 件）
aws logs filter-log-events --log-group-name /aws/lambda/${STACK}-AgentInvokerHandler544912-08wKPdINAP3K \
  --region $REGION --limit 5

# 直近の Slack Poster ログ（5 件）
aws logs filter-log-events --log-group-name /aws/lambda/${STACK}-SlackPosterHandler2B7CB75-2FgtJnyEBcDi \
  --region $REGION --limit 5
```

※ Lambda の論理 ID は CDK のハッシュで末尾が変わるため、`aws lambda list-functions --query "Functions[?starts_with(FunctionName, '${STACK}')].FunctionName"` で実際の関数名を確認してからロググループを指定する。

---

## 5. まとめ：どこまで正しく進んでいるか

- **Slack → Slack Event Handler**: スタックと Lambda が存在し、ログに `event_received` / `signature_verification_success` が出ていればここまで正常。
- **Slack Event Handler → SQS → Agent Invoker**: Agent Invoker が起動し、ログに SQS 消費と `InvokeAgentRuntime` 呼び出しが出ていれば、Handler から Invocation まで到達している。
- **InvokeAgentRuntime(Verification Agent)**: 200 で返っていれば Verification Agent まで正常。**424** の場合は Runtime または依存の不備。
- **Verification Agent → Execution Agent / SQS**: AgentCore のログと、Slack Poster Lambda の起動有無で判断。
- **Slack Poster → Slack**: Slack Poster のログで投稿 API 成功していれば、処理は最後まで完了している。

ホワイトリスト未設定の場合は認可で 403。AgentCore が UNKNOWN/未起動の場合は 424 が出るため、まずホワイトリスト設定と Runtime の状態確認から行うとよい。
